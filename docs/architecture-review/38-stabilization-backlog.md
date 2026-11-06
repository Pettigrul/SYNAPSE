# 38 — Backlog de Estabilização (R1–R7)

> Registro consolidado das reclamações operacionais e do plano de estabilização por sprint. **Uma reclamação
> só é marcada resolvida por mudança de CÓDIGO + teste determinístico**, nunca por alteração meramente
> documental. Fonte de verdade do estado real: as suítes do repo e a [matriz de readiness](../handbook/operator/readiness.md).

## Requisitos

| ID | Reclamação | Sprint | Estado |
|----|------------|--------|--------|
| **R1** | Bootstrap automático (nove diretórios + documentos operacionais) sem comandos manuais | **S1** · **S4** | ✅ **VALIDATED REAL** (S4: criado na engagement real, scope preservado) |
| **R2** | Inicialização e retomada concluídas **antes** do recon | **S1** · **S4** | ✅ **VALIDATED REAL** (S4: 2ª exec idempotente, sem recon) |
| **R3** | Remoção de confirmações redundantes (fricção conversacional) | **S2** · **S4** | ✅ **VALIDATED REAL** (S4: 0 perguntas redundantes no cenário) |
| **R4** | Skills como interface primária (descoberta/entrada) | **S2** · **S4** | ✅ **VALIDATED REAL** (0 comandos Node ao operador; slash confirmado pelo operador) |
| **R5** | Descoberta real de `/modo` | **S3** · **S4** | ✅ **VALIDATED REAL** — operador confirmou `/modo` e `/mode` em sessão nova (era freshness; sem defeito) |
| **R6** | Copilot capaz de executar comandos permitidos | **S2** · **S4** | ✅ **VALIDATED REAL** (S4: leu/analisou/persistiu/apresentou) |
| **R7** | Autopilot capaz de encadear etapas autorizadas | **S3** · **S4** | ✅ **VALIDATED REAL** (S4: 2 transições autônomas + parada no gate) |
| **+** | Validação integrada de Caido, persistência de evidências e execução real no Claude Code | **S4** | ✅ **VALIDATED REAL (read-only)** — conexão/History/paginação/HTTPQL/campos/Scope Guard; persistência/isolamento/gates. Pendência: análise sobre dados reais **in-scope = NOT RUN (NO DATA)** — [41](41-s4-real-acceptance.md) |

## S1 — R1/R2 (esta rodada)

**Causa-raiz:** `initEngagement()` materializava apenas `.engagement.json` + audit log. Os nove diretórios e os
documentos operacionais (`session.md`, `toDoList.md`, os seis `cc*.md`, `.config`, `CLAUDE.md`/`AGENTS.md`)
existiam só como **prosa** no Flow 8 Step 2 / `references/template-files.md`, sem ferramenta determinística —
e `/iniciar-pentest` roteava ao dispatcher sem garantir o bootstrap antes do recon (buckets eram lazy).

**Correção (mínima, dentro das superfícies permitidas — Workspace + skill de entrada + flows + testes):**
- `bootstrapEngagement()` em `tools/workspace/engagement.mjs`: cria **só** o que falta (idempotente,
  self-healing), **nunca sobrescreve**, **não inventa** tarefas/achados, **não toca** manifesto/evidência/estado,
  confina toda escrita dentro do engagement (symlink-safe). Falha controlada em `scope.md` inválido.
- Subcomando `bootstrap` em `tools/workspace/cli.mjs` (resolve o engagement ativo; orientação de retomada).
- `/iniciar-pentest` roda `cli.mjs bootstrap` no **Passo 3**, **antes** do recon (Passo 4 = rotear ao dispatcher).
- Flow 8 Step 2 referencia a ferramenta determinística (dispatcher e skill concordam).
- Endurecimento colateral: `realpathLenient` passa a resolver symlinks de folha (lstat), fechando uma brecha
  em que um symlink pendente escapava do confinamento na escrita.

**Testes:** `tools/workspace/test-bootstrap.mjs` (18/18 — os 18 requisitos da §9) + regressões
(`test-engagement` 16/16, `test-multi-engagement` 31/31, `test-skills` 58/58) + Validador **127/127**.

**Fora do escopo de S1 (intencional):** semeio de tarefas iniciais no `toDoList.md` (do dispatcher/LLM, conforme
o alvo); continuidade agêntica e fricção conversacional (S2). Nada de novas capacidades ofensivas nesta rodada.

## S2 — R3/R4/R6 (concluído)

Fricção operacional corrigida por **instrução** (contrato único `references/operational-fluidity.md` + skills
de entrada + dispatcher + Flow 8) e **invariantes de código testados** (Approval Gate ainda recusa Class A,
modos concedem nada, opcionais do Preflight não bloqueiam, estado isolado por engagement). `modeEnvelope` ganhou
um campo **descritivo** `posture` (R6) sem mudar nenhuma permissão. Testes: `tools/workspace/test-fluidity.mjs`
**16/16** + regressões + Validador 127/127. **Limitação honesta:** o comportamento agêntico **vivo** (o LLM de
fato deixar de perguntar e executar) é **NOT RUN** — smoke de aceitação no Claude Code em [39 §Smoke](39-s2-operational-fluidity.md).
Detalhes: [39](39-s2-operational-fluidity.md).

## S3 — R5/R7 (concluído)

Autopilot **operacional** por contrato de loop (`references/autopilot-loop.md`) reutilizando dispatcher+flows
(sem orquestrador/scheduler/daemon) + seletor determinístico `parseTasks`/`cli.mjs next` sobre o `toDoList.md`
existente. `/modo` reforçado: alias EN `/mode`, fato `claudeSkills` no Doctor, nota de descoberta. Testes:
`test-autopilot.mjs` **13/13** (encadeamento com tools simuladas + gate real) + demonstração em sessão com dados
sintéticos (cadeia objetivo→…→persistência→próxima ação) + regressões + Validador 127/127. **Limites honestos:**
descoberta **viva** de `/modo` e autonomia **hands-off** ponta-a-ponta no Claude Code = **NOT RUN** (smoke em
[40 §Smoke](40-s3-operational-autopilot.md)). Detalhes: [40](40-s3-operational-autopilot.md).

## S4 — Aceitação operacional real (concluído, veredito PARTIAL)

Executada DENTRO de sessões Claude Code (Omarchy), engagement de lab do operador (ENG-B / projeto
Caido `<project-id>` = "Testes harness"). **Zero mudanças de código de produto** (nenhum defeito reproduzível).
Veredito: **PASS (integração e experiência)** com **uma** validação **data-gated (NO DATA)**.

**VALIDATED REAL:** bootstrap/retomada na engagement real (scope preservado, idempotente); Copilot **executa**;
Autopilot **hands-off** com **2 transições autônomas** + parada no Approval Gate; persistência/isolamento/gates;
**descoberta de `/modo`/`/mode`** (confirmada pelo operador em sessão nova — era freshness); **integração Caido
read-only** (3ª passada, projeto aberto): conexão GraphQL (Caido 0.58.3), associação, History (21 requests),
paginação, HTTPQL, campos, e o **Scope Guard retendo 21 registros out-of-scope** (0 vazados).

**NOT RUN (NO DATA):** análise sobre dados reais **in-scope** (leads/Investigation Record com proveniência) — o
History só tem tráfego incidental do navegador, nenhum ao alvo `<in-scope-host>`; a rodada proíbe gerar tráfego.
**Correção de registro:** o "BLOCKED/projects=0" das passadas 1–2 era **falso-negativo** por bug de acessor no
probe descartável (envelope `invoke`) + campo `projects` `@cloud` degradando em instância local — **não** bloqueio
real. Regressões + Validador 127/127. Detalhes/§Smoke: [41](41-s4-real-acceptance.md).

## F8 — Leitura Caido desacoplada do Scope Guard (read-only) — concluído

Autorizado pelo operador após S4-B: a leitura read-only do HTTP History do projeto **associado** passa a retornar
**todos** os registros **anotados** in/out-of-scope (antes retinha os out-of-scope). Mudança mínima no caminho de
leitura (`bridge._inScope` + `caido.history`/`caido.request`; Copilot anota). **Preservado:** isolamento de
projeto (`_caidoAssoc`) e **todas** as operações ativas gated (replay/findings — testado: op ativa out-of-scope
bloqueada mesmo com aprovação). Testes: `test-caido` **21/21** (+10b/10c), `test-caido-copilot` **24/24** +
regressões + Validador 127/127. Leitura real: **21 requests lidos integralmente**. Detalhes:
[42](42-caido-readonly-scope-decouple.md).

## Próximos sprints / pendências abertas

- **Única pendência de validação:** análise sobre **dados reais in-scope** — operador **capturar tráfego
  in-scope** no projeto Caido (ou ajustar escopo) e reexecutar `/investigar` → superfície/leads/Record. Data/
  config-gated, **sem defeito de produto** — [41 §Smoke](41-s4-real-acceptance.md). (O tráfego out-of-scope já é
  legível/analisável desde [42](42-caido-readonly-scope-decouple.md).)
- **H3 — piloto integrado:** só após a análise sobre tráfego de lab real in-scope e confirmação ativa (Replay)
  sob aprovação. Ver [37](37-h2d-f2-omarchy-caido-validation.md).
