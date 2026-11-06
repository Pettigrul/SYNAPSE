---
name: ativar-projeto
description: >
  Ativa o SYNAPSE localmente em um projeto externo, linkando o harness central (skills, dispatcher, KB,
  ferramentas) sem instalação global e sem duplicar a KB. Use quando o operador quiser habilitar o SYNAPSE em
  uma pasta de projeto/engagement — "ativar projeto", "ativar hackbot aqui", "habilitar hackbot neste
  diretório", "/ativar-projeto", "activate project". NÃO seleciona engagement nem autoriza alvo.
---

# Ativar SYNAPSE no projeto

Interface **fina** sobre a CLI de ativação — toda a lógica (symlinks para o harness central, marcador,
conflitos, segurança global) vive no Node (`tools/activation/`). **Nada global** é criado/alterado; a KB **não**
é duplicada (é linkada). Peça o diretório do projeto (default: diretório atual).

```bash
node tools/activation/cli.mjs activate --project <dir> [--runtime claude-code|pi|antigravity|all] [--mcp] [--force]
```

- Linka o harness central (dispatcher, `skills/` (KB), `tools/`, `policies/`, `.claude/skills`, hooks) para
  dentro do projeto — **sem cópia, sem segundo dispatcher, sem instalação global**.
- **Ativar ≠ selecionar engagement ≠ autorizar alvo.** Depois: `node tools/workspace/cli.mjs use --name <n>`
  → `/verificar-ambiente` → `/iniciar-pentest`.
- Conflitos com conteúdo pré-existente do operador: o CLI recusa (use `--force` para fazer backup, restaurado
  no deactivate). Repasse erros literalmente. Para desativar, use `/desativar-projeto`.
- **Limitação honesta:** Pi registra skills **globalmente** (`~/.pi`) — não feito aqui; Pi/Antigravity leem o
  `SKILL.md`/`skills` linkados. Ver handbook cap. 18 §18.6 (matriz por runtime).
