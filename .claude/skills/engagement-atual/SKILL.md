---
name: engagement-atual
description: >
  Mostra o engagement ATIVO da sessão (nome, diretório, projeto Caido, evidências) ou avisa que não há
  seleção. Use quando o operador perguntar qual o pentest ativo — "engagement atual", "qual engagement está
  ativo", "status do engagement", "/engagement-atual", "current engagement". Read-only; não altera nada.
---

# Engagement atual

Interface **fina** e **read-only** sobre o CLI de workspace. Execute e mostre a saída:

```bash
node tools/workspace/cli.mjs active
```

- Resolução: `SA_ENGAGEMENT` (override) > ponteiro de sessão (`SA_SESSION_ID`) > nenhum. Sem troca silenciosa.
- Se **não houver** seleção, o CLI diz explicitamente — informe o operador que operações dependentes de
  engagement estão bloqueadas até `/usar-engagement`. Consultas read-only e `/verificar-ambiente` seguem OK.
- Por ser read-only, funciona sem engagement ativo e **não** cria arquivos nem autoriza operações.
