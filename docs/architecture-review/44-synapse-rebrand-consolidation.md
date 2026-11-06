# 44 — SYNAPSE: rebranding, consolidação e prontidão para GitHub

> Execução da rodada "SYNAPSE — Repository Consolidation, Rebranding, Portability & Documentation".
> Estratégia escolhida pelo operador: **in-place agora + `mv` roteirizado no fim** (a renomeação física
> da raiz quebraria o CWD da sessão viva). **Nenhum commit/push executado.** Continua o plano do
> [43](43-repo-consolidation-plan.md). Data: 2026-11-06.

## Resumo

Produto rebrandeado para **SYNAPSE — Agentic Offensive Security Harness** ("Connect Intelligence.
Orchestrate Security.") sem quebrar nenhum contrato: README reescrito em inglês com banner e assets,
docs correntes rebrandeados, `.gitignore` endurecido e **validado**, script de migração seguro pronto.
Regressões: **26/26 suites offline + Validador 127/127**; 2 testes de integração Pi **NOT RUN** (exigem
Pi real). Runtimes prioritários **Pi/Antigravity** documentados como primários por design, com
homologação live honestamente marcada **NOT RUN**; Claude Code = **VALIDATED REAL**.

## 1. Estrutura definitiva (após o `mv` roteirizado)

```text
~/projetos/SYNAPSE/              ← raiz única (git init aqui; sem histórico anterior)
├── SKILL.md  README.md  manifest-h0.json  .gitignore  .env.example  .config.example
├── images/{banner,assets}/      ← banner oficial + 40 assets (sistema visual)
├── adapters/                    ← pi-agent · antigravity · claude-code (docs de runtime)
├── agents/ skills/ workflows/ references/ policies/ reports/
├── tools/{workspace,web-runtime,modes,preflight,activation}/
├── .claude/ .codex/             ← skills/hooks dos runtimes (versionáveis)
├── docs/{handbook,architecture-review}/
├── h0-staging/                  ← ARCHIVE (baseline histórico)
└── engagements/                 ← LOCAL (git-ignored)
```

## 2. Consolidação de diretórios

- **Decisão (Opção B do [43](43-repo-consolidation-plan.md)):** a pasta interna vira raiz única; o wrapper
  externo (`__MACOSX` + `.git`/`.agents`/`.aws`/`.codex` vazios) é descartado.
- **Git:** o `.git` externo segue **vazio** (revalidado) → **sem histórico a preservar** → `git init` novo.
- **Execução:** roteirizada em [`migrate-to-synapse.sh`](archive/migrate-to-synapse.sh) (backup verificado → `mv` →
  limpeza do wrapper → fix de path → `git init` → **gate de sensíveis** → regressões → PARA antes do commit).
  Sintaxe validada (`bash -n`). **Não executado nesta sessão** (roda sem sessão viva segurando o CWD).

## 3. Inventário de rebranding (decisões)

| Classe | Itens | Ação |
|---|---|---|
| **RENAME (aplicado)** | "HackBot" em 14 docs correntes (handbook, references/operational-fluidity, adapters/antigravity, 3 `.claude/skills`) | → "SYNAPSE" (`\bHackBot\b`), `.hackbot` minúsculo preservado |
| **RENAME (aplicado)** | README.md inteiro; `.gitignore` header; títulos "SYNAPSE (SecurityAuditor)" em handbook/README e 01 | reescrito/atualizado |
| **MIGRATE (aplicado)** | clone-targets `~/harness/SecurityAuditor`, `~/projetos/SecurityAuditor/...` em quickstart/18/06/17 | → `SYNAPSE` |
| **MIGRATE (roteirizado)** | `SA_ENGAGEMENT_ROOT` em `.env`; `root` em `baseline/manifest.json` | atualizado pelo script na migração |
| **COMPAT (preservado)** | `name: security-auditor` (SKILL.md), `createSecurityAuditorExtension` (API), `SA_*` (83/51/19), `.hackbot/`, `.engagement.json`, `sa-workflow-ir`, `.hackbot-activation`, `%LOCALAPPDATA%\SecurityAuditor\` (bootstrap.bat) | **não renomeados** — contratos técnicos |
| **HISTORICAL (preservado)** | "HackBot"/"SecurityAuditor" em **29** arquivos `docs/architecture-review/` | intactos (rastreabilidade) |
| **RENAME-pending (deferido)** | nome-produto "SecurityAuditor" em prosa de contrato KB (`references/template-technique`, `native-tooling-doctrine`, `help`, `pattern-index`, `verification-contract`, `flows-scope`, `template-files`) | **não varrido** — evita drift semântico na KB (§14); pass dedicado futuro |
| **REVIEW** | `SKILL.md description` ainda descreve "Windows native-tooling" (trigger do dispatcher) | **não reescrito** — é contrato de descoberta; modernização exige round de produto próprio |

## 4. Identificadores legados preservados (compatibilidade)

`security-auditor` (nome da skill, usado por descoberta/ativação e por `test-skills` 62/62) ·
`createSecurityAuditorExtension` (API injeção de dependência) · `SA_ENGAGEMENT_ROOT`/`SA_SESSION_ID`/
`SA_SKIP_ENV_FILE` · `.hackbot/`, `.hackbot-activation.json`, `.engagement.json`, `sa-workflow-ir/1`.
**Motivo:** renomear quebraria descoberta, testes e estado persistido. SYNAPSE é a marca; estes são o
contrato técnico interno. Migração futura (se houver ganho) seria um round separado com plano de compat.

## 5. Caminhos corrigidos

- Docs correntes: clone-targets → SYNAPSE (quickstart, 18, 06, 17).
- Roteirizado (migração): `.env` `SA_ENGAGEMENT_ROOT` e `baseline/manifest.json.root` → novo root.
- **Dependência de path portável:** recomenda-se, no `.env.example`, orientar `SA_ENGAGEMENT_ROOT`
  relativo ao repo (evita quebra em clone corporativo). `.claude/skills/*` são **dirs reais** (não
  symlinks) → portáveis em Linux/Windows.

## 6. Configurações locais que exigiram atualização

Apenas `.env` (local, git-ignored) via script, **sem imprimir valores**. Nenhuma credencial exposta ou
rotacionada. `.config` por engagement permanece local e ignorado.

## 7. Banner e identidade visual

Banner oficial em `images/banner/SynapseBanner.png` (2172×724) no topo do README. Sistema visual:
40 assets em `images/assets/` — **4 dividers** full-width (neural/synapse-chip/code/pipeline, alternados
por tema entre seções), **cenas conceituais** (orchestration_hub→Arquitetura, knowledge_graph→Conceitos,
agent_operator→Overview, security_testing→Capabilities, panel_agent_loop→Modos, network_router→Caido),
**19 ícones** (tabelas/rodapé). Paleta cyan `#00F5FF` / magenta `#FF00D4` / violet `#9D4EDD` / dark
`#0B0B14`. Todos os 25 refs de imagem do README resolvem.

## 8–11. README, documentação, diagramas

- **README.md** (pt-BR, profissional — a pedido do operador): hero+banner+badges estáticos verdadeiros, Overview, Core Concepts,
  Capabilities (status honesto), Architecture, Installation (**Pi/Antigravity em destaque**, Claude Code
  adicional), Configuration, Quick Start, Operational Modes, Commands & Skills, Pentest Workflows, Caido,
  Project Structure, Testing, Documentation, Roadmap, Limitations, Development.
- **3 diagramas Mermaid** (GitHub-compat): arquitetura (runtimes→dispatcher→KB/bridge/workspace), loop
  Copilot/Autopilot, fluxo de pentest. Fundamentados no código real.
- **Índice de documentação** no README (handbook, runtimes, readiness, architecture, Caido, roadmap).
- Docs correntes rebrandeados; handbook/architecture-review preservados; históricos intactos.

## 12–13. Matriz de compatibilidade + instalação por runtime

Matriz completa no README (§Commands & Skills). Síntese honesta:

| | Pi Agent | Antigravity | Claude Code |
|---|---|---|---|
| Descoberta/ativação/dispatcher | IMPLEMENTED | IMPLEMENTED | **VALIDATED REAL** |
| Workspace/Caido/Copilot/Autopilot | TESTED OFFLINE | TESTED OFFLINE | **VALIDATED REAL** |
| **Live end-to-end** | **NOT RUN** | **NOT RUN** (runtime indisponível) | **VALIDATED REAL** |

Fatos de instalação reais (dos adapter docs): Pi via `pi install <path>`/`pi --skill <path>`, lê
`AGENTS.md`/`CLAUDE.md` (Flow 8), skills em `~/.pi/agent/skills/`; Antigravity via `AGENTS.md`
(end-to-end PENDENTE); Claude Code via `.claude/skills/` (descoberta no início da sessão).

## 14. `.gitignore` auditado

Header → SYNAPSE. **Adicionado:** `node_modules/`, `.aws/`, `.agents/`, `**/.sa-state/`, `**/.hackbot/`,
`**/.whitebox-access.log`, `__MACOSX/`, `._*`, `*.zip`, `*.tar*`. **Validado** em repo descartável:
`.env`, `node_modules`, `engagements/*`, `.config`, `.whitebox-access.log`, `.aws`, `.agents`, `__MACOSX`,
arquivos comprimidos → **IGNORED**; `.env.example`, `.claude/skills/*/SKILL.md`, docs, adapters, SKILL.md,
README → **tracked**. Nada de skills/adapters/flows ignorado.

## 15. Inventário excluídos / arquivados

| Classe | Itens |
|---|---|
| **DELETE CANDIDATE** | wrapper externo: `__MACOSX/` (93 itens), `.git`/`.agents`/`.aws`/`.codex` vazios (descartados pelo script) |
| **ARCHIVE** | `h0-staging/` (40 arquivos, baseline histórico) — manter versionado como histórico |
| **IGNORE** | `node_modules/` (14M), `engagements/` (ENG-B, ENG-A) |
| **REVIEW** | `intake/` (workflow raiju — avaliar versionar só estrutura) |

Nada de código/skills/agents/policies/references/testes/docs úteis removido.

## 16. Auditoria de sensibilidade (caminhos/categorias — sem valores)

| Caminho | Categoria | Risco | Estado |
|---|---|---|---|
| `.env` | Caido PAT + URLs | ALTO | git-ignored ✓ (mode 600) |
| `engagements/**` (findings, `.config`, `.whitebox-access.log`, binding Caido) | dados de engagement | ALTO | git-ignored ✓ |
| `.aws/`, `.agents/` (externos, vazios) | credenciais potenciais | ALTO se preenchidos | ignorados + descartados ✓ |
| Histórico Git | — | **NENHUM** | não há histórico (slate limpo) |

Nenhum segredo impresso ou copiado para relatório. Distinção: não há segredos "no histórico" (não existe
repo); os sensíveis são arquivos **locais não rastreados**, todos cobertos pelo `.gitignore`.

## 17. Testes e regressões

- **Validador KB:** `overall OK — T=112/112, B=15/15, total=127/127`.
- **Suites offline: 26/26** verdes (workspace 16+18+31+16+13+62, modes 18, preflight 15+28, activation 18,
  web-runtime bridge/authz/browser/sessions/race/concurrent/convergence/e2e/investigation/pi-adapter +
  caido 21/active 27/copilot 24/monitor 24/investigation 20/workflow 17).
- **NOT RUN (gated):** `test-pi-entry` (exige `PI_PKG_DIR`), `test-pi-rpc` (exige `PI_BINARY`) — integração
  com Pi real; **não é regressão** (causa = env var ausente, confirmada). Consistente com "Pi live NOT RUN".
- `.gitignore` validado end-to-end; 25 refs de imagem e links docs do README resolvem; 3 Mermaid OK.

## 18. Portabilidade

Node ≥ 22; deps reproduzíveis (`npm install` em `tools/web-runtime`). `.claude/skills/*` = dirs reais
(sem symlink → OK Windows). Ativação local por projeto (sem install global). Pendências de portabilidade:
`SA_ENGAGEMENT_ROOT` relativo (recomendado), e `%LOCALAPPDATA%\SecurityAuditor\` do `bootstrap.bat`
(COMPAT — renomear exigiria mudar o tool). Homologação **Windows corporativa** = procedimento separado.

## 19. Pendências reais

1. **`mv` da raiz + primeiro commit:** rodar `migrate-to-synapse.sh` (operador), fora da sessão viva.
2. **Homologação live Pi e Antigravity:** **NOT RUN** (contratos TESTED OFFLINE; falta rodar ponta a ponta).
3. **RENAME-pending** da prosa "SecurityAuditor" em docs de contrato KB (`references/*`) — pass dedicado.
4. **`SKILL.md description`** ainda com framing "Windows native-tooling" — modernização = round de produto.
5. **Análise in-scope real** (herdada de S4) — data-gated, sem defeito.
6. `SA_ENGAGEMENT_ROOT` → relativo no `.env.example` (portabilidade).

## 20. Instruções para o primeiro commit (GitHub privado)

```bash
bash docs/architecture-review/migrate-to-synapse.sh      # backup+mv+init+gate+regressões (NÃO commita)
cd ~/projetos/SYNAPSE
git status                                                # revisar conjunto staged
git ls-files | grep -E '\.env$|engagements/|\.config$|node_modules/'   # DEVE ser vazio
git commit -m "SYNAPSE: initial import (formerly SecurityAuditor/HackBot)"
git remote add origin <URL_PRIVADA>                       # repositório PRIVADO
git push -u origin main                                   # só após revisão completa
```

**Nada foi commitado, movido fisicamente ou publicado nesta sessão.** O produto está íntegro
(127/127, 26/26). Aguardando sua instrução para executar a migração/commit.
