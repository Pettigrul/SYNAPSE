---
name: desativar-projeto
description: >
  Desativa o SYNAPSE em um projeto, removendo apenas os links/arquivos criados pela ativação e preservando os
  dados do pentest. Use quando o operador quiser remover a integração local do SYNAPSE de uma pasta —
  "desativar projeto", "remover hackbot daqui", "desativar hackbot", "/desativar-projeto", "deactivate
  project". NÃO apaga engagements, evidências nem findings.
---

# Desativar SYNAPSE no projeto

Interface **fina** sobre a CLI de ativação. Remove **somente** o que a ativação criou (os symlinks rastreados
no marcador `.hackbot-activation.json` e o próprio marcador) e **restaura** qualquer conteúdo pré-existente que
tenha sido salvo em backup. **Não** apaga dados de engagement/pentest.

```bash
node tools/activation/cli.mjs deactivate --project <dir>
# marcador inválido (invalid-marker): remove só os links deste harness, preserva arquivos e renomeia o marcador
node tools/activation/cli.mjs deactivate --project <dir> --repair
```

- Remove apenas links que ainda apontam para o harness central registrado — **nunca** arquivos reais do
  operador. Restaura backups (`*.hackbot-bak`) feitos na ativação com `--force`.
- **Dados preservados:** engagements/evidências/findings vivem sob `SA_ENGAGEMENT_ROOT` (ou nos buckets do
  engagement), **fora** desses links — permanecem intactos.
- Verifique o estado a qualquer momento com `node tools/activation/cli.mjs status --project <dir>`.
