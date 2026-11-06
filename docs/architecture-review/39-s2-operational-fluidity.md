# 39 — S2: Fluidez Operacional, Execução e Copilot (R3/R4/R6)

> Corrige a fricção da V2 (perguntas redundantes, anúncio em vez de execução, exposição de CLI, Copilot
> passivo) **sem** tocar nos controles: Scope Guard, Approval Gate e Execution Context intactos; nenhum modo
> concede capability. Mudanças de **instrução** (skills/flows/dispatcher) + invariantes de código testados.
> **Honestidade:** testes de contrato/código **não** provam comportamento agêntico vivo — ver §Smoke (NOT RUN).

## 1. Causas-raiz

A **política** (`policies/authorization-gate.md`) e a Conversation Mode do dispatcher já eram fluidas ("the
assistant does the work", "act on signals — don't just comment", Class R sem gate). A fricção vinha do
**enquadramento das skills de entrada**:

1. **CLI como interface do operador (R4):** `/iniciar-pentest` e `/investigar` lideravam com blocos
   `node tools/.../cli.mjs` sem marcá-los como internos → o agente os repassava e pedia que o operador os rodasse.
2. **"Pare e peça" em vez de resolver pelo contexto (R3):** `sem seleção → pare e peça /usar-engagement`, sem
   instruir a **consultar** engagement/scope/manifesto/modo/estado antes de perguntar.
3. **Copilot descrito como consultivo (R6):** "conduza até hipótese/preparação/**recomendação**" e "não
   proponha ops ativas" — lido como "pare na recomendação", tornando o Copilot passivo.
4. Faltava um **contrato único** de experiência operacional; a intenção estava dispersa e não referenciada pelo
   caminho de entrada.

Não eram problemas de integração nem bloqueios técnicos — eram instruções de UX.

## 2. Arquivos modificados (mínimos, justificados)

| Arquivo | Mudança |
|---|---|
| `references/operational-fluidity.md` | **NOVO** — contrato único R3/R4/R6: consultar-antes-de-perguntar, taxonomia A/B/C/D (elimina D), skills-first/CLI-interno, Copilot=execução assistida, execução/continuidade/persistência, Preflight opcionais. DRY. |
| `.claude/skills/iniciar-pentest/SKILL.md` | CLI marcado **interno**; Passo 1 resolve pelo contexto (pára só se não houver engagement); Copilot **executa** Class R; ponteiro de fluidez. |
| `.claude/skills/investigar/SKILL.md` | idem (CLI interno, contexto-primeiro, Copilot executa análise permitida). |
| `.claude/skills/modo/SKILL.md` | Copilot = **execução assistida** (não consultivo); ponteiro de fluidez. |
| `tools/modes/mode.mjs` | `modeEnvelope` ganha campo **descritivo** `posture` (R6) — **nenhuma** flag de permissão muda (todas `false`). |
| `tools/modes/cli.mjs` | `status` imprime `posture`. |
| `SKILL.md` (dispatcher) | Conversation Mode + File Map + Loading Chain referenciam `operational-fluidity.md`. |
| `references/flows-scope.md` | Flow 8 Step 4: executar a 1ª atividade permitida e persistir, não encerrar em anúncio; opcionais do Preflight não bloqueiam. |
| `tools/workspace/test-fluidity.mjs` | **NOVO** — 16 checks determinísticos + 1 NOT RUN documentado. |

**Não alterados:** os 127 corpos da KB, agents, policies, Scope Guard, Approval Gate, Execution Context,
arquitetura de estados, S1. Nenhuma dependência nova. Nenhum segundo Approval Gate.

## 3. Perguntas / interrupções eliminadas (taxonomia A/B/C/D)

- **Eliminado (D):** "posso começar o recon?", "deseja que eu execute?", confirmar preparar o workspace,
  re-perguntar engagement/alvo/modalidade já definidos, re-pedir reescrita de `scope.md` já válido.
- **Reduzido (A):** faltas de informação resolvidas por consulta ao contexto (`active`/`show`/`modo status`/
  `scope.md`/manifesto). Só se pergunta o **impeditivo** restante.
- **Preservado (B/C):** aprovação por ação de Class A (Risk Card), bloqueios técnicos reais (sem capability,
  sem projeto associado, dependência obrigatória ausente) — registrados com precisão.

## 4. Comportamento de execução corrigido

`/iniciar-pentest` (após bootstrap S1): recupera estado → novo vs. retomada → trilha → **primeira atividade
pendente** → verifica capability → **executa** se permitida/disponível → registra resultados → atualiza
documentos → continua. Proibido encerrar em "Pentest iniciado"/"Posso começar?"/"Recomendo…"/"Aguardo
confirmação" sem bloqueio real. Sem capability → **NOT RUN** preciso (sem simulação). Sempre separar
**concluído / em andamento / bloqueado / não executado**. Sem loops autônomos/background.

## 5. Contrato do Copilot operacional

Copilot = **execução assistida**: quando o operador pede, executa o trabalho **permitido** (Class R —
leitura de HTTP History, correlação, hipótese, preparação, análise, atualização de documentos, Investigation
Records) e persiste; **não** inicia Class A espontaneamente (vai pelo Approval Gate). O envelope
(`modeEnvelope('copilot').posture`) expressa isso, mas **nenhuma** permissão muda. Autopilot: inalterado (S3).

## 6. Integração com os documentos de trabalho

O contrato mapeia a persistência a `session.md`, `toDoList.md`, `ccSurface.md`, `ccLeads.md`, `ccNotes.md`,
`ccLog.md`, Investigation Records e evidências — **conforme os flows** (não tudo em todo documento), sem
evidência fictícia, sem duplicação em retomadas, preservando os contratos de `references/template-files.md`.

## 7. Testes e resultados

`tools/workspace/test-fluidity.mjs` — **16/16** determinísticos (offline, sem LLM):
info já existente é resolvível (não re-perguntar) · nome≠hostname não bloqueia · D eliminado + Class R sem gate ·
Approval Gate recusa Class A não aprovada e não cruza operações · opcionais nunca BLOQUEIAM · bootstrap antes da
etapa técnica · continuidade (sem anúncio) · Copilot=execução assistida concede nada · sem capability→NOT RUN ·
persistência mapeada · tarefas preservadas · retomada idempotente · skills tratam CLI como interno · isolamento
de modo entre engagements · nenhuma op sensível com aprovação implícita. Regressões: `test-bootstrap` 18/18,
`test-skills`, `test-engagement`, `test-multi-engagement`, `test-modes`, `test-preflight`, suíte web-runtime
verde; Validador **127/127**.

## 8. Matriz de situação

| Item | Situação | Evidência |
|---|---|---|
| Contrato de fluidez (R3/R4/R6) | **IMPLEMENTED · TESTED OFFLINE** | `operational-fluidity.md` + skills/flows + `test-fluidity.mjs` 16/16 |
| Invariantes de segurança (gate/modo/isolamento) | **TESTED OFFLINE** | envelope all-false; `_approved` recusa; isolamento de modo |
| Preflight opcionais não bloqueiam | **TESTED OFFLINE** | required/optional disjuntos; `core-lab` nunca BLOCKED com deps obrigatórias |
| Fluidez agêntica viva (o LLM deixa de perguntar e executa?) | **NOT RUN** | exige Claude Code — ver §Smoke |

## 9. Limitações restantes

- Os testes comprovam o **contrato** e os **invariantes**, não o comportamento do LLM em sessão real.
- **R5** (descoberta real de `/modo`) e **R7** (encadeamento Autopilot) ficam para **S3**.
- Validação ponta a ponta no Claude Code/Omarchy/Caido é **S4** (critério transversal).

## 10. Backlog R1–R7

R1 ✅ S1 · R2 ✅ S1 · **R3 ✅ S2** (contrato+testes; agêntico vivo NOT RUN) · **R4 ✅ S2** (CLI interno;
skills-first; agêntico vivo NOT RUN) · R5 ⏳ S3 · **R6 ✅ S2** (Copilot=execução assistida; agêntico vivo
NOT RUN) · R7 ⏳ S3 · validação ponta a ponta ⏳ S4. Ver [38](38-stabilization-backlog.md).

## Smoke — teste de aceitação mínimo no Claude Code (NOT RUN nesta rodada)

Sessão nova no Claude Code/Omarchy, engagement de **laboratório** autorizado:

1. `/criar-engagement` nome `lab`; informe o escopo em linguagem natural (um alvo de lab).
2. `/usar-engagement lab` → `/iniciar-pentest`.
   - **Esperado:** o agente **não** pergunta de novo engagement/alvo/modalidade; **não** imprime comandos Node
     como passo do operador; roda o bootstrap e **segue** para a primeira atividade permitida (ex.: mapear a
     superfície a partir de dados já disponíveis), persistindo em `ccSurface.md`/`ccLog.md` — **não** encerra em
     "Pentest iniciado. Posso começar?".
3. Pedir uma análise permitida ("analise o HTTP History do Caido para este endpoint").
   - **Esperado (Copilot):** executa a leitura/correlação e grava um Investigation Record; **não** dispara
     Replay/Finding sozinho.
4. Pedir uma ação Class A ("faça replay deste request").
   - **Esperado:** Risk Card + pedido de **aprovação por ação** (B preservado); sem aprovação → não executa.
5. Com um opcional ausente (ex.: sem extensão MCP), confirmar que a atividade cujas deps obrigatórias existem
   **prossegue** (Preflight DEGRADED não bloqueia).

Registrar PASS/FAIL por item com evidência sanitizada. **Não** executar ops ofensivas reais nem consumir LLM
pago fora deste aceite supervisionado.
