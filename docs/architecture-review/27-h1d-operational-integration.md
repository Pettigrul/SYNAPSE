# 27 — H1d-F0: Operational Integration Assessment

> **Round de avaliação (engenharia reversa) — SEM implementação.** Objetivo: determinar a **menor**
> mudança arquitetural para que o HackBot use, em workflows reais, as capacidades já implementadas em
> `tools/web-runtime/`. Não construir outro harness — **conectar o que existe**. Baseado em inspeção
> do **código real** (SKILL.md, `references/flows-*`, `skills/`, `agents/`, `policies/`, `adapters/`,
> `tools/web-runtime/`), não na documentação. Nada foi alterado nesta etapa.

---

## Achado central (uma frase)

Os seis componentes do Web Runtime estão **testados e corretos, porém 100% desconectados** do fluxo
operacional: **nenhuma** entrada no File Map do `SKILL.md`, **nenhuma** referência em flow/doctrine/
brief, **nenhum** entrypoint CLI/`bin`, **nenhum** registro de ferramenta. São uma biblioteca ESM
(`capability.*`) consumida **apenas pelos próprios testes**. O dispatcher entrega ferramentas aos
agentes efêmeros **só via dispatch brief em texto** — e hoje não existe superfície que um brief possa
invocar. **A menor mudança é uma ponte de invocação (um entrypoint), não um novo framework.**

---

## 1. Arquitetura operacional atual (Etapa 1 — engenharia reversa)

Respostas às 10 perguntas, verificadas no código:

| # | Pergunta | Como funciona HOJE (evidência) | Usa o Web Runtime? |
|---|----------|-------------------------------|:---:|
| 1 | **Inicialização do HackBot** | Skill carregada pelo runtime via adapter: Claude Code lê `skills/<cat>/SKILL.md` em `~/.claude/skills/`; Pi via `pi install`/`~/.pi/agent/skills/`; Antigravity via `AGENTS.md`. `SKILL.md` raiz é o dispatcher (`adapters/*.md`). | ❌ |
| 2 | **Recebe/classifica tarefas** | `SKILL.md ## Flow Dispatch`: tabela `trigger → Flow → Load`. Em Claude Code há reforço pelo hook `UserPromptSubmit` (`.claude/hooks/consult-kb.mjs`); nos demais a regra "consult before concluding" se sustenta sozinha. | ❌ |
| 3 | **Seleciona skills e técnicas T[N]/B[N]** | `references/pattern-index.md` (keyword → KB file) → abre só `skills/<cat>/SKILL.md` → lê a técnica. Ex.: IDOR → `web-testing` **T5**; race/TOCTOU → `code-review` **T10**; SSRF → **T6**; auth-bypass → **T8**. | ❌ |
| 4 | **Cria agentes efêmeros** | `references/flows-agents.md` (Flows 9/12/12b/12c/20). Dispatch paralelo quando o runtime suporta; senão **fases sequenciais** com o brief escrito em `4-Analysis/briefs/`. | ❌ |
| 5 | **Agentes recebem acesso às ferramentas** | **Exclusivamente pelo brief** (`## Dispatch brief template`). Subagentes **não herdam contexto nem ferramentas**; "ferramentas" = primitivas **Tier-0** nativas + one-offs **Tier-1** (Python/Go/Node) forjados sob demanda (`native-tooling-doctrine.md`). | ❌ |
| 6 | **Flows 9/12** | **Flow 9** = recon/probe/spawn (surfaces × classes → briefs → dispatch → auditoria de retorno). **Flow 12** = feature-intel/plan; **12b** = JS/sink-sweep (Node `acorn` como escalonamento Tier-1); **12c** = reachability. | ❌ |
| 7 | **Aplicação de políticas** | `policies/` são **imutáveis** e **coladas verbatim em todo brief**: `authorization-gate.md` (Rule 0, Classe R/A, consentimento por-ação + Risk Card), `verification-contract.md`, `native-tooling-doctrine.md`. Contexto nunca-descartável (`## Context Priority`). | parcial¹ |
| 8 | **Evidências/resultados ao dispatcher** | Subagente retorna blocos `## Verified Claims` / `## Coverage row` / `## Task progress` / `## Escalation notes`. Coordenador **re-verifica cada claim nesta sessão** antes de propagar (`**Coordinator re-verified:**`) e grava em `ccLeads.md`/`ccGadgets.md`/`ccSurface.md`/`4-Analysis/`. | ❌ |
| 9 | **Relatórios** | Flows 10/10b + `reports/` (`agent-writer.md`, `agent-triager.md`, `template.md`, `impact-library.md`, `precedent-library/`). Barra impact-first; numeração paid-dir. | ❌ |
| 10 | **Pi vs Claude Code** | **Claude Code:** hook `.claude/` força consulta à KB + skill nativa. **Pi:** mesmo formato de skill, **sem hook** (regra textual), sem dispatch paralelo → fases sequenciais. **Antigravity:** só via `AGENTS.md`, **carga e2e PENDENTE** (`adapters/antigravity.md`). O Web Runtime (Node) foi validado **no Claude Code**; Pi/Antigravity não exercitaram o runtime. | ❌ |

¹ As políticas que o Web Runtime **reimplementa internamente** (Scope Guard/Rule 0, Rule 6, state-change-gate) são equivalentes às `policies/`, mas **não há um ponto único** que force a política do dispatcher sobre uma execução do runtime — hoje não há execução para forçar.

**Conclusão da Etapa 1:** o caminho operacional inteiro (init → classify → select T[N] → brief → agente → evidência → relatório) **nunca toca `tools/web-runtime/`**. A doutrina reconhece **Node como Tier-1**, mas para one-offs `acorn`/`jsdom` forjados — não para um serviço de capacidade persistente.

---

## 2. Mapa das APIs já existentes (Etapa 2 — inventário)

Superfície pública real: `capability.mjs` exporta `capability` · `http` · `evidence` · `browser` ·
`sessions` · `authz` · `concurrent` · `race`. **Zero dependências novas** (`playwright-core 1.64.1`
opcional). **Sem `bin`/CLI/`process.argv`** — só `import`.

| Componente | API pública | Entrada → Saída | Estado/ciclo de vida | Políticas/limites | Evidência produzida | Testado isolado | **Integrado ao fluxo** |
|-----------|-------------|-----------------|----------------------|-------------------|---------------------|:---:|:---:|
| **HTTP Inspection** (F1) | `http.open/inspect/headers`, `evidence.record` | `{url,method,...}`+`ctx{scope}` → `{status,headers,staticHtml,...}` | sem estado (stateless) | Rule 0 pré+pós-redirect, SSRF guard, Rule 6 redaction, maxBytes/Redirects/Requests/timeout | artefato sanitizado + sha256 | ✅ (19) | ❌ |
| **Browser Runtime** (F2) | `browser.open/snapshot/screenshot/click/fill/network/...` | handle de sessão única | 1 browser+1 ctx+1 page; `close` | Scope Guard via `route.fetch({maxRedirects:0})`; `serviceWorkers:block`; TLS enforced | DOM/screenshot/network | ✅ (16+11) | ❌ |
| **Multi-Session** (H1b-F1) | `sessions.manager()` → `create/get/list/status/bindIdentity/request/close/closeAll` | `{scope,kind,label}` → `sessionId` | N contextos isolados sob 1 browser; `maxSessions` | isolamento por sessão; **credenciais/tokens nunca retornados**; `AbortSignal` | metadata por sessão (sem segredos) | ✅ (15) | ❌ |
| **Authorization Matrix** (H1b-F2) | `authz.resources()`, `authz.matrix({manager,resources})` → `run/classify/...` | casos `{expected(+origin),observed,resource}` → classificação | sequencial; registry de recursos | expectativa com **ORIGIN**; nunca infere que users não compartilham; state-change exige `authorizedStateChange`+fixture | ids de correlação, estrutura **só-chaves**, ownership como **boolean** | ✅ (18) | ❌ |
| **Concurrent Executor** (H1c-F1) | `concurrent.executor({manager})` → `prepare/run/cancel/status` | ops `{sessionId,method,url,body,policy,limits}` → resultados sanitizados | barreira + semáforo (`maxConcurrency=2`) | Rule 0 no prepare; **sem corpos nos resultados**; timeouts op/global; cancel | status/latência/requestId/timings (sem corpos) | ✅ (18) | ❌ |
| **Race & TOCTOU Validator** (H1c-F2) | `race.validator({manager,executor})` → `run(experiment)` | experimento declarado → `{classification,attempts,summary}` | ciclo de 12 passos; tentativas sequenciais; reset verificável | **regra+fonte obrigatórias** (não inventa); violação só por estado autoritativo; contaminação para | estado inicial/final normalizado, **observed vs derived**, contagens | ✅ (20) | ❌ |

**Compatibilidade entre módulos:** alta e já comprovada — `authz`/`concurrent`/`race` **compõem** sobre
`sessions.manager()`; `race` compõe sobre `concurrent`. O acoplamento é por injeção de dependência
(`{manager}`, `{manager,executor}`). **Disponibilidade real para os agentes do HackBot: nenhuma** —
não há superfície invocável. **Capacidade testada isoladamente ≠ integrada:** todas as seis estão na
coluna "testado isolado"; **nenhuma** na coluna "integrado ao fluxo".

---

## 3. Lacunas reais de integração (Etapa 3 — gap analysis)

Ordenadas da mais bloqueante à menor. Cada uma indica o **menor** fechamento.

| # | Lacuna | Evidência | Menor fechamento |
|---|--------|-----------|------------------|
| **G1** | **Sem superfície de invocação.** O runtime só tem API ESM; um brief/agente não tem como chamá-la. | `package.json` sem `bin`; sem `process.argv`; só `import` nos testes. | **Um entrypoint Node fino** (CLI stdin/arg→stdout JSON) sobre `capability.*`, **sem nova lógica**. |
| **G2** | **Dispatcher não conhece o runtime.** | `SKILL.md ## File Map` não lista `tools/web-runtime/`; nenhum flow/doctrine o cita. | **Notas pontuais**: 1 linha no File Map, roteamento em `native-tooling-doctrine.md` (Tier-1 Node → preferir a capability a forjar script ad-hoc para T5/T10), e uma seção no brief template. |
| **G3** | **Técnicas não roteiam para o runtime.** T5/T10/T6/T8 hoje forjam PowerShell/Python ad-hoc. | `code-review` T10 "test with concurrent requests (PowerShell jobs)"; `web-testing` T5 native. | Correlação **T5→authz**, **T10→race/concurrent**, **T6→scope/http**, **T8→sessions** no brief/doctrine (**sem tocar os 127 corpos**). |
| **G4** | **Gate de autorização não cobre execuções do runtime.** O gate vive no brief; o runtime tem gates próprios, mas não ligados ao consentimento por-ação do usuário. | `authorization-gate.md` (Classe A, por-ação); runtime state-change-gate interno. | O entrypoint **exige um token de autorização** que o coordenador só passa após consentimento por-ação (Risk Card); Classe A nunca auto-autorizada. |
| **G5** | **Sem contrato que leve o resultado estruturado de volta.** | Retorno do agente é texto (`## Verified Claims`); classificações do runtime são JSON. | **Contrato de investigação** (Etapa 4) que o agente cola no retorno e o coordenador re-verifica → `ccLeads`/`ccGadgets`. |
| **G6** | **Classificação poderia ser inferida pelo LLM.** | Risco de o agente "concluir" fora do validador. | A classificação final **vem do validador** (`authz.classify`/`race.run`), **nunca** do LLM — o contrato carrega o campo como dado produzido pela capability. |
| **G7** | **Relatório não consome evidência de experimento.** | `reports/template.md` não tem campos de experimento/reset. | **Só se comprovada lacuna** (H1d-F3): mapear evidência do runtime para os campos existentes; provavelmente o pipeline atual já basta. |
| **G8** | **Pi/Antigravity não exercitaram o runtime; API de Extension do Pi não documentada no repo.** | `adapters/pi-agent.md` documenta **carga de skill** (`pi install`), **não** registro de ferramenta executável; Antigravity e2e PENDENTE. | **Priorizar o entrypoint runtime-agnóstico** (funciona nos três via Tier-1 Node). Um wrapper Extension nativo do Pi depende de **confirmar a API do Pi** — item de pesquisa de H1d-F1, não dedutível do repo. |

**Não-lacunas (já suficientes — não construir):** scheduler, framework multiagente, novo gerenciador de
ferramentas, fila/worker. O dispatch brief + fases sequenciais + a composição por DI já cobrem a
orquestração. A autorização, a verificação e as evidências já têm mecanismo — falta **conectá-los a
uma execução**, que hoje não existe.

---

## 4. Arquitetura mínima proposta

Uma peça nova, aditiva, **sem dependências** e **sem lógica de negócio nova**:

**Capability Bridge** = um entrypoint Node (`tools/web-runtime/bridge.mjs`) que:
1. Lê uma **Requisição de Investigação** (JSON por stdin ou arquivo em `4-Analysis/briefs/`).
2. Valida `scope` + exige **token de autorização** para qualquer operação Classe A (state-changing);
   recusa sem ele (espelha `authorization-gate.md`).
3. Mapeia `capability` + campos do contrato para a **API `capability.*` já existente** (nenhuma
   reimplementação): `authz`→Authorization Matrix, `race`→Race Validator, `concurrent`→Executor,
   `http`→HTTP Inspection, `sessions`→Multi-Session.
4. Deixa a **classificação ser produzida pelo validador** e a devolve como **Resultado de Investigação**
   (JSON sanitizado, único), gravando evidência via `evidence.record`.

```
dispatcher (SKILL.md Flow 9)
   │  escreve Requisição de Investigação (brief) + consentimento por-ação (token)
   ▼
agente efêmero  ──(Tier-1 Node, 1 linha de escalonamento)──►  bridge.mjs
   ▲                                                              │ import capability.*
   │  cola Resultado de Investigação no ## Verified Claims        ▼
   │                                              sessions/authz/concurrent/race/http  (INALTERADOS)
coordenador re-verifica (contrato) → ccLeads/ccGadgets → relatório
```

O bridge é a **única** superfície de invocação — runtime-agnóstica. Em Claude Code/Pi/Antigravity, o
brief a aciona como escalonamento Tier-1 Node (doutrina já permite). Um **wrapper Extension nativo do
Pi** (H1d-F1, se a API do Pi for confirmada) apenas **embrulha o mesmo bridge** — **as regras de
negócio nunca se duplicam** (ficam nos validadores + `policies/`). Prioridade: **Pi**.

---

## 5. Contratos reaproveitados e adaptações necessárias (Etapa 4 — contrato de investigação)

**Reusa os identificadores e contratos já implementados — não cria um segundo modelo.** Campos novos
apenas de correlação (`investigationId`, `techniqueId`, `hypothesisId`); o resto já existe em
`contracts.d.ts`.

```jsonc
// Requisição de Investigação  (dispatcher → bridge)
{
  "investigationId": "INV-001",              // NOVO (correlação)
  "techniqueId": "T5",                        // reusa T[N]/B[N] da KB
  "hypothesisId": "H-idor-order-view",        // NOVO (correlação com ccLeads)
  "capability": "authz",                      // authz|race|concurrent|http|sessions (API existente)
  "experimentId": "exp-...",                  // EXISTE (concurrent/race)
  "principals": [{ "id":"owner","kind":"owner" }, { "id":"cross","kind":"cross-user" }], // EXISTE
  "resources": [{ "resourceId":"res-...", "classification":"private", "expect":{ "origin":"lab-fixture" } }], // EXISTE
  "scope": { "allowHosts":["..."], "allowPrivate":false },   // EXISTE (Scope Guard)
  "authorization": { "class":"A", "token":"<consentimento por-ação>", "riskCardRef":"4-Analysis/authorization-log.md#..." } // adapta authorization-gate
}
```
```jsonc
// Resultado de Investigação  (bridge → agente → coordenador)
{
  "investigationId":"INV-001", "techniqueId":"T5", "hypothesisId":"H-idor-order-view",
  "capability":"authz", "experimentId":"exp-...",
  "classification":"conforme|anomalia-de-autorizacao|violacao-confirmada|inconclusivo",  // DO VALIDADOR, não do LLM
  "observed": { /* metadata HTTP, estrutura só-chaves, ownership boolean — Rule 6 */ },
  "evidence": { "artifact":"…/evidence/…", "sha256":"…", "observedVsDerived":true },
  "correlation": { "principalId":"…","sessionId":"…","contextId":"…","resourceId":"…","requestId":"…" }, // EXISTE
  "limitations": ["…"], "pending": ["…"]
}
```

**Adaptações necessárias (todas pequenas):** (a) `contracts.d.ts` ganha `InvestigationRequest`/
`InvestigationResult` como **wrappers** dos tipos existentes; (b) o bridge traduz `authorization.token`
→ `authorizedStateChange` dos contratos internos; (c) `classification` é **copiada** da saída do
validador. **Regra dura preservada:** a classificação respeita os critérios já implementados (200/
latência não confirmam; violação exige ownership+regra / estado autoritativo).

---

## 6. Caso sintético end-to-end de referência (Etapa 5)

Investigação de autorização (IDOR em `GET /orders/{id}` entre dois usuários), **tudo sintético local**:

| Passo | O que acontece | Status hoje |
|-------|----------------|:---:|
| 1 | Dispatcher recebe "check if IDOR works on /orders/{id}" | ✅ Flow 9 (focused dispatch) |
| 2 | Seleciona skill | ✅ pattern-index → `web-testing` **T5** |
| 3 | Formula hipótese + identifica experimento | ⚠️ raciocínio OK; **falta** `hypothesisId`/`experimentId` ligados ao runtime (**G5**) |
| 4 | Solicita capacidade do Web Runtime | ❌ **G1** — hoje forjaria script ad-hoc; sem bridge não há chamada |
| 5 | Capacidade executa teste autorizado | ❌ **G1/G4** — API existe e funciona, mas inalcançável pelo brief; falta ligação ao consentimento por-ação |
| 6 | Validador produz resultado + evidências | ✅ `authz.matrix` classifica e sanitiza (testado) |
| 7 | Dispatcher recebe conclusão estruturada | ❌ **G5/G6** — sem contrato de retorno + re-verificação |
| 8 | Relatório reproduzível gerado | ⚠️ pipeline de relatório existe; **G7** só se faltar campo |

**Veredicto:** passos **1, 2, 6 já funcionam**; **3, 7** faltam o contrato de correlação; **4, 5** faltam
o bridge + ligação de autorização; **8** provavelmente já basta. **O gargalo único é a ausência de
superfície de invocação (G1), seguida do contrato (G5).**

---

## 7. Plano de implementação H1d-F1/F2/F3 (Etapa 6 — incrementos mínimos)

### H1d-F1 — Capability Bridge e exposição das ferramentas
- **Entregáveis:** `tools/web-runtime/bridge.mjs` (entrypoint stdin/arg→JSON sobre `capability.*`, sem
  lógica nova, sem deps); `InvestigationRequest`/`InvestigationResult` em `contracts.d.ts`; `test-bridge.mjs`
  (sintético); **confirmação da API de Extension do Pi** (pesquisa) — se indisponível, segue o caminho
  Tier-1 Node runtime-agnóstico.
- **Riscos:** vazamento de segredo pelo canal JSON (mitiga: reusa Rule 6/hygiene já existentes); Classe A
  sem gate (mitiga: token obrigatório). **Não** implementar Extension/MCP se a API do Pi não for confirmada.
- **Aceite:** bridge executa as 6 capacidades sobre fixtures sintéticas; recusa Classe A sem token;
  resultado sanitizado; **regressão F1→H1c-F2 + Validador 127/127**; `agents/`/policies/corpos intactos; sem deps.
- **Testes:** `test-bridge.mjs` + regressão completa.
- **Rollback:** remover `bridge.mjs` + `test-bridge.mjs` (aditivos) → estado atual, sem efeito colateral.

### H1d-F2 — Integração ao dispatcher e ciclo de investigação
- **Entregáveis:** 1 linha no `SKILL.md ## File Map`; nota de roteamento em `native-tooling-doctrine.md`
  (Tier-1 Node → preferir a capability a forjar ad-hoc para T5/T6/T8/T10); seção `## Capability request`
  no brief template de `flows-agents.md`; passo de **re-verificação** do Resultado de Investigação e
  população de `ccLeads`/`ccGadgets`.
- **Riscos:** o LLM inferir classificação (mitiga: contrato marca `classification` como dado do validador,
  **G6**); drift de doc (mitiga: atualizar File Map + README juntos). **Não tocar os 127 corpos** — só
  roteamento/correlação.
- **Aceite:** caso end-to-end da §6 completo em modo sequencial; coordenador re-verifica; nenhuma
  classificação originada pelo LLM; regressão verde.
- **Rollback:** reverter as notas de doutrina/flow/File Map (texto aditivo) → dispatcher volta ao
  comportamento de forjar script.

### H1d-F3 — Relatório unificado e validação ponta a ponta — **somente se houver lacuna comprovada**
- **Pré-condição:** demonstrar que `reports/template.md` **não** acomoda a evidência de experimento/reset.
  Se o pipeline atual bastar, **F3 não ocorre**.
- **Entregáveis (se necessário):** campos de experimento/reset no template; validação e2e reprodutível.
- **Aceite/Rollback:** relatório cita experimento+reset+evidência observada; rollback = reverter o template.

---

## 8. Critérios de aceite e rollback (global)

**Aceite do H1d (quando implementado):** (1) o caso da §6 roda ponta a ponta em runtime sem dispatch
paralelo; (2) toda Classe A exige consentimento por-ação; (3) classificação sempre do validador;
(4) evidências sanitizadas (Rule 6) e `observed` separado de `derived`; (5) **regressão F1·F2·H1b-F1·
H1b-F2·H1c-F1·H1c-F2 + Validador V1 127/127**; (6) `agents/` (17), `policies/` imutáveis e os 127 corpos
**inalterados**; (7) **nenhuma dependência nova**; (8) nenhum alvo externo/teste ofensivo.

**Rollback global:** todos os incrementos são **aditivos** (um arquivo de bridge + notas de texto). O
rollback é remoção/reversão desses artefatos; nada no caminho atual depende deles, então o HackBot
retorna ao comportamento pré-H1d sem migração de estado.

**Restrições honradas nesta etapa:** 127 corpos intactos · `agents/` não arquivado · políticas imutáveis
não modificadas · sem dependências · sem alvos externos · sem testes ofensivos · sem novo framework de
agentes · sem Caido · sem P3/P4/P5 · **nenhuma mudança operacional executada** (só este documento).

---

## Menor proposta implementável (resumo para aprovação)

**H1d-F1 — um único entrypoint `bridge.mjs`** (Node, sem deps, sem lógica nova) que expõe a API
`capability.*` já construída, com token de autorização por-ação e resultado JSON sanitizado cuja
classificação vem do validador. É a **única** peça que fecha o gargalo (G1); tudo mais (G2/G3/G5/G6) é
texto de roteamento/contrato em H1d-F2. Prioriza o Pi via superfície runtime-agnóstica; um wrapper
Extension nativo só após confirmar a API do Pi.

**Parando aqui, aguardando aprovação para H1d-F1.** Não iniciei bridge, Extension, MCP, Caido nem
alterações no dispatcher.
