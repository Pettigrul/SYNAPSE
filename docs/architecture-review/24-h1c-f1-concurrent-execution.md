# 24 — H1c-F1: Concurrent Execution Foundation (Relatório de Aceitação)

> Executor de operações HTTP **coordenadas e concorrentes** sobre sessões autenticadas,
> reutilizando Session Manager, Authorization Matrix, Browser Runtime, Scope Guard e Evidence.
> **Determinístico na coordenação** (barreira + pool com limite), mas **honesto**: não promete
> que as requisições cheguem ao servidor simultaneamente. Navegador real em laboratório
> sintético. **Sem race/TOCTOU (é H1c-F2), sem alvos reais, sem concorrência em políticas
> globais.** 127 entradas intactas; `agents/` intacto; nenhuma dependência nova.

## 1. Arquitetura (menor componente possível)

Um único `ConcurrentExecutor` (`concurrent-executor.mjs`) que:

| Responsabilidade | Como |
|------------------|------|
| Grupos de operações concorrentes | `prepare({operations})` monta o experimento (`experimentId`). |
| Operação ↔ sessão autorizada | cada op referencia `sessionId`; `principalId` é vinculado no prepare. |
| Limite máximo de concorrência | **semáforo**, `maxConcurrency` padrão **2**. |
| Sincronização de início | **barreira assíncrona** (uma Promise liberada no `run`). |
| Executar + coletar resultados | pool executa; resultados sanitizados com timings. |
| Cancelamento e timeouts | `cancel`, timeout **individual** (abort in-page) e **global**. |
| Liberação confiável de recursos | timers limpos; sessões/navegador intactos p/ irmãos. |

Canal de execução: `manager.request({op:"probe"})` (H1b-F2) — usa o `BrowserContext`
autenticado; **cookies/tokens nunca são extraídos**. **Nenhum** scheduler distribuído, banco,
fila persistente, worker em processo separado ou framework de orquestração.

## 2. Contratos tipados (`contracts.d.ts`)

`concurrent.prepare` · `concurrent.run` · `concurrent.cancel` · `concurrent.status`. Cada
operação declara: `operationId`, `principalId`, `sessionId`, método HTTP, URL/recurso, corpo
(quando aplicável), política de execução, limites e `experimentId`. Identificadores distintos:
`principalId` · `sessionId` · `contextId` · `resourceId`/`operationId`/`experimentId`.

## 3. Segurança (reuso integral)

Rule 0 (Scope Guard — alvo fora de escopo bloqueado **no prepare**), Rule 6 + evidence-hygiene
(**corpos de resposta não são armazenados** nos resultados). Limites iniciais conservadores:
`maxConcurrency=2`, `maxOps=16`, `opTimeoutMs=10000`, `globalTimeoutMs=30000` (todos
configuráveis por experimento). Cancelamento explícito; operações com alteração de estado
**somente** com `authorizedStateChange` + fixture reversível; **nenhum** alvo real; **nenhuma**
alteração de políticas globais para habilitar concorrência.

## 4. Barreira e execução (honestidade de coordenação)

A barreira sincroniza o **início** (ponto de liberação comum), **não** a chegada simultânea ao
servidor — declarado explicitamente no código e aqui. Registrados por experimento/op:
`preparedAt`, `barrierReleasedAt`, `startedAt`/`endedAt` por op, `latencyMs`, estado do
resultado, cancelamento/falhas e `requestId` (referência de evidência). Corpos sensíveis não
entram nos resultados.

## 5. Testes sintéticos (18/18 PASS, navegador real, `evilHits=0`)

| # | Caso | Resultado |
|---|------|-----------|
| 1 | Duas operações simultâneas | ambas `ok` |
| 2 | Três ops, limite 2 | servidor nunca viu >2 em voo (`maxInflight=2`) |
| 3 | Preservação de identidade por sessão | alice→alice, bob→bob sob concorrência |
| 4 | Isolamento de cookies/tokens | sem segredo nos resultados |
| 5 | Destino fora de escopo | `blocked` no prepare; evil não contatado |
| 6 | Operação autenticada permitida | `ok` 200 |
| 7 | Alteração de estado sem autorização | `blocked`; servidor não recebe requisição |
| 8 | Cancelamento antes da barreira | tudo `cancelled`; **zero** requisições |
| 9 | Cancelamento durante execução | ops não iniciadas `cancelled`; só a em voo bateu no servidor |
| 10 | Timeout individual | `timeout` (abort in-page do fetch) |
| 11 | Timeout global | experimento `cancelled`; restantes `cancelled` |
| 12 | Falha de uma op sem perder as demais | `boom` falha; `ok1`/`ok2` com resultado |
| 13 | Falha inesperada do navegador | capturada; `run` resolve limpo (sem throw) |
| 14 | Liberação de recursos após cancelamento | sessão segue utilizável (200) |
| 15 | Sanitização de evidências | sem `body`/cookie/token; só timings+status+requestId |
| 16 | Compatibilidade com Session Manager | list/status/navigate intactos |
| 17 | Compatibilidade com Authorization Matrix | classifica `conforme` após concorrência |
| 18 | Sem requisições após encerramento | `hits` estável pós-término; cancelado-antes-da-barreira = 0 |

## 6. Evidências de sincronização e isolamento

- **Sincronização:** `barrierReleasedAt ≥ preparedAt`; no caso 2, o contador de in-flight do
  servidor comprova o teto de 2 (sobreposição real, limitada). Timings por op registrados.
- **Isolamento:** identidade preservada por sessão sob concorrência (caso 3); nenhum segredo em
  resultados (casos 4/15); contextos isolados herdados do H1b-F1.

## 7. Regressão (item 6)

F1 **19/19** · F2 mock **16/16** · F2 e2e **11/11** · H1b-F1 **15/15** · H1b-F2 **18/18** ·
H1c-F1 **18/18** · Validador V1 **127/127** · **corpos técnicos inalterados** · **`agents/`
intacto (17)** · **nenhuma dependência nova** (`playwright-core 1.64.1`). Mudanças: **somente**
`tools/web-runtime/` (+ `manifest-h0.json`, saída gerada pelo Validador).

## 8. Limitações e riscos conhecidos

1. **Sem simultaneidade de chegada garantida** — a barreira coordena o início; a rede/execução
   do navegador introduz jitter. **Não há** detecção de corrida/TOCTOU (é H1c-F2).
2. **Cancelamento não interrompe fetch em voo** — operações já iniciadas completam (ou são
   abortadas pelo timeout individual in-page); o cancelamento impede apenas as **não iniciadas**.
   Resultados de ops em voo podem chegar após o cancelamento e não são contabilizados como novos.
3. **Timeout individual depende de abort in-page** (`AbortController` dentro do `fetch`); o
   timeout global aborta a coordenação, mas não a requisição já em voo.
4. **Canal same-origin** (herdado do H1b-F2): APIs em origem distinta exigiriam CORS/APIRequestContext.
5. **Falha do navegador** derruba todas as sessões do processo compartilhado (um navegador, vários
   contextos); tratada de forma limpa, mas não há isolamento de processo por sessão.
6. **Windows corporativo** não validado (degradação para HTTP, sem auth de navegador).

## 9. Critérios para aprovar H1c-F2 (Race & TOCTOU) — spec preliminar em [`25-h1c-f2-race-toctou-spec.md`](25-h1c-f2-race-toctou-spec.md)

1. H1c-F1 aceito e estável (esta entrega).
2. Modelo de **janela de corrida** e de **evidência não determinística** (reprodutibilidade,
   tolerância a jitter) aprovado, preservando Rule 6.
3. Fixtures sintéticas **reversíveis** com estado observável (contadores/saldos) para TOCTOU.
4. Política de repetição controlada (N tentativas) com limites e cancelamento.
5. Decisão sobre como classificar corrida **confirmada** vs **suspeita** (análogo à regra dura
   da Authorization Matrix: efeito observável + regra estabelecida, nunca só timing).

## 10. Recomendação

**Recomendo aceitar o H1c-F1** no ambiente de desenvolvimento: as 4 capacidades funcionam, a
coordenação por barreira + limite é comprovada e honesta, segredos e corpos não vazam, e não há
regressão. **Não** foram iniciados H1c-F2, Caido ou orquestração; `agents/` não arquivado;
P3/P4/P5 não executados. Aguardando aprovação para **H1c-F2**.
