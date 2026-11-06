# 12 — Caido Testing Operations (H2b-F4a)

> Incremento **H2b-F4a**: operações de **teste** do Caido — **Replay** supervisionado (ativo),
> **Findings** (consulta + criação sob aprovação) e leitura de **Automate** — integradas ao mecanismo
> existente, **sem** novo dispatcher/scheduler/framework, **sem** LLM, **sem** execução agêntica autônoma,
> **sem** publicação automática, **sem** geração de workflows. Node stdlib, **zero deps**.
> Módulos: `tools/web-runtime/backends/caido-active.mjs` (+ transporte `postGraphql` extraído de
> `caido.mjs`); ops na Bridge sob as capabilities **`caido`** (leitura) e **`caido-active`** (ativa).

## 12.1 Gate F1–F3 e validação real (§1)

- **Contratos F1/F2/F3 revisados:** o cliente ativo **reusa** o transporte F1 (`postGraphql`), o modelo de
  erro (`CaidoError`), a redação, a associação projeto↔engagement (`_caidoAssoc`) e o Scope Guard.
- **Schema GraphQL conferido contra a SDL real** (`github.com/caido/schemas`, `proxy/schema.graphql`) —
  nenhuma mutation/parâmetro/identificador inventado (ver §12.3).
- **Autenticação/projeto:** inalterados (Bearer PAT; `currentProject.id === projectId`).
- **Smoke test read-only reproduzível:** `test-caido-active.mjs` (fixtures/mock), **27/27**.
- **Instância de laboratório autorizada:** **não há** → a **validação real permanece `NOT RUN`**. Mocks
  **não** são comprovação operacional. Não houve conexão a Caido corporativo.
- **Pré-condições a comprovar antes de liberar ops ativas em instância real:** ver §12.9.

## 12.2 Inspeção da arquitetura (§2)

Reutilizados sem duplicação: Caido Adapter (F1), History Monitor (F2), Copilot (F3), Capability Bridge, Pi
Adapter (duas tools nativas), Execution Context (operador provê escopo/capacidades/aprovações — nunca o
LLM), Engagement Workspace (associação de projeto), Scope Guard (`validateTarget`), policies (inalteradas),
Investigation Records. **Interfaces documentadas identificadas** para Replay/Automate/Findings → §12.3.

## 12.3 Schemas reais verificados (§2 — não inventar)

| Operação | Tipo | Assinatura SDL (verbatim) |
|----------|------|---------------------------|
| `createReplaySession` | mutation `@cloud` | `(input: CreateReplaySessionInput!)` — `requestSource @oneOf {id \| raw{connectionInfo,raw}}`; `ConnectionInfoInput{host,isTLS,port,SNI}` = **alvo** |
| `startReplayTask` | mutation `@cloud` | `(sessionId: ID!)` → `{error, task{id,sessionKind,replayEntry{id}}}` |
| `replayEntry` | query | `(id: ID!, sessionKind: ReplaySessionKind!)` → `ReplayEntryHttp{connection,raw,request{...response}}` |
| `replaySessions` | query | connection `{edges{node{id name}},pageInfo}` |
| `finding`/`findings` | query | `findings(filter: FilterClauseFindingInput{reporter}, order)`; `Finding{id,title,reporter,host,path,dedupeKey,hidden,request}` |
| `createFinding` | mutation | `(requestId: ID!, input: CreateFindingInput{title!,reporter!,dedupeKey,description})` |
| `automateSessions`/`automateSession` | query | `AutomateSession{connection,entries,...}` (leitura) |

> **`@cloud`:** `createReplaySession`/`startReplayTask` são anotadas `@cloud` na SDL — podem **não** estar
> disponíveis numa instância local não-cloud. O cliente propaga o erro real (`caido-replay-*-failed`/
> `caido-graphql-error`); é uma **limitação de compatibilidade** a comprovar em instância autorizada.

## 12.4 Separação de capabilities A/B/C/D (§6)

| Classe | Ops | Capability | Gate |
|--------|-----|-----------|------|
| **A. Read-only** | `caido.findings.list/get`, `caido.replay.sessions/entry`, `caido.automate.sessions/session` | `caido` | associação + escopo |
| **B. Preparação ativa** | resolução de alvo + checagem de escopo + pré-requisitos (dentro de `replay.run`/`findings.create`) | `caido-active` | — |
| **C. Execução ativa autorizada** | `caido.replay.run`, `caido.findings.create` | `caido-active` | **aprovação do operador** + escopo + associação + limites + idempotência |
| **D. Consulta/registro de resultados** | resultado de `replay.run` (outcome/comparison/provenance) + `replay.entry`/`findings.get` | `caido`/`caido-active` | escopo pós-execução |

> **Ler o History NÃO autoriza Replay:** leitura fica em `caido`; execução ativa exige a capability
> **separada** `caido-active` **e** uma aprovação. São dois controles independentes.

## 12.5 Replay supervisionado (§3)

`caido.replay.run` (sensível): (1) resolve o **alvo efetivo** — `connection` do replay modificado, ou o
host do request original (`requestSource:{id}` vs `requestSource:{raw}`); (2) **escopo ANTES** da execução
(`validateTarget`) — bloqueia destino fora de escopo / redirecionado; (3) **aprovação do operador**
(`_approved`, nunca booleano do LLM); (4) **idempotência** por `idempotencyKey` (mesmo key → resultado em
cache, **não** re-executa após retry); (5) **limite de quantidade** (`maxActiveCaidoOps`, default 20); (6)
executa via cliente ativo; (7) **escopo DEPOIS** — resultado cujo host efetivo saiu do escopo tem `raw`/
`response` **retidos** (controle de redirect); (8) **comparação** com o request original
(`statusCode`/`length`, `changed`). Outcome diferenciado: **`executed` · `inconclusive` · `blocked-result-
out-of-scope`** (recusas → erros estruturados: `out-of-scope`, `state-change-unauthorized`,
`replay-*-failed`, `active-limit`). Proveniência Caido preservada (`replaySessionId/taskId/entryId`,
`originalRequestId`). **Não** há exploração automática.

## 12.6 Findings (§5) e Automate (§4)

- **Findings leitura:** `caido.findings.list/get` (filtro por `reporter`, escopo por `host`+`path`).
- **Findings criação:** `caido.findings.create` (sensível) exige **aprovação**, **evidência identificável**
  (`requestId` existente e **em escopo**), `title`+`reporter`; **dedup** por `dedupeKey` (não duplica);
  **não** classifica hipótese como vuln confirmada; **não** publica automaticamente resultados de
  heurísticas do Copilot. Criar finding no Caido é **separado** da geração de relatório do engagement.
- **Automate:** apenas **leitura** (`automate.sessions/session`). Operações que **iniciam/modificam**
  execuções (`startAutomateTask`, etc.) ficam **fora de escopo** até contratos/limites/aprovação
  comprovados. **Sem fuzzing autônomo** nesta rodada.

## 12.7 Autorização e segurança (§7)

Projeto associado ao engagement; escopo validado **antes e depois** das ops ativas; identidades/sessões
autorizadas (herdado); **controle de redirect/destino efetivo** (escopo pós-execução + retenção de
resultado); limites de quantidade e concorrência (`maxActiveCaidoOps`); timeout/cancelamento (transporte
F1); efeitos colaterais tratados; **aprovação humana** via Execution Context — **o mecanismo de aprovação
NÃO é um booleano que o LLM define**; evidências sanitizadas (cookies/tokens/headers redigidos no `raw`);
registro de ops/autorizações (proveniência + `caidoActiveLog`); **proteção contra execução duplicada** por
idempotência (cache de concluídas); **nenhum acesso automático a Whitebox/** (o cliente ativo não possui
caminho de leitura de fonte). Controles/contratos existentes reutilizados; **policies inalteradas**.

## 12.8 Integração ao Copilot (§8) — somente contratos determinísticos

Cadeia preparada: **recomendação F3 → hipótese → técnica KB → operação Caido proposta → aprovação →
execução → evidência → Investigation Record**. Nesta rodada **só** contratos/integração determinística: o
Copilot sugere o `nextTest` (ex.: `authorization.run`, `race.run`) e, agora, pode apontar
`caido.replay.run`/`caido.findings.create` como próximos passos **propostos** — a execução exige aprovação
do operador. **Sem** loop autônomo de investigação, **sem** turnos cobrados de LLM, **sem** promoção de
heurística a achado confirmado.

## 12.9 Testes (27/27), limitações e bloqueios (§9, §11)

`node tools/web-runtime/test-caido-active.mjs` → **27/27**, offline (mock GraphQL por nome de operação
`SA_*`): read-only · replay autorizado · replay recusado · projeto incorreto · escopo incorreto · destino
alterado (in-scope) · redirect fora de escopo (antes e depois) · parâmetros inválidos · falha de auth ·
falha de API · timeout · cancelamento · limite de concorrência · execução duplicada/idempotência · resultado
sem response · evidência+proveniência+comparação · sanitização de segredos · dedup de findings · finding sem
evidência · finding autorizado · hipótese não confirmada · sem Whitebox · compat Bridge/Pi Adapter ·
leitura≠Replay. Regressões completas + Validador **127/127** verdes.

**Bloqueios / pré-condições para liberar ativo em instância real (F4b):**
- Instância Caido de laboratório **explicitamente autorizada e configurada** (validação real segue `NOT RUN`).
- Comprovar suporte das ops `@cloud` (`createReplaySession`/`startReplayTask`) na instância-alvo.
- Confirmar que `requestSource.raw`/`connectionInfo` refletem o alvo efetivo na versão-alvo.
- Alçada de aprovação por risco/política definida pelo operador (quais alvos/quantidades).

## 12.10 Limitações / dívidas (§9)

- **Replay modificado** usa `requestSource.raw` (`connectionInfo`+`raw`) — a edição por *draft*
  (`updateReplayEntryDraft`, exige `editorState: Blob!`) **não** é implementada (contrato não verificável
  offline).
- Idempotência protege execuções **concluídas**; uma falha de rede parcial pode, em instância real, já ter
  enviado o request — inerente a replay ativo, documentado.
- `createFinding` não expõe `severity` (ausente na SDL) nem publicação; relatório do engagement é separado.
- Enforcement de camada-de-ferramentas para Whitebox segue **PLANNED** (cap. 8 §8.6) — não declarado universal.

## 12.11 Requisitos futuros H2d/Preflight (§10)

Preflight (📋) deverá verificar, **sem LLM e sem ofensa**: permissões efetivas de **Replay** (ops `@cloud`
disponíveis), **Automate** (apenas leitura habilitada) e **Findings** (criação permitida ao reporter), e os
controles de autorização (aprovações presentes por classe de risco, associação projeto↔engagement, escopo),
antes de liberar F4b.

## 12.12 Critérios para ativação supervisionada F4b (§12.10)

1. Laboratório autorizado + ops `@cloud` comprovadas. 2. Alçada de aprovação por risco definida. 3. Smoke
test real read-only + um Replay supervisionado de baixo risco com reset. 4. Revisão da retenção de evidência
e redação em tráfego real. 5. Preservados como fluxos opcionais: **H2c-F2+** (Whitebox) e **H2b-F5**
(Workflow Intelligence) — **não** iniciados.
