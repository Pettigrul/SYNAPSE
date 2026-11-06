---
name: modo
description: >
  Seleciona ou consulta o MODO operacional da sessão do engagement — Copilot (assistência interativa, padrão
  seguro) ou Autopilot supervisionado (planeja/propõe sob os gates existentes). Use quando o operador quiser
  ver ou mudar o comportamento do SYNAPSE — "modo", "modo status", "modo copilot", "modo autopilot", "/modo",
  "set mode". Selecionar um modo NÃO concede capabilities, NÃO autoriza alvo e NÃO inicia operação.
---

# /modo — modo operacional da sessão

Interface **fina** sobre o CLI de modos — o estado (por `engagementId`+`SA_SESSION_ID`) e o envelope de
comportamento vivem no Node (`tools/modes/`). O modo é um **comportamento**, não uma autorização.

> **Descoberta (Claude Code):** o comando é **`/modo`** (PT); `/mode` (EN) é um **alias** que encaminha para cá.
> O Claude Code descobre as skills de `.claude/skills/` **no início da sessão** — se `/modo` não aparecer numa
> sessão aberta **antes** desta skill existir, **reinicie a sessão** para atualizar a descoberta. Para conferir
> as skills instaladas: `node tools/preflight/cli.mjs doctor` (fato `claudeSkills`).

```bash
node tools/modes/cli.mjs status        # modo atual, engagement/sessão, capacidades, limitações
node tools/modes/cli.mjs copilot       # padrão seguro (assistência interativa)
node tools/modes/cli.mjs autopilot     # supervisionado (planeja/propõe; execução sempre sob gates)
```

## Copilot (padrão seguro)
**Execução assistida pelo operador** (não modo somente consultivo). Quando o operador pedir, **execute** o
trabalho permitido (Class R): consulta do engagement, análise de HTTP History, interpretação do Copilot,
correlação de evidências, hipóteses, consulta à KB, preparação de testes, atualização de documentos e
Investigation Records — persistindo os resultados, em vez de parar na recomendação. **Não** inicia operações
ativas (Class A) espontaneamente; operações pedidas explicitamente continuam sujeitas aos gates. Ver
`references/operational-fluidity.md`.

## Autopilot supervisionado
Recebe um **objetivo delimitado** do operador e **encadeia** as atividades permitidas pelo loop de
`references/autopilot-loop.md` (estado → próxima tarefa (`cli.mjs next`) → capability → permissão → executar →
analisar → persistir → replanejar), **sem** confirmação conversacional redundante a cada etapa. **Propõe e
executa** operações permitidas (Class R); **cada** ação sensível (Class A) continua exigindo **aprovação por
ação**. Registra resultados/evidências e **encerra** ao atingir objetivo/limite/orçamento/falha/cancelamento
(antes, executa tarefas **independentes** ainda permitidas). Não contorna gates nem acessa Whitebox.

- **Nenhum modo concede capability nova**, ignora Scope Guard/Approval Gate, associa projeto Caido sozinho,
  acessa Whitebox automaticamente ou excede orçamento/limites/concorrência. O LLM **não** se autoriza; uma
  string/booleano do agente **não** é autorização.
- **Pertence à sessão do engagement** (não ao `.env`); trocar de engagement invalida o modo anterior
  (volta a Copilot) e exige reconstrução de contexto — sem alegar limpeza do histórico do LLM sem reinício real.
- Selecionar modo **não** dispara Replay/Race/qualquer op ativa. Respeitado por `/iniciar-pentest` e
  `/investigar`. **Honestidade:** Autopilot real ponta-a-ponta **não** é validado nesta rodada (lab = NOT RUN).
  Ver handbook cap. 19 (modos) e a matriz de readiness.
