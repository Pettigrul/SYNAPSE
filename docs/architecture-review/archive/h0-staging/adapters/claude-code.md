# Adapter — Claude Code

Carrega o SecurityAuditor como Agent Skill nativo do Claude Code.

- **Descoberta:** colocar (ou linkar) `skills/<cat>/` em `~/.claude/skills/` ou `.claude/skills/` do projeto. Cada `SKILL.md` tem frontmatter `name`/`description` (contrato verificado na Fase 0.2).
- **Roteamento:** a `description` (derivada das keywords do `references/pattern-index.md`) é o gatilho nativo; o `pattern-index` permanece como fonte determinística de referência.
- **Policies:** `policies/` são injetadas verbatim em todo brief (Flows 9/12).
- **Conhecimento NÃO é copiado:** este adapter só aponta para `skills/`.
