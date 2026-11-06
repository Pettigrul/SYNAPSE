---
name: investigar
description: >
  Investigação técnica PONTUAL de um comportamento, endpoint, hipótese ou recomendação específicos — produz um
  Investigation Record, reutilizando o fluxo supervisionado e, quando aplicável, o Caido. Use quando o operador
  pedir para investigar algo específico — "investigar este endpoint", "analise esta hipótese", "checar este
  request do Caido", "/investigar", "investigate this". NÃO inicia um pentest completo nem executa ops ativas
  sem os gates existentes.
---

# Investigar (investigação técnica pontual)

Interface **fina** que reutiliza o mecanismo **já existente** — **não** há novo orquestrador. Uma investigação
é a análise de **um** comportamento/endpoint/hipótese/recomendação e termina num **Investigation Record**
(contrato em `references/flows-agents.md`). Quando envolve tráfego real, usa o Caido pelo fluxo supervisionado
`references/flows-caido-investigation.md`.

**Fluidez operacional (`references/operational-fluidity.md`):** linguagem natural com o operador; os comandos
`node tools/.../cli.mjs` são **internos** (o agente executa, não os repassa). **Consulte o contexto antes de
perguntar**; **execute** a análise permitida em vez de só anunciar.

Passo 1 — resolver o engagement ativo e o **modo** da sessão **pelo contexto** (internamente). Só pare se de
fato **não houver** engagement selecionado (peça `/usar-engagement`):

```bash
node tools/workspace/cli.mjs active
node tools/modes/cli.mjs status
```

**Respeite o modo (`/modo`):** em **copilot** (padrão), **execute** a investigação permitida que o operador
pediu — leitura de HTTP History, correlação, hipótese, preparação, análise, registro (Class R) — persistindo o
Investigation Record, em vez de parar na recomendação; **não** proponha nem inicie ops ativas (Class A) por
conta própria — só o que o operador pedir explicitamente, sempre sob o Approval Gate. Em **autopilot
supervisionado**, você pode planejar e **propor**
os passos da investigação, mas **toda** ação Class A continua exigindo aprovação. Nenhum modo concede
capability nova nem acesso Whitebox automático.

**Antes do Passo 2, confira suas ferramentas.** Sem `securityauditor_invoke` (hoje, no Antigravity e sem o adapter
carregado no Pi), este fluxo **não** está protegido pela Bridge: nenhum Scope Guard, Approval Gate, limite ou
proveniência se aplica ao que você fizer. Diga isso ao operador, não afirme essa proteção, não produza um Investigation
Record como se viesse do Bridge e limite-se à análise do material já disponível. Comandos de shell ou
`tools/web-runtime/adapters/cli.mjs` não substituem as operações com estado desse fluxo.

Passo 2 — conduzir a investigação pelo **mecanismo normal do agente** (dispatcher + `securityauditor_invoke`),
seguindo `references/flows-caido-investigation.md`: hipótese → preparação (`investigation.start/propose`) →
execução **sob aprovação** → captura de evidência → **Investigation Record** (`investigation.finalize`).

- **Escopo pontual.** NÃO inicie reconhecimento amplo nem o ciclo completo de pentest — para isso use
  `/iniciar-pentest`.
- **Sem ops ativas espontâneas.** `caido.replay.run`, criação de findings e qualquer op ativa só com o
  **Approval Gate** do Execution Context (operador) — nunca por decisão do prompt. O Bridge recusa fora de
  escopo/projeto/aprovação.
- Projeto Caido vem do **manifesto** do engagement ativo; evidências ficam confinadas em `<engagement>/evidence`.
- A conclusão de uma investigação é um **Investigation Record**, não um Finding nem um Relatório (cap. 17 §17.9).
