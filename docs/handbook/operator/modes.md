# Guia de modos operacionais

> `/modo` define o **comportamento** da sessão. Técnico completo: [cap. 19](../19-operational-modes.md).
> **Modo é controle comportamental, NÃO concessão de permissões.**

## Copilot × Autopilot supervisionado

| | **Copilot** (padrão) | **Autopilot supervisionado** |
|---|---|---|
| Consulta/análise/hipóteses/KB/preparação/recomendações/Records | ✅ | ✅ |
| Planeja autonomamente rumo a um **objetivo delimitado** do operador | ❌ | ✅ |
| **Propõe** operações ativas | só a pedido explícito | ✅ |
| **Executa** op ativa | **sempre** sob Approval Gate | **sempre** sob Approval Gate |
| Op ativa espontânea / concede capability / ignora gate / Whitebox auto | ❌ | ❌ |
| Execução autônoma **contínua** | ❌ | ❌ |

## Modo padrão e seleção
- **Copilot é o padrão seguro** (quando não há estado). **Autopilot exige seleção explícita.**
- `node tools/modes/cli.mjs status | copilot | autopilot | clear` (ou `/modo …`; no Pi, `/skill:modo …`).

## Persistência por sessão
- Estado em `<engagement>/.hackbot/mode[-<SA_SESSION_ID>].json` (padrão existente; **sem** DB novo).
- Isolado por `SA_SESSION_ID`; **não** vive no `.env` global. Em projeto ativado sem essa variável, a sessão deriva do
  marcador (`prj-<hash>`), então cada projeto tem o próprio modo mesmo no mesmo engagement.

## Troca de engagement
- `use` em outro engagement limpa o modo da sessão → o novo engagement começa em **copilot**; exige reconstrução de contexto.
- **Nunca** se declara o histórico do LLM limpo sem reinicialização real da sessão.

## Objetivos e limites (Autopilot)
- Recebe **objetivo delimitado** do operador; encerra ao atingir objetivo/limite/condição de parada.
- Orçamentos/limites/concorrência/cancelamento continuam no **Execution Context** (não no modo).

## Capabilities e Approval Gate
- O autorizador é **`ctx.approvals`** (operador) + `allowedCapabilities`. O LLM **não** se autoriza; uma
  string/booleano do agente **não** é autorização. O Bridge **não importa** o módulo de modos.

## O que o Autopilot faz hoje / do que depende
- **Hoje (validado offline):** é selecionável, aplicado em `/iniciar-pentest` e `/investigar`, e **gated**
  deterministicamente (sem auto-exec, sem auto-Whitebox, aprovação obrigatória). Readiness **A/B/C** ✅.
- **Depende de H2b-F4b-2:** autorização de objetivo ancorada no operador, orçamento por campanha fim-a-fim e
  **execução agêntica real em laboratório Caido** (readiness **F4b-2 = NOT RUN**). Em lab sintético, a cadeia até o gate foi
  validada no Claude Code (S4) e no Pi (2 tarefas seguras, parada no gate Class A, com o seletor `next` nomeado no prompt);
  no Antigravity está BLOCKED sem interação. Sobre alvo real, **Autopilot NÃO é validado ponta a ponta**.
- **Pós-MVP:** autopilot contínuo/durável/agendado. Critérios de aceite completos em [cap. 19 §19.8](../19-operational-modes.md).
