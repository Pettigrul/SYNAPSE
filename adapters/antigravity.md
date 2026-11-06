# Adapter — Google Antigravity

Guia de uso: [`docs/handbook/operator/antigravity.md`](../docs/handbook/operator/antigravity.md).

- **Ativação:** `node <harness>/tools/activation/cli.mjs activate --project <dir> --runtime antigravity` linka `AGENTS.md` e `.agents/skills` (as 13 skills e o dispatcher `security-auditor`, por links, sem cópia e sem instalação global).
- **Abertura:** `agy` a partir do projeto, ou sem interação `agy -p "<prompt>" --model <id> --output-format json|stream-json --print-timeout 120s`. `agy models` lista os modelos; `agy -p /skills` lista as skills sem turno de modelo.
- **Roteamento/Policies:** idênticos aos demais no contrato. `AGENTS.md` verificado; `/security-auditor` carrega o dispatcher, por evento `read_file` e marcador aleatório (`gemini-3.8-flash-low`); o prompt natural o abre na maioria das execuções, não em todas. Seguir o dispatcher não está verificado.
- **Bridge:** não há adapter com estado e os fluxos **não** são protegidos por ela: sem ferramentas `securityauditor_*`, Scope Guard e Approval Gate não se aplicam. `tools/web-runtime/adapters/cli.mjs` é o único caminho (`capabilities.*`, `http.*` GET/HEAD, sem estado): com `SECAUDIT_BRIDGE_CONTEXTS`, preso ao engagement selecionado no projeto; sempre com `operatorVerified: false`, pois quem chama é o próprio agente. As ops com estado do `/investigar` não têm caminho.
- **Conhecimento NÃO é copiado:** aponta para `skills/`.
- **Status:** PARCIAL, não homologado (antigravity-cli 1.5.1). VALIDATED REAL: 13/13 skills e o dispatcher descobertos, `AGENTS.md` carregado, `SKILL.md` aberto, corpo de skill expandido, arquivos lidos. BLOCKED: tudo que exige comando de shell sem interação (cenários 3-11), por negação do runtime; uma execução negada ainda sai com código 0 e `status: SUCCESS`, então examine `denied_actions`. Cenário 12 PASS cobre só falha de leitura; cenário 13 é PARTIAL. NOT RUN: `agy` interativo.
