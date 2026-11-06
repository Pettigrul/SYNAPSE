# 4 — Capacidades do Web Runtime

Todas as capacidades são alcançadas via Bridge (`op` em `BRIDGE_OPS`) e expostas em `capability.mjs`
(`http, browser, sessions, authz, concurrent, race`). Vocabulários de classificação são **constantes
exportadas** (fonte de verdade), e a Bridge preserva o veredito **verbatim**.

## 4.1 HTTP Inspection ✅ 🧪  (`backends/http-inspect.mjs`, op `http.inspect`/`http.headers`)

- **Propósito:** leitura HTTP estática (GET/headers), **sem** navegador, **SSRF-safe** (via scope).
- **Funções:** `inspect`, `headers`, `open`, `extractReferences`, `sanitizeHeaders`, `defaultTransport`.
- **Contrato:** `inspect({url, method?, headers?}, {scope, signal})` → `{status, finalUrl, rendered:false,
  headers(sanitizados), references?}`. Limites: `DEFAULT_LIMITS`. Erros: `CancelledError`, `LimitError`,
  `TimeoutError`.
- **Invariantes:** nunca afirma autenticação; nunca segue para fora do escopo; headers sensíveis redigidos.
- **Testes:** `test.mjs`, `test-e2e.mjs`, `test-bridge.mjs` (B2/B4/B11/B14). 
- **Limitações:** estático (sem DOM/JS). Para render use o Browser Runtime.

## 4.2 Browser Runtime ✅ 🧪 🤖  (`backends/browser.mjs`, `session.mjs`, `driver-playwright.mjs`)

- **Propósito:** navegador visual real via **playwright-core** dirigindo Chrome/Edge **instalado**
  (`detectChannel`/`executablePath`) — **nunca baixa navegador**.
- **Ops (per-sessão):** `browser.navigate|snapshot|screenshot|network|console|click|fill|probe`.
- **Disponibilidade:** `capabilities.probe` → `{visual:boolean, reason}` (runtime probe, `session.mjs::probe`).
  Indisponível → cai em HTTP fallback (`session-manager.mjs::fallbackSession`) **sem** falsa autenticação.
- **Caps/limites:** `VISUAL_CAPS`/`CAPS_OFF`, `DEFAULT_LIMITS`, timeouts por ação.
- **Sensíveis:** `browser.click`/`browser.fill` exigem aprovação (`state-change-unauthorized` se ausente);
  `browser.probe` com método que altera estado idem.
- **Evidência:** `browser.screenshot` grava no `opts.dir` (ex.: `/tmp/securityauditor-inv-*`), com hash no
  registro (visto na validação agêntica C, [30] Parte III).
- **Testes:** `test-browser.mjs`, `test-bridge.mjs` (B6/B9/B10/B15); validado agênticamente (C PASS).
- **Limitações:** `evidenceDir` não é auto-derivado do Execution Context; `dir` vem do parâmetro da op.

## 4.3 Sessions e Identity Registry ✅ 🧪  (`session-manager.mjs`, `identity-registry.mjs`)

- **Propósito:** N principais **isolados**, cada um em seu `BrowserContext` (cookies/storage isolados);
  um processo de navegador hospeda N contexts.
- **Identidade:** `IdentityRegistry` com `KINDS = owner | cross-user | noauth`; `register` valida o kind
  (**H1e-F1/P2:** erro de kind inválido **lista os válidos**); `describe` devolve só metadados opacos
  (sem segredos). Credencial (`storageState`) vive **por referência**, nunca retornada ao LLM.
- **Ops:** `sessions.create|list|status|bindIdentity|close`. `create({kind,label,principal?})` → sessão
  isolada; reuso controlado de auth-state sem expor credencial.
- **Invariantes:** isolamento entre sessões e entre investigações (`test-bridge` B7); sem falsa
  autenticação no fallback HTTP.
- **Testes:** `test-sessions.mjs`, `test-bridge.mjs` (B6/B7/B11).
- **Limitações:** `maxSessions` (default 8; ajustável via `limits.maxSessions` no contexto).

## 4.4 Authorization Matrix (IDOR/BOLA) ✅ 🧪 🤖  (`authz-matrix.mjs`, `resource-registry.mjs`, op `authorization.*`)

- **Propósito:** investigação **sequencial** IDOR/BOLA entre identidades sobre recursos registrados.
- **Classes (verbatim):** `CLASSES = conforme | anomalia-de-autorizacao | violacao-confirmada |
  inconclusivo`. `EXPECT_OUTCOMES = allow | deny | unknown`. `EXPECT_ORIGINS = documented-policy |
  lab-fixture | approved-premise`. Recursos: `CLASSIFICATIONS = private | public | shared | admin |
  unknown`.
- **Ops:** `authorization.registerResource` (registra `resource`); `authorization.run({cases})` — cada
  case `{caseId, resourceId, sessionId, expected:{outcome, origin}}`. A Bridge seta
  `authorizedStateChange` **somente** a partir das aprovações do contexto (o agente não se autoriza).
- **Classificação:** `classify()` — um 200 onde a política diz *deny* **sem** evidência de posse →
  `anomalia-de-autorizacao`, **não** `violacao-confirmada` (a Bridge nunca promove).
- **Testes:** `test-authz.mjs`, `test-bridge.mjs` (B12); validado agênticamente (A — IDOR/BOLA PASS, [30]).
- **Limitações:** sequencial (não concorrente); a confirmação exige evidência de posse/origem.

## 4.5 Concurrency ✅ 🧪  (`concurrent-executor.mjs`, op `concurrent.run`)

- **Propósito:** fundação de execução **concorrente controlada** (base do Race Validator).
- **Estados (verbatim):** `OP_STATES = ok | failed | timeout | cancelled | blocked`. `DEFAULT_LIMITS`.
- **API:** `prepare` · `run` · `cancel` · `status`. `concurrent.run({experiment:{operations:[…]}})` — cada
  op nomeia um `sessionId` da investigação; `authorizedStateChange` vem das aprovações.
- **Testes:** `test-concurrent.mjs`.
- **Limitações:** operação sem sessão/aprovação é bloqueada (`blocked`/`state-change-unauthorized`).

## 4.6 Race / TOCTOU Validator ✅ 🧪 🤖  (`race-validator.mjs`, op `race.run`)

- **Propósito:** validador **stateful** de condições de corrida / TOCTOU com **reset verificável**.
- **Classes (verbatim):** `RACE_CLASSES = conforme | anomalia | violacao-observada | violacao-reproduzida
  | inconclusivo`. `RULE_SOURCES = documented-policy | lab-fixture | approved-premise`.
- **Fluxo:** prova estado inicial → executa rajada concorrente → observa oráculo → **reset verificável** →
  repete (tentativas). **Se o estado inicial não pode ser provado, NÃO roda**; sem reset, não repete.
- **Pré-requisitos (H1e-F1/P2):** `experiment.operations` não-vazio (cada op com `sessionId` existente +
  `url`/`method`); `observerSessionId` **opcional** é uma sessão existente (não um identity kind). Ausente
  → `race-prerequisites` (erro autoexplicativo).
- **Contrato de exemplo:** `{experimentId, observerSessionId?, operations:[{sessionId,method,url,body,
  policy:{stateChanging}}], invariant:{field,op,value}, observe:{stateUrl,fields}, reset:{url}, attempts}`.
- **Testes:** `test-race.mjs`, `test-bridge.mjs` (B12 → `violacao-observada`); validado agênticamente
  (B — [30] Parte III: `race.run` executado, veredito `violacao-reproduzida`; Record truncado = PARTIAL).
- **Limitações:** exige oráculo de estado autoritativo + reset; a completude do Investigation Record
  escrito pelo agente é dívida técnica (ver cap. 5/7).

## 4.7 Matriz op × capability × sensível (resumo de `BRIDGE_OPS`)

| Capability | Ops | Sensível (precisa aprovação) |
|-----------|-----|------------------------------|
| capabilities | list, probe | — |
| http | inspect, headers | — |
| sessions | create, list, status, bindIdentity, close | — |
| browser | navigate, snapshot, screenshot, network, console, click, fill, probe | **click, fill** (+ probe com método mutante) |
| authorization | registerResource, run | **run** |
| concurrent | run | **run** |
| race | run | **run** |
| caido (H2b-F1) | health, projects, history, request | — (read-only; gated por associação de projeto + escopo) |
| copilot (H2b-F3) | summary, endpoints, hypotheses, recommendations, unassessed, relate, setState | — (read-only determinístico; copilot anexado pelo host via `attachCopilot`) |
| caido (H2b-F4a, +reads) | findings.list, findings.get, replay.sessions, replay.entry, automate.sessions, automate.session | — (read-only; associação + escopo) |
| caido-active (H2b-F4a) | replay.run, findings.create | **ambas** (aprovação do operador + escopo antes/depois + idempotência + limite; capability separada de `caido`) |
| investigation (H2b-F4b) | start, kb, evidence, propose, interpret, finalize, snapshot, get | — (Record passivo; campos interpretativos pelo agente, execução ativa auto-espelhada dos envelopes reais) |
| workflow (H2b-F5a) | propose, get, list, validate, generate | — (planner/validador offline; IR intermediário; geração nativa BLOCKED; sem efeito no Caido) |
