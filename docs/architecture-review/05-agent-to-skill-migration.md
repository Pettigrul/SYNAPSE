# 05 — Avaliação de Migração Agents → Skills (Etapa C)

> **Tese central:** o diretório `agents/` do HackBot é majoritariamente **conhecimento declarativo** carregado por *progressive disclosure* — ou seja, já é um conjunto de skills em tudo menos no nome e na localização. A migração é, em grande parte, **renomear e reembalar**, não reescrever. Os poucos componentes que são *função* (orquestração) permanecem como estão.

---

## 1. Critério de decisão (o que vira o quê)

Aplicado por inspeção de conteúdo, não de nome:

| Se o componente é… | …vira | Teste decisivo |
|--------------------|-------|----------------|
| Conhecimento sobre *como fazer X* (técnicas, payloads, impacto) | **Skill** (`skills/<nome>/SKILL.md` + `references/`) | "É carregado sob demanda e lido, não executado?" → sim |
| Raciocínio sobre *como decidir* (metodologia, triagem, playbook) | **Skill de raciocínio** | "Guia julgamento, não lista comando?" → sim |
| Procedimento de estado/roteamento (scope, dispatch, status) | **Workflow / harness** | "Muda estado do engajamento ou roteia?" → sim |
| Política sempre-ativa (gate, verificação, doutrina) | **Execution Policy** (injetada, não descartável) | "Precisa estar em todo brief e nunca cair?" → sim |
| Peça determinística repetível (scanner, OAST, JWT) | **Tool determinística** (+ blueprint como skill) | "Mesma entrada → mesma saída, sem LLM?" → sim |
| Agente efêmero despachado com brief | **Agent (permanece)** | "Recebe brief e roda isolado?" → sim |

**Regra de ouro da preservação:** o corpo de toda técnica (`Steps/Payload/Why/Tier/Escalation/Source`) é movido verbatim. Frontmatter e caminho mudam; miolo não.

---

## 2. Matriz de migração arquivo-a-arquivo

### 2.1 Orquestração (permanece harness — NÃO vira skill)

| Arquivo atual | Natureza | Decisão | Destino | Nota |
|---------------|----------|---------|---------|------|
| `SKILL.md` | Dispatcher | **Adaptar** | `SKILL.md` (manifesto magro) + roteamento | Mantém description/triggers; delega conhecimento às sub-skills; vira portável |
| `references/flows-scope.md` | Procedimento | **Preservar** | workflow `scope/resume` | Gestão de sessão — harness, não skill |
| `references/flows-agents.md` | Contrato de dispatch | **Preservar/Promover** | contrato de brief + policy injection | Formaliza embedding das policies |
| `references/flows-status.md` | State machine | **Preservar** | workflow `status/lifecycle` | Leads/gadgets/report transitions |
| `references/flows-report.md` | Procedimento | **Preservar** | workflow `report` | Chama skills writer/triager |
| `references/flows-recon.md` | Procedimento | **Preservar** | workflow `recon` | Orquestra skills de recon |
| `references/flows-intake.md` | Pipeline | **Preservar** | workflow `intake` | Alimenta o ativo de conhecimento |
| `references/flows-proxy.md` | Procedimento | **Preservar/Adaptar** | workflow `proxy` | Ponto de integração Caido (doc 07) |
| `references/flows-misc.md` | Utilitário | **Preservar** | workflow `utils` | Reorg/export/compact |
| `references/pattern-index.md` | Roteamento | **Preservar/Consolidar** | índice keyword→skill | Atualizar para apontar skills |
| `references/template-files.md` | Contrato de estado | **Preservar** | contrato de engajamento | Estrutura de dirs + cc*.md |
| `references/template-technique.md` | Contrato de formato | **Preservar** | contrato de skill de técnica | Vira o schema do corpo da skill |
| `references/help.md` | Texto | **Preservar** | — | Ajuda |

### 2.2 Política imutável (vira Execution Policy — injetada em todo brief, nunca descartável)

| Arquivo atual | Decisão | Destino | Nota |
|---------------|---------|---------|------|
| `references/authorization-gate.md` | **Preservar (promover)** | `policies/authorization-gate.md` | Marcador `SECAUDIT_SAFETY_GATE_v1`; Rule 0–7 intactas; injetada em todo brief e sempre-carregada |
| `references/verification-contract.md` | **Preservar (promover)** | `policies/verification-contract.md` | Marcador `SECAUDIT_VERIFICATION_CONTRACT_v1`; embedding verbatim obrigatório |
| `references/native-tooling-doctrine.md` | **Preservar (promover)** | `policies/native-tooling-doctrine.md` | Tier 0/1 + banned-tools; base do Execution Policies do doc 07 |

### 2.3 Conhecimento de ataque (MIGRA → Skills; corpo verbatim)

| Arquivo atual | Técnicas | Decisão | Skill-destino |
|---------------|----------|---------|---------------|
| `agents/host-inventory/host-inventory.md` | T1–T10 | **Migrar** | `skills/host-recon/` |
| `agents/privilege-review/windows.md` | T1–T9 | **Migrar** | `skills/windows-privesc/` |
| `agents/directory-review/directory-review.md` | T1–T9 | **Migrar** | `skills/ad-enum-attack/` |
| `agents/credential-review/credential-review.md` | T1–T7 | **Migrar** | `skills/credential-access/` |
| `agents/host-to-host-access/host-to-host-access.md` | T1–T7 | **Migrar** | `skills/lateral-movement/` |
| `agents/foothold-durability/foothold-durability.md` | T1–T6 | **Migrar** | `skills/persistence/` |
| `agents/telemetry-awareness/telemetry-awareness.md` | T1–T4 | **Migrar** | `skills/telemetry-awareness/` |
| `agents/telemetry-awareness/lolbins.md` | T1–T9 | **Migrar** | `skills/telemetry-awareness/references/lolbins.md` |
| `agents/data-egress-check/data-egress-check.md` | T1–T4 | **Migrar** | `skills/data-egress/` |
| `agents/web-inventory/web-inventory.md` | T1–T8 | **Migrar** | `skills/web-recon/` |
| `agents/web-testing/web-testing.md` | T1–T14 | **Migrar + split** | `skills/web-exploitation/` com `references/{xss,sqli,idor,ssrf,ssti,auth,deser,jwt,smuggling,...}.md` |
| `agents/code-review/code-review.md` | T1–T11 | **Migrar** | `skills/code-review/` |
| `agents/code-review/sink-patterns.md` | SP-NNN | **Migrar (global)** | `skills/code-review/references/sink-patterns.md` |
| `agents/chaos/chaos.md` | T1–T8 | **Migrar** | `skills/chaos-fuzzing/` |

### 2.4 Raciocínio especializado (MIGRA → Skills de raciocínio)

| Arquivo atual | Decisão | Skill-destino |
|---------------|---------|---------------|
| `agents/methodology/methodology.md` | **Migrar** | `skills/assessment-methodology/` |
| `agents/evidence-hygiene/evidence-hygiene.md` | **Migrar (+ política)** | `skills/evidence-hygiene/` (princípios de redação ligados à Rule 6 do gate) |
| `references/ideas-when-stuck.md` | **Migrar** | `skills/assessment-methodology/references/out-of-ideas.md` |

### 2.5 Forge — híbrido (blueprint = skill; tool = capability determinística)

| Arquivo atual | Decisão | Destino | Nota |
|---------------|---------|---------|------|
| `agents/forge/forge.md` (B1–B15) | **Migrar (dividir)** | `skills/forge/` (blueprints) + candidatos a **tool determinística** | Ver doc 07 §Forge/Tools |
| `references/flows-forge.md` | **Preservar** | workflow `forge` | Build protocol + teardown |

**Candidatos a tool determinística** (saída estável, sem necessidade de LLM): port scanner (B1), wordlist generator (B4), JWT toolkit (B7), OAST/callback server (B8), hash helper (B13). **Permanecem como blueprint-skill (não deterministas, dependem de alvo):** smuggler (B6), SQLi extractor (B9), JS deobfuscator (B11), AD collector (B12). Reverse-shell (B14)/DNS-exfil (B15) permanecem Classe A sob gate.

### 2.6 Relatório (writer/triager → skills; template/libs → conhecimento)

| Arquivo atual | Decisão | Destino |
|---------------|---------|---------|
| `reports/agent-writer.md` | **Migrar** | `skills/report-writer/` |
| `reports/agent-triager.md` | **Migrar** | `skills/report-triage/` |
| `reports/template.md` | **Preservar** | `skills/report-writer/references/template.md` |
| `reports/impact-library.md` | **Preservar (conhecimento)** | `skills/report-writer/references/impact-library.md` |
| `reports/precedent-library/*` | **Preservar (conhecimento)** | `skills/report-writer/references/precedent/` |

### 2.7 Ingestão e estado (permanece)

| Arquivo atual | Decisão | Nota |
|---------------|---------|------|
| `intake/tags.md` | **Preservar** | Vocabulário canônico; crítico ao roteamento |
| `intake/{links,processed,scratch}.md`, `intake/files/` | **Preservar** | Filas de ingestão |
| Estado runtime (`scope.md`, `session.md`, `toDoList.md`, `cc*.md`, numbered dirs) | **Preservar** | Memória file-based portável |

---

## 3. Classificação de agentes: conhecimento vs função

A pergunta da Etapa C — "quais agentes viram skills e quais permanecem agentes":

- **Todos os 18 arquivos em `agents/` são conhecimento → viram skills.** Nenhum é um agente funcional; são catálogos lidos sob demanda. O nome do diretório é a dívida a quitar.
- **Os agentes *funcionais* do sistema não vivem em `agents/`** — vivem no ato de despacho dos Flows 9/12 (subagentes efêmeros com brief). Esses **permanecem agentes**: são função/orquestração, definidos pelo contrato de brief, não por um arquivo de persona.
- **Workflows:** os `flows-*.md` são workflows (sequências de passos com gates), não skills nem agentes.
- **Tools determinísticas:** o subconjunto do forge listado em §2.5.

---

## 4. Carregamento progressivo de conhecimento (preservar e reforçar)

O modelo atual (`## Index` → tags → `T[N]`) mapeia 1:1 para Agent Skills:

```
skills/<classe>/
  SKILL.md              ← frontmatter (name, description=trigger, when-to-use) + ## Index (só isto no 1º acesso)
  references/
    <técnica-ou-subclasse>.md   ← corpo T[N] verbatim, lido só quando a tag casa
```

- O `description` do frontmatter da skill herda os triggers do `pattern-index` (keyword→skill).
- O `## Index` da skill é o índice de técnicas atual (linha por `T[N]` com `Tier`+`Tags`).
- `references/` guarda os corpos — carregados por tag, como hoje.
- **Ganho:** o split de `web-testing` (14 técnicas num arquivo) em `references/<classe>.md` reduz o carregamento de "arquivo inteiro" para "subclasse casada", melhorando o progressive disclosure que hoje é por-arquivo.

---

## 5. Como evitar perda semântica (os guardrails da migração)

1. **Diff verbatim:** para cada `T[N]`, o corpo na skill-destino deve bater byte-a-byte com o original (só caminho/frontmatter muda). Script de validação no doc 10.
2. **Preservar `Tier` e `Why`:** são os campos HackBot-específicos; sem eles perde-se a filtragem por runtime e o sinal de decisão.
3. **Native-normalization intacta:** a tradução "ferramenta banida → equivalente nativo" do `pattern-index`/`native-tooling-doctrine` deve sobreviver no `description` e no corpo. Uma skill que reintroduza invocação de ferramenta banida é regressão.
4. **Contagem de técnicas:** baseline de ~120 entradas (doc 02 §7) deve bater pós-migração.
5. **Policies sempre embutidas:** o contrato de brief (flows-agents) deve continuar colando gate + verificação + doutrina verbatim em todo brief de subagente.
6. **Roteamento tri-consistente:** `pattern-index` ↔ frontmatter das skills ↔ loading chain devem concordar; validador no doc 09/10.

---

## 6. Resultado líquido da migração

- **De:** 1 `SKILL.md` monolítico + `agents/` mal-nomeado + `references/` misturando política/procedimento/template.
- **Para:** `SKILL.md` magro (roteador portável) + `policies/` (3 docs imutáveis injetáveis) + `skills/` (conhecimento + raciocínio, padrão `SKILL.md`+`references/`) + `workflows/` (flows) + `tools/` (determinísticas do forge) + contrato de estado inalterado.
- **Esforço:** majoritariamente mecânico (mover + frontmatter). Reescrita real só no `SKILL.md` (vira roteador) e no split de `web-testing`. **Risco de perda de conhecimento: baixo**, desde que os guardrails §5 sejam aplicados.
