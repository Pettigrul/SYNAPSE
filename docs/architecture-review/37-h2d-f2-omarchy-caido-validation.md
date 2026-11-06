# 37 — H2d-F2: Validação Real do Caido (Omarchy) — Relatório de Evidências

> Validação funcional **real** da integração Caido em Linux/Omarchy (fora da infra corporativa). **Read-only**,
> sem Replay/mutations/ops agênticas pagas/publicação de findings. Evidências **sanitizadas** (token nunca
> impresso). Homologação Windows corporativa é procedimento **separado** (não coberto aqui).

## 1. Ambiente real

| Item | Valor |
|------|-------|
| OS | Linux 7.2.5-3-omarchy |
| Node | v22.23.1 |
| Harness root | `<repo>` (Layout A — `engagements/` interno) |
| `.env` | presente; 3 vars carregadas: `CAIDO_BASE_URL`, `CAIDO_TOKEN`, `SA_ENGAGEMENT_ROOT` (valores nunca impressos) |
| Instância Caido | local, autorizada p/ laboratório (confirmado pelo operador) |
| Caido config | `caido` check = OK (baseUrl/token configurados) |

## 2. Matriz de evidências (PASS / FAIL / BLOCKED / NOT RUN)

| # | Verificação | Resultado | Evidência / nota |
|---|-------------|-----------|------------------|
| S1 | Resolução do `.env` | **PASS** | Doctor: `loaded 3 var(s) [CAIDO_BASE_URL, CAIDO_TOKEN, SA_ENGAGEMENT_ROOT]` |
| S2 | Doctor | **PASS** | fatos emitidos; sem valores de segredo |
| S3 | Ativação local (P2) | **NOT RUN** | Layout A (interno) — ativação não é necessária; mecanismo testado offline (`test-activation` 18/18) |
| S4 | Seleção de engagement | **BLOCKED** | `cli.mjs list` → *(no engagements under …/engagements)*; nenhum engagement válido existe |
| S5 | Preflight `caido-native` | **BLOCKED** (real/esperado) | `7/14 ok; blocked by: evidence, caidoProject`; `caido`=OK, `workspace`=DEGRADED (sem ativo) |
| S6 | `SA_SESSION_ID` | **NOT RUN** (ao vivo) | isolamento testado offline (P1/P3) |
| G1 | Disponibilidade do endpoint GraphQL | **PASS** | `caido.projects` respondeu (HTTP OK) contra a instância local |
| G2 | Autenticação (`Authorization: Bearer <token>`) | **PASS** | token aceito; listagem retornada |
| G3 | Projetos acessíveis | **PASS** | **11** projetos retornados (UUIDs reais) via `cli.mjs projects` |
| G4 | Compatibilidade de schema (`projects`/`QueryRoot`) | **PASS** | campos `id`/`name` retornados conforme SDL (F1) |
| G5 | Associação do projeto selecionado | **NOT RUN** | nenhum engagement; **não** se escolhe projeto por semelhança de nome (§2) |
| G6 | HTTP History (`requests`) | **BLOCKED** | gated por associação projeto↔engagement + escopo |
| G7 | HTTPQL / paginação / request+response | **BLOCKED** | idem G6 |
| G8 | Compat de schema History/request (F1) e Replay/Findings (F4a) | **NOT RUN** | depende de G5/G6 |
| M1–M8 | Monitor: init/tick/cursor/dedup/checkpoint/restart/reconcile/late-response | **BLOCKED** | depende de G5/G6; **não** gerar tráfego contra alvos reais |
| C1–C7 | Copilot: contexto incremental/proveniência/refs/recomendações/no-auto-classif./persistência/no-cross-contam. | **BLOCKED** | consome eventos reais do Monitor (M*) |
| R1 | Contrato de Investigation Record com proveniência real | **NOT RUN** | sem execução real para registrar; contrato validado offline (20/20) — **não** inventado |

**Consulta vazia × erro:** não aplicável a G6/G7 nesta rodada (BLOCKED antes da consulta) — a distinção
permanece implementada no adaptador (F1) e será exercida após o desbloqueio.

## 3. Causa do bloqueio (sem inventar dados)

`engagements/` não contém engagement válido (`ENG-A/` existe vazio, **sem** `.engagement.json`). Logo:
sem **engagement ativo**, sem **associação** de projeto e sem **scope.md** — pré-requisitos de G5→C7. Conforme
a autorização, **não** criei engagement, **não** associei projeto e **não** selecionei projeto por semelhança
de nome. Os projetos aparentemente de laboratório (`test`, `Testes harness`) **devem ser confirmados pelo
operador** — a lista inclui projetos que parecem alvos reais, que **não** devem ser acessados.

## 4. Correções

**Nenhuma incompatibilidade real encontrada** no que foi exercido ao vivo (G1–G4 PASS). Portanto **nenhuma
correção de código** e **nenhum novo teste de regressão** nesta rodada. As suites offline permanecem verdes e
o Validador segue **127/127** (reconfirmados).

## 5. Bloqueios para Replay supervisionado e F4b-2

- **Replay supervisionado (F4a ativo):** fora do escopo desta rodada **e** gated por (a) engagement+associação+
  scope válidos; (b) aprovação do operador por alvo (Approval Gate). **NOT RUN.**
- **F4b-2 (aceitação agêntica com LLM real):** exige campanha com LLM em laboratório autorizado — **NOT RUN/
  BLOCKED** nesta rodada (sem LLM pago/ops ofensivas).

## 6. Próximo passo operacional (comandos exatos para desbloquear)

O operador designa o **projeto de laboratório autorizado** (NÃO um alvo real) e configura o engagement:

```bash
# 1) criar o engagement de laboratório
node tools/workspace/cli.mjs init --name lab --modality graybox

# 2) scope.md com '# Scope' e '## In Scope' (apenas o alvo de laboratório autorizado)
#    crie engagements/lab/scope.md e instale:
node tools/workspace/cli.mjs scope --name lab --file engagements/lab/scope.md

# 3) associar o projeto Caido de LABORATÓRIO (escolha do operador; ex. 'Testes harness' ou 'test')
#    UUIDs disponíveis via: node tools/workspace/cli.mjs projects
node tools/workspace/cli.mjs associate --name lab --project-id <UUID-do-projeto-de-laboratorio>

# 4) selecionar + conferir
node tools/workspace/cli.mjs use --name lab
node tools/preflight/cli.mjs preflight --profile caido-native   # deve sair READY/DEGRADED, não BLOCKED
```

Com isso, re-executar esta validação cobre G5→G8 (History/HTTPQL/paginação/request+response), M1–M8
(Monitor com tráfego **sintético de laboratório** autorizado) e C1–C7 + R1 (Copilot + Investigation Record
com proveniência real).

## 7. Resumo

- **Conectividade real do Caido na Omarchy: COMPROVADA** para descoberta read-only (endpoint/auth/projects/
  schema `projects`). 
- **Cadeia Engagement→History→Monitor→Copilot→Record: BLOCKED** por pré-requisito de engagement/associação/
  scope — desbloqueável pelo operador com os comandos acima (§6), sem qualquer mudança de código.
- **Windows corporativo:** homologação **separada** (não nesta rodada). **F4b-2/F6/H3:** não iniciados.
