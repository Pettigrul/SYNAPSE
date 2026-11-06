# 02 — Inventário de Conhecimento (o ativo a preservar)

> **Restrição fundamental #1:** a base de conhecimento ofensivo é um ativo crítico. Este documento cataloga o conhecimento **sem resumi-lo nem reescrevê-lo** — mapeia *onde* ele vive, *que tipo* é, e *como* é carregado, para que a migração o preserve integralmente.
> **Separação pedida:** conhecimento declarativo · raciocínio especializado · execução de ferramentas · orquestração.

---

## 1. Taxonomia do conhecimento (as quatro naturezas)

O HackBot mistura, em arquivos co-localizados, quatro naturezas distintas. A migração precisa separá-las sem perder a ligação entre elas.

| Natureza | Definição | Onde está hoje | Destino na migração |
|----------|-----------|----------------|---------------------|
| **D — Declarativo** | Técnicas, payloads, recipes, padrões de sink, impacto/precedente | `agents/**` (corpo `T[N]`), `sink-patterns.md`, `impact-library.md`, `precedent-library/` | **Skills** (conteúdo verbatim) |
| **R — Raciocínio especializado** | Como decidir, priorizar, escalar, quando parar | `methodology.md`, `ideas-when-stuck.md`, `evidence-hygiene` (princípios), `agent-triager.md` | **Skills** (de raciocínio) + política |
| **X — Execução de ferramentas** | Scripts/one-offs determinísticos (scanner, OAST, JWT, smuggler) | `forge.md` blueprints → `5-Scripts/` runtime | **Tools determinísticas** (candidato) + skill de blueprint |
| **O — Orquestração** | Roteamento, despacho, carga, contratos de brief | `SKILL.md`, `flows-*.md`, dispatch de subagentes | **Harness/adaptador** (não vira skill) |

**Princípio de preservação:** nenhum corpo de técnica (`Steps`/`Payload`/`Why`/`Variations`/`Source`) é reescrito na migração. Ele é **movido verbatim** para a skill correspondente. O que muda é a embalagem (frontmatter, diretório, roteamento), não o miolo.

---

## 2. Formato canônico de uma técnica (contrato a herdar)

Definido em `template-technique.md`. Toda entrada `T[N]` tem campos obrigatórios: `Tags`, `When`, `Why`, `Tier`, `Steps`, `Payload` (se aplicável), `Escalation` (se Tier≠0), `Source`; opcionais `Signal`/`Pitfall`/`Needs`/`Variations`.

Dois campos são **específicos do HackBot e não podem se perder**:
- **`Tier`** (`0-native` | `1-python` | `1-go` | `1-node`): filtra técnicas pelo que existe no host antes de ler o corpo.
- **`Why`** (sinal de decisão): "o que fez o operador escolher *esta* técnica". É descrito como "o campo mais valioso dos writeups processados" — é conhecimento de **raciocínio** embutido na entrada declarativa.

**Progressive disclosure já implementado:** `## Index` (carrega só isto) → casar tags → ler só o `### T[N]` que casa. "80 técnicas, 3 casam ≈ 3KB em vez de 40KB". **Este é exatamente o modelo de carregamento de Agent Skills** — a migração herda o mecanismo, não o inventa.

---

## 3. Inventário por categoria (D = declarativo)

Classes de ataque. Contagem de técnicas por inspeção dos cabeçalhos `### T[N]`.

### 3.1 Trilha Windows / Active Directory

| KB | Técnicas | Conteúdo (natureza) | Preservação |
|----|----------|---------------------|-------------|
| `host-inventory/host-inventory.md` | T1–T10 | Identidade/privilégio, fingerprint, serviços, tasks, cred-in-config, posição de rede, port scan nativo (TcpClient), SMB/share, inventário de software | **Integral** |
| `privilege-review/windows.md` | T1–T9 | Unquoted path, weak service ACL, AlwaysInstallElevated, task hijack, SeImpersonate, SeBackup/SeRestore, DLL hijack, UAC bypass, cred reuse→runas | **Integral** |
| `directory-review/directory-review.md` | T1–T9 | Contexto de domínio, LDAP via DirectorySearcher, SPN enum, extração manual de ticket de service-account, no-preauth, ACL abuse, trusts, GPP/SYSVOL, delegação (uncon/con/RBCD) | **Integral** |
| `credential-review/credential-review.md` | T1–T7 | LSASS MiniDump (comsvcs), SAM/SYSTEM hive, DPAPI, extração offline, Credential Manager, browser store, scrape de memória | **Integral** |
| `host-to-host-access/host-to-host-access.md` | T1–T7 | WinRM, WMI process create, sc remoto, task remota, hash-based auth, SMB exec staging, MSSQL linked-server | **Integral** |
| `foothold-durability/foothold-durability.md` | T1–T6 | Run key, scheduled task, service install, WMI event sub, startup folder, COM hijack | **Integral** |
| `telemetry-awareness/telemetry-awareness.md` | T1–T4 | Footprint de telemetria, PowerShell logging, AMSI, cleanup de artefato nativo | **Integral** |
| `telemetry-awareness/lolbins.md` | T1–T9 | certutil, bitsadmin, rundll32, regsvr32, mshta, msbuild/installutil, comsvcs MiniDump, wmic, esentutl/vssadmin/wbadmin | **Integral** |
| `data-egress-check/data-egress-check.md` | T1–T4 | HTTP(S) POST exfil, DNS exfil, stage-encode-chunk, SMB/share exfil | **Integral** |

### 3.2 Trilha Web / API

| KB | Técnicas | Conteúdo | Preservação |
|----|----------|----------|-------------|
| `web-inventory/web-inventory.md` | T1–T8 | Fingerprint, content discovery, subdomínio (crt.sh+resolve), JS pull+grep, CT, robots/sitemap, API schema (OpenAPI/GraphQL), vhost brute | **Integral** |
| `web-testing/web-testing.md` | T1–T14 | XSS (refl/stored), SQLi (error/blind + extração), IDOR/BOLA, SSRF, SSTI, auth bypass, upload/traversal, deser, JWT, open redirect, CORS, request smuggling | **Integral — candidato a split por classe** |
| `code-review/code-review.md` | T1–T11 | Sink-driven, source→sink, auth/authz, secrets grep, dep/supply-chain, deser, SQL concat, file ops, crypto misuse, race/TOCTOU, scanner automatizado | **Integral** |
| `code-review/sink-patterns.md` | SP-NNN (8 grupos) | Catálogo global de padrões de sink (RCE, SQLi, XSS/template, deser, path traversal, SSRF, redirect, crypto) — append-only | **Integral (global)** |

### 3.3 Transversais (D + R + X)

| KB | Natureza | Conteúdo | Preservação |
|----|----------|----------|-------------|
| `chaos/chaos.md` (T1–T8) | D | Fuzz de parâmetro/header/método/content-type, rate-limit, unicode/encoding, file-format, service fuzz | **Integral** |
| `forge/forge.md` (B1–B15) | **X + D** | Blueprints de micro-tools: port scanner, content buster, subdomain, wordlist gen, param miner, raw-socket smuggler, JWT toolkit, OAST server, SQLi extractor, port forwarder, JS deobfuscator, AD collector, hash helper, reverse-shell handler, DNS-exfil server | **Blueprints → skill; tools → capability determinística** |
| `methodology/methodology.md` | **R** | Host-first vs web-first, lifecycle de 7 fases, gates de qualidade por achado e de fim-de-engajamento | **Skill de raciocínio** |
| `evidence-hygiene/evidence-hygiene.md` (T1–T5) | R + D | Captura, logging req/resp, protocolo de redação, prova por hash, organização | **Skill + política de evidência** |
| `ideas-when-stuck.md` | **R** | Out-of-ideas playbook A→B→C→D | **Skill de raciocínio** |

---

## 4. Conhecimento de relatório (D + R)

| Arquivo | Natureza | Conteúdo | Preservação |
|---------|----------|----------|-------------|
| `reports/impact-library.md` | D | 17 narrativas de impacto pré-escritas (RCE, SQLi, IDOR r/w, XSS stored, SSRF metadata/interno, auth bypass, privesc web/local/DA, lateral, LSASS, deser, traversal, rate-limit) | **Integral** |
| `reports/precedent-library/<class>.md` | D | Faixas de severidade/CVSS por classe (lazy, criado por classe) | **Integral** |
| `reports/template.md` | D | Estrutura de campos do finding (título→metadata) | **Integral** |
| `reports/agent-writer.md` | R | Voz, regras de estrutura, checklist de qualidade, erros comuns, calibração de severidade | **Skill (writer)** |
| `reports/agent-triager.md` | R | Árvore de decisão de triagem, reportabilidade native-specific, checklist pré-submit | **Skill (triager)** |

---

## 5. Pipeline de ingestão de conhecimento (como o ativo cresce)

Crítico para preservar: é o mecanismo que **mantém a base viva**. `flows-intake.md` (Flows 1–4) + `intake/`:

- **Flow 1** processa writeups/URLs → técnicas native-normalizadas (traduz qualquer ferramenta banida para o equivalente nativo/Tier-1).
- **Flow 2** query ("what do I know about X").
- **Flow 3/3a/3b** add technique / note / learn-this.
- **Flow 4** nova categoria.
- `intake/tags.md` = vocabulário canônico de tags (classes de vuln, Windows/host, escopo, tier, workflow).
- `pattern-index.md` = roteamento keyword→KB, com **native-normalization**: um nome de ferramenta banida é só uma *keyword* que roteia para a KB que carrega o equivalente nativo.

**Risco de migração #1:** se as skills ganharem granularidade (um arquivo por classe), o pipeline de intake e o `pattern-index` precisam continuar roteando corretamente. A normalização nativa (a "tradução" de ferramenta→nativo) é parte do valor do ativo e **não pode se perder**. (Tratado no doc 05 §carregamento progressivo e no doc 09 §riscos.)

---

## 6. O que NÃO é conhecimento (não migrar para skill)

Para evitar migração indevida:
- `SKILL.md` **Flow Dispatch / Loading Chain / Context Priority** = orquestração (O).
- `flows-scope.md`, `flows-agents.md` (dispatch), `flows-status.md` (state machine) = procedimento/orquestração.
- `template-files.md` = contrato de estrutura de estado, não conhecimento ofensivo.
- Os 3 docs imutáveis = **política** (classe própria; ver doc 07 "Execution Policies"). São raciocínio-de-segurança, mas funcionam como *guardrails sempre-ativos*, não como conhecimento carregado por tópico.

---

## 7. Métricas do ativo (baseline para medir perda semântica)

| Métrica | Valor atual | Uso na validação |
|---------|-------------|------------------|
| Arquivos de KB de ataque (`agents/`) | 18 | Cada um deve ter skill-destino no doc 05 |
| Técnicas declarativas (`T[N]` + `B[N]` + `SP`) | ~120 entradas | Contagem pós-migração deve bater |
| Narrativas de impacto | 17 | Integral |
| Flows procedurais | ~25 (Flows 1–21 + sub) | Mapear para workflow/skill/harness |
| Campos obrigatórios por técnica | 8 (`Tags/When/Why/Tier/Steps/Payload/Escalation/Source`) | Validador deve checar presença |
| Docs de política imutável | 3 | Devem permanecer non-droppable + injetados em brief |

**Teste de preservação (a aplicar após migrar):** para cada `T[N]` original, o corpo (`Steps`+`Payload`+`Why`+`Escalation`+`Source`) deve existir byte-a-byte na skill-destino; o `Tier` e as `Tags` devem sobreviver; o roteamento keyword→skill deve resolver. Um diff que mostre só mudança de caminho/frontmatter = migração limpa. Qualquer mudança no corpo = perda semântica a justificar.
