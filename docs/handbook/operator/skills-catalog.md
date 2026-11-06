# Catálogo consolidado de skills

> As **13 skills** em `.claude/skills/`, incluindo os aliases `/mode` e `/iniciar-investigacao` (interfaces finas sobre os CLIs Node; a lógica/enforcement ficam no
> Node/Bridge). Para cada uma: finalidade, pré-requisitos, exemplo, o que **efetivamente** executa,
> dependências, limitações, risco de efeito colateral. Técnico: [cap. 17](../17-operational-skills-and-engagement-ux.md).
> **Não** inclui skills futuras (`/gerar-relatorio`, `/registrar-achado` etc. **não existem**).

**Invocação por runtime:** os nomes abaixo estão na forma do Claude Code e do Antigravity (`/modo`). No Pi, use
`/skill:<nome>` (`/skill:modo`). No Antigravity, as skills que chamam uma CLI têm o comando negado sem interação
([guia](antigravity.md)).

## Gestão do engagement

### `/listar-engagements`
- **Finalidade:** listar engagements sob `SA_ENGAGEMENT_ROOT`; `*` marca o ativo.
- **Pré-requisitos:** `SA_ENGAGEMENT_ROOT` definido.
- **Exemplo:** `/listar-engagements` → `cli.mjs list`.
- **Executa:** leitura de diretórios/manifestos. **Dependências:** `tools/workspace/cli.mjs`.
- **Limitações/risco:** read-only; **sem** efeito colateral.

### `/criar-engagement`
- **Finalidade:** criar `SA_ENGAGEMENT_ROOT/<nome>` com buckets/manifesto. **Não** ativa nem autoriza.
- **Pré-requisitos:** `SA_ENGAGEMENT_ROOT`; nome válido.
- **Exemplo:** `/criar-engagement acme` → `cli.mjs init --name acme [--modality blackbox|graybox|whitebox]`.
- **Executa:** cria diretórios + `.engagement.json`. **Risco:** cria arquivos no root (idempotente; não sobrescreve dados).

### `/usar-engagement`
- **Finalidade:** selecionar o engagement **ativo** da sessão (ponteiro por projeto ativado ou harness; `SA_SESSION_ID` cria outra sessão, presa ao projeto). Fora deles, recusa sem gravar.
- **Pré-requisitos:** engagement existente (match exato).
- **Exemplo:** `/usar-engagement acme` → `cli.mjs use --name acme`.
- **Executa:** grava o ponteiro de sessão; numa troca, limpa o modo (volta a Copilot). **Limitação:** troca **avisa** sessão limpa (não apaga histórico do LLM). **Risco:** baixo.

### `/engagement-atual`
- **Finalidade:** mostrar o ativo (ou "nenhum"). **Exemplo:** `/engagement-atual` → `cli.mjs active`.
- **Executa:** leitura. **Risco:** nenhum (read-only; funciona sem seleção).

### `/associar-caido`
- **Finalidade:** vincular um projeto Caido ao manifesto do engagement (sem fallback global).
- **Pré-requisitos:** engagement existente; UUID do projeto (`cli.mjs projects` para descobrir — precisa instância).
- **Exemplo:** `/associar-caido` → `cli.mjs projects` + `cli.mjs associate --name acme --project-id <uuid>`.
- **Executa:** escreve `caido.projectId` no manifesto (rebind exige `--force`). **Risco:** altera manifesto (controlado).

### `/verificar-ambiente`
- **Finalidade:** Doctor/Preflight determinístico (offline, sem LLM, sem ops ofensivas).
- **Exemplo:** `/verificar-ambiente` → `preflight/cli.mjs preflight --profile core-lab|caido-native|full-engagement` / `doctor`.
- **Executa:** checagens locais; **não cria arquivos sensíveis**. **Risco:** nenhum.

## Pentest

### `/iniciar-pentest`
- **Finalidade:** iniciar/**retomar** o pentest completo roteando ao **dispatcher** + flows (escopo→recon→
  investigação→validação→reteste→consolidação).
- **Pré-requisitos:** engagement ativo; preflight não-BLOCKED; respeita o **modo**.
- **Exemplo:** `/iniciar-pentest`.
- **Executa:** confirma ativo (`cli.mjs active`) + `preflight`, depois **roteia** ao dispatcher. **Não** cria
  orquestrador nem executa ops ativas por conta própria.
- **Limitações/risco:** sem execução autônoma contínua; cada ação Class A exige Approval Gate.

### `/investigar`
- **Finalidade:** investigação técnica **pontual** (um comportamento/endpoint/hipótese) → **Investigation Record**.
- **Pré-requisitos:** engagement ativo; respeita o modo.
- **Exemplo:** `/investigar este endpoint`.
- **Executa:** conduz pelo fluxo supervisionado ([flows-caido-investigation](../../../references/flows-caido-investigation.md)); ops ativas só sob aprovação.
- **Limitações/risco:** não inicia pentest completo; sem ops espontâneas.

## Compatibilidade

### `/iniciar-investigacao`
- **Finalidade:** **alias DEPRECADO e TEMPORÁRIO** de `/investigar` (compat P1; a remover). Encaminha para `/investigar`. **Risco:** nenhum.

## Modos (ver [modes.md](modes.md))

### `/modo status` · `/modo copilot` · `/modo autopilot`
- **Finalidade:** consultar/selecionar o modo da sessão. **Pré-requisitos:** engagement ativo (para `copilot`/`autopilot`); `status` funciona sem seleção.
- **Exemplo:** `/modo autopilot` → `modes/cli.mjs autopilot`.
- **Executa:** grava estado em `<engagement>/.hackbot/mode[-<sid>].json`. **Não** concede capability, **não**
  autoriza alvo, **não** inicia operação. **Risco:** nenhum (só estado comportamental).

## Ativação (ver [runtimes.md](runtimes.md))

### `/ativar-projeto`
- **Finalidade:** linkar o harness central num projeto externo (symlinks; sem global, sem duplicar KB).
- **Pré-requisitos:** diretório externo ao harness; symlink suportado (ver Windows em [runtimes.md](runtimes.md)).
- **Exemplo:** `/ativar-projeto` → `activation/cli.mjs activate --project <dir> [--runtime claude-code|pi|antigravity|all|lista,separada] [--mcp] [--force]`.
- **Executa:** cria symlinks + marcador `.hackbot-activation.json`. **Risco:** cria links no projeto; conflitos
  recusados (backup com `--force`, restaurado no deactivate). **Ativar ≠ selecionar ≠ autorizar.**

### `/desativar-projeto`
- **Finalidade:** remover só os links/marcador da ativação; **preserva** dados do pentest.
- **Exemplo:** `/desativar-projeto` → `activation/cli.mjs deactivate --project <dir>`.
- **Executa:** remove symlinks rastreados + restaura backups. **Risco:** não apaga engagement/evidências.
