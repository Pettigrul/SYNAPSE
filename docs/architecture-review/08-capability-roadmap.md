# 08 — Roadmap de Capacidades (MVP vs Futuro)

> Distingue o **MVP** (o que já existe + reembalagem de baixo risco) das **capacidades futuras** (extensões de maior valor e maior risco). Cada item traz: problema, solução, custo/complexidade, dependência, e gate de necessidade (quando construir só se X).

---

## 1. Horizontes

| Horizonte | Tema | Risco | Depende de aprovação? |
|-----------|------|-------|-----------------------|
| **H0 — MVP** | Reembalagem portável + policies explícitas, 100% nativo | Baixo | Sim (migração) |
| **H1 — Extensões de valor** | Session Manager, AuthZ-Test, Concurrent (nativo) | Médio | Sim |
| **H2 — Integrações condicionais** | Caido (HTTP/sessão/IDOR/race), Browser MCP formalizado | Médio-alto | Sim + teste de aceitação corporativo |
| **H3 — Futuro** | Multi-runtime pleno, tools determinísticas empacotadas | A reavaliar | Sim |

---

## 2. H0 — MVP (reembalagem; sem capacidade nova)

| # | Item | Problema atual | Solução | Custo |
|---|------|----------------|---------|-------|
| 0.1 | Renomear `agents/` → `skills/` (padrão `SKILL.md`+`references/`) | Nome engana; não portável | Mover + frontmatter; corpo verbatim | Baixo (mecânico) |
| 0.2 | Promover 3 docs imutáveis a `policies/` | Política misturada em `references/` | Mover; manter marcadores + embedding | Baixo |
| 0.3 | Split de `web-testing` por classe em `references/` | Carrega 421 linhas por qualquer classe | Um `references/<classe>.md` por grupo | Baixo-médio |
| 0.4 | `SKILL.md` → roteador magro | Monólito | Delegar conhecimento às sub-skills | Médio (único ponto de reescrita) |
| 0.5 | Adaptadores finos Claude/Pi/Antigravity | Portabilidade informal | Arquivos que apontam p/ `skills/` | Baixo |
| 0.6 | Validador de migração (diff verbatim + contagem) | Risco de perda semântica | Script (doc 10) | Baixo |

**Resultado H0:** mesma capacidade, portável, organizada, com perda de conhecimento zero verificável. **Nenhuma dependência externa nova.**

---

## 3. H1 — Extensões de valor (nativas, com fallback)

| # | Capability | Problema | Solução MVP (nativa) | Gate de necessidade |
|---|-----------|----------|----------------------|---------------------|
| 1a | **(4) Browser Runtime** | Prova de XSS / fluxo autenticado depende de render; hoje só probe HTTP | MCP opcional (`chrome-devtools`/`firecrawl`) **com fallback nativo** (`Invoke-WebRequest`/JS-pull) | Construir quando houver necessidade de prova *grounded* em DOM/console/screenshot — **independente de Caido** |
| 1.1 | **(6) Authenticated Session Manager** | Sessão expira mid-scan; um só perfil testado; risco de misturar contextos | Perfis nomeados em `scope.md`/`session.md` (ref, não valor) + campo de renovação; `request_as(profile)` | Construir quando houver engajamento autenticado multi-conta |
| 1.2 | **(7) Authorization Testing (IDOR/BOLA)** | Lacuna do campo; T5 é manual | Workflow owner-vs-cross-vs-noauth sobre (5)+(6) + diff | Construir junto com 1.1 (depende de perfis) |
| 1.3 | **(8) Concurrent Testing (race)** | Lacuna do campo; disperso em T10/chaos-T5 | Blueprint forge + workflow (`concurrent.futures`/PS jobs) | Construir quando alvo tiver estado mutável sensível (saldo/cupom/estoque) |

**Observação:** 1.1→1.2→1.3 são sequenciais (AuthZ depende de Session; race usa ambos). **H1a (Browser Runtime) é autônomo** — não depende de 1.1–1.3 nem de Caido; a integração Caido (H2) apenas turbina HTTP/sessão/IDOR/race, nunca o Browser Runtime. Todas as capabilities do H1 são puramente nativas com fallback — nenhuma exige Caido.

---

## 4. H2 — Integrações condicionais (só após teste de aceitação)

| # | Item | Ganho | Pré-condição obrigatória |
|---|------|-------|--------------------------|
| 2.1 | **Caido via `caido-mcp-server`** backend de (5) HTTP | history/replay/diff/batch; melhor cookie jar; race por Replay Pipelines | ✅ Teste de aceitação: Caido instalável + binário Go executável no Windows corporativo (doc 06 §4) |
| 2.2 | Cookie jar automático → turbina (6) Session | Renovação/isolamento automáticos | 2.1 aprovado |
| 2.3 | Batch multi-token → turbina (7) AuthZ | IDOR em escala | 2.1 aprovado |
| 2.4 | Replay Pipelines → turbina (8) Concurrent | Race preciso (last-byte-sync) | 2.1 aprovado |
| 2.5 | Browser MCP formalizado (4) | Prova XSS grounded, fluxo autenticado | MCP permitido no ambiente |

**Regra:** o contrato de (5)/(6)/(7)/(8) é idêntico com backend nativo ou Caido. H2 **troca o backend**, não a interface — se o teste de aceitação falhar, o sistema fica no H1 nativo sem retrabalho.

**Alternativa a 2.1 se binário externo for bloqueado:** VibeHacking (MCP in-Caido, sem runtime Go separado) — doc 03 §4.2. Avaliar caso o "execução de binário" seja a barreira mas o plugin Caido não.

---

## 5. H3 — Futuro (reavaliar sob necessidade)

| # | Item | Quando justifica |
|---|------|------------------|
| 3.1 | Tools determinísticas empacotadas (port scanner/JWT/OAST/wordlist/hash do forge) | Se a reescrita repetida desses scripts virar custo medido |
| 3.2 | Multi-runtime pleno (ex.: `runner` por agente, à la a-conte) | Se um 3º runtime além de Pi/Antigravity/Claude entrar em uso real |
| 3.3 | Campo `NETWORK_EGRESS` em scope (offline tuning) | Pequeno; incluir já no H0 se operação offline for comum |
| 3.4 | Validação cética separada (padrão omega) | Se re-verificação do coordenador se mostrar insuficiente na prática |

---

## 6. Matriz capacidade × origem × horizonte

| Capability (doc 07) | Origem | Horizonte MVP | Turbinada em |
|---------------------|--------|---------------|--------------|
| (1) Base conhecimento | Já existe | H0 | — |
| (2) Adapter Pi | Fundação existe | H0 | — |
| (3) Adapter Antigravity | Fundação existe | H0 | — |
| (4) Browser | Parcial (MCP opc.) | H0 (fallback nativo) | H2 (2.5) |
| (5) HTTP | Já existe (nativo) | H0 | H2 (2.1) |
| (6) Session | Extensão | H1 (1.1 nativo) | H2 (2.2) |
| (7) AuthZ-Test | Extensão | H1 (1.2 nativo) | H2 (2.3) |
| (8) Concurrent | Extensão | H1 (1.3 nativo) | H2 (2.4) |
| (9) Evidence | Já existe | H0 | — |
| (10) Execution Policies | Já existe | H0 | — |

**Leitura:** 7 dos 10 componentes são H0 (já existem — só formalizar). As 3 extensões de valor (Session/AuthZ/Concurrent) nascem nativas no H1 e, se o ambiente permitir, ganham backend Caido no H2 sem mudar contrato. **Zero capacidade do MVP depende de aprovação de infra externa.**

---

## 7. Estado real pós-H1e (encerramento formal)

| Horizonte / fase | Estado | Evidência |
|------------------|--------|-----------|
| **H0 — MVP** (reembalagem + policies) | **DONE** | Validador V1 127/127 (T=112, B=15) |
| **H1a/b/c — Browser/Session/AuthZ/Concurrent/Race (nativos)** | **DONE** | suítes Web Runtime verdes; `test-bridge` 15/15 |
| **H1d — Capability Bridge + Pi Adapter** | **DONE** | `test-pi-adapter` 7/7, `test-pi-entry` PASS; Pi 1.4.0 |
| **H1d-F4 — Aceitação agêntica E2E** | **PARCIAL→revalidada** | [30]: A PASS, B FAIL→**PARTIAL**, C PARTIAL→**PASS** |
| **H1e-F0 — Convergence Assessment** | **DONE** | [31] diagnóstico (4 causas comprovadas) |
| **H1e-F1 — Convergence Fixes (P1–P4)** | **DONE** | [32] `test-convergence` 11/11; regressão verde; 127/127 |
| **H1e — Revalidação agêntica** | **DONE** | [30] Parte III: 0 `duplicate-investigation`, veredito preservado, sem achado inventado |

**Veredito de prontidão:** HackBot **apto a piloto supervisionado em laboratório**, **não** a operação
autônoma irrestrita.

### 7.1 Dívida técnica registrada
1. **Persistência do resultado autoritativo** independentemente do fechamento textual do agente (o
   veredito do validador existe no evento da tool mesmo quando o Record escrito é truncado).
2. **Completude do Investigation Record** em execuções interrompidas (Cenário B settlou cedo).
3. **Negativos agênticos não executados** (política-ausente, inconclusivo, falha-de-navegador,
   cancelamento mid-flight) — determinísticos verdes; variantes agênticas pendentes.
4. **P5 (stop-rule p/ rejeições repetidas) / P6 (teto de leitura)** — melhorias **opcionais**, sujeitas a
   evidência de necessidade (não implementadas).

## 8. Roadmap consolidado H2–H3 (decisão de produto atualizada — não implementar automaticamente)

**Decisão de produto:** o **MVP operacional completo do HackBot é um Caido-native Pentest Copilot** — o
Caido deixa de ser acelerador opcional e passa a **requisito obrigatório do MVP** (planejamento →
execução → evidência → relatório). O **H1 permanece válido** como núcleo de execução **independente**,
apto a piloto supervisionado em laboratório; ele é a base, não o MVP completo. (Vereditos de H1e/H3-F0
**não** são alterados — ver §7 e [30]/[33].)

**Ajuste de escopo do MVP (decisão de produto, 2026-11-05):** a **geração, importação, publicação e
execução de workflows NATIVOS do Caido (H2b-F5b)** deixa de ser requisito obrigatório do MVP e passa ao
roadmap **pós-MVP (V2)**, como capacidade **opcional**. Os artefatos e contratos de **H2b-F5a**
(Planner + IR intermediário + validador offline) são **preservados como estão**, sem novas pesquisas ou
implementações de workflows nesta fase. O **MVP prioriza**: HTTP History, monitoramento contínuo, Copilot,
Replay supervisionado, consultas ao Automate, Findings, Investigation Records e **integração operacional
real com o Caido**. O **BLOCKED de geração nativa de workflows NÃO impede** a conclusão do MVP nem o aceite
de H3; no Preflight, a geração de workflows nativos é **opcional/PLANNED** e **não bloqueia** o perfil
`caido-native` (deps opcionais → `DEGRADED`, nunca `BLOCKED`). Demais instruções de H2d-F0/F1 permanecem
inalteradas.

| Frente | Descrição | Depende de | Prioridade | Estado | Critério de aceite |
|--------|-----------|-----------|-----------|--------|--------------------|
| **H1 — Núcleo HackBot independente** | Base de execução nativa (Session/AuthZ/Concurrent/Race/Browser + Capability Bridge + Pi Adapter) | — | — | **CONCLUÍDO** | apto a piloto supervisionado em lab ([30] Parte III) |
| **H2a — Engineering Handbook** | Manual completo de engenharia/operação (contratos, fluxos, limites, bridge, dispatcher, Investigation Record) | H1 DONE | **Obrigatória** (manutenção/operação) | **ENTREGUE** → [`docs/handbook/`](../handbook/README.md) (índice + 7 capítulos) | dev/operador reproduz arquitetura e contratos só pelo handbook |
| **H2b — Caido-native Pentest Copilot** | Integração Caido como espinha do MVP: HTTP History+HTTPQL, requests/responses, **monitoramento contínuo sem LLM por request**, Sitemap/WebSocket (conforme suporte), Replay supervisionado, Automate, Findings (consultar/correlacionar/criar), Workflows Passive/Active/Convert (gerar+validar), correlação com T[N]/B[N]+hipótese+Investigation Record, contexto persistente por engagement, recomendações copilot | H1; H2b-F0 [34]; app Caido + PAT | **Obrigatória (MVP)** | **F0 FEITO** [34]; **F1 ENTREGUE** → adaptador read-only `tools/web-runtime/backends/caido.mjs` + capability `caido` na Bridge (health/projects/history/request), **19/19** testes, schema GraphQL verificado (SDL), associação projeto↔engagement + escopo + proveniência + redação; **integração real NOT RUN** (sem instância autorizada). **F2 ENTREGUE** → `tools/web-runtime/caido-monitor.mjs` (monitor incremental: checkpoint atômico por engagement/projeto, dedup por id, reconciliação de responses tardias, backfill, backoff, lifecycle, interface de leitura p/ F3), **24/24** testes, reutiliza o caminho F1 da Bridge, **integração real NOT RUN**. **F3 ENTREGUE** → `tools/web-runtime/caido-copilot.mjs` (Copilot determinístico: contexto incremental fatos×inferências, correlação com a KB real via `pattern-index.md`, recomendações contextualizadas priorizadas/dedup, persistência versionada, capability `copilot` read-only na Bridge + `attachCopilot`), **24/24** testes, **zero LLM**, respeita modalidade/escopo/isolamento, **integração real NOT RUN**. **F4a ENTREGUE** → `tools/web-runtime/backends/caido-active.mjs` (operações de teste: Replay supervisionado + Findings consulta/criação + Automate leitura; reusa transporte `postGraphql` extraído de `caido.mjs`), capabilities `caido`(6 reads) e **`caido-active`**(2 ativas sensíveis: `replay.run`/`findings.create`) na Bridge, **27/27** testes, schemas SDL reais (Replay/Findings/Automate verbatim), aprovação do operador (reusa `_approved` — **sem mudança de policies/modelo de autorização**), escopo antes/depois + controle de redirect + idempotência + limites, leitura≠Replay (capability separada), **integração real NOT RUN** (ops `@cloud` a comprovar em lab). **F4b-1 ENTREGUE** → fluxo de investigação supervisionada alcançável pelo mecanismo normal (`references/flows-caido-investigation.md` + capability passiva `investigation` + `tools/web-runtime/investigation-record.mjs`: Record honesto estendendo o Return contract, incompletude via `snapshot`, isolamento, IDs reais, execução ativa auto-espelhada dos envelopes), **20/20** testes determinísticos, **sem novo dispatcher/mecanismo de autorização/persistência**, respeita escopo/aprovação/limites/Whitebox. **F4b-2 (aceitação agêntica com LLM real) GATED** pelo gate de integração real (instância Caido de laboratório autorizada) → **NOT RUN / BLOCKED** (sem lab); mocks não substituem. **F5a ENTREGUE** → `tools/web-runtime/caido-workflow.mjs` (Workflow Planner + IR intermediário versionado `sa-workflow-ir/1` + validador de contrato offline; capability `workflow` na Bridge, local, sem efeito no Caido), **17/17** testes, 3 exemplos (passive/active/convert), gate de convertibilidade (recomendação do Copilot sozinha não gera regra), separação indicador/anomalia/confirmado sem promoção. **Geração nativa importável BLOCKED** — a SDL carrega `Workflow.definition` como `JsonObject!` opaco, sem schema de node-graph/versão e sem import/export; só é provável CRUD + `WorkflowKind{ACTIVE,CONVERT,PASSIVE}` + `runActive/runConvert` + `testWorkflow*`. **F5b (geração/importação/publicação/execução de workflows NATIVOS) — PÓS-MVP (V2), OPCIONAL** (decisão de produto 2026-11-05): removida dos requisitos obrigatórios do MVP; artefatos F5a preservados; seu BLOCKED **não** impede o MVP nem H3. Quando retomada (V2), ainda GATED por instância autorizada + versão comprovada + mecanismo de importação confirmado + validação de sintéticos + aprovação + rollback. **F6 (Evidence & Reporting) NOT STARTED** | **MVP Caido-native prioriza** HTTP History, monitoramento, Copilot, Replay supervisionado, Automate (leitura), Findings, Investigation Records e **integração real** ([34] §7); **workflows nativos = opcional/V2**; spine = Node↔GraphQL/PAT; handbook cap. 9–14 |
| **H2c — Application-Centric Pentest Workspace + Whitebox Intelligence (opcional)** | Evolução estruturante por aplicação, **substituindo a orientação bug bounty** por **Pentest Engagement Workspace**: GitHub MCP, Confluence MCP, Business Logic Intelligence, code review + secret scanning, STRIDE Threat Modeling, Pentest Guidelines contextualizadas — como **fluxo adicional opcional e explicitamente acionável**, relacionado a `scope.md`/Recon. **Whitebox:** artefatos/código/resultados **segregados em `Whitebox/`** com **controles de acesso efetivos** (dispatcher/agentes não consultam por padrão; sem indexação automática; sem contaminar hipóteses Black Box; acesso por comando explícito + autorização; revogação com contexto limpo) — Black/Gray Box permanece **agnóstico ao código** | H2a; H2b; integrações externas | Média-alta | **F0/F1 ENTREGUES** → módulo `tools/workspace/` + handbook cap. 8 (manifesto/modalidade/associação Caido/segregação Whitebox por código, auditoria, 16/16 testes). **F2+ 📋**: conectores GitHub/Confluence/code review/secret scan/STRIDE/Business Logic como fluxo opcional explicitamente acionado. **Limitação declarada:** isolamento de camada-de-ferramentas (raw read/bash) **não universal** — hook de referência só p/ Claude Code; demais runtimes 📋 | workspace reproduzível por engagement; **Whitebox default-deny por código** (testado, não só prompt); Black Box agnóstico; tool-layer efetivo = F2+/H2d |
| **H2d — Windows Bootstrap + Preflight** | Implantação reproduzível no Windows corporativo restrito (sem Docker/WSL/admin): scripts `.bat`, persistência segura, config de runtimes (Pi/Claude Code/Antigravity) e MCPs; **HackBot Doctor**; **Environment Preflight** (sem LLM, sem ofensa) verificando Runtimes/Extensões/KB/Policies/Execution Context/Scope/Browser/Caido/MCPs/Workspace/Evidências; perfis `core-lab`/`caido-native`/`full-engagement`; vereditos `READY`/`DEGRADED`/`BLOCKED`; `doctor.bat`/`preflight.bat`/`bootstrap.bat` + módulo Node compartilhado | Pi no Windows; auth corporativa; [33] | **Obrigatória** (habilita H3) | **F0/F1 ENTREGUES** → `tools/preflight/` (`preflight.mjs`/`doctor.mjs`/`cli.mjs` + 3 `.bat`, zero deps) + handbook cap. 15 + diagnóstico [35], **19/19** testes determinísticos, Preflight **sem LLM/sem ofensa** (offline, só estrutura/config), perfis+vereditos, opcionais nunca bloqueiam. **F2 — Validação real Caido (Omarchy) PARCIAL** (2026-11-05) → conectividade real **comprovada** (endpoint/auth/`caido.projects` ao vivo, 11 projetos; schema `projects` OK); cadeia Engagement→History→Monitor→Copilot→Record **BLOCKED** por pré-requisito de engagement/associação/scope (operador desbloqueia); **sem** mudança de código (nenhuma incompatibilidade); Windows corporativo = homologação separada. Relatório: [37]. **F2+ 📋**: credential-store Windows, auto-config runtimes/MCPs, probe de conectividade viva, checks do gate F5b (versão Caido/node kinds). **Pré-piloto multi-engagement ENTREGUE** (2026-11-05) → binding projeto↔engagement por manifesto (sem `CAIDO_PROJECT_ID` global obrigatório, sem fallback silencioso), CLI de operador `tools/workspace/cli.mjs` com **seleção dinâmica por sessão** (`use`/`active`/`clear`, ponteiro `<root>/.sa-state/`; `SA_ENGAGEMENT` vira override opcional; sem adivinhar primeiro/último/parecido; sem seleção → ops dependentes bloqueadas; troca invalida contexto e exige sessão limpa sem declarar limpeza falsa), checks `caido`(instância)+`caidoProject`(binding), confinamento symlink-safe, handbook cap. 16 + diagnóstico [36], **test-multi-engagement 24/24** + preflight **25/25**; Bridge inalterado; **limitação de enforcement de camada-de-ferramentas declarada** (sem isolamento universal). **Evidence Directory por engagement ENTREGUE** (2026-11-05) → evidência persistente em `<engagement>/evidence` (sem dir global/`/tmp`), `browser.screenshot` roteado+confinado no Bridge (`ctx.evidenceDir`/`confineWithin`), `evidence-no-engagement` sem seleção; `SA_EVIDENCE_DIR` deprecado (compat delimitada); Preflight `evidence` resolve engagement ativo; **test-multi-engagement 31/31** + preflight **28/28**. | operador instala e roda o smoke ([33]) no Windows só pela doc; Preflight dá veredito por perfil; deps opcionais (GitHub/Confluence/STRIDE **e geração de workflows nativos — PLANNED/opcional/V2**) **não bloqueiam** o perfil `caido-native` (→ DEGRADED, nunca BLOCKED) |
| **H3-F0 — Guia + smoke test** | Guia reproduzível do primeiro uso supervisionado | H1; [33] | — | **ENTREGUE** [33] | atingido ([33] §11) |
| **H3 — Operational Pilot integrado** | Piloto operacional supervisionado end-to-end | H2a, H2b (**exceto F5b, que é V2/opcional**), H2d; provider/cota | Alta | **NOT STARTED** | **aceite final depende da integração Caido real (H2b: History, monitoramento, Copilot, Replay supervisionado, Automate leitura, Findings)** + smoke ([33]) + Investigation Record com proveniência Caido. **NÃO depende** da geração nativa de workflows (F5b) — seu BLOCKED é V2 e não bloqueia o MVP/H3 |

**Backlog preservado (nenhuma ideia some ao repriorizar):** Engineering Handbook completo (H2a);
Pentest Engagement Workspace (substitui bug bounty), GitHub/Confluence MCP, Business Logic Intelligence,
code review + secret scanning, STRIDE, Pentest Guidelines contextualizadas (H2c); Caido Workflow
Intelligence — **geração/validação offline F5a entregue; geração NATIVA F5b reclassificada como
pós-MVP/V2 opcional (2026-11-05)**; Windows `.bat` bootstrap + doctor + config de MCPs + persistência segura
(H2d).

> **Sequência habilitadora:** H2b-F0 (feito) → H2a + H2b-F1..F5a → H2d (Windows) → **H3 (piloto, aceite
> gated pela integração Caido real)**; **H2b-F5b (workflows nativos) é V2/opcional** e fica fora do caminho
> crítico do MVP; H2c evolui após H2a/H2b; H2b-F6 (plugin in-Caido assinado) é opcional sob teste de
> aceitação Windows. O **fallback nativo H1** permanece quando o Caido está ausente — a dependência de
> Caido é do **MVP completo**, não do núcleo. Nenhuma frente inicia sem autorização explícita.
