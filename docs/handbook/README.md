# SYNAPSE (SecurityAuditor) — Engineering Handbook

Referência técnica consolidada e **verificável** do SYNAPSE. Escrita por inspeção do **código real**
(`tools/web-runtime/`, `SKILL.md`, `references/`, `policies/`, `skills/`), usando os documentos históricos
de `docs/architecture-review/` como contexto — mas conferindo cada afirmação na implementação atual.

> **Escopo documental:** este handbook descreve o que existe e como funciona. **Não** altera comportamento
> operacional. A referência principal de **planejamento** continua sendo
> [`../architecture-review/08-capability-roadmap.md`](../architecture-review/08-capability-roadmap.md).

> **Operador?** Comece pelo **[Guia Operacional / Onboarding](operator/README.md)** (P4): quickstart,
> configuração, catálogo de skills, modos, Caido, matriz por runtime, readiness e troubleshooting — construído
> sobre os capítulos técnicos abaixo, sem duplicá-los.

## Legenda de status (aplicada a cada capacidade)

| Tag | Significado |
|-----|-------------|
| ✅ **IMPLEMENTED** | existe no código |
| 🧪 **DETERMINISTICALLY TESTED** | possui teste determinístico executado (suites `tools/web-runtime/test-*.mjs`) |
| 🤖 **AGENTICALLY VALIDATED** | validado com modelo real no Pi ([30]) |
| 🟡 **PARTIAL** | funciona parcialmente |
| 📋 **PLANNED** | consta no roadmap, não existe em código |
| ⛔ **BLOCKED** | depende de requisito não atendido |

Nenhuma arquitetura proposta é apresentada como capacidade implementada. O que é 📋/⛔ está marcado como tal.

## Índice

| Cap. | Arquivo | Cobre (tópicos do pedido H2a §3) |
|------|---------|----------------------------------|
| 1 | [01-architecture-and-runtime.md](01-architecture-and-runtime.md) | 1 Overview/princípios · 2 Componentes · 3 Runtime/lifecycle |
| 2 | [02-dispatcher-skills-flows.md](02-dispatcher-skills-flows.md) | 4 Dispatcher/roteamento · 5 Skills/KB/progressive disclosure · 6 Flows · 7 Agentes efêmeros/delegação |
| 3 | [03-capability-bridge-and-adapters.md](03-capability-bridge-and-adapters.md) | 8 Capability Bridge/Pi Adapter · 16 Integração de runtimes/MCPs · contratos/schemas |
| 4 | [04-web-runtime-capabilities.md](04-web-runtime-capabilities.md) | 9 HTTP Inspection · 10 Browser Runtime · 11 Sessions/Identity · 12 Authorization Matrix · 13 Concurrency/Race |
| 5 | [05-security-evidence-errors.md](05-security-evidence-errors.md) | 14 Scope Guard/policies/segurança · 15 Evidências/Investigation Records · erros/recuperação/cancelamento |
| 6 | [06-install-operate-test.md](06-install-operate-test.md) | 17 Instalação/operação · 18 Diagnóstico/troubleshooting · 19 Testes/regressões · 20 Extensibilidade |
| 7 | [07-target-architecture-and-roadmap.md](07-target-architecture-and-roadmap.md) | Arquitetura-alvo Caido (ref [34]) · Whitebox intelligence (H2c-F2+, 📋) · Preflight (H2d, 📋) · roadmap |
| 8 | [08-pentest-engagement-workspace.md](08-pentest-engagement-workspace.md) | **H2c-F1 implementado** ✅🧪: manifesto/modalidade/associação Caido/segregação Whitebox por código + limitação de camada-de-ferramentas |
| 9 | [09-caido-connectivity.md](09-caido-connectivity.md) | **H2b-F1 implementado** ✅🧪: adaptador Caido read-only (GraphQL/PAT) via Bridge · HTTP Intelligence · associação/escopo/proveniência · integração real NOT RUN |
| 10 | [10-caido-live-history-monitor.md](10-caido-live-history-monitor.md) | **H2b-F2 implementado** ✅🧪: monitor incremental do History · checkpoint atômico · dedup/reconciliação · lifecycle · interface de leitura p/ F3 · integração real NOT RUN |
| 11 | [11-caido-pentest-copilot.md](11-caido-pentest-copilot.md) | **H2b-F3 implementado** ✅🧪: Copilot determinístico (contexto + recomendações) · correlação com KB real · capability `copilot` na Bridge · zero LLM · integração real NOT RUN |
| 12 | [12-caido-testing-operations.md](12-caido-testing-operations.md) | **H2b-F4a implementado** ✅🧪: Replay supervisionado + Findings (consulta/criação) + Automate (leitura) · capability `caido-active` (ativa, sensível, aprovação) separada de `caido` · schemas SDL reais · integração real NOT RUN |
| 13 | [13-caido-supervised-investigation.md](13-caido-supervised-investigation.md) | **H2b-F4b-1 implementado** ✅🧪: fluxo de investigação supervisionada (History→Replay→evidência) via mecanismo normal · capability passiva `investigation` + Record honesto (incompletude/isolamento) · flow doc · gate real F4b-2 **NOT RUN/BLOCKED** · 20/20 |
| 14 | [14-caido-workflow-intelligence.md](14-caido-workflow-intelligence.md) | **H2b-F5a implementado** ✅🧪: geração/validação **offline** de workflows · Planner + IR intermediário versionado + validador de contrato · 3 exemplos (passive/active/convert) · capability `workflow` · **geração nativa BLOCKED** (definition opaca) · 17/17 |
| 15 | [15-windows-bootstrap-preflight.md](15-windows-bootstrap-preflight.md) | **H2d-F0/F1 implementado** ✅🧪: bootstrap Windows (sem admin/Docker/WSL) · SYNAPSE Doctor · Environment Preflight (perfis core-lab/caido-native/full-engagement, vereditos READY/DEGRADED/BLOCKED, sem LLM/sem ofensa) · opcionais (incl. workflows nativos) nunca bloqueiam · config `.env` nativa · 25/25 |
| 16 | [16-multi-engagement-and-caido-onboarding.md](16-multi-engagement-and-caido-onboarding.md) | **Pré-piloto implementado** ✅🧪: multi-engagement (workspace/escopo/projeto Caido/estado/evidências por pentest) · binding projeto↔engagement (manifesto; sem global obrigatório, sem fallback silencioso) · **seleção dinâmica por sessão** (`cli.mjs use`; `SA_ENGAGEMENT` vira override opcional; sem adivinhação) · **evidências em `<engagement>/evidence`** (sem dir global, sem `/tmp`; `browser.screenshot` roteado+confinado; sem engagement → `evidence-no-engagement`) · CLI de operador · confinamento symlink-safe · guia de onboarding Caido · limitação de enforcement honesta · 31/31 |
| 19 | [19-operational-modes.md](19-operational-modes.md) | **Modos operacionais (P3)** ✅🧪: skill `/modo` (`status`/`copilot`/`autopilot`) + `tools/modes/` · **Copilot** padrão seguro × **Autopilot supervisionado** (planeja/propõe sob gates; sem autonomia contínua) · estado por `engagementId`+`SA_SESSION_ID` em `<eng>/.hackbot/` (sem DB novo) · **modo não concede capability / não ignora gate / não chega ao Bridge** · aplicado em `/investigar` e `/iniciar-pentest` · matriz de readiness A/B/C ✅, **D (lab) NOT RUN** · `test-modes.mjs` 18/18 |
| 18 | [18-project-scoped-activation.md](18-project-scoped-activation.md) | **Ativação local por projeto (P2)** ✅🧪: ativa o harness central em projeto externo por **symlinks** (`tools/activation/`: `activate`/`deactivate`/`status` + skills `/ativar-projeto`,`/desativar-projeto`) · **zero duplicação da KB** · sem instalação global, sem 2º dispatcher/framework · layouts A(interno)/B(externo)/C(ativado) · marcador `.hackbot-activation.json` · conflitos com backup/restauração · idempotente · dados do engagement preservados no deactivate · **matriz por runtime** (Claude Code I+T camada de arquivos/CLI, reconhecimento ao vivo NOT RUN; Pi contrato/global não feito; Antigravity BLOCKED) · limitação de isolamento honesta (carregamento ≠ sandbox) · `test-activation.mjs` 18/18 |
| 17 | [17-operational-skills-and-engagement-ux.md](17-operational-skills-and-engagement-ux.md) | **Skills operacionais (Claude Code) + consolidação semântica P1** ✅🧪: 6 skills de **gestão** (`/listar-`,`/criar-`,`/usar-engagement`,`/engagement-atual`,`/associar-caido`,`/verificar-ambiente`) + **operação** (`/investigar` = investigação pontual→Investigation Record; `/iniciar-pentest` = início/retomada do pentest roteando ao dispatcher+flows; `/iniciar-investigacao` = alias deprecado de `/investigar`) sobre o CLI/Bridge existentes · nomenclatura engagement/pentest/investigação/record/finding/relatório · instalação única + engagements externos (`SA_ENGAGEMENT_ROOT`) · sem 2º dispatcher/orquestrador/deps/mudança de KB·agents·policies · Pi inalterado · `SA_SKIP_ENV_FILE` hermético · smoke de reconhecimento NOT RUN · `test-skills.mjs` 48/48 |

## Mapa mental (1 parágrafo)

O SYNAPSE é uma **Agent Skill 100% Markdown** (`SKILL.md` + `references/` + `policies/` + `skills/` com
**127 corpos** de conhecimento ofensivo) que um runtime de agente (Pi, Claude Code, Antigravity) carrega
por **progressive disclosure**. O `SKILL.md` atua como **dispatcher**: mapeia gatilhos → flows → arquivos a
carregar. Capacidades executáveis sobre a web (HTTP, Browser, Multi-sessão, IDOR/BOLA, Concurrency, Race)
vivem no **Web Runtime** (`tools/web-runtime/`, Node + playwright-core) atrás de uma **Capability Bridge**
de ponto único (`bridge.mjs`), exposta a um runtime de agente por um **adaptador** (ex.: Pi, via duas
tools nativas). O operador — nunca o LLM — provisiona o **Execution Context** (escopo + capacidades
permitidas + aprovações). Resultados preservam o **veredito dos validadores** verbatim e viram
**Investigation Records**.

## Registro de lacunas documentais

Ver cada capítulo (seção "Limitações / lacunas"). Consolidado em
[06-install-operate-test.md](06-install-operate-test.md#65-lacunas-documentais).

## Resumo das alterações documentais (H2a + H2c-F1)

- **H2a — Novo:** `docs/handbook/` (índice + 7 capítulos); **Atualizado:** roadmap [08] (Whitebox/Preflight 📋).
- **H2c-F1 — Novo:** cap. 8 + módulo `tools/workspace/` (engagement.mjs, whitebox-guard.mjs,
  whitebox-guard-hook.mjs de referência, test-engagement.mjs **16/16**, package.json sem deps); nota aditiva
  opcional em `references/flows-scope.md`; roadmap [08] §8 H2c atualizado (F0/F1 entregues, F2+ 📋).
- **H2b-F1 — Novo:** cap. 9 + `tools/web-runtime/backends/caido.mjs` (cliente read-only, zero deps) +
  capability `caido` aditiva em `capability.mjs`/`bridge.mjs` (4 ops) + `test-caido.mjs` **19/19**; matriz de
  capacidades (cap. 4 §4.7) e roadmap [08] §8 H2b atualizados; **integração real NOT RUN**.
- **H2b-F2 — Novo:** cap. 10 + `tools/web-runtime/caido-monitor.mjs` (monitor incremental, zero deps, sem
  DB/scheduler) + `test-caido-monitor.mjs` **24/24**; reutiliza o caminho F1 da Bridge; roadmap [08] §8 H2b
  atualizado; **integração real NOT RUN**.
- **H2b-F3 — Novo:** cap. 11 + `tools/web-runtime/caido-copilot.mjs` (Copilot determinístico, zero deps,
  reusa `pattern-index.md`) + capability `copilot` aditiva na Bridge (7 ops read-only + `attachCopilot`) +
  `test-caido-copilot.mjs` **24/24**; roadmap [08] §8 H2b atualizado; **zero LLM**; **integração real NOT RUN**.
- **H2b-F4a — Novo:** cap. 12 + `tools/web-runtime/backends/caido-active.mjs` (cliente ativo Replay/Findings
  + reads Automate, reusa `postGraphql` extraído de `caido.mjs`) + capabilities `caido`(6 reads) e
  **`caido-active`**(2 ops ativas sensíveis: `replay.run`, `findings.create`) na Bridge + `test-caido-active.mjs`
  **27/27**; matriz (cap. 4 §4.7) e roadmap [08] §8 H2b atualizados; schemas SDL reais; **sem mudança de
  policies/modelo de autorização** (reusa `_approved`); **integração real NOT RUN**.
- **H2b-F4b-1 — Novo:** cap. 13 + `references/flows-caido-investigation.md` (flow supervisionado) +
  `tools/web-runtime/investigation-record.mjs` (Record passivo, honesto, incompletude/isolamento, reusa
  persistência atômica existente) + capability aditiva `investigation` na Bridge (8 ops + `attachInvestigationRecord`
  + auto-espelhamento dos envelopes ativos) + `test-caido-investigation.mjs` **20/20**; pointer no `SKILL.md`;
  matriz (cap. 4 §4.7) e roadmap [08] §8 H2b atualizados; **sem novo dispatcher/mecanismo de autorização/persistência**;
  **gate de integração real F4b-2 NOT RUN/BLOCKED**.
- **H2b-F5a — Novo:** cap. 14 + `tools/web-runtime/caido-workflow.mjs` (Planner + IR versionado + validador
  de contrato; geração nativa **BLOCKED** por `definition` opaca) + capability aditiva `workflow` na Bridge
  (5 ops locais, sem efeito no Caido) + `test-caido-workflow.mjs` **17/17**; matriz (cap. 4 §4.7) e roadmap
  [08] §8 H2b atualizados; **sem publicação/importação/execução**; **gate F5b** documentado.
- **H2d-F0/F1 — Novo:** cap. 15 + diagnóstico [35] + `tools/preflight/` (`preflight.mjs`/`doctor.mjs`/
  `cli.mjs` + `preflight.bat`/`doctor.bat`/`bootstrap.bat`, zero deps) + `test-preflight.mjs` **19/19**;
  Preflight determinístico/offline (sem LLM/sem ofensa), perfis + vereditos, opcionais (incl. workflows
  nativos) nunca bloqueiam; roadmap [08] §8 H2d e cap. 7 §7.3 atualizados.
- **Config local `.env` (2026-11-05) — Novo:** `tools/preflight/env-loader.mjs` (carregamento nativo Node 22
  via `util.parseEnv`, **sem `dotenv`/deps**) integrado ao Doctor/Preflight; `.env.example` (CAIDO_BASE_URL/
  TOKEN/PROJECT_ID + SA_ENGAGEMENT_ROOT) + `.gitignore` protege `.env` e variantes; **precedência do
  ambiente**, **raiz real do projeto** (independe do cwd), **sanitização** (só nomes, nunca valores),
  presença do arquivo **não** autoriza operação; `test-env-loader.mjs` **15/15**; cap. 15 §15.6. Não é
  H2d-F2, não é gerenciador de segredos nem nova arquitetura de config.
- **Pré-piloto multi-engagement (2026-11-05) — Novo:** cap. 16 + diagnóstico [36] + helpers em
  `tools/workspace/engagement.mjs` (`associateCaidoProject`/`resolveProjectId`/`assertInsideEngagement`
  symlink-safe/`engagementStatePaths`/`selectEngagement`) + `tools/workspace/cli.mjs` (init|scope|associate|
  use|active|clear|select|show|list|projects) + Preflight: `caido` vira config de **instância** e novo check
  **`caidoProject`** (binding via manifesto; `CAIDO_PROJECT_ID` global só compat, sem fallback silencioso) +
  `.env.example` separa instância×engagement; `test-multi-engagement.mjs` **15/15**, preflight **25/25**.
  **Bridge inalterado** (enforcement já existia). Limitação de enforcement de camada-de-ferramentas
  documentada (sem isolamento universal). Não é H2d-F2; F5b segue pós-MVP.
- **UX — Seleção dinâmica de engagement (2026-11-05) — Novo:** engagement ativo escolhido **por sessão** via
  `cli.mjs use`/`active`/`clear` (ponteiro em `<root>/.sa-state/`), reutilizando `selectEngagement()`.
  `SA_ENGAGEMENT` passa a ser **override opcional** (automação); `.env` persiste só `CAIDO_BASE_URL`/
  `CAIDO_TOKEN`/`SA_ENGAGEMENT_ROOT`. Precedência: env > ponteiro > nenhum; **sem** escolher primeiro/último/
  parecido; sem seleção → descoberta permitida mas ops dependentes **bloqueadas**; troca invalida o contexto
  anterior e exige sessão limpa (sem declarar limpeza falsa). Isolamento/escopo/confinamento/autorização
  preservados. `test-multi-engagement.mjs` **24/24**. Sem deps; sem KB/agents/policies; não é H2d-F2.
- **Evidence Directory por engagement (2026-11-05) — Novo:** evidência persistente de auditoria em
  **`<engagement>/evidence`** (reusa a convenção `evidence/`), resolvida do engagement ativo
  (`selectEngagement().evidenceDir` → `ctx.evidenceDir`); Bridge roteia+**confina** `browser.screenshot` via
  `confineWithin` (symlink-safe); **sem** dir global e **sem** `/tmp` fallback; sem engagement →
  `evidence-no-engagement`, escape → `evidence-path-escape`. `SA_EVIDENCE_DIR` **deprecado** (compat só sem
  engagement, nunca sobrepõe). Preflight `evidence` resolve o engagement ativo (opcional em core-lab,
  obrigatório em caido-native/full-engagement); Doctor/`.env.example`/bootstrap atualizados.
  `test-multi-engagement.mjs` **31/31**, preflight **28/28**. Sem deps; sem KB/agents/policies; sem mudança
  no modelo de autorização; não é H2d-F2 nem H2b-F6.
- **Skills operacionais & UX de engagement (2026-11-05) — Novo:** 7 skills finas do Claude Code em
  `.claude/skills/` (interfaces sobre `tools/workspace/cli.mjs` e `tools/preflight/cli.mjs`; lógica/enforcement
  permanecem no Node/Bridge), **sem 2º dispatcher**. Instalação única do harness + engagements **externos**
  (`SA_ENGAGEMENT_ROOT`, ambos os layouts suportados, sem migração forçada). `SA_SESSION_ID` propaga/isola
  entre processos; troca avisa sessão limpa sem alegar purge; sem seleção → op dependente bloqueada; evidências
  confinadas. **Pi inalterado**, sem adaptador novo. Opt-out hermético `SA_SKIP_ENV_FILE`. Cap. 17 do handbook.
  `test-skills.mjs` **37/37**. Sem deps; sem KB/`agents`/`policies`; sem mudança de autorização; não inicia H2d-F2.
- **Consolidação semântica P1 (2026-11-05) — Novo:** separa **engagement** (gestão) de **pentest** (execução)
  e **investigação** (pontual). `/iniciar-investigacao` → renomeada para **`/investigar`** (investigação
  pontual → **Investigation Record**, reutiliza o fluxo supervisionado; não inicia pentest); mantido alias
  **deprecado/temporário** `/iniciar-investigacao` (não-divergente). Nova **`/iniciar-pentest`** = início/
  retomada do pentest completo **roteando ao dispatcher principal + flows** (escopo→recon→investigação→
  validação→reteste→consolidação), **sem novo orquestrador** e **sem** execução autônoma contínua (limitações
  documentadas). Nomenclatura (engagement/pentest/investigação/record/finding/relatório) no cap. 17 §17.9. Sem
  `/gerar-relatorio`,`/registrar-achado`,`/modo`, Copilot/Autopilot, ativação local. Smoke de reconhecimento
  no runtime = **NOT RUN**. `test-skills.mjs` **48/48**. Sem deps/dispatcher/orquestrador novos; sem mudança em
  KB/`agents`/`policies`/autorização; não inicia H2d-F2.
- **Ativação local por projeto P2 (2026-11-05) — Novo:** `tools/activation/` (`activate`/`deactivate`/
  `status`) ativa o harness **central** em um projeto externo via **symlinks** (recursos + `.claude/skills`/
  hooks/settings), rastreados em `.hackbot-activation.json`; **zero duplicação** da KB, **sem** instalação
  global (`~/.claude`/`~/.pi`/`~/.gemini` intocados), **sem** 2º dispatcher/framework. Layouts A/B/C; conflitos
  com backup+restauração (`--force`); idempotente; `deactivate` remove só o que criou e **preserva** dados do
  engagement. Skills `/ativar-projeto` e `/desativar-projeto`. Matriz por runtime (Claude Code I+T na camada de
  arquivos/CLI, reconhecimento ao vivo **NOT RUN**; Pi registro global **não feito**; Antigravity runtime
  **BLOCKED**). `test-activation.mjs` **18/18**, `test-skills.mjs` **54/54**. Cap. 18. Sem deps; sem KB/`agents`/
  `policies`; sem mudança de autorização; sem sandbox próprio; não inicia P3 nem H2d-F2.
- **Modos operacionais P3 (2026-11-05) — Novo:** skill **`/modo`** (`status`/`copilot`/`autopilot`) +
  `tools/modes/` (`mode.mjs`/`cli.mjs`). **Copilot** = padrão seguro (assistência interativa, sem ops ativas
  espontâneas); **Autopilot supervisionado** = planeja/propõe rumo a um objetivo delimitado, **cada** ação
  Class A sob Approval Gate, **sem** execução autônoma contínua. Estado por `engagementId`+`SA_SESSION_ID` em
  `<eng>/.hackbot/mode[-sid].json` (padrão existente, confinado, **sem DB novo**); copilot default; troca de
  engagement invalida; sessões concorrentes isoladas. **O modo não concede capability, não ignora gate, não
  autoriza alvo e o Bridge não importa o módulo de modos** (autorizador único = `ctx.approvals` do operador).
  Aplicado em `/investigar` e `/iniciar-pentest`. Readiness **A (selecionável)**, **B (aplicado)**, **C (gated
  determinístico)** ✅; **D (execução agêntica real em lab) = NOT RUN** → Autopilot **não** validado ponta a
  ponta. Critérios de aceite em H2b-F4b-2/H3 documentados (cap. 19). `test-modes.mjs` **18/18**,
  `test-skills.mjs` **58/58**. Sem deps/dispatcher/framework; sem KB/`agents`/`policies`; sem LLM pago/ops
  ofensivas; F5b permanece V2; não inicia H2d-F2/F6/H3.
- **Decisão de produto (2026-11-05):** **H2b-F5b** (geração/importação/publicação/execução de workflows
  **nativos**) reclassificada para **pós-MVP (V2), opcional** — artefatos F5a preservados; o BLOCKED de
  geração nativa **não** impede o MVP nem H3; no Preflight é opcional/PLANNED e **não** bloqueia o perfil
  `caido-native`. Atualizados roadmap [08] §8 (H2b/H2d/H3) e handbook cap. 7/14. (Doc-only — nenhum código,
  teste, KB, `agents/` ou `policies/` alterado.)
- **Inalterado:** código do Web Runtime (cliente read-only F1 segue sem mutations), KB (127 corpos — Validador
  127/127), `agents/` (17), `policies/`
  (3), dispatcher/roteamento, vereditos de H1e/H3-F0 ([30]–[33]).
