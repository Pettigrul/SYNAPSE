---
name: usar-engagement
description: >
  Seleciona o engagement ATIVO da sessão (ponteiro por projeto), reconstruindo o contexto de execução.
  Use quando o operador pedir para selecionar/trocar o pentest ativo — "usar engagement acme", "selecionar
  pentest", "trocar de engagement", "/usar-engagement", "use engagement". Seleção é SEMPRE explícita.
---

# Usar (selecionar) engagement

Interface **fina** sobre o CLI de workspace — a resolução do engagement, do projeto Caido (do manifesto) e o
confinamento de evidências/estado vivem no Node. Peça o **nome exato**. Execute:

```bash
node tools/workspace/cli.mjs use --name <nome>
```

- **Seleção explícita, nunca inferida.** Match **exato**; se não existir, o CLI lista candidatos — peça ao
  operador que escolha (não adivinhe, não pegue o primeiro/mais próximo).
- **Troca de engagement:** quando o CLI reporta `switched`/`requiresCleanContext`, **avise o operador** que o
  contexto do pentest anterior foi invalidado e **ofereça uma sessão limpa** (`/clear`). Não declare que o
  histórico foi apagado — a skill não apaga a conversa; apenas o ponteiro/estado do engagement muda.
- O ponteiro é por projeto ativado ou harness; `SA_SESSION_ID` cria outra sessão, presa ao projeto. Fora deles o CLI recusa
  (`no unambiguous project context`): repasse a orientação, não contorne. Reporte o `evidence dir` e o `caido
  project` que o CLI imprime. Sem seleção válida, operações dependentes de engagement permanecem bloqueadas.
