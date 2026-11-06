# Matriz de readiness / MVP

> Situação **real** de cada componente. Fonte: [roadmap 08](../../architecture-review/08-capability-roadmap.md)
> e as suites determinísticas do repo. **Teste de contrato/offline ≠ aceitação integrada em runtime real.**

**Legenda:** `IMPLEMENTED` (existe em código) · `TESTED OFFLINE` (teste determinístico executado) ·
`VALIDATED REAL` (comprovado em runtime/instância real) · `NOT RUN` (não executado nesta fase) ·
`BLOCKED` (depende de requisito ausente ou recusa do runtime) · `PARTIAL` (só parte comprovada) · `PLANNED` (no roadmap, não implementado).

| Componente | Situação | Evidência / nota |
|------------|----------|------------------|
| **H0 — MVP reembalagem + policies** | IMPLEMENTED · TESTED OFFLINE | Validador V1 **127/127** (T=112, B=15) |
| **H1 — núcleo (Session/AuthZ/Concurrent/Race/Browser + Bridge + Pi Adapter)** | IMPLEMENTED · TESTED OFFLINE | suites `test-bridge/sessions/concurrent/race/browser`; browser com nav real em loopback local; apto a piloto supervisionado |
| **H2a — Engineering Handbook** | IMPLEMENTED (entregue) | `docs/handbook/` cap. 1–19 |
| **H2b-F1 — Caido read-only (health/projects/history/request)** | IMPLEMENTED · TESTED OFFLINE · **VALIDATED REAL (Omarchy, read-only)** | `backends/caido.mjs` **21/21** + copilot 24/24; SDL verificado. **Ao vivo (Omarchy, S4):** health/auth/projects(11)/**history 21 reqs lidos integralmente**/paginação/HTTPQL/campos/request/proveniência PASS. Leitura **desacoplada do scope** (anota in/out, não retém; ativo segue gated) — [42](../../architecture-review/42-caido-readonly-scope-decouple.md) |
| **H2d-F2 — Validação real Caido (Omarchy)** | **VALIDATED REAL (read-only)** — health/auth/projects/History/paginação/HTTPQL/campos/Scope Guard | S4 3ª passada (projeto "Testes harness" aberto): Caido 0.58.3, `currentProject`=<project-id>, 11 projetos, History 21 reqs, cursores/HTTPQL/campos OK, **Scope Guard reteve 21 out-of-scope (0 vazados)**. Pendente só análise sobre tráfego **in-scope** (NO DATA — operador capturar) ([41](../../architecture-review/41-s4-real-acceptance.md)) |
| **H2b-F2 — Monitor incremental** | IMPLEMENTED · TESTED OFFLINE · **real NOT RUN** | `caido-monitor.mjs`, **24/24** |
| **H2b-F3 — Copilot determinístico (zero LLM)** | IMPLEMENTED · TESTED OFFLINE · **R6 VALIDATED REAL em lab sintético (S4); sobre Caido real NO DATA** | `caido-copilot.mjs`, **24/24** |
| **H2b-F4a — Ativo: Replay/Findings/Automate** | IMPLEMENTED · TESTED OFFLINE · **real NOT RUN** | `backends/caido-active.mjs`, **27/27**, aprovação via `_approved` |
| **H2b-F4b-1 — Investigação supervisionada + Record** | IMPLEMENTED · TESTED OFFLINE | `investigation-record.mjs` + `flows-caido-investigation.md`, **20/20** |
| **H2b-F4b-2 — Aceitação agêntica (LLM real)** | **NOT RUN / BLOCKED** | GATED por instância Caido de laboratório autorizada; mocks não substituem |
| **H2b-F5a — Workflow planner/IR/validador (offline)** | IMPLEMENTED · TESTED OFFLINE | `caido-workflow.mjs`, **17/17** |
| **H2b-F5b — Workflows NATIVOS Caido** | **BLOCKED** · PÓS-MVP/V2 (opcional) | SDL expõe `definition` opaca; **não bloqueia** MVP nem H3 |
| **H2b-F6 — Evidence & Reporting / plugin in-Caido** | **PLANNED** (NOT STARTED) | opcional sob teste de aceitação Windows |
| **H2c-F0/F1 — Workspace + Whitebox segregado** | IMPLEMENTED · TESTED OFFLINE | `tools/workspace/`, **16/16**; F2+ (GitHub/Confluence/STRIDE…) **PLANNED** |
| **H2d-F0/F1 — Bootstrap + Doctor + Preflight** | IMPLEMENTED · TESTED OFFLINE | `tools/preflight/`; F2+ (credential-store, probe vivo) **PLANNED** |
| **S1 — Bootstrap operacional + retomada antes do recon (R1/R2)** | IMPLEMENTED · TESTED OFFLINE | `bootstrapEngagement()` + `cli.mjs bootstrap`; `test-bootstrap.mjs` **18/18**; restaura 9 dirs + docs (idempotente, não sobrescreve); ver [38](../../architecture-review/38-stabilization-backlog.md) |
| **S2 — Fluidez operacional / Copilot executável (R3/R4/R6)** | IMPLEMENTED · TESTED OFFLINE · **agêntico vivo NOT RUN** | `references/operational-fluidity.md` + skills/flows/dispatcher; `test-fluidity.mjs` **16/16**; gates/modos/isolamento preservados; smoke no Claude Code pendente — ver [39](../../architecture-review/39-s2-operational-fluidity.md) |
| **S3 — Autopilot operacional + descoberta de /modo (R5/R7)** | IMPLEMENTED · TESTED OFFLINE · **descoberta viva + hands-off VALIDATED REAL em S4 (R5 atestado pelo operador; R7 em lab sintético)** | `references/autopilot-loop.md` + `parseTasks`/`cli.mjs next` + alias `/mode` + Doctor `claudeSkills`; `test-autopilot.mjs` **13/13**; cadeia demonstrada com dados sintéticos; gates intactos — ver [40](../../architecture-review/40-s3-operational-autopilot.md) |
| **S4 — Aceitação operacional real (Claude Code + Omarchy + Caido)** | **PASS (integração e experiência)** · análise in-scope **NO DATA** | R1–R7 **VALIDATED REAL** (R5 confirmado pelo operador); Caido read-only **VALIDATED REAL** (conexão/History **21 reqs lidos integralmente**/paginação/HTTPQL/campos/proveniência); leitura **desacoplada do scope** ([42](../../architecture-review/42-caido-readonly-scope-decouple.md)); bootstrap/Copilot/Autopilot (2 transições + gate) reais; análise in-scope **NO DATA** (captura sem tráfego do alvo); Validador 127/127 — ver [41](../../architecture-review/41-s4-real-acceptance.md) |
| **F8 — Leitura Caido desacoplada do Scope Guard (read-only)** | IMPLEMENTED · TESTED OFFLINE · **VALIDATED REAL** | `bridge._inScope` + `caido.history`/`caido.request` anotam (não retêm); Copilot anota; **ativo segue gated + isolamento de projeto**; `test-caido` 21/21 (10/10b/10c), copilot 24/24; leitura real de 21 reqs — [42](../../architecture-review/42-caido-readonly-scope-decouple.md) |
| **P1 — Consolidação semântica (skills/pentest/investigação)** | IMPLEMENTED · TESTED OFFLINE | `test-skills.mjs` (contrato das skills) |
| **P2 — Ativação local por projeto** | IMPLEMENTED · TESTED OFFLINE · **VALIDATED REAL** (Pi e Antigravity, dados sintéticos) | `tools/activation/`, `test-activation` **18/18**, `test-runtime-links`; links por runtime, `--runtime` com lista |
| **P3 — Modos (Copilot/Autopilot supervisionado)** | IMPLEMENTED · TESTED OFFLINE (A/B/C) · **D parcial: lab sintético no Claude Code (S4) e no Pi; com dados reais NOT RUN** | `tools/modes/`, **18/18**; Autopilot **não** validado ponta a ponta |
| **Aceitação real — Pi** | **VALIDATED REAL em dados sintéticos, com conclusão instável** · TUI, `/trust`, alvos reais, Caido, Windows e ops sob aprovação executadas **NOT RUN** | Pi 1.4.0, `openai-codex/gpt-6-luna --thinking low`, Linux, `--mode json`: última passada completa 12/14 (S4 e S12 FAIL: agente parou antes de concluir, sem violar limites; 10 execuções, cerca de US$ 0,05). O resultado varia entre passadas ([relatório 48](../../architecture-review/48-runtime-security-hardening.md)). `tools/acceptance/runtime-acceptance.mjs`; ver [guia](pi-agent.md) |
| **Aceitação real — Antigravity** | **PARTIAL** · não homologado · interativo **NOT RUN** | agy 1.5.1, `gemini-3.8-flash-low`: 1 e 2 PASS (dispatcher aberto, com evidência no log; [relatório 48](../../architecture-review/48-runtime-security-hardening.md)); 3-11 **BLOCKED** sem interação; 12 PASS (só falha de leitura); 13 PARTIAL (só pela CLI). Seguir o dispatcher não verificado. Sem adapter de Bridge com estado; ver [guia](antigravity.md) |
| **Suites offline** | IMPLEMENTED · TESTED OFFLINE | 35 suites + validador 127/127; métricas separadas da aceitação real |
| **Isolamento e menor privilégio** | IMPLEMENTED · TESTED OFFLINE | sem ponteiro compartilhado; `SA_SESSION_ID` preso ao projeto; `CAIDO_TOKEN` com opt-in; auditoria de configuração do projeto. Não é contenção contra um agente com shell ([relatório 48](../../architecture-review/48-runtime-security-hardening.md)) |
| **H2d-F2 — Credential-store/auto-config/probe vivo** | **PLANNED** (não iniciado) | — |
| **H3 — Piloto operacional integrado** | **NOT STARTED** | aceite depende da **integração Caido real** (History/Monitor/Copilot/Replay/Automate/Findings) + smoke + Record com proveniência; **não** depende de F5b |

## Leitura para o MVP

- O **núcleo e os módulos Caido existem e passam em testes offline**; o que falta para o MVP completo é a
  **integração Caido REAL** e a **aceitação agêntica (F4b-2)** em laboratório autorizado — ambas **NOT RUN**.
- **F5b (workflows nativos) permanece pós-MVP/V2** e **não bloqueia** H3.
- **Pi** tem validação real só em dados sintéticos; **Antigravity** é parcial. Nenhum está homologado para alvo real (ver [runtimes.md](runtimes.md)).
- **Caido na Omarchy (H2d-F2):** conectividade real **comprovada** para descoberta read-only; a cadeia
  History→Monitor→Copilot→Record está **BLOCKED** só por configuração de engagement (operador desbloqueia).
  Homologação **Windows corporativa** é procedimento separado (pendente).
