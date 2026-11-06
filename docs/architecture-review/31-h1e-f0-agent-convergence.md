# 31 — H1e-F0: Agent Convergence Assessment (diagnóstico)

> **Somente diagnóstico + proposta de correções mínimas.** Nenhum código operacional alterado, nenhuma
> execução de LLM nova, nenhuma mudança na KB. Fundamentado nas transcrições/eventos RPC **reais** dos 5
> turnos cobrados do H1d-F4 (B, B2, B3, C, C2) + o turno A2 (PASS) como linha de base.
>
> **Pergunta central:** por que o agente, com conhecimento correto e ferramentas funcionais, não concluiu
> Race/TOCTOU (B) nem o Browser Visual (C)? **Resposta curta:** não é o modelo isoladamente — há **duas
> falhas de contrato/adaptador comprovadas** + **ausência de disciplina de execução/encerramento e de
> reserva de orçamento**. O backend funciona (A PASS; testes determinísticos verdes).

## 1. Reconstrução por turno (dos eventos reais)

| Turno | tools (read/bash/cap/invoke) | 1º experimento | Veredito | Record final | Observação-chave |
|------|------|------|------|------|------|
| **A2** (PASS) | 13/1/1/8 =22 | `authorization.run` @ invoke #8 | ✅ | ✅ 1788c | caminho limpo; 1 erro recuperado |
| **B** (low) | 7/4/1/1 =12 | **NUNCA** | ✗ | ✗ | **settle prematuro após 1 invoke** (só `capabilities.list`) |
| **B2** (med) | 15/5/2/6 =26 | **NUNCA** | ✗ | ✗ | criou sessões; estourou teto antes do experimento |
| **B3** (med,40) | 15/3/1/9 =27 | **NUNCA** | ✗ | preâmbulo 272c (não é record) | `race.run` nunca chamado; 4 rejeições |
| **C** (med) | 9/2/2/15 =26 | n/a (visual) | n/a | ✗ | inspeção rica; sem conclusão (teto) |
| **C2** (med,40) | 10/5/2/26 =41 | n/a (visual) | n/a | ✗ | **exploração redundante** (navigate×5, snapshot×4, screenshot×4); sem conclusão (teto) |

**Sequência de invokes (B3):** `✓capabilities.list ✗sessions.create(duplicate-investigation) ✗sessions.create(duplicate-investigation) ✓sessions.create ✓sessions.create ✗sessions.create(unknown kind: observer) ✓sessions.create ✗http.inspect(capability-not-allowed) ✓browser.probe` — **`race.run` ausente**.

**`race.run`/`concurrent.run` foram chamados 0× em TODOS os 3 turnos B.** O Race Validator nunca foi exercido.

**Correção de honestidade (overcount anterior):** o `browser.fill` foi chamado **1× em C e 1× em C2** (recusado uma vez cada), **não 70+** — as "70+" eram **ecos da string de erro** em múltiplos eventos. Não houve spam de `fill`.

## 2. Análise de não convergência (falhas distinguidas por tipo)

### Causas COMPROVADAS

**C-1 (CONTRATO/ADAPTADOR — TOCTOU no `ensureOpen`).** `adapters/pi/extension.mjs::ensureOpen` faz
`if (opened.has(id)) return` → `await resolveContext(...)` → `bridge.openInvestigation()` → `opened.add(id)`.
O `add` ocorre **depois** do `await`. O agente disparou `sessions.create` **em paralelo** (operationIds
`create-a`/`create-b`/`create-observer` quase simultâneos); todos passaram o `has`, e as chamadas
seguintes a `openInvestigation` lançaram **`duplicate-investigation: investigation already open: INV-B1`**
(2× em B3). Ou seja: **uma race condition no próprio adaptador sabotou a investigação de race condition.**
O erro é enganoso (num `sessions.create`) e **não orienta recuperação**.

**C-2 (CONTRATO/FEEDBACK — conceito "observer" sem ponte).** `race.run` exige `observerSessionId`. O
agente **inferiu corretamente** que precisava de uma sessão observadora e chamou
`sessions.create {kind:"observer"}` → **`unknown identity kind: observer`**, erro que **não lista os kinds
válidos** (ex.: `owner`/`cross-user`/`noauth`) nem informa que "qualquer sessão existente serve como
observerSessionId". O agente gastou 3 chamadas tateando (`observer`→`observer`→`noauth`) sem orientação.

**C-3 (EXECUÇÃO/INSTRUÇÃO — sem "experimento essencial primeiro").** Em B o `race.run` nunca foi
tentado; o orçamento foi consumido em **leitura de KB (7–15 reads/turno)** + setup de sessões. Em B(low)
o agente deu *settle* após **1 único invoke**. Não há disciplina que force "consultou KB + tem hipótese →
execute o experimento central AGORA".

**C-4 (EXECUÇÃO/ORÇAMENTO — sem critério de conclusão nem reserva).** Em C/C2 o agente inspecionou bem,
mas **ciclou exploração equivalente** (C2: navigate×5, snapshot×4, screenshot×4) e bateu no teto **sem
emitir o Investigation Record**. Nada reserva as últimas chamadas para "concluir, mesmo que inconclusivo".

**C-5 (INSTRUÇÃO — leitura excessiva da KB).** O intake pediu ler SKILL+pattern-index+skills; combinado
a orçamento finito, isso **afama o experimento**. 7–15 reads antes de agir.

### Causas MENORES (contrato)
- `browser.navigate` sem sessão → **`session requires sessionId`** (terso; o agente aprendeu "na marra").
- `browser.screenshot` → **`screenshot requires a dir (opts.dir or ctx.evidenceDir)`** (esse orienta).

### NÃO são as causas (descartadas com evidência)
- **Tooling/backend:** A2 PASS ponta-a-ponta; `race.run → violacao-observada` e browser funcionam
  deterministicamente (docs 26/29). O caminho existe.
- **Auth/cota:** o modelo respondeu nos 6 turnos.
- **Instrumentação:** o driver foi validado por replay; os raw estão completos (não houve descarte).
- **Meu teto de 25 tool calls (isolado):** elevado a 40 em B3/C2 — mesmo assim B não alcançou `race.run` e
  C não concluiu ⇒ as causas são C-1..C-5, não o teto por si só (embora o orçamento agrave).

### Hipóteses NÃO verificadas
- Se corrigir C-1+C-2 e adicionar C-3/C-4 basta para o `gpt-5.6-sol` concluir B/C (exige re-run cobrado).
- Se o **schema do `race.run`** (`experiment.operations[]` + `observerSessionId` + invariante/oráculo) é,
  por si, complexo demais para o agente construir mesmo com dica (exige re-run ou simplificação do schema).
- Se um modelo mais capaz (`gpt-6.1`/opus) converge sem as correções (exige re-run cobrado).

## 3. Proposta de correções mínimas (reusa dispatch brief / contrato de erro do bridge / hooks)

| # | Correção | Mecanismo existente | Tipo | Esforço |
|---|----------|---------------------|------|---------|
| **P1** | **Corrigir a TOCTOU do `ensureOpen`** (memoizar a promessa de abertura por `investigationId`, ou marcar "pending" antes do `await`) | adaptador Pi (`extension.mjs`) | código (~3–6 linhas) | mínimo |
| **P2** | **Erros estruturados recuperáveis** `{code, recoverable, hint}`: `sessions.create` lista kinds válidos; `race.run` informa params exigidos + "qualquer sessão serve de observerSessionId" | contrato de erro do bridge | código (localizado) | pequeno |
| **P3** | **Disciplina de execução no dispatch brief:** consulta-KB (limitada) → hipótese → **experimento essencial PRIMEIRO** → registro; nomear a op-experimento por classe como *dica* (authz→`authorization.run`, race→`race.run`, visual→`snapshot/console/network` e concluir) **sem** dar a sequência de operações | `references/flows-agents.md` (brief; mecanismo atual) | Markdown | pequeno |
| **P4** | **Reserva de orçamento + registro final obrigatório:** reservar o último passo para o Investigation Record **mesmo inconclusivo** | brief + hook de conclusão | Markdown/hook | pequeno |
| **P5** | **Stop Rule p/ rejeições repetidas:** após 2 rejeições idênticas `(op,erro)` → mudar de abordagem ou declarar sub-objetivo bloqueado; não repetir equivalente | brief (+ opcional contador no adaptador) | Markdown | mínimo |
| **P6** | **Priorizar o experimento essencial:** teto de leitura/inspeção exploratória; agir após consulta mínima | brief | Markdown | mínimo |

**Não** criar scheduler, framework multiagente, motor de workflow ou novos agentes. P1/P2 são código;
P3–P6 são instrução/hook — todos pequenos e localizados. **Nada implementado nesta etapa (F0).**

## 4. Métricas (definidas + linha de base observada)

| Indicador | Definição | Linha de base (6 turnos) |
|-----------|-----------|--------------------------|
| Task completion rate | investigação completa com Record | A 1/1; **B 0/3; C 0/2** |
| Tool-call success rate (invokes) | ok/(ok+err) | A2 88% · B3 56% · C2 85% · C 73% |
| Rejected calls / investigação | nº de invokes `ok:false` | A2 1 · B2 0 · B3 4 · C 4 · C2 4 |
| Repetição de erros equivalentes | mesmo `(op,erro)` ≥2 | **B3: `sessions.create|duplicate-investigation` ×2; `unknown kind: observer` ×2** |
| Tempo até 1º experimento | 1ª `authorization.run`/`race.run` | A2 invoke #8 (~alcançado) · **B/C: NUNCA** |
| Tempo até veredito | 1ª classificação do validador | **só A2** |
| % investigações com Record | — | **1/6 turnos (só A2)** |
| Chamadas desnecessárias | leituras/inspeção redundantes | B 7–15 reads; **C2 ~8–10 inspeções redundantes** |
| Tokens/custo | quando disponível | **indisponível (0; `openai-codex` OAuth não expõe)** |

## 5. Entregáveis do diagnóstico

### 5a. Causas comprovadas
C-1 (TOCTOU `ensureOpen`), C-2 (observer/kind sem ponte + erro não-orientador), C-3 (sem experimento-
primeiro → `race.run` 0×), C-4 (sem critério de conclusão/reserva → C sem Record), C-5 (leitura excessiva).

### 5b. Hipóteses não verificadas
Suficiência das correções para o `gpt-5.6-sol`; complexidade intrínseca do schema `race.run`; efeito de
modelo mais capaz. (Todas exigem validação.)

### 5c. Correções mínimas recomendadas
P1–P6 (§3). **Prioridade de maior impacto / menor esforço:** **P1 (TOCTOU) + P3 (experimento-primeiro) +
P4 (registro obrigatório)**, depois P2/P5/P6.

### 5d. Critérios de aceite (pós-correção)
- `race.run` executado e veredito do Race Validator interpretado → **B PASS com Investigation Record**.
- C emite Investigation Record "sem vulnerabilidade" (sem achado inventado) → **C PASS**.
- **0** `duplicate-investigation` sob chamadas paralelas; **0** rejeições idênticas repetidas.
- **100%** das investigações terminam com Record (mesmo inconclusivo).
- Tempo até 1º experimento ≤ ~60% do orçamento de chamadas; tool-call success rate ≥ 85%.

### 5e. Experimentos de validação SEM LLM (determinísticos)
- **V1:** teste de concorrência do `ensureOpen` — disparar N `sessions.create` em paralelo e exigir **0
  `duplicate-investigation`** após P1. (Prova a correção da TOCTOU sem modelo.)
- **V2:** confirmar o **shape canônico mínimo do `race.run`** pela interface de tools (já verde em
  `test-investigation`), para P3/P2 referenciarem.
- **V3:** checagem estática — adições ao dispatch brief preservam seções obrigatórias + **Validador V1
  127/127**; erros estruturados (P2) não vazam segredos (regex de redação).

### 5f. Experimentos que EXIGEM nova execução cobrada (requerem autorização)
- **E1:** re-run de **B** e **C** com P1–P4 aplicadas; medir completion, tempo-até-experimento, Record%.
- **E2 (opcional):** comparação de modelo (`gpt-5.6-sol` × `gpt-6.1`/opus) no mesmo cenário.

## 6. Proposta pequena para aprovação (impacto mensurável)

Implementar **P1 (fix TOCTOU `ensureOpen`) + P3 (dispatch brief: experimento-primeiro, com dica da op por
classe) + P4 (registro final obrigatório/reserva)** — o menor conjunto que ataca as causas comprovadas —
validar **sem LLM** com V1/V2/V3, e **somente então**, mediante nova autorização, um único re-run cobrado
de B e C (E1) para confirmar os critérios de aceite (§5d). P2/P5/P6 em seguida se necessário.

**Alvo mensurável:** B 0/3→PASS e C 0/2→PASS; `duplicate-investigation` 2→0; investigações com Record
1/6→≥ esperado. **Nada implementado em F0.** Preservados: 127 corpos, `agents/` (17), `policies/` (3),
dependências. Aguardo aprovação; não avanço automaticamente.
