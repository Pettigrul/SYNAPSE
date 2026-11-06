# SYNAPSE — Guia Operacional (Onboarding)

> **Documentação apenas (P4).** Não introduz comandos, skills, scripts, adapters, diretórios ou convenções
> novos — apenas consolida o uso dos mecanismos **já implementados** (P1/P2/P3 + H2b/H2c/H2d). Para o
> operador instalar, configurar, ativar e usar o harness **sem** precisar conhecer os comandos Node internos.
> O **Engineering Handbook** (cap. 1–19) continua sendo a referência técnica; este guia referencia-o.

## Por onde começar

| Guia | Para quê |
|------|----------|
| [Quickstart](quickstart.md) | Primeira utilização ponta-a-ponta (15 passos) |
| [Configuração](configuration.md) | `.env`, diretórios e persistência, precedência |
| [Engagements & Runtimes](runtimes.md) | Layouts A/B/C e matriz de portabilidade (Claude Code/Pi/Antigravity, Linux/Windows) |
| [Catálogo de skills](skills-catalog.md) | Cada skill: finalidade, pré-requisitos, exemplos, o que executa, limitações, risco |
| [Modos operacionais](modes.md) | Copilot × Autopilot supervisionado |
| [Caido](caido.md) | URL/GraphQL, token, descobrir UUID, associar, diagnosticar |
| [Readiness / MVP](readiness.md) | Situação real de cada componente (IMPLEMENTED/TESTED OFFLINE/VALIDATED REAL/NOT RUN/BLOCKED/PLANNED) |
| [Troubleshooting](troubleshooting.md) | Erros comuns e ação corretiva |

## Mapa para a referência técnica (não duplicar)

- Workspace/engagements → [cap. 8](../08-pentest-engagement-workspace.md), [cap. 16](../16-multi-engagement-and-caido-onboarding.md)
- Skills operacionais / consolidação P1 → [cap. 17](../17-operational-skills-and-engagement-ux.md)
- Ativação local P2 → [cap. 18](../18-project-scoped-activation.md)
- Modos P3 → [cap. 19](../19-operational-modes.md)
- Doctor/Preflight → [cap. 15](../15-windows-bootstrap-preflight.md)
- Caido (conectividade/monitor/copilot/ativo/investigação/workflow) → [cap. 9](../09-caido-connectivity.md)–[14](../14-caido-workflow-intelligence.md)
- Capability Bridge / Scope Guard / evidências → [cap. 3](../03-capability-bridge-and-adapters.md), [cap. 5](../05-security-evidence-errors.md)

## Princípios que o operador precisa reter

1. **Instalação central única.** O harness não é duplicado por pentest; nada é instalado globalmente
   (`~/.claude`, `~/.pi`, `~/.gemini`).
2. **Seleção explícita.** O engagement ativo nunca é adivinhado; o projeto Caido vem do **manifesto** do
   engagement selecionado.
3. **Autorização ≠ configuração ≠ modo.** Ter `.env`, selecionar engagement ou escolher Autopilot **não**
   autoriza testar alvo algum — toda ação Class A passa por Scope Guard + capabilities + Approval Gate.
4. **Honestidade.** Onde algo é só contrato/arquivo (não validado em runtime real), este guia diz **NOT RUN**
   ou **BLOCKED**.

## Lacunas conhecidas (ver [readiness.md](readiness.md))

- **Autopilot real ponta-a-ponta:** NOT RUN (sem campanha com LLM nesta fase).
- **Pi / Antigravity:** só contrato/arquivos — **não homologados** em runtime.
- **Reconhecimento ao vivo das skills** pela app Claude Code: NOT RUN (validado só na camada de arquivos).
- **Windows corporativo sem symlink:** ativação local (P2) limitada — ver [runtimes.md](runtimes.md).
- **Workflows nativos Caido (F5b):** pós-MVP/V2.
