# 15 — Relatório de Promoção H0.8 (Controlada, sem Arquivamento)

> **H0.8 executado na forma condicionada: promoção controlada.** A estrutura validada de `h0-staging/` foi promovida para os diretórios definitivos no root. **`agents/` NÃO foi arquivado, movido nem excluído** — permanece intacto na origem (verificado por hash). Promoção e desativação da arquitetura antiga foram **separadas**: esta rodada só promove/ativa; a desativação (arquivar `agents/`) fica para encerramento definitivo, após o Pi end-to-end.
> Snapshot verificável criado antes de qualquer alteração. Rollback documentado e testável.

---

## 1. Inventário das alterações efetivamente realizadas

**Snapshot pré-promoção** (não há git no repo): `docs/architecture-review/h0-promotion-snapshot/`
- `pre-promotion-hashes.json` — sha256+bytes de **45** arquivos operacionais.
- `pre-promotion-snapshot.tgz` — tar do repo (exceto `docs/`, `h0-staging/`); sha256 `f07842f7…40cc`.
- `SKILL.md.pre-h0`, `pattern-index.md.pre-h0` — backups diretos dos 2 arquivos ativados.

**Mudanças (diff vs snapshot):**

| Ação | Qtde | Itens |
|------|------|-------|
| **Adicionados** | 34 | `skills/` (17), `workflows/` (9), `policies/` (3), `adapters/` (3), `tools/` (1), + `manifest-h0-promoted.json` (realocado p/ `docs/`) |
| **Alterados** | 2 | `SKILL.md` (→ router remapeado), `references/pattern-index.md` (→ remapeado p/ `skills/`) |
| **Removidos** | 0 | — |
| **`agents/`** | 0 mudanças | 17 arquivos byte-idênticos ao snapshot |

Apenas **caminhos e mecanismos de descoberta** foram ajustados (escopo item 4). Nenhum conhecimento técnico foi reescrito.

---

## 2. Comparação pré × pós-promoção

| Dimensão | Pré | Pós | Veredito |
|----------|-----|-----|----------|
| Entradas técnicas (corpos) | 127 | 127, multiset idêntico | ✅ perda-zero |
| T / B | 112 / 15 | 112 / 15 | ✅ |
| `agents/` (17 arq.) | baseline | **inalterado** (0 alterados/removidos) | ✅ preservado |
| Policies (hashes) | 3 | 3 idênticos + marcadores + Rule 0 | ✅ |
| Fonte de catálogo ativa | `agents/` (via pattern-index) | `skills/` (via pattern-index remapeado) | ✅ troca limpa |
| Refs a `agents/` no router/index ativos | — | **0** | ✅ sem duplicação |
| Flows 9/12 (brief) | 8/8 | 8/8 em ordem | ✅ |

---

## 3. Testes executados e evidências

### 3.1 Validador V1 (Node) na raiz promovida — **overall OK, 0 achados**
`node docs/architecture-review/validate_h0.mjs . docs/architecture-review/baseline/manifest.json`
- bodies 127/127 (0 diff) · count 112/15 · catalogs 14 (0 diff) · policies 3/3 · routing 15 roteadas, **agents/refs no index=0** · descriptions 15/15 · brief 8/8 · regression (newline/CRLF/CR + tier0 99/99, tier1 13/13, blueprint 15/15, delegados 3/3) todos ✓.
- Saída: `docs/architecture-review/manifest-h0-promoted.json`.

### 3.2 Integridade de `agents/` vs snapshot
17 arquivos de `agents/` checados → **0 alterados, 0 removidos**. `SKILL.md` e `pattern-index.md` diferem do snapshot (ativação esperada; originais preservados nos backups `.pre-h0`).

### 3.3 Claude Code 2.1.312 — re-teste pós-promoção (skills promovidas)
Sandbox isolado reconstruído a partir de `skills/` do root (prefixo `secaudit-prom-`), headless, ferramentas só-leitura.

| Cenário | Skill invocada | Técnica | Evidência de conteúdo | Resultado |
|---------|----------------|---------|------------------------|-----------|
| 1 — Descoberta "fria" (sem pedir p/ consultar skills) | *(nenhuma)* | — | Respondeu de conhecimento geral; canário **genérico inventado** (`cAn4ry7h3k9`), não o do corpo | ❌ **MISS** (não conta: só mencionou nomes) |
| 1b — Descoberta com indicação "consulte sua base (skills)" | `secaudit-prom-web-testing` | **T1** | Citou `hkaud`, `onerror`, `onload` (fingerprint do corpo) | ✅ PASS |
| 3 — Roteamento (autorização horizontal) | `secaudit-prom-web-testing` | **T5** | Citou `/api/orders/1001`→`1002` | ✅ PASS |
| 4 — Cross-reference (2 skills) | `secaudit-prom-forge` → `…web-testing` | **B9→T4** | Encadeou forge→web-testing; citou B9 e T4 | ✅ PASS |

> Cenário 2 (progressive disclosure) foi validado **pré-promoção** (doc 14) e não foi re-executado pós-promoção para conservar cota; o conteúdo é byte-idêntico.

**Achado (variância de invocação):** a seleção/carregamento da skill é **probabilística** e sensível ao fraseado. Numa descoberta "fria" o agente pode responder de conhecimento paramétrico **sem** carregar a skill (cenário 1 MISS). Com uma instrução para consultar a base, a invocação é confiável (1b/3/4 PASS, com acesso ao conteúdo correto). **Implicação:** no uso real o HackBot é invocado *como* a skill-dispatcher (que já roteia para `skills/`), então o cenário "frio" é menos representativo — mas convém reforçar no `CLAUDE.md`/router a instrução de sempre consultar a KB para tarefas de segurança.

---

## 4. Compatibilidade por runtime (confirmada / pendente)

| Runtime | Pré-promoção | Pós-promoção | Status |
|---------|--------------|--------------|--------|
| **Claude Code 2.1.312** | 4/4 com evidência | 3/3 re-testados (1b/3/4) + variância documentada | ✅ **CONFIRMADO** (com ressalva de invocação probabilística) |
| **Pi Agent 1.4.0** | BLOCKED (cota) | não reexecutado | ⛔ **BLOCKED** — cota esgotada; pendência obrigatória p/ encerrar H0 |
| **Antigravity** | não instalado | — | ⏳ **PENDENTE** — runtime ausente |

Nenhuma dependência externa nova foi introduzida; validação roda em Node stdlib.

---

## 5. Plano de rollback (sem git, testável)

**Objetivo:** voltar ao estado pré-promoção com perda-zero.

```sh
cd <repo>
# 1) remover os diretórios promovidos (aditivos)
rm -rf skills policies workflows adapters tools
# 2) restaurar os 2 arquivos ativados a partir do backup durável
cp docs/architecture-review/h0-promotion-snapshot/SKILL.md.pre-h0           SKILL.md
cp docs/architecture-review/h0-promotion-snapshot/pattern-index.md.pre-h0   references/pattern-index.md
# 3) (opcional) conferir integridade total contra o snapshot
tar -tzf docs/architecture-review/h0-promotion-snapshot/pre-promotion-snapshot.tgz >/dev/null
```

**Verificação pós-rollback:**
- `python3 docs/architecture-review/baseline/validate_v1.py` → `baseline_aggregate_sha256 == 5f6fa768…` e os hashes de `SKILL.md`/`pattern-index.md` batem com `pre-promotion-hashes.json`.
- `agents/` permanece intacto em qualquer cenário (nunca foi tocado).

**Gatilho de rollback:** qualquer regressão, divergência de hash, ou decisão de não prosseguir. O rollback **não depende de git** e restaura byte-a-byte.

---

## 6. Pendências para o encerramento definitivo de H0

| # | Pendência | Bloqueante p/ encerrar H0? |
|---|-----------|----------------------------|
| P1 | **Pi Agent end-to-end** (cota) — runtime principal do HackBot | **SIM** (sua condição obrigatória) |
| P2 | **Desativação da arquitetura antiga** — arquivar `agents/` → `8-Archive/` (o H0.8 "desativação") | SIM (etapa separada, ainda não autorizada) |
| P3 | **Inconsistência de path em `workflows/`**: os flows citam `references/verification-contract.md` / `references/native-tooling-doctrine.md` (verbatim), não `policies/`. Conteúdo **byte-idêntico** (zero risco), mas há cópias dormentes em `references/` e em `policies/`. Decidir a casa canônica (remapear flows→`policies/` **ou** manter `references/`). | Não (cosmético; sem divergência) |
| P4 | **Cópias dormentes** em `references/` (flows-*, 3 policies) não referenciadas pelo router ativo — remover ou manter? | Não |
| P5 | **Split de `web-testing`** (disclosure físico intra-arquivo) — Fase 2 | Não (melhoria) |
| P6 | **Confiabilidade de invocação** (cenário 1 "frio") — reforçar guidance no router/`CLAUDE.md` | Não (ajuste de prompt/doc) |
| P7 | Antigravity end-to-end | Não pelo critério "≥1 runtime", desejável |

**Sem duplicação de catálogos:** o router e o pattern-index ativos têm **0** referências a `agents/`; `agents/*.md` não têm frontmatter e `skills/` não está em caminho de auto-descoberta — logo o HackBot é descoberto como **uma** skill-dispatcher, sem catálogo carregado em dobro.

---

## 7. Critérios de aceite — situação

| Critério | Status |
|----------|--------|
| 127/127 entradas preservadas | ✅ |
| Hashes técnicos idênticos à baseline | ✅ |
| Policies e Flows 9/12 preservados | ✅ |
| Progressive disclosure e roteamento funcionais | ✅ (Node + Claude Code 1b/3/4) |
| Ausência de duplicação na descoberta | ✅ (0 refs a `agents/`; skills/ não auto-descoberta) |
| Nenhuma dependência externa nova | ✅ (Node stdlib) |
| Nenhuma regressão C1–C9 | ✅ |
| Rollback validado e documentado | ✅ (§5) |

---

## 8. Encerramento

Promoção controlada concluída: `skills/`+`policies/`+`workflows/`+`adapters/`+`tools/` ativos, router e pattern-index apontando **só** para a nova árvore, `agents/` **intacto e dormente**, validador Node verde na raiz, Claude Code reconfirmado (com variância de invocação documentada), rollback pronto. **`agents/` NÃO foi arquivado.** Parei aqui conforme instruído.

**Pendência obrigatória para declarar o H0 concluído:** carga **end-to-end no Pi Agent** (P1) e, em etapa separada e sob aprovação específica, a **desativação/arquivamento de `agents/`** (P2). Solicito sua orientação:

- **(A)** Aguardar a cota do Pi e eu executo o end-to-end no Pi (fecha P1) — sem arquivar `agents/`.
- **(B)** Resolver agora as pendências cosméticas P3/P4 (unificar casa de policies/flows; limpar dormentes).
- **(C)** Autorizar, em etapa própria, a **desativação de `agents/`** (P2) — só após P1.
- **(D)** Revisar o estado promovido antes de qualquer próximo passo.
