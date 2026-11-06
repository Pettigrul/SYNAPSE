---
name: verificar-ambiente
description: >
  Roda o Preflight/Doctor determinístico (offline, sem LLM, sem operações ofensivas): runtimes, KB, policies,
  Caido, workspace, evidências do engagement ativo. Use quando o operador pedir para verificar/diagnosticar o
  ambiente antes de operar — "verificar ambiente", "preflight", "doctor", "está tudo pronto", "/verificar-
  ambiente", "check environment". Não cria arquivos sensíveis.
---

# Verificar ambiente (Preflight / Doctor)

Interface **fina** sobre o CLI de preflight — toda a verificação vive no Node (`tools/preflight/`). É
**determinística, offline, sem LLM e sem operações ofensivas**.

Preflight (escolha o perfil conforme o objetivo; default `core-lab`):

```bash
node tools/preflight/cli.mjs preflight --profile core-lab|caido-native|full-engagement
```

Diagnóstico de fatos do ambiente (sempre sai 0; nunca imprime valores de segredos, só nomes):

```bash
node tools/preflight/cli.mjs doctor
```

- Verdicts: `READY` (0) / `DEGRADED` (1) / `BLOCKED` (2). Repasse os checks e **hints acionáveis** ao operador.
- `caido-native`/`full-engagement` exigem engagement ativo (projeto Caido + diretório de evidências). Em
  `core-lab`, evidências são opcionais. O check de evidências **não cria** arquivos sensíveis (probe efêmero).
- Funciona **sem** engagement ativo (reporta o que falta); não autoriza nem executa operações.
