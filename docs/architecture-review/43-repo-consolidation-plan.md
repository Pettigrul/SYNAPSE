# 43 — Consolidação, Higienização e Prontidão para GitHub (diagnóstico + plano)

> **Rodada apenas de diagnóstico e planejamento.** Nada foi movido, removido, commitado ou publicado. Nenhum
> segredo impresso. Execução aguarda a próxima instrução. Data: 2026-11-06.

## Achado nº1 (muda tudo): NÃO existe repositório Git

`/home/pettigrul/projetos/SecurityAuditor/.git` **existe mas está VAZIO** (0 bytes, sem `HEAD`/objects;
`git rev-parse` falha com "not a git repository"). Portanto:
- **Não há histórico, branch, remoto nem arquivos rastreados.** "Preservar histórico Git" é **irrelevante**.
- **Nenhum segredo foi commitado** (não há histórico) → **slate limpo**; não há reescrita de histórico nem
  rotação de credenciais a fazer. Único cuidado: **não** inicializar o repo de forma a capturar segredos.
- A consolidação vira um simples `git init` na raiz escolhida — sem migração de histórico.

## 1. Diagnóstico Git

| Item | Estado |
|---|---|
| Raiz real do repo | **nenhuma** (`.git` vazio em `~/projetos/SecurityAuditor/`) |
| Branch / remotos / upstream | inexistentes |
| Working tree / tracked / ignored | inexistentes (nada rastreado) |
| Submódulos / worktrees | nenhum |
| `.git` aninhados | só o vazio externo; **nenhum** dentro do produto |
| Segredos no histórico | **N/A** (sem histórico) |

## 2. Estrutura atual

```
~/projetos/SecurityAuditor/              (raiz EXTERNA — wrapper)
├── .git/        (VAZIO — não é repo)         DELETE CANDIDATE
├── .agents/     (VAZIO)                       DELETE CANDIDATE
├── .aws/        (VAZIO)                       DELETE CANDIDATE
├── .codex/      (VAZIO)                       DELETE CANDIDATE
├── __MACOSX/    (284K, resource forks ._*)    DELETE CANDIDATE
└── SecurityAuditor/   (17M — PRODUTO REAL)    → raiz recomendada
```

A raiz externa **não contribui com nada versionável**: um `.git` vazio, três dot-dirs vazios e resíduo de
descompactação macOS. O produto (adapters, agents, .claude, .codex, docs, engagements, policies, references,
reports, skills, tools, workflows, SKILL.md, README.md, .gitignore, exemplos de config) está **inteiro e
autocontido na interna**. O validador e os scripts já usam a **interna** como `root`
(`baseline/manifest.json.root = …/SecurityAuditor/SecurityAuditor`).

## 3. Comparação de layouts

| Opção | Descrição | Prós | Contras | Veredito |
|---|---|---|---|---|
| **A** manter como está | repo na externa, produto na interna | nenhum esforço | wrapper inútil, `__MACOSX` e dot-dirs vazios versionados, confusão de raiz dupla | ❌ |
| **B** interna vira raiz única | `git init` em `…/SecurityAuditor/SecurityAuditor` | **mais simples**; produto já autocontido; validador/tools/.claude já assumem essa raiz; zero ajuste de caminho relativo; descarta lixo naturalmente | caminho de clone muda (irrelevante — sem histórico) | ✅ **RECOMENDADA** |
| **C** consolidar na externa preservando histórico | mover conteúdo p/ externa | — | **não há histórico a preservar**; exigiria mover tudo e ainda limpar wrapper | ❌ |

**Recomendação: Opção B.** Como não há histórico, "preservar `.git`" não se aplica; a interna já é a raiz de
fato de todo o harness (Claude Code lê `.claude/` aqui; o validador usa esta raiz; caminhos relativos de docs,
testes e flows já resolvem a partir daqui). Portabilidade e compatibilidade (Pi/Codex/Claude) ficam idênticas,
pois nada depende do wrapper externo.

## 4. Estrutura final recomendada

```
SecurityAuditor/            ← git init AQUI (antigo diretório interno)
├── .claude/{skills,hooks,settings.json}   KEEP (descoberta das skills)
├── .codex/{hooks,hooks.json}              KEEP (adapter Codex)
├── adapters/ agents/ policies/ references/ skills/ tools/ workflows/   KEEP (produto)
├── docs/                                   KEEP (handbook + architecture-review 00–43)
├── reports/ (templates/libraries de report) KEEP (produto, ≠ engagements/*/1-Reports)
├── SKILL.md README.md manifest-h0.json     KEEP
├── .env.example .config.example            KEEP (templates)
├── .gitignore                              KEEP (+ ajustes §7)
├── h0-staging/                             ARCHIVE (baseline histórico H0)
├── intake/                                 REVIEW (workflow raiju; dados de trabalho)
├── engagements/  .env  (.config)           IGNORE (dados/segredos — nunca versionar)
└── tools/web-runtime/node_modules/ (14M)   IGNORE (reproduzível via npm install)
```

## 5. Inventário KEEP / ARCHIVE / IGNORE / DELETE CANDIDATE / REVIEW

### KEEP (essencial, versionável)
`SKILL.md`, `README.md`, `manifest-h0.json`, `.gitignore`, `.env.example`, `.config.example`; diretórios
`adapters/ agents/ policies/ references/ skills/ tools/ workflows/ docs/ reports/`; `.claude/skills/` (13 skills —
**diretórios reais com `SKILL.md`, não symlinks** → portáveis), `.claude/hooks/`, `.claude/settings.json`
(REVIEW rápido por config de máquina, mas sem segredos conhecidos), `.codex/hooks*`.
*Confiança: alta.* Referências: validador (`docs/architecture-review/validate_h0.mjs` + `baseline/`), skills via
`.claude/skills`, testes em `tools/**/test-*.mjs`. Impacto de remoção: quebra do produto.

### ARCHIVE (histórico, preservar fora do caminho operacional)
- `h0-staging/` (40 arquivos; snapshot do baseline H0) — referenciado apenas por docs históricos
  `13/14/15-*.md`; **não** usado pelo validador atual (que usa a árvore real). Valor de rastreabilidade.
  *Sugestão:* mover para `docs/architecture-review/archive/h0-staging/` ou manter versionado como histórico.
  *Confiança: média.* Impacto de remoção: perde rastreabilidade do H0; **nenhum** impacto operacional.
- `docs/architecture-review/` (48 entradas, relatórios 00–43) — **KEEP** como rastreabilidade de arquitetura
  (a tarefa pede explicitamente não descartar sem avaliar; têm valor e são leves).

### IGNORE (necessário localmente, não versionável)
- `engagements/` (dados reais: ENG-A, ENG-B — findings/evidence/estado/`.config`/
  `.whitebox-access.log`/binding Caido; `.sa-state/active.json`) — **já ignorado**.
- `.env` (CAIDO_BASE_URL, CAIDO_TOKEN, SA_ENGAGEMENT_ROOT) — **já ignorado** (mode `-rw-------`).
- `engagements/*/.config` — **já ignorado**.
- `tools/web-runtime/node_modules/` (14M) — **NÃO ignorado hoje → adicionar** (§7). Reprodutível via
  `npm install` (há `package.json`+`package-lock.json`).
- `.vscode/` exceto `settings.json` — já tratado.

### DELETE CANDIDATE (comprovadamente descartável — da RAIZ EXTERNA, não do produto)
- `~/projetos/SecurityAuditor/__MACOSX/` (resource forks `._*`) — lixo de zip macOS. *Confiança: alta.*
- `~/projetos/SecurityAuditor/.git` (vazio), `.agents/ .aws/ .codex/` (vazios) — placeholders inúteis.
  *Confiança: alta.* Impacto: nenhum (Opção B abandona o wrapper externo inteiro).

### REVIEW (função/dependência incerta)
- `intake/` (`links.md processed.md tags.md files/`; `scratch.md` já ignorado) — dir de workflow bug-bounty
  (raiju). Pode conter dados de trabalho pessoais. *Decidir:* versionar só os templates/estrutura
  (`.gitkeep` + headers) e ignorar o conteúdo acumulado, ou manter fora do produto. *Confiança: média.*
- `.claude/settings.json` — revisar por allowlists/caminhos específicos da máquina (provável KEEP).
- `engagements/ENG-A` — engagement aparentemente vazio/abandonado; é dado de engagement → IGNORE de
  qualquer forma; só avaliar se deve existir.

## 6. Riscos de versionamento sensível

| Caminho | Categoria | Risco | Mitigação |
|---|---|---|---|
| `.env` | Caido PAT + URLs | **ALTO** se versionado | já em `.gitignore` (`.env`,`*.env`); manter `.env.example` |
| `engagements/**` | findings/evidência/alvo/`.config`/log whitebox/binding | **ALTO** | já ignorado (`engagements/`) |
| `engagements/*/.config` | identidade/proxy | ALTO | já ignorado (`.config` + `engagements/`) |
| `.aws/` (externo) | credenciais AWS | ALTO se preenchido | vazio hoje; ignorar `.aws/` + abandonar wrapper |
| `.whitebox-access.log` | acessos | MÉDIO | sob `engagements/` (ignorado) |
| histórico Git | — | **NENHUM** | não há histórico (slate limpo) |

**Importante:** como não há repo, **nenhum segredo está no histórico**. Basta inicializar o repo **com o
`.gitignore` já ajustado em vigor** e conferir `git status`/`git check-ignore` **antes** do primeiro `add`.

## 7. Ajustes propostos ao `.gitignore`

O `.gitignore` atual já cobre `.config`, `.env*`, `engagements/`, `evidence/`, OS/editor, forged tools. **Adicionar**:

```gitignore
# Dependências instaladas (reproduzíveis via npm install)
node_modules/

# Credenciais/estado locais (defensivo)
.aws/
.agents/

# Resíduos de empacotamento / arquivos comprimidos
__MACOSX/
*.zip
*.tar
*.tar.gz
*.tgz

# Estado de sessão do workspace (além de engagements/)
**/.sa-state/
**/.hackbot/

# Intake acumulado (manter estrutura, ignorar conteúdo de trabalho) — ver §REVIEW
intake/files/
intake/processed.md
```

**Não ignorar** (necessários à reprodução do harness): `.claude/skills/`, `.claude/hooks/`,
`.claude/settings.json`, `.codex/`, `agents/`, `policies/`, `references/`, `flows-*.md`, `workflows/`, `skills/`,
`tools/` (exceto `node_modules/`), `SKILL.md`, `docs/`, `reports/` (templates), `manifest-h0.json`,
`*.example`.

### Placeholders sugeridos (dirs ignorados que o produto espera existir)
- `engagements/.gitkeep` (a raiz de engagements precisa existir; conteúdo ignorado).
- `tools/web-runtime/` já tem conteúdo versionado (só `node_modules/` ignorado) — sem placeholder.
- Se `intake/` for versionado como estrutura: `intake/.gitkeep` + manter `links.md`/`tags.md` como templates.

## 8. Dependências de caminho (verificar antes de clone em outra máquina)

- **`.env: SA_ENGAGEMENT_ROOT`** é **absoluto** (`…/SecurityAuditor/SecurityAuditor/engagements`) → quebra em
  outra máquina/clone. Mitigar: no `.env.example`, orientar caminho **relativo** ou derivar do repo; o produto já
  tem override por `SA_ENGAGEMENT_ROOT` e ponteiro de sessão. *(Não é defeito; é config local.)*
- **`baseline/manifest.json.root`** é absoluto (informativo) — o validador recebe `root` por argumento
  (`validate_h0.mjs . …`), então funciona por caminho relativo; **confirmar** que nenhum teste lê esse `root`
  absoluto. *REVIEW.*
- **`.claude/skills/`** são diretórios reais (não symlinks) → **portáveis** (Linux/Windows). A `tools/activation/`
  (`activate.mjs`/`cli.mjs`) existe para (re)gerar ativação em outros layouts/runtimes se necessário.
- Caminhos relativos de docs/flows/testes resolvem a partir da raiz interna → **sem ajuste** na Opção B.

## 9. Portabilidade (para SETUP.md futuro — não criar nesta rodada)

- **Pré-requisitos:** Node ≥ 22 (usa `node:test`/`fetch`/parser `.env` nativos); git. Caido desktop (opcional,
  para integração real); Playwright-core (browser opcional, auto-detect).
- **Variáveis de ambiente:** `CAIDO_BASE_URL`, `CAIDO_TOKEN`, `SA_ENGAGEMENT_ROOT` (via `.env`, a partir de
  `.env.example`). `SA_SESSION_ID`, `SA_SKIP_ENV_FILE=1` (testes hermetizados).
- **Config local:** `.config` por engagement (a partir de `.config.example`). Nunca versionar.
- **Inicialização:** `cd tools/web-runtime && npm install`; ativar skills (Claude Code descobre `.claude/skills/`
  no **início da sessão** — após clone, abrir sessão nova); `node tools/preflight/cli.mjs doctor` para conferir.
- **Dependências externas / integrações opcionais:** Caido (read-only + ativo sob aprovação), browser Playwright.
- **Linux/Windows:** `.claude/skills/` são dirs reais (ok no Windows); **evitar symlinks** no repo; o confinamento
  do Workspace é symlink-safe mas o repo em si não depende de symlinks.

## 10. Plano seguro de consolidação (EXECUÇÃO FUTURA — não rodar agora)

1. **Checkpoint:** copiar a árvore inteira para backup fora do repo (`cp -a`), **incluindo** `.env` e
   `engagements/` (que não irão ao Git) — p/ rollback.
2. **Working tree:** confirmar nada em andamento (não há repo; só backup).
3. **Proteger sensíveis:** aplicar o `.gitignore` ajustado (§7) **antes** de qualquer `git init`/`add`.
4. **Consolidar raiz (Opção B):** `git init` em `…/SecurityAuditor/SecurityAuditor`. **Não** mexer no wrapper
   externo ainda (abandoná-lo depois que o repo interno estiver validado).
5. **Preservar engagements:** garantir que `engagements/`, `.env`, `.config` continuam no disco e **ignorados**
   (`git check-ignore -v` em cada um).
6. **Ajustar caminhos:** tornar `SA_ENGAGEMENT_ROOT` relativo no `.env` local; revisar `baseline/manifest.json`.
7. **Limpeza segura:** remover **apenas** a raiz externa (`__MACOSX/`, `.agents .aws .codex .git` vazios) — fora
   do repo novo. `h0-staging/` → ARCHIVE (mover para `docs/architecture-review/archive/`), não deletar.
8. **`.gitignore`:** aplicar §7 + placeholders.
9. **Regressões:** rodar todas as suítes + Validador (deve seguir **127/127**).
10. **Diff:** `git add -A --dry-run` + `git status` + `git check-ignore` — conferir que **nenhum** segredo/
    engagement/`node_modules` entra.
11. **Clone limpo:** `git clone` para dir temporário; `npm install`; `doctor`; rodar testes → valida portabilidade.
12. **Preparar commit:** mensagem inicial; **revisar `git ls-files`** uma última vez por sensíveis.
13. **Push privado:** só após 10–12 OK; remoto **privado**; confirmar que o push não inclui ignorados.

### Pontos de rollback
- Antes de tudo: **backup `cp -a`** (passo 1) — restaura qualquer estado.
- O `git init` é reversível (`rm -rf .git` recria o estado pré-repo; dados intactos).
- Nenhuma remoção de dados do produto no plano; só a raiz externa (lixo) e `node_modules` (reinstalável).

## Critérios de aceitação

1. `git status` limpo e **sem** `.env`, `engagements/`, `*.config`, `node_modules/`, `__MACOSX/` rastreados
   (`git check-ignore -v` confirma cada um).
2. `git ls-files | grep -E '\.env$|engagements/|\.config$|node_modules/'` → **vazio**.
3. Suítes + **Validador 127/127** verdes na nova raiz.
4. **Clone limpo** em outra pasta: `npm install` + `doctor` OK; skills descobertas em sessão nova.
5. Nenhum segredo em `git log -p` (trivial: histórico começa limpo).
6. Dispatcher, skills e seleção de engagements intactos (nenhuma edição de produto nesta consolidação).

## Comandos de verificação e rollback (para a execução)

```bash
# Verificação (pós-ajuste, pré-commit) — tudo read-only exceto git init/add
git -C <raiz> status
git -C <raiz> check-ignore -v .env engagements tools/web-runtime/node_modules
git -C <raiz> add -A --dry-run | grep -iE '\.env|engagements/|\.config|node_modules' # deve ser vazio
# Regressões
for s in tools/**/test-*.mjs; do node "$s"; done   # + validate_h0.mjs
# Rollback (se necessário, antes do push)
rm -rf <raiz>/.git          # desfaz o repo; dados intactos
cp -a <backup>/. <raiz>/     # restaura do checkpoint
```

---

**Resumo executivo:** não há repositório — slate limpo, sem segredos em histórico. Recomenda-se **Opção B**
(interna = raiz única), abandonando o wrapper externo (lixo). Ajustar `.gitignore` (principalmente
**`node_modules/`**), tratar `h0-staging` como ARCHIVE e `intake/` em REVIEW, e seguir o plano de 13 passos com
backup e verificação `check-ignore` antes de qualquer commit. **Nada foi alterado nesta rodada;** aguardando
instrução para executar.
