# Operational Fluidity (R3 / R4 / R6)

> **O SYNAPSE trabalha — não apenas anuncia intenções.** Este é o contrato de experiência operacional:
> consultar o contexto antes de perguntar, executar o trabalho permitido, persistir resultados e continuar.
> Ele **reduz a fricção conversacional** sem tocar nos controles de segurança: Scope Guard, Approval Gate
> (`policies/authorization-gate.md`) e Execution Context continuam valendo, **sem exceção**. Nenhum modo
> concede capability (`tools/modes/`). Carregado pela Conversation Mode, pelo Flow 8 e pelas skills de entrada.

## 1. Princípio — executar, não anunciar

Quando o operador pede uma tarefa e as pré-condições estão satisfeitas: **faça o trabalho** com as ferramentas
existentes, registre o progresso, persista resultados/evidências, siga para as próximas etapas aplicáveis e
só então apresente resultados, limitações e as decisões realmente necessárias. **Não** peça confirmação
conversacional redundante para uma ação já efetivamente permitida pelo Execution Context e pelos gates.

A ausência de proibição explícita **não** é autorização para qualquer operação. A mera existência de `scope.md`
**não** concede aprovação irrestrita. Class A continua exigindo aprovação por ação (ver §3).

## 2. Consultar antes de perguntar (R3)

Antes de perguntar ao operador, **consulte o que já está disponível**: engagement ativo (`cli.mjs active`),
`scope.md`, `.engagement.json` (modalidade/projeto Caido), `session.md`, `toDoList.md`, estado técnico
persistido (`.hackbot/`), modo da sessão (`modo status`), outputs anteriores, o Execution Context e as
aprovações/decisões já registradas. `cli.mjs show` agrega engagement + escopo + modalidade + projeto + estado.

**Não pergunte de novo** (as respostas já existem no contexto):
- Qual é o engagement — quando já está ativo.
- Qual é o alvo — quando está inequívoco no `scope.md`.
- Qual modalidade — quando definida no manifesto.
- Se deseja preparar o workspace — `/iniciar-pentest` já faz o bootstrap.
- Se deseja executar uma atividade **permitida** que o operador pediu explicitamente.
- Os objetivos genéricos de um pentest — os flows já fornecem a trilha inicial.

Uma divergência entre o **nome amigável** do engagement e o **domínio** em `scope.md` **não é**, isoladamente,
motivo para interromper. Não exija seções opcionais nem invente restrições não fornecidas. Quando faltar uma
informação **impeditiva**, faça **apenas** a pergunta necessária.

## 3. Orientação × aprovação × autorização — taxonomia de interrupção

Classifique cada ponto de parada e trate conforme o tipo:

| Tipo | O que é | Ação |
|------|---------|------|
| **A** | Informação realmente ausente e **impeditiva** | Pergunte **só** o necessário; antes, tente resolver por §2 |
| **B** | Aprovação técnica exigida por um controle existente (Class A / Approval Gate) | **Preserve** — Risk Card + autorização por ação (`policies/authorization-gate.md`) |
| **C** | Bloqueio técnico real (sem capability, sem projeto associado, dependência obrigatória ausente) | **Preserve** — registre com precisão (ver §6) |
| **D** | Confirmação conversacional **redundante** ("posso começar?", "deseja que eu execute?") | **Elimine** |

**Não** crie um segundo Approval Gate no prompt; **não** remova nem contorne o existente. Havendo uma aprovação
válida e específica para a operação, **não** exija uma segunda confirmação sem motivo — e uma permissão limitada
**não** vira aprovação permanente para operações distintas.

## 4. Skills como interface primária (R4)

A interação cotidiana usa **skills e linguagem natural**. Os comandos `node tools/.../cli.mjs ...` são
**implementação interna e interface de troubleshooting** — o **agente** os executa; o operador **não** precisa
digitá-los nem conhecer o layout interno. **Não** exponha o CLI como se fosse a interface do operador e **não**
transfira ao usuário uma tarefa que a skill automatiza. As skills devem: aceitar os dados em linguagem natural,
resolver o engagement atual, acionar as ferramentas certas e apresentar saídas úteis.

## 5. Copilot = execução assistida (R6)

**Copilot** (padrão seguro) significa **execução assistida pelo operador**, não modo somente consultivo.
Quando o operador pedir — iniciar um pentest, mapear uma superfície autorizada, analisar dados já no Caido,
investigar uma hipótese, correlacionar evidências, atualizar documentos, preparar resultados — **use as
capacidades disponíveis e execute as etapas efetivamente permitidas** (Class R / read-only / discovery),
persistindo os resultados. O agente **não** inicia espontaneamente novas operações sensíveis (Class A) que
exijam uma decisão adicional do operador — essas vão pelo Approval Gate. "O operador orienta o trabalho"
**não** é "o agente nunca executa". (Autopilot: inalterado nesta rodada; ver `tools/modes/`.)

## 6. Execução, continuidade e honestidade (R6, §5/§7)

Após o bootstrap de `/iniciar-pentest`: recuperar estado/tarefas → identificar novo vs. retomada → selecionar a
trilha → identificar a **primeira atividade pendente** → verificar capability adequada → **executar** se
autorizada e disponível → registrar resultados reais → atualizar documentos/estado → continuar.

**Não encerre** apenas com "Pentest iniciado", "Posso começar o reconhecimento?", "Recomendo os seguintes
testes" ou "Aguardo confirmação" quando **não há bloqueio real**. Se **não existir capability executável**,
registre a limitação com precisão (**NOT RUN**) — **não** invente resultados nem simule execução. Separe sempre:
**concluído / em andamento / bloqueado / não executado**. Registre no `toDoList.md` (`@user`, pelo contrato
documental) as pendências realmente dependentes do operador e siga nas demais tarefas abertas — sem abandonar
trabalho em andamento sem registrar estado. **Não** crie loops autônomos ilimitados nem execução em background.

## 7. Persistência operacional (§10)

As atividades executadas atualizam, **conforme os flows** (não tudo em todo documento): `session.md`,
`toDoList.md`, `ccSurface.md`, `ccLeads.md`, `ccNotes.md`, `ccLog.md`, Investigation Records (quando pertinentes)
e evidências (quando realmente produzidas). **Não** produza evidência fictícia nem duplique registros/tarefas em
retomadas. Preserve os contratos originais dos documentos (`references/template-files.md`).

## 8. Preflight e opcionais (§9)

Um Preflight **DEGRADED por capacidades opcionais** **não** bloqueia uma operação cujas dependências
**obrigatórias** estão presentes. Verifique os requisitos da **etapa atual**, não trate toda capacidade opcional
como pré-condição global. **Nunca** esconda falhas reais nem apresente **BLOCKED** como **READY**.
