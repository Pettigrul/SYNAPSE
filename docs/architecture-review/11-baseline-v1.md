# 11 — Baseline V1 e Plano Exato de Migração H0

> **Fase 0.1 executada em modo somente leitura.** O Validador V1 foi criado e rodado sobre o estado atual do HackBot. **Nenhum arquivo operacional foi movido, renomeado, criado ou alterado** — o único conteúdo novo está em `docs/architecture-review/baseline/` (validador + manifesto + relatório), território de documentação.
> Este documento apresenta: (1) a baseline apurada, (2) os checks aprovados, (3) as limitações, (4) o contrato de equivalência, (5) o plano exato de H0 **com rollback**. **Não houve avanço para o H0.** Ao final, solicito aprovação específica.

---

## 1. Artefatos produzidos (todos read-only quanto ao HackBot)

| Arquivo | Função |
|---------|--------|
| `docs/architecture-review/baseline/validate_v1.py` | Validador V1 — Python stdlib puro, portável Win/Linux, zero dependência nova, sem binários. Não escreve nada fora de `baseline/`. |
| `docs/architecture-review/baseline/manifest.json` | Manifesto: hashes, ids, caminhos, campos, métricas e **conjunto de equivalência**. |
| `docs/architecture-review/baseline/baseline-report.md` | Relatório legível gerado automaticamente. |

Reexecução: `python3 docs/architecture-review/baseline/validate_v1.py` (de qualquer diretório; infere a raiz). Aceita `--root` e `--json-only`.

---

## 2. Baseline apurada (número REAL, não estimativa)

- **Total de entradas de conhecimento: 127** — não "~120".
  - **112 técnicas `T[N]`** (catálogos de ataque/revisão).
  - **15 blueprints `B[N]`** (forge — especificações para *construir* ferramentas nativas).
- **15 catálogos** com técnicas (sob `agents/`), carregados por `## Index` + progressive disclosure.
- **45 arquivos `.md`** inventariados (agents + references + reports + intake + SKILL.md + README.md), cada um com `sha256`, bytes e linhas no manifesto.
- **Âncoras de integridade (contrato de equivalência):**

| Âncora | Valor |
|--------|-------|
| `technique_count` | **127** (T=112, B=15) |
| `baseline_aggregate_sha256` | `5f6fa7686f271d79a5db54c96baede1bd6fc5e98aaf543700420d69559046522` |
| `routing_graph_sha256` | `9665c9091efef96dd46c70bfac5eb206e5adf3100a1c0ffcde745df177642a2a` |
| policy `authorization-gate` | `042e73fa20195753eeb745a945d72992471916bcdd177eba8e1c10f6d1fb316d` |
| policy `verification-contract` | `3c6ec9dd3a51f1336aefc455fbf2808647d34ef835720faaecd2f1a3feee2efa` |
| policy `native-tooling-doctrine` | `069522e00def2484a333d62c1d17a21ecf5156b5452ec302f3766ebee17cbebe` |

> O `baseline_aggregate_sha256` é o sha256 do mapa `{uid_da_técnica → sha256_do_corpo}` ordenado. Qualquer alteração de **um byte** em **qualquer** corpo de técnica muda esse hash. É o critério central de perda-zero.

---

## 3. Verificações aprovadas (conteúdo, estrutura e comportamento)

| Check | Status | O que prova |
|-------|--------|-------------|
| **C1 — Inventário** | OK | 45 arquivos `.md` catalogados com hash/bytes/linhas. |
| **C2 — Técnicas** | OK | 127 entradas reais extraídas por heading `### T\|B[N]:`, com corpo delimitado e hash por técnica. |
| **C3 — Contrato de campos** | OK | 127 entradas verificadas contra `template-technique.md` (técnica) e contra o schema do forge (blueprint). **0 avisos reais**; 28 observações de formato (ver §4). |
| **C4 — Index ↔ Techniques** | OK | Progressive disclosure íntegro: toda técnica no corpo está no `## Index` e vice-versa (cross-refs tolerados). 0 divergências em 15 catálogos. |
| **C5 — Roteamento** | OK | `pattern-index.md`: 18 alvos roteados, **0 quebrados**, **0 catálogos órfãos** (todo catálogo com técnicas é alcançável por keyword). |
| **C6 — Links/cross-refs** | OK | 0 links internos quebrados; 0 cross-refs `→ arquivo#id` apontando para alvo inexistente. |
| **C7 — Policies imutáveis** | OK | Os 3 docs presentes; marcadores `SECAUDIT_SAFETY_GATE_v1` e `SECAUDIT_VERIFICATION_CONTRACT_v1` presentes; `Rule 0` presente; hashes registrados como âncora. |
| **C8 — Brief dos agentes efêmeros (Flows 9/12)** | OK | As 8 seções obrigatórias do brief presentes **e na ordem canônica** (Objective → … → Return contract). |
| **C9 — Comportamento** | OK | 0 Tiers fora do vocabulário `{0-native,1-python,1-go,1-node}`; vocabulário de 17 tokens de "banned tools" catalogado para o lint anti-regressão do H0. |

**Status geral: OK.**

---

## 4. Observações de formato (não são defeitos — são a baseline real)

O V1 registra 28 observações `INFO`. Nenhuma é erro; todas descrevem o estado atual, que a migração deve **preservar como está**:

1. **25 técnicas Tier-0 payload-driven** (ex.: `lolbins T1`, `chaos T1`) embutem o procedimento no bloco `Payload:` em vez de um campo `Steps:` rotulado. É convenção pré-existente da base, não lacuna. O corpo é preservado byte-a-byte.
2. **3 blueprints-ponteiro do forge** (`B2` Content buster, `B6` Raw-socket smuggler, `B9` SQLi extractor) delegam explicitamente a uma técnica de outro catálogo ("the script IS the forge blueprint") — **dedup intencional**, alinhado ao princípio de não-duplicação do enunciado.

> Decisão: V1 **não "corrige"** nada disso. Se no futuro se quiser normalizar o campo `Steps`, é uma tarefa separada, fora do H0, e também sujeita a aprovação.

---

## 5. Limitações do V1 (o que esta baseline NÃO prova)

Honestidade sobre o alcance — *documentação não é comprovação de ambiente*:

- **Não prova compatibilidade no Windows corporativo real.** O V1 rodou no host de desenvolvimento (Linux, Python 3.14). A carga da skill por um runtime (Pi/Claude/Antigravity) e a instalação/execução de qualquer componente externo continuam dependendo do **teste de aceitação Fase 0.2/0.3** (doc 10), ainda não executado.
- **Não valida semântica ofensiva.** V1 checa estrutura, integridade e contratos — não julga se uma técnica "funciona" num alvo. Nenhum pentest foi executado (e não deve ser nesta fase).
- **Checks heurísticos.** O lint de "banned-tool em Payload" (C9) cataloga tokens mas ainda não cruza contra cada Payload; é insumo para o H0, não veredito. A detecção de blueprint-ponteiro e de "Steps embutido" é textual.
- **Equivalência = igualdade de corpo, não de endereçamento.** O H0 muda caminhos (`agents/`→`skills/`); os hashes de **corpo** não mudam, mas os **caminhos** (parte do `uid`) mudam. Por isso a verificação de equivalência do H0 compara o **conjunto de hashes de corpo** e a **contagem**, remapeando `uid` de origem→destino (ver §6).
- **Sem histórico git.** O diretório não é repositório git; o rollback do H0 não pode depender de `git revert` — é por isso que o plano abaixo usa cópia-não-destrutiva.

---

## 6. Critérios de equivalência (contrato objetivo para liberar o H0)

Após a migração H0, reexecutar o V1 sobre `skills/` e exigir **todos**:

1. **Perda-zero de corpo:** o conjunto `{sha256_do_corpo}` das 127 entradas em `skills/` é **idêntico** ao conjunto baseline (`baseline_aggregate_sha256` recalculado sobre o novo mapeamento de uids = mesmo multiset de hashes de corpo). Diferença de um único hash ⇒ bloqueio.
2. **Contagem idêntica:** `technique_count == 127` (T=112, B=15). Nem perda, nem duplicação.
3. **Policies inalteradas:** os 3 `policy_hashes` **idênticos** aos da baseline (marcadores + Rule 0 intactos).
4. **Estrutura verde:** C4 (disclosure), C5 (roteamento), C6 (links), C8 (brief) todos `OK` na árvore nova.
5. **Sem regressão de comportamento:** C9 sem Tier inválido; lint de banned-tool sem nova violação.

Falha em **qualquer** item = **não promover**; executar rollback (§7.4).

---

## 7. Plano EXATO de migração H0 (para aprovação — ainda não executado)

> Princípio de segurança do plano: **cópia aditiva, nunca movimento destrutivo**, até a validação passar. `agents/` permanece intacto durante todo o H0; só é aposentado (para `8-Archive/`, nunca deletado) no último passo, e somente com todos os critérios §6 verdes.

### 7.1 Pré-condições
- Aprovação específica desta migração (D1 pleno).
- Baseline V1 `OK` registrada (este documento). ✅
- Teste de aceitação Fase 0.2 (carga de skill por ao menos um runtime) — **recomendado antes**, para não migrar às cegas.

### 7.2 Passos (ordem obrigatória; cada um reversível)

| # | Ação | Natureza | Verificação |
|---|------|----------|-------------|
| H0.1 | Criar `skills/`, `policies/`, `workflows/`, `tools/`, `adapters/` **por cópia** a partir de `agents/`/`references/`. `agents/` **não é tocado**. | Aditiva | Estrutura existe; `agents/` com hash inalterado (comparar ao manifesto). |
| H0.2 | Copiar os 3 docs imutáveis para `policies/` preservando marcadores e `Rule 0`. | Aditiva | `policy_hashes` de `policies/` == baseline. |
| H0.3 | Converter cada `agents/<cat>/<f>.md` → `skills/<cat>/SKILL.md` (+ `references/` quando o catálogo tiver subarquivos), **movendo os corpos de técnica byte-a-byte** e só reescrevendo frontmatter/navegação. | Transformadora (sem tocar corpo) | V1 em `skills/`: multiset de hashes de corpo == baseline. |
| H0.4 | Reescrever `SKILL.md` como roteador magro apontando para `skills/`/`workflows/`. | Transformadora | C5 verde: todo trigger resolve para uma skill existente. |
| H0.5 | Atualizar `pattern-index` keyword→skill. | Transformadora | C5/C6 verdes na árvore nova. |
| H0.6 | Criar adaptadores finos (`adapters/claude-code.md`, `pi-agent.md`, `antigravity.md`) que **apontam** para `skills/` (sem copiar conhecimento). | Aditiva | Cada adapter referencia `skills/`; zero duplicação de corpo. |
| H0.7 | Rodar V1 sobre `skills/` + conferir §6 (1–5). | Validação | Todos os critérios de equivalência verdes. |
| H0.8 | **Só então** aposentar `agents/` → `8-Archive/agents-pre-H0/` (mover, nunca deletar; política never-delete). | Finalização | Árvore nova é a fonte; original arquivada e recuperável. |

### 7.3 Garantias de compatibilidade corporativa no H0
- Tudo permanece Markdown; **nenhum binário, dependência ou serviço novo**.
- Validador em Python stdlib (runtime de dev); não entra no pacote operacional do HackBot.
- Adaptadores são arquivos de texto; nenhuma exigência de Docker/WSL/admin.

### 7.4 Rollback (explícito, sem git)
- **Durante H0.1–H0.7:** rollback = **apagar as pastas novas** (`skills/`, `policies/`, `workflows/`, `tools/`, `adapters/`) e o `SKILL.md`/`pattern-index` novos. `agents/` e os originais nunca foram tocados ⇒ o sistema volta ao estado da baseline **sem perda**. Confirmar com V1: hashes de `agents/` == manifesto.
- **Após H0.8 (já arquivado):** rollback = **mover de volta** `8-Archive/agents-pre-H0/` → `agents/` e restaurar `SKILL.md`/`pattern-index` originais (que H0.8 também arquiva antes de sobrescrever). Reexecutar V1 e exigir `baseline_aggregate_sha256` == valor deste documento.
- **Gatilho de rollback:** qualquer critério §6 vermelho, ou qualquer hash de corpo divergente, ou qualquer policy com marcador/Rule 0 ausente.

---

## 8. Roadmap — H1a (Browser Runtime) mantido explícito

Conforme solicitado, o **Browser Runtime (H1a)** permanece no roadmap como capability de valor **independente** de qualquer integração futura com Caido:

- **H1a — Browser Runtime** (capability (4) do doc 07): navegação/render para prova *grounded* (XSS, fluxo autenticado, DOM/console/screenshot). MVP via MCP opcional (`chrome-devtools`/`firecrawl`) **com fallback nativo** (`Invoke-WebRequest`/JS-pull) quando o MCP não estiver disponível no ambiente. **Não depende de Caido.**
- A eventual integração Caido (H2) turbina HTTP/sessão/IDOR/race — o Browser Runtime **não** está acoplado a ela e segue seu próprio gate de necessidade + teste de aceitação de MCP.

(Registrar também no doc 08 §3/§4 como linha H1a autônoma.)

---

## 9. Encerramento — aprovação específica solicitada

A Fase 0.1 está concluída: **baseline real de 127 entradas, todos os checks OK, limitações declaradas, contrato de equivalência e plano de H0 com rollback definidos.** Nada do HackBot foi modificado.

**Não avancei para o H0.** Para prosseguir, preciso de aprovação específica de uma das opções:

- **(A)** Autorizar o **teste de aceitação Fase 0.2** (carregar a skill num runtime real) antes do H0 — recomendado.
- **(B)** Autorizar o **H0.1–H0.7** (migração por cópia aditiva + validação), **parando antes do H0.8** (arquivamento) para eu apresentar o diff de equivalência e você decidir o arquivamento.
- **(C)** Autorizar o H0 completo (H0.1–H0.8) de uma vez, com rollback conforme §7.4.
- **(D)** Ajustar o plano/critérios antes de qualquer execução.
