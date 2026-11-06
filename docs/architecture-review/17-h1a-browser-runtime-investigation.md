# 17 — H1a-F0: Investigação Técnica do Browser Runtime

> **Investigação arquitetural, SEM implementação.** Nada foi instalado, baixado ou iniciado; nenhum teste contra alvo externo. Objetivo: avaliar como dar ao HackBot navegação visual e interação com aplicações, sob o baseline do **Windows corporativo restrito**.
> **Baseline host (verificado, read-only):** `chromium` e `google-chrome-stable` presentes; `playwright` (user-local) e `npx` presentes. Isso é o **laboratório**; não presumir o mesmo no Windows corporativo.

---

## 1. Baseline corporativo (premissas, não presumir facilidades)

- Node.js/npm **disponíveis**; Docker/WSL2 **não**; **sem admin**.
- Execução de binários/processos externos **sujeita a bloqueio** (launch de navegador pode falhar).
- **Não presumir** CDP habilitado, porta de debug remoto aberta, servidor local permitido ou MCP liberado.
- Operação possivelmente **offline parcial**.

> Consequência de projeto: Browser Runtime é uma **capability opcional com fallback nativo obrigatório** — nunca pré-requisito. Alinha-se à doutrina existente (MCP opcional → probe nativo).

---

## 2. Opções investigadas

### (1) CDP sobre Chrome/Edge já instalado
Dirigir o navegador instalado via Chrome DevTools Protocol (WebSocket), lançando-o com `--remote-debugging-port` ou anexando a uma instância já aberta em modo debug.
- **Capacidades:** completas (DOM, screenshot, console, Network domain, contextos/targets).
- **Dependências:** cliente CDP — pode ser um WS mínimo em Node stdlib (`ws` nativo? Node não traz WS cliente; usar `chrome-remote-interface` npm) **ou** o próprio `node:http`+upgrade manual.
- **Riscos corporativos:** lançar o navegador com flag de debug é um **processo externo** (pode ser bloqueado); a porta de debug localhost pode ser barrada por política; anexar ao navegador do usuário mistura sessão real (perigoso — Rule 6).
- **Esforço:** médio (gerenciar lifecycle do processo + protocolo).
- **Portabilidade:** alta (Node, multiplataforma).

### (2) Playwright dirigindo o navegador EXISTENTE
`playwright-core` com `channel: "chrome"`/`"msedge"` usa o navegador **instalado** (sem baixar Chromium). API madura.
- **Capacidades:** as mais ricas — DOM, screenshot, `console` events, `request`/`response` (Network), **browser contexts isolados**, `storageState` (export/import de sessão).
- **Dependências:** `playwright-core` (npm; **não** baixa browser) + um canal de navegador utilizável. `playwright` (pacote cheio) baixaria navegadores → **evitar**; usar `playwright-core`.
- **Riscos corporativos:** ainda **lança processo de navegador** (pode ser bloqueado); npm install sujeito à política de registry; tamanho do pacote.
- **Esforço:** baixo (API pronta, bem documentada).
- **Portabilidade:** alta (Node, Win/Linux/mac).

### (3) Chrome DevTools MCP
Servidor MCP (`chrome-devtools-mcp`) expõe controle de browser como ferramentas MCP ao agente.
- **Capacidades:** DOM/screenshot/console/network via tools MCP.
- **Dependências:** servidor MCP (processo local + Node) + navegador; "MCPs sujeitos a restrição".
- **Riscos:** processo/porta local; menos controle fino; versão externa.
- **Esforço:** baixo (off-the-shelf).
- **Portabilidade:** **a maior entre runtimes** — Claude Code, Pi e Antigravity **falam MCP**. Uma integração, três runtimes.

### (4) Alternativas nativas em Node.js (sem navegador)
`node:fetch`/`node:http(s)` para HTTP; `jsdom`/`cheerio` (npm) para parsear HTML estático.
- **Capacidades:** HTTP e DOM **estático**; **sem** execução de JS, **sem** screenshot, **sem** console, **sem** SPA renderizada.
- **Dependências:** nenhuma (fetch nativo) ou leve (`cheerio`).
- **Riscos:** baixíssimos (sem processo de navegador).
- **Esforço:** muito baixo.
- **Portabilidade:** máxima. **É o fallback** — equivale ao probe `Invoke-WebRequest` já existente.

---

## 3. Matriz comparativa

| Critério | (1) CDP installed | (2) Playwright-core + canal | (3) Chrome DevTools MCP | (4) Nativo Node/PS |
|----------|-------------------|------------------------------|--------------------------|---------------------|
| Compat. Windows corporativo | ⚠️ média (launch+porta) | ⚠️ média (launch+npm) | ⚠️ média (MCP+launch) | ✅ alta |
| DOM renderizado (JS) | ✅ | ✅ | ✅ | ❌ (só estático) |
| Screenshot | ✅ | ✅ | ✅ | ❌ |
| Console | ✅ | ✅ | ✅ | ❌ |
| Captura de requests | ✅ (Network) | ✅ (events) | ✅ | ⚠️ só as que você emite |
| Sessão autenticada reutilizável | ✅ (manual) | ✅ (`storageState`) | ⚠️ depende do server | ⚠️ cookies manuais |
| Isolamento multi-contexto | ✅ (targets) | ✅ (contexts) | ⚠️ depende | ⚠️ manual |
| Dependências novas | média (`chrome-remote-interface`) | `playwright-core` | servidor MCP | nenhuma/leve |
| Processo externo (risco de bloqueio) | ✅ sim | ✅ sim | ✅ sim | ❌ não |
| Esforço de implementação | médio | **baixo** | baixo | muito baixo |
| Portabilidade entre runtimes | alta (código) | alta (código) | **máxima (MCP)** | máxima |
| Controle/robustez | alto | **alto** | médio | — |

---

## 4. Arquitetura recomendada — capability com backends plugáveis

Um **Browser Runtime** com **contrato estável** e **backends em ordem de prioridade**, selecionados por um *availability probe* (como o `RUNNING_ON`/Runtime Availability já existente). Nenhum backend é obrigatório.

```
Browser Runtime (contrato único)
  └─ seleção por availability probe (sessão):
     1. MCP (chrome-devtools-mcp)   ← se MCP + navegador disponíveis  [melhor p/ Pi+Antigravity+Claude]
     2. playwright-core + canal      ← se npm + navegador + launch permitidos  [melhor API/controle]
     3. CDP-direct (anexar)          ← se já há navegador com debug port
     4. Nativo (fetch/Invoke-WebRequest) ← SEMPRE; sem render/screenshot (degradação documentada)
```

- **Decisão anti-overengineering:** não construir automação de browser própria; preferir MCP (portável) e playwright-core (controle), com fallback nativo. O contrato é o mesmo; o backend é intercambiável (mesma filosofia de (5) HTTP no doc 07).
- **Sem download de navegador, sem Docker, sem admin.** Tudo degrada para nativo.

---

## 5. Contratos das novas ferramentas (propostos)

Todas sob as Execution Policies: ações sobre o alvo são **Classe A** (gate + Risk Card); render read-only de alvo autorizado ainda assim é gated por engajamento. Rule 6 (segredo nunca em contexto) e evidence-hygiene (redação) aplicam-se.

| Ferramenta | Assinatura | Classe | Notas |
|-----------|-----------|--------|-------|
| `browser.available()` | `→ {backend, caps[]}` | R | probe; informa degradação |
| `browser.open(url, {context?})` | `→ pageHandle` | A | alvo deve estar em `scope.md` |
| `browser.dom(page)` | `→ {html, text}` | R(sobre page já aberta) | para prova grounded |
| `browser.screenshot(page)` | `→ path` | R | roteado por evidence-hygiene (redação) |
| `browser.console(page)` | `→ logs[]` | R | detecta erros/CSP |
| `browser.network(page)` | `→ requests[]` | R | correlaciona com (5) HTTP |
| `browser.prove(payloadRef, page)` | `→ evidence` | A | prova de XSS/efeito; **nunca** payload ofensivo contra alvo não autorizado |
| `session.save(context)` | `→ handle` | R | **referência**, não segredo (Rule 6) |
| `session.use(handle)` | `→ context` | R | renovação se expirada |
| `context.new({profile?})` | `→ context` | R | isolamento (liga ao Session Manager H1 cap.6/7) |

Contrato consumido: (5) HTTP (correlação de requests), (6) Session (contexto autenticado), (9) Evidence (persistência/redação), (10) Policies (gate/Rule 6).

---

## 6. Reutilização de sessão e isolamento de contexto

- **Reutilização controlada (item 6):** `storageState` (Playwright) ou cookie jar por contexto (CDP). **Rule 6:** o handle de sessão guarda *referência/modo de renovação*, não o segredo em claro no contexto do LLM. Reusar **um contexto dedicado**, nunca o perfil principal do usuário.
- **Isolamento (item 7):** um *browser context* por principal (owner/cross/noauth) — base física para o **Authorization Testing (IDOR/BOLA)** e o **Session Manager** do H1 (doc 07 cap. 6/7). Troca de contexto **substitui**, não mescla, a autenticação.

---

## 7. Integração Pi / Antigravity

- **Portável (recomendado): backend MCP.** Claude Code, Pi (`pi mcp`) e Antigravity consomem MCP — uma integração serve os três. `chrome-devtools-mcp` como ponto de partida, com fallback nativo.
- **Pi Extension (item 8):** alternativa — empacotar o backend (playwright-core/CDP) como extensão Pi (`pi install`), expondo as ferramentas do §5. Útil se MCP for bloqueado mas extensões não.
- **Antigravity (item 9):** via MCP (opcional). Sem runtime extra além do servidor MCP.
- **Conhecimento não duplicado:** o Browser Runtime é capability/ferramenta, não catálogo; as skills continuam fonte única.

---

## 8. Plano incremental de implementação (para H1a, sob aprovação)

| Fase | Entrega | Depende de |
|------|---------|-----------|
| **F0** (esta) | Investigação + matriz + arquitetura + contratos (este doc) | — |
| **F1** | Contrato `browser.*` + `browser.available()` + **fallback nativo** (fetch/Invoke-WebRequest) — 100% nativo, sempre funciona | aprovação H1a |
| **F2** | Backend **playwright-core + canal instalado** no **laboratório**; teste de aceitação no Windows corporativo (launch permitido?) | F1 + `playwright-core` |
| **F3** | Backend **MCP** (chrome-devtools-mcp) p/ portabilidade Pi/Antigravity; condicional a MCP liberado | F1 |
| **F4** | Session reuse + context isolation → liga ao Session Manager/AuthZ (H1 cap.6/7) | F2/F3 |

Ordem reflete risco: o fallback nativo (F1) entrega valor sem processo externo; os backends ricos (F2/F3) só entram se o ambiente permitir.

---

## 9. Critérios de aceite

**Laboratório:**
- Cada backend disponível captura DOM, screenshot, console e network numa página de teste local; contextos isolados comprovados; `session.save/use` por referência.
- `browser.available()` reporta corretamente o backend e as capacidades.
- Fallback nativo produz DOM estático + requests emitidos quando nenhum navegador está disponível.

**Windows corporativo:**
- `browser.available()` detecta corretamente o que é permitido (launch de processo, porta de debug, MCP) **sem travar**.
- Se launch/MCP bloqueados → **degrada para nativo sem erro** (apenas perda de render/screenshot, documentada como `[DOCUMENTED]`/degradado).
- **Zero** download de navegador, zero Docker, zero admin; npm instalável pela política vigente (ou dependência *vendored*); **nenhum segredo persistido** (Rule 6); screenshots roteados por evidence-hygiene.
- EDR/telemetria: automação de navegador é observável → tratar sob `telemetry-awareness` quando em alvo sensível.

---

## 10. Riscos e recomendação

- **Risco principal:** launch de processo de navegador e/ou porta de debug **bloqueados** no corporativo — por isso o fallback nativo é mandatório e os backends ricos são condicionais a teste de aceitação.
- **Recomendação:** adotar a **capability com backends plugáveis** (§4), implementar **F1 (nativo) primeiro**, priorizar o **backend MCP** para portabilidade e o **playwright-core** para controle no laboratório. Não construir automação própria. Browser Runtime permanece **independente do Caido** (doc 08 §H1a) e opcional.

**Esta fase não implementa nada.** Solicito aprovação para iniciar o H1a (a partir da F1 nativa).
