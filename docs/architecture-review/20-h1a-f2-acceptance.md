# 20 — H1a-F2: Relatório de Aceitação (navegador real)

> Validação end-to-end do Browser Runtime visual com **navegador real**, no ambiente de
> desenvolvimento (Linux). Dependência instalada de forma controlada; nenhum navegador
> baixado; nenhuma app externa acessada; nenhum payload ofensivo. **127 entradas intactas.**
> A autorização **não** se estende ao Windows corporativo.

## 1. Dependência instalada

| Item | Valor |
|------|-------|
| Pacote | `playwright-core` **1.64.1** (exato, `--save-exact`) |
| Lockfile | `tools/web-runtime/package-lock.json` (pinado + integrity `sha512-BC4s8y6SEVA6Q1rSx...`) |
| Scripts de instalação | **nenhum** no pacote; instalado com `--ignore-scripts` (reforço) |
| Dependências transitivas | **zero** (só `playwright-core`) |
| Download de navegador | **nenhum** — `npx playwright install` **não** executado; Chromium/Firefox/WebKit não baixados |
| Cache `~/.cache/ms-playwright` | **pré-existente** (25/mai), **não** tocado por esta instalação (hoje) |
| Verificação prévia | `npm view` confirmou ausência de scripts e de deps antes de instalar |

## 2. Navegador utilizado

| Item | Valor |
|------|-------|
| Navegador | **Google Chrome 153.0.8010.47** (host, `/usr/bin/google-chrome-stable`) |
| Lançamento | headless, via `executablePath` (binário instalado), **sem `--no-sandbox`** nem flags de bypass |
| Contexto | isolado/efêmero (`newContext`), **Service Workers bloqueados** (`serviceWorkers:"block"`), descartado no `close()` |
| TLS | **enforced** (`ignoreHTTPSErrors:false`) — sem contornar política de certificado |

## 3. Evidências do fluxo visual (E1 — 10 passos, PASS)

1. `open` app sintética (status 200). 2. `snapshot` do DOM renderizado (contém `Sintetico`). 3. `screenshot` → artefato em disco (sha256, nome portável). 4. `click` (locator **semântico** `role=button name="Entrar"`). 5. `fill` e-mail/senha (locators `label`). 6. **mudança funcional** observada (`#result` = "logado: user@test.local"). 7. `network` (doc + `/app.js`; `set-cookie`/`x-auth-token` **[REDACTED]**). 8. `console` capturado. 9. **evidências correlacionadas** (action log `br-<ts>-<n>`, ts, status, ref de screenshot). 10. `close` libera recursos.

## 4. Testes executados

| Suíte | Passou | Bloqueado | Reprovou |
|-------|--------|-----------|----------|
| F1 `test.mjs` (HTTP inspection) | **19** | 0 | 0 |
| F2 `test-browser.mjs` (mock driver) | **16** | 0 | 0 |
| F2 `test-e2e.mjs` (**navegador real**) | **11** | 0 | 0 |
| Validador V1 | **127/127** | — | — |

> O teste antes BLOCKED (navegador real) agora **executa e passa**, pois a dependência foi aprovada/instalada — classificação honesta (não foi marcado PASS enquanto indisponível).

## 5. Resultado das verificações de segurança (cenários sintéticos)

| Cenário | Resultado |
|---------|-----------|
| Navegação fora do escopo | ✅ bloqueada antes do launch (E2) |
| **Redirect para destino não autorizado** | ✅ bloqueado — ver **Achado 1** (E3); `evilHits=0` |
| Subrecurso fora do escopo | ✅ abortado, evil não contatado, registrado como blocked (E4) |
| Requisição originada por JavaScript (`fetch`) | ✅ abortada (E5) |
| Pop-up / nova página fora do escopo | ✅ bloqueada (E6) |
| Service Workers (perfil inicial) | ✅ bloqueados (E7) |
| Limites / timeout / tamanho | ✅ (unit F2: maxActions, maxScreenshotBytes, maxNetworkEntries) |
| Cancelamento e liberação de recursos | ✅ `AbortSignal` encerra o navegador (E9) |
| Sanitização de cookies/tokens/dados | ✅ snapshot/network/console redigidos; `fill` loga só o comprimento — ver **Achado 2** (E8) |
| Encerramento inesperado do navegador | ✅ ação pós-morte falha de forma limpa, não mascarada como sucesso (E10) |
| **Não contatar fora do escopo** | ✅ `evilHits=0` ao fim de toda a bateria |

### Achados reais (identificados e mitigados — como solicitado, sem assumir cobertura do `context.route()`)

- **Achado 1 — `context.route()`+`continue()` NÃO bloqueia redirects auto-seguidos.** O Chromium segue o 3xx sem reinvocar o handler; o destino fora de escopo **era contatado**. **Mitigação:** o driver agora usa `route.fetch({maxRedirects:0})`, inspeciona o `Location` contra o Scope Guard **antes** de seguir, e aborta se fora de escopo. Validado em E3 (`evilHits=0`).
- **Achado 2 — redação de credencial não pegava chaves com prefixo** (`api_token`, `x-auth-token`): `\btoken` não casa dentro de `api_token`. **Mitigação:** redator ampliado para prefixos `_/-`. Validado em E8.
- **Teardown:** ações de `route` em voo durante cancel/crash lançavam `Route is already handled`; agora envoltas em `safeAbort/safeFulfill` (robustez, sem mascarar bloqueio).

## 6. Compatibilidade e limitações

- **Dev host (Linux):** Chrome lança sem `--no-sandbox`; fluxo completo verde.
- **Windows corporativo (NÃO validado — fora desta autorização):** o launch do navegador é **processo filho** e pode ser bloqueado por política → `browser.probe()` reporta `available:false` e o runtime **degrada para `http-inspect`** com `visual:false` explícito (E11). npm/registry sujeitos a política (pode ser *vendored*). EDR/telemetria observam automação headless (`telemetry-awareness`).
- **Limitações de cobertura a tratar no H1b:** a mitigação de redirect reemite a requisição via `route.fetch` (GET/navegação/subrecurso cobertos; **POST com corpo, streaming, WebSocket, downloads e diálogos** não foram validados a fundo). Pop-ups cobertos pela rota do contexto, mas o backend ainda **não expõe** páginas-filhas como handles (sessão única).

## 7. Matriz de capacidades (runtime, pós-instalação)

| Capacidade | `http-inspect` | `browser` (agora) |
|------------|----------------|-------------------|
| http_request/headers/redirects | ✅ | ✅ |
| static_html / network_metadata / referenced_resources | ✅ | ✅ |
| **dom_rendered / screenshot / javascript / interaction / console** | ❌ | **✅** |
| `select()` | — | `browser`, `visual:true` |

Fallback: ao provocar indisponibilidade controlada, `select()` → `http-inspect`, `visual:false`, com motivo explícito; `http.inspect` segue funcional (E11). **Falha de navegador nunca é mascarada como sucesso visual.**

## 8. Recomendação sobre o encerramento de H1a-F2

**Recomendo ENCERRAR o H1a-F2 como concluído no ambiente de desenvolvimento:** todos os critérios de aceite atendidos (fluxo visual completo; evidências DOM/screenshot/rede correlacionadas; sem vazamento de credenciais; sem requisições fora do escopo — `evilHits=0`; fallback HTTP funcional e identificado; Validador V1 127/127; sem regressão; compat/limitações documentadas). Dois achados reais foram corrigidos. **Pendência externa:** validação no **Windows corporativo** permanece fora desta autorização (etapa própria).

## 9. Pré-requisitos concretos para H1b (Multi-Session Runtime)

1. **Contrato de sessão** que mantenha compatibilidade com a sessão única atual (não quebrar F2).
2. **Isolamento por principal** (owner/cross/noauth) via `browserContext` dedicado — base para AuthZ/IDOR.
3. **Reutilização de sessão por referência** (`storageState` handle), **sem segredo no contexto do LLM** (Rule 6).
4. **Controle de concorrência e limites por sessão** + cancelamento em lote.
5. **Fechar as lacunas de cobertura** do Achado/limitações: POST com corpo, WebSocket, downloads, diálogos, e exposição controlada de pop-ups como handles.
6. **Autorização específica para Windows corporativo** (launch de processo) antes de prometer o visual lá.

**Não iniciar H1b, concorrência ou Caido.** Aguardando aprovação.
