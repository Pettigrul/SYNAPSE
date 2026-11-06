---
name: associar-caido
description: >
  Associa um projeto Caido ao manifesto de um engagement (binding projeto↔engagement, sem fallback global).
  Use quando o operador pedir para associar/vincular um projeto Caido a um pentest — "associar caido",
  "vincular projeto caido", "/associar-caido", "associate caido project". Descoberta opcional de projetos.
---

# Associar projeto Caido

Interface **fina** sobre o CLI de workspace — a escrita do `caido.projectId` no manifesto e a recusa de
rebind silencioso vivem no Node. A instância Caido (`CAIDO_BASE_URL`/`CAIDO_TOKEN`) é config de **instância**
(`.env`); o **projeto** pertence ao **engagement**.

Descoberta (opcional, precisa de instância configurada — reusa o Bridge `caido.projects`):

```bash
node tools/workspace/cli.mjs projects
```

Associação (peça o **nome do engagement** e o **UUID do projeto**):

```bash
node tools/workspace/cli.mjs associate --name <nome> --project-id <uuid>
```

- **Sem fallback silencioso** entre projetos. Rebind de um projeto já associado exige `--force` — se o CLI
  recusar, repasse o erro e confirme com o operador antes de reassociar.
- Se `projects` indicar `available:false` (instância local sem `@cloud`), use o UUID visível na UI do Caido.
- A association não autoriza operações ofensivas; o enforcement projeto↔engagement acontece no Bridge.
