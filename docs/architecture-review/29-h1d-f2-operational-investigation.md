# 29 — H1d-F2: Operational Investigation Integration (Relatório de Aceitação)

> Conecta as capacidades de `tools/web-runtime/` ao **dispatcher, às skills e aos agentes efêmeros**
> do HackBot e demonstra um **ciclo de investigação real** (intake → seleção de técnica pela KB →
> capacidade via Capability Bridge → veredicto do validador → registro correlacionado), **sem novo
> framework de orquestração**. Reusa integralmente dispatcher, Knowledge Router/pattern-index, skills
> T[N]/B[N], Flows 9/12, Capability Bridge, Pi Adapter, Browser Runtime, Session Manager, Authorization
> Matrix, Concurrent Executor, Race Validator e o sistema de evidências. **127 corpos intactos;
> `skills/` e `agents/` (17) não modificados; policies imutáveis preservadas; nenhuma dependência nova.**

## 1. O que mudou (mínimo, aditivo)

| Arquivo | Mudança | Natureza |
|---------|---------|----------|
| `references/flows-agents.md` | Nova seção **`## Capability request`** no dispatch brief (antes de Verification contract — ordem canônica preservada) + bullet **`## Investigation record`** no Return contract + nota de "capability-backed investigations" no Flow 9. | Flow (não é corpo técnico). |
| `SKILL.md` | 1 linha no **File Map** (`tools/web-runtime/` via Capability Bridge) + nota **"Web Runtime capabilities"** na seção Tooling (ao lado da nota MCP). | Dispatcher (não é corpo técnico). |
| `references/pattern-index.md` | 1 linha de keyword **race/TOCTOU → `code-review` (T10) + Race Validator** (o router não tinha rota para race — lacuna real fechada). | Router (não é corpo técnico). |
| `tools/web-runtime/` | `fixtures/investigation-lab.mjs`, `test-investigation.mjs`, script `test:investigation`. | Testes/fixtures. |

**Não** houve segundo formato de brief; **não** se tocou nenhum dos 127 corpos (`skills/<cat>` técnicas, `agents/`); **não** se criou scheduler/motor multiagente/DB/framework de agentes. Validador V1 = **127/127**.

## 2. Ponto mínimo de integração ao dispatcher

O dispatcher entrega ferramentas ao agente **só pelo dispatch brief**. O ponto mínimo é, portanto, o
**brief**: a seção `## Capability request` declara, com os **identificadores existentes**,
`investigationId` · `techniqueId` · `hypothesisId` · `experimentId` · `requiredCapabilities` ·
`sessionIds`/`resourceIds` · evidências esperadas · critérios de validação. O agente emite
`securityauditor_invoke`; o resultado estruturado (envelope do bridge, com a `classification` do
validador) volta no `## Investigation record` e é **re-verificado pelo coordenador** antes de virar
`ccLeads`/`ccGadgets` — exatamente o mecanismo de evidências já existente.

## 3. Contrato de investigação e correlação

Reaproveita ids existentes (`experimentId`, `principalId`/`sessionId`/`contextId`/`resourceId`,
`requestId`) e acrescenta **somente** a correlação nova: `investigationId`, `techniqueId`,
`hypothesisId`. Tipos em `contracts.d.ts` (`InvestigationRequest`/`InvestigationResult` como wrappers,
H1d-F1). A `classification` é **copiada do validador** (AuthZ/Race) — o dispatcher **não** transforma
`inconclusivo`/`anomalia` em `violação confirmada` sem evidência adicional (provas: NEG6, CASE A own,
preservação no envelope). Segredos/corpos sensíveis nunca entram em brief/resposta/relatório (NEG10).

## 4. Autorização (inalterada e reforçada)

O agente **não se autoriza**. O **Execution Context confiável** (escopo, capacidades, aprovações por-
ação) é do adaptador/operador. O dispatcher pode **solicitar** uma operação, mas **não** amplia escopo,
habilita alteração de estado nem cria aprovações (prova: **NEG3** — params `authorizedStateChange`/
`scope` do agente são ignorados). Todas as operações permanecem sujeitas às policies (Scope Guard/Rule
0/Rule 6) já implementadas.

## 5. Testes end-to-end (3 investigações sintéticas — caminho operacional real)

`test-investigation.mjs` roteia pelo **`references/pattern-index.md` real** e seleciona a técnica
**lendo o `skills/<cat>/SKILL.md`** (nunca injetando o id). **13/13 PASS, `evilHits=0`.**

| Caso | Intake (sem o id) | Rota → Técnica (da KB) | Capacidade | Resultado (do validador) |
|------|-------------------|------------------------|------------|--------------------------|
| **A — IDOR/BOLA** | "horizontal escalation … /api/orders/2" | web-testing → **T5** | Authorization Matrix (sessões independentes) | **violacao-confirmada** (200 + evidência de posse + regra); sub-caso próprio = `conforme` |
| **B — Race** | "double spend … concurrency limit" | code-review → **T10** | Concurrent + Race Validator | **violacao-observada** (couponUses=2) |
| **C — Visual (sem vuln)** | "web recon do SPA … explorável?" | web-inventory → **T2** | Browser Runtime | **sem-achado** (DOM explorado; nenhum achado inventado) |

A seleção é **justificada pela KB efetivamente consultada** (o teste lê e cita a linha do T[N]; o
intake não contém o id — asserção explícita). Registros correlacionados emitidos para os três casos.

**Validação agêntica (dirigida por LLM) — BLOCKED.** Não há modelo/cota para execução agêntica neste
ambiente e uma sessão Pi autenticada e cobrada está fora do escopo de F1/F2. Conforme a autorização,
os testes determinísticos foram **separados** e a validação agêntica está **marcada BLOCKED** — **o
comportamento do agente NÃO foi simulado como execução real**. O caminho operacional (router + KB +
bridge + validadores + correlação) está provado deterministicamente; falta apenas o turno dirigido por
LLM, que depende de provisionamento de modelo/cota (pendência §8).

## 6. Testes negativos (§7) — 10/10 PASS

Capacidade não autorizada (NEG1) · Scope Guard, evil intocado (NEG2) · tentativa do agente de ampliar
autorização (NEG3) · sessão inexistente/encerrada (NEG4) · referência inválida a técnica → sem chamada
de capacidade (NEG5) · ausência de política esperada → `inconclusivo` (NEG6) · resultado inconclusivo
de race (NEG7) · falha do navegador (NEG8) · cancelamento (NEG9) · sanitização de evidências (NEG10).

## 7. Regressão (§8)

F1 **19** · F2 mock **16** · F2 e2e **11** · H1b-F1 **15** · H1b-F2 **18** · H1c-F1 **18** · H1c-F2
**20** · bridge **15** · Pi **7** · **investigation 13** · **Validador V1 127/127** (T=112, B=15).
`skills/` e `agents/` (17) **não modificados**; policies (3) e deps (`playwright-core 1.64.1`)
inalterados. Mudanças apenas em dispatcher/router + `tools/web-runtime/` + docs (+ `manifest-h0.json`).

## 8. Limitações por runtime e pendências de integração

- **Pi:** registro + execução + o ciclo operacional validados deterministicamente (F1 + F2). **Pendente:**
  turno agêntico dirigido por LLM end-to-end (model/cota/provider + sessão); provisionar o
  `SECAUDIT_BRIDGE_CONTEXTS` no fluxo do operador; `pi install` da entrada de descoberta.
- **Claude Code:** o bridge é runtime-agnóstico (ESM in-process), mas **não há adaptador nativo** que
  registre `securityauditor_invoke` como ferramenta do Claude Code — **pendência** (hoje o caminho é o
  Pi Adapter ou o bridge in-process). O hook `.claude/` de consulta à KB permanece.
- **Antigravity:** carga e2e **PENDENTE** (runtime indisponível no host de validação); sem adaptador nativo.
- **Herdadas:** cancelamento não interrompe `fetch` em voo; um navegador compartilhado por bridge;
  Windows corporativo não validado (degradação para HTTP).

## 9. Necessidade real de H1d-F3 (relatório unificado)

**Avaliação:** o ciclo já produz um **Investigation Record** correlacionado e sanitizado que mapeia
diretamente para os campos de `ccLeads`/`ccGadgets` e para o pipeline de relatórios existente
(`reports/template.md`, Flows 10/10b). Nos três casos, a evidência (estado autoritativo, shape da
matriz, DOM) e a `classification` do validador já preenchem o que o relatório precisa. **Conclusão:
H1d-F3 NÃO é necessário como item separado agora** — o pipeline atual basta. A única lacuna real é a
**validação agêntica dirigida por LLM** (modelo/cota) e os **adaptadores nativos Claude/Antigravity**,
que são pendências de provisionamento/ambiente, não de relatório. **Não implementei H1d-F3.**

## 10. Entregáveis (checklist)

Integração mínima ao dispatcher ✓ · Extensão compatível dos Flows 9/12 ✓ · Referências no File Map ✓ ·
Contrato de investigação e correlação ✓ · Testes determinísticos (3 casos + 10 negativos) ✓ · Testes
end-to-end agênticos **BLOCKED** (documentado, não simulado) ✓ · Relatório de aceitação (este) ✓ ·
Limitações por runtime ✓ · Pendências Pi/Claude/Antigravity ✓ · Avaliação de H1d-F3 (não necessário) ✓.

## 11. Recomendação

**Recomendo aceitar o H1d-F2.** O ciclo de investigação está conectado ao dispatcher/skills/agentes e
comprovado deterministicamente de ponta a ponta, com autorização e classificadores preservados e sem
regressão. **Não** foram implementados H1d-F3, Caido ou novos backends; `agents/` não arquivado; P3/P4/
P5 não executados. **Aguardando aprovação específica para qualquer próximo incremento** — candidatos:
(a) provisionar modelo/cota para a validação agêntica end-to-end no Pi; (b) adaptador nativo Claude
Code; (c) validação e2e no Antigravity.
