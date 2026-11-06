# 21 — H1b-F1: Multi-Session Runtime (Relatório de Aceitação)

> Evolução do Browser Runtime para **múltiplos principais e sessões autenticadas
> independentes**, preservando o contrato de sessão única do H1a-F2. Fundação para
> IDOR/BOLA — **sem executar** esses testes nesta etapa. Navegador real em laboratório
> sintético (loopback). **127 entradas intactas; `agents/` intacto; nenhuma dependência
> nova.** H1b-F2 (Authorization Matrix), H1c (race) e integrações externas **fora de escopo**.

## 1. Arquitetura (reuso + mínimo necessário)

Um **navegador compartilhado** (um processo) hospeda **N `BrowserContext` isolados** — um por
sessão. Reusa contratos, Scope Guard (Rule 0 + SSRF), Evidence/sanitização (Rule 6), limites e
o driver playwright-core existentes.

| Componente | Arquivo | Papel |
|------------|---------|-------|
| `Session` (reutilizável) | `session.mjs` | Estado/ops por sessão: scope guard, sanitização, limites, action log, rede/console. Compartilhado por fachada e manager. |
| Fachada sessão única | `backends/browser.mjs` | Contrato H1a-F2 **inalterado** (uma sessão ativa) — agora fino sobre `Session`. |
| Driver pool | `driver-playwright.mjs` | `launch()` (1 browser+1 ctx, legado) **e** `launchPool()` → `newSession()` cria `BrowserContext` isolado. Uma só implementação de rota. |
| Identity Registry | `identity-registry.mjs` | Identidade lógica (`principalId`+kind+label) **separada** do armazenamento de credenciais (storageState selado, só em memória). |
| Session Manager | `session-manager.mjs` | As 8 capacidades + pool compartilhado + isolamento/limites/cancel por sessão + fallback HTTP. |

**Identificadores distintos e opacos:** `principalId` (`pr-…`) · `sessionId` (`br-…`) ·
`contextId` (`ctx-…`); `resourceId` reservado para o alvo de ação em H1b-F2. **Não** foram
criados: framework de autenticação, banco de dados, vault, scheduler multiagente.

## 2. Capacidades (8) — `capability.sessions.manager()`

`session.create` · `get` · `list` · `status` · `bindIdentity` · `request` · `close` · `closeAll`.
Contextos **owner / cross-user / noauth**. Identidades por **referência opaca**; credenciais e
tokens **nunca** retornados. Reutilização controlada de estado de autenticação via
`bindIdentity({captureAuthState})` + `create({principal})` — segredo selado em memória, nunca em
texto para o LLM, nunca em disco.

## 3. Ciclo de vida

```
register(identity) → create(scope, principal) → [bindIdentity(capture)] → request(op…) → close | closeAll
       │ pr-…              │ br-… + ctx-…            │ sela storageState        │ navigate/…    │ libera contexto(s)
```
- **create**: valida scope; aplica limite `maxSessions`; cria `BrowserContext` isolado (com
  storageState selado se o principal o tiver); grava meta opaca.
- **request**: despacha `navigate/snapshot/screenshot/click/fill/network/console/actionLog` para a
  sessão correta, com guard (cancel/maxActions/maxDuration) a cada ação.
- **close**: fecha **apenas** o contexto da sessão (irmãs intactas). **closeAll**: fecha todas +
  libera o navegador compartilhado.

## 4. Evidências de isolamento (sintético, navegador real)

| Evidência | Caso | Resultado |
|-----------|------|-----------|
| Cookies isolados por contexto | S2, S4 | A=alice logada; B navega `/whoami` → `anon`; A/B mantêm `alice`/`bob` |
| localStorage/sessionStorage isolados | S2 | valores setados em A → `null` em B |
| Navegação alternada preserva estado | S3 | A→alice e B→bob após logins intercalados |
| Requisição autenticada na sessão certa | S4 | `/whoami` por sessão retorna o principal correto |
| noauth sem credencial | S5 | `authenticated:false`; `/whoami` → `anon` |
| Sem acesso cruzado involuntário | S2–S4 | nenhum cookie/storage vaza entre contextos |

## 5. Segurança e isolamento

| Garantia | Caso | Resultado |
|----------|------|-----------|
| Scope Guard por sessão | S11 | navegação fora de escopo rejeitada; `evilHits=0`; escopos independentes por sessão |
| Sanitização por identidade | S12 | `set-cookie`/`x-auth-token` **[REDACTED]** na rede; token cru redigido no snapshot; screenshot só path+sha256 |
| Sem segredo em metadados | S12 | `status`/`get`/`describe(identity)` não contêm cookie/token/storageState |
| Separação identidade ↔ credencial | arquitetura | `IdentityRegistry`: mapa de identidades vs. mapa selado de credenciais |
| Limites por sessão | S8, S9 | `maxSessions` (criação); `maxActions`; `maxDurationMs`; cancelamento por `AbortSignal` |
| Encerramento com liberação | S6, S7 | close individual não afeta irmãs; closeAll libera tudo |
| Falha inesperada não mascarada | S10 | navegador caído → ação rejeita limpo (não falso sucesso) |

### Pré-requisito validado antes de habilitar POST autenticado (seção 4 da autorização)
- **S0:** sob a interceptação atual (`route.fetch({maxRedirects:0})` + fulfill), o **método e o
  corpo do POST são preservados** (login `POST /login` com corpo chega ao servidor; cookie é
  setado e carregado em requisições seguintes) e um **redirect 303 pós-POST dentro do escopo é
  seguido** corretamente. POST autenticado habilitado com essa evidência.
- **WebSocket, downloads e diálogos** permanecem **não suportados** (desabilitados) por falta de
  cobertura — declarados explicitamente, sem falsa capacidade.
- **TLS, controles corporativos e políticas do navegador** não são contornados
  (`ignoreHTTPSErrors:false`, `serviceWorkers:"block"`).

## 6. Testes executados

| Suíte | Resultado |
|-------|-----------|
| `test-sessions.mjs` (H1b-F1, navegador real) | **S0–S14: 15/15 PASS**, `evilHits=0`, 0 BLOCKED |
| `test.mjs` (F1) | 19/19 |
| `test-browser.mjs` (F2 mock) | 16/16 |
| `test-e2e.mjs` (F2 real) | 11/11, `evilHits=0` |
| Validador V1 | **127/127** (bodies OK, count OK) |

Mapa dos 14 casos exigidos → S1 (3 sessões) · S2 (isolamento cookies/local/session) · S3 (nav
alternada) · S4 (auth na sessão certa) · S5 (noauth) · S6 (close individual) · S7 (closeAll) · S8
(limite de sessões) · S9 (timeout/cancel) · S10 (falha do navegador) · S11 (Scope Guard) · S12
(sanitização) · S13 (compat sessão única) · S14 (fallback HTTP sem falsa auth). **+S0** pré-requisito POST.

## 7. Compatibilidade (item 3)

- O contrato de **sessão única** (H1a-F2) continua funcional (S13; F2/e2e verdes). A fachada
  `browser.*` é inalterada.
- Operações de browser passam a existir também **por sessão** via `session.request({op,…})`,
  **sem renomear** nem alterar os contratos anteriores.
- **Fallback HTTP preservado**; e **não presume** reproduzir sessões autenticadas de navegador:
  `fallbackSession()` reporta `visual:false`, `authenticated:false` e motivo explícito (S14).

## 8. Limitações conhecidas

1. **Crash real por SIGKILL:** o `Browser` de `launch()` no playwright-core **1.64.1 não expõe
   `process()`** (sem PID). S10 induz indisponibilidade inesperada por desconexão forçada do
   navegador compartilhado — **mesmo caminho de falha limpa** de um crash de SO (Playwright
   "Target closed" → rejeição). Para SIGKILL fiel seria preciso `launchServer()`+`connect()`
   (fora do escopo mínimo).
2. **Reuso de auth state** é feito recriando o contexto com `storageState` selado na criação da
   sessão; não há "re-login a quente" dentro de um contexto existente.
3. **WebSocket, downloads, diálogos e popups-como-handle**: não suportados nesta rodada.
4. **Concorrência real** (operações paralelas na mesma sessão / entre sessões) **não** é testada —
   é H1c; o backend assume uso sequencial por sessão.
5. **Windows corporativo**: não validado (herda a pendência do H1a-F2; launch é processo filho).

## 9. Regressão (item 6)

F1 verde · F2 verde · e2e verde · Validador **127/127** · **nenhuma alteração em corpos técnicos**
(multiset de hashes idêntico) · **`agents/` intacto (17)** · **nenhuma dependência nova**
(`playwright-core 1.64.1` apenas). Mudanças desta rodada: **somente** `tools/web-runtime/`
(+ `manifest-h0.json`, saída gerada pelo Validador).

## 10. Recomendação, riscos e critérios para H1b-F2

**Recomendo aceitar o H1b-F1** no ambiente de desenvolvimento: as 8 capacidades funcionam, o
isolamento por `BrowserContext` é comprovado, segredos nunca vazam e não há regressão.

**Riscos a observar antes do H1b-F2:**
- Sem concorrência testada (H1c): a Authorization Matrix deve operar sequencialmente por sessão.
- Reuso de auth state depende de `storageState` selado — qualquer persistência futura precisa
  manter Rule 6 (sem segredo em disco em texto puro).
- Windows corporativo ainda não validado (degradação para HTTP, sem auth de navegador).

**Critérios para autorizar H1b-F2 (Authorization Matrix) — especificação preliminar em
[`22-h1b-f2-authorization-matrix-spec.md`](22-h1b-f2-authorization-matrix-spec.md):**
1. H1b-F1 aceito e estável (esta entrega).
2. Modelo de `resourceId` e de comparação de respostas owner/cross/noauth definido **sem** executar
   payloads ofensivos fora de laboratório sintético.
3. Política de evidência diferencial (owner vs cross-user) que **não** exponha dados sensíveis do
   recurso de um principal ao outro nos artefatos.
4. Decisão explícita sobre concorrência (sequencial até H1c).

**Não** foram iniciados testes IDOR/BOLA, Multi-Session concorrente ou integrações. `agents/` não
arquivado; P3/P4/P5 não executados. Aguardando aprovação para **H1b-F2**.
