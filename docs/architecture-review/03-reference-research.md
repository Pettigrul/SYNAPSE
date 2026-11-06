# 03 — Pesquisa de Referência (Etapa B)

> **Método:** leitura seletiva (read-only) de README, manifests e, quando possível, árvore de código via GitHub API. Nenhum repositório foi clonado, instalado ou executado.
> **Procedência da evidência:** cada capacidade abaixo carrega a tag da pesquisa — **[CODE-PROVEN]** (visto em código/manifest), **[DOCUMENTED]** (só em README/docs), **[PROPOSED]** (roadmap/issue). Os perfis vêm de pesquisa documental de agentes; **não foram re-verificados por execução no ambiente corporativo** — ver a ressalva de compatibilidade no doc 06. Contagens de estrelas/licenças são do GitHub API na data da coleta (2026-11-04) e podem variar.

---

## 1. Visão geral do campo

Três famílias relevantes, mais plataformas de orquestração genérica:

1. **Harnesses ofensivos autônomos** (strix, pentagi, PentestPi, omega, cyber-harness) — agentes que rodam tools reais num sandbox.
2. **Ecossistema Pi Agent** (pi-mono/core, pi-agent-harness, pi-harness×2, pi-subagent, pi-skill-pentesting) — harness minimalista Node/TS extensível por skills/extensions/packages.
3. **Integrações Caido** (caido-mcp-server, VibeHacking, shift, Ebka, pi-caido) — ponte de agente↔proxy web para captura/replay/sessão HTTP.
4. **Orquestração genérica** (Nebula) — plataforma multiagente não-ofensiva, relevante por um padrão arquitetural (identidade vs runtime).

---

## 2. Harnesses ofensivos

### 2.1 usestrix/strix — Python ≥3.12 · Apache-2.0 · ~73k★ (de longe o mais adotado)
- **Arquitetura:** "Graph of Agents" (recon/exploitation/post-ex em paralelo, compartilhando findings). Toolkit **[CODE-PROVEN]** em `strix/tools/`: proxy, agent_browser, agents_graph, shell, mcp, reporting, threat_model, coverage, notes, todo, apply_patch, **load_skill**, output_store. `npx skills add` instala 9 skills **[DOCUMENTED]**.
- **HTTP/sessão:** **Caido** como proxy de interceptação (`caido-sdk-client` em pyproject **[CODE-PROVEN]**). Grey-box via flag de credenciais; sem session manager dedicado **[DOCUMENTED]**.
- **IDOR/race:** IDOR e broken access control listados; race sob business-logic — **sem método documentado [DOCUMENTED]**.
- **Validação:** findings confirmados com PoC real + CVSS (`cvss` dep [CODE-PROVEN]) + OWASP.
- **Evidência:** `strix_runs/<run>/` + viewer local `strix view`.
- **Windows/deps:** **Docker obrigatório** (sandbox puxado no 1º run) + chave LLM. Windows não endereçado. **541 issues abertas** (alta rotatividade).

### 2.2 vxcontrol/pentagi — Go + React + Postgres/pgvector · MIT · ~33k★
- **Arquitetura:** multiagente pesado (13 papéis: primary/pentester/coder/searcher/reflector/planner…). Modelo de dados Flow→Task→SubTask→Action→Artifact/Memory. Prompts editáveis na UI. **Plugins + MCP são Enterprise-only.**
- **Orquestração:** fila assíncrona, microserviços escaláveis, limites de tool-call por tipo de agente, 12+ flows concorrentes (exemplo) **[DOCUMENTED]**.
- **HTTP/sessão:** **não cobre** captura/replay HTTP; `PROXY_URL` é só egress do backend. Sem session de alvo.
- **Windows/deps:** instalador Windows existe **[DOCUMENTED]**, mas exige **Docker/Podman + Postgres + stack de observabilidade** — footprint enorme.

### 2.3 weidutech/PentestPi — Python + Node (Pi) · Apache-2.0 · ~34★
- **Arquitetura:** deliberadamente **single-agent** + Observer leve (cadência 30s); subagentes opcionais read-only via `pi-subagents`. Toolkit offline em `tools/bin/` (nmap, feroxbuster, jwt_tool…) + SecLists embutido.
- **HTTP:** sidecar proxy grava `raw_traffic.http`; exporta curl para PoC. Sem modify/replay in-proxy.
- **Validação:** State v1 separa fatos verificados de hipóteses; checker script.
- **Windows:** **WSL2 only — Windows nativo NÃO suportado.** Repo pesado (binários + wordlists).

### 2.4 youmulijiang/omega — TypeScript/Node ≥22 · MIT · ~1★ (muito novo)
- **Arquitetura:** extensão `omega-core` sobre o Pi (upstream intacto). Subagentes: security-worker (read-only default), goal-skeptic, explore, workflow-author. Prompts de segurança "composable" carregados sob demanda.
- **HTTP:** `http_request`, `http_replay`, `diff` de respostas **[DOCUMENTED]**. Sem proxy; Caido/Burp só como badge, **não integrado**.
- **Browser:** Chrome DevTools Protocol + extensão dirigindo a sessão logada do usuário.
- **Validação:** security-worker com PoC de impacto mínimo + skeptic separado. Separa fatos de inferências.
- **Windows:** suportado (`.bat`/`.ps1`), **puro Node, sem Docker**.

### 2.5 chainreactors/cyber-harness — Go (binário único) · AGPL-3.0 · ~380★
- **Arquitetura:** "tudo é extensão"; um ciclo de extensão cobre reasoning/tool-exec/knowledge/observation/collaboration. Entrypoints aiscan/cyber-audit/cyber-web.
- **HTTP/browser:** proxy routing (standard); browser automation na edição "full" **[DOCUMENTED]** (sem detalhe).
- **Evidência:** eventos→JSONL; Web Hub com SQLite.
- **Windows:** suportado (`.exe`, passos PowerShell); **binário Go único, sem Docker** — footprint leve. **AGPL-3.0** (copyleft — atenção a uso comercial).

### 2.6 skyvanguard/awesome-ai-pentesting — lista curada (não é harness)
- Índice de links MIT, útil como mapa do campo; aponta padrões (Caido/Playwright, Burp MCP server, sandboxes Kali/Docker). Não é componente adotável.

---

## 3. Ecossistema Pi Agent

**Achado transversal:** todo o ecossistema é **Node.js/TS puro (Node ≥22.19), sem MCP no core.** Subagentes = **processos filhos `pi` isolados** (não threads). O "Pi Agent" é `@earendil-works/pi-coding-agent`, agente de terminal minimalista com 4 tools built-in, estendido por skills/prompts/extensions/packages.

### 3.1 badlogic/pi-mono (core) — MIT
- Harness minimalista: "ships powerful defaults but **skips sub-agents and plan mode**" (adicionados por package). TUI + print/JSON + RPC + SDK TS. **Windows forte:** instalador PowerShell (`irm pi.dev/install.ps1`), `pi-test.ps1/.bat`, Node bundlável. Supply-chain endurecido (pins exatos, lockfile, `--ignore-scripts`).

### 3.2 baryonlabs/pi-agent-harness — Apache-2.0 · ~25★ ← **o análogo estrutural direto**
- **É um port do plugin "Harness" do Claude Code para o Pi.** Convenções **[CODE-PROVEN]**: Agents = `.pi/agents/*.md` (frontmatter `tools`/`model`); **Skills = `.pi/skills/*/SKILL.md` (padrão Agent Skills)** com `references/` para docs de suporte; Prompts = `.pi/prompts/*.md` como `/commands`; `_workspace/` para handoff.
- **Orquestração (a mais forte do conjunto):** extensão `subagent` com 3 modos — **single / parallel (até 8 tasks, 4 concorrentes) / chain** (passa `{previous}`). Cada delegação = processo isolado com janela de contexto própria.
- **Progressive disclosure explícito**; detalhe diferido para `references/`.
- **Portabilidade declarada:** "SKILL.md files largely portable; diretórios de skill do Claude carregáveis via `settings.json` do Pi." **Esta é a ponte de portabilidade.**

### 3.3 MinhDuyDEV/pi-harness — MIT · ~1★ (código maduro, adoção ~zero)
- Skills `.pi/skills/*/SKILL.md` on-demand; 8 perfis de agente; **progressive loading em camadas** (`AGENTS.md` → `APPEND_SYSTEM.md` → skills → contratos de agente). MCP só indireto (Exa para busca). Risco de mantenedor único.

### 3.4 a-conte/pi-harness — TS/Bun · licença não exibida · ~2★
- **Multi-runtime explícito:** entrypoints **Pi E Codex** com vocabulário de comando compartilhado; `runner: pi|codex` por agente; prompts de handoff Claude incluídos. **O único do conjunto que mira múltiplos runtimes.** Mas exige **Bun + just** (fraco para Windows puro). Muito experimental.

### 3.5 badlogic/pi-subagent — licença não exibida · ~265★
- Subagentes observáveis/persistentes; brief via `--prompt`+`--file`; allowlist de tools `--tools`; **nested subagents desabilitados**. **Exige tmux → bloqueia Windows nativo (precisa WSL).**

### 3.6 @soulofzephir/pi-skill-pentesting (pi.dev) — MIT · 0 deps
- Skill de pentest para o Pi: `skills/pentesting/{SKILL.md, checklists/, tools/(header-scan.sh/.ps1, security-scan.ps1), reports/template.md}`. **Scripts cross-platform (.sh + .ps1).** Mas **recomenda ferramentas externas** (Nuclei, ZAP, SQLMap, Nmap…) — não as embute. Aviso da própria pi.dev: "pacotes Pi executam código; revise a fonte."

---

## 4. Integrações Caido (HTTP / sessão / IDOR)

**Contexto:** Caido roda em Windows/macOS/Linux (instalador desktop). Plugin puro-in-Caido herda o Windows; a pergunta por repo é se a peça *do lado AI* (MCP server) também roda no Windows.

### 4.1 c0tton-fluff/caido-mcp-server — Go · MIT · ~138★ ← **melhor fit para sessão autenticada + IDOR/BOLA**
- **MCP server externo** (stdio) falando GraphQL com o Caido local. **70 tools + 6 resources read-only [DOCUMENTED].**
- **Sessão:** **cookie jar RFC 6265 por sessão** (armazena/reusa `Set-Cookie`) — melhor do conjunto. Token via `CAIDO_ACCESS_TOKEN` ou OAuth device-flow (0600, auto-refresh). Headers sensíveis redigidos por default.
- **IDOR/BOLA:** **explícito** — batch envia o mesmo request **sob múltiplos tokens** com padrões `owner`/`cross`/`noauth` + `caido_diff_responses`. **Melhor suporte multi-principal dos cinco.**
- **Race:** via Caido Replay Pipelines (0.59+) + sender raw last-byte-sync.
- **Windows:** **binários pré-compilados Windows/macOS/Linux.** Só precisa Caido + token (sem Node).

### 4.2 vvvvvvvvvvel/VibeHacking — TS plugin · MIT · ~31★ ← **melhor "MCP dentro do Caido"**
- **Plugin Caido que roda um MCP server internamente** (Streamable HTTP, localhost). Tool surface **[CODE-PROVEN]** (`mcp-tools/`: requests, raw-request, replay, automate, scope, sitemap, findings, filters, env, hosted-file). **Gating humano embutido:** cada tool `auto`/`confirm`/`disabled` (`confirm-actions.ts`). **Sem runtime Node separado em runtime** → bom candidato Windows. Exige Caido ≥0.59.
- Sessão fraca; IDOR não mencionado.

### 4.3 caido-community/shift — TS/Vue plugin · MIT · ~59★ (semi-oficial)
- Camada de AI-assist interativa no Replay + framework "Shift Agents" (`custom-agents`/`skills` [CODE-PROVEN]). **Depende de backend cloud do vendor + modelos AI de terceiros** → consideração de egress/privacidade em engajamento autenticado. Não faz history/sessão/IDOR.

### 4.4 Slonser/Ebka-Caido-AI — Node · GPL-3.0 · ~80★ (estagnado ~5 meses)
- Plugin + MCP server para Claude Desktop/Codex. Fluxo OAuth (`authenticate`→`check_authentication`). Replay collections/sessions, findings CRUD. **GPL-3.0** (implicações de redistribuição).

### 4.5 KanyCrew/pi-caido — TS · MIT · ~1★ (evitar por ora)
- Cliente MCP externo p/ Pi conectando ao MCP nativo do Caido + roteando HTTP do Pi pelo proxy. Adoção mínima, README inconsistente, fino em sessão/IDOR.

---

## 5. Orquestração genérica — reforia/Nebula (AGPL-3.0 · ~5★, research-grade)
Não é ferramenta de segurança. Relevante por **um padrão:** "Decoupling Agent Identity from Runtime" — a persona do agente é separada do runtime CLI intercambiável (registry de adaptadores: `claude-cli`, `codex`, `gemini`, `opencode`). Executor com **fila serializada por contexto** (não massivamente paralelo). Skills = blobs Markdown injetados no working dir. Secrets como refs `{{KEY}}` (o agente vê o nome, não o valor). **Validação do desenho de adaptador de runtime** (doc 07), mas sem browser/HTTP/evidência de pentest.

---

## 6. strix issue #777 — validação externa do desenho-alvo [PROPOSED]
Issue ABERTA (0 comentários, sem PR): "Native multi-account authentication profiles, session renewal, and Caido integration". Propõe **exatamente** o que o doc 07 desenha como *Authenticated Session Manager* + *Authorization Testing Capability*:
- Perfis de auth nomeados/persistidos (`user_a`, `user_b`, `admin`, `tenant_b`), sessão isolada por perfil, reauth em expiração.
- **Higiene de credencial:** agente referencia conta **por nome de perfil, nunca recebe credencial crua** no prompt — idêntico à Rule 6 do gate do HackBot.
- Replay do mesmo request sob perfis diferentes + comparação (IDOR/privesc/cross-tenant); troca de perfil **substitui** (não mescla) contexto de auth.
- Caido: replay sob perfil com sessão válida auto-aplicada; filtrar tráfego por perfil.

**Leitura:** o líder de adoção do campo (strix) ainda **não tem** essa capacidade — está só proposta. O HackBot pode chegar lá primeiro, reusando `caido-mcp-server` como substrato. É uma janela de diferenciação, não um risco de "já existe".

---

## 7. Conclusões da pesquisa (base para o doc 04)

1. **Padrão SKILL.md é a lingua franca** entre Claude Code e Pi (via pi-agent-harness). Migrar `agents/` → skills no padrão `*/SKILL.md` + `references/` compra portabilidade quase de graça.
2. **Native-tooling é diferencial único** — nenhum concorrente opera sem binários instalados; a maioria exige Docker/WSL/tmux, reprovando no Windows corporativo.
3. **Caido (`caido-mcp-server`) é o substrato pronto** para HTTP/sessão/IDOR/race, com binário Windows e MIT — *se* o ambiente corporativo permitir rodar o binário e o Caido (ver doc 06).
4. **IDOR/BOLA e race conditions são lacuna do campo** — oportunidade de capability diferenciada, validada pela issue #777 do próprio strix.
5. **Orquestração:** o modelo de "subagente = processo isolado + brief" (pi-agent-harness, pi-subagent, omega) é idêntico ao que o HackBot já faz textualmente. Nada novo a construir; formalizar o contrato basta.
6. **Validação:** o contrato de verificação do HackBot é mais rigoroso que o de quase todos (só PentestPi/omega chegam perto). Preservar.
