# 23 — H1b-F2: Authorization Matrix (Relatório de Aceitação)

> Executor **sequencial** de matrizes de autorização entre múltiplas identidades (horizontal
> IDOR + vertical), construído sobre o Multi-Session Runtime (H1b-F1). Investiga controles de
> autorização de forma reproduzível, **sem depender exclusivamente de interpretação do LLM**.
> Navegador real em laboratório sintético (loopback). **Sem concorrência (é H1c), sem alvos
> reais, sem payloads ofensivos.** 127 entradas intactas; `agents/` intacto; nenhuma dependência
> nova. Spec preliminar: [`22-h1b-f2-authorization-matrix-spec.md`](22-h1b-f2-authorization-matrix-spec.md).

## 1. Arquitetura (reuso + mínimo)

Reutiliza integralmente Session Manager, Identity Registry, Browser Runtime, HTTP Runtime, Scope
Guard e Evidence. Adicionados **somente**:

| Componente | Arquivo | Papel |
|------------|---------|-------|
| Resource Registry | `resource-registry.mjs` | Recursos por `resourceId` opaco: template de request, classificação, dono legítimo + **marcador de posse** (evidência de laboratório, nunca ecoado). |
| Políticas esperadas | em `authz-matrix.mjs` | Expectativa `{outcome, origin}` — origem **sempre declarada** (`documented-policy`/`lab-fixture`/`approved-premise`); `unknown` = sem expectativa. |
| Matrix Executor | `authz-matrix.mjs` | **Sequencial**: valida identidade/recurso/escopo/autorização, executa com a sessão certa, captura sanitizado, compara observado×esperado, classifica. |
| Classificação | `classify()` | 4 classes com a regra dura de confirmação. |
| Sonda autenticada | `session.mjs::apiProbe` | fetch same-origin **a partir do contexto do principal** (cookies aplicados pelo navegador, nunca extraídos); passa pelo route guard. |

Sem novos frameworks, bancos, serviços, schedulers. **Identificadores distintos:** `principalId`
· `sessionId` · `contextId` · `resourceId`.

## 2. Modelo suportado

Owner / cross-user / no-auth; **autorização horizontal e vertical**; recursos **compartilhados
legitimamente** (sharing **explícito**, nunca inferido); recursos **públicos**; **métodos HTTP
diferentes** (GET/POST); **políticas desconhecidas** (→ inconclusivo). A expectativa carrega a
**origem**. **Nunca** se infere que usuários diferentes não possam compartilhar um recurso.

## 3. Classificação (regra dura)

`conforme` · `anomalia-de-autorizacao` · `violacao-confirmada` · `inconclusivo`.

- **Um HTTP 200 — ou divergência estrutural — isoladamente NÃO confirma IDOR/BOLA.**
- **Violação confirmada exige**: (a) `expected=deny` com **regra estabelecida** (origem declarada)
  **e** (b) acesso concedido (2xx) **e** (c) **evidência de posse** — a resposta trouxe o conteúdo
  do dono (marcador de posse presente). Faltando (c), o resultado é **anomalia**, não violação.
- Política desconhecida ou 404 em recurso que se esperava acessar → **inconclusivo**.

## 4. Execução sequencial

`run(cases, {signal})` percorre os casos em ordem, valida identidade/recurso, aplica o gate de
**alteração de estado** (exige `authorizedStateChange` + fixture reversível), executa a sonda na
sessão correta, normaliza e classifica. **Sem concorrência.** `AbortSignal` ou falha no meio da
matriz → casos restantes marcados `inconclusivo` (cancelado), com resultados parciais preservados
e recursos liberados.

## 5. Evidências (evidence-hygiene + Rule 6)

Cada resultado correlaciona **`caseId` · `principalId` · `sessionId` · `contextId` · `resourceId`
· `requestId`** e registra: método, status, content-type, **estrutura normalizada (apenas chaves,
nunca valores)**, **evidência de posse como booleano**, e flags (`scopeBlocked`, `error`).
**Nunca** expõe cookies, tokens, credenciais ou o conteúdo do recurso de um principal no resultado
de outro (C17/C18). `compareByResource()` produz o diff estrutural (chaves) entre principais —
evidência de comparação **segura**.

## 6. Testes sintéticos obrigatórios (18/18 PASS, navegador real, `evilHits=0`)

| # | Caso | Classe observada |
|---|------|------------------|
| 1 | Owner acessa recurso próprio | conforme |
| 2 | Cross-user tenta recurso privado (seguro) | conforme (403) |
| 3 | No-auth tenta recurso protegido | conforme (401) |
| 4 | Dois usuários em recurso legitimamente compartilhado | conforme (ambos 200) |
| 5 | Usuário acessa recurso público | conforme |
| 6 | Usuário comum tenta operação administrativa | conforme (403, vertical) |
| 7 | HTTP 200 sem conteúdo sensível | conforme (não-violação) |
| 8 | HTTP 200 com conteúdo de recurso indevido | **violação confirmada (IDOR)** — posse+regra |
| 9 | Resposta 403/404 conforme política | conforme |
| 10 | Política desconhecida | **inconclusivo** |
| 11 | Recurso inexistente (404) | **inconclusivo** |
| 12 | Sessão expirada | conforme (401) |
| 13 | POST autorizado (estado, reversível) | conforme (estado alterado e revertido) |
| 14 | POST negado sem alteração de estado | conforme (403; estado intacto) |
| 15 | Falha/cancelamento no meio da matriz | parciais OK + inconclusivo (cancelado) |
| 16 | Redirecionamentos/destinos fora do escopo | conforme (Scope Guard; evil não contatado) |
| 17 | Sanitização e isolamento de evidências | sem cookie/token/segredo nos resultados |
| 18 | Ausência de vazamento entre sessões | posse como booleano, não dado bruto |

O caso **8** é a confirmação positiva (endpoint deliberadamente vulnerável `/vuln/orders/:id`):
cross-user recebeu 200 **com o marcador de posse do dono** sob regra `lab-fixture` → `violacao-confirmada`
(`confirmedBy: evidencia-de-posse + regra-estabelecida + acesso-concedido`). O **mesmo** recurso pela
rota segura dá 403 (caso 2) → `conforme`. O caso **10** (vulnerável a ingenuidade) retorna 200 porém
**sem política** → `inconclusivo`, provando que 200 sozinho não confirma.

## 7. Regressão (item 6)

F1 **19/19** · F2 mock **16/16** · F2 e2e **11/11** · H1b-F1 **15/15** · H1b-F2 **18/18** ·
Validador V1 **127/127** · **corpos técnicos inalterados** · **`agents/` intacto (17)** ·
**nenhuma dependência nova** (`playwright-core 1.64.1`). Mudanças: **somente** `tools/web-runtime/`
(+ `manifest-h0.json`, saída gerada pelo Validador).

## 8. Limitações e riscos conhecidos

1. **Sequencial por desenho** — concorrência/corridas são **H1c**; a matriz não detecta TOCTOU
   nem condições de corrida de autorização.
2. **Sonda same-origin**: `apiProbe` usa `fetch` da página (cookies do contexto). Alvos com API em
   **origem distinta** exigiriam CORS ou `APIRequestContext` — não coberto nesta fase.
3. **Confirmação depende de marcador de posse** (evidência de laboratório). Em alvos reais, a
   "evidência de posse" precisará de uma fonte equivalente (fixture, política documentada ou
   premissa aprovada) — **nunca** inferida; na ausência, o veredicto fica em `anomalia`/`inconclusivo`.
4. **Alterações de estado** só executam com autorização explícita + fixture reversível; mutações em
   alvos reais permanecem fora de escopo.
5. **WebSocket, downloads, diálogos** seguem não suportados (herdado do F1/F2).
6. **Windows corporativo** não validado (degradação para HTTP, sem auth de navegador).

## 9. Critérios de evolução para H1c (condições de corrida)

1. H1b-F2 aceito e estável (esta entrega).
2. Modelo explícito de **concorrência controlada** (limites de paralelismo, isolamento por
   `BrowserContext` mantido, sem vazamento entre sessões sob carga).
3. Casos sintéticos de **TOCTOU / corrida de autorização** reversíveis, sem alvos reais.
4. Política de evidência para resultados **não determinísticos** (reprodutibilidade e tolerância a
   corrida), preservando Rule 6.
5. Decisão sobre cancelamento/limpeza de lotes concorrentes.

## 10. Recomendação

**Recomendo aceitar o H1b-F2** no ambiente de desenvolvimento: as responsabilidades (Resource
Registry, políticas com origem, executor sequencial, classificação) funcionam; a confirmação de
violação é conservadora (posse + regra); segredos e conteúdo de um principal nunca vazam para
outro; sem regressão. **Não** foram iniciados H1c, Caido ou integrações; `agents/` não arquivado;
P3/P4/P5 não executados. Aguardando aprovação para a próxima fase.
