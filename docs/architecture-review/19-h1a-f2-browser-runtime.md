# 19 — H1a-F2: Browser Runtime visual (implementação mínima)

> Backend **visual** com `playwright-core` dirigindo **Chrome/Edge já instalado** — **sem download de navegador**, sem Docker/WSL, sem admin. Reutiliza os contratos, o Scope Guard, as policies e a evidência do F1. **Sessão única** (sem multi-sessão/concorrência). **127 entradas intactas.**
>
> **Viabilidade:** `playwright-core` **NÃO está instalado** no ambiente. Implementei o backend completo (import *lazy*, driver injetável) e os testes; a **execução real do navegador está BLOCKED** (não PASS) até a dependência ser aprovada/instalada. **Nada foi instalado nem baixado.**

Local: `tools/web-runtime/` · Validador V1: **127/127**.

## 1. Viabilidade do ambiente (verificada, sem launch/download)

| Item | Resultado |
|------|-----------|
| Node | v22.23.1 ✓ |
| `playwright-core` (resolvível pelo Node) | **não** — ausente; sem `node_modules` no repo |
| Navegador homologado | `google-chrome-stable` ✓, `chromium` ✓ (canal `chrome` detectado); Edge ausente |
| `browser.probe()` | `available:false`, `reason:"playwright-core não instalado"`, `channel:"chrome"` |
| `select()` | `http-inspect`, `visual:false` (fallback explícito) |

**Dependência registrada p/ aprovação:** `playwright-core` (npm). **Não baixa navegadores** (ao contrário do pacote `playwright`). Instalação proposta: `npm install playwright-core` (ou *vendored*). **NÃO** executar `npx playwright install` (isso baixaria Chromium). Sem aprovação, o backend permanece indisponível e o runtime usa o fallback HTTP.

## 2. O que foi implementado

| Arquivo | Papel |
|---------|-------|
| `backends/browser.mjs` | Backend visual: `probe/open/snapshot/screenshot/click/fill/network/console/close`; sessão única; action log; limites/cancel; evidência sanitizada |
| `driver-playwright.mjs` | Driver real (import **lazy** de `playwright-core`); canal instalado; roteamento de escopo em toda requisição; TLS preservado |
| `capability.mjs` | `capability.matrix()` + `select()` (detecção de capacidade por backend, fallback explícito) |
| `test-browser.mjs` | 15 testes mock (PASS) + 1 integração real (**BLOCKED**) |

**Capacidades** (todas com driver injetável): `browser.probe`, `browser.open`, `browser.snapshot` (DOM renderizado), `browser.screenshot`, `browser.click`, `browser.fill`, `browser.network`, `browser.console`, `browser.close`. **Locators semânticos** preferidos (`getByRole/Label/Text/Placeholder/TestId`; `css` é fallback explícito). **Action log** com id correlacionável (`<sessionId>-<n>`), timestamp, status (`ok`/`blocked`/`error`) e referência de evidência.

## 3. Integração (os 8 pontos)

1. **Reutiliza contratos/policies do F1** — Scope Guard (`scope.mjs`), `sanitizeHeaders`, `redactCredentials`, `portableName`, limites/cancel. ✓
2. **Fallback HTTP preservado** — `http-inspect` intacto (19/19); `select()` cai para ele quando o visual está indisponível. ✓
3. **Detecção explícita por backend** — `browser.probe()`/`matrix()` sem launch/download. ✓
4. **Não declara visual quando só HTTP funciona** — matriz mostra `browser.available:false` e todas as caps visuais `false`; `select().visual=false`. ✓
5. **Sem novo framework de plugins/orquestração** — backends são um array; seleção é uma função. ✓
6. **Sem Caido/MCP** nesta fase. ✓
7. **Sessão única** — 2º `open` com sessão ativa é rejeitado; sem concorrência. ✓
8. **127 entradas intactas** — Validador V1 127/127. ✓

## 4. Segurança

- **Scope Guard em TODA navegação e requisição:** `open()` valida antes de navegar; o driver instala `context.route("**/*")` que **aborta** requisições fora de escopo (navegação principal, subrecursos, redirects e **requisições originadas por JavaScript**); pop-ups herdam o mesmo guard (mesmo contexto). Cada redirect é re-validado; `finalUrl` re-checado.
- **Interno/loopback só com autorização explícita** (`allowPrivate` + allowlist) — herdado do F1.
- **Limites/timeouts/cancel:** `navTimeoutMs`, `actionTimeoutMs`, `maxActions`, `maxScreenshotBytes`, `maxNetworkEntries`; `AbortSignal` encerra o navegador.
- **Nunca expõe credenciais ao LLM:** `snapshot` redige o DOM; `network`/`console` sanitizados (sem `Cookie`/`Set-Cookie`/`Authorization`); `screenshot` retorna **só** path+sha256 (nunca bytes); `fill` registra **apenas o comprimento** do valor (segredo não vai para o log).
- **TLS não contornado:** `ignoreHTTPSErrors:false` fixo; sem flags de `--disable-web-security`/`--ignore-certificate-errors`; sem bypass de política corporativa.

## 5. Testes e resultados

| Suíte | Resultado |
|-------|-----------|
| `test-browser.mjs` (mock driver) | **15 PASS** — scope pré-nav, redirect fora de escopo, subrecurso/popup fora de escopo abortado, snapshot sanitizado, screenshot artefato, limites, cancelamento, close, sessão única, fallback/matriz, locators semânticos |
| `test-browser.mjs` (navegador real, loopback sintético) | **1 BLOCKED** — `playwright-core não instalado` (honesto: não PASS) |
| `test.mjs` (F1) | **19 PASS** — sem regressão |
| Validador V1 | **127/127** |

## 6. Matriz de capacidades (saída de runtime)

| Capacidade | `http-inspect` | `browser` (quando disponível) | Agora (host) |
|------------|----------------|-------------------------------|--------------|
| http_request / headers / redirects | ✅ | ✅ | http-inspect ✅ · browser ❌ (indisponível) |
| static_html / network_metadata / referenced_resources | ✅ | ✅ | http-inspect ✅ |
| **dom_rendered / screenshot / javascript / interaction / console** | ❌ | ✅ | **❌ (visual indisponível)** |

`select()` atual → `http-inspect`, `visual:false`, `reason:"...playwright-core não instalado"`.

## 7. Compatibilidade e limitações (Windows corporativo)

- `playwright-core` é multiplataforma; usa o **canal instalado** (`chrome`/`msedge`), sem download.
- **Launch do navegador é um processo filho** (o playwright inicia o browser). Em Windows corporativo isso **pode ser bloqueado** por política → `browser.probe()` reporta `available:false` e o runtime **degrada para `http-inspect` automaticamente**, sem erro.
- Sem admin para **usar** um navegador já instalado; `npm install playwright-core` sujeito à política de registry (pode ser *vendored*).
- EDR/telemetria: automação headless é observável → tratar sob `telemetry-awareness` em alvo sensível.
- **Edge ausente** no host; canal `chrome` disponível.

## 8. Critérios de aceite — situação

| Critério | Status |
|----------|--------|
| Fluxo visual completo em app sintética | ⛔ **BLOCKED** (depende de `playwright-core` + launch permitido) — honesto, não simulado |
| Evidências DOM/screenshot/rede correlacionadas | ✅ via mock + action log; real **BLOCKED** |
| Sem vazamento de credenciais | ✅ (testado) |
| Sem requisições fora do escopo | ✅ (testado: subrecurso/redirect/popup) |
| Fallback HTTP funcional e identificado | ✅ (`select()` explícito) |
| Validador V1 127/127 | ✅ |
| Sem regressão no HackBot | ✅ (F1 19/19; 127/127) |
| Compatibilidade/limitações Windows documentadas | ✅ (§7) |

## 9. Plano H1b — Multi-Session Runtime (NÃO iniciar automaticamente)

Objetivo: múltiplos contextos isolados e reutilização de sessão, sobre o mesmo contrato.

| Passo | Entrega | Gate |
|-------|---------|------|
| H1b.1 | Session Manager: N contextos isolados (cookies/storage por principal owner/cross/noauth) | aprovação H1b |
| H1b.2 | Reutilização de sessão por **referência** (handle), nunca segredo no contexto (Rule 6) | H1b.1 |
| H1b.3 | Base para Authorization Testing (IDOR/BOLA) com troca de contexto que **substitui** auth | H1b.1 |
| H1b.4 | Controle de concorrência/limites por sessão; cancelamento em lote | H1b.1 |

Pré-requisito: F2 validado end-to-end (dependente de `playwright-core` + ambiente que permita launch).

## 10. Pendências

1. **Aprovar instalação de `playwright-core`** (sem `playwright install`/Chromium) para destravar o teste real (hoje BLOCKED).
2. Validação end-to-end num ambiente que permita launch (laboratório; depois Windows corporativo).
3. H1b sob aprovação específica.
