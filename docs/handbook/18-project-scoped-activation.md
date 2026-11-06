# 18 — Ativação Local por Projeto (P2)

> Permite abrir um projeto/engagement externo e usar o SYNAPSE ali, **referenciando uma única implementação
> central** por **symlinks** — sem instalação global, sem duplicar os 127 corpos da KB, sem segundo
> dispatcher e sem framework de plugins. Par do cap. 16 (multi-engagement) e cap. 17 (skills). ✅🧪
> `test-activation.mjs` **18/18**; contrato de skills `test-skills.mjs` **54/54**.

## 18.1 Instalação central do harness

O harness é **instalado uma vez** (clone do repositório central). Ele contém `SKILL.md` (dispatcher),
`references/`, `skills/` (KB), `policies/`, `agents/`, `tools/`, `.claude/`. **Não** se instala nada em
`~/.claude`, `~/.pi`, `~/.gemini` ou equivalentes.

```bash
git clone <repo> ~/harness/SYNAPSE     # instalação central única
```

Executar **direto da raiz central** continua suportado (sem ativação) — a ativação é só para operar de
**dentro** de um projeto externo.

## 18.2 Layouts suportados

| Layout | Harness | Engagements | Ativação |
|--------|---------|-------------|----------|
| **A — interno** | repo central | dentro do repo (`engagements/`, git-ignored) | não precisa; rode da raiz |
| **B — externo** | repo central | em `SA_ENGAGEMENT_ROOT` externo | não precisa; rode da raiz com `SA_ENGAGEMENT_ROOT` |
| **C — ativação local** | repo central | projeto externo explicitamente ativado | `activate` linka o harness no projeto |

**Sem migração automática** e **sem** modificar o diretório-base do operador sem autorização (a ativação só
escreve dentro do `--project` informado).

## 18.3 Mecanismo mínimo (symlinks + marcador)

`tools/activation/activate.mjs` cria **symlinks absolutos** do projeto para o harness central e um marcador
`.hackbot-activation.json` que rastreia exatamente o que foi criado. Recursos linkados:

```
tools/  references/  workflows/  skills/(KB)  policies/  agents/  reports/  SKILL.md
.claude/skills  .claude/hooks  .claude/settings.json
```

- **Zero duplicação:** a KB e o dispatcher são **linkados**, nunca copiados.
- **Conflitos:** se já houver conteúdo real do operador num alvo, a ativação **recusa**; com `--force` faz
  backup (`*.hackbot-bak`) **restaurado** no `deactivate`.
- **Idempotente:** reativar reaponta links e atualiza o marcador, sem erro.

## 18.4 Comandos de ativação / desativação

```bash
# ativar (default --project = diretório atual; --home = raiz central detectada automaticamente)
node tools/activation/cli.mjs activate   --project "/caminho/projeto" [--runtime claude-code|pi|antigravity|all] [--mcp] [--force]
node tools/activation/cli.mjs status     --project "/caminho/projeto"
node tools/activation/cli.mjs deactivate --project "/caminho/projeto"
```

Skills finas equivalentes: **`/ativar-projeto`** e **`/desativar-projeto`** (cap. 17). **Ativar ≠ selecionar
engagement ≠ autorizar alvo** — ativação é pura manipulação de arquivos.

## 18.5 Fluxo operacional (Linux/Omarchy e Windows)

**Linux / Omarchy:**
```bash
cd ~/harness/SYNAPSE
node tools/workspace/cli.mjs init --name acme            # cria engagement (externo via SA_ENGAGEMENT_ROOT)
node tools/activation/cli.mjs activate --project ~/pentests/acme
cd ~/pentests/acme                                       # abra esta pasta no runtime
node tools/workspace/cli.mjs use --name acme             # seleciona o engagement (explícito)
node tools/preflight/cli.mjs preflight --profile full-engagement
# /iniciar-pentest  (roteia ao dispatcher)  …  depois:
node tools/activation/cli.mjs deactivate --project ~/pentests/acme
```

**Windows (PowerShell):** o mesmo, com caminhos nativos. Symlinks exigem *Developer Mode* ou privilégio
(`SeCreateSymbolicLinkPrivilege`); se indisponível, ver §18.7 (limitação + alternativa).

## 18.6 Matriz de compatibilidade **comprovada** (níveis de evidência honestos)

Níveis: **D**=documentado · **I**=implementado · **T**=testado deterministicamente · **R**=validado em runtime real.

| Runtime | Descoberta local de skills | Dispatcher/KB/tools via link | MCP por projeto | Nível |
|---------|----------------------------|------------------------------|-----------------|-------|
| **Claude Code** | `.claude/skills` symlinked (mecanismo sancionado pelo adapter) | sim (symlinks; CLIs rodam do projeto) | `--mcp` linka `.mcp.json` **se existir** no central (não há hoje) | **I + T** (camada de arquivos/CLI); reconhecimento pela app ao vivo = **NOT RUN** |
| **Pi Agent** | registro **nativo é GLOBAL** (`~/.pi`) → **não feito** (proibido). Local: `pi --skill <projeto>/SKILL.md` por invocação, ou context-files (`AGENTS.md`/`CLAUDE.md` do Flow 8) | lê `SKILL.md`/`skills` linkados | n/a nesta rodada | **D** (contrato do adapter); **não** validado em runtime |
| **Antigravity** | via `AGENTS.md` (contrato) — **runtime indisponível no host** | leria recursos linkados | n/a nesta rodada | **D**; runtime = **BLOCKED/NOT RUN** |

> **Honestidade:** apenas a camada de **arquivos/contrato** e os **CLIs** foram comprovados (T). O
> reconhecimento das skills pela aplicação Claude Code ao vivo **não** foi executado (exige nova sessão/turno
> de LLM). Pi/Antigravity têm apenas **contrato** verificado.

## 18.7 Limitações & alternativas (sem contornar o "sem global")

- **Pi**: a descoberta nativa de skills é **global** (`~/.pi/agent/skills/`). Como não instalamos global, a
  alternativa local é `pi --skill <projeto>/SKILL.md` (por invocação) ou os **context-files** `AGENTS.md`/
  `CLAUDE.md` (gerados pelo Flow 8, não à mão). **Bloqueio honesto:** registro persistente por projeto no Pi
  exigiria mudança de arquitetura do Pi — **não** implementado.
- **Antigravity**: runtime indisponível no host → carga end-to-end **PENDENTE**; só o contrato (`AGENTS.md`)
  é conhecido.
- **Windows sem symlink**: sem *Developer Mode*/privilégio, `mklink` de diretório falha. Alternativa mínima:
  rodar da raiz central (Layout B) com `SA_ENGAGEMENT_ROOT`, ou habilitar o *Developer Mode*. **Não**
  contornamos criando cópias (duplicaria a KB) nem instalação global.
- **MCP**: só é linkado quando `--mcp` **e** existe um `.mcp.json` central (não há hoje) — sem fabricação.

## 18.8 Semântica & precedência

- **Harness instalado** (repo central) → **Projeto ativado** (marcador válido + links) → **Engagement
  selecionado** (`use`; determina escopo/projeto Caido/persistência) → **Sessão operacional** (`SA_SESSION_ID`)
  → **Operação autorizada** (Execution Context + Approval Gate).
- Um **projeto ativado não autoriza** testar nenhum alvo; a ativação **não** seleciona engagement
  silenciosamente.
- **Precedência de config:** ambiente > `<central>/.env` (`SA_SKIP_ENV_FILE=1` ignora o `.env`). Engagement
  ativo: `SA_ENGAGEMENT` (override) > ponteiro de sessão > nenhum. Projeto Caido: **manifesto** do engagement.

## 18.9 Isolamento (preservado) & limitação honesta

Ativar o projeto A **não** ativa o B (marcador por projeto). **Nenhuma** config global é tocada. Projeto
Caido vem do manifesto; evidências confinadas ao engagement; `SA_SESSION_ID` isola sessões concorrentes;
troca de engagement exige reconstrução de contexto e **não** declara histórico do LLM limpo sem
reinicialização efetiva. **Carregamento de recursos ≠ permissão de filesystem:** os symlinks dão acesso de
leitura/execução aos recursos do harness, mas **não** são um sandbox — ferramentas genéricas do runtime
(`bash cat`, `Read`) continuam fora do confinamento do Bridge (mesma limitação de camada-de-ferramentas dos
cap. 16/17). **Nenhum sandbox próprio** foi implementado nesta rodada.

## 18.10 Testes (`node tools/activation/test-activation.mjs` → 18/18)

Recusa de ativação **interna** (dentro do harness) e sob **dir global**; `--home` inválido; ativação externa
com links saudáveis; **KB linkada (não copiada)**; **descoberta das 11 skills** e **categorias da KB** pelo
link; **smoke**: os CLIs centrais rodam **a partir do projeto** (dispatcher/tools/KB alcançáveis); seleção de
engagement + **projeto Caido do manifesto** a partir do projeto; ativação **não** seleciona engagement nem
autoriza alvo; **idempotência**; deactivate remove links+marcador e **preserva dados do engagement**;
**reativação**; **config pré-existente** (recusa sem `--force`, backup+restauração com `--force`); **paths com
espaços**; **isolamento A≠B**; **sem modificação global** (`~/.pi`/`~/.gemini` não criados; `mcp=false` sem
`.mcp.json`); projeto **não ativado** (status=false, deactivate erra limpo).
