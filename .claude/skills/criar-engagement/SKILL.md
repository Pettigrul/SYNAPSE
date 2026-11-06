---
name: criar-engagement
description: >
  Cria um novo engagement (pentest) sob SA_ENGAGEMENT_ROOT, com workspace/buckets padrão. Use quando o
  operador pedir para criar/abrir/iniciar um novo pentest — "criar engagement", "novo pentest", "abrir
  engagement acme", "/criar-engagement", "create engagement". NÃO seleciona nem autoriza operações.
---

# Criar engagement

Interface **fina** sobre o CLI de workspace — a criação de diretórios, buckets e manifesto é feita pelo Node
(`tools/workspace/engagement.mjs`), não por este prompt. Peça ao operador o **nome** (e, opcionalmente, a
modalidade: `blackbox`/`graybox`/`whitebox`). Execute:

```bash
node tools/workspace/cli.mjs init --name <nome> [--modality blackbox|graybox|whitebox]
```

- Cria em `SA_ENGAGEMENT_ROOT/<nome>` (pode estar **fora** do repositório). Não copia skills/agents/tools/KB.
- **Não ativa** o engagement — para operar, use depois `/usar-engagement`. Criar ≠ selecionar ≠ autorizar.
- Associe o projeto Caido separadamente com `/associar-caido` (o projeto vem do manifesto, não de env global).
- Repasse erros do CLI literalmente (nome inválido, já existe, root ausente). Não contorne a validação.
