# 01 — Arquitetura Atual do HackBot (SecurityAuditor)

> **Status:** Etapa A — engenharia reversa. Somente leitura; nenhum arquivo do HackBot foi modificado.
> **Método:** classificação por inspeção de conteúdo, não por nome de arquivo/diretório.
> **Escopo lido:** 40 arquivos Markdown (`SKILL.md`, `references/`, `agents/`, `reports/`, `intake/`), `.config.example`, `.gitignore`, `.vscode/settings.json`.

---

## 1. O que o HackBot é, na prática

`SecurityAuditor` (doravante "HackBot") é uma **skill única, 100% Markdown**, sem binários, sem Docker, sem serviço de rede próprio. Ela roda dentro de um runtime de agente (Claude Code hoje; projetada para Antigravity/Codex/Agent SDK) e funciona como **dispatcher de conhecimento**: um `SKILL.md` roteia um gatilho (trigger) do usuário para um *flow* procedural, que por sua vez carrega sob demanda os arquivos de conhecimento de ataque e os templates de relatório.

A sua **doutrina definidora** é *native-tooling*: realizar a avaliação sem instalar binários — apenas PowerShell/cmd/.NET/LOLBins (Tier 0) e, com justificativa, Python/Go/Node (Tier 1). Essa doutrina é sobre **o alvo/host**, não sobre o runtime que executa a skill.

**Consequência arquitetural imediata (e o achado central da revisão):** o diretório `agents/` **não contém agentes**. Contém **catálogos de técnicas declarativas** (`## Index` + entradas `T[N]`) carregados por *progressive disclosure*. Os únicos "agentes" reais do sistema são subagentes efêmeros despachados em runtime pelos Flows 9/12 com um *brief*. O nome do diretório é enganoso — e é exatamente o que a migração Agents→Skills precisa corrigir.

---

## 2. Camadas da arquitetura

O sistema tem cinco camadas lógicas, que não coincidem com a estrutura de pastas:

| Camada | O que é | Onde vive | Natureza |
|--------|---------|-----------|----------|
| **L1 — Dispatcher** | Roteamento trigger→flow, regras núcleo, resumo das doutrinas, File Map, Loading Chain | `SKILL.md` | Orquestração declarativa |
| **L2 — Política imutável** | Gate de autorização, contrato de verificação, doutrina native-tooling | `references/authorization-gate.md`, `verification-contract.md`, `native-tooling-doctrine.md` | Política transversal (sempre carregada, não-descartável, embutida em todo brief) |
| **L3 — Flows procedurais** | Workflows carregados por gatilho (intake, recon, dispatch, report, status, forge, proxy, misc, scope) | `references/flows-*.md` | Procedimento/raciocínio |
| **L4 — Conhecimento (KB)** | Catálogos de técnicas por classe de ataque + padrões de sink + biblioteca de impacto/precedente | `agents/**`, `reports/impact-library.md`, `reports/precedent-library/` | **Conhecimento declarativo** |
| **L5 — Estado de engajamento** | Scope, sessão, tarefas, `cc*.md`, checkpoint, diretórios numerados | criado por engajamento (fora do repo) | Memória/estado runtime |

Arquivos de suporte transversais a L1–L4: `pattern-index.md` (keyword→KB), `template-technique.md` (formato de entrada), `template-files.md` (estrutura de engajamento), `help.md`, `ideas-when-stuck.md`, `intake/tags.md` (vocabulário canônico).

---

## 3. Orquestração e despacho de agentes

### 3.1 Dispatch estático (SKILL.md)
O `## Flow Dispatch` é uma tabela trigger→flow→load de ~60 linhas. Não há motor; o roteamento é o próprio LLM lendo a tabela. O `## Loading Chain` define o conjunto mínimo de arquivos por tarefa (ex.: "Recon/dispatch" carrega `.config` + `flows-agents` + os 3 docs imutáveis + `pattern-index` + estado). O `## Context Priority` define a ordem de descarte sob pressão de contexto, com os 3 docs imutáveis + flow ativo marcados **never droppable**.

### 3.2 Dispatch dinâmico (Flows 9/12/12b/12c/20)
É aqui que existem agentes reais. `flows-agents.md` define um **Dispatch brief template obrigatório** com seções fixas: `## Objective`, `## Active engagement task`, `## Target`, `## Run mode`, `## Native-tooling constraint`, `## Techniques to apply` (corpo verbatim do KB ou pre-read), `## Verification contract` (colado verbatim), `## Return contract`.

Propriedades-chave do modelo de orquestração:
- **Subagentes não herdam contexto da skill** — o brief é o único canal. Por isso os 3 docs imutáveis + o corpo das técnicas são **embutidos verbatim** em cada brief (parafrasear de memória é proibido).
- **Paralelismo** limitado por `MAX_AGENTS` (default 3); degrada graciosamente para **fases sequenciais** em runtimes sem despacho paralelo (escreve o brief em `4-Analysis/briefs/`, executa, produz os blocos de retorno).
- **Re-verificação pelo coordenador** (`verification-contract.md`): toda claim `VERIFIED` de subagente é re-provada na sessão antes de propagar; registra `**Coordinator re-verified:**`.
- **Vocabulário de veredito** fixo para cobertura: `untested/tested-clean/tested-partial/confirmed/blocked/loop-protection`.
- **Dedup/rate-limit**: não re-roda brief idêntico (surface×class×technique) salvo mudança de KB/superfície.

### 3.3 Classificação da orquestração
Despacho estático = **preservar** (é a essência da skill). Brief contract + re-verificação + degradação sequencial = **preservar e promover** a contrato transversal explícito (ver doc 07).

---

## 4. Gerenciamento de sessão e contexto

Centralizado no `Flow 8` (`flows-scope.md`) + `template-files.md` + convenções em `SKILL.md`:

- **Resolução de engajamento**: procura em `ENGAGEMENT_ROOTS`; cria diretório se novo.
- **Detecção de runtime + filename**: resolve `CLAUDE.md` (Claude Code/SDK) vs `AGENTS.md` (Antigravity/Codex); cross-runtime cria ambos. **Este é o mecanismo de portabilidade já existente.**
- **Runtime availability check** (obrigatório na 1ª carga): `$PSVersionTable`, `Get-Command python,go,node,...`; grava em `ccNotes.md ## What Works Here` + `scope.md ## Runtime Availability`. Define todo caminho de escalonamento Tier-1.
- **Self-heal do arquivo de instruções** (toda carga/resume): garante o bloco `🔧 NATIVE-TOOLING CONSTRAINT` — é "a correção que faz as regras sobreviverem à compressão de contexto".
- **Resume progressivo**: quick (≤7 dias: `session`+`toDoList`+`ccGadgets`+`ccLeads`+`checkpoint`) vs full (>7 dias: tudo + scope diff + regressão).
- **Estado em arquivos `cc*.md`**: `ccSurface` (inventário estruturado), `ccLeads`/`ccFailed`/`ccGadgets` (ciclo de vida de achados), `ccNotes` (histórico/modelo mental/what-works), `ccLog` (sessões de recon).
- **Checkpoint** (`Flow 16`): auto-salvo perto do limite de contexto, replayed no resume.
- **toDoList.md**: fila canônica **e** canal bidirecional runtime↔usuário (`## Tasks` runtime + `## For the user (@user)` no topo), com disciplina de validação por evidência viva.

Classificação: **preservar** (robusto e já runtime-agnóstico). Oportunidade de **consolidar** a convenção de estado numa "Session/Memory Capability" com contrato explícito (doc 07), sem reescrever o formato.

---

## 5. Fluxos de investigação e exploração

| Fase | Flow(s) | KB envolvido | Classe de ação |
|------|---------|--------------|----------------|
| Scope/setup | 8 | — | R |
| Recon | 9R, 9, 12/12b/12c | host-inventory, web-inventory, directory-review, code-review | R (passivo) / A (probe ativo) |
| Descoberta de vuln | 9, 12b | web-testing, privilege-review, credential-review, code-review | A |
| Chaos/fuzz | 20 | chaos | A |
| Forge (tool-building) | 21 | forge | R (escrever) / A (rodar contra alvo) |
| Prova/evidência | — | evidence-hygiene | R/A |
| Lateral/post-ex | 9 | host-to-host-access, data-egress-check, telemetry-awareness | A |
| Report | 10/10b | impact-library, precedent-library, template | R |

A decisão host-first vs web-first e os *phase gates* vivem em `methodology.md`. O *out-of-ideas playbook* (A→B→C→D) em `ideas-when-stuck.md`. Toda ação impactante (Classe A) passa pelo gate de autorização por-ação com Risk Card — inclusive subagentes, que não podem auto-autorizar.

---

## 6. Evidências, relatórios e memória

- **Evidências**: `evidence-hygiene.md` (redação de credenciais/PII, prova por hash/contagem, captura nativa) + diretórios numerados `1-Reports`…`9-Trashcan`. Política **never delete** (move para `8-Archive`/`9-Trashcan`). Cross-reference obrigatório a partir dos arquivos `cc*`.
- **Relatórios**: ciclo completo em `flows-report.md` + `flows-status.md` (transições: draft→OnHold→Reported→{Triaged/Accepted/Resolved/Duplicate/...}). Barra de qualidade **impact-first** e **chain-first** (não reportar precursor sem impacto demonstrado). Escrita e triagem têm instruções próprias (`reports/agent-writer.md`, `agent-triager.md`), biblioteca de impacto e de precedentes de severidade.
- **Memória**: nenhum DB. É tudo Markdown versionável por engajamento. Regras de comportamento durável vão para arquivos da skill, não para memória de engajamento (porque esta não propaga a novos engajamentos/subagentes).

Classificação: **preservar** o modelo file-based (zero-dependência, portável, auditável). **Adaptar** apenas os pontos de acoplamento (ver §8).

---

## 7. Dependências e restrições Windows

| Dimensão | Situação | Impacto corporativo |
|----------|----------|---------------------|
| Runtime do harness | Markdown interpretado pelo agente (Node no caso Pi/Claude Code) | ✅ Compatível com Windows corporativo (Node/npm disponíveis) |
| Binários instalados | **Nenhum** (doutrina proíbe no alvo; a skill em si não traz nada) | ✅ Sem download/execução de binários |
| Docker/WSL2 | **Não usados** | ✅ Irrelevante — indisponibilidade não bloqueia |
| Serviços HTTP locais | Apenas opcional via forge (OAST/callback, `HttpListener`/`http.server`), sob gate Classe A | ⚠️ Pode ser bloqueado; é opcional e autorizado por-ação |
| MCP / processos filhos | Opcional (`chrome-devtools`, `firecrawl` citados como evidência; subagentes) | ⚠️ Degradação graciosa já prevista (fallback a probe nativo) |
| Tier-1 runtimes | Verificados por sessão; nunca presumidos | ✅ Caminho fecha-se sozinho se ausente (→ `@user` task) |
| Nomes de arquivo | Regra global de nomes portáveis-Windows (sanitizador PS/Python) | ✅ Projetado para alvo Windows |

**Conclusão de compatibilidade:** o HackBot **já é estruturalmente compatível** com o ambiente corporativo restrito descrito. O risco de compatibilidade real está nas **ferramentas externas de referência** (Etapa B), não no HackBot. Detalhe no doc 06.

---

## 8. Pontos de acoplamento e duplicação

1. **Diretório `agents/` com semântica de `skills/`.** Acoplamento nome↔conceito. É a dívida arquitetural central. (→ migrar, doc 05.)
2. **Doutrinas repetidas por embedding.** Os 3 docs imutáveis são colados verbatim em cada brief — duplicação *intencional e correta* (subagentes não herdam contexto), mas sem mecanismo que garanta a cópia. É convenção textual auto-aplicada. (→ adaptar: contrato de policy-injection explícito, doc 07/09.)
3. **Resumo da doutrina em 3 lugares** (`SKILL.md`, `native-tooling-doctrine.md`, bloco `CLAUDE.md/AGENTS.md`). Sincronização manual via File Map. (→ consolidar: fonte única + includes, doc 05/07.)
4. **`pattern-index.md` ↔ File Map ↔ Loading Chain.** Três tabelas de roteamento que precisam concordar. Mudança numa exige editar as outras. (→ consolidar/validar, doc 09.)
5. **Roteamento web-testing monolítico.** Uma única KB `web-testing.md` (421 linhas, 14 técnicas) atende XSS/SQLi/IDOR/SSRF/auth/deser/SSTI/smuggling. O `pattern-index` já roteia "por técnica dentro do arquivo", mas o carregamento traz o arquivo inteiro. (→ adaptar: granularidade de skill por classe, doc 05.)
6. **`CLAUDE.md`/`AGENTS.md` duplicados** com conteúdo idêntico por engajamento. Portabilidade via cópia. (→ consolidar: um único arquivo-fonte de conhecimento + adaptadores finos, doc 07.)

---

## 9. Classificação-resumo de componentes (Etapa A)

| Componente | Classe | Justificativa (1 linha) |
|-----------|--------|--------------------------|
| `SKILL.md` (dispatcher) | **Adaptar** | Vira roteador magro + manifesto de skill portável; lógica preservada |
| 3 docs imutáveis (gate/verify/doctrine) | **Preservar** | Política correta; promover a "execution policies" injetáveis |
| `flows-*.md` | **Preservar/Adaptar** | Procedimento sólido; alguns viram workflows nomeados |
| `agents/**` (KB de ataque) | **Migrar → Skills** | É conhecimento declarativo; nome/pasta errados |
| `methodology`, `evidence-hygiene` | **Migrar → Skills** | Conhecimento/raciocínio, não função |
| `forge` | **Migrar (híbrido)** | Conhecimento de blueprints + candidato a tools determinísticas |
| `chaos` | **Migrar → Skill** | Catálogo de técnicas de fuzz |
| `reports/*` (writer/triager/template/libs) | **Preservar/Adaptar** | Writer/triager → skills; template/libs → conhecimento |
| `intake/*` + Flows 1–4 | **Preservar** | Pipeline de ingestão de conhecimento; crítico para o ativo |
| `pattern-index`, `template-technique`, `template-files` | **Preservar/Consolidar** | Contratos de estrutura; unificar roteamento |
| Estado `cc*.md` + numbered dirs | **Preservar** | Memória file-based portável |
| Despacho de subagentes (Flow 9/12) | **Preservar** | Único lugar com agentes reais; é função/orquestração |

A matriz arquivo-a-arquivo detalhada está no doc 05.
