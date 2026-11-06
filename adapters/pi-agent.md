# Adapter — Pi Agent

Carrega o SYNAPSE como skill do Pi (formato idêntico ao Claude — verificado na Fase 0.2). Guia de uso: [`docs/handbook/operator/pi-agent.md`](../docs/handbook/operator/pi-agent.md).

- **Ativação:** `node <harness>/tools/activation/cli.mjs activate --project <dir> --runtime pi` linka `AGENTS.md` e `.pi/settings.json` (skills + extensão), sem instalação global. `pi install <path>` registra globalmente em `settings.json`: não recomendado e não exercido.
- **Abertura:** `pi -a` a partir de projeto revisado (ou `/trust`); `-a` executa extensões do projeto, então em repositório não revisado use `pi -na --skill <harness>/SKILL.md --skill <harness>/.claude/skills -e <harness>/tools/web-runtime/adapters/pi/extension-pi.mjs`. O `.pi/settings.json` é protegido por *trust*; modos não interativos o ignoram sem `-a`. Skills rodam como `/skill:<nome>`. Passe `--provider` e `--model`: o padrão do Pi pode não ser OpenAI.
- **Da raiz do harness:** `pi --skill SKILL.md -e tools/web-runtime/adapters/pi/extension-pi.mjs`.
- **Ferramentas:** a extensão carrega o Capability Bridge; o Execution Context vem de `SECAUDIT_BRIDGE_CONTEXTS=<ctx.json>`, escrito pelo operador.
- **Context-files:** o Pi lê `AGENTS.md`/`CLAUDE.md`. O `bootstrap` gera `AGENTS.md` na raiz do engagement quando o marcador declara `pi` ou `antigravity` — mesmo conteúdo, não mantido à mão.
- **Degradação:** sem dispatch paralelo, o brief vira fase sequencial (já previsto em `workflows/flows-agents.md`).
- **Conhecimento NÃO é copiado:** aponta para `skills/`.
- **Status:** VALIDATED REAL em dados sintéticos, com conclusão instável (Pi 1.4.0, Linux, `--mode json`): última passada completa 12/14 (S5 e S12 FAIL; as anteriores, 13/14 e 11/14; sem violação detectada), e o resultado varia entre passadas. NOT RUN: TUI interativa, `/trust`, alvos reais, Caido, Windows, operações sob aprovação de fato executadas.
- **Limite:** o `bash` do Pi não tem sandbox e alcança o `.env` central. O Bridge restringe as ferramentas dele, não o agente; contenção real exige isolamento no sistema operacional. Fronteiras em [guia](../docs/handbook/operator/pi-agent.md#fronteiras-o-que-cada-camada-controla).
