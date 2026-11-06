# Engagements, Layouts & Runtimes

> Como skills, tools, KB, agents, extensions, hooks e MCPs chegam ao runtime em cada modelo de organização, e
> o que está **comprovado** por runtime. Técnico: [cap. 18](../18-project-scoped-activation.md) (ativação),
> adapters em [`adapters/`](../../../adapters/), guias [Pi](pi-agent.md) e [Antigravity](antigravity.md). **Nada global é requisito; nenhuma migração é imposta.**

## Modelos de organização

| Modelo | Harness | Engagements | Como os recursos são disponibilizados |
|--------|---------|-------------|----------------------------------------|
| **A — interno** | repo central | dentro do repo (`engagements/`, git-ignored) | roda da **raiz**: skills (`.claude/skills`), dispatcher (`SKILL.md`), KB (`skills/`), tools, policies, hooks e MCP já estão no repo |
| **B — central + externos** | repo central | em `SA_ENGAGEMENT_ROOT` externo | igual a A (roda da raiz); só os **dados** do engagement ficam fora do repo |
| **C — ativação local** | repo central | projeto externo **ativado** | `activate` cria **symlinks** do projeto → harness central (skills/dispatcher/KB/tools/policies + `.claude/skills`/hooks/settings; por runtime: `pi` → `AGENTS.md` + `.pi/settings.json`, `antigravity` → `AGENTS.md` + `.agents/skills`, com o dispatcher e as 13 skills); **MCP** só com `--mcp` **e** `.mcp.json` central (não há hoje) |

- **Nunca** se copia skills/agents/tools/KB por engagement (no modelo C são **linkados**, não duplicados).
- **Ativar ≠ selecionar engagement ≠ autorizar alvo.** A seleção do engagement é sempre explícita (`use`) e presa ao lugar de
  onde foi feita: projeto ativado ou raiz do harness. Fora deles, nada é selecionado e `use` recusa.

## Matriz de portabilidade (honesta)

Níveis: **Doc**=documentado · **Impl**=implementado · **Det**=validação determinística (testes offline) ·
**Real**=validação em runtime real.

| Cenário | Doc | Impl | Det | Real | Limitações | Procedimento recomendado |
|---------|-----|------|-----|------|-----------|--------------------------|
| **Claude Code** (skills/hooks nativos) | ✅ | ✅ | ✅ (`test-skills` 62/62, `test-activation` 18/18 na camada de arquivos/CLI) | **VALIDATED REAL** (aceitação S4, `docs/architecture-review/41-s4-real-acceptance.md`) | skills são descobertas no início da sessão | A/B: rodar da raiz; C: `activate --project` e abrir a pasta |
| **Pi Agent** | ✅ | ✅ | ✅ (`test-runtime-links`, `test-runtime-contract`, `test-engagement-isolation`, `test-credential-scope`; `test-pi-*` com Pi instalado) | **VALIDATED REAL em dados sintéticos, com conclusão instável** (Pi 1.4.0, Linux, `--mode json`). NOT RUN: TUI, `/trust`, alvos reais, Caido, Windows, ops sob aprovação executadas | `.pi/settings.json` exige *trust*, e `-a` executa extensões do projeto; o `bash` do Pi não tem sandbox; o `HOME` real carrega também suas skills globais | C: `activate --runtime pi`, depois `pi -a` em projeto revisado ou `pi -na` com caminhos explícitos ([guia](pi-agent.md)) |
| **Antigravity** | ✅ | parcial (sem adapter de Bridge com estado) | ✅ (`test-runtime-links`, `test-cli-adapter`) | **PARCIAL** (agy 1.5.1): 13/13 skills, `AGENTS.md` e **abertura do dispatcher por `/security-auditor`** VALIDATED REAL (prompt natural nem sempre abre); seguir o dispatcher não verificado; cenários 3-11 **BLOCKED** sem interação; interativo NOT RUN | comando de shell sem interação é negado; execução negada ainda sai com código 0 e `status: SUCCESS`; `/investigar` **não** é protegido pela Bridge | C: `activate --runtime antigravity`, depois `agy` ([guia](antigravity.md)); **não homologado** |
| **Omarchy / Linux** | ✅ | ✅ | ✅ | parcial (CLIs/symlinks OK localmente) | — | symlinks nativos; fluxo do [quickstart](quickstart.md) |
| **Windows corporativo restrito** | ✅ | ✅ (CLIs) | ✅ (preflight/doctor) | **NOT RUN** | symlink exige *Developer Mode*/privilégio; sem ele a ativação local (C) falha | usar **Layout B** (rodar da raiz com `SA_ENGAGEMENT_ROOT`) **ou** habilitar Developer Mode; **nunca** copiar a KB nem instalar global |

> **Nenhum dos dois está homologado para alvo real.** O Pi tem validação real só em dados sintéticos: última passada completa 12/14 (S5 e S12 FAIL; as anteriores,
> 13/14 e 11/14; sem violação detectada), e o resultado varia entre passadas. O Antigravity é parcial.
> **Bridge:** o Pi tem adapter próprio; no Antigravity só há `tools/web-runtime/adapters/cli.mjs`, sem estado, que declara `operatorVerified: false`: a chamada vem do próprio agente. Em qualquer
> runtime, o Bridge restringe as ferramentas dele, não o agente.

## Limitações de symlink e caminhos no Windows

- A ativação local (P2) usa **symlinks absolutos**. No Windows, criar symlink de diretório exige
  `SeCreateSymbolicLinkPrivilege` (*Developer Mode* ou admin). Sem isso, `activate` falha.
- **Alternativa mínima sem contornar o "sem global":** opere pelo **Layout B** — abra/rode o SYNAPSE a partir
  da **raiz central** e use `SA_ENGAGEMENT_ROOT` apontando para a pasta externa do engagement. Não há
  duplicação da KB nem instalação global.
- Caminhos **com espaços** são suportados pelas CLIs (verificado em `test-activation`).
