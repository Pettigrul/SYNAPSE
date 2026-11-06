# Adapter — Claude Code

Carrega o SYNAPSE como Agent Skill nativo do Claude Code.

- **Descoberta:** `.claude/skills/` do repositório, ou de um projeto ativado com `tools/activation/cli.mjs activate` (nunca instalação global; `claude-code` é o runtime da primeira ativação sem `--runtime`, e uma reativação sem a flag mantém o marcador). Cada `SKILL.md` tem frontmatter `name`/`description` (contrato verificado na Fase 0.2).
- **Roteamento:** a `description` (derivada das keywords do `references/pattern-index.md`) é o gatilho nativo; o `pattern-index` permanece como fonte determinística de referência.
- **Policies:** `policies/` são injetadas verbatim em todo brief (Flows 9/12).
- **Conhecimento NÃO é copiado:** este adapter só aponta para `skills/`.
