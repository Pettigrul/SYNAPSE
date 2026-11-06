# 14 — Caido Workflow Intelligence: Generation & Validation (H2b-F5a)

> Incremento **H2b-F5a**: **geração e validação OFFLINE** de workflows Caido a partir de descobertas de
> pentest. **Sem** publicação/importação/execução real. **Resultado-chave (honesto):** o formato nativo de
> workflow do Caido é **NÃO COMPROVÁVEL** pelos schemas públicos → a **geração nativa importável é BLOCKED**;
> entregam-se **especificações intermediárias (IR versionado)** + **validação de contrato**. Node stdlib,
> **zero deps**, **zero LLM**. Módulo: `tools/web-runtime/caido-workflow.mjs`; capability **`workflow`** na Bridge.

## 14.1 Diagnóstico obrigatório (§2) — contratos reais

Inspecionados F1–F4b, Bridge, dispatcher/flows, handbook, roadmap. Contratos de workflow pesquisados na SDL
real (`github.com/caido/schemas`, `proxy/schema.graphql`) e no repo de schemas.

## 14.2 Matriz de compatibilidade (§11.2) — provável vs não-provável

| Item | Situação | Evidência (SDL verbatim) |
|------|----------|--------------------------|
| **WorkflowKind** | ✅ provável | `enum WorkflowKind { ACTIVE CONVERT PASSIVE }` |
| **CRUD** | ✅ provável | `createWorkflow(input:CreateWorkflowInput!) @cloud`, `updateWorkflow`, `deleteWorkflow`, `toggleWorkflow`, `globalize/localizeWorkflow` |
| **Run** | ✅ provável | `runActiveWorkflow(id, input:{requestId:ID!})`, `runConvertWorkflow(id, input:Blob!)` |
| **Test (simulação)** | ✅ provável (requer instância) | `testWorkflow{Active,Convert,Passive}(input:{definition:JsonObject!, ...})` |
| **Node graph / definition** | ⛔ **NÃO provável** | `Workflow.definition: JsonObject!` **opaco**; `WorkflowNodeDefinition.raw: JsonObject!`; sem fields |
| **Node kinds** (HTTPQL/JavaScript/Create Finding/Check Finding) | ⛔ **NÃO provável** | ausentes na SDL (só em docs, não em schema) |
| **Serialização / versão do workflow** | ⛔ **NÃO provável** | nenhum campo de versão |
| **Import/Export** | ⛔ **NÃO presente** | `importWorkflow`/`exportWorkflow` NOT PRESENT; `ImportDataInput` não tem variante workflow |

**Veredito (`NATIVE_WORKFLOW_GATE`):** `importable:false, status:"BLOCKED"`. Um artefato nativo importável
**não** pode ser construído offline sem inventar a forma do node-graph. Caminho para desbloquear (F5b):
confirmar a forma de `definition` numa instância de laboratório autorizada (`workflow(id).definition`) ou
nos docs oficiais, e então compilar o IR para `JsonObject`.

## 14.3 Workflow Planner (§3) — descoberta → proposta

`planWorkflow(discovery, ctx)` produz uma **proposta (IR)** com: `id`, `kind`/`caidoKind`, `objective`,
`provenance` (engagement, projeto, hypothesisId, investigationRecordRef, copilotRecommendationId,
kbTechnique, evidence[caidoRequestId], confirmedFinding?), `activation`, `inputs`, `outputs`, `detection`,
`logic`, `limitations`, `falsePositiveRisk`, `authorization`, `validationCriteria`, `classification.level`.

**Gate de convertibilidade (§1):** `assessConvertibility()` só converte com **sinal estrutural concreto** (e
evidência, para `active`); uma recomendação do Copilot **sozinha** não gera regra → `not-convertible`.

**Separação (§3):** `classification.level ∈ {investigation-indicator, observable-anomaly,
confirmed-vulnerability, n/a-transform}`; o default é **investigation-indicator** e **nunca** há promoção
automática a `confirmed-vulnerability` (exige finding confirmado/classificação autoritativa).

## 14.4 Geração — três exemplos (§4), como IR intermediário

| Ex. | Kind (Caido) | Objetivo | Observações |
|-----|--------------|----------|-------------|
| **A** | passive (PASSIVE) | Sinalizar endpoints com referências a objetos (id-like) para investigação de autorização | emite **indicador**, não finding; FP risk alto; sem request ativo |
| **B** | active (ACTIVE) | Análise contextual **acionada pelo operador**, sem execução automática | `authorization.required=true`; `runActiveWorkflow(requestId)`; teste ativo só via F4a |
| **C** | convert (CONVERT) | Normalizar/decodificar **dados sintéticos** | transforms de **allowlist** (`base64/url/hex-decode`, `json-normalize`); **sem JS arbitrário** |

Representação: **IR próprio versionado** (`sa-workflow-ir/1`) — **não** uma linguagem nova desnecessária, e
**não** um export nativo. Cada IR carrega `native: {importable:false, status:"BLOCKED", ...}`. **Nenhum
JavaScript arbitrário é emitido**; um node JS hipotético seria marcado não-confiável e exigiria validação.

## 14.5 Integração à Bridge (§5) — local, sem efeito no Caido

Capability **`workflow`** (ops `propose·get·list·validate·generate`), planner **por investigação**, **sem**
chamadas ao Caido, **sem** publicação/execução, **sem** novo dispatcher/scheduler/DB/framework. A geração é
**solicitável pelo operador a partir de uma investigação existente** (`discovery.from="investigation"` puxa
hipótese/evidência/KB do Investigation Record F4b-1).

## 14.6 Validação determinística (§7) — contrato ≠ simulação ≠ execução

`validateWorkflowProposal()` faz **validação de contrato** (`contractValidated:true, simulated:false,
executed:false`): versão IR, kind suportado, campos obrigatórios, proveniência, separação hipótese/finding
(sem promoção), **ausência de segredos**, transforms ⊆ allowlist / sem JS, **escopo** dos hosts referenciados,
e marca `nativeImportable:false`. **Simulação** (`testWorkflow*`) e **execução real** permanecem **BLOCKED**
(dependem de instância autorizada).

`node tools/web-runtime/test-caido-workflow.mjs` → **17/17**: 3 exemplos · compat estrutural (enum provado) ·
campos obrigatórios · proveniência · separação hipótese/finding · sem segredos · entradas inválidas · kind
não suportado · versão incompatível · escopo+autorização · dedup · sem efeitos colaterais/rede · sem
publicação · sem execução (só IR) · compat Copilot+Investigation Record via Bridge · sem Whitebox · KB
preservada (referência). Regressões completas + Validador **127/127** verdes.

## 14.7 Segurança (§6)

Nenhum workflow publicado/ativado; nenhuma execução ativa sem autorização; **sem acesso Whitebox**; **sem
segredos** no artefato (validado); JS tratado como não confiável (não emitido); escopo+associação validados;
proveniência preservada; **sem promoção automática** de hipótese a vulnerabilidade; **nenhuma chamada LLM**
para validar estrutura; sem novas dependências.

## 14.8 Limitações e bloqueios (§9) / Gate F5b (§8)

- **Geração nativa importável: BLOCKED** (definition opaca; sem import/export; node kinds só em docs). Mocks
  **não** simulam sucesso nativo.
- IR é **intermediário**, explicitamente não-importável; precisa de compilação para `JsonObject` quando a
  forma do node-graph for confirmada.
- Ops de workflow `createWorkflow` são `@cloud` — a comprovar em instância.

> **Reclassificação de escopo (decisão de produto, 2026-11-05):** **H2b-F5b** (geração/importação/publicação/
> execução de workflows **nativos**) é **pós-MVP (V2), opcional**. Não é requisito do MVP nem dependência de
> H3; o **BLOCKED de geração nativa não impede** a conclusão do MVP. No Preflight, workflows nativos são
> **opcional/PLANNED** e **não bloqueiam** o perfil `caido-native` (→ `DEGRADED`, nunca `BLOCKED`). Os
> artefatos de **F5a são preservados como estão**, sem novas pesquisas/implementações de workflows nesta fase.

**Quando F5b for retomada (V2), só poderá ocorrer após:** instância Caido de laboratório autorizada;
**compatibilidade de versão comprovada**; **mecanismo de importação/publicação confirmado**; validação de
workflows sintéticos (via `testWorkflow*`); **aprovação humana**; controles de execução e **rollback** definidos.

## 14.9 Roadmap / preservação (§9)

Preservados: **H2b-F6** (Evidence & Reporting), **H2c-F2+** (Whitebox opcional, isolamento efetivo
pendente), **H2d** (Bootstrap/Preflight), **H3** (piloto integrado). Backlog Preflight (📋): checar
compatibilidade de versão de workflow, disponibilidade dos node kinds na instância, e o gate de importação
antes de F5b.
