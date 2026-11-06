# Troubleshooting

> Erros comuns e ação corretiva, com os códigos **reais** emitidos pelas CLIs/Bridge. Técnico:
> [cap. 15](../15-windows-bootstrap-preflight.md), [cap. 16 §16.6](../16-multi-engagement-and-caido-onboarding.md).

## Engagement / seleção

| Sintoma | Causa | Ação |
|---------|-------|------|
| `SA_ENGAGEMENT_ROOT not set` | root não definido | defina `SA_ENGAGEMENT_ROOT` no `.env` (externo ao repo) |
| `root-inside-harness` | root resolve para dentro do harness | use um diretório externo, ou `engagements/` do harness |
| `bad-runtime` no `bootstrap` | valor de `--runtime` desconhecido | `claude`, `claude-code`, `agents`, `antigravity`, `pi` ou `both` |
| Engagement ativo em um projeto e não em outro | em projeto ativado, a seleção é por projeto | `use --name <n>` em cada projeto; um `SA_SESSION_ID` explícito vence |
| `no active engagement selected` | nenhum engagement selecionado | `node tools/workspace/cli.mjs use --name <n>` (ou `/usar-engagement`) |
| `no engagement named '<x>'` | nome não existe (match exato, sem adivinhar) | ver candidatos listados; `cli.mjs list` |
| Trocar de engagement não "limpa" o chat | a troca **não** apaga o histórico do LLM | inicie uma **sessão limpa** após `use` numa troca |

## Modos

| Sintoma | Causa | Ação |
|---------|-------|------|
| `cannot set mode … no active engagement` | modo pertence à sessão do engagement | selecione um engagement antes de `/modo copilot|autopilot` |
| Autopilot "não faz nada sozinho" | é **supervisionado**; não concede permissão | cada ação Class A exige aprovação; ver [modes.md](modes.md) |
| Modo "voltou" para copilot | troca de engagement limpa o modo da sessão | reselecione o modo no engagement atual |

## Caido

| Sintoma | Código | Ação |
|---------|--------|------|
| Sem config de instância | `caido-not-configured` | defina `CAIDO_BASE_URL`/`CAIDO_TOKEN` no `.env` |
| Engagement sem projeto | `caido-no-project` | `cli.mjs associate --name <n> --project-id <uuid>` |
| Projeto corrente ≠ associado | `caido-project-mismatch` | selecione o projeto certo na instância ou reassocie (`--force`) |
| `projects` indisponível (`available:false`) | instância local sem `@cloud` | use o UUID visível na UI / `currentProject` |
| 401/403 / token expirado | token inválido/expirado | renove `CAIDO_TOKEN` (PAT/access token); ver [caido.md](caido.md) |
| Doctor/Preflight "OK" mas op Caido falha | Preflight é **estrutural**, não testa conectividade viva | confirme instância ativa e token; ver [caido.md §6](caido.md) |
| `caido-native` BLOCKED (`evidence`, `caidoProject`) sem engagement | esperado: cadeia Caido exige engagement+associação+scope | crie/associe/selecione um engagement de laboratório ([caido.md §8](caido.md)); `projects` e `health` funcionam sem isso |

## Operações ativas / evidências

| Sintoma | Código | Ação |
|---------|--------|------|
| Replay recusado | `caido.replay.run requires an operator approval…` | forneça a aprovação do alvo no Execution Context (Approval Gate) |
| Finding recusado | `…requires a requestId…` / `…requires title and reporter` | inclua `requestId` (evidência) + `title`/`reporter` |
| Evidência sem destino | `evidence-no-engagement` | selecione um engagement (evidência vai para `<engagement>/evidence`) |
| Caminho de evidência recusado | `evidence-path-escape` | use um caminho **dentro** de `<engagement>/evidence` |

## Ativação local (P2)

| Sintoma | Código | Ação |
|---------|--------|------|
| Ativar dentro do harness | `inside-harness` | use um diretório **externo**; no repo central rode direto (Layout A/B) |
| Ativar sob dir global | `unsafe-target` | não ative em `~/.claude`/`~/.pi`/`~/.gemini`/`$HOME` |
| `--home` inválido | `bad-home` | aponte para a raiz do harness (com `SKILL.md`/`tools/`) |
| Conflito com arquivo existente | `conflict` | `--force` faz backup (restaurado no `deactivate`) |
| `unknown runtime` | valor de `--runtime` desconhecido | `claude-code`, `pi`, `antigravity`, `all` ou lista separada por vírgula |
| Symlink falha no Windows | (erro de FS) | habilite *Developer Mode* ou use **Layout B** (ver [runtimes.md](runtimes.md)) |
| `status` mostra `BAD` em um link | link quebrado/movido | `deactivate` + `activate` novamente |

## Pi Agent ([guia](pi-agent.md))

| Sintoma | Causa | Ação |
|---------|-------|------|
| Skills ou ferramentas do Bridge não aparecem | `.pi/settings.json` exige *trust* | `pi -a` ou `/trust` |
| Modelo inesperado | o padrão do Pi pode não ser OpenAI | passe `--provider` e `--model` |
| Skills que não são do SYNAPSE | o `HOME` real carrega suas skills globais | esperado |
| `no-trusted-context` | `SECAUDIT_BRIDGE_CONTEXTS` ausente ou inválido | corrija o JSON escrito pelo operador |

## Antigravity ([guia](antigravity.md))

| Sintoma | Causa | Ação |
|---------|-------|------|
| Código 0, `status: SUCCESS`, resposta vazia | ferramenta negada sem interação | examine `denied_actions`; a decisão é do operador (ver guia) |
| `/skills` sem skills do SYNAPSE | projeto não ativado para o runtime | `activate --project <dir> --runtime antigravity` |
| Resposta sem as classes de autorização | dispatcher não aberto (cenário 2 FAIL) | peça a leitura do `SKILL.md`; não trate como garantia |
| `stateful-op-unsupported-in-cli` (saída 3) | op com estado em `adapters/cli.mjs` | sem caminho neste runtime |

## Preflight — vereditos

- Exit `0 READY` / `1 DEGRADED` / `2 BLOCKED`. Opcionais (ex.: workflows nativos) nunca causam `BLOCKED`
  (→ `DEGRADED`). Perfis: `core-lab`, `caido-native`, `full-engagement`. Hints acionáveis acompanham cada check.
