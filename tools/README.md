# tools/

Ferramentas determinísticas empacotadas.

- **`web-runtime/`** — Web Runtime do SYNAPSE. Fase **H1a-F1**: *HTTP Inspection Backend*
  (inspeção HTTP/HTML estático, Node stdlib puro, sem deps/processos filho). Contrato de
  capacidades reutilizável por backends visuais futuros (Playwright/CDP/Chrome DevTools
  MCP/Caido). **Não é navegador visual.** Ver `web-runtime/README.md` e
  `docs/architecture-review/18-h1a-f1-http-inspection.md`.

Os construtores de micro-ferramentas continuam como blueprints em `skills/forge/SKILL.md`
(B1–B15). Extração para pacotes determinísticos permanece prevista para H3.
