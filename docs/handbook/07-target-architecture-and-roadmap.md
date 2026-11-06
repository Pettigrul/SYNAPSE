# 7 — Arquitetura-alvo (Caido), Whitebox e Preflight no Roadmap

> Este capítulo registra **decisões de arquitetura/roadmap** — a maioria **📋 PLANNED**. Nada aqui está
> implementado. A referência de planejamento é
> [`../architecture-review/08-capability-roadmap.md`](../architecture-review/08-capability-roadmap.md).

## 7.1 Arquitetura-alvo Caido-native (por referência — H2b) 📋

Detalhada em [`../architecture-review/34-h2b-f0-caido-integration-assessment.md`](../architecture-review/34-h2b-f0-caido-integration-assessment.md)
(**não duplicada**). Pontos incorporados por referência:

- **Caido é obrigatório para o MVP operacional completo**; o **H1 permanece independente** (núcleo apto a
  piloto em lab). A dependência de Caido é do MVP completo, não do núcleo (fallback nativo preservado).
- **Runtime de integração = Node.js** (o SYNAPSE já é Node sob o Pi) — sem binário Go, Docker, WSL ou admin.
- **GraphQL direto × Client SDK oficial:** spine recomendado = **Node ↔ GraphQL** (`/graphql` + PAT) com
  `fetch` nativo (sem dep); Client SDK (`@caido/sdk-client`) e subscriptions WS são opções de incremento
  sob aprovação de dependência.
- **History/HTTPQL, monitoramento, Replay, Findings:** consulta de History por HTTPQL; **monitoramento
  determinístico por cursor** (poll ordenado por `created_at`, cursor persistido, reconciliação de perdidos)
  — **sem LLM por request**; Replay supervisionado e Findings (com `dedupeKey`) via GraphQL.
- **Workflow Intelligence:** geração/validação **offline** (F5a entregue — Planner + IR intermediário +
  validador, cap. 14). **Geração/importação/publicação/execução NATIVA (F5b): pós-MVP (V2), opcional**
  (decisão de produto 2026-11-05) — `definition` opaca na SDL; **não** é pré-requisito do MVP nem de H3.
- **Proveniência das evidências:** cada item carrega `{caidoProjectId, requestId, cursor, ts}` → Investigation
  Record.
- **Controles de autorização:** operações ativas passam pela Capability Bridge (aprovações do operador).
- **Plugin/eventos in-Caido** (`onInterceptRequest/Response`, `sdk.meta.db()`): **otimização condicionada**
  a teste de aceitação no Windows (assinatura ed25519/sideload) — não é pré-requisito do MVP.

Plano incremental H2b-F1..F6 em [34] §8. **Não implementar nesta rodada.**

## 7.2 Whitebox Intelligence (H2c-F2+) — decisão de produto 📋

> **Base F1 já implementada** (workspace + modalidade + segregação Whitebox por código): ver
> [cap. 8](08-pentest-engagement-workspace.md). Esta seção cobre a **inteligência Whitebox (F2+)**, ainda 📋.

GitHub, Confluence, code review, secret scanning, STRIDE, Business Logic Intelligence e Pentest Guidelines
constituirão um **fluxo adicional, opcional e explicitamente acionável**, integrado aos flows existentes,
relacionado ao `scope.md` e ao Recon (pode ocorrer **antes ou depois** dele conforme o engagement). Todos
os artefatos, código recuperado e resultados ficam **segregados em `Whitebox/`**.

**Requisito fundamental:** o pentest **Black Box / Gray Box deve permanecer metodologicamente agnóstico ao
código.** Controles obrigatórios (📋 — a documentar/implementar; **controles efetivos, não só prompts**):

| # | Controle de acesso Whitebox (PLANNED) |
|---|----------------------------------------|
| 1 | O **dispatcher não pode consultar `Whitebox/`** por padrão |
| 2 | Agentes convencionais **não podem pesquisar** seu conteúdo |
| 3 | Código-fonte **não é indexado automaticamente** para investigações Black Box |
| 4 | Resultados de code review **não contaminam** hipóteses Black Box |
| 5 | Pentest Guidelines derivados de Whitebox permanecem **segregados** |
| 6 | Acesso exige **comando explícito + autorização do operador** |
| 7 | **Revogação exige contexto limpo** — sem reuso de conteúdo Whitebox já carregado |

> **Projeto:** prever um mecanismo efetivo (ex.: segregação de diretório fora do Loading Chain/Context
> Priority + gate de carregamento explícito + invalidação de contexto na revogação), **não** apenas
> instruções em prompt. **Registrar como PLANNED; não implementar agora.** Mapeia-se à seção do roadmap
> [08] §8 (H2c) — ver também o backlog preservado (GitHub/Confluence MCP, Business Logic, STRIDE, etc.).

## 7.3 Environment & Bootstrap / Preflight (H2d) — capacidade transversal

> **F0/F1 ENTREGUES** ✅🧪 → `tools/preflight/` + handbook **cap. 15** + diagnóstico [35]. **F2+ 📋** (abaixo).

Inclui: instalação reproduzível; configuração dos runtimes **Pi / Claude Code / Antigravity** (quando
suportados); configuração e diagnóstico de **MCPs**; scripts Windows **`.bat`**; persistência segura de
configurações; compatibilidade com **Windows corporativo restrito** (sem Docker/WSL/admin); **SYNAPSE
Doctor**; **Environment Preflight**.

**Preflight — verificações (📋):** Runtimes · Extensões · KB · Policies · Execution Context · Scope ·
Browser · Caido · MCPs · Workspace · Evidências e persistência.

> **Checks Caido/Monitor para o Preflight** (de H2b-F1/F2; consumir `monitor.status()` — cap. 9 §9.9 e
> cap. 10 §10.5): disponibilidade do Caido · associação correta projeto↔engagement · estado do History
> Monitor (RUNNING/PAUSED/STOPPED/ERROR) · persistência/checkpoint válidos · atraso (`lastSyncAt`/backlog) ·
> recuperação (conexão/failures) · compatibilidade de schema/versão da API · capacidade de consulta ao
> History. Executável **sem LLM e sem operação ofensiva**.

**Perfis (📋):** `core-lab` · `caido-native` · `full-engagement`.
**Vereditos (📋):** `READY` · `DEGRADED` · `BLOCKED`.

Requisitos de projeto (📋):
- Preflight **executável sem LLM** e **sem operações ofensivas**.
- Dependências opcionais (GitHub, Confluence, STRIDE) **não bloqueiam** um engagement Black Box quando seus
  fluxos não estão habilitados → nesses casos o veredito é `DEGRADED`, não `BLOCKED`.
- **Geração de workflows NATIVOS do Caido (H2b-F5b): capacidade opcional/PLANNED** (decisão de produto
  2026-11-05) — o Preflight a reporta como opcional e **NÃO bloqueia** o perfil `caido-native` (ausência/
  incompatibilidade → `DEGRADED`, nunca `BLOCKED`). O MVP `caido-native` fica READY com History/monitoramento/
  Copilot/Replay/Automate(leitura)/Findings/Investigation Records + integração real, sem workflows nativos.
- `doctor.bat`, `preflight.bat`, `bootstrap.bat` e o **módulo Node.js compartilhado** — **IMPLEMENTADOS em
  F1** (`tools/preflight/`, cap. 15); probe de conectividade viva e credential-store do Windows ficam p/ F2+.
- **Não presumir que `go run` contorne restrições corporativas de execução.**

```mermaid
flowchart LR
  subgraph Preflight [preflight (sem LLM, sem ofensa)]
    direction TB
    R[Runtimes] --> X[Extensões] --> K[KB/Policies] --> C[Execution Context/Scope]
    C --> B[Browser] --> CA[Caido] --> M[MCPs] --> W[Workspace/Evidências]
  end
  Preflight --> V{Perfil}
  V -->|core-lab| V1[READY/DEGRADED/BLOCKED]
  V -->|caido-native| V2[READY/DEGRADED/BLOCKED]
  V -->|full-engagement| V3[READY/DEGRADED/BLOCKED]
```

## 7.4 Roadmap e dívidas (ponteiro)

Planejamento completo e estados em [08] §7–§8 (atualizado nesta rodada). Frentes preservadas: **H1**
(núcleo, concluído) · **H2a** (este handbook) · **H2b** (Caido-native + Workflow Intelligence) · **H2c**
(Pentest Workspace + Whitebox opcional) · **H2d** (Windows Bootstrap + Preflight) · **H3** (piloto, aceite
gated por Caido). **Dívidas técnicas** carregadas ([08] §7.1): persistência do resultado autoritativo
independente do fechamento textual; completude do Record em execuções interrompidas; negativos agênticos
pendentes; P5/P6 como melhorias opcionais.

> Esta rodada (H2a) **não** inicia H2b-F1 nem H2c-F0/F1. Documentação apenas.
