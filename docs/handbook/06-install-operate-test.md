# 6 — Instalação, Operação, Testes e Troubleshooting

## 6.1 Instalação e operação (comandos comprovados)

O guia reproduzível completo é [`../architecture-review/33-h3-f0-supervised-pilot-guide.md`](../architecture-review/33-h3-f0-supervised-pilot-guide.md)
(**não duplicado aqui**). Resumo dos caminhos **verificados** neste host Linux:

```bash
PI=<instalacao-pi>/bin/pi
PI_PKG=<instalacao-pi>/lib/node_modules/@earendil-works/pi-coding-agent
REPO=<raiz-do-synapse>
ENTRY=$REPO/tools/web-runtime/adapters/pi/extension-pi.mjs

"$PI" auth check --provider openai-codex          # readiness do provider (sem expor segredo)
"$PI" -e "$ENTRY" --provider openai-codex --model gpt-5.6-sol --thinking medium \
      --tools read,bash,securityauditor_capabilities,securityauditor_invoke --no-mcp --no-context-files
```

- **Caminho atual para o operador:** projeto ativado com `activate --runtime pi` e `pi -a`; ver o
  [guia do Pi](operator/pi-agent.md). O comando acima é o registro da execução com a entry explícita.
- `openai-codex` acima é o nome de um **provider de modelo do Pi**, usado na execução registrada; a integração
  Codex como runtime não faz parte desta distribuição.
- **Carga da extensão:** `-e <ENTRY>` (validado). `pi install` (registro persistente) é 📋 não exercido.
- **Execution Context:** arquivo JSON apontado por `SECAUDIT_BRIDGE_CONTEXTS` (cap. 3.3).
- **Encerramento:** sair do Pi dispara `session_shutdown` → `bridge.shutdown()`; cancelar turno RPC:
  `{type:"abort"}`.
- **Windows corporativo:** ajustar as 4 variáveis; `pi install`, auth corporativa, canal de navegador e
  `.bat` são **dependentes de Windows / não validados** ([33] §10; cap. 7 H2d).

## 6.2 Testes e regressões (inventário real)

Suites em `tools/web-runtime/` (rodar com `node <arquivo>`). Scripts em `package.json`
(`test`, `test:sessions`, `test:authz`, `test:concurrent`, `test:race`, `test:bridge`, `test:pi`,
`test:investigation`, `test:e2e`).

| Suite | Cobre | Observação |
|-------|-------|------------|
| `test.mjs` + `test-browser.mjs` | HTTP + browser base (`npm test`) | browser: BLOCKED se ausente |
| `test-sessions.mjs` | multi-sessão / isolamento / identidade | 🧪 |
| `test-authz.mjs` | Authorization Matrix (IDOR/BOLA) | 🧪 |
| `test-concurrent.mjs` | Concurrent Executor | 🧪 |
| `test-race.mjs` | Race/TOCTOU Validator | 🧪 |
| `test-bridge.mjs` | Capability Bridge (B1–B15: discovery, scope, capability-not-allowed, isolamento, cancel, timeout, sanitização, **B12 classificadores**, aprovação) | **15/15** 🧪 |
| `test-convergence.mjs` | **H1e-F1 P1–P4**: single-flight, `race-prerequisites`, kinds válidos, preservação de classificador, contrato do brief | **11/11** 🧪 (inclui reprodução da falha original) |
| `test-pi-adapter.mjs` | registro nativo + execução + cancelamento sob o runtime real do Pi | **7/7** 🧪 (BLOCKED sem Pi) |
| `test-pi-entry.mjs` | entry de descoberta carregada pelo loader real do Pi (sem modelo) | PASS 🧪 |
| `test-pi-rpc.mjs` | RPC `get_state` (loader OK) | PASS 🧪 |
| `test-investigation.mjs` | caminho operacional determinístico (INV-A/B/C) | **13/13** 🧪 |
| `test-e2e.mjs` | end-to-end HTTP | 🧪 |

**Validador V1 da KB** (sempre que mexer em conhecimento):
```bash
node docs/architecture-review/validate_h0.mjs . docs/architecture-review/baseline/manifest.json
# esperado: overall OK; bodies 127/127; T=112/112 B=15/15
```

**Suites offline:** 31 no total, incluindo `tools/activation/test-runtime-links.mjs` (44/44) e
`tools/workspace/test-runtime-contract.mjs` (59/59).

**Validação agêntica (modelo real)** 🤖 — não roda em CI; documentada em [30] (A PASS, C PASS, B PARTIAL).

**Aceitação em runtime real** 🤖 — separada das suites, com métricas próprias; gasta orçamento de modelo:
```bash
node tools/acceptance/runtime-acceptance.mjs --runtime pi|antigravity --harness <export> --out <dir> --accept-model-cost
```
`--harness` precisa ser um export sem `.env` nem `engagements/`. Situação: [readiness](operator/readiness.md).

## 6.3 Troubleshooting

Tabela de diagnóstico completa em [33] §9. Essenciais:

| Sintoma | Causa | Ação |
|---------|-------|------|
| `no-trusted-context` | `SECAUDIT_BRIDGE_CONTEXTS` ausente/inválido | criar o JSON do contexto |
| `capability-not-allowed` | op fora de `allowedCapabilities` | ajustar o contexto (operador) |
| `state-change-unauthorized` | op sensível sem aprovação | adicionar `{op,url}` em `approvals` |
| `race-prerequisites` | `race.run` sem `operations` | montar sessões + `experiment.operations` |
| `visual:false` no probe | navegador ausente | instalar Chrome/Edge (não baixa) |
| `Failed to load extension` | caminho `-e` errado / Pi ausente | conferir `$ENTRY`/`$PI_PKG`; `test-pi-rpc` |
| `listen EPERM` / exit 144 | sandbox bloqueia listen em background | rodar em foreground |
| `-p` "zero bytes" | print mode bufferiza; turno ~100–140s | usar `--mode rpc` (streaming) |
| Skills/Bridge ausentes em projeto ativado | `.pi/settings.json` sem *trust* | `pi -a` ou `/trust` |
| `agy` sai com 0 e resposta vazia | ferramenta negada sem interação | examinar `denied_actions`; [guia do Antigravity](operator/antigravity.md) |

## 6.4 Extensibilidade e evolução

- **Nova op/capacidade:** adicionar entrada em `BRIDGE_OPS` (`{capability, stateful, sensitive}`), um case
  em `bridge.mjs::_dispatch`, e a implementação em `capability.mjs`/backend. Ops sensíveis entram no gate
  de aprovação automaticamente via `_approved`.
- **Novo adaptador de runtime:** replicar o padrão `adapters/pi/` (core dependency-injected +
  entry de descoberta). O core (`extension.mjs`) não importa nada do runtime.
- **Nova técnica KB:** via Flow 3 (`flows-intake.md`) + `template-technique.md`; re-rodar o Validador V1.
- **Fallback:** toda integração externa entra como opcional com degradação para o caminho nativo.

## 6.5 Lacunas documentais

- Adaptadores de Bridge para Claude Code/Antigravity: só fundação ([05]). Uso do Antigravity: [guia](operator/antigravity.md).
- Automate/Sitemap/WebSocket do Caido: backend/GraphQL não documentados na doc do vendor ([34] §9).
- Persistência do veredito autoritativo fora do texto do agente: proposta, não implementada.
- Completude do Investigation Record em turnos interrompidos: dívida aberta ([32]).
