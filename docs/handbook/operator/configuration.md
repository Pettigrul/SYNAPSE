# Guia de configuração

> `.env` (config persistente), precedência, diretórios e persistência por engagement. Fonte: `.env.example`,
> `tools/preflight/env-loader.mjs`, `tools/workspace/engagement.mjs`. Técnico: [cap. 15](../15-windows-bootstrap-preflight.md), [cap. 16](../16-multi-engagement-and-caido-onboarding.md).

## `.env` — chaves reais

Copie `.env.example` → `.env` (gitignored). O loader usa o parser **nativo** do Node 22 (sem dotenv) nos
pontos de entrada Doctor/Preflight/CLI. **Valores nunca são impressos** (só nomes de variáveis).

| Chave | Escopo | Papel |
|-------|--------|-------|
| `CAIDO_BASE_URL` | instância | URL da instância Caido (GraphQL em `<baseUrl>/graphql`) |
| `CAIDO_TOKEN` | instância | PAT (`caido_…`) ou access token; header `Authorization: Bearer <token>` |
| `SA_ENGAGEMENT_ROOT` | instância | diretório-base de **todos** os engagements — **fora** do repo |
| `SA_ENGAGEMENT` | opcional | **override** explícito do engagente ativo (automação); normalmente **vazio** |
| `SA_SESSION_ID` | opcional | isola o ponteiro de engagement ativo entre sessões concorrentes |
| `CAIDO_PROJECT_ID` | compat opcional | **só** single-engagement, só quando o engagement ativo **não** tem projeto; **nunca** sobrepõe o binding |
| `SA_SKIP_ENV_FILE` | opcional | `1` = CLIs **não** carregam o `.env` (automação hermética); não usar em operação normal |
| `SA_EVIDENCE_DIR` | **deprecado** | legado só sem engagement ativo; **nunca** sobrepõe `<engagement>/evidence` |

## Precedência de configuração

1. **Variáveis já no ambiente vencem** o `.env` (o `.env` nunca as sobrepõe).
2. **Engagement ativo:** `SA_ENGAGEMENT` (override) > ponteiro de sessão (`use`) > **nenhum** (nunca adivinha).
3. **Projeto Caido:** manifesto do engagement (`.engagement.json`) > `CAIDO_PROJECT_ID` (compat, só se o
   engagement não tem binding) > **nenhum** → ops dependentes de projeto **bloqueadas** (sem fallback silencioso).
4. **Evidências:** `<engagement>/evidence` (resolvido do ativo) — **sem** dir global, **sem** `/tmp`.

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

Ponteiro de seleção por sessão: `SA_ENGAGEMENT_ROOT/.sa-state/active[-<SA_SESSION_ID>].json` (sem segredos).

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
