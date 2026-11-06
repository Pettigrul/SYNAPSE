# 12 — Relatório de Aceitação (Fase 0.2)

> **Fase 0.2 executada.** Objetivo: demonstrar que a estrutura de Agent Skills (`SKILL.md` + `references/`) carrega em runtimes reais (Pi, Antigravity, Claude Code) sem perda de conhecimento, sem quebrar progressive disclosure nem o roteamento. **H0 NÃO foi iniciado.** Nenhum arquivo operacional do HackBot foi modificado; `~/.pi/agent/skills` intacto. Todo o protótipo é **isolado e descartável**, fora de qualquer diretório de descoberta ativo.
> **Princípio aplicado:** distingo rigorosamente **teste executado** de **compatibilidade só documentada**, e classifico runtime ausente/bloqueado como **não verificado + teste pendente** (nunca reprovação automática).

---

## 1. Artefatos da Fase 0.2 (todos descartáveis, em `docs/architecture-review/acceptance/`)

| Arquivo | Função |
|---------|--------|
| `acceptance/prototype-skill/security-auditor-proto/SKILL.md` | Protótipo de skill: frontmatter (`name`/`description`) + `## Index` + loading protocol. **Não embute policies** (fora do escopo do teste). |
| `acceptance/prototype-skill/security-auditor-proto/references/web-testing.md` | `## Techniques` com **T1 (simples, Tier-0)** e **T4 (complexa, Tier-1 Python, múltiplas etapas)** copiadas **verbatim** de `agents/web-testing/web-testing.md`. |
| `acceptance/loader_node.mjs` | Loader/validador em **Node.js stdlib puro** (sem npm, sem binário). Exercita descoberta, parse de frontmatter, resolução de `references/`, progressive disclosure, roteamento e **perda-zero vs baseline V1**. |

Sessões efêmeras do Pi foram gravadas no scratchpad (não no diretório ativo).

---

## 2. Matriz por runtime

| Runtime | Instalado aqui? | Formato de skill (ground truth observado) | Mecanismo de carga / isolamento | Teste executado | Status |
|---------|-----------------|-------------------------------------------|---------------------------------|-----------------|--------|
| **Claude Code** | ✅ (runtime atual) | `~/.claude/skills/<nome>/SKILL.md` + `.md` irmãos; frontmatter `name`, `description` (+`license`, `allowed-tools`, `metadata.user-invocable`) — verificado em `ctf-crypto`, etc. | Descoberta por diretório (`~/.claude/skills`, `.claude/skills`, plugins). Sem flag de path avulso para sessão corrente. | Conformidade de frontmatter do protótipo ao contrato real (via `loader_node.mjs`) | ✅ **Formato verificado**; carga viva por descoberta **não injetada** (isolamento — proibido mexer no dir ativo) |
| **Pi Agent** | ✅ `pi 1.4.0` | `~/.pi/agent/skills/<nome>/SKILL.md` + `.md` irmãos; frontmatter `name`/`description` — **idêntico** ao Claude (verificado em `diagnose-crash`, `frontend-design`, `omarchy`) | `--skill <dir>` (carga explícita isolada), `--no-skills`, `AGENTS.md`/`CLAUDE.md` como context-files | `pi -p --skill <proto> --no-tools` (sessão efêmera, modelo leve) | ⚠️ **Mecanismo e formato verificados; carga end-to-end PENDENTE** (ver §3.3 — cota da conta esgotada) |
| **Antigravity** | ❌ não instalado | — (modelo documentado: lê `AGENTS.md`) | `AGENTS.md` (o HackBot já o gera no Flow 8) | — | ⏳ **Não verificado — teste pendente** (runtime ausente neste host) |

---

## 3. Testes executados e resultados observados

### 3.1 Perda-zero na cópia (executado, determinístico)
Os corpos de T1 e T4 no protótipo têm hash **idêntico** à baseline V1:

| Técnica | sha256 baseline | sha256 protótipo | Veredito |
|---------|-----------------|------------------|----------|
| `web-testing#T1` | `78650c6b…303c63` | `78650c6b…303c63` | ✅ MATCH |
| `web-testing#T4` | `4924315e…c126c7d` | `4924315e…c126c7d` | ✅ MATCH |

### 3.2 Carga, disclosure e roteamento em **Node** (executado — prova de suficiência de Node)
`node loader_node.mjs <proto> <tag>`:

- **Descoberta:** `SKILL.md` localizado; `references/web-testing.md` resolvido. ✅
- **Frontmatter:** `name`/`description` presentes; 0 campos obrigatórios ausentes. ✅
- **Roteamento:** tag `sqli`→T4 e `xss`→T1 casam pela `description` e pelas Tags do Index. ✅
- **Progressive disclosure:** carrega só o Index (~2,3 KB) e, no match, só o corpo da técnica casada (T4=2149 B de 3946 B totais → ~46% economizado). Linha não casada nunca é lida. ✅
- **Perda-zero cross-runtime:** hash do corpo carregado == baseline. `xss`→exit 0; `sqli`→exit 0. ✅

### 3.3 Carga real no Pi (executado, mas **inconclusivo** por ambiente)
`pi -p --no-tools --no-session --skill <proto> ...` alcançou a camada de modelo e **falhou com `400 "You're out of extra usage"`** — **cota da conta esgotada**, não erro de skill.
- **Controle negativo:** `--skill <inexistente>` e `--skill <dir vazio>` também chegaram ao modelo com o **mesmo** erro de cota ⇒ o Pi **não falha-rápido** num `--skill` inválido.
- `--verbose` em modo `-p` **não loga** o carregamento da skill antes da chamada ao modelo.
- **Conclusão honesta:** não há sinal determinístico de que o Pi parseou *especificamente* este protótipo. A carga end-to-end do Pi fica **pendente** até a cota ser restaurada (`claude.ai/settings/usage`). **Não é reprovação** — é bloqueio ambiental.

---

## 4. Funcionalidades não testadas e motivo

| Não testado | Motivo | Como destravar |
|-------------|--------|----------------|
| Eco do Index pelo agente Pi (confirmação em nível de modelo) | Cota da conta Anthropic esgotada (400) | Repetir `pi -p --skill <proto>` após restaurar cota |
| Auto-descoberta viva no Claude Code | Exigiria colocar o protótipo em `.claude/skills` (diretório ativo) — vedado pelo escopo (isolamento) | Teste controlado futuro em sandbox dedicado, fora do dir ativo |
| Qualquer coisa no Antigravity | Runtime não instalado neste host | Instalar/abrir Antigravity e carregar via `AGENTS.md` |
| Embutir/validar as 3 Execution Policies no brief | Fora do escopo da 0.2 (só carga de conhecimento) | Validar no H0 (critério C7/C8 do V1) |

---

## 5. Diferenças de carregamento, roteamento e referências (achados)

- **F1 — Normalização de quebra de linha entre runtimes (achado executado e corrigido).** O hash do corpo da **última** técnica de um arquivo divergiu entre Python (`str.splitlines()`, descarta `\n` final) e Node (`string.split("\n")`, gera elemento vazio final). Sem normalizar, o verificador de perda-zero em Node marca falso-DIFF. **Corrigido** no `loader_node.mjs` (função `splitlines`). ⇒ **Vira critério de aceite** (§7): o validador do H0 deve usar splitting idêntico ao V1, qualquer que seja a linguagem.
- **F2 — Formato de skill é o mesmo nos três.** Pi e Claude Code usam `SKILL.md` + frontmatter `name`/`description` + `.md` irmãos — idêntico ao alvo do H0. Antigravity usa `AGENTS.md` (já gerado pelo Flow 8). ⇒ portabilidade real, não só documental, para Pi↔Claude.
- **F3 — Roteamento tem duas fontes a conciliar.** No HackBot o roteamento é o `pattern-index` (keyword→arquivo). No Agent Skills nativo, o roteamento é a `description` da skill (o modelo escolhe pela descrição). ⇒ o H0 deve **derivar a `description` a partir das keywords do pattern-index**, para não ter duas fontes divergentes.
- **F4 — Pi não valida `--skill` de forma estrita.** Carrega "best-effort"; não falha em path inválido. ⇒ a validação de integridade não pode depender do runtime; tem de ser o nosso validador (V1/porte Node).

---

## 6. Python é exigido? (pergunta explícita do enunciado)

**Não.** A **validação** da arquitetura de skills roda inteiramente em **Node.js stdlib** (`loader_node.mjs`: descoberta, frontmatter, `references/`, disclosure, roteamento, perda-zero) — compatível com o Windows corporativo, que tem Node/npm.

- O validador de baseline (`validate_v1.py`) é **Python**, mas é ferramenta de **dev-host**; para o ambiente corporativo, recomenda-se **portar V1 para Node** (os checks C1–C9 são triviais de reimplementar; F1 já mapeia o cuidado de hashing).
- **Distinção importante:** algumas técnicas têm *payloads* Tier-1 em Python (ex.: T4). Esses rodam **no alvo**, sob a doutrina native-tooling (escalada justificada), **não no harness**. A validação e a operação do harness **não** dependem de Python.

---

## 7. Critérios de aceite para autorizar H0.1–H0.7

Para liberar a migração H0 (ainda não autorizada), exigir **todos**:

1. **Validador em Node** (porte do V1) reproduz o `baseline_aggregate_sha256` sobre `skills/` — perda-zero, com splitting normalizado (F1).
2. **Frontmatter válido** (`name`+`description`) em cada `SKILL.md`, parseável pelos dois runtimes (contrato F2).
3. **`description` derivada do `pattern-index`** (fonte única de roteamento — F3); todo trigger resolve para uma skill.
4. **Progressive disclosure** preservado: Index-only e corpo só no match (C4 do V1 verde na árvore nova).
5. **Carga end-to-end verificada em ≥1 runtime** de verdade: Pi (`--skill` após cota restaurada) **ou** Claude Code (descoberta controlada em sandbox) — executado, não só documentado.
6. **Policies verbatim** (C7/C8 do V1) e **contagem 127** preservadas.

Enquanto (1)–(4) e (6) já têm caminho comprovado nesta fase, **(5) é a lacuna**: depende de cota (Pi) ou de ambiente de sandbox (Claude Code).

---

## 8. Recomendação sobre a viabilidade do H0

**Viável, com uma ressalva.** A estrutura-alvo é o formato **nativo** de Pi e Claude Code (F2), a perda-zero é mensurável e já reproduzida em Node (§3.1–3.2), e o disclosure/roteamento funcionam (§3.2). As diferenças achadas (F1, F3) são pequenas e já têm correção/decisão. **Ressalva:** a carga viva end-to-end num runtime (critério 7.5) ainda **não foi comprovada** — Pi por cota, Claude Code por isolamento, Antigravity por ausência. Recomendo **destravar o critério 7.5 antes do H0.8** (arquivamento), mantendo o H0.1–H0.7 reversível por cópia conforme o doc 11.

---

## 9. Encerramento — aprovação específica solicitada

Fase 0.2 concluída: protótipo isolado, perda-zero reproduzida em Node, formato confirmado idêntico em Pi e Claude Code, roteamento/disclosure exercitados, Python descartado como exigência de validação, e limitações declaradas sem presumir compatibilidade. **Não avancei para o H0.**

Para prosseguir, escolha:

- **(A)** **Destravar o critério 7.5** primeiro: eu reexecuto o teste de carga no Pi quando você restaurar a cota (`claude.ai/settings/usage`), ou preparo um sandbox controlado de descoberta para o Claude Code — **sem iniciar H0**.
- **(B)** Autorizar **H0.1–H0.7** (migração por cópia + porte Node do validador), **parando antes do H0.8**, aceitando 7.5 como pendência a fechar antes do arquivamento.
- **(C)** Ajustar critérios/escopo antes de qualquer execução.
- **(D)** Descartar o protótipo agora (`rm -rf docs/architecture-review/acceptance/`) ou mantê-lo como evidência (recomendo manter até o H0).
