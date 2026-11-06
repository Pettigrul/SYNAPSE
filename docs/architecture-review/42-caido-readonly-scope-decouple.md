# 42 — Desacoplar leitura do Caido do Scope Guard (read-only)

> Permite ao HackBot **ler e analisar integralmente** o HTTP History do projeto Caido **associado**, sem exigir
> correspondência dos registros ao `scope.md`, **preservando** o isolamento de projeto e **todos** os controles
> de operações ativas. Mudança mínima, restrita ao **caminho de leitura** do Caido. Sem KB/agents/dispatcher,
> sem novas dependências. Autorizada pelo operador (S4-B revelou o Scope Guard retendo tráfego já capturado).

## Problema

O Scope Guard retinha (`_scopeFilter`) os registros do History cujos hosts não constavam no `scope.md`, antes de
entregá-los ao agente. Para **dados já capturados no projeto autorizado**, isso impedia a análise read-only
(S4-B: 21 registros capturados, todos retidos → NO DATA). Ler dados já existentes no projeto associado não
contata nenhum host externo; a retenção era conservadora demais para a **camada de leitura**.

## Decisão

Para operações **read-only de HTTP History** no projeto **associado**, trocar **filtragem (withhold)** por
**anotação (`inScope`)**: retornar **todos** os registros, cada um rotulado in/out-of-scope. Mantém-se:
- **Isolamento de projeto:** `_caidoAssoc` (currentProject == projeto autorizado) em **toda** op — inalterado.
- **Operações ATIVAS hard-enforced:** `caido.replay.run` e `caido.findings.create` continuam validando o alvo
  contra o `scope.md` (Rule 0), **mesmo com aprovação**. Host no History **nunca** é autorização para agir.
- **Distinção in/out-of-scope** preservada em resultados, Copilot e documentos (relatórios).

Escopo restrito ao **HTTP History** (`caido.history`, `caido.request`) + análise do **Copilot**. As leituras de
artefatos de teste ativo (findings/replay/automate) **mantêm** o scope-filter por serem semânticas de teste
ativo, não captura passiva.

## Alterações (mínimas, só caminho de leitura)

| Arquivo | Mudança |
|---|---|
| `tools/web-runtime/bridge.mjs` | **+`_inScope(ctx,url)`** (anotação read-only); `caido.history` retorna todos os edges com `inScope` + `scopeCounts{inScope,outOfScope}` (`outOfScopeWithheld:0`); `caido.request` retorna com `inScope` em vez de lançar `out-of-scope` |
| `tools/web-runtime/caido-copilot.mjs` | `ingest` **anota** `inScope` em vez de dropar out-of-scope; `+incomplete.outOfScopeObserved`; `endpoints_()` expõe `inScope` |
| `docs/handbook/10-caido-live-history-monitor.md` | nota: leitura não retém; anotação; ativo permanece gated |

**Não alterado:** `_scopeFilter` (ainda usado por findings/automate reads), `_caidoAssoc`, todos os gates ativos
(`caido.replay.run` scope BEFORE/AFTER + aprovação; `caido.findings.create`), KB/agents/policies/dispatcher,
Scope Guard do caminho HTTP/browser (web-runtime), arquitetura de estados. Zero dependências novas.

## Invariantes de segurança preservados (testados)

- **Op ativa fora de escopo continua bloqueada** mesmo com aprovação blanket (`test-caido` 10b:
  `caido.replay.run` → `out-of-scope`).
- **Isolamento de projeto** intacto: History recusado se `currentProject != associado` (`test-caido` 10c:
  `caido-project-mismatch`).
- **Proveniência** (source/projectId/requestId/responseId/ts) preservada em cada registro (10).

## Testes

- `test-caido` **21/21** — 10 (History misto lido integralmente, anotado, proveniência), **10b** (replay ativo
  out-of-scope bloqueado apesar de read+aprovação), **10c** (isolamento de projeto preservado).
- `test-caido-copilot` **24/24** — 16 reescrito (out-of-scope **anotado, não dropado**; `outOfScopeObserved`;
  `endpoints_().inScope`).
- Regressões: bridge/active/monitor/investigation/sessions/race/concurrent/e2e + workspace/modes/preflight verdes;
  **Validador H0 127/127**.

## Resultado real (Caido ao vivo, read-only)

Projeto "Testes harness" (`<project-id>`), Caido 0.58.3: **21 registros lidos integralmente** (18 endpoints), **todos
anotados** (in-scope=0, out-of-scope=21), proveniência preservada (projectId/requestId/ts). Conteúdo = **tráfego
de fundo do navegador/Google** (Chrome update/dict, www.google newtab/async, accounts/ListAccounts,
ogads/play/android googleapis), **nenhum tráfego da aplicação sob teste**. Persistido em
`engagements/ENG-B/`: `ccSurface` (seção **out-of-scope observado**, rotulada), `ccLog` (o read).
**Nenhuma op ativa, nenhum tráfego gerado, nenhum finding fabricado, nenhum Investigation Record** (sem hipótese
fundamentada contra alvo autorizado). Isolamento de projeto respeitado (só `<project-id>`).

## Critério de aceite

✅ Um engagement associado a um projeto com 21 requests de hosts diversos **consulta e analisa os 21** sem
bloqueio por `scope.md`. ✅ O HackBot **não** envia requisições aos hosts fora de escopo nem os trata como
autorizados (replay out-of-scope bloqueado; distinção in/out preservada). Ver [41](41-s4-real-acceptance.md) §S4-B.
