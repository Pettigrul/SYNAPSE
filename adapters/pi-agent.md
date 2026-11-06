# Adapter — Pi Agent

Carrega o SYNAPSE como skill do Pi (formato idêntico ao Claude — verificado na Fase 0.2).

- **Descoberta:** carga explícita isolada via `pi --skill <path>/SKILL.md` (usado nos testes da Fase 0.2). `pi install <path>` registra globalmente em `settings.json`: não recomendado e não exercido.
- **Ferramentas:** `pi -e tools/web-runtime/adapters/pi/extension-pi.mjs` carrega o Capability Bridge.
- **Context-files:** o Pi lê `AGENTS.md`/`CLAUDE.md` (gerados na raiz do engagement pelo Flow 8 ou por `tools/workspace/cli.mjs bootstrap --runtime agents`) — mesmo conteúdo, não mantido à mão.
- **Degradação:** sem dispatch paralelo, o brief vira fase sequencial (já previsto em `workflows/flows-agents.md`).
- **Conhecimento NÃO é copiado:** aponta para `skills/`.
