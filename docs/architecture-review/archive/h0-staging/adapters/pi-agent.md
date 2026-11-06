# Adapter — Pi Agent

Carrega o SecurityAuditor como skill do Pi (formato idêntico ao Claude — verificado na Fase 0.2).

- **Descoberta:** `pi install <path>` registra em `settings.json`, ou carga explícita isolada via `pi --skill <path>` (usado nos testes da Fase 0.2). Diretório de skills nativo: `~/.pi/agent/skills/`.
- **Context-files:** o Pi lê `AGENTS.md`/`CLAUDE.md` (gerados pelo Flow 8) — mesmo conteúdo, não mantido à mão.
- **Degradação:** sem dispatch paralelo, o brief vira fase sequencial (já previsto em `workflows/flows-agents.md`).
- **Conhecimento NÃO é copiado:** aponta para `skills/`.
