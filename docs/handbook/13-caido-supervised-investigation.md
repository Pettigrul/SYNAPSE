# 13 — Caido Supervised Investigation (H2b-F4b)

> Incremento **H2b-F4b-1**: integração **determinística mínima** que torna o fluxo de **investigação
> supervisionada** alcançável pelo mecanismo normal do agente — do HTTP History à execução autorizada de
> Replay e ao registro de evidências — **sem** novo dispatcher/coordenador/scheduler/framework, **sem**
> geração de workflows, **sem** LLM. A **aceitação agêntica real (F4b-2)** depende de um gate com instância
> Caido de laboratório autorizada — **NOT RUN** (§13.7). Node stdlib, **zero deps**.
> Artefatos: `references/flows-caido-investigation.md` (flow), `tools/web-runtime/investigation-record.mjs`
> (Record passivo), capability **`investigation`** na Bridge.

## 13.1 Diagnóstico do fluxo existente (§1)

Reaproveitados **sem duplicação**: Caido Adapter (F1, cap. 9), History Monitor (F2, cap. 10), Copilot (F3,
cap. 11), Active Operations (F4a, cap. 12), Capability Bridge (único `invoke()`), Pi Adapter (2 tools),
dispatcher Markdown + flows (`references/flows-*.md`), Execution Context (operador provê escopo/capacidades/
aprovações), Approval Gate (`_approved`), Engagement Workspace (associação de projeto), Investigation
Records (Return contract em `flows-agents.md`). **Menor caminho:** um flow doc + um Record passivo + uma
capability fina na Bridge — nenhum mecanismo novo.

## 13.2 Decisão arquitetural (§11) — não exigiu parada

A capability **`investigation`** é **aditiva e passiva** (padrão do `copilot`, mesmo `invoke()`): **não**
despacha ops, **não** agenda, **não** aprova, **não** chama LLM. A **execução ativa** (`caido.replay.run`/
`caido.findings.create`) é **auto-espelhada** no Record a partir dos **envelopes reais** da Bridge — o agente
**não** pode forjar sucesso. A aprovação continua **exclusivamente** no Execution Context (`_approved`).
Portanto **não** há novo mecanismo de autorização nem alteração arquitetural relevante — nada a interromper.

## 13.3 Contrato da investigação supervisionada (§2)

Estados: `seleção → contexto → hipótese → proposta → decisão(aprovada|recusada) → execução|bloqueio →
interpretação → final|incompleto`. Pré-condições, ações e ops por fase estão na tabela de
`references/flows-caido-investigation.md`. O fluxo é **alcançável pelo mecanismo normal**; o agente **não**
é forçado a uma sequência rígida — define-se **pré-condições, estados e critérios de conclusão**.

## 13.4 Experiência do operador (§3) — fases separadas

Consulta de dados · Preparação · Solicitação de aprovação · Execução · Interpretação · Encerramento são
distintas (mapeadas aos gatilhos no flow doc). **A investigação conclui mesmo quando a execução é negada:**
o bloqueio é registrado e o Record é finalizado como `bloqueado`/`inconclusivo`.

## 13.5 Enforcement e segurança (§4)

Reusa Scope Guard, Capability Bridge, Execution Context, capabilities `caido`/`caido-active`, mecanismo de
aprovação, limites/concorrência (F4a). Garantias: aprovação **do operador** (nunca booleano do LLM);
associação engagement↔projeto; controle de destino **antes e depois** do Replay (F4a); prevenção de execução
duplicada (idempotência F4a); limites de operações; cancelamento/recuperação; proteção de credenciais
(redação); proveniência das evidências; **sem acesso Whitebox por padrão**; HTTP History como **dado não
confiável**. **Recomendações do Copilot NÃO autorizam ops ativas**; **sem aprovação automática**.

## 13.6 Investigation Record (§5) — distinções e incompletude

`investigation-record.mjs` (passivo) **estende** o Return contract de `flows-agents.md`, distinguindo:
**hipótese · técnica KB · evidência original do History (refs Caido) · operação proposta · aprovação/recusa
· operação efetivamente executada · resultado do Caido · classificação autoritativa (verbatim, quando
existir) · interpretação do agente · limitações · status final**. Ops da Bridge:
`investigation.start/kb/evidence/propose/interpret/finalize/snapshot/get` (campos interpretativos, pelo
agente); **execução factual auto-espelhada** (§13.2). Invariantes de honestidade:

- IDs do Caido **só** dos envelopes reais — **nunca** inventados.
- Bloqueio/falha/recusa registrados como tais; **sucesso nunca** declarado sem confirmação do Caido.
- Classificação de validador **verbatim**; `finalize` **recusa** `conforme`/`anomalia` quando houve bloqueio
  sem execução (`dishonest-status`) e **recusa** `violacao-confirmada` sem classificação autoritativa
  (`bad-status`).
- **Incompletude:** `investigation.snapshot` preserva resultados técnicos e marca `incompleto` — resolve a
  dívida aberta em cap. 5 §5.4, **sem nova arquitetura de persistência** (reusa o padrão atômico de F2/F3;
  persistência opcional por `statePath`).
- **Isolamento:** Record ligado ao engagement; envelope de outro engagement → `record-isolation`.

## 13.7 Gate obrigatório de integração real (§7) — F4b-2

Antes de qualquer aceitação **agêntica** real, comprovar com **instância Caido de laboratório explicitamente
autorizada**: conexão/auth, projeto associado, HTTP History, HTTPQL, paginação, request/response, History
Monitor, Copilot Context, consultas de Replay/Findings disponíveis na versão instalada; depois, **só com
autorização específica**, um Replay **sintético de baixo risco** com resultado conhecido e restauração de
estado. **Não** contra ambientes corporativos. **Mocks não substituem** esta validação.

**Situação atual:** **NOT RUN** — não há laboratório autorizado/configurado neste ambiente. Registrado como
**BLOCKED (causa: ausência de instância autorizada)**. Os testes determinísticos (§13.8) **não** contam como
validação agêntica.

## 13.8 Validação determinística F4b-1 (§6) — 20/20

`node tools/web-runtime/test-caido-investigation.mjs` → **20/20**, offline (Bridge real + copilot F3 real +
Caido mock + Record): seleção de engagement · projeto correto · contexto F3 · KB · hipótese · seleção de
request · Replay autorizado · Replay recusado (conclui com bloqueio) · resultado fora de escopo · falha de
API · response ausente · cancelamento · execução duplicada · evidências+proveniência · Record completo ·
Record inconclusivo (sem promoção; `dishonest-status`/`bad-status`) · orçamento encerrado antes da conclusão
(snapshot incompleto) · zero Whitebox · isolamento entre engagements · zero LLM automático por request.
Regressões completas + Validador **127/127** verdes.

## 13.9 Plano de aceitação F4b-2 (§8)

Somente **após** o gate real (§13.7) **e nova autorização do operador**: campanha com LLM real demonstrando
consulta real ao Caido, consumo do contexto do Copilot, seleção de técnica pertinente, preparação de
operação, aprovação supervisionada, Replay real autorizado, interpretação correta, Investigation Record, e
respeito a bloqueios/limites. **Orçamento global e por turno definidos antes** de executar. **Nenhum turno
cobrado nesta rodada.**

## 13.10 Limitações / bloqueios (§8)

- **Integração real NOT RUN / gate BLOCKED** (sem lab autorizado); ops Replay `@cloud` a comprovar (cap. 12).
- O Record é **documentação honesta** (reflete envelopes reais), não um segundo enforcement — a autorização
  efetiva é da Bridge/Execution Context.
- Enforcement de camada-de-ferramentas para Whitebox segue **PLANNED** (cap. 8 §8.6).
- Persistência do Record é opcional e reusa o padrão existente; não há novo índice/DB.

## 13.11 Roadmap e backlog Preflight (§9)

Preservados: **H2b-F5** (Workflow Intelligence — **F5a entregue**, cap. 14; **F5b nativo = pós-MVP/V2
opcional**, 2026-11-05), **H2b-F6** (Evidence & Reporting), **H2c-F2+** (Whitebox
opcional, isolamento efetivo pendente), **H2d** (Bootstrap/Preflight), **H3** (piloto integrado). Backlog do
Preflight (📋) deve verificar: permissões de **Replay** (`@cloud`), **autorização** (aprovações por classe de
risco + associação + escopo), **capacidades** disponíveis na versão do Caido, e a **validação real** do gate
§13.7 — antes de liberar F4b-2.
