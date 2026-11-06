---
name: listar-engagements
description: >
  Lista os engagements (pentests) sob SA_ENGAGEMENT_ROOT e marca o ativo. Use quando o operador pedir para
  listar/ver os engagements existentes — "listar engagements", "quais pentests tenho", "mostrar engagements",
  "/listar-engagements", "list engagements".
---

# Listar engagements

Interface **fina** sobre o CLI de workspace — toda a validação/lógica vive no Node (`tools/workspace/`),
não neste prompt. Execute a partir da **raiz do harness** e mostre a saída ao operador:

```bash
node tools/workspace/cli.mjs list
```

- Os engagements podem estar **fora do repositório** (base em `SA_ENGAGEMENT_ROOT`). O harness é único.
- `*` marca o engagement ativo (resolvido por `SA_ENGAGEMENT` > ponteiro de sessão). Não infira seleção.
- Se `SA_ENGAGEMENT_ROOT` não estiver definido, o CLI devolve erro acionável — repasse-o literalmente.
