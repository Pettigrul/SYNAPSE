# Guia de configuração

> `.env` (config persistente, com menor privilégio por contexto), precedência, diretórios e persistência por engagement. Fonte: `.env.example`,
> `tools/preflight/env-loader.mjs`, `tools/workspace/engagement.mjs`. Técnico: [cap. 15](../15-windows-bootstrap-preflight.md), [cap. 16](../16-multi-engagement-and-caido-onboarding.md).

## `.env` — chaves reais

Copie `.env.example` → `.env` (gitignored). O loader usa o parser **nativo** do Node 22 (sem dotenv) nos
pontos de entrada Doctor/Preflight/CLI, a partir da raiz do harness. O arquivo é central, então **segredos e seletores não
chegam a todo projeto**. **Valores nunca são impressos** (só nomes de variáveis).

A política é uma lista de permissão: qualquer chave fora dela fica retida, então um segredo com nome inesperado falha fechado.

| Quem | Config comum (`CAIDO_BASE_URL`, `SA_ENGAGEMENT_ROOT`, `SA_BROWSER_CHANNEL`, `SA_STRIDE_ENABLED`, `PI_AGENT_HOME`, `PI_CODING_AGENT_DIR`, `ANTIGRAVITY_HOME`) | Ligadas a um contexto (`SA_ENGAGEMENT`, `SA_SESSION_ID`, `CAIDO_PROJECT_ID`, `SA_EVIDENCE_DIR`, `SECAUDIT_BRIDGE_CONTEXTS`, `SECAUDIT_ENGAGEMENT_DIR`, `GITHUB_MCP`, `CONFLUENCE_MCP`) | `CAIDO_TOKEN` | Qualquer outra chave |
|---|---|---|---|---|
| Raiz do harness | carrega | carrega | só em `projects` e preflight | nunca |
| Projeto com `activate --caido` | carrega | não | só em `projects` e preflight | nunca |
| Projeto sem opt-in | carrega | não | não | nunca |
| Fora disso, incluindo subdiretórios do harness | carrega | não | não | nunca |

Variáveis exportadas valem em todos os casos. `doctor` e `preflight` listam os nomes retidos. O opt-in fica no marcador e
sobrevive à reativação; `--no-caido` revoga. Ele só vale se o marcador apontar, por caminho absoluto, para este harness e todos os links estiverem íntegros. Um marcador
copiado de outro lugar não concede nada, **mas um repositório preparado por quem conhece o caminho do harness pode forjar um**,
porque o marcador fica no projeto. O token só iria à `CAIDO_BASE_URL` configurada, em `projects` e no preflight.

`SECAUDIT_BRIDGE_CONTEXTS` só no `.env` vale na raiz do harness; em projeto, `adapters/cli.mjs` recusa `http.*`
(`contexts-file-withheld`) em vez de aceitar um escopo do chamador. Exporte a variável no comando.

> **Isso reduz exposição acidental; não é fronteira de segurança.** Um agente com shell pode ler o `.env` diretamente. Para
> separar de fato, isole o agente no sistema operacional, sem acesso ao arquivo ([fronteiras](pi-agent.md#fronteiras-o-que-cada-camada-controla)).

| Chave | Escopo | Papel |
|-------|--------|-------|
| `CAIDO_BASE_URL` | instância | URL da instância Caido (GraphQL em `<baseUrl>/graphql`) |
| `CAIDO_TOKEN` | instância, com opt-in por projeto | PAT (`caido_…`) ou access token; header `Authorization: Bearer <token>` |
| `SA_ENGAGEMENT_ROOT` | instância | diretório-base de **todos** os engagements — **fora** do repo; dentro do harness só `engagements/` é aceito (senão, `root-inside-harness`) |
| `SA_ENGAGEMENT` | opcional | **override** explícito do engagement ativo (automação); normalmente **vazio**. Pelo `.env`, só vale na raiz do harness; em projeto, exporte |
| `SA_SESSION_ID` | opcional | isola o ponteiro entre sessões concorrentes. Sem ele, projeto ativado e raiz do harness usam sessão estável derivada do caminho; explícito, em projeto, vira `<id>--prj-<hash>`, sem atravessar projetos. Fora disso é a única forma de ter seleção. Pelo `.env`, só vale na raiz do harness |
| `CAIDO_PROJECT_ID` | compat opcional | **só** single-engagement, só quando o engagement ativo **não** tem projeto; **nunca** sobrepõe o binding. Pelo `.env`, só vale na raiz do harness |
| `SA_SKIP_ENV_FILE` | opcional | `1` = CLIs **não** carregam o `.env` (automação hermética); não usar em operação normal |
| `SECAUDIT_BRIDGE_CONTEXTS` | opcional | caminho do JSON de Execution Context escrito pelo operador, para as ferramentas do Bridge no Pi; pode ficar fora do `.env` |
| `SA_EVIDENCE_DIR` | **deprecado** | legado só sem engagement ativo; **nunca** sobrepõe `<engagement>/evidence` |

## Precedência de configuração

1. **Variáveis já no ambiente vencem** o `.env` (o `.env` nunca as sobrepõe).
2. **Engagement ativo:** `--name` no comando > `SA_ENGAGEMENT` (override) > ponteiro da sessão (`use`) > **nenhum** (nunca
   adivinha). Sessão: `SA_SESSION_ID`, presa ao projeto se houver um > marcador do projeto ativado > raiz do harness >
   **nenhuma**, e então `use` e `clear` recusam sem gravar. A busca do marcador para em um `.git`: repositório aninhado não
   herda a seleção do projeto pai. Não existe ponteiro padrão compartilhado: um `active.json` antigo
   é ignorado e fica onde está. Marcador ilegível falha fechado, sem subir para o projeto pai.
3. **Projeto Caido:** manifesto do engagement (`.engagement.json`) > `CAIDO_PROJECT_ID` (compat, só se o
   engagement não tem binding) > **nenhum** → ops dependentes de projeto **bloqueadas** (sem fallback silencioso).
4. **Evidências:** `<engagement>/evidence` (resolvido do ativo) — **sem** dir global, **sem** `/tmp`.

> Credenciais de **modelo** ficam com o runtime (Pi/`agy`), não aqui.
>
> A mera presença do `.env` **não autoriza** operação alguma — autorização fica no Execution Context + policies.

## Diretórios e persistência (por engagement)

Sob `SA_ENGAGEMENT_ROOT/<engagement>/` (criado por `cli.mjs init`; **sem** novas convenções nesta rodada):

| Caminho | Conteúdo |
|---------|----------|
| `.engagement.json` | manifesto (schema, modalidade, `caido.projectId`) |
| `scope.md` | escopo (exige `# Scope` + `## In Scope`) |
| `evidence/` | **evidência de auditoria** persistente (capturas, screenshots, records); criado na 1ª escrita |
| `.hackbot/` | estado de runtime: `monitor-state.json`, `copilot-state.json`, `investigation-record.json`, `mode[-<sid>].json` |
| `1-Reports/ … 9-Trashcan/` | buckets do workspace: `1-Reports 2-Findings 3-Recon 4-Analysis 5-Scripts 6-Lists 7-Random 8-Archive 9-Trashcan` |
| `.whitebox-access.log` | log de autorização Whitebox (quando aplicável) |

Ponteiro de seleção por sessão: `SA_ENGAGEMENT_ROOT/.sa-state/active-<sessão>.json` (sem segredos), onde `<sessão>` é
`prj-<hash>`, `<SA_SESSION_ID>--prj-<hash>` ou, fora de projeto, `<SA_SESSION_ID>`. `list` e `--name` continuam vendo todos os
engagements do root: para separar clientes de fato, use um `SA_ENGAGEMENT_ROOT` por cliente. Fora de um projeto, o `SA_SESSION_ID` fica preso ao repositório Git em volta ou ao harness, em um subdiretório dele
(`<id>--repo-<hash>`); em diretório comum e na raiz do harness vale o mesmo id, e um `SA_ENGAGEMENT` exportado vale em qualquer lugar: os dois são atos explícitos
do operador, então não os deixe exportados ao trocar de cliente.

## Backup e recuperação

- **O que preservar:** a árvore `SA_ENGAGEMENT_ROOT/<engagement>/` inteira (manifesto, `scope.md`,
  `evidence/`, `.hackbot/`, buckets). É autocontida e independente do harness.
- **`.env`:** contém segredos (PAT) — **não** versionar; faça backup seguro à parte.
- **Recuperação:** reinstale o harness central e aponte `SA_ENGAGEMENT_ROOT` para o diretório preservado;
  `cli.mjs list` reencontra os engagements. A ativação local (P2) é recriável com `activate` (não guarda dados).

## Configurações legadas

- `CAIDO_PROJECT_ID` e `SA_EVIDENCE_DIR` são **compat/deprecados** — honrados só nas condições acima, nunca
  sobrepondo o engagement ativo. Prefira `cli.mjs associate` e `<engagement>/evidence`.

## Isolamento e limitação honesta

Cada engagement é isolado (workspace/projeto/evidências/estado próprios); o Bridge recusa acesso cross-project.
**Porém:** ferramentas genéricas do runtime (`bash cat`, `Read`) **não** são confinadas por isso — o
confinamento vale para o que passa pelo Bridge/módulos. Ver [cap. 16 §16.5](../16-multi-engagement-and-caido-onboarding.md) / [cap. 18 §18.9](../18-project-scoped-activation.md).
