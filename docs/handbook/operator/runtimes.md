# Engagements, Layouts & Runtimes

> Como skills, tools, KB, agents, extensions, hooks e MCPs chegam ao runtime em cada modelo de organização, e
> o que está **comprovado** por runtime. Técnico: [cap. 18](../18-project-scoped-activation.md) (ativação),
> adapters em [`adapters/`](../../../adapters/). **Nada global é requisito; nenhuma migração é imposta.**

## Modelos de organização

| Modelo | Harness | Engagements | Como os recursos são disponibilizados |
|--------|---------|-------------|----------------------------------------|
| **A — interno** | repo central | dentro do repo (`engagements/`, git-ignored) | roda da **raiz**: skills (`.claude/skills`), dispatcher (`SKILL.md`), KB (`skills/`), tools, policies, hooks e MCP já estão no repo |
| **B — central + externos** | repo central | em `SA_ENGAGEMENT_ROOT` externo | igual a A (roda da raiz); só os **dados** do engagement ficam fora do repo |
| **C — ativação local** | repo central | projeto externo **ativado** | `activate` cria **symlinks** do projeto → harness central (skills/dispatcher/KB/tools/policies + `.claude/skills`/hooks/settings); **MCP** só com `--mcp` **e** `.mcp.json` central (não há hoje) |

- **Nunca** se copia skills/agents/tools/KB por engagement (no modelo C são **linkados**, não duplicados).
- **Ativar ≠ selecionar engagement ≠ autorizar alvo.** A seleção do engagement é sempre explícita (`use`).

## Matriz de portabilidade (honesta)

Níveis: **Doc**=documentado · **Impl**=implementado · **Det**=validação determinística (testes offline) ·
**Real**=validação em runtime real.

| Cenário | Doc | Impl | Det | Real | Limitações | Procedimento recomendado |
|---------|-----|------|-----|------|-----------|--------------------------|
| **Claude Code** (skills/hooks nativos) | ✅ | ✅ | ✅ (`test-skills` 62/62, `test-activation` 18/18 na camada de arquivos/CLI) | **VALIDATED REAL** (aceitação S4, `docs/architecture-review/41-s4-real-acceptance.md`) | skills são descobertas no início da sessão | A/B: rodar da raiz; C: `activate --project` e abrir a pasta |
| **Pi Agent** | ✅ | parcial | — | **NOT RUN** | registro de skills é **global** (`~/.pi`) — **não feito** (proibido); local via `pi --skill <path>` ou context-files | B (raiz) ou `pi --skill <projeto>/SKILL.md`; **não homologado** |
| **Antigravity** | ✅ (contrato `AGENTS.md`) | — | — | **BLOCKED** | runtime indisponível no host de validação | ler recursos linkados via `AGENTS.md`; **não homologado** |
| **Omarchy / Linux** | ✅ | ✅ | ✅ | parcial (CLIs/symlinks OK localmente) | — | symlinks nativos; fluxo do [quickstart](quickstart.md) |
| **Windows corporativo restrito** | ✅ | ✅ (CLIs) | ✅ (preflight/doctor) | **NOT RUN** | symlink exige *Developer Mode*/privilégio; sem ele a ativação local (C) falha | usar **Layout B** (rodar da raiz com `SA_ENGAGEMENT_ROOT`) **ou** habilitar Developer Mode; **nunca** copiar a KB nem instalar global |

> **Pi e Antigravity NÃO estão homologados** em runtime — apenas contrato/arquivos.

## Limitações de symlink e caminhos no Windows

- A ativação local (P2) usa **symlinks absolutos**. No Windows, criar symlink de diretório exige
  `SeCreateSymbolicLinkPrivilege` (*Developer Mode* ou admin). Sem isso, `activate` falha.
- **Alternativa mínima sem contornar o "sem global":** opere pelo **Layout B** — abra/rode o SYNAPSE a partir
  da **raiz central** e use `SA_ENGAGEMENT_ROOT` apontando para a pasta externa do engagement. Não há
  duplicação da KB nem instalação global.
- Caminhos **com espaços** são suportados pelas CLIs (verificado em `test-activation`).
