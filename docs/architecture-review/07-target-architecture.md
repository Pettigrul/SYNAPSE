# 07 — Arquitetura-Alvo (Etapa D)

> **Princípio reitor (anti-overengineering):** estender o que já existe; não criar infra nova sem necessidade demonstrada. Cada componente abaixo é ou um **rótulo para algo que o HackBot já faz** (formalizado), ou uma **extensão incremental com fallback nativo**. Nenhum registry, DB ou mecanismo de sincronização é introduzido.
> **Contratos, não implementações:** cada componente define *o que* oferece e *o que* consome. A implementação fica para o doc 10 e para aprovação.

---

## 1. Visão geral — o mesmo sistema, reembalado

```
┌─────────────────────────────────────────────────────────────────────┐
│  SKILL.md (roteador portável)  — trigger → workflow/skill            │
├─────────────────────────────────────────────────────────────────────┤
│  (10) EXECUTION POLICIES  [sempre-ativas, injetadas em todo brief]   │
│   authorization-gate · verification-contract · native-tooling        │
├───────────────┬───────────────────────────────┬─────────────────────┤
│ (1) BASE DE   │  WORKFLOWS (flows-*)           │  AGENTS (efêmeros)   │
│ CONHECIMENTO  │  scope·recon·dispatch·report   │  brief-driven        │
│ COMPARTILHADA │  ·status·intake·forge·proxy    │  (Flow 9/12)         │
│  skills/      │                                │                      │
│  tools/       │                                │                      │
├───────────────┴───────────────────────────────┴─────────────────────┤
│  CAPABILITIES (extensões incrementais, todas com fallback nativo)    │
│   (4)Browser  (5)HTTP  (6)Session  (7)AuthZ-Test  (8)Concurrent       │
│   (9) Evidence Management                                            │
├─────────────────────────────────────────────────────────────────────┤
│  ADAPTERS:  (2) Pi Agent   (3) Antigravity   [+ Claude Code]         │
├─────────────────────────────────────────────────────────────────────┤
│  ESTADO DE ENGAJAMENTO (inalterado): scope·session·toDoList·cc*·dirs │
└─────────────────────────────────────────────────────────────────────┘
```

**Legenda de origem:** (1)(2)(3)(9)(10) **já existem** no HackBot — formalizar. (4)(5) existem parcialmente (probe nativo + MCP opcional) — estender. (6)(7)(8) são as **extensões novas** com maior valor, e as de maior risco de overengineering — por isso ficam atrás de fallback nativo e de gate de necessidade.

---

## 2. Componentes e contratos

### (1) Base de Conhecimento Compartilhada — *já existe; formalizar*
- **O que é:** `skills/` (conhecimento+raciocínio, padrão `SKILL.md`+`references/`) + `tools/` (determinísticas) + `intake/` (ingestão) + `pattern-index` (roteamento). Fonte única da verdade.
- **Contrato oferecido:** `resolve(keyword) → skill(s)`; `load(skill) → Index`; `load(skill, tags) → corpos T[N]`. Progressive disclosure preservado.
- **Contrato consumido:** vocabulário de tags (`intake/tags.md`), formato de técnica (`template-technique`).
- **Invariante:** corpos de técnica verbatim (doc 05 §5). Nenhuma duplicação entre plataformas.

### (2) Adaptador Pi Agent — *já há fundação; completar*
- **O que é:** arquivo fino que registra `skills/` no `settings.json` do Pi e mapeia o dispatch do HackBot para o modelo de extensão/subagente do Pi (processos filhos isolados).
- **Contrato oferecido:** `dispatch(brief) → child pi process`; `sequential_phase(brief)` quando sem paralelo.
- **Contrato consumido:** (1) base de conhecimento; (10) policies embutidas no brief.
- **Evidência de viabilidade:** baryonlabs/pi-agent-harness ("skills do Claude carregáveis no Pi via settings.json").

### (3) Adaptador Antigravity — *já há fundação (AGENTS.md); completar*
- **O que é:** gera/liga `AGENTS.md` do mesmo template; mapeia dispatch para o modelo do Antigravity.
- **Contrato:** idêntico a (2); runtime-agnóstico por embedding de brief.
- **Nota:** conhecimento NÃO é copiado — o adaptador aponta para `skills/`.

### (4) Browser Capability — *parcial (MCP opcional); estender com fallback*
- **O que é:** navegação/visualização da app para prova grounded (XSS, fluxo autenticado).
- **MVP:** MCP opcional (`chrome-devtools`/`firecrawl`) **como hoje**; fallback a `Invoke-WebRequest`/JS-pull nativo quando ausente.
- **Contrato oferecido:** `render(url, session?) → DOM/screenshot/console`; `prove_xss(payload, url) → evidence`.
- **Contrato consumido:** (6) Session para contexto autenticado; (9) Evidence para persistir.
- **Anti-overengineering:** não construir automação de browser própria; usar MCP quando houver, degradar quando não.

### (5) HTTP Capability — *já existe (probe nativo); formalizar + ponto de integração*
- **O que é:** captura/manipulação HTTP. Hoje: `Invoke-WebRequest`/`Invoke-RestMethod`/`System.Net`/`curl.exe` + proxy opcional (`flows-proxy`).
- **MVP:** probe nativo (atual). **MVP+1 (condicional):** integração **Caido via `caido-mcp-server`** (doc 03/04) para history/replay/diff — *só se o ambiente permitir* (doc 06).
- **Contrato oferecido:** `send(request, session?) → response`; `replay(id, overrides) → response`; `diff(respA, respB) → delta`; `capture() → history`.
- **Contrato consumido:** (10) `PROXY`/`DELAY`; (6) Session; (9) Evidence.
- **Invariante:** o contrato é o mesmo com probe nativo ou Caido — o backend é intercambiável atrás da interface.

### (6) Authenticated Session Manager — *novo; extensão de maior valor*
- **O que é:** perfis de autenticação nomeados e persistidos, com sessão isolada por perfil e renovação. Validado externamente por strix issue #777 [PROPOSED].
- **Contrato oferecido:** `profiles() → [name]`; `request_as(profile, request) → response` (aplica sessão válida do perfil, renova se expirada); `isolate(profile)` (troca substitui, não mescla, o contexto de auth).
- **Contrato consumido:** credenciais **por referência, nunca por valor** (Rule 6 do gate) — perfil guarda *como obter* a sessão (via host/credential store), não o segredo. (5) HTTP para enviar; (10) gate (auth é Classe A).
- **MVP:** `session.md ## Credentials` já guarda refs; formalizar como perfis nomeados em `scope.md`/`session.md` com campo de renovação. **MVP+1:** cookie jar automático via `caido-mcp-server` (melhor suporte do campo, doc 03).
- **Anti-overengineering:** não é um cofre de segredos novo (Rule 6 proíbe armazenar segredo). É um registro de *perfis* e de *como renovar*, não de valores.

### (7) Authorization Testing Capability (IDOR/BOLA) — *novo; lacuna do campo*
- **O que é:** teste sistemático de autorização horizontal/vertical/cross-tenant. Hoje: `web-testing` T5 (nativo, manual). Lacuna confirmada no campo (doc 04 §4).
- **Contrato oferecido:** `probe_object(endpoint, owner_profile, other_profile) → {owner_result, cross_result, verdict}` com os padrões `owner`/`cross`/`noauth`.
- **Contrato consumido:** (6) Session (dois+ perfis); (5) HTTP (envio comparativo); (9) Evidence; (10) gate.
- **MVP:** workflow nativo sobre (5)+(6) — mesmo request sob dois perfis + diff (padrão do `caido-mcp-server`, replicável nativamente). **MVP+1:** batch multi-token via Caido.
- **Invariante:** dois-principal obrigatório (nunca declarar IDOR sem comparação owner-vs-cross; já é regra em `web-testing` T5).

### (8) Concurrent Testing Capability (race conditions) — *novo; lacuna do campo*
- **O que é:** disparo concorrente para TOCTOU/limit-overrun. Hoje: `code-review` T10 (PS jobs) + `chaos` T5.
- **Contrato oferecido:** `fire_concurrent(request, n, sync_mode) → [responses]`; `detect_anomaly(responses) → signal`.
- **Contrato consumido:** (5) HTTP; (6) Session; (9) Evidence; (10) gate + `DELAY` (race é Classe A ruidosa).
- **MVP:** Tier-1 Python (`concurrent.futures`) ou PS jobs — o HackBot já tem o padrão. **MVP+1:** Caido Replay Pipelines / last-byte-sync (doc 03).
- **Anti-overengineering:** é um blueprint do forge + workflow, não um motor novo.

### (9) Evidence Management — *já existe; formalizar*
- **O que é:** captura, redação, prova por hash, organização em dirs numerados; política never-delete.
- **Contrato oferecido:** `capture(artifact) → path`; `redact(artifact) → safe_artifact` (Rule 6); `prove(resource) → hash/count`; `route(output) → bucket` (routing rules de `template-files`).
- **Contrato consumido:** (10) gate (Rule 6 redação de segredo); `evidence-hygiene` skill.
- **Invariante:** cross-reference obrigatório a partir de `cc*`; never-delete (→ `8-Archive`/`9-Trashcan`).

### (10) Execution Policies — *já existe; promover a camada explícita*
- **O que é:** os 3 docs imutáveis como **policy layer sempre-ativa e injetada em todo brief**: authorization-gate (o quê pode rodar e sob qual consentimento), verification-contract (toda claim earns live evidence), native-tooling-doctrine (Tier 0 first, banned tools).
- **Contrato oferecido:** `classify(action) → R|A`; `gate(action) → RiskCard + consent`; `verify(claim) → VERIFIED|UNVERIFIED`; `tier_check(technique, host) → allowed?`.
- **Contrato consumido:** por **todos** os outros componentes e por todo subagente (embedding verbatim no brief).
- **Invariante:** não-descartável (`Context Priority`), imutável (Rule 0), embutida verbatim em todo brief. **É a espinha de segurança e o maior diferencial do HackBot (doc 04 §4).**

---

## 3. Contratos transversais (as "costuras" entre componentes)

| Costura | Contrato | Já existe? |
|---------|----------|-----------|
| Dispatch → subagente | Brief template obrigatório (Objective/Target/Native-tooling/Techniques/Verification/Return) | ✅ `flows-agents` |
| Policy → brief | Gate+verificação+doutrina coladas verbatim em todo brief | ✅ (convenção textual) — **promover a passo verificável** |
| Capability → Evidence | Toda capability roteia saída por `route(output)` | ✅ routing rules |
| Session → HTTP | `request_as(profile)` injeta sessão válida | ⚠️ formalizar |
| Backend HTTP intercambiável | Mesmo contrato (5) para probe nativo OU Caido | ⚠️ novo (interface fina) |
| Adapter → conhecimento | Adapters apontam para `skills/`, nunca copiam | ⚠️ formalizar |

---

## 4. O que a arquitetura-alvo NÃO introduz (decisões anti-overengineering)

- **Sem registry/DB/message-bus.** Estado continua file-based (cc*.md + dirs). Pentagi/Nebula usam Postgres/SQLite — rejeitado: overkill para o modelo file-based portável e offline.
- **Sem motor de orquestração multiagente.** O despacho textual + fases sequenciais já cobre; MAX_AGENTS=3 é suficiente. Graph-of-agents (strix) rejeitado por complexidade sem necessidade demonstrada.
- **Sem cofre de segredos.** Rule 6 proíbe armazenar segredo; Session Manager guarda *referências e modo de renovação*, não valores.
- **Sem dependência dura de Caido/MCP/Docker.** Toda capability tem fallback nativo (doc 06 §4).
- **Sem reescrita de conhecimento.** `skills/` recebe corpos verbatim (doc 05 §5).

---

## 5. Síntese
A arquitetura-alvo é o HackBot atual com: (a) `agents/` renomeado para `skills/` no padrão portável; (b) os 3 docs imutáveis promovidos a **Execution Policies** explícitas; (c) cinco capabilities formalizadas sobre o que já existe, três delas (Session/AuthZ/Concurrent) como extensões de maior valor atrás de fallback nativo; (d) adaptadores finos Pi/Antigravity apontando para uma base de conhecimento única. É evolução incremental — não um sistema novo.
