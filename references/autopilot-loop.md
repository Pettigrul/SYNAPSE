# Autopilot — Supervised Operating Loop (R7)

> **Autopilot é um comportamento, não uma autorização.** Este é o contrato de operação do Autopilot
> supervisionado: como **encadear** as etapas de trabalho **permitidas** usando o dispatcher e os
> `references/flows-*.md` **já existentes** — sem segundo orquestrador, sem scheduler, sem daemon, sem loop de
> execução em Node, sem autonomia ilimitada. O **agente do Claude Code é o loop**; este arquivo diz como
> conduzi-lo. Todos os controles de S1/S2 e os gates permanecem **intactos** (`policies/authorization-gate.md`,
> Scope Guard, Execution Context, Capability Bridge). Selecionar Autopilot **não concede** nenhuma capability.
> Carregado por `/iniciar-pentest` e `/modo` quando o modo da sessão é `autopilot`.

## 1. O loop (reutiliza os flows; não é um pipeline rígido)

Dado um **objetivo delimitado** do operador (ou "iniciar/retomar o pentest"), repita:

1. **Estado** — recupere o estado atual pelos documentos existentes (`cli.mjs show`; Flow 8/11: `session.md`,
   `toDoList.md`, `ccSurface.md`, `ccLeads.md`, `ccGadgets.md`, `ccNotes.md`, `ccLog.md`, `ccFailed.md`,
   checkpoint, Investigation Records).
2. **Próxima ação** — selecione a próxima tarefa **permitida** (`cli.mjs next` = regra do Flow 11: próxima
   `- [ ]` de `## Tasks` por prioridade; `@user` **não** é objetivo elegível). Adapte à modalidade/escopo/
   ferramentas — a sequência do exemplo abaixo **não** é fixa.
3. **Capability** — verifique se existe uma capability adequada e **disponível** (Bridge/`caido.*`/`copilot.*`/
   recon nativo). Sem capability executável → **NOT RUN** preciso (não simule).
4. **Permissão** — classifique Class R vs Class A. Class R permitida → execute. Class A → **Approval Gate por
   ação** (Risk Card); sem aprovação válida e específica, **não** execute — registre a pendência e siga.
5. **Executar** — rode a atividade permitida pelo mecanismo normal (dispatcher + flows + `securityauditor_invoke`).
6. **Analisar** — interprete o resultado real.
7. **Persistir** — atualize os documentos pertinentes (ver §3) e as evidências realmente produzidas.
8. **Replanejar** — o resultado **alimenta** a próxima seleção (novo lead → nova tarefa; dead end → `ccFailed.md`).
9. **Continuar** até um **critério de parada** (§4).

**Não** interrompa a cada etapa só para perguntar "devo continuar?". **Não** encerre apenas apresentando um
plano. Encadeie as atividades permitidas sem confirmação conversacional redundante (S2, `operational-fluidity.md`).

## 2. Autonomia por objetivo (exemplo conceitual web/API — NÃO um pipeline fixo)

Preparar engagement → recuperar estado → recon/inventário de superfície → análise de HTTP History (se houver
projeto Caido + dados) → correlação de endpoints/parâmetros → hipóteses → investigação com capabilities
disponíveis → registro de evidências/resultados → atualização de progresso → próxima tarefa. Adapte sempre ao
estado real; host/AD segue outra trilha (Flow 9R host/AD).

## 3. Planejamento, progresso e retomada (documentos existentes — sem segundo banco)

O Autopilot sabe, lendo os documentos: **concluído** (`- [x]` + validação; `ccGadgets.md`), **em andamento**
(`**Progress:**`), **pendente** (`- [ ]` em `## Tasks`), **falhou** (`ccFailed.md`), **depende do operador**
(`@user` em `toDoList.md`), **independente** (demais `- [ ]`). Na **retomada**: não duplica tarefas, não
reinicia atividades concluídas, prossegue do pendente (o bootstrap S1 é idempotente; `cli.mjs next` só retorna
tarefas abertas). Persistência conforme os flows (não tudo em todo documento), sem evidência fictícia.

## 4. Critérios de parada (devolver o controle ao operador)

Pare quando: o **objetivo** estiver concluído; **não houver** trabalho permitido e executável (`cli.mjs next`
vazio); uma decisão **impeditiva** depender do operador; uma operação exigir **aprovação específica** (Class A);
um **limite** operacional/concorrência for atingido; o **orçamento** esgotar; ocorrer **falha impeditiva**; ou o
operador **cancelar**. Antes de parar por bloqueio de uma tarefa, verifique se há **outras tarefas independentes**
que podem prosseguir — execute-as e registre a bloqueada (`@user`/`ccFailed.md`). Nunca execução em background/
daemon/scheduler; nunca persistência de execução fora da sessão do Claude Code.

## 5. Modo ≠ autorização (invariantes — não enfraquecer)

Selecionar Autopilot **não** concede capability, **não** ignora Scope Guard/Approval Gate, **não** associa
projeto Caido sozinho, **não** acessa Whitebox, **não** excede limites/orçamento/concorrência. Atividades
permitidas pelo contexto e que **não** exigem aprovação adicional podem ser **encadeadas** automaticamente.
Operações que exigem aprovação continuam exigindo **aprovação válida e específica** para **aquela** ação, com o
contexto e os limites correspondentes — **sem** aprovação global, **sem** reutilizar uma autorização específica
para operação distinta, **sem** contornar bloqueios por shell/browser/outra capability. O LLM **não** se
autoriza; uma string/booleano do agente **não** é autorização. (Autopilot real ponta-a-ponta ainda não é
validado em runtime — ver a matriz de readiness e `docs/architecture-review/40-s3-operational-autopilot.md`.)
