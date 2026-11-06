# Baseline V1 — Relatório (read-only)

> Gerado: 2026-11-04T17:40:57.343934+00:00  
> Raiz: `/home/pettigrul/projetos/SecurityAuditor/SecurityAuditor`  
> **Status geral: OK**

## Resumo das verificações

| Check | Status | Detalhe |
|-------|--------|---------|
| C1_inventory | OK | 45 arquivos .md inventariados em ['agents', 'references', 'reports', 'intake', 'SKILL.md', 'README.md'] |
| C2_techniques | OK | 127 técnicas reais (T=112, B=15) em 17 arquivos de agents/ |
| C3_fields | OK | 127 entradas verificadas (técnica + blueprint); 0 avisos, 28 observações de formato |
| C4_index | OK | Consistência Index<->Techniques verificada em 17 catálogos; 0 divergências |
| C5_routing | OK | 18 alvos roteados; 0 quebrados; 0 catálogos não alcançados |
| C6_links | OK | links internos quebrados: 0; cross-refs quebrados: 0 |
| C7_policies | OK | 3 policies verificadas; 0 problemas (marcadores/Rule 0/presença) |
| C8_brief | OK | 8/8 seções de brief presentes; ordem_ok=True |
| C9_behavior | OK | Tiers inválidos: 0; vocabulário de banned-tools catalogado (17 tokens) para lint H0 |

## Baseline numérica

- **Técnicas reais (total): 127** (T=112, B=15)
- Arquivos .md inventariados: 45
- Catálogos de conhecimento (agents/): 17
- Hash agregado da baseline: `5f6fa7686f271d79a5db54c96baede1bd6fc5e98aaf543700420d69559046522`
- Hash do grafo de roteamento: `9665c9091efef96dd46c70bfac5eb206e5adf3100a1c0ffcde745df177642a2a`

### Técnicas por catálogo

| Catálogo | Técnicas | Index |
|----------|----------|-------|
| `agents/chaos/chaos.md` | 8 | sim |
| `agents/code-review/code-review.md` | 11 | sim |
| `agents/code-review/sink-patterns.md` | 0 | não |
| `agents/credential-review/credential-review.md` | 7 | sim |
| `agents/data-egress-check/data-egress-check.md` | 4 | sim |
| `agents/directory-review/directory-review.md` | 9 | sim |
| `agents/evidence-hygiene/evidence-hygiene.md` | 5 | sim |
| `agents/foothold-durability/foothold-durability.md` | 6 | sim |
| `agents/forge/forge.md` | 15 | sim |
| `agents/host-inventory/host-inventory.md` | 10 | sim |
| `agents/host-to-host-access/host-to-host-access.md` | 7 | sim |
| `agents/methodology/methodology.md` | 0 | não |
| `agents/privilege-review/windows.md` | 9 | sim |
| `agents/telemetry-awareness/lolbins.md` | 9 | sim |
| `agents/telemetry-awareness/telemetry-awareness.md` | 4 | sim |
| `agents/web-inventory/web-inventory.md` | 8 | sim |
| `agents/web-testing/web-testing.md` | 15 | sim |

## Policies imutáveis (âncoras de preservação H0)

| Policy | Marcador | Rule 0 | sha256 |
|--------|----------|--------|--------|
| authorization-gate | presente | presente | `042e73fa20195753…` |
| verification-contract | presente | — | `3c6ec9dd3a51f133…` |
| native-tooling-doctrine | — | — | `069522e00def2484…` |

## Contrato de brief (agentes efêmeros — Flows 9/12)

- Seções presentes: 8/8 — ordem canônica: True
- Esperadas: Objective, Active engagement task, Target, Run mode, Native-tooling constraint, Techniques to apply, Verification contract, Return contract

## Achados

### INFO (28)

- **[C3_fields]** agents/chaos/chaos.md#T1 (Parameter fuzz (web)): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)
- **[C3_fields]** agents/chaos/chaos.md#T2 (Header injection fuzz): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)
- **[C3_fields]** agents/chaos/chaos.md#T3 (Method tampering): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)
- **[C3_fields]** agents/chaos/chaos.md#T4 (Content-type juggling): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)
- **[C3_fields]** agents/chaos/chaos.md#T5 (Rate limit / brute force): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)
- **[C3_fields]** agents/chaos/chaos.md#T6 (Unicode / encoding fuzz): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)
- **[C3_fields]** agents/chaos/chaos.md#T7 (File format fuzz): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)
- **[C3_fields]** agents/chaos/chaos.md#T8 (Windows service fuzz): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)
- **[C3_fields]** agents/code-review/code-review.md#T6 (Deserialization review): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)
- **[C3_fields]** agents/code-review/code-review.md#T7 (SQL query construction review): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)
- **[C3_fields]** agents/code-review/code-review.md#T8 (File operation review): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)
- **[C3_fields]** agents/code-review/code-review.md#T9 (Crypto misuse review): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)
- **[C3_fields]** agents/code-review/code-review.md#T11 (Automated sink scanner): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)
- **[C3_fields]** agents/evidence-hygiene/evidence-hygiene.md#T1 (Screenshot / terminal capture): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)
- **[C3_fields]** agents/evidence-hygiene/evidence-hygiene.md#T2 (Request/response logging): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)
- **[C3_fields]** agents/evidence-hygiene/evidence-hygiene.md#T4 (Hash-based proof): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)
- **[C3_fields]** agents/forge/forge.md#B2 (Content buster) [blueprint-ponteiro]: delega a outro catálogo (sem corpo próprio — dedup intencional)
- **[C3_fields]** agents/forge/forge.md#B6 (Raw-socket smuggler) [blueprint-ponteiro]: delega a outro catálogo (sem corpo próprio — dedup intencional)
- **[C3_fields]** agents/forge/forge.md#B9 (SQLi extractor) [blueprint-ponteiro]: delega a outro catálogo (sem corpo próprio — dedup intencional)
- **[C3_fields]** agents/telemetry-awareness/lolbins.md#T1 (certutil — download / encode / hash): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)
- **[C3_fields]** agents/telemetry-awareness/lolbins.md#T2 (bitsadmin / Start-BitsTransfer — background download): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)
- **[C3_fields]** agents/telemetry-awareness/lolbins.md#T3 (rundll32 — execute DLL export / JS): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)
- **[C3_fields]** agents/telemetry-awareness/lolbins.md#T4 (regsvr32 — scriptlet exec (squiblydoo)): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)
- **[C3_fields]** agents/telemetry-awareness/lolbins.md#T5 (mshta — run HTA / inline script): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)
- **[C3_fields]** agents/telemetry-awareness/lolbins.md#T6 (msbuild / installutil — compile-and-run inline C#): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)
- **[C3_fields]** agents/telemetry-awareness/lolbins.md#T7 (comsvcs.dll MiniDump — LSASS dump): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)
- **[C3_fields]** agents/telemetry-awareness/lolbins.md#T8 (wmic — query / remote process): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)
- **[C3_fields]** agents/telemetry-awareness/lolbins.md#T9 (esentutl / vssadmin / wbadmin — locked-file copy): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)

## Critérios de equivalência (contrato para validar o H0)

Após a migração H0, re-executar V1 sobre `skills/` e exigir:

1. **`baseline_aggregate_sha256` idêntico** — todo corpo de técnica preservado byte-a-byte.
2. **`technique_count` == 127** — nenhuma técnica perdida ou duplicada.
3. **`policy_hashes` idênticos** — os 3 docs imutáveis inalterados (marcadores + Rule 0).
4. **Checks C4/C5/C6/C8 em OK** — disclosure, roteamento, links e brief preservados.
5. Divergência em qualquer item acima = **bloqueio de migração** (rollback).
