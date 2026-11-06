# 45 — Revisão de Segurança Pré-Migração + Rebranding Final (GO/NO-GO)

> Rodada curta de preparação final: concluir pendências de nomenclatura e auditar a fundo o script
> `migrate-to-synapse.sh` antes da migração física. **Nenhuma migração/`git init`/commit/push no projeto
> real.** Continua [44](44-synapse-rebrand-consolidation.md). Data: 2026-11-06.

## 1. Ajustes de rebranding realizados

| Arquivo | Mudança | Classe |
|---|---|---|
| `SKILL.md` (frontmatter `description`) | Reframe: de "Native-tooling … for restricted environments / **AND** operating constraint 'no installed tooling'" para **"SYNAPSE — modular, runtime-portable offensive security harness (Pi/Antigravity/Claude Code)"**, com native-tooling como **doutrina** (não pré-condição de descoberta). **Todas** as keywords de trigger preservadas + PT-BR | RENAME (editorial) |
| `SKILL.md` (corpo) | `# SecurityAuditor`→`# SYNAPSE`; "defining doctrine of SYNAPSE"; "SYNAPSE Web Runtime"; "For SYNAPSE this field…" | RENAME |
| `references/` (7 arquivos) | `native-tooling-doctrine`, `verification-contract`, `help`, `pattern-index`, `template-technique`, `flows-scope`, `template-files`: nome-produto → SYNAPSE | RENAME |
| `adapters/claude-code.md`, `adapters/pi-agent.md`, `workflows/flows-scope.md` | nome-produto → SYNAPSE | RENAME |
| `.claude/hooks/consult-kb.mjs` | 3 strings de marca visíveis (`[SYNAPSE — standing rule]`, comentário, "invoke the SYNAPSE skill") → SYNAPSE; **lógica inalterada**, `security-auditor` preservado em backticks | RENAME (string user-facing) |

**Semântica de descoberta preservada:** a `description` mantém pentest/security audit/vuln research/LotL/
Windows/AD/privesc/lateral/credential/XSS/IDOR/SSRF/auth-bypass/RCE/workflow-verbs/intake/report/chaos/
forge/code-review/proxy-Caido/cross-engagement + PT-BR. O **fluxo funcional do dispatcher não foi alterado**
(roteamento, consulta à KB, flows intactos; `test-skills` 62/62).

## 2. Identificadores técnicos preservados (COMPAT)

`name: security-auditor` (SKILL.md) · `/security-auditor` (slash slug) · `securityauditor_invoke` (tool Pi,
8+ refs) · `createSecurityAuditorExtension` (API) · `SA_*` · `.hackbot/` · `%LOCALAPPDATA%\SecurityAuditor\`
(path do `bootstrap.bat`). **Nenhum alterado.** Comentários de cabeçalho `// SecurityAuditor —` em
`tools/web-runtime/*.mjs` (internos, não user-facing) **deixados como estão** — varrer fonte por cosmético
violaria "sem substituição indiscriminada / não modificar código sem necessidade". Deferido (opcional).

## 3. Revisão técnica do script (`migrate-to-synapse.sh`)

| Item auditado | Veredito |
|---|---|
| Segurança do backup | `cp -a` (preserva dotfiles/perms/symlinks); backup é **irmão** de OLD, fora da árvore reorganizada |
| Preservação de ocultos | OK — `cp -a` e `mv` levam dotfiles/dot-dirs (`.env`, `.claude`, `.codex`, `.gitignore`) |
| Idempotência | OK — 2ª execução aborta (destino existe); após sucesso, OLD não existe → aborta |
| Tratamento de erros | `set -euo pipefail`; pré-condições checadas; gate de sensíveis com `exit 1` |
| Pré-condições | OK — valida existência de OLD e **ausência** de NEW antes de agir |
| Destino preexistente | OK — aborta no passo 0 sem mover nada |
| Deleções prematuras | OK — `rm -rf` só no **wrapper externo** (resíduo), **após** o produto já estar em NEW; `rmdir` só se vazio |
| Engagements/evidências | OK — `engagements/` segue dentro da árvore movida; nunca deletado; ignorado pelo Git |
| Caminhos absolutos | OK — `.env` `SA_ENGAGEMENT_ROOT` + manifest reescritos **antes** do `git init`; valor não impresso |
| Segurança de credenciais | OK — nada de conteúdo de `.env` impresso; gate verifica **nomes** staged, não conteúdo |
| Ordem do `git init` | OK — depois dos fixes de path (passo 5 > passo 4) |
| Auditoria de sensíveis | OK — gate recusa `.env`/engagements/`.config`/node_modules/__MACOSX/whitebox-log/.aws staged |
| Rollback/falha parcial | OK (ver §9) — backup verificado + instruções de recuperação |

## 4. Correções aplicadas (defeitos comprovados, mínimas)

1. **(b) Verificação de backup não abortava** — `diff -qr … && echo` sob `set -e` **não** interrompe em
   divergência (o lado esquerdo de `&&` é isento), seguindo para o `mv` com backup suspeito. **Corrigido**
   para `if diff …; then OK; else ABORT exit 1; fi` + guarda de backup preexistente. **Comprovado** (cenário
   S4: falha de backup → aborta **antes** do `mv`, fonte intacta).
2. **(h) `git init -q -b main`** depende de git ≥ 2.28. **Corrigido** para `git init -q .` +
   `git symbolic-ref HEAD refs/heads/main` (portável, pré-primeiro-commit). Comprovado (branch=main em S1).
3. **Parametrização por env** (`SYNAPSE_OLD/WRAP/NEW/BACKUP`) com **defaults = caminhos reais** (comportamento
   inalterado em uso normal) — habilita o teste isolado §4 sem tocar o projeto real.

## 5. Teste isolado (fixture descartável) — **31/31 PASS**

Fixture em `mktemp -d` espelhando inner/wrapper/resíduo + dotfiles + engagements + `.config` + node_modules +
`.env` + validador stub. Script real executado **só** contra a fixture (env overrides). Resultados:

- **S1 Happy path (16):** NEW criado; wrapper removido; `.env`/`.gitignore`/`.claude`/`.config`/engagements/
  engagement-`.config` preservados; git na raiz NEW; **branch=main**; backup criado; `.env` reescrito p/ NEW;
  **nenhum sensível staged**; `SKILL.md`/`.env.example` tracked.
- **S2 Destino existe (3):** aborta, fonte intacta, mensagem correta.
- **S3 Backup existe (3):** aborta antes do `cp`, fonte intacta, sem NEW parcial.
- **S4 Falha de backup (3):** aborta **antes do `mv`**, fonte intacta, `mv` não ocorre.
- **S5 Falha intermediária/regressão (4):** sai ≠0, NEW existe (dados salvos), backup existe (recuperável),
  rerun aborta (guarda idempotente).
- **S6 Segunda execução (2):** aborta, 1ª migração intacta.

## 6. Regressões (projeto real)

- **Validador H0:** `T=112/112, B=15/15, total=127/127`.
- **Suites: 26/26 PASS** · **2 NOT RUN** (`test-pi-entry`/`test-pi-rpc` — exigem `PI_PKG_DIR`/`PI_BINARY`;
  Pi real; não é regressão). `test-skills` 62/62 após mudar `description`.
- Hook `consult-kb.mjs` `node --check` OK. Links/assets do README (25 imgs + docs) resolvem. `bash -n` OK.

## 7. Riscos remanescentes

1. **Homologação live Pi/Antigravity** permanece **NOT RUN** (fora desta rodada).
2. **Comentários `// SecurityAuditor —`** em `tools/web-runtime/*.mjs` (internos) não rebrandeados — cosmético
   deferido; zero impacto funcional.
3. **`%LOCALAPPDATA%\SecurityAuditor\`** (bootstrap.bat Windows) mantido por COMPAT — se um dia renomear o
   diretório de estado Windows, atualizar tool + doc juntos.
4. O `mv` move o próprio script; rodar **fora** de sessão viva (header orienta "copiar para fora antes").
5. Diferença de segundo no `STAMP` do backup em execuções muito próximas — mitigado pela guarda "backup já existe".

## 8. Procedimento final e exato de migração

```bash
# 1) Feche esta sessão / editores sobre o diretório atual. Copie o script para fora:
cp /home/pettigrul/projetos/SecurityAuditor/SecurityAuditor/docs/architecture-review/migrate-to-synapse.sh \
   /home/pettigrul/projetos/synapse-migrate.sh
# 2) Rode-o (faz backup verificado → mv → limpeza do wrapper → fix de path → git init → gate → regressões):
bash /home/pettigrul/projetos/synapse-migrate.sh
# 3) Revise e só então comite/publique (manual):
cd /home/pettigrul/projetos/SYNAPSE
git status
git ls-files | grep -E '\.env$|engagements/|\.config$|node_modules/'   # DEVE ser vazio
git commit -m "SYNAPSE: initial import (formerly SecurityAuditor/HackBot)"
git remote add origin <URL_PRIVADA>
git push -u origin main
```

## 9. Procedimento de recuperação

- **Antes do commit:** `rm -rf /home/pettigrul/projetos/SYNAPSE/.git` desfaz o repo (dados intactos).
- **Reverter o `mv`:** `mv /home/pettigrul/projetos/SYNAPSE /home/pettigrul/projetos/SecurityAuditor/SecurityAuditor`
  (ou restaurar do backup: `cp -a <BACKUP>/. /home/pettigrul/projetos/SYNAPSE/`).
- **Falha parcial (S5):** NEW e `<BACKUP>` coexistem; corrija a causa, remova `.git`, e re-execute após mover
  NEW de volta — ou restaure do backup. O backup só deve ser apagado após o novo repo ser verificado.

## 10. Veredito — **GO** ✅

O script é seguro para execução real: backup verificado e abortivo, pré-condições sólidas, sem deleções
prematuras, engagements/evidências/credenciais preservados, ordem de path→`git init` correta, gate de
sensíveis efetivo, rollback claro — **tudo comprovado em 31/31 testes isolados** e regressões **127/127 /
26-suites**. Rebranding público = **SYNAPSE** em todos os pontos de entrada, com identificadores técnicos
preservados. **GO** para `migrate-to-synapse.sh` quando o operador executar fora da sessão viva. Nenhuma
migração/commit/push foi realizada nesta rodada.
