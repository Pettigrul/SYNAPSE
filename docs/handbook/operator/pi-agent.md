# Guia do Pi Agent

> Como instalar, ativar e operar o SYNAPSE no Pi. Referência: [adapter](../../../adapters/pi-agent.md),
> [cap. 18](../18-project-scoped-activation.md), [runtimes](runtimes.md).

## Situação real

**VALIDATED REAL em dados sintéticos, com conclusão instável** (Pi 1.4.0, `openai-codex/gpt-6-luna --thinking low`, Linux, `--mode json`
não interativo). A última passada completa de aceitação (10 execuções, cerca de US$ 0,04) deu **12/14** (S5 e S12 FAIL); as anteriores, na mesma rodada, 13/14 e 11/14. **O resultado varia entre
passadas.** O Pi não interrompe nada: o modelo encerra antes de concluir, em cerca de 1/4 a 1/3 dos prompts compostos (amostras pequenas), e as variáveis
testadas não explicam essa taxa; `SKILL.md`, políticas, modelo e nível de raciocínio não foram variados. Nenhuma chamada registrada foi classificada
como executada contra o host fora de escopo (detecção textual nos logs, sem captura de rede); tentativas chegaram a acontecer antes da correção do `AGENTS.md`, rejeitadas antes do Scope Guard ([relatório 49](../../architecture-review/49-pi-reliability-stabilization.md)).

**O que isso significa na prática:** confira o que foi feito, não só a resposta final; numa execução o agente afirmou ter gravado um arquivo sem nenhuma chamada de escrita. Em pedidos com várias partes, o agente pode entregar parte delas.
No autopilot, se ele parar após a primeira tarefa, peça que atualize o `toDoList`: `next` não avança sozinho.

Cobertos: ativação, leitura do dispatcher, criar/selecionar engagement, escopo, bootstrap + idempotência,
`/skill:engagement-atual`, troca de modo, tarefa Copilot com efeito em disco, cadeia Autopilot sobre 2 tarefas seguras
parando no gate Class A, retomada com `--continue`, `http.inspect` do Bridge numa fixture loopback com fora de escopo
recusado, falha controlada e isolamento entre projetos. O prompt do Autopilot nomeia o seletor `next`; uma execução
anterior sem essa dica chamou `next` só uma vez.

**NOT RUN:** TUI interativa, fluxo `/trust`, alvos reais, Caido, Windows, operações sob aprovação de fato executadas.

## Instalar

```bash
git clone <repo> <harness>                    # harness central, uma vez
cd <harness>/tools/web-runtime && npm install
cd <harness> && cp .env.example .env          # edite SA_ENGAGEMENT_ROOT (fora do harness)
```

O Pi é instalado à parte, conforme a documentação dele. `node tools/preflight/cli.mjs doctor` informa em `runtimes` se
ele está no `PATH`. Não use `pi install <harness>`: registra globalmente e não foi exercido.

## Configurar o modelo

O modelo padrão do Pi pode não ser da OpenAI, então passe provider e modelo. A credencial fica com o Pi: entre com
`/login` na sessão interativa, ou use `OPENAI_API_KEY` para o provider `openai`. **O SYNAPSE não guarda credencial de
modelo**, e nada disso vai para o `.env` do harness nem para o repositório.

```bash
pi auth check --provider openai-codex          # prontidão do provider, sem imprimir segredo
pi --list-models openai                        # modelos disponíveis para a sua conta
```

A combinação validada é `--provider openai-codex --model gpt-6-luna --thinking low`. `openai-codex` é um provider de
modelo do Pi; a integração Codex como runtime não faz parte desta distribuição.

## Ativar um projeto

```bash
node <harness>/tools/activation/cli.mjs activate --project <dir> --runtime pi
node <harness>/tools/activation/cli.mjs status   --project <dir>
```

Cria links para o harness, incluindo `AGENTS.md` e `.pi/settings.json`, e o marcador `.hackbot-activation.json`. Para
dois runtimes no mesmo projeto: `--runtime pi,antigravity`. Ativar não seleciona engagement nem autoriza alvo.

## Abrir e executar

O `.pi/settings.json` do projeto carrega skills e extensão, mas é protegido por *trust*. Sem confiança, os modos não
interativos o ignoram. O `AGENTS.md` é carregado de qualquer forma.

**Escolha pelo que o projeto contém.** `activate` e `status` listam o que o projeto traz além dos links do SYNAPSE (o
`doctor` também, em `runtimeConfigReview`).

Projeto seu ou revisado, sem nada listado:

```bash
cd <dir>
pi -a --provider openai-codex --model gpt-6-luna --thinking low      # interativo; ou /trust para gravar a decisão
```

Repositório de cliente ou não revisado: não use `-a` nem `/trust`. Ignore o que é local e aponte só para o SYNAPSE:

```bash
cd <dir>
pi -na --skill <harness>/SKILL.md --skill <harness>/.claude/skills \
  -e <harness>/tools/web-runtime/adapters/pi/extension-pi.mjs \
  --provider openai-codex --model gpt-6-luna --thinking low
```

### O risco de confiar em um projeto

Com `-a` ou `/trust`, o Pi carrega `.pi/extensions`, `.pi/mcp.json`, `.pi/SYSTEM.md`, `.pi/skills`, pacotes e
`.agents/skills`, inclusive de diretórios acima do projeto. Extensão é **código executado ao abrir**, com as permissões do
seu usuário. `tools/web-runtime/test-pi-trust.mjs` prova isso no Pi real, sem modelo: uma extensão canário de um projeto
sintético roda com `-a` e não roda sem flag nem com `-na`, e o `-na` acima ainda entrega as skills do SYNAPSE.

Três ressalvas:

- `AGENTS.md`, `AGENTS.override.md` e `CLAUDE.md` do projeto e de diretórios acima carregam **mesmo com `-na`** e podem
  influenciar o modelo. `--no-context-files` os desliga, junto com o ponteiro do SYNAPSE.
- Segundo a documentação do Pi, o `sessionDir` do projeto é lido antes da decisão de *trust*. Use `--session-dir` ou
  `--no-session` em repositório não revisado.
- O `-na` limita o que **carrega**, não o que o agente faz depois. Veja as fronteiras abaixo.

Não interativo, com retomada:

```bash
pi -a --mode json --provider openai-codex --model gpt-6-luna --thinking low --session-dir <sessoes> -- "<prompt>"
pi -a --mode json --provider openai-codex --model gpt-6-luna --thinking low --session-dir <sessoes> --continue -- "<prompt>"
```

Da raiz do harness, sem ativação: `pi --skill SKILL.md -e tools/web-runtime/adapters/pi/extension-pi.mjs`.

## Usar skills

As skills rodam como `/skill:<nome>`, por exemplo `/skill:engagement-atual` e `/skill:modo`. Lista completa:
[catálogo](skills-catalog.md). Com o `HOME` real, o Pi carrega também as suas skills globais ao lado das do SYNAPSE.

## Selecionar o engagement

```bash
node tools/workspace/cli.mjs init --name lab --modality blackbox
node tools/workspace/cli.mjs scope --name lab --file <scope.md>      # exige '# Scope' e '## In Scope'
node tools/workspace/cli.mjs use --name lab
node tools/workspace/cli.mjs bootstrap                               # gera AGENTS.md no engagement, conforme o marcador
node tools/workspace/cli.mjs active
```

Em projeto ativado, `SA_SESSION_ID` é opcional: a sessão deriva do marcador, então processos separados enxergam a mesma
seleção, e projetos que dividem o mesmo root têm seleções independentes. Um `SA_SESSION_ID` explícito cria outra sessão,
ainda presa a este projeto: o mesmo valor em outro projeto não enxerga esta seleção.

Fora de um projeto ativado e da raiz do harness não há seleção: `use`, `clear` e os comandos que dependem do engagement
ativo **recusam, sem gravar nada**, e dizem como resolver. Isso inclui subdiretório do harness e repositório Git aninhado no
projeto. O antigo ponteiro padrão compartilhado foi removido. Em projeto, um `SA_ENGAGEMENT` exportado não seleciona: sem ponteiro igual, o Pi recusa todos os
contextos (`engagement-conflict`) e os comandos recusam sem gravar. Use `use --name <n>`.

## Configurar modos

```bash
node tools/modes/cli.mjs status
node tools/modes/cli.mjs autopilot        # ou copilot; na sessão: /skill:modo
```

Modo não concede capability. Trocar de engagement volta para Copilot. Ver [modos](modes.md).

## Workflows

- **Pentest:** `/skill:iniciar-pentest`, depois `/skill:investigar <endpoint|hipótese>`.
- **Copilot:** peça uma tarefa delimitada; o agente executa e persiste no workspace.
- **Autopilot:** com o modo selecionado, peça que siga `node tools/workspace/cli.mjs next`. Nomeie o seletor no prompt,
  como na validação. A cadeia para no gate Class A.
- **Retomada:** `--continue`, com o mesmo `--session-dir`.

### Ferramentas do Bridge

```bash
SECAUDIT_BRIDGE_CONTEXTS=<ctx.json> pi -a
```

O arquivo é escrito pelo operador. `evidenceDir` é necessário para screenshots, e `allowPrivate` só é preciso para alvos
em rede privada ou loopback. `node tools/workspace/cli.mjs select --name <n>` imprime um fragmento pronto. Referências
a variáveis de ambiente **não** são expandidas.

```json
{
  "INV-LAB-1": {
    "scope": { "allowHosts": ["127.0.0.1", "lab.example.test"], "allowPrivate": true },
    "allowedCapabilities": ["capabilities", "http"],
    "approvals": [],
    "evidenceDir": "<engagement>/evidence"
  }
}
```

Um contexto de outro engagement é recusado a cada chamada (`engagement-mismatch`): id `eng:<n>`, campo `engagement`, `evidenceDir`
sob o root ou bloco `caido` com `baseUrl`, `token` ou `projectId` sem seleção ou vínculo correspondente. Um id sem nenhum desses sinais não pode ser atribuído a um engagement e continua aceito, salvo se a própria seleção estiver em conflito.

### Fronteiras: o que cada camada controla

| Camada | Controla | Não controla |
|--------|----------|--------------|
| **Sistema operacional** (usuário dedicado, contêiner, VM, rede) | o que o processo do Pi alcança: arquivos, credenciais, hosts | o conteúdo das decisões do modelo |
| **Shell do Pi** (`bash`) | nada por si só: roda com as permissões do seu usuário, sem sandbox nem aprovação por comando | pode ler o `.env` central e o arquivo de contextos, editar esse arquivo e acessar hosts diretamente |
| **Bridge** (`securityauditor_*`) | as operações feitas **por estas ferramentas**: escopo, capabilities, aprovações, limites | qualquer coisa feita pelo shell. A Bridge **não** controla comandos executados diretamente pelo agente |
| **`.env` e opt-in `--caido`** | quais processos do SYNAPSE recebem o token automaticamente | não impede um agente com shell de ler o arquivo |

**Credenciais:** o `CAIDO_TOKEN` do `.env` central não chega às CLIs por padrão. Em projeto ativado, só `projects` e o
preflight o recebem, e só depois de `activate --caido`. Isso reduz exposição acidental, **não** é uma barreira contra o
agente: `SECAUDIT_BRIDGE_CONTEXTS`, variáveis exportadas e o próprio `.env` continuam ao alcance do `bash`. Para separar de
fato, rode o Pi em usuário, contêiner ou VM sem acesso ao harness `.env` e use credenciais de curta duração. Não exporte
`CAIDO_TOKEN` antes de abrir o Pi se o agente não precisa dele. Ver [configuração](configuration.md). Veja `docs/security.md` e `docs/containerization.md` no pacote do Pi instalado.

## Diagnosticar falhas

| Sintoma | Causa | Ação |
|---------|-------|------|
| Skills ou ferramentas do Bridge não aparecem | projeto sem *trust* | em projeto revisado, `pi -a` ou `/trust`; senão, o `-na` com caminhos explícitos |
| `activate` lista `.pi/extensions` ou outro item | o projeto traz recursos próprios | revise antes de confiar; ver o risco acima |
| `CAIDO_TOKEN withheld` | projeto sem opt-in, ou movido, ou ativado antes do opt-in externo | o operador roda `activate --project <dir> --caido`, se confiar no projeto, ou exporta só para o comando |
| `engagement-mismatch` | contexto de outro engagement | selecione o engagement certo com `use` ou use o contexto dele |
| `no unambiguous project context` | fora de projeto ativado | rode do projeto, ative-o ou defina `SA_SESSION_ID` |
| Modelo inesperado | padrão do Pi | passe `--provider` e `--model` |
| `no-trusted-context` | `SECAUDIT_BRIDGE_CONTEXTS` ausente ou inválido | corrija o JSON |
| `capability-not-allowed` | op fora de `allowedCapabilities` | ajuste o contexto (operador) |
| Agente adivinha caminho de CLI | não seguiu o `AGENTS.md` | confira o link com `status`; aponte `tools/workspace/cli.mjs` no prompt |
| Skills que não são do SYNAPSE | skills globais do seu `HOME` | esperado |

Geral: [troubleshooting](troubleshooting.md).

## Validar a instalação

Sem custo de modelo:

```bash
node <harness>/tools/activation/cli.mjs status --project <dir>
cd <dir>
node tools/preflight/cli.mjs doctor
node tools/preflight/cli.mjs preflight --profile core-lab     # 0 READY / 1 DEGRADED / 2 BLOCKED
```

Com custo: a aceitação real gasta orçamento de modelo, exige `--accept-model-cost` e um export sem `.env` nem
`engagements/`, com as dependências de `tools/web-runtime` instaladas.

```bash
git -C <harness> archive HEAD | tar -x -C <export>
node <export>/tools/acceptance/runtime-acceptance.mjs --runtime pi --harness <export> --out <saida> --accept-model-cost
```

## Atualizar o SYNAPSE

```bash
git -C <harness> pull
node <harness>/tools/activation/cli.mjs activate --project <dir>     # sem --runtime: mantém os runtimes do marcador
```

Rode `npm install` em `tools/web-runtime` se as dependências mudaram. Seleções antigas podem não valer mais (ponteiro
padrão removido; `SA_SESSION_ID` agora preso ao projeto): selecione de novo com `use`. O token do `.env` exige
`activate --caido` no projeto que usa `projects`.

## Desativar

```bash
node <harness>/tools/activation/cli.mjs deactivate --project <dir>
```

Remove só os links e o marcador da ativação. Engagements, evidências e achados ficam preservados.
