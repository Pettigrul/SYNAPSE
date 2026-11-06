# 18 — H1a-F1: HTTP Inspection Backend (implementação mínima)

> Primeiro incremento do Web Runtime. **Backend de inspeção HTTP/HTML estático** — Node.js
> stdlib puro, **sem dependências externas, sem processos filho, sem shell, sem Docker/WSL**.
> **Não é navegador visual:** não executa JavaScript, não renderiza DOM, não faz screenshot.
> HTML estático é retornado como tal e rotulado distintamente de um DOM renderizado.
> Nenhum alvo real foi acessado nesta rodada.

Local: `tools/web-runtime/` · Validador V1 após a adição: **127/127, 0 achados**.

## 1. O que foi implementado

| Arquivo | Papel |
|---------|-------|
| `contracts.d.ts` | Contratos tipados (backend-agnósticos), consumidos via JSDoc `@typedef` |
| `capability.mjs` | Superfície estável: `capability.probe`, `http.open/inspect/headers`, `evidence.record` |
| `scope.mjs` | Rule 0 (allowlist) + guard SSRF/interno (IPv4/IPv6/hostnames) |
| `backends/http-inspect.mjs` | Backend: transporte, redirects re-validados, limites, timeout, cancel, sanitização, extração de referências |
| `evidence.mjs` | `evidence.record` — artefato sanitizado, nome portável, sha256 |
| `test.mjs` | 19 testes automatizados (mocks + 1 fixture loopback) |
| `fixtures/sample.html` | Fixture local p/ extração de referências |
| `README.md` | Capacidades suportadas/indisponíveis + modelo de segurança |

## 2. Contratos tipados (estáveis, reutilizáveis)

- **`capability.probe()`** → `ProbeResult[]` (id, kind, capabilities, limits).
- **`http.open(req, ctx)`** → `OpenResult` — 1 transação, redirects controlados, scope re-checado a cada hop, limites/timeout/cancel.
- **`http.inspect(req, ctx)`** → `Inspection` — `staticHtml`, `references[]`, `network`, e **explicitamente** `rendered:false`, `dom:null`, `screenshot:null`, `kind:"static-http"`.
- **`http.headers(req, ctx)`** → status + headers (sem corpo).
- **`evidence.record(insp, {dir})`** → `EvidenceRecord` (path, sha256, `sanitized:true`, summary).

O contrato é **backend-agnóstico**: Playwright/CDP/Chrome DevTools MCP/Caido implementarão a mesma interface e poderão acender as capacidades visuais hoje indisponíveis. **Não há** framework de plugins, scheduler ou Session Manager (fora de escopo desta fase).

## 3. Capacidades

**Suportadas:** requisições HTTP/HTTPS; status+headers; redirects com re-validação de escopo; HTML estático; metadados de rede (timing, bytes, cadeia de redirecionamento, truncamento); identificação de recursos referenciados (script/link/img/a/form/iframe — extração estática, não execução); gravação de evidência sanitizada; disponibilidade por backend (`capability.probe`).

**Indisponíveis neste backend (reportadas `false`):** `dom_rendered`, `screenshot`, `javascript`, `interaction`. Não há métodos visuais expostos. `http.inspect` sempre retorna `rendered:false`/`dom:null` — **HTML estático nunca é apresentado como DOM renderizado**.

## 4. Segurança

- **Rule 0:** allowlist-first; `validateTarget()` **antes da 1ª requisição e após cada redirect**.
- **Guard SSRF/interno:** bloqueia privado/loopback/link-local (incl. `169.254.169.254`), ULA/IPv6 e hostnames "chapados", salvo `allowPrivate` + allowlist. **Sem DNS** (sem dependência de rede real): hostname só via allowlist; IP-literal checado por faixa.
- **Rule 6:** headers sensíveis (`Authorization`/`Cookie`/`Set-Cookie`/API keys) redigidos em todo objeto retornado/gravado; evidência passa por redação extra (Bearer/JWT/senha).
- **Limites:** `maxBytes` 2 MiB · `maxRedirects` 5 · `maxRequests` 6 · `timeoutMs` 15 000 (sobrescrevíveis). Corpo truncado (sinalizado) em `maxBytes`.
- **Cancelamento:** honra `AbortSignal`.

## 5. Testes (19/19 ✅)

`node tools/web-runtime/test.mjs` — rede **mockada** por transporte injetável; **um** servidor loopback (`127.0.0.1`, porta efêmera) **apenas como fixture local** para timeout/limite/transporte real — nunca alvo externo.

Cobre: requests e redirects; **scope enforcement pré e pós-redirect**; guard SSRF (IP interno + metadata); timeouts; cancelamento; `maxRedirects` → `LimitError`; truncamento por `maxBytes`; sanitização (headers + corpo/JWT); `evidence.record` sanitizado + nome portável + sha256; capacidades visuais indisponíveis; `http.headers` sem corpo; rótulo estático-não-DOM; extração de referências do fixture.

## 6. Relatório de compatibilidade

| Item | Situação |
|------|----------|
| Runtime | Node.js **v22.23.1** (host); usa só `node:http`, `node:https`, `node:crypto`, `node:fs`, `node:path`, `node:os`, `node:url`, `node:assert` |
| Dependências externas | **nenhuma** |
| Processos filho / shell / binários | **nenhum** |
| Windows corporativo | Compatível: sem shell/child-process (sem política de execução), **nomes de arquivo portáveis** (testado, sem `\ / : * ? " < > \|`), caminhos via `path.join`, `AbortController` (Node ≥15). O servidor **loopback é só do teste**; se a política bloquear *listen* local, os 3 testes de fixture podem ser pulados e os 16 baseados em mock seguem válidos |
| Regressão no HackBot | **nenhuma** — Validador V1 127/127, 0 achados |
| `node --check` | OK em todos os módulos |

## 7. Plano H1a-F2 (navegador visual — NÃO implementado agora)

Objetivo: acender as capacidades visuais sobre **o mesmo contrato** (§2), como backends irmãos em `tools/web-runtime/backends/`.

| Passo | Entrega | Gate |
|-------|---------|------|
| F2.1 | `backends/playwright.mjs` via `playwright-core` + canal do navegador **instalado** (sem baixar Chromium); implementa `open/inspect` + acende `dom_rendered`, `screenshot` | aprovação H1a-F2 + `playwright-core` |
| F2.2 | `capability.probe` com **availability probe** em runtime (detecta launch/porta permitidos) e **degradação automática** para `http-inspect` quando o navegador não está disponível | F2.1 |
| F2.3 | `backends/mcp.mjs` (Chrome DevTools MCP) para portabilidade Pi/Antigravity; condicional a MCP liberado | F2.1 |
| F2.4 | Isolamento de contexto + reutilização de sessão por **referência** (Rule 6) → liga ao Session Manager do H1 | F2.1/F2.3 |

Critérios de aceite F2 (laboratório + Windows corporativo): capturar DOM renderizado, screenshot, console e network numa página local; **nunca** rotular estático como DOM; degradar para `http-inspect` sem erro quando launch/porta/MCP bloqueados; sem download de navegador, sem Docker, sem admin; segredos nunca persistidos.

**Não avançar para F2 automaticamente** — aguarda aprovação específica.
