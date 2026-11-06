# 32 — H1e-F1: Agent Convergence Fixes (P1–P4)

> Correções mínimas das 4 causas comprovadas no diagnóstico [31]. **Sem turnos de LLM cobrados, sem
> alterar os 127 corpos, sem dependências novas, sem scheduler/framework/agentes.** P5/P6 **não**
> implementadas (conforme restrição). Tudo validado por testes determinísticos + regressão + Validador
> V1 127/127.

## 1. O que mudou (menor conjunto possível)

| # | Causa (doc 31) | Arquivo | Natureza | Linhas |
|---|----------------|---------|----------|--------|
| **P1** | TOCTOU no `ensureOpen` | `tools/web-runtime/adapters/pi/extension.mjs` | código | +~15 |
| **P2** | `observerSessionId`/kind sem ponte; erro não-orientador | `tools/web-runtime/identity-registry.mjs` + `bridge.mjs` | código | +~6 |
| **P3** | sem "experimento essencial primeiro" | `references/flows-agents.md` | brief (Markdown) | +11 |
| **P4** | sem encerramento obrigatório | `references/flows-agents.md` | brief (Markdown) | ~reescrita de 1 bloco |

### P1 — single-flight no `ensureOpen`
**Antes:** `opened` era um `Set`; o fluxo fazia `opened.has(id)` → `await resolveContext(...)` →
`openInvestigation()` → `opened.add(id)`. O `add` vinha **depois** do `await`: N `sessions.create`
paralelas passavam o `has`, e a 2ª+ `openInvestigation` lançava `duplicate-investigation`.
**Depois:** `opened` (sucessos) + `opening` (Map de promessas em voo). Chamadas concorrentes para o mesmo
`investigationId` **aguardam a MESMA inicialização**; `openInvestigation` roda **no máximo uma vez** por
id. Falha não registra `opened` e libera o slot `opening` → **retry limpo** sem estado meio-aberto.
Isolamento por chave de `investigationId`.

### P2 — contrato `observerSessionId` + feedback estruturado e recuperável
- `identity-registry.mjs`: `unknown identity kind: <k>` → agora **lista os kinds válidos**
  `(valid kinds: owner, cross-user, noauth)`. Recuperação sem tentativa-e-erro.
- `bridge.mjs::race.run`: **guarda de pré-requisitos** que falha rápido com código
  `race-prerequisites` e mensagem autoexplicativa — deixa claro que **`observerSessionId` é uma sessão
  EXISTENTE autorizada nesta investigação, NÃO um novo identity kind**. Rótulos de `_ownSession`
  esclarecidos. Nenhum `kind:"observer"` foi criado (desnecessário).
- **Diferenciação de erros** (códigos distintos, já no contrato): `bad-params` (sessão ausente) ×
  `session-not-in-investigation` (sessão inválida) × `capability-not-allowed` (capacidade) ×
  `state-change-unauthorized` (autorização de mudança de estado). Nenhum identificador de outra
  investigação é exposto.

### P3 — experimento essencial primeiro (dispatch brief)
Nova seção **"Execution discipline"**: consultar KB (citado) → **uma** hipótese verificável → identificar
a **única operação essencial** (IDOR/BOLA→`authorization.run`; race→`race.run`; visual→leitura do Browser
Runtime) → validar pré-condições/autorização → **executá-la antes de mais exploração**. Explicitamente
**uma PRIORIDADE, não uma sequência rígida**; exploração permitida quando a operação essencial depende
dela. Não fornece sequência de ferramentas.

### P4 — encerramento obrigatório (dispatch brief)
O bloco "Investigation record" passou de **"ONLY when a capability ran"** (tom opcional) para
**"MANDATORY for every capability-backed investigation"**, inclusive quando a hipótese não foi
confirmada, o experimento falhou, uma operação foi bloqueada, o resultado foi inconclusivo **ou o
orçamento/turno terminou**. Registrar: evidências, operações executadas, limitações, pendências, e a
**classificação do validador VERBATIM** (ou "none — no validator ran"). Reforço explícito:
**nunca** promover anômalo/inconclusivo a violação; **nunca** converter ausência de evidência em veredito
"clean/conforme". Classificadores do Web Runtime preservados.

## 2. Testes (os 10 tópicos exigidos)

Suíte nova determinística `tools/web-runtime/test-convergence.mjs` — **browser-free e LLM-free**:

| Tópico exigido | Teste | Resultado |
|----------------|-------|-----------|
| 1. `ensureOpen` simultâneo | P1.1 (5 concorrentes → 1 open) | ok |
| 2. Inicialização única | P1.2 (memoização) | ok |
| 3. Falha e retry da init | P1.3 (sem contexto→retry) + P1.4 (init que lança→retry) | ok |
| 4. Isolamento entre investigações | P1.5 (2 ids → 2 opens) | ok |
| (regressão original) | P1.0 **reproduz a falha** no `ensureOpen` antigo (openCalls>1 + duplicate) | ok |
| 5. Contrato `observerSessionId` | P2.1 (prerequisites autoexplicativo) | ok |
| 6. Erros estruturados e recuperação | P2.0 (kinds válidos) + P2.2 (códigos diferenciados) | ok |
| 7. Integridade do Investigation Record | P4.0 + P3/P4 (cláusulas no brief) | ok |
| 8. Sem promoção indevida de classificações | P4.0 (verbatim; ausência ≠ veredito) | ok |
| 9. Cancelamento e cleanup | `test-bridge` B8/B13 + `test-pi-adapter` P6 (inalterados) | ok |
| 10. Compatibilidade com o dispatcher | P3/P4 (estrutura MANDATORY preservada) | ok |

**Regressão completa (foreground, browser disponível):**
- `test-convergence` **11/11** · `test-bridge` **15/15** (B12 classificadores **passou** → `race.run`
  válido intacto) · `test-investigation` **13/13** (INV-B `T10→race→violacao-observada`; INV-C
  `T2→browser→sem-achado`) · `test-pi-adapter` **7/7** · `test-pi-entry` PASS.
- **Validador V1: `overall OK`, bodies 127/127, T=112/112 B=15/15.**
- `agents/`=17, `policies/`=3, deps=`playwright-core 1.64.1` inalterados; 127 corpos intactos.

## 3. Comparação antes × depois

| Indicador | Antes (doc 31) | Depois (determinístico) |
|-----------|----------------|-------------------------|
| `openInvestigation` sob N `sessions.create` paralelas | N chamadas → `duplicate-investigation` (2× em B3) | **1 chamada**; 0 `duplicate-investigation` (P1.1) |
| Erro de kind desconhecido | `unknown identity kind: observer` (sem guia) | lista os kinds válidos (P2.0) |
| `race.run` sem pré-requisitos | falha profunda/obscura | `race-prerequisites` autoexplicativo; `observerSessionId` esclarecido (P2.1) |
| Encerramento da investigação | "Investigation record" opcional | **obrigatório** mesmo em falha/bloqueio/inconclusivo/orçamento (brief) |
| Disciplina de execução | ausente | experimento-essencial-primeiro no brief (P3) |

> **Importante (honestidade):** o impacto na **convergência agêntica** (B 0/3→PASS, C 0/2→PASS) é uma
> **hipótese até a revalidação cobrada** (§6). Esta rodada prova as correções **deterministicamente**;
> não roda LLM.

## 4. Contratos corrigidos (documentação)

- **`ensureOpen(investigationId)`** — idempotente e single-flight: a 1ª chamada por id executa a
  inicialização; concorrentes aguardam a mesma; sucesso é lembrado; falha é limpa e re-tentável.
- **`race.run`** — exige `experiment.operations` (array não-vazio; cada op com `sessionId` existente +
  `url`/`method`); `observerSessionId` é **opcional** e, quando dado, é uma **sessão existente** desta
  investigação (não um identity kind). Pré-requisito ausente → `race-prerequisites`.
- **`sessions.create` / identidades** — kinds válidos: `owner | cross-user | noauth`; kind inválido
  retorna a lista. `observerSessionId` NÃO é um kind.
- **Investigation Record** — obrigatório em toda investigação com capacidade; classificação do validador
  verbatim; ausência de evidência nunca vira conformidade.

## 5. Limitações restantes

- **Efeito na autonomia não comprovado sem LLM:** as correções atacam as causas, mas que B/C passem a
  convergir só se confirma na revalidação cobrada (§6).
- **P2 minimalista:** melhorei **mensagens** e adicionei o código `race-prerequisites`; **não** adicionei
  um campo estruturado `{recoverable, hint}` no envelope de erro (seria mudança de contrato maior).
  Fica como opção futura.
- **P5/P6 não implementadas** (conforme restrição): stop-rule para rejeições repetidas e teto de leitura
  exploratória continuam como propostas de [31].
- **Schema do `race.run`:** não foi simplificado; a complexidade de montar `operations` permanece um
  fator não verificado (hipótese do doc 31 §5b) — agora com erro orientador, mas ainda a cargo do agente.

## 6. Plano para reexecutar os Cenários B e C com LLM real (requer nova autorização cobrada)

- **Preparação (sem custo):** usar o brief corrigido (P3/P4) nos intakes B/C; manter contextos do
  operador e fixtures sintéticas; driver instrumentado `rpc-drive3` (persistência incremental + redação).
- **Orçamento proposto:** **global = 2 turnos cobrados** (B e C), +1 de reserva; por-turno 240 s / ≤40
  tool calls; `thinking medium`. Não repetir por falha de instrumentação.
- **B (race):** esperado — agente alcança `race.run` (sessões existentes; observer opcional),
  interpreta a classificação do validador e **emite Investigation Record**.
- **C (visual):** esperado — agente conclui com **Investigation Record `sem-achado`** (encerramento
  obrigatório), sem achado inventado.
- **Critérios de aceite** (doc 31 §5d): `race.run` executado + veredito interpretado (B PASS); Record
  emitido em C (PASS); 0 `duplicate-investigation`; 100% das investigações com Record.

## 7. Conclusão

Correções mínimas **P1–P4 implementadas e validadas deterministicamente**; regressão verde; Validador
127/127; escopo preservado. **Nenhum turno de LLM foi executado.** Conforme a autorização, **solicito
aprovação específica para a revalidação agêntica cobrada** (§6 — reexecução de B e C com modelo real).
**Não avanço automaticamente.**
