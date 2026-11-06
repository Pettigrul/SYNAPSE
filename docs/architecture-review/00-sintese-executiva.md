# 00 — Síntese Executiva e Índice

> **Fase:** pesquisa, engenharia reversa, análise e documentação. **Nada foi executado, instalado ou modificado no HackBot.** Só a pasta `docs/architecture-review/` foi criada.
> **Objetivo do estudo:** avaliar a evolução incremental do HackBot (`SecurityAuditor`) para um harness ofensivo avançado, portável entre **Pi Agent** e **Google Antigravity**, preservando integralmente a base de conhecimento e respeitando a restrição corporativa (Windows restrito, sem Docker/WSL2/admin).

---

## 1. Diagnóstico em uma frase

O HackBot **já é, estruturalmente, o harness-alvo**. O gargalo não é capacidade — é **embalagem e nomenclatura**. A migração proposta é majoritariamente **reembalagem de perda-zero**, não construção de sistema novo.

---

## 2. Os quatro achados que sustentam toda a proposta

| # | Achado | Evidência | Consequência |
|---|--------|-----------|--------------|
| A1 | **`agents/` não contém agentes** — são 18 catálogos de conhecimento declarativo (`## Index` + técnicas `T[N]`) carregados por *progressive disclosure*. | Leitura de conteúdo (não de nomes) de `agents/*` e `references/pattern-index.md` (doc 01, 02, 05). | "Quais agentes viram skills?" tem resposta limpa: **todos**, porque nenhum é agente. Os agentes reais são efêmeros, despachados por brief (Flow 9/12) e **permanecem agentes**. |
| A2 | **Portabilidade Pi↔Antigravity sai quase de graça.** | Padrão `SKILL.md`+`references/` é língua franca Claude↔Pi (`baryonlabs/pi-agent-harness`); HackBot já tem arquivo dual `CLAUDE.md`/`AGENTS.md` e contrato runtime-agnóstico (doc 06). | Adaptadores finos sobre uma base única compram portabilidade sem duplicar conhecimento. |
| A3 | **A restrição corporativa já está resolvida no núcleo; o risco está nas ferramentas externas.** | HackBot é 100% Markdown, zero binário/Docker (doc 06 §3). Strix/PentAGI exigem Docker; PentestPi/pi-subagent exigem WSL/tmux — todos reprovam (doc 06 §4). | A doutrina native-tooling (nenhum concorrente a tem) é diferencial real. Toda integração externa entra como **opcional com fallback nativo**. |
| A4 | **IDOR/BOLA e race conditions são lacuna de todo o campo.** | Só `caido-mcp-server` tem suporte multi-principal concreto; a issue Strix #777 ainda *propõe* Session Manager + AuthZ (doc 03, 04 §4). | Janela de diferenciação, não corrida perdida. São as 3 extensões de maior valor (H1). |

---

## 3. Proposta de migração incremental (horizontes)

| Horizonte | O que é | Risco | Depende de |
|-----------|---------|-------|------------|
| **H0 — MVP (reembalagem)** | `agents/`→`skills/` no padrão portável; 3 docs imutáveis promovidos a **Execution Policies**; `SKILL.md` vira roteador magro; adaptadores finos Pi/Antigravity/Claude. **7 dos 10 componentes-alvo já existem** — H0 só os formaliza. | Baixo (reversível, perda-zero verificável) | Aprovação D1 |
| **H1 — Extensões nativas** | Session Manager → Authorization Testing (IDOR/BOLA) → Concurrent (race). Lacunas do campo, 100% nativas, sem Caido. | Médio | Aprovação D3 (sob necessidade) |
| **H2 — Integrações condicionais** | Caido via `caido-mcp-server` turbina HTTP/sessão/IDOR/race — **mesma interface**, só troca o backend. | Médio-alto | Teste de aceitação (Fase 0.3) + D4 |
| **H3 — Futuro** | Tools determinísticas empacotadas, multi-runtime pleno. | Reavaliar | Necessidade medida |

**Caminho crítico:** Fase 0 (aceitação) → Fase 1 (H0). É o que entrega valor (portabilidade + organização) com risco mínimo. H1 nasce nativo e independe de H2; H2 só *turbina* se o ambiente permitir.

---

## 4. Recomendações justificadas (resumo; detalhe nos docs 07–10)

Cada recomendação segue o critério do enunciado — *problema / evidência / solução / benefício / custo / impacto na KB / compat corporativa / validação*. Síntese:

1. **Renomear `agents/`→`skills/` (padrão Agent Skills).** Problema: nome engana e não é portável. Benefício: portabilidade Claude↔Pi quase grátis. Custo: baixo/mecânico. Impacto na KB: **nenhum** — corpos movidos verbatim (Validador V1). Validação: diff byte-a-byte + contagem ~120.
2. **Promover os 3 docs imutáveis a camada `policies/` explícita.** Problema: política diluída em `references/`. Benefício: a espinha de segurança vira passo verificável. Risco: enfraquecimento acidental → mitigado preservando marcadores `SECAUDIT_*_v1` e Rule 0 (Validador V3).
3. **Capabilities (Session/AuthZ/Concurrent) só sob gate de necessidade, sempre com fallback nativo.** Problema: lacuna do campo. Benefício: diferenciação. Custo: médio, diferível. Compat: nativas, não exigem Caido.
4. **Toda integração externa (Caido/MCP) é aceleradora, nunca pré-requisito.** Comprovação exige teste de aceitação no Windows real — *README de vendor ≠ compatibilidade comprovada*.

---

## 5. Alternativas descartadas (e por quê)

- **Strix/PentAGI como base** → Docker obrigatório, incompatível; autonomia-sem-freio conflita com o gate imutável.
- **PentestPi / pi-subagent** → WSL2/tmux, incompatíveis.
- **Banco de dados para estado** → overengineering; o estado file-based (`cc*.md`) é portável, offline e auditável.
- **Motor multiagente / graph-of-agents** → necessidade não demonstrada; MAX_AGENTS=3 + fases sequenciais bastam.
- **Reescrever/resumir a KB** → viola a Restrição #1 (a KB é o ativo).
- **Cofre de segredos** → Rule 6 proíbe armazenar segredo; perfis guardam referência + modo de renovação.

---

## 6. Riscos principais (detalhe no doc 09)

- **R1 — Perda semântica de conhecimento** (crítico) → diff verbatim + contagem, migração reversível.
- **R5 — Dependência externa vira pré-requisito** (alto) → fallback nativo obrigatório; MVP 100% nativo.
- **R6 — Falso senso de compatibilidade** (médio) → teste de aceitação no ambiente real antes de qualquer dependência.
- **R11 — Segredos vazando para o contexto** (crítico) → Rule 6; perfil nunca guarda valor.

---

## 7. Decisões que exigem aprovação (nenhuma foi tomada)

| ID | Decisão | Recomendação |
|----|---------|--------------|
| **D1** | Autorizar a migração H0 (reembalagem) | **Aprovar** — fundação de tudo, reversível, não toca comportamento |
| **D2** | Escopo do split de `web-testing` | Fazer, pode ser fase separada |
| **D3** | Gatilho das extensões H1 | Só sob necessidade (anti-overengineering) |
| **D4** | Autorizar teste de aceitação de Caido no Windows corporativo | Fazer o teste antes de qualquer dependência |
| **D5** | Política de licença (só interoperar MIT) | Sim — nunca embutir GPL/AGPL |
| **D6** | Incluir `NETWORK_EGRESS` em scope já no H0 | Incluir (custo trivial) |

---

## 8. Primeiro passo concreto, se o H0 for aprovado

Rodar **Fase 0.1–0.2** (availability check + carga da skill num runtime) e o **Validador V1 em modo dry-run** sobre `agents/`, para fixar a baseline de ~120 técnicas como meta mensurável de perda-zero — **sem mover nenhum arquivo**.

---

## 9. Índice dos documentos

| Doc | Título | Etapa |
|-----|--------|-------|
| [01](01-current-architecture.md) | Arquitetura atual (5 camadas, acoplamento, deps Windows) | A |
| [02](02-knowledge-inventory.md) | Inventário de conhecimento (4 naturezas, ~120 técnicas, teste de preservação) | A |
| [03](03-reference-research.md) | Pesquisa de referências (perfis dos repos, tags de evidência) | B |
| [04](04-comparative-matrix.md) | Matriz comparativa (dimensões + veredito corporativo) | B |
| [05](05-agent-to-skill-migration.md) | Migração agente→skill (matriz arquivo-a-arquivo, guardrails) | C |
| [06](06-platform-compatibility.md) | Compatibilidade de plataforma e portabilidade | C |
| [07](07-target-architecture.md) | Arquitetura-alvo (10 componentes, contratos, anti-overengineering) | D |
| [08](08-capability-roadmap.md) | Roadmap de capacidades (H0→H3, matriz capacidade×origem×horizonte) | D |
| [09](09-risks-and-decisions.md) | Riscos, alternativas descartadas, decisões D1–D6 | E |
| [10](10-implementation-plan.md) | Plano de implementação (Fase 0→5, validadores V1–V5) | E |

---

## 10. Convenções

- **Tags de evidência:** `[CODE-PROVEN]` (verificado no código do HackBot) · `[DOCUMENTED]` (afirmado por doc/README externo, não re-verificado no ambiente) · `[PROPOSED]` (proposta de design, ainda não existente).
- **Decisão por conteúdo, não por nome:** nenhuma conclusão foi tirada de nome de arquivo/diretório; tudo foi inspecionado.
- **Documentação ≠ comprovação:** afirmações de compatibilidade de vendor não substituem o teste de aceitação no Windows corporativo real (doc 06, doc 10 Fase 0).
