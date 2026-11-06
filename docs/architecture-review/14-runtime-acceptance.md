# 14 — Aceitação End-to-End em Runtime (Sandbox Claude Code)

> **Validação end-to-end executada em sandbox isolado do Claude Code.** H0.8 **não executado**; `agents/`, `SKILL.md` raiz, `references/` e `CLAUDE.md` originais **não modificados** (verificado por hash). O sandbox é descartável e vive no scratchpad da sessão, **fora** dos diretórios de descoberta ativos do HackBot.
> Regra de aceite aplicada: **menção ao nome da skill NÃO conta**; exijo evidência de *acesso e uso do conteúdo correto* (trecho único do corpo reproduzido + tool_use de leitura).

---

## 1. Etapa 1 — Sandbox

- **Runtime:** Claude Code **2.1.312** (confirmado por `claude --version`).
- **Mecanismo de descoberta (verificado):** skills são diretórios com `SKILL.md` (frontmatter YAML `name`/`description`) em `~/.claude/skills/` (usuário) e `<projeto>/.claude/skills/` (projeto). O agente seleciona pela `description` e carrega via tool `Skill`.
- **Sandbox:** `"$SCRATCH"/h0-sandbox/` com `.claude/skills/` contendo **cópias** de duas skills convertidas, renomeadas com prefixo para evitar colisão com a skill `code-review` já instalada em `~/.claude/skills`:
  - `secaudit-proto-web-testing` (cópia de `h0-staging/skills/web-testing/SKILL.md`; só a linha `name:` do frontmatter alterada — corpos das técnicas **intactos**).
  - `secaudit-proto-forge` (cópia de `h0-staging/skills/forge/SKILL.md`).
- **Sem symlinks** para arquivos operacionais. Nada em `agents/`/`SKILL.md`/`references/`/`CLAUDE.md` foi tocado.
- **Execução:** `claude -p` (headless), `--output-format stream-json --verbose`, **ferramentas restritas a `Read Grep Glob Skill`** (sem Bash → sem execução de payload). Cenários fictícios, sem alvo real.

---

## 2. Etapa 2+3 — Matriz de resultados e evidências

| # | Cenário | Skill selecionada (tool `Skill`) | Arquivos efetivamente carregados | Técnica | Evidência de USO do conteúdo (trecho único do corpo) | Esperado vs Observado |
|---|---------|----------------------------------|----------------------------------|---------|------------------------------------------------------|------------------------|
| **1** | **Descoberta** — XSS refletido no parâmetro `q`, sem indicar skill | `secaudit-proto-web-testing` | `SKILL.md` da skill (via tool Skill) | **T1** | Reproduziu o canário literal `$canary = "hkaud" + (Get-Random -Max 9999)` e a pitfall verbatim sobre WAF (`onerror`, `onload`, SVG) | ✅ Esperado T1 + descoberta sem nome → **observado idêntico** |
| **2** | **Progressive disclosure** — mesmo XSS; só a técnica pertinente | `secaudit-proto-web-testing` | `SKILL.md` da skill | **T1** (apenas) | Declarou total **15 técnicas (T1–T15)**, selecionou **só T1** e justificou a exclusão de T2–T15 citando o gatilho de cada uma | ✅ Seleção correta e única → **observado idêntico** (ressalva §4.1) |
| **3** | **Roteamento** — autorização horizontal (IDs sequenciais `/api/orders/{id}`) | `secaudit-proto-web-testing` | `SKILL.md` da skill | **T5 (IDOR)** | Citou ids de exemplo `/api/orders/1001`→`1002`, `Authorization: Bearer $tokenUserA` e a pitfall verbatim *"compare field values, not just status codes. Test PUT/DELETE too"* | ✅ Esperado T5 → **observado idêntico** |
| **4** | **Cross-reference** — ferramenta p/ extrair SQLi cega (exige 2 skills) | `secaudit-proto-forge` **→** `secaudit-proto-web-testing` | `forge/SKILL.md` (tool Skill) → **Grep** por `T4` em web-testing → **Read** `web-testing/SKILL.md` offset 109 limit 80 | **B9 → T4** | Citou o stub de delegação de B9 (*"See web-testing.md T4 — … IS the forge blueprint"*) e o mecanismo de T4: busca binária por caractere `ASCII(SUBSTRING(...))`, modos boolean (`len(r.read()) > 500`) e time (`WAITFOR DELAY '0:0:2'`, corte 1.5s) | ✅ Esperado B9→T4 com resolução cruzada → **observado idêntico** |

**Runtime/versão de todos os cenários:** Claude Code 2.1.312, `node v22.23.1` subjacente. Prompts completos e transcrições JSON preservados no scratchpad (`sc1..sc4.jsonl`).

### Prova de que não é "mera menção ao nome"
Em cada cenário o agente **reproduziu conteúdo que só existe no corpo da técnica** (canário `hkaud`; ids `1001/1002` + pitfall literal; mecânica `ASCII(SUBSTRING`/`WAITFOR DELAY`). No cenário 4 há ainda **tool_use explícito** (`Grep` + `Read` com offset) atravessando da skill `forge` para a skill `web-testing` — evidência objetiva de acesso ao arquivo correto da segunda skill.

---

## 3. Etapa 4 — Regressão (pós-testes)

Validador Node (`h0-staging/validate_h0.mjs`) reexecutado: **overall OK**.

- **bodies:** 127/127, 0 faltando, 0 extra.
- **policies:** 3/3 hashes idênticos, marcadores + Rule 0 presentes.
- **routing:** 15 categorias roteadas, 0 quebradas.
- **regression:** newline ✓, CRLF ✓, CR ✓, tier0 99/99, tier1 13/13, blueprint 15/15, delegados 3/3.
- **`agents/` intacto:** multiset de corpos recomputado == baseline (127). Aggregate `5f6fa768…` inalterado.
- **Arquivos operacionais:** nenhuma modificação fora de `docs/` e `h0-staging/` (o sandbox está no scratchpad, não operacional).

---

## 4. Limitações, desvios e pendências

### 4.1 Progressive disclosure: físico vs comportamental (desvio relevante)
A tool `Skill` do Claude Code carrega o **`SKILL.md` inteiro** da skill no contexto. Como, neste H0, `web-testing` permanece um único arquivo com T1–T15, **todos os corpos entram no contexto** ao carregar a skill; a seleção de "apenas T1" (cenário 2) é **comportamental/seletiva** (o agente escolhe e justifica), **não isolamento físico**.
- **Contraprova positiva:** no cenário 4 o disclosure **físico entre arquivos** funcionou — o agente leu só a fatia de T4 (`Read offset 109 limit 80`), não o arquivo inteiro.
- **Recomendação:** executar o **split de `web-testing` por classe** (doc 08 §0.3 / Fase 2) para tornar o disclosure intra-arquivo físico (cada classe em `references/<classe>.md`), reduzindo carga de contexto. É melhoria, **não** bloqueio do H0.

### 4.2 Runtimes ainda não verificados end-to-end
| Runtime | Status | Motivo |
|---------|--------|--------|
| **Claude Code 2.1.312** | ✅ **VERIFICADO** (4/4 cenários, com evidência de conteúdo) | — |
| **Pi Agent 1.4.0** | ⛔ **BLOCKED** | Cota da conta esgotada (`400 "out of extra usage"`, Fase 0.2) — não simulado |
| **Antigravity** | ⏳ **PENDENTE** | Runtime não instalado no host |

> Classificação honesta: Pi e Antigravity **não** foram aprovados nem reprovados — ficam BLOCKED/PENDENTE sem simulação, conforme instruído.

### 4.3 Outras
- Colisão de nomes contornada por prefixo `secaudit-proto-` no sandbox (metadado; não afeta corpos nem a staging real).
- `~/.claude/skills` global coexiste no sandbox; não interferiu (skills prefixadas são distintas).

---

## 5. Recomendação sobre o gate H0.8

A **condição obrigatória** que você fixou — *carregamento end-to-end em ≥1 runtime real* — está agora **SATISFEITA no Claude Code 2.1.312**, com evidência de descoberta, roteamento, progressive disclosure (físico entre arquivos no cenário 4) e **uso do conteúdo correto**, não mera menção. A regressão permanece verde e `agents/` intacto.

**Recomendação:** **GO condicional para H0.8**, com as ressalvas:
1. H0.8 exige **aprovação específica sua** (não executo sem ela).
2. Antes do arquivamento, aplicar o **split de `web-testing`** (Fase 2) é recomendável para disclosure físico, mas **não** é pré-requisito do gate.
3. Pi e Antigravity permanecem como verificações **desejáveis** (não bloqueantes pelo critério "≥1 runtime"): reexecutar Pi quando a cota voltar; Antigravity quando houver host.
4. H0.8 seguirá o rollback do doc 11 §7.4 (mover de volta de `8-Archive/`, sem Git).

**Alternativa conservadora:** adiar H0.8 até também confirmar o Pi end-to-end (fecha a portabilidade Pi↔Claude com prova dupla). Custo: esperar a cota.

---

## 6. Encerramento

Aceitação end-to-end concluída no Claude Code (4/4 com evidência de conteúdo); regressão verde; árvore operacional intacta; Pi BLOCKED e Antigravity PENDENTE sem simulação. **Não promovi a migração.**

**Solicito aprovação específica para o H0.8** (ou a alternativa conservadora de aguardar o Pi). Opções:
- **(A)** Autorizar **H0.8** (arquivar `agents/`→`8-Archive/`, promover `h0-staging/` a operacional) — com rollback do doc 11 §7.4.
- **(B)** Autorizar primeiro o **split de `web-testing`** (Fase 2) no staging e revalidar, **depois** reavaliar H0.8.
- **(C)** **Adiar H0.8** até confirmar o Pi end-to-end (aguardar cota).
- **(D)** Revisar evidências/relatório antes de decidir.
