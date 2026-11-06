# 16 — Multi-Engagement & Caido Onboarding (pré-piloto)

> Ajuste pré-piloto: uma instalação do harness suporta **vários pentests independentes**, cada um com seu
> workspace, escopo, **projeto Caido**, estado e evidências. Config de **instância** (URL/credenciais) é
> separada da config de **engagement** (projeto Caido). O engagement ativo é **selecionado dinamicamente por
> sessão** (`cli.mjs use`), sem editar o `.env` — ver §16.4.1. Artefatos: `tools/workspace/engagement.mjs`
> (helpers de associação/seleção/ativo-por-sessão/confinamento/**evidência por engagement**),
> `tools/workspace/cli.mjs` (CLI: init|scope|associate|use|active|clear|select|show|list|projects),
> `tools/preflight/*` (checks `caido`/`caidoProject`/`evidence`), `.env.example`. Evidências persistentes em
> **`<engagement>/evidence`** (sem dir global, sem `/tmp`) — ver §16.5.1. Diagnóstico:
> [`../architecture-review/36-h2d-multi-engagement-assessment.md`](../architecture-review/36-h2d-multi-engagement-assessment.md).

## 16.1 Organização (padrão)

- **Harness** instalado no seu próprio repositório (NÃO é duplicado por engagement).
- **Diretório-base dos engagements FORA do repo**, apontado por `SA_ENGAGEMENT_ROOT`.
- **Um subdiretório por engagement** sob esse base; `use` seleciona o ativo (`SA_ENGAGEMENT` só fora de projeto).
- **Um projeto Caido associado por engagement** (gravado em `<engagement>/.engagement.json`).

```
<repo>/                      # harness (único)
SA_ENGAGEMENT_ROOT/
├── .sa-state/  active-<sessão>.json   # ponteiro de seleção (sem segredos)
├── acme/      .engagement.json (caido.projectId=…) · scope.md · .hackbot/ (estado) · evidence/ (evidências) · 1-Reports/ …
└── globex/    .engagement.json (caido.projectId=…) · scope.md · .hackbot/ · evidence/ …
```

## 16.2 Separação de configuração (instância × engagement)

| Config | Onde | Observação |
|--------|------|-----------|
| `CAIDO_BASE_URL`, `CAIDO_TOKEN` | **instância** (`.env` / env) | compartilhados por todos os engagements da máquina |
| **projeto Caido** | **engagement** (`.engagement.json`) | derivado do engagement SELECIONADO |
| `CAIDO_PROJECT_ID` | compat opcional (`.env`) | **só** single-engagement; **nunca** sobrepõe o binding do engagement; **sem** fallback silencioso p/ outro projeto |
| **evidências persistentes** | **engagement** (`<engagement>/evidence/`) | resolvido do engagement ativo; **sem** dir global, **sem** `/tmp` |
| `SA_EVIDENCE_DIR` | **deprecado** (`.env`) | compat legada **só** sem engagement ativo; **nunca** sobrepõe o `evidence/` do engagement |

Resolução do projectId (`resolveProjectId`): **manifesto do engagement vence** → senão `CAIDO_PROJECT_ID`
(compat) → senão **nenhum**. Se nenhum, as operações dependentes do projeto são **bloqueadas** com erro
acionável (nunca escolhem outro projeto).

## 16.3 Onboarding Caido — passo a passo verificável

> Exemplos Linux/Omarchy. Observações Windows ao final. **Nunca** inclua credenciais reais; o PAT fica em
> env var de usuário ou arquivo com ACL restrita, **nunca** no repo.

**1. Identificar a URL da instância/API.** A API GraphQL do Caido fica em **`<baseUrl>/graphql`** com header
`Authorization: Bearer <token>`. Para o Caido desktop local, a `baseUrl` costuma ser `http://127.0.0.1:8080`
(porta configurável). Confirme no próprio Caido (Settings → a URL exibida).

**2. GraphQL Playground.** Abra `<baseUrl>/graphql` no navegador (ex.: `http://127.0.0.1:8080/graphql`) para
explorar o schema e testar as queries abaixo.

**3. Obter o token.** Gere um token na instância Caido (um PAT quando disponível). Exporte localmente:

```bash
# Linux/Omarchy — em .env (gitignored) ou export de sessão:
echo 'CAIDO_BASE_URL=http://127.0.0.1:8080' >> .env
echo 'CAIDO_TOKEN=<seu-token>'              >> .env   # NUNCA commitar
```

**4. Renovar o token.** Se as chamadas passarem a falhar com erro de autenticação (ver §16.6), gere um novo
token na instância e atualize `CAIDO_TOKEN` no `.env` (o loader lê apenas a presença; o valor nunca é
impresso).

**5. Access token × PAT.** Um **access token** de sessão é efêmero (expira/rotaciona); um **PAT** (personal
access token) é de longa duração, próprio para automação. Prefira **PAT** para o SYNAPSE; se só houver access
token, espere renovações mais frequentes (passo 4).

**6. Listar projetos / descobrir o UUID.** Use a query existente `caido.projects` via a CLI (não cria API
nova):

```bash
node tools/workspace/cli.mjs projects
#   <uuid-do-projeto>   Nome do Projeto
#   ...
```

Teste manual equivalente no Playground: `query { projects { id name } }`. Se `projects` for `@cloud` e não
estiver disponível localmente, a CLI degrada para o **projeto atual** (`currentProject`).

**7. Criar e selecionar engagement; associar projeto.** (fluxo mínimo do operador, §16.4)

```bash
export SA_ENGAGEMENT_ROOT=~/engagements          # base FORA do repo (persistente no .env)
node tools/workspace/cli.mjs init     --name acme --modality blackbox
node tools/workspace/cli.mjs scope    --name acme --file ./scope.md     # valida '# Scope' + '## In Scope'
node tools/workspace/cli.mjs associate--name acme --project-id <uuid> --project-name "ACME"
node tools/workspace/cli.mjs use      --name acme  # SELECIONA 'acme' como ativo DESTA sessão (sem editar .env)
node tools/workspace/cli.mjs select                # confere binding + mostra o fragmento de ctx
```

**8. Configurar `.env`.** Veja `.env.example` — persista apenas `CAIDO_BASE_URL`, `CAIDO_TOKEN` (instância)
e `SA_ENGAGEMENT_ROOT` (base). O engagement ativo é escolhido por sessão via `cli.mjs use` (§16.4.1);
`SA_ENGAGEMENT` é **seletor opcional** para automação fora de projeto e `CAIDO_PROJECT_ID` é compat opcional (prefira
`associate`).

**9. Primeiro Preflight + smoke.**

```bash
node tools/preflight/cli.mjs preflight --profile caido-native
# READY/DEGRADED/BLOCKED — 'caidoProject' deve estar ok (engagement → projeto)
node tools/workspace/cli.mjs projects              # smoke: a instância responde e o token vale
```

## 16.4 Fluxo mínimo do operador (§5)

1. **Criar** engagement — `cli.mjs init --name <n>`.
2. **Definir** `scope.md` — `cli.mjs scope --name <n> --file <scope.md>`.
3. **Associar** projeto Caido — `cli.mjs associate --name <n> --project-id <uuid>`.
4. **Selecionar** ativo (dinâmico, por sessão) — `cli.mjs use --name <n>` (confirme com `cli.mjs active`/`select`).
5. **Preflight** — `preflight.bat`/`cli.mjs preflight --profile caido-native`.
6. **Investigar** — o adaptador/operador abre a investigação com o Execution Context derivado do engagement
   ativo (scope.md + `caido.projectId` do manifesto). **Um engagement ativo por contexto de investigação.**
7. **Encerrar/trocar** — `cli.mjs use --name <outro>` troca o ativo e **invalida** o contexto operacional
   anterior para NOVAS operações. Ver §16.4.1 (troca e contexto do LLM).

### 16.4.1 Seleção dinâmica & troca (UX)

A escolha do engagement ativo é **dinâmica por sessão** — não exige editar o `.env`:

| Comando | Efeito |
|---------|--------|
| `cli.mjs list` | lista engagements (descoberta; permitida **sem** seleção); `*` marca o ativo |
| `cli.mjs use --name <n>` | define o ativo **desta sessão** (match **exato**; nunca adivinha o mais parecido) |
| `cli.mjs active` | mostra o ativo resolvido e a origem (`session`/`env`) |
| `cli.mjs clear` | limpa a seleção da sessão |

**Precedência de resolução:** `--name` **>** ponteiro de sessão (`use`, gravado em `<root>/.sa-state/`), com o qual `SA_ENGAGEMENT` tem de coincidir **>** `SA_ENGAGEMENT` sozinho (automação, só em diretório comum ou na raiz do harness) **>** **nenhum**. Ponteiro obsoleto ou ilegível mais a variável é conflito, sem queda para a variável. Na **ausência de seleção**,
descoberta/listagem funcionam, mas operações dependentes de engagement são **recusadas** com mensagem
acionável (nunca escolhe primeiro/último/parecido). `SA_SESSION_ID` (opcional) isola o ponteiro entre
sessões concorrentes no mesmo root.

**Troca e contexto do LLM (honesto):** `use` para outro engagement reporta `switched`/`requiresCleanContext`
e **invalida** o contexto operacional anterior para novas operações. Ele **NÃO apaga** o histórico já
carregado na sessão do LLM — para realmente descartar o contexto do engagement anterior, **inicie uma sessão
limpa** (ou reinicie o agente). A CLI **nunca** declara que limpou o que não limpou (mesma honestidade do
`revokeWhitebox`).

## 16.5 Isolamento: o que é garantido e onde

**Garantido pelo código (Bridge + módulo de workspace):** para todo acesso que **passa pelo Bridge**:

- **Associação projeto↔engagement**: ops de dados exigem que o projeto atual da instância seja igual ao
  `projectId` autorizado, senão `caido-project-mismatch` (sem fallback silencioso). Descoberta
  (`caido.health`/`caido.projects`) não expõe dados e não é gated.
- **Escopo (Rule 0)**: registros fora do escopo do engagement são retidos (`outOfScopeWithheld`).
- **Proveniência**: cada evidência carrega `engagementId` + `caidoProjectId`.
- **Persistência isolada**: estado de monitor/copilot/record vai para `<engagement>/.hackbot/` e as
  **evidências persistentes** para `<engagement>/evidence/`, confinados por `confineWithin`/
  `assertInsideEngagement` (resolve symlink; recusa `..`/absolutos → `path-escape`). **Sem** diretório global
  de evidências e **sem** fallback `/tmp`: o `browser.screenshot` (e qualquer escrita de evidência via Bridge)
  é roteado para `ctx.evidenceDir` (derivado do engagement ativo); sem engagement ativo → `evidence-no-engagement`.
- **Contexto inválido**: op sem investigação válida → `unknown-investigation`; sem config Caido →
  `caido-not-configured`; sem projeto associado → `caido-no-project`.

**Limitação de enforcement (honesta):** este isolamento vale para o que **flui pelo Bridge/módulo**. As
**ferramentas genéricas do Claude Code** (ex.: `bash cat`, leitura direta de arquivos) **podem** acessar
arquivos de outro engagement fora desse caminho. **Não há isolamento universal** — é a **mesma** limitação
de camada-de-ferramentas documentada para Whitebox (cap. 8). Isolamento efetivo no nível das ferramentas
exige um wrapper de enforcement por runtime (ex.: hook PreToolUse), fora do escopo deste ajuste.

## 16.5.1 Evidências por engagement (sem diretório global)

Toda **evidência persistente de auditoria** (screenshots, capturas sanitizadas, records) é armazenada no
engagement **ativo**, em **`<engagement>/evidence/`** — resolvido automaticamente da seleção, **sem
configuração manual de diretório por pentest**. Criado **sob demanda** na primeira escrita (sem diretórios
vazios ansiosos).

- **Contrato:** `selectEngagement()` devolve `evidenceDir`; o operador/adaptador o coloca no Execution
  Context (`ctx.evidenceDir`). No Bridge, `browser.screenshot` (e qualquer escrita de evidência) é
  **confinado** a esse diretório via `confineWithin` (symlink-safe). `cli.mjs select` imprime o `evidence dir`.
- **Sem engagement ativo → falha explícita:** ops que **persistem** evidência retornam
  `evidence-no-engagement`; tentativa de escapar do diretório → `evidence-path-escape`. **Consultas
  read-only e o Doctor continuam funcionando** (não persistem evidência).
- **Sem `/tmp` para evidência persistente:** `/tmp`/OS-temp serve apenas para **arquivos temporários de
  trabalho**, que **não** são evidência de auditoria.
- **Compat legada (delimitada):** `SA_EVIDENCE_DIR` está **deprecado** como padrão operacional; é honrado
  **apenas** quando **não há** engagement ativo e **nunca** sobrepõe o diretório do engagement ativo (sem
  troca silenciosa). No Preflight aparece como `degraded` com ação para selecionar um engagement.
- **Troca/concorrência:** cada engagement tem seu próprio `evidence/`; a troca (§16.4.1) muda o destino;
  `SA_SESSION_ID` isola seleção/estado entre sessões concorrentes no mesmo root.
- **Preflight (§8):** verifica existência/resolução/escrita do `evidence/` do engagement ativo **sem criar
  arquivos sensíveis** (probe efêmero no diretório do engagement, removido em seguida; o `evidence/` em si só
  é criado na primeira escrita real). `caido-native`/`full-engagement` exigem-no; `core-lab` o trata como
  opcional (sem engagement → `DEGRADED`, nunca dump silencioso).

## 16.6 Diagnóstico de falhas (auth/projeto)

| Sintoma | Código | Ação |
|---------|--------|------|
| Autenticação falha / 401 | `caido-graphql-error` / transporte | Renove `CAIDO_TOKEN` (§16.3 passo 4); confira `baseUrl`/porta |
| Projeto não confere | `caido-project-mismatch` | Selecione no Caido o projeto associado ao engagement, ou reassocie (`associate --force`) |
| Sem projeto associado | `caido-no-project` / `caidoProject missing` | `cli.mjs associate --name <n> --project-id <uuid>` |
| Sem config Caido | `caido-not-configured` | Defina `CAIDO_BASE_URL`/`CAIDO_TOKEN` no `.env` |
| `projects` indisponível | `available:false` | Instância local sem `@cloud`; use `currentProject` / associe pelo UUID visível no Caido |
| Evidência sem engagement | `evidence-no-engagement` | Selecione um engagement (`cli.mjs use --name <n>`) antes de operações que persistem evidência |
| Evidência fora do dir | `evidence-path-escape` | O `dir` pedido escapa de `<engagement>/evidence`; use um caminho interno |

## 16.7 Windows

- `.bat` em escopo de usuário (sem admin/Docker/WSL): `preflight.bat`, `doctor.bat`, `bootstrap.bat`
  (cap. 15). A CLI de workspace roda com `node tools\workspace\cli.mjs <cmd>`.
- Variáveis persistentes via `setx`: `setx SA_ENGAGEMENT_ROOT "%USERPROFILE%\engagements"`,
  `setx CAIDO_BASE_URL "http://127.0.0.1:8080"`, `setx CAIDO_TOKEN "<token>"`. O engagement ativo é
  escolhido por sessão: `node tools\workspace\cli.mjs use --name <n>` (não precisa de `setx SA_ENGAGEMENT`;
  use `setx SA_ENGAGEMENT` apenas para automação fora de projeto ativado).
- Caminhos usam `\`; o confinamento (`assertInsideEngagement`) e o `.env` nativo funcionam em ambos os SOs.

## 16.8 Testes

- `node tools/workspace/test-multi-engagement.mjs` → **31/31**: dois engagements com projetos distintos ·
  troca · projeto ausente/incompatível · leitura cruzada recusada · replay de outro projeto recusado ·
  persistência isolada/confinada · path traversal + **symlink** · sem carry-over de estado anterior ·
  config global×específica · compat com workspace legado · **seleção dinâmica** (explícita, ausência,
  nome inexistente/ambíguo sem fuzzy, troca+contexto, conflito de `SA_ENGAGEMENT`, ponteiro obsoleto sem
  fallback, isolamento preservado, listagem sem seleção) · **evidências por engagement** (dirs distintos,
  seleção dirige o dir, escrita cruzada/symlink recusada, persistência após reinício, gate no Bridge sem
  engagement = `evidence-no-engagement`, confinamento = `evidence-path-escape`).
- `node tools/preflight/test-preflight.mjs` → **28/28** (inclui multi-engagement/compat + evidência).
- Regressões: engagement 16/16, env-loader 15/15, Web Runtime completo (bridge/caido/active/investigation/
  copilot/monitor/workflow), **Validador 127/127**. KB/`agents`/`policies` inalterados.
