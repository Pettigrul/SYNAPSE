# Guia do Pi Agent

> Como instalar, ativar e operar o SYNAPSE no Pi. Referência: [adapter](../../../adapters/pi-agent.md),
> [cap. 18](../18-project-scoped-activation.md), [runtimes](runtimes.md).

## Situação real

**VALIDATED REAL em dados sintéticos** (Pi 1.4.0, `openai-codex/gpt-6-luna --thinking low`, Linux, `--mode json`
não interativo). Os cenários de aceitação 1-14 deram PASS em uma única passada (10 execuções, cerca de US$ 0,05), com S12 rejulgado do
log após um falso negativo na checagem de redação; duas correções pequenas vieram depois, testadas offline.
Uma passada anterior falhou em S12, porque o agente adivinhou um caminho de CLI inexistente; por isso o `AGENTS.md`
atual nomeia as CLIs.

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

```bash
cd <dir>
# Atenção: -a confia em TODO recurso local do projeto, inclusive .pi de um repositório de cliente. Revise-o antes.
pi -a --provider openai-codex --model gpt-6-luna --thinking low      # interativo; ou /trust para gravar a decisão
```

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
seleção, e projetos que dividem o mesmo root têm seleções independentes. Um `SA_SESSION_ID` explícito vence.

**Rode da raiz do projeto.** Fora dele não há marcador, e a CLI cai no ponteiro padrão, que pode ser de outro cliente.
Confira com `active` antes de operar, ou defina `SA_SESSION_ID`.

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

> **Limite de contenção.** O `bash` do Pi não tem sandbox: ele pode editar o arquivo de contextos ou acessar hosts
> diretamente. O Bridge restringe as ferramentas dele, não o agente. Contenção real exige isolamento no sistema
> operacional.

## Diagnosticar falhas

| Sintoma | Causa | Ação |
|---------|-------|------|
| Skills ou ferramentas do Bridge não aparecem | projeto sem *trust* | `pi -a` ou `/trust` |
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

Rode `npm install` em `tools/web-runtime` se as dependências mudaram. Projeto ativado antes da sessão derivada do marcador
perde a seleção anterior, então selecione o engagement de novo com `use`.

## Desativar

```bash
node <harness>/tools/activation/cli.mjs deactivate --project <dir>
```

Remove só os links e o marcador da ativação. Engagements, evidências e achados ficam preservados.
