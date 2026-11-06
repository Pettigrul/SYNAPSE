# 40 — S3: Autopilot Operacional & Descoberta da Skill /modo (R5/R7)

> Torna o Autopilot **operacional** reutilizando o dispatcher + flows existentes (sem segundo orquestrador,
> scheduler, daemon ou loop de execução em Node) e corrige a **descoberta** de `/modo`. **Sem** enfraquecer
> gates; **nenhuma** autorização por modo. **Honestidade:** o comportamento agêntico **vivo** no Claude Code
> não é comprovável por dentro desta sessão → ver §Smoke (NOT RUN). "O agente do Claude Code é o loop."

## 1. Diagnóstico de /modo (R5)

A skill `.claude/skills/modo/SKILL.md` está **correta**: frontmatter `name: modo` + `description`, idêntica em
forma às demais (todas passam o contrato `test-skills` 62/62). Portanto **não** é A/B/C/D no nível de arquivo:
a skill existe (A), carrega (B), o modo **persiste** (`tools/modes/mode.mjs`, por `engagementId`+`SA_SESSION_ID`)
(C) e **propaga** a `/iniciar-pentest` e `/investigar` (que leem `modes/cli.mjs status` e ramificam) (D).

Causas plausíveis restantes — **não comprováveis por dentro** (não invoco a UI de slash commands):
- **E (nome/expectativa):** operador digitou `/mode` (EN) em vez de `/modo` (PT).
- **Freshness:** o Claude Code descobre `.claude/skills/` **no início da sessão**; `modo` foi
  criado/alterado nas rodadas P3→S3, então uma sessão aberta **antes** disso não o veria até reiniciar.

**Correções (mínimas, comprovadamente úteis):**
1. **Alias `/mode`** (`.claude/skills/mode/SKILL.md`) → encaminha para `/modo` (cobre E; espelha o padrão já
   aceito do alias `iniciar-investigacao`). Não divergente, fino, sem lógica reimplementada.
2. **Fato `claudeSkills` no Doctor** (`tools/preflight/doctor.mjs`): lista as skills instaladas em
   `.claude/skills/` + hint ("slash = nome EXATO, ex. `/modo`; Claude Code descobre no início da sessão —
   reinicie para atualizar"). Auxílio de troubleshooting; **não** prova descoberta viva.
3. **Nota de descoberta** na própria `/modo`.

Descoberta viva real de slash command = **NOT RUN** (ver §Smoke).

## 2. Contrato operacional do Autopilot (R7)

Novo `references/autopilot-loop.md` — o **loop supervisionado** como **leitura dos flows existentes sob o modo**,
sem novo orquestrador: estado → próxima tarefa (`cli.mjs next`, regra do Flow 11) → capability → permissão
(Class R/A) → executar → analisar → **persistir** → replanejar → continuar, até um **critério de parada**.
Encadeia atividades **permitidas** sem confirmação redundante; **cada** Class A continua por **aprovação por
ação**; antes de parar por bloqueio, executa tarefas **independentes**. Sem background/daemon/scheduler.

Modo ≠ autorização: selecionar Autopilot **não** concede capability, não ignora Scope Guard/Approval Gate, não
associa Caido sozinho, não acessa Whitebox, não excede limites/orçamento. Aprovação específica **não** é
reutilizada para operação distinta; bloqueios **não** são contornados por shell/browser/outra capability.

## 3. Arquivos alterados e justificativas

| Arquivo | Mudança | Justificativa |
|---|---|---|
| `tools/workspace/engagement.mjs` | **+`parseTasks()`** — seletor read-only sobre o `toDoList.md` existente (regra do Flow 11; ignora exemplos comentados) | Seleção determinística da próxima tarefa (R7) sem novo banco de estado |
| `tools/workspace/cli.mjs` | **+verbo `next`** | Skills-first "próxima tarefa" (Copilot/Autopilot); read-only, não executa |
| `references/autopilot-loop.md` | **NOVO** — contrato do loop supervisionado | R7: operacionalizar reutilizando flows; sem orquestrador |
| `.claude/skills/iniciar-pentest/SKILL.md` | ramo Autopilot encadeia pelo loop + `cli.mjs next`; Class A por aprovação; critérios de parada | R7 |
| `.claude/skills/modo/SKILL.md` | Autopilot→loop; Copilot=execução assistida; nota de descoberta | R5/R7 |
| `.claude/skills/mode/SKILL.md` | **NOVO** — alias EN de `/modo` | R5 (E) |
| `tools/preflight/doctor.mjs` | fato `claudeSkills` + hint de descoberta | R5 (troubleshooting) |
| `tools/workspace/test-skills.mjs` | reconhece alias `mode`→`/modo` | contrato |
| `tools/workspace/test-autopilot.mjs` | **NOVO** — loop comportamental (tools simuladas + gate real) | R7 |

**Não alterados:** 127 corpos da KB, agents, policies, Bridge, Scope Guard, Approval Gate, Execution Context,
arquitetura de estados, S1/S2. Zero dependências novas. Correção colateral: bug em `parseTasks` (grupo `@user`
trocado com o número da task) **pego pelo teste comportamental antes de qualquer uso** — nada havia sido entregue.

## 4. Demonstração de execução encadeada (nesta sessão, controlada e não-ofensiva)

Cadeia real com dados HTTP **sintéticos** fornecidos (sem recon ativo/Replay/LLM pago), em engagement de lab:
preparar (bootstrap) → `cli.mjs next` (vazio → objetivo semeia TASK-001) → **analisar** 2 requests sintéticos →
**persistir**: `ccSurface.md` (2 endpoints), `ccLeads.md` (LEAD-001 IDOR candidate), `ccLog.md` → flip
TASK-001 `[x]` + validation log → **replan**: `cli.mjs next` → **TASK-002** (investigar LEAD-001 sob Approval
Gate). Comprova a cadeia **Objetivo → planejamento → ferramenta → resultado → persistência → próxima ação**.
**Limite honesto:** o condutor aqui é o LLM seguindo o contrato (caminho de produção); autonomia **hands-off**
ponta-a-ponta no Claude Code = **NOT RUN** (§Smoke).

## 5. Testes e regressões

`tools/workspace/test-autopilot.mjs` — **13/13** (encadeia Class R permitida + persiste · resultado→próxima
tarefa (replan) · retomada sem repetir/duplicar · Class A não aprovada **bloqueada** + aprovação específica não
cruza ops + tarefa independente continua · aprovação exata permitida pelo gate · parada por orçamento ·
isolamento entre engagements · opcionais não bloqueiam · capability ausente → NOT RUN (task fica aberta) · sem
Whitebox automático · modo não concede nada · raiz externa/ativação local · seletor de próxima tarefa).
Regressões: `test-skills` 62/62, `test-fluidity` 16/16, `test-bootstrap` 18/18, `test-modes` 18/18,
`test-preflight` 28/28, engagement/multi/web-runtime verde; **Validador 127/127**.

## 6. Matriz de validação

| Item | Situação | Evidência |
|---|---|---|
| Seletor de próxima tarefa (`parseTasks`/`next`) | **IMPLEMENTED · TESTED OFFLINE** | `test-autopilot` + `test-skills` |
| Contrato do loop Autopilot (R7) | **IMPLEMENTED · TESTED OFFLINE** | `autopilot-loop.md` + skills; `test-autopilot` 13/13 |
| Invariantes (gate/modo/isolamento/Whitebox/opcionais) | **TESTED OFFLINE** | gate real `_approved`; envelope all-false |
| Cadeia objetivo→…→persistência | **TESTED OFFLINE (demonstrada em sessão, dados sintéticos)** | §4 |
| Alias `/mode` + Doctor `claudeSkills` (R5) | **IMPLEMENTED · TESTED OFFLINE** | `test-skills`; `doctor` |
| Descoberta viva de `/modo` no Claude Code | **NOT RUN** | não invocável por dentro — §Smoke |
| Autonomia **hands-off** ponta-a-ponta com LLM | **NOT RUN** | exige execução observada em runtime |

**Não** declarado VALIDATED REAL — não houve execução agêntica hands-off observada.

## 7. Limitações concretas do Claude Code

- Descoberta de skills ocorre no **início da sessão**; skills novas/alteradas exigem **sessão nova**.
- Slash commands usam o **nome exato** da skill; não há resolução difusa (`/mode`≠`/modo` sem o alias).
- O **loop agêntico é do runtime** (o agente), não um processo Node — não há (nem deve haver) daemon/scheduler;
  a autonomia existe apenas **dentro** da sessão e sob os gates.
- Não é possível, por dentro desta sessão, invocar a UI de slash commands para **provar** a descoberta.

## 8. Backlog R1–R7 + S4

R1 ✅ S1 · R2 ✅ S1 · R3 ✅ S2 · R4 ✅ S2 · **R5 ✅ S3** (alias+doctor+nota; descoberta viva NOT RUN) · R6 ✅ S2 ·
**R7 ✅ S3** (contrato+loop+testes+demonstração; hands-off NOT RUN). **S4:** validação operacional real no
Omarchy + Caido + persistência (transversal; não iniciada). Ver [38](38-stabilization-backlog.md).

## Smoke — aceitação em sessão nova do Claude Code (NOT RUN nesta rodada)

Sessão **nova** (para atualizar a descoberta), engagement de laboratório autorizado:

1. Digite `/modo` → deve aparecer e mostrar o status; `/mode` deve encaminhar para o mesmo. Se ausente:
   `node tools/preflight/cli.mjs doctor` → o fato `claudeSkills` lista `modo`/`mode` (confirma instalação);
   reinicie a sessão. **(R5 — descoberta viva.)**
2. `/modo autopilot` → `/usar-engagement lab` → `/iniciar-pentest`.
   **Esperado:** bootstrap → recupera estado → identifica objetivo → executa as 1ªs tarefas **permitidas**
   (ex.: mapear superfície a partir de dados já disponíveis) → persiste (`ccSurface`/`ccLog`/`toDoList`) →
   seleciona e executa a próxima (`cli.mjs next`) **sem** confirmação redundante → para só por critério
   definido (§4 de `autopilot-loop.md`). **(R7 — encadeamento vivo.)**
3. Uma tarefa Class A (ex.: replay) → **Risk Card + aprovação por ação**; sem aprovação, fica bloqueada e o
   Autopilot segue em tarefas independentes.
4. Retomada (`/usar-engagement lab` → `/modo autopilot` → `/iniciar-pentest`) → não duplica nem reinicia o
   concluído; prossegue do pendente.

Registrar PASS/FAIL por item com evidência sanitizada. **Não** executar recon ativo/Replay/varredura/LLM pago.
