# Guia do Google Antigravity

> Como instalar, ativar e operar o SYNAPSE com o `agy`. Referência: [adapter](../../../adapters/antigravity.md),
> [cap. 18](../18-project-scoped-activation.md), [runtimes](runtimes.md).

## Situação real

**PARCIAL. O Antigravity não está homologado.** Medido com antigravity-cli 1.5.1 e `gemini-3.8-flash-low`, sem
interação humana, em dados sintéticos:

| Cenário | Resultado | O que significa |
|---------|-----------|-----------------|
| 1 — ativação e descoberta | **PASS** | 13/13 skills listadas por `/skills`; links saudáveis |
| 2 — dispatcher | **FAIL** | reconfirmado no `AGENTS.md` final: o agente lê o `AGENTS.md`, cita o SYNAPSE e aponta o `SKILL.md`, mas responde sem abrir o dispatcher e sem citar as classes de autorização |
| 3-11 — fluxos | **BLOCKED** | sem interação, nunca passaram da negação de permissão |
| 12 — falha controlada | **PASS** | cobre só o caminho de falha de leitura |
| 13 — isolamento | **PARTIAL** | verificado apenas pela CLI; o shell do agente foi negado |

Portanto: o carregamento do `AGENTS.md` está verificado; o **seguimento do dispatcher, não**. Não presuma que o agente
aplica as regras do `SKILL.md` só porque o `AGENTS.md` foi lido. A expansão de skill (`/engagement-atual`) e a leitura de
arquivos funcionaram.

**NOT RUN:** `agy` interativo com um humano aprovando, outros modelos, alvos reais, Caido, Windows.

## Instalar

```bash
git clone <repo> <harness>                    # harness central, uma vez
cd <harness>/tools/web-runtime && npm install
cd <harness> && cp .env.example .env          # edite SA_ENGAGEMENT_ROOT (fora do harness)
```

O `agy` é instalado à parte, conforme a documentação dele. Ele é uma CLI agêntica, não um atalho para a interface
gráfica. `node tools/preflight/cli.mjs doctor` informa em `runtimes` se ele está no `PATH`.

## Configurar o modelo

A conta e a credencial ficam com o `agy`; **o SYNAPSE não guarda credencial de modelo**.

```bash
agy models                                    # ids disponíveis para a sua conta
```

Passe o id com `--model <id>`. O resultado do cenário 2 vale para `gemini-3.8-flash-low`; outros modelos não foram medidos.

## Ativar um projeto

```bash
node <harness>/tools/activation/cli.mjs activate --project <dir> --runtime antigravity
node <harness>/tools/activation/cli.mjs status   --project <dir>
```

Cria links para o harness, incluindo `AGENTS.md` e `.agents/skills`, e o marcador `.hackbot-activation.json`. Uma ativação
só para `claude-code` não expõe nenhuma skill do SYNAPSE ao `agy`. Ativar não seleciona engagement nem autoriza alvo.

## Abrir e executar

```bash
cd <dir>
agy                                                                          # interativo
agy -p "<prompt>" --model <id> --output-format json --print-timeout 120s     # sem interação
agy -p "<prompt>" --model <id> --output-format stream-json --continue        # retoma a conversa mais recente
agy -p "<prompt>" --model <id> --output-format json --conversation <id>      # retoma por id
```

## O bloqueio de permissão

Sem interação, tudo que precisa de um comando de shell é negado, inclusive as CLIs chamadas pelas skills. O runtime
informa que `--mode auto` não está disponível para esta conta e continua no modo padrão, e depois:

> a tool required the "command" permission that headless mode cannot prompt for, so it was auto-denied. Add an
> allow-rule under permissions.allow in settings.json (e.g. command(<target>)).

**Uma execução negada ainda sai com código 0 e `status: SUCCESS`, com resposta vazia.** Quem automatiza precisa examinar
`denied_actions` no resultado JSON.

Ninguém no projeto adicionou essa regra. A decisão é do operador, e este guia não recomenda nenhuma das opções. **Se a
conta for gerenciada, verifique primeiro a política da sua organização.**

| Opção | Como | A favor | Contra |
|-------|------|---------|--------|
| **Interativo** | rode `agy` e aprove cada pedido | um humano vê cada comando; nenhuma configuração muda | exige presença; não serve para automação; **NOT RUN** neste projeto |
| **Regra de permissão estreita** | adicione, por decisão sua, uma regra em `permissions.allow` no `settings.json`, na forma `command(<target>)` indicada pelo runtime; `--settings` aplica configurações só à sessão, sem salvar | permite execução sem interação, limitada ao que a regra cobre | o comando permitido deixa de pedir aprovação; quanto mais amplo o alvo, maior o que o agente faz sem revisão; **não testada** aqui, inclusive como `<target>` é casado |

Antes de escolher, considere:

- Uma regra de permissão não é autorização de alvo. Ela não passa pelo Scope Guard nem pelo Approval Gate: o shell do
  agente fica fora do Bridge.
- Uma regra que cubra um interpretador inteiro equivale, na prática, a permitir código arbitrário. Delimite pelo comando
  específico e confirme na documentação do runtime o formato exato.
- A mensagem do runtime também cita `--dangerously-skip-permissions`, que aprova todas as ferramentas. Não é uma opção
  estreita e não foi usada nesta validação.
- Mesmo sem o bloqueio, o cenário 2 continua aberto: revise se o agente de fato abriu o `SKILL.md`.

## Usar skills

```bash
agy -p /skills                                # lista sem turno de modelo; as 13 do SYNAPSE ao lado das do próprio agy
```

As skills rodam como `/<nome>`, por exemplo `/engagement-atual`. Sem interação, o corpo da skill é expandido, mas o comando
que ela pede é negado. Lista completa: [catálogo](skills-catalog.md).

## Selecionar o engagement

O operador pode rodar as CLIs no próprio terminal, sem passar pelo agente. Isso funciona independentemente do bloqueio:

```bash
cd <dir>
node tools/workspace/cli.mjs init --name lab --modality blackbox
node tools/workspace/cli.mjs scope --name lab --file <scope.md>      # exige '# Scope' e '## In Scope'
node tools/workspace/cli.mjs use --name lab
node tools/workspace/cli.mjs bootstrap                               # gera AGENTS.md no engagement, conforme o marcador
node tools/workspace/cli.mjs active
```

Em projeto ativado, `SA_SESSION_ID` é opcional: a sessão deriva do marcador, e projetos que dividem o mesmo root têm
seleções independentes. Um `SA_SESSION_ID` explícito vence.

## Configurar modos

```bash
node tools/modes/cli.mjs status
node tools/modes/cli.mjs autopilot            # ou copilot
```

O estado é gravado, mas o comportamento do agente em cada modo **não foi verificado** neste runtime (cenários 7 e 9
BLOCKED). Modo não concede capability. Ver [modos](modes.md).

## Workflows

Os fluxos de pentest, Copilot, Autopilot e retomada existem como skills, mas estão **BLOCKED** sem interação e **NOT RUN**
no modo interativo. A retomada de conversa com `--continue` funciona; a releitura do estado dependeu de comando e foi negada.

### Capability Bridge

Não existe adapter de Bridge para o Antigravity. O único caminho é `tools/web-runtime/adapters/cli.mjs`, limitado a
`capabilities.*` e `http.*` (GET/HEAD):

```bash
node tools/web-runtime/adapters/cli.mjs '{"op":"capabilities.list"}'
node tools/web-runtime/adapters/cli.mjs '{"op":"http.inspect","params":{"url":"http://127.0.0.1:8080/"},"scope":{"allowHosts":["127.0.0.1"],"allowPrivate":true}}'
```

Saída: `0` sucesso, `1` recusa (fora de escopo), `2` requisição inválida, `3` op com estado não suportada.

O escopo é **fornecido por quem chama**, então essa CLI **não** é um gate do operador: quem a invoca escolhe o próprio
escopo. As operações com estado que o `/investigar` usa (sessões, browser, concorrência, race) **não têm caminho** aqui.

## Diagnosticar falhas

| Sintoma | Causa | Ação |
|---------|-------|------|
| Código 0, `status: SUCCESS`, resposta vazia | ferramenta negada | examine `denied_actions`; ver o bloqueio acima |
| `--mode auto is not available for this account` | limite da conta | continua no modo padrão; ver o bloqueio acima |
| `/skills` sem skills do SYNAPSE | projeto não ativado para este runtime | `activate --project <dir> --runtime antigravity` |
| Resposta genérica, sem as classes de autorização | dispatcher não aberto (cenário 2) | peça a leitura do `SKILL.md` e confira na saída; não trate como garantia |
| `stateful-op-unsupported-in-cli` | op com estado na CLI | sem caminho neste runtime |

Geral: [troubleshooting](troubleshooting.md).

## Validar a instalação

Sem custo de modelo:

```bash
node <harness>/tools/activation/cli.mjs status --project <dir>
cd <dir>
agy -p /skills
node tools/preflight/cli.mjs doctor
node tools/preflight/cli.mjs preflight --profile core-lab     # 0 READY / 1 DEGRADED / 2 BLOCKED
```

Com custo: a aceitação real exige `--accept-model-cost` e um export sem `.env` nem `engagements/`, com as dependências de
`tools/web-runtime` instaladas. Sem shell, os cenários 3-11 terminam BLOCKED, citando a recusa do runtime.

```bash
git -C <harness> archive HEAD | tar -x -C <export>
node <export>/tools/acceptance/runtime-acceptance.mjs --runtime antigravity --harness <export> --out <saida> --accept-model-cost
```

## Atualizar o SYNAPSE

```bash
git -C <harness> pull
node <harness>/tools/activation/cli.mjs activate --project <dir>     # sem --runtime: mantém os runtimes do marcador
```

Rode `npm install` em `tools/web-runtime` se as dependências mudaram. Projeto ativado antes da sessão derivada do marcador
perde a seleção anterior, então selecione o engagement de novo com `use`.

## Desativar

```bash
node <harness>/tools/activation/cli.mjs deactivate --project <dir>
```

Remove só os links e o marcador da ativação. Engagements, evidências e achados ficam preservados. Regras que você tenha
adicionado ao `settings.json` do `agy` **não** são removidas: elas são suas.
