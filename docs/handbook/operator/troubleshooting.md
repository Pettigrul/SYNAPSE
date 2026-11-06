# Troubleshooting

> Erros comuns e ação corretiva, com os códigos **reais** emitidos pelas CLIs/Bridge. Técnico:
> [cap. 15](../15-windows-bootstrap-preflight.md), [cap. 16 §16.6](../16-multi-engagement-and-caido-onboarding.md).

## Engagement / seleção

| Sintoma | Causa | Ação |
|---------|-------|------|
| `SA_ENGAGEMENT_ROOT not set` | root não definido | defina `SA_ENGAGEMENT_ROOT` no `.env` (externo ao repo) |
| `root-inside-harness` | root resolve para dentro do harness | use um diretório externo, ou `engagements/` do harness |
| `bad-runtime` no `bootstrap` | valor de `--runtime` desconhecido | `claude`, `claude-code`, `agents`, `antigravity`, `pi` ou `both` |
| Engagement ativo em um projeto e não em outro | a seleção é por projeto, mesmo com o mesmo `SA_SESSION_ID` | `use --name <n>` em cada projeto |
| `no unambiguous project context` | fora de projeto ativado e da raiz do harness (inclui subdiretório do harness e repositório aninhado), ou marcador ilegível | rode da raiz do projeto ou do harness, ative o projeto, ou defina `SA_SESSION_ID` para automação; comandos de leitura aceitam `--name` |
| Repositório clonado dentro do projeto ativado recusa `use` | repositório aninhado não herda a seleção do projeto pai | rode da raiz do projeto, ou ative o repositório clonado se ele for o projeto de trabalho |
| Seleção antiga sumiu após atualizar | ponteiro padrão removido; `SA_SESSION_ID` agora preso ao projeto | `use --name <n>` de novo; `active.json` antigo é ignorado e pode ser descartado |
| `SA_ENGAGEMENT=… conflicts` | variável diverge da seleção deste contexto; nada foi gravado | `unset SA_ENGAGEMENT`, ou `use --name <n>` |
| `invalid-marker` | marcador malformado; nada foi alterado | `deactivate --project <dir> --repair`, depois `activate` |
| `SA_ENGAGEMENT` não seleciona em um projeto | em projeto ele não seleciona, venha do `.env` ou de um export | `use --name <n>`, ou `--name <n>` no comando |
| `SA_ENGAGEMENT` não seleciona em repositório aninhado | há um projeto ativado acima; o repositório não herda a seleção e a variável não a substitui | `--name <n>`, ou `SA_SESSION_ID` com `use --name <n>` |
| `SA_ENGAGEMENT=… is set, but … selects nothing here` | variável sem seleção neste projeto; pode ter sobrado de outro cliente; nada foi gravado | `use --name <n>`, `--name <n>` ou `unset SA_ENGAGEMENT` |
| `… no longer exists` | o ponteiro nomeia engagement removido | `use --name <n>` |
| `activation marker … is a symbolic link` | o marcador é um link; nunca é seguido | `deactivate --project <dir> --repair`, depois `activate` |
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
| `CAIDO_TOKEN withheld` | o projeto não tem opt-in neste harness (movido, renomeado, copiado ou ativado antes do opt-in externo), ou seus links não estão íntegros | confira com `status`; se confiar no projeto, o operador roda `activate --project <dir> --caido`, ou exporta só para o comando |
| `Caido opt-in file … so no project` | `.env.caido-opt-ins.json` ilegível ou inválido | corrija o arquivo, ou mova-o e repita `--caido` nos projetos |
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
| `project-supplied runtime config` | o projeto traz `.pi/extensions`, hooks ou outro recurso próprio | não bloqueia; revise antes de confiar no projeto em um runtime |

## Pi Agent ([guia](pi-agent.md))

| Sintoma | Causa | Ação |
|---------|-------|------|
| Skills ou ferramentas do Bridge não aparecem | `.pi/settings.json` exige *trust* | em projeto revisado, `pi -a` ou `/trust`; senão, o `-na` com caminhos explícitos ([guia](pi-agent.md)) |
| Modelo inesperado | o padrão do Pi pode não ser OpenAI | passe `--provider` e `--model` |
| Skills que não são do SYNAPSE | o `HOME` real carrega suas skills globais | esperado |
| `no-trusted-context` | `SECAUDIT_BRIDGE_CONTEXTS` ausente ou inválido | corrija o JSON escrito pelo operador |

## Antigravity ([guia](antigravity.md))

| Sintoma | Causa | Ação |
|---------|-------|------|
| Código 0, `status: SUCCESS`, resposta vazia | ferramenta negada sem interação | examine `denied_actions`; a decisão é do operador (ver guia) |
| `/skills` sem skills do SYNAPSE | projeto não ativado para o runtime | `activate --project <dir> --runtime antigravity` |
| Resposta sem as classes de autorização | o modelo não abriu o dispatcher | comece com `/security-auditor` e confira o `read_file` no log |
| Agente diz que a Bridge protege o fluxo | não existe ferramenta `securityauditor_*` no `agy` | é falso; ver [guia](antigravity.md) |
| `contexts-file-withheld` | `SECAUDIT_BRIDGE_CONTEXTS` só no `.env` central, usado de um projeto | exporte a variável no comando |
| `caller-scope-refused` / `engagement-mismatch` | `adapters/cli.mjs` com arquivo de contextos | nomeie `eng:<engagement selecionado>`; o escopo vem do arquivo |
| `stateful-op-unsupported-in-cli` (saída 3) | op com estado em `adapters/cli.mjs` | sem caminho neste runtime |

## Preflight — vereditos

- Exit `0 READY` / `1 DEGRADED` / `2 BLOCKED`. Opcionais (ex.: workflows nativos) nunca causam `BLOCKED`
  (→ `DEGRADED`). Perfis: `core-lab`, `caido-native`, `full-engagement`. Hints acionáveis acompanham cada check.
