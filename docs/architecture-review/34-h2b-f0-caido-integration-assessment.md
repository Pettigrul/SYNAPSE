# 34 — H2b-F0: Caido Integration Architecture Assessment

> **Escopo desta rodada:** diagnóstico, pesquisa técnica, arquitetura e proposta. **Não** implementa,
> **não** adiciona dependências, **não** altera KB/`agents/`/`policies`/ferramentas, **não** roda LLM pago
> nem toca alvos reais. Decisão de produto registrada: **o MVP operacional completo do HackBot é um
> Caido-native Pentest Copilot**; o H1 (núcleo independente) permanece válido e apto a piloto
> supervisionado em laboratório.

## 1. O que já existe no repositório (não reabrir)

Pesquisa Caido anterior já documentada: [00] §A4/H2, [03] §4 (caido-mcp-server, VibeHacking, shift, Ebka,
pi-caido), [06] §compatibilidade Windows. Síntese reusada:
- **`c0tton-fluff/caido-mcp-server`** — Go, ~70 tools via GraphQL, cookie-jar por sessão, IDOR/BOLA batch
  multi-token. **Binário Go** → esbarra em "execução de binários restrita" no Windows corporativo.
- **`VibeHacking`** — plugin TS que roda um MCP **dentro** do Caido (Streamable HTTP localhost), gating
  humano por tool (`auto/confirm/disabled`), **sem runtime Node separado**; exige Caido ≥0.59.
- **Regra herdada ([06]):** nenhum componente do MVP pode depender de Docker/WSL/admin/binário não
  autorizado. (Esta rodada **eleva** o Caido a requisito do MVP — mas a arquitetura escolhida deve
  respeitar a mesma restrição de ambiente.)

## 2. Superfícies de integração do Caido (pesquisa, com referências)

Fontes: [developer.caido.io/llms-full.txt](https://developer.caido.io/llms-full.txt),
[Backend SDK](https://developer.caido.io/reference/sdks/backend/),
[Frontend SDK](https://developer.caido.io/reference/sdks/frontend),
[GraphQL](https://docs.caido.io/app/concepts/graphql), [HTTPQL](https://docs.caido.io/reference/httpql),
[Workflows](https://docs.caido.io/guides/workflows),
[Workflow Nodes](https://docs.caido.io/reference/workflow_nodes.html),
[Plugin store](https://developer.caido.io/guides/distribution/store.html),
[Intercept](https://docs.caido.io/guides/intercept).

| Superfície | Como se acessa | Observações (verificadas) |
|-----------|----------------|---------------------------|
| **GraphQL API** | `<instanceUrl>/graphql` (default `http://localhost:8080`), introspection; `Authorization: Bearer <PAT>` (`CAIDO_PAT`) | público p/ terceiros; **estabilidade não garantida entre releases** |
| **Novos requests (stream)** | subscription GraphQL `createdRequest { requestEdge { cursor node { id host method path } } }` | **feed cursor-based** → monitoramento contínuo sem LLM por request |
| **HTTP History + HTTPQL** | Client SDK `client.request.list().filter('req.host.eq:"…"')`; backend `sdk.requests.matches(filter,req,resp?)`, `RequestsQuery.filter().ascending("req"/"resp", field)` | namespaces `req.`/`resp.`; order fields incl. `created_at` |
| **Replay** | backend `ReplaySDK.createSession(source, collection?)`; frontend `sdk.replay.sendRequest(sessionId,{raw,connectionInfo,…})` | `RequestSource = {type:"Raw",…} | {type:"ID",id}` |
| **Automate** | frontend `sdk.automate.getSessions()/getEntries(id)` | **backend/GraphQL de Automate: não documentado** (verificar) |
| **Findings** | backend `sdk.findings.create({title,reporter,request,description?,dedupeKey?})`, `exists(dedupeKey)`, `get`; Client SDK `client.finding.list/get/create/update` | `dedupeKey` recomendado p/ dedup automatizada; import/export entre instâncias (v0.55) |
| **Sitemap** | frontend `SitemapSDK.getTreeEntries()/getChildren(id)` | **backend/GraphQL de sitemap: não documentado** |
| **WebSocket** | frontend `InterceptPageContext.websocketSelection` | **backend/GraphQL de WS: não documentado** (suporte limitado) |
| **Workflows** | tipos **Passive / Active / Convert**; definição JSON; nó JS `export function run(input, sdk)`; manifest plugin `kind:"workflow"` + `definition` | import/export JSON; repo GitHub de community workflows |
| **Backend plugin runtime** | **QuickJS** (`caido:plugin`, `caido:utils`, `llrt/*`); **sem Node geral**; `caido:http` fetch (**`Response.body` NÃO implementado ainda**), `sdk.net.connect`, `sdk.requests.send` | persistência: **`sdk.meta.db()` → SQLite** em Caido Data; `sdk.meta.path()` p/ arquivos |
| **Eventos backend** | `onInterceptRequest(sdk,req)` / `onInterceptResponse(sdk,req,resp)` **read-only**; `onProjectChange`; `onUpstream` (único hook de escrita; opt-in por domínio) | intercept hooks disparam **só p/ requests interceptados**, não todo o tráfego |
| **Backend↔frontend** | `sdk.api.send("evt",…)` + frontend `sdk.backend.onEvent("evt",…)` | ponte interna ao plugin |
| **Empacotamento/instalação** | `pnpm create @caido-community/plugin` → `dist/plugin_package.zip`; **assinatura ed25519 obrigatória**; store via PR em `caido/store`; instalar de arquivo: Client SDK `client.plugin.install({file})` (precisa Caido rodando + PAT) | **admin/Docker/WSL: não exigidos pela doc**; instalar plugin precisa só do app Caido + PAT |

> Itens marcados "não documentado" vêm do gap na doc consolidada — **verificar no schema GraphQL vivo**
> antes de depender deles.

## 3. Comparação de arquiteturas

| | A — MCP isolado (Go) | B — Node ↔ GraphQL/Client SDK | C — Plugin Caido (QuickJS) | D — Híbrido |
|---|---|---|---|---|
| Runtime novo | **Binário Go** | Nenhum (HackBot já é Node sob Pi) | QuickJS dentro do Caido | B + C |
| Windows corporativo | ⚠️ **binário não autorizado** | ✅ só app Caido + PAT | ✅ só app Caido (+ assinatura) | ⚠️ herda C |
| Monitoramento contínuo s/ LLM | via GraphQL | ✅ subscription `createdRequest` **ou** poll por cursor | ✅ `onInterceptRequest` (só interceptados) + SQLite | ✅ |
| Query/Replay/Findings | ✅ 70 tools | ✅ GraphQL/Client SDK | ✅ SDKs backend | ✅ |
| Persistência | token file | lado HackBot (engagement store) | ✅ `sdk.meta.db()` SQLite local | ✅ |
| Workflows (gerar/validar) | — | ✅ gera JSON; valida via Replay/Automate | ✅ empacota Passive/Active/Convert | ✅ |
| Atrito de distribuição | build Go | **nenhum** (só PAT) | **assinatura ed25519 + store/sideload** | médio |
| Acoplamento ao LLM/dispatcher | externo | ✅ reusa Capability Bridge + Execution Context | sandbox (não roda o LLM) | ✅ |

## 4. Arquitetura recomendada (a menor que atende o MVP)

**Spine = Aproximação B "enxuta": o HackBot (Node, já presente sob o Pi) fala GraphQL diretamente com o
Caido local (`/graphql` + PAT), reusando a Capability Bridge e o Execution Context.** Justificativa:

- **Zero runtime/binário novo** (não há Go, Docker, WSL nem admin): só o **app Caido** (dependência já
  prevista) + um **PAT**. Respeita a restrição do Windows corporativo.
- **Monitoramento contínuo sem LLM por request:** **poll por cursor** do HTTP History (HTTPQL ordenado por
  `created_at`, cursor persistido) — robusto a eventos perdidos e **sem WebSocket/dep nova**; a subscription
  `createdRequest` fica como otimização opcional (exige cliente WS). A triagem passiva usa **HTTPQL +
  heurísticas locais**; o LLM entra só sob demanda do operador ou gatilho orçado.
- **Query/Replay/Findings/Sitemap/Automate** via GraphQL/Client SDK; **operações ativas (Replay/active
  workflows) passam pelas aprovações da Capability Bridge** (operador provisiona; o agente não se
  autoriza) — exatamente o modelo H1 já validado.
- **Geração de Workflows** (Passive/Active/Convert) = o HackBot produz **JSON de workflow**; o operador
  importa (ou via Client SDK); validação = dry-run por Replay/Automate. Não exige plugin.

**Companheiro opcional (Aproximação C), DEFERIDO para increment tardio:** um **plugin backend assinado**
dentro do Caido adiciona (a) hooks live `onInterceptRequest/Response`, (b) persistência `sdk.meta.db()`
SQLite local e (c) **empacotamento de Passive/Active/Convert Workflows com nós "Create Finding"** que
rodam no Caido sem LLM. Fica **condicionado a um teste de aceitação no Windows** (assinatura ed25519 +
sideload/store) — porque o spine (B) já entrega o MVP **só com app + PAT**.

> Em uma frase: **B agora, C depois sob gate.** A não ser que o teste de aceitação Windows prove o
> contrário, o MVP não depende do plugin.

## 5. Fluxo completo do copilot (incl. monitoramento contínuo)

```
Engagement aberto (↔ Caido project; Execution Context do operador; PAT)
        │
        ├─(loop sem LLM) poll cursor → HTTP History (HTTPQL) → dedup → engagement store
        │        └─ heurísticas/HTTPQL marcam candidatos (surface×classe) → fila de leads
        │
        ├─(sob demanda / gatilho orçado) LLM: correlaciona lead ↔ técnica T[N]/B[N] + hipótese
        │        └─ consulta KB (dispatcher), formula experimento essencial
        │
        ├─(ativo, SUPERVISIONADO) Capability Bridge aprova → Replay/active workflow
        │        └─ evidência com proveniência Caido (projectId, requestId, cursor, ts)
        │
        ├─ Findings: create/correlate (dedupeKey) ↔ hipótese ↔ T[N]/B[N]
        │
        └─ Investigation Record (contrato H1) — veredito do validador VERBATIM + proveniência Caido
```
- **Controle de LLM:** monitoramento e triagem são **LLM-free**; o LLM é orçado por engagement e acionado
  só em correlação/plano/relatório ou quando o operador pede ("recommend tests").
- **Copilot durante o trabalho manual:** enquanto o operador faz Replay/Automate manualmente, o HackBot
  observa o stream (cursor), sugere testes (T[N]/B[N]) e aponta leads — sem interromper.

## 6. Contratos operacionais mínimos

| Contrato | Definição mínima |
|----------|------------------|
| **Projeto & engagement** | 1 engagement ↔ 1 Caido project; `onProjectChange`/projects service detecta troca; engagement store chaveado por projectId |
| **Escopo** | Caido scopes ↔ `scope.allowHosts` do Execution Context; reconciliar na abertura; fora de escopo é recusado (Rule 0) |
| **Identidade dos requests** | chave estável = GraphQL `node.id` (+ `host/method/path` p/ correlação humana) |
| **Cursor de monitoramento** | `created_at`+`id` do último request visto, **persistido** por engagement |
| **Reconciliação de perdidos** | na reconexão, consulta `created_at > lastCursor` (ordem ascendente) e faz backfill |
| **Deduplicação** | requests: `(method,host,path,hash(body))`; findings: `dedupeKey` (nativo Caido) |
| **Evidence provenance** | todo item carrega `{caidoProjectId, requestId, cursor, ts, httpqlOrigin}` → Investigation Record |
| **Autorização de ops ativas** | Replay/active workflow só com aprovação da Capability Bridge (op+url); o agente **nunca** auto-autoriza |
| **Controle de consumo de LLM** | triagem LLM-free; orçamento de LLM por engagement; gatilhos explícitos |
| **Persistência** | engagement store (cursor, dedup, índice de evidências, Investigation Records); opção C usa `sdk.meta.db()` |
| **Desconexão & recuperação** | PAT expirado → re-auth; Caido fora → degrada ao caminho **H1 nativo**; reconexão → backfill por cursor |
| **Integração dispatcher/Bridge/Record** | novos ops de bridge (`caido.history.query`, `caido.monitor.poll`, `caido.replay.send`, `caido.findings.*`) sob Execution Context; fluxos 9/12 consomem o stream; evidência com proveniência no Record |

**Restrições de ambiente (Windows corporativo):** sem Docker/WSL/admin/binários não autorizados; **não
presumir que `go run` contorne a restrição de execução**. O spine (B) usa só Node (já presente) + app
Caido + PAT. O plugin (C) exige assinatura ed25519 — tratado como increment sob gate.

## 7. Critérios de aceite do MVP Caido-native

1. HackBot conecta a um Caido rodando via **GraphQL + PAT**, **sem** Go/Docker/WSL/admin.
2. **Monitoramento contínuo:** novos requests proxied aparecem no engagement em ≤N s, por cursor, com
   **0 chamadas de LLM por request**; eventos perdidos reconciliados na reconexão.
3. Operador filtra o History por **HTTPQL** via copilot e recebe resultados corretos.
4. **Replay supervisionado** executa só com aprovação da Capability Bridge; evidência capturada com
   **proveniência Caido** em um Investigation Record completo.
5. **Findings** criados/correlacionados com `dedupeKey`, ligados a hipótese + T[N]/B[N].
6. **Workflows** Passive/Active/Convert gerados como JSON, **validados** (dry-run) e importáveis.
7. **Persistência por engagement** sobrevive a desconexão/reconexão.
8. **Degradação graciosa:** sem Caido, o HackBot cai no caminho H1 nativo (sem falha).
9. Validado em **Windows corporativo** (teste de aceitação) — ou **BLOCKED** com diagnóstico objetivo se
   o ambiente proibir app/PAT (sem simular).

## 8. Plano de implementação (incrementos pequenos)

| Incremento | Entrega | Depende | LLM | Teste |
|-----------|---------|---------|-----|-------|
| **H2b-F1** | Cliente GraphQL read-only (fetch nativo, **sem dep**): conexão/auth/health + query de History por HTTPQL | H2b-F0 | não | mock GraphQL determinístico |
| **H2b-F2** | Monitoramento contínuo por **cursor** (poll + persistência + reconciliação + dedup) — LLM-free; emite stream de engagement | F1 | não | mock com eventos perdidos |
| **H2b-F3** | Ops de bridge Caido (`caido.history.query`, `caido.monitor.*`) sob Execution Context + fluxos 9/12; proveniência no Investigation Record | F2; Capability Bridge | não | determinístico |
| **H2b-F4** | Ops ativas supervisionadas: Replay via aprovações; Findings create/list/dedupe; correlação T[N]/B[N] | F3 | sob demanda | determinístico + aprovação |
| **H2b-F5** | Geração/validação de Workflows (Passive/Active/Convert JSON) + import/export; recomendações do copilot | F4 | sob demanda | dry-run |
| **H2b-F6** *(opcional, sob gate)* | Plugin backend **assinado** in-Caido: hooks live + `sdk.meta.db()` + workflows empacotados | F5; **teste de aceitação Windows (assinatura/sideload)** | não | aceitação Windows |

Cada incremento: testes determinísticos, **sem alvos reais**, **fallback nativo** quando Caido ausente,
**sem novas deps até decisão explícita** (F1/F2 viáveis com `fetch` nativo; subscription WS e Client SDK
são opções de increment com aprovação de dependência).

## 9. Limitações e questões abertas (verificar antes de implementar)

- **Estabilidade do schema GraphQL** muda entre releases (fixar versão do Caido no teste de aceitação).
- **Automate/Sitemap/WebSocket backend/GraphQL** não documentados na doc consolidada — confirmar no schema
  vivo; frontend SDK existe, mas o spine (B) é externo.
- **Subscriptions** exigem cliente WS (dep) — por isso o MVP usa **poll por cursor** (sem dep).
- **Plugin (C)** exige **assinatura ed25519** e sideload/store — viável sem admin pela doc, mas **não
  verificado no Windows corporativo**.
- `caido:http` `Response.body` **não implementado** no backend plugin — afeta C, não o spine B.

## 10. Referências

- [Caido Developer — llms-full.txt](https://developer.caido.io/llms-full.txt) · [Backend SDK](https://developer.caido.io/reference/sdks/backend/) · [Frontend SDK](https://developer.caido.io/reference/sdks/frontend)
- [Backend plugins concept](https://developer.caido.io/concepts/essentials/plugins/backend.html) · [Intercept guide](https://docs.caido.io/guides/intercept)
- [GraphQL concept](https://docs.caido.io/app/concepts/graphql) · [HTTPQL reference](https://docs.caido.io/reference/httpql) · [HTTP History](https://docs.caido.io/app/quickstart/http_history)
- [Workflows guide](https://docs.caido.io/guides/workflows) · [Workflow Nodes](https://docs.caido.io/reference/workflow_nodes.html)
- [Plugin store/distribution](https://developer.caido.io/guides/distribution/store.html) · [Plugins install](https://docs.caido.io/guides/plugins_install)
- [caido/awesome](https://github.com/caido/awesome) · community: `c0tton-fluff/caido-mcp-server` (Go, MCP), `vvvvvvvvvvel/VibeHacking` (plugin MCP in-Caido)

> Itens derivados do resumo do fetch (não verbatim) devem ser confirmados no schema/doc vivos antes da
> implementação. Nenhum comando/contrato acima foi executado nesta rodada.
