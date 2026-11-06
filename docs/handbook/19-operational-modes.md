# 19 — Modos Operacionais: Copilot & Autopilot Supervisionado (P3)

> A skill `/modo` define o **comportamento** da sessão do engagement — **Copilot** (assistência interativa,
> padrão seguro) ou **Autopilot supervisionado** (planeja/propõe sob os gates existentes). O modo **não** é
> autorização: não concede capability, não ignora gate, não autoriza alvo e **nunca** chega ao Capability
> Bridge. Sem novo dispatcher/coordenador/framework/DB. Par dos cap. 16–18. ✅🧪 `test-modes.mjs` **18/18**,
> `test-skills.mjs` **58/58**.

## 19.1 Modos disponíveis e diferenças operacionais

| | **Copilot** (padrão) | **Autopilot supervisionado** |
|---|---|---|
| Consulta engagement/HTTP History/Copilot, hipóteses, KB, preparação, recomendações, Investigation Records | ✅ | ✅ |
| Planejamento autônomo rumo a um **objetivo delimitado** do operador | ❌ | ✅ |
| **Propor** operações ativas | só a pedido explícito | ✅ (propõe) |
| **Executar** operação ativa | **sempre** sob Approval Gate | **sempre** sob Approval Gate |
| Operações ativas espontâneas | ❌ nunca | ❌ nunca |
| Concede capability / ignora gate / Whitebox automático | ❌ | ❌ |
| Execução autônoma **contínua** | ❌ | ❌ (pós-MVP) |

O envelope de comportamento (`modeEnvelope`) é explícito: para **ambos** os modos `grantsCapabilities=false`,
`bypassesGates=false`, `spontaneousActiveOps=false`, `requiresApprovalForActiveOps=true`, `autoWhitebox=false`,
`continuousAutopilot=false`. A **única** diferença é `autonomousPlanning`/`mayProposeActiveOps`.

## 19.2 Como selecionar e consultar

```bash
node tools/modes/cli.mjs status        # modo atual + engagement/sessão + capacidades + limitações
node tools/modes/cli.mjs copilot       # volta ao padrão seguro
node tools/modes/cli.mjs autopilot     # supervisionado (não concede nada; não inicia nada)
node tools/modes/cli.mjs clear         # remove o estado → default (copilot)
```

Skill fina equivalente: **`/modo`** (`status|copilot|autopilot`).

## 19.3 Interação com engagement e sessão

- O modo **pertence à sessão do engagement** (`engagementId` + `SA_SESSION_ID`), **não** ao `.env` global.
  Estado em `<engagement>/.hackbot/mode[-<SA_SESSION_ID>].json` (padrão existente, confinado; sem DB novo).
- **Copilot é o padrão** quando não há estado. **Autopilot exige seleção explícita.**
- **Sessões concorrentes isoladas** por `SA_SESSION_ID`. **Troca de engagement invalida** o modo anterior
  (o novo engagement começa em copilot; o arquivo do engagement anterior não é consultado) e exige
  reconstrução do contexto — **sem** alegar limpeza do histórico do LLM sem reinicialização real.
- Selecionar modo **não** dispara Replay/Race/qualquer operação ativa.

## 19.4 Requisitos de autorização (enforcement inalterado)

A seleção de modo **não substitui** Scope Guard, capabilities do Execution Context, Approval Gate, associação
ao projeto Caido, limites de operações/concorrência, orçamentos, cancelamento nem confinamento de evidências.
O **único** autorizador continua sendo `ctx.approvals` (fornecido pelo operador) + `allowedCapabilities`; o
LLM **não** se autoriza e **nenhuma** string/booleano do agente é aceita como autorização (verificado:
`setMode` sequer possui parâmetro de autorização; o Bridge **não importa** o módulo de modos). Operações
bloqueadas permanecem bloqueadas em ambos os modos.

## 19.5 Capacidades ainda pendentes

- **Autopilot contínuo / execução durável / agendamento / retomada autônoma:** **pós-MVP** (não implementado).
- **Autorização de objetivo** para execução supervisionada ponta-a-ponta: **lacuna explícita** — não há
  mecanismo; cada ação continua sob aprovação por ação. Não fabricamos uma autorização de objetivo.
- **F5b (workflows nativos Caido):** permanece **V2**.

## 19.6 Exemplo de uso no pentest

```text
/usar-engagement acme
/modo status            → copilot (default) · engagement acme · capacidades (per-investigation)
/iniciar-pentest        → em copilot: recon/mapeamento/recomendações; sem ações ativas espontâneas
/modo autopilot         → ⚠ supervisionado; não concede nada; não iniciou operação
/iniciar-pentest        → planeja/propõe fases rumo ao objetivo; CADA ação Class A pede aprovação
/investigar <endpoint>  → investigação pontual respeitando o modo; conclui em Investigation Record
```

## 19.7 Matriz de readiness (honesta)

| Critério | Estado | Evidência |
|----------|--------|-----------|
| **A. Modo selecionável e persistido** | ✅ | `test-modes.mjs` (default, seleção, status, troca, clear, concorrência, stale) |
| **B. Modo aplicado nos pontos de entrada existentes** | ✅ | `/investigar` e `/iniciar-pentest` consultam `tools/modes/cli.mjs status` e ramificam por modo (`test-skills.mjs`) |
| **C. Execução supervisionada validada deterministicamente** | ✅ (gates) | gate de aprovação (`_approved`), capability-not-allowed, sem auto-exec, sem auto-Whitebox, isolamento, projeto do manifesto (`test-modes.mjs`) |
| **D. Execução agêntica real em laboratório** | **NOT RUN** | sem LLM pago/ops ofensivas nesta rodada — **Autopilot NÃO é validado ponta a ponta** |

Como **D permanece NOT RUN**, o Autopilot **não** é classificado como validado ponta a ponta — apenas
**selecionável (A)**, **aplicado (B)** e **gated deterministicamente (C)**.

## 19.8 Critérios para aceitar Autopilot em H2b-F4b-2 / H3

1. Um mecanismo de **autorização de objetivo** ancorado no Execution Context (operador), nunca em string/bool
   do agente, com escopo e expiração.
2. **Orçamento/limites por campanha** (ops, tempo, concorrência) observados fim-a-fim, com cancelamento.
3. **Execução agêntica real em laboratório** (D) com LLM, alvo autorizado e evidências — reproduzível.
4. Investigation Records completos emitidos independentemente do fechamento textual.
5. Nenhuma regressão nos gates (C) e Validador **127/127**.

## 19.9 Testes (`node tools/modes/test-modes.mjs` → 18/18)

Copilot default · seleção explícita · status (com NOT RUN honesto) · troca de modo · engagement ausente
(get lança, CLI set falha, status funciona) · troca de engagement invalida o modo · concorrência por
`SA_SESSION_ID` · estado obsoleto (engagementId divergente ignorado) · projeto Caido inalterado pelo modo ·
tentativa de escalonamento (modo inválido recusado; campos de autorização fabricados ignorados) · envelope
não concede permissão (sem budget) · **gate de aprovação exige aprovação do operador** · capability
bloqueada continua bloqueada (Bridge não importa modo) · seleção **não** inicia operação/evidência · falha de
operação não corrompe o modo · **sem Whitebox automático** · conjunto de capabilities preservado · clear.
