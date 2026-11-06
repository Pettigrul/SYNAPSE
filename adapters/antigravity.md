# Adapter — Google Antigravity

Guia de uso: [`docs/handbook/operator/antigravity.md`](../docs/handbook/operator/antigravity.md).

- **Ativação:** `node <harness>/tools/activation/cli.mjs activate --project <dir> --runtime antigravity` linka `AGENTS.md` e `.agents/skills` (as mesmas 13 skills, sem cópia e sem instalação global).
- **Abertura:** `agy` a partir do projeto, ou sem interação `agy -p "<prompt>" --model <id> --output-format json|stream-json --print-timeout 120s`. `agy models` lista os modelos; `agy -p /skills` lista as skills sem turno de modelo.
- **Roteamento/Policies:** idênticos aos demais no contrato. O carregamento do `AGENTS.md` está verificado; o seguimento do dispatcher, não (cenário 2 FAIL com `gemini-3.8-flash-low`).
- **Bridge:** não há adapter. `tools/web-runtime/adapters/cli.mjs` é o único caminho (`capabilities.*`, `http.*` GET/HEAD), com escopo fornecido por quem chama: **não** é gate do operador. As ops com estado do `/investigar` não têm caminho.
- **Conhecimento NÃO é copiado:** aponta para `skills/`.
- **Status:** PARCIAL, não homologado (antigravity-cli 1.5.1). VALIDATED REAL: 13/13 skills descobertas, `AGENTS.md` carregado, corpo de skill expandido, arquivos lidos. BLOCKED: tudo que exige comando de shell sem interação (cenários 3-11), por negação do runtime; uma execução negada ainda sai com código 0 e `status: SUCCESS`, então examine `denied_actions`. Cenário 12 PASS cobre só falha de leitura; cenário 13 é PARTIAL. NOT RUN: `agy` interativo.
