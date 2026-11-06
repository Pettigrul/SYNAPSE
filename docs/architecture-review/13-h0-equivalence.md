# 13 — Relatório de Equivalência H0.1–H0.7 (AS-IS vs TO-BE)

> **H0.1–H0.7 executados por cópia aditiva e reversível. H0.8 NÃO executado (bloqueado).** `agents/`, o `SKILL.md` raiz e `references/` originais **não foram tocados** — verificado por hash (aggregate idêntico `5f6fa768…`). Toda a árvore nova vive em `h0-staging/`. Rollback = `rm -rf h0-staging/`.
> Este documento é o **gate de aprovação** pedido: relatório de equivalência, resultado do validador Node, diferenças/limitações, evidências de carregamento, pendências, rollback e recomendação sobre H0.8.

---

## 1. O que foi materializado (`h0-staging/`, 41 arquivos)

```
h0-staging/
  SKILL.md                      ← router (cópia do SKILL.md raiz, caminhos remapeados)
  policies/                     ← 3 docs imutáveis (verbatim)
  workflows/                    ← 9 flows-*.md (verbatim)
  references/                   ← help, ideas, template-*, pattern-index (remapeado)
  skills/<cat>/SKILL.md         ← 15 skills (frontmatter prefixado + corpo verbatim)
  skills/<cat>/references/*.md  ← sink-patterns.md, lolbins.md (verbatim)
  adapters/{claude-code,pi-agent,antigravity}.md
  tools/README.md               ← reservado (H3)
  validate_h0.mjs               ← Validador V1 portado para Node.js stdlib
  manifest-h0.json              ← saída do validador
```

---

## 2. Resultado do Validador V1 em Node.js (`validate_h0.mjs`)

Executado em `node v22.23.1`. **overall: OK — 0 achados.**

| Check | Status | Detalhe |
|-------|--------|---------|
| bodies | ✅ OK | multiset de corpos: baseline=127, staging=127; **faltando=0, extra=0** |
| count | ✅ OK | T=112/112, B=15/15, total=127/127 |
| catalogs | ✅ OK | 14 categorias com técnicas; 0 divergências de contagem |
| policies | ✅ OK | 3 policies; hashes idênticos; marcadores + Rule 0 presentes |
| routing | ✅ OK | 15 categorias roteadas; 0 quebrados; 0 não alcançadas |
| descriptions | ✅ OK | 15 skills; todas com `description` + `Triggers:` derivados do pattern-index |
| xref | ✅ OK | cross-refs informativos verificados (corpos independem de path) |
| brief (Flows 9/12) | ✅ OK | 8/8 seções na ordem canônica |
| regression | ✅ OK | newline=✓ crlf=✓ cr=✓ tier0(99/99) tier1(13/13) blueprint(15/15) delegados(3/3) |

**Paridade Python↔Node confirmada:** o V1 Python e o `validate_h0.mjs` produzem o **mesmo** multiset de 127 hashes de corpo (verificado nos dois runtimes). O hashing canônico (`splitlines`) é idêntico — o achado F1 da Fase 0.2 está incorporado.

---

## 3. Critérios obrigatórios (todos atendidos)

| Critério | Resultado |
|----------|-----------|
| 127/127 entradas preservadas | ✅ (112 T + 15 B) |
| Hashes dos corpos idênticos à baseline | ✅ multiset igual, 0 diff |
| Nenhuma técnica/referência/catálogo perdido | ✅ 0 faltando, 0 extra |
| Nenhuma regressão em C1–C9 | ✅ (C1–C9 equivalentes verdes no Node) |
| Policies e Rule 0 preservadas | ✅ hashes idênticos + marcadores |
| Flows 9/12 preservados | ✅ brief 8/8 em ordem |
| Nenhuma dependência nova incompatível com Windows corporativo | ✅ validador em **Node stdlib**; Python descartado como exigência |
| Roteamento e progressive disclosure equivalentes | ✅ pattern-index remapeado resolve; Index-first preservado |
| Rollback sem Git | ✅ `rm -rf h0-staging/` (nada mais tocado) |

---

## 4. Diferenças AS-IS → TO-BE (classificadas e justificadas)

| # | Diferença | Classe | Justificativa | Impacto na KB |
|---|-----------|--------|---------------|---------------|
| D-1 | Caminhos `agents/<cat>/<f>.md` → `skills/<cat>/SKILL.md` (+`references/`) | Estrutural | Padrão Agent Skills nativo (Pi+Claude, Fase 0.2 F2) | **Nenhum** — só endereço; corpos idênticos |
| D-2 | **Frontmatter YAML prefixado** em cada `SKILL.md` (`name`/`description`/`license`/`metadata`) | Aditiva | Contrato exigido pelos runtimes | **Nenhum** — acima do `# título`; não toca `### T[N]` (hashes idênticos) |
| D-3 | `description` **derivada das keywords do pattern-index** | Roteamento | F3: fonte única de roteamento; `pattern-index` mantido como referência determinística | Nenhum |
| D-4 | 3 docs imutáveis → `policies/`; 9 flows → `workflows/` | Estrutural | Camada de policy explícita; separação conhecimento/orquestração | Nenhum (verbatim) |
| D-5 | `SKILL.md` raiz → router remapeado em staging | Transformadora (path-only) | Já era dispatcher sem corpo de técnica; só repontua caminhos | Nenhum |
| D-6 | Categorias de 2 arquivos (`code-review`, `telemetry-awareness`) → `SKILL.md` + `references/<2º>.md` | Estrutural | Um `SKILL.md` por skill; 2º catálogo vira reference irmã | Nenhum (verbatim) |
| D-7 | Adapters `claude-code`/`pi-agent`/`antigravity` criados | Aditiva | Portabilidade sem duplicar conhecimento (apontam para `skills/`) | Nenhum |

**Nenhuma diferença altera conteúdo técnico.** Todas são de endereçamento, metadados de navegação ou organização.

---

## 5. Evidências de carregamento nos runtimes efetivamente testados

- **Node (validação):** `validate_h0.mjs` carrega, resolve `references/`, aplica progressive disclosure e confirma perda-zero — **executado, OK**.
- **Claude Code / Pi (formato):** frontmatter do staging é o mesmo contrato das skills nativas de ambos (verificado na Fase 0.2).
- **Carga viva end-to-end:** **ainda NÃO comprovada** neste round (ver §6). Esta continua sendo a **condição obrigatória** antes de considerar o H0 concluído.

---

## 6. Limitações e verificações pendentes

| Pendência | Motivo | Destrava com |
|-----------|--------|--------------|
| **Carga end-to-end em ≥1 runtime real** | Pi: cota da conta esgotada; Claude Code: descoberta viva exigiria dir ativo (isolamento); Antigravity: não instalado | Repetir `pi --skill h0-staging/skills/<cat>` após restaurar cota, OU sandbox de descoberta controlado |
| Comportamento do **router** `SKILL.md` novo num runtime | Não executado (depende de carga viva) | Mesmo gate acima |
| Cross-refs informativos (forge B2/B6/B9 "See web-testing.md T14") | Resolvidos informalmente; corpos preservados | Opcional: normalizar para `→ skills/web-testing/SKILL.md#T14` num passo cosmético |
| `reports/` e `intake/` não migrados | Fora do escopo skills deste round (operacionais) | Decidir no planejamento do H0.8 |

> **Reforço do seu gate:** compatibilidade end-to-end **não** é considerada aprovada por teste estrutural nem por mero carregamento do arquivo no processo do runtime. Ela permanece **pendente**.

---

## 7. Plano de rollback (sem Git)

- **Agora (pós H0.7):** `rm -rf h0-staging/`. `agents/`, `SKILL.md` raiz e `references/` nunca foram tocados — confirmado por hash (`agents/` aggregate idêntico à baseline). Estado volta ao original sem perda.
- **Gatilho:** qualquer regressão detectada, ou decisão de não prosseguir.
- **Garantia:** nenhum arquivo operacional foi modificado neste round; o rollback é a remoção de um único diretório aditivo.

---

## 8. Recomendação fundamentada sobre H0.8

**NÃO executar o H0.8 ainda.** O H0.8 (arquivar `agents/` → `8-Archive/` e promover a árvore nova a operacional) só deve ocorrer após satisfazer a **condição obrigatória** que você próprio fixou: **carga end-to-end comprovada em ≥1 runtime real**. Hoje essa prova está bloqueada por cota (Pi) / isolamento (Claude Code) / ausência (Antigravity).

**Sequência recomendada:**
1. Destravar a carga end-to-end (Pi com cota restaurada **ou** sandbox Claude Code dedicado).
2. Rodar o agente carregando uma skill convertida e confirmar: descoberta, roteamento pela `description`, leitura do Index, abertura de uma técnica (ex.: `web-testing#T4`) e brief com as 3 policies verbatim.
3. Só então trazer o H0.8 para aprovação específica, com o rollback do doc 11 §7.4 (mover de volta de `8-Archive/`).

Enquanto isso, o `h0-staging/` fica como **evidência e artefato pronto**, sem efeito sobre o HackBot operacional.

---

## 9. Encerramento

H0.1–H0.7 concluídos: estrutura Agent Skills materializada, **perda-zero comprovada em Python e Node**, equivalência integral verde, regressões LF/CRLF/CR e de tipo passando, `agents/` intacto, rollback trivial. **H0.8 permanece bloqueado.**

**Aguardo sua decisão:**
- **(A)** destravar a carga end-to-end (eu reexecuto no Pi quando a cota voltar, ou preparo um sandbox de descoberta para o Claude Code) — **sem H0.8**;
- **(B)** normalizar os cross-refs informativos (passo cosmético) e/ou migrar `reports/`+`intake/` no staging;
- **(C)** revisar qualquer parte do staging / relatório;
- **(D)** manter como está, aguardando a condição obrigatória antes de qualquer H0.8.
