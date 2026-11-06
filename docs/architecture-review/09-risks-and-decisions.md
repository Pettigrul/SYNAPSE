# 09 — Riscos e Decisões

> Riscos da migração, alternativas descartadas (com motivo), e as decisões que **exigem aprovação do usuário** antes de qualquer implementação.

---

## 1. Riscos e mitigações

| # | Risco | Prob. | Impacto | Mitigação |
|---|-------|-------|---------|-----------|
| R1 | **Perda semântica de conhecimento** na migração `agents/`→`skills/` | Média | Crítico (ativo #1) | Diff verbatim por `T[N]` + contagem (~120) + checagem de `Tier`/`Why` (doc 05 §5, doc 10 validador). Migração reversível (cópia, não move destrutivo, até validar) |
| R2 | **Quebra do roteamento** (pattern-index ↔ frontmatter ↔ loading chain desalinhados) | Média | Alto | Validador tri-consistente; manter `pattern-index` como fonte de roteamento; teste de resolução keyword→skill |
| R3 | **Enfraquecimento acidental das Execution Policies** ao promovê-las a camada | Baixa | Crítico | Preservar marcadores (`SECAUDIT_*_v1`), Rule 0 e embedding verbatim; teste: brief gerado contém os 3 docs |
| R4 | **Regressão da doutrina native-tooling** (skill reintroduz ferramenta banida) | Média | Alto | Checar `description`/corpo contra `## Banned tools`; lint de "banned-tool em Payload" |
| R5 | **Dependência externa vira pré-requisito** (Caido/MCP/binário) e reprova no corporativo | Média | Alto | Regra de projeto: toda capability com fallback nativo; MVP 100% nativo; teste de aceitação antes do H2 |
| R6 | **Falso senso de compatibilidade** (confiar no README do vendor) | Média | Médio | Teste de aceitação no Windows real (doc 10 Fase 0); documentação ≠ comprovação |
| R7 | **Overengineering** (DB, registry, graph-of-agents) | Baixa (se seguir doc 07 §4) | Médio | Decisões anti-overengineering explícitas; gate de necessidade por capability (doc 08) |
| R8 | **Duplicação de conhecimento entre plataformas** | Baixa | Médio | Adapters apontam para `skills/`, nunca copiam; `CLAUDE.md`/`AGENTS.md` gerados de template |
| R9 | **Licenças copyleft** em componentes externos | Baixa | Médio | caido-mcp-server/VibeHacking são MIT ✅; Ebka GPL-3.0, cyber-harness AGPL-3.0 → evitar embutir; só interoperar via processo separado se necessário |
| R10 | **Supply-chain** de pacotes Pi/npm (executam código no install) | Média | Alto | Aviso da própria pi.dev; revisar fonte antes de instalar; preferir pins exatos (padrão pi-mono); nunca `npm install` de dep de terceiro sem autorização (já é regra Tier-1) |
| R11 | **Segredos vazando para contexto do LLM** (perfis de sessão) | Média | Crítico | Rule 6: perfil guarda referência + modo de renovação, nunca valor; validado por strix #777 (mesma preocupação) |
| R12 | **Esforço de split `web-testing`** maior que o previsto | Baixa | Baixo | Split é opcional ao H0 core; pode ficar para depois sem bloquear portabilidade |

---

## 2. Alternativas descartadas (e por quê)

| Alternativa | Por que foi considerada | Motivo do descarte |
|-------------|-------------------------|--------------------|
| **Adotar strix como base** | Líder de adoção (~73k★), graph-of-agents, Caido embutido | **Docker obrigatório** → reprova no Windows corporativo; arquitetura "autônoma sem freio" conflita com o gate imutável; 541 issues (churn) |
| **Adotar pentagi** | Multiagente maduro, instalador Windows | Docker/Podman + Postgres + stack de observabilidade → footprint incompatível com restrição |
| **Base em PentestPi / pi-subagent** | Construídos sobre Pi | WSL2 / tmux → **incompatíveis** com o ambiente |
| **Introduzir banco de dados (SQLite/Postgres)** para estado | Nebula/pentagi usam | Overengineering: estado file-based (cc*.md) é portável, offline, auditável, versionável. DB não agrega aqui |
| **Motor de orquestração multiagente / graph** | strix/pentagi | Necessidade não demonstrada; MAX_AGENTS=3 + fases sequenciais já cobrem; viola anti-overengineering |
| **Reescrever/resumir a KB** para "modernizar" | Tentação ao reempacotar | Viola Restrição #1; a KB é o ativo. Migração move verbatim |
| **Construir automação de browser própria** | Controle total | Usar MCP quando disponível + fallback nativo é mais barato e compatível; automação própria = manutenção sem necessidade |
| **Cofre de segredos para perfis de sessão** | Conveniência | Rule 6 proíbe armazenar segredo; referência + renovação basta |
| **a-conte/pi-harness como base multi-runtime** | Único que mira multi-runtime | Bun+just reprova no corporativo; conceito de `runner` é útil mas pode ser replicado nos adapters |
| **Ebka-Caido-AI (Claude-native)** | Fluxo OAuth pronto, Claude-native | GPL-3.0 (copyleft) + estagnado ~5 meses; preferir caido-mcp-server MIT ativo |

---

## 3. Decisões que exigem aprovação

> Nenhuma destas foi tomada. São propostas para o usuário decidir antes da implementação.

### D1 — Autorizar a migração H0 (reembalagem)?
Mover `agents/`→`skills/`, promover policies, adaptadores finos. **Risco baixo, reversível, perda-zero verificável.** → *Recomendação: aprovar; é a fundação de tudo e não toca comportamento.*

### D2 — Escopo do split de `web-testing`?
Dividir as 14 técnicas por classe em `references/`? Melhora progressive disclosure, mas é o maior item mecânico. → *Recomendação: fazer, mas pode ser fase separada se houver pressa.*

### D3 — Ordem e gatilho das extensões H1 (Session/AuthZ/Concurrent)?
Construir proativamente ou só quando um engajamento concreto exigir (gate de necessidade)? → *Recomendação: só sob necessidade (anti-overengineering), começando por Session quando surgir engajamento autenticado multi-conta.*

### D4 — Autorizar o teste de aceitação de Caido no Windows corporativo (H2)?
Requer instalar Caido + rodar o binário `caido-mcp-server` no ambiente real. Pode esbarrar em política de instalação/execução de binário e cert CA. → *Recomendação: fazer o teste de aceitação antes de qualquer dependência; se falhar, avaliar VibeHacking (plugin in-Caido) ou ficar no H1 nativo.*

### D5 — Política de licença para componentes externos?
Confirmar que só interoperamos com MIT (caido-mcp-server, VibeHacking) e evitamos embutir GPL/AGPL. → *Recomendação: sim; interoperar por processo separado, nunca fork/embed de copyleft.*

### D6 — Incluir `NETWORK_EGRESS` em scope já no H0?
Pequena extensão para tuning offline. → *Recomendação: incluir (custo trivial) se operação offline for comum.*

---

## 4. Decisões já implícitas na doutrina (não precisam re-aprovação, mas registrar)

- Estado permanece file-based (sem DB).
- Toda capacidade externa é opcional com fallback nativo.
- Execution Policies permanecem imutáveis e embutidas em todo brief.
- Conhecimento nunca é duplicado entre plataformas nem reescrito na migração.
