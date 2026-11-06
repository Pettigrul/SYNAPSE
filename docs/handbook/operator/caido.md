# Guia Caido (operador)

> Consolida o onboarding Caido. Técnico: [cap. 9](../09-caido-connectivity.md) (conectividade/GraphQL),
> [cap. 16](../16-multi-engagement-and-caido-onboarding.md) (binding/onboarding), [cap. 10–14](../10-caido-live-history-monitor.md) (Monitor/Copilot/Ativo/Investigação/Workflow).
> **Nunca** inclua credenciais reais. **Workflows nativos Caido (F5b) = V2, fora do MVP.**

## Credencial e opt-in por projeto

O `CAIDO_TOKEN` do `.env` central chega à raiz do harness e aos projetos com `activate --project <dir> --caido`, decisão guardada
fora do projeto, ao lado do `.env`. Detalhes e limites: [configuração](configuration.md#opt-in-do-caido).

## 1. URL da instância e GraphQL
- A API é **`<CAIDO_BASE_URL>/graphql`**. Caido desktop local: normalmente `http://127.0.0.1:8080`.
- Abra `<baseUrl>/graphql` no navegador para o GraphQL Playground (inspeção). Root é `QueryRoot`.

## 2. Credenciais — PAT × access token (comportamento comprovado do adaptador)
- O header enviado é sempre **`Authorization: Bearer <token>`** (`tools/web-runtime/backends/caido.mjs`).
- `CAIDO_TOKEN` aceita **PAT** (prefixo `caido_…`) **ou** um **access token** — o adaptador trata ambos como
  bearer; **não** distingue no protocolo além do valor.
- **Renovação:** o Caido pode exigir troca **PAT → access token** via *Device Authorization flow*; o
  adaptador aceita o bearer resultante. **Não** há renovação automática no harness — ao expirar, gere/renove
  o token na instância e atualize `CAIDO_TOKEN`. Detalhes em [cap. 9 §9.x](../09-caido-connectivity.md).
- O token **nunca** é persistido no manifesto nem impresso (só nomes de variáveis aparecem).

## 3. Descobrir UUIDs de projeto
```bash
node tools/workspace/cli.mjs projects
```
- Lista UUIDs/nome (op `caido.projects`, **não** gated por associação). Em instância local sem `@cloud`,
  `projects` pode degradar (`available:false`) → use o UUID visível na UI/`currentProject`.

## 4. Associar e selecionar o projeto correto
```bash
node tools/workspace/cli.mjs associate --name <engagement> --project-id <uuid>   # grava no manifesto
node tools/workspace/cli.mjs use --name <engagement>                              # seleciona o engagement
```
- O projeto vem do **manifesto do engagement selecionado**. **Sem** fallback silencioso entre projetos;
  rebind exige `--force`. O Bridge recusa acesso quando o projeto corrente ≠ projeto associado.

## 5. Interpretar falhas (auth/associação)
| Sintoma | Código | Ação |
|---------|--------|------|
| Sem config de instância | `caido-not-configured` | defina `CAIDO_BASE_URL`/`CAIDO_TOKEN` no `.env` |
| Engagement sem projeto | `caido-no-project` | `associate --project-id <uuid>` |
| Projeto corrente ≠ associado | `caido-project-mismatch` | selecione o projeto certo na instância / reassocie |
| `projects` indisponível | `available:false` | instância local sem `@cloud`; use `currentProject`/UUID da UI |
| 401/403 na instância | (erro de rede sanitizado) | token expirado/incorreto → renove `CAIDO_TOKEN` |

## 6. Doctor e Preflight (estrutural × conectividade real)
```bash
node tools/preflight/cli.mjs doctor
node tools/preflight/cli.mjs preflight --profile caido-native   # exige instância + binding do engagement ativo
```
- **Importante (honestidade):** Doctor/Preflight verificam **configuração/estrutura** (presença de
  baseUrl/token, binding, escrita de evidências) — **não** comprovam conectividade real nem autenticação viva.
  A **conectividade real** só é exercida quando uma op `caido.*` roda contra a instância.

## 7. Preparar a validação de History/Monitor/Copilot/Replay
- **History:** `caido.history` (query `requests`, cursor/HTTPQL). **Monitor:** `caido.*` incrementais ([cap. 10](../10-caido-live-history-monitor.md)).
- **Copilot:** `copilot.summary|endpoints|hypotheses|recommendations|unassessed|relate|setState` ([cap. 11](../11-caido-pentest-copilot.md)); reusa `references/pattern-index.md` (sem DB).
- **Replay (ativo):** `caido.replay.run` — **exige aprovação do operador** para o alvo (Approval Gate); sem ela → recusado. **Findings:** `caido.findings.create` exige `requestId` (evidência) + `title`/`reporter`.
- Estes fluxos são **TESTED OFFLINE** (mocks determinísticos); a validação **em instância real** é o próximo passo (ver [readiness.md](readiness.md)).

## 8. Validação real na Omarchy (H2d-F2) — estado atual
- **Comprovado ao vivo:** endpoint GraphQL, autenticação (Bearer) e `caido.projects` (11 projetos) na
  instância local — ver o relatório de evidências [37](../../architecture-review/37-h2d-f2-omarchy-caido-validation.md).
- **Bloqueado por configuração:** History/Monitor/Copilot/Record exigem um **engagement com projeto de
  laboratório associado + scope.md**. O operador desbloqueia com os comandos de [37 §6](../../architecture-review/37-h2d-f2-omarchy-caido-validation.md)
  (criar engagement `lab` → `scope` → `associate` o **projeto de laboratório autorizado** → `use`). **Não**
  associe um projeto que pareça alvo real; escolha o projeto de laboratório.
