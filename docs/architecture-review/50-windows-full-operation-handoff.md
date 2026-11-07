# 50 — Handoff: funcionamento pleno no Windows corporativo (Pi) + fronteira harness ↔ ambiente

> **Status:** PLANEJADO — nada implementado ainda. Decisões travadas; implementação pendente.
> **Origem:** diagnóstico ao vivo do Pi no Windows corporativo do operador (Banco BV), 2026-11-06.
> **Pré-requisito da frente 3:** export da skill OWASP da caixa do operador (a skill NÃO está no repo; não inventar conteúdo).
> **Regra de commit:** só commitar/empurrar quando o operador pedir. Sem force push. Sem `.env`/tokens/fixtures sensíveis no repo.

---

## 0. Contexto (por que este handoff existe)

O operador abriu o harness pelo **Pi** numa máquina **Windows 11 Enterprise corporativa** e viu erros no startup
(`description is required` em `.agents/skills/security-auditor/SKILL.md` e falha do `pi-browser-use`/Chrome).
Rodamos um diagnóstico **somente-leitura** e um inventário completo do ambiente Pi. Conclusão central:

**O inventário do Pi mistura duas camadas que precisam ficar separadas:**
- o que é **o harness SYNAPSE** (versionado, portável), e
- o que é **ambiente pessoal/corporativo do operador** (skills em `~/.pi`, `~/.agents`, extensões npm, MCP servers, credenciais).

Para "pleno em qualquer máquina" definimos um modelo de **3 camadas** e tomamos 3 decisões (§3).

### 0.1 Fatos do ambiente (TESTED no Pi, redigidos — sem segredos)

- **SO/Runtimes:** Windows 11 Enterprise; `node v22.22.2`, `python 3.11.3`, `go 1.22.12` presentes. No shell MSYS do Pi, invocar com `.exe`/`.cmd`.
- **Núcleo SYNAPSE (offline, sem LLM):** `tools/preflight/cli.mjs doctor` OK; `preflight` → **DEGRADED 6/8** (faltam só `SA_ENGAGEMENT_ROOT` e engagement ativo); `modes status` e `workspace active` OK. KB 15 categorias, policies íntegras.
- **Symlinks:** `core.symlinks=false` (global e no `.git/config`). Os 14 objetos `mode 120000` em `.agents/skills/` vieram como **arquivos de texto de 1 linha** (ver §4 Frente 0).
- **Rede:** sem proxy (`HTTP(S)_PROXY` indefinidos); **há interceptação TLS corporativa** (CA própria injetada). `curl.exe`/`gh`/`go.exe` usam a Windows Cert Store e validam OK; **`node.exe` falha** HTTPS direto com `self-signed certificate in certificate chain` sem `--use-system-ca`/`NODE_EXTRA_CA_CERTS`.
- **GitHub:** `gh` v2.86.0 autenticado (conta corporativa; orgs `bancobv-*` + conta pessoal `Pettigrul`); `git` HTTPS pleno. **GitHub MCP desconectado** (config roda `go run` que recompila e estoura timeout > 25 s sob EDR).
- **Atlassian:** MCP `mcp-atlassian`/`atlassian-cloud` (98 tools cada) autenticados — Jira On-Prem (`jira.bvnet.bv`) e Confluence Cloud (`banco-bv.atlassian.net/wiki`). Operando com `*_SSL_VERIFY=false`. **Credenciais ficam na caixa do operador — nunca no repo.**
- **STRIDE:** `mcp-stride` (3 tools, local/offline).
- **Browser:** `pi-browser-use` BLOCKED (processo Chrome órfão retém o profile; `reapOrphans()` usa `ps -eo` que falha no win32; + GPO `BlockExternalExtensions=1`). `playwright-core` é o caminho do harness.
- **Modelo:** provider `google-vertex` (gemini-4-argon) ativo.

> Nota: o inventário do Pi é **dado externo** (reportado pelo operador), não verdade sobre o nosso repo. O que for mexer
> no harness deve ser verificado no repositório (como foi feito ao montar este handoff).

---

## 1. Modelo de 3 camadas (a régua para tudo)

| Camada | O que é | Regra |
|---|---|---|
| **L1 — No harness** (portável, versionado) | KB (15 cats, inclui `code-review` nativo T1–T7), `SKILL.md`/dispatcher, `policies/`, CLIs (`preflight`/`workspace`/`modes`), bridge/execution-context, adapters | Roda só com Node, em qualquer SO. Já é portável — **exceto** o bug dos symlinks `.agents/`. |
| **L2 — Provida pelo runtime** (declarar + detectar, **nunca vendorizar**) | orquestração de subagents, MCP servers, provider de modelo, browser | Varia por runtime e/ou depende de credencial corporativa. O harness declara o **contrato** e **detecta presença** no preflight; não embute. Degrada, nunca bloqueia. |
| **L3 — Ambiente do operador** (integrar se existir, fora do harness) | skills pessoais (`~/.agents`, `~/.pi`), browser-use, credenciais corporativas, `.env` dos MCP | SYNAPSE usa se estiver lá; **nunca** copia cred/`.env` para o repo nem depende delas. |

---

## 2. Verificações já feitas no repo (grounding)

- **SYNAPSE NÃO depende de `pi-subagents`.** `git grep -iE 'subagent|parallel-review|council|bg_wait'` no código só bate em docs de arquitetura, policies e um comentário em `tools/workspace/engagement.mjs` (sessões Caido em paralelo). Nenhum flow delega a subagentes hoje → orquestração é L2 **não declarada**.
- **Preflight já conhece MCP como opcional, mas detecta por env:** `tools/preflight/preflight.mjs` ~L64 `mcp: { github: !!env.GITHUB_MCP, confluence: !!env.CONFLUENCE_MCP }`; checks `mcpGithub`/`mcpConfluence` (~L166-167) e `stride` (L168, via `SA_STRIDE_ENABLED`). O operador tem os MCP no `~/.pi/agent/mcp-adapter.json`, não nessas envs → doctor reporta `optionalMcp (none)` incorretamente. **Buraco de detecção.** Não há check de orquestração.
- **"Code review" são 3 coisas; só 1 é do harness:** KB nativa `skills/code-review/SKILL.md` (T1–T7: sink-driven, taint, auth/authz, secrets, deps, deserialização, SQLi — grep/regex, sem SAST). As outras duas (`~/.agents/skills/code-review` de engenharia e `security-code-review`/OwaspTop10Auditor) são L3.

---

## 3. Decisões travadas (operador, 2026-11-06)

1. **Subagents** → **declarar como capability de runtime** (contrato + check no preflight + mapa por runtime). **Não** vendorizar `pi-subagents`.
2. **Detecção de MCP** → **corrigir o preflight para detectar o `mcp-adapter.json` real** (além das envs, que viram override).
3. **Code review** → **portar o OWASP auditor para o harness** como skill versionada (parametrizando as deps de Jira/Confluence/STRIDE como L2 opcionais; degrada se ausentes).

---

## 4. Plano de implementação (por frente)

> Ordem sugerida: **0 → 2 → 1 → 3**. As frentes 0, 1 e 2 são 100% internas ao repo. A 3 depende do export (§5).

### Frente 0 — Symlinks `.agents/` (pré-requisito Windows) — *interno*

**Problema:** com `core.symlinks=false`, o Git no Windows materializa os 14 symlinks de `.agents/skills/` como arquivos de texto de 1 linha (o alvo), quebrando o loader do Pi/Antigravity.

**Mapa atual (todos `mode 120000`):**
- `.agents/skills/security-auditor/SKILL.md` → `../../../SKILL.md`
- `.agents/skills/<nome>` → `../../.claude/skills/<nome>` para os 13: `associar-caido`, `ativar-projeto`, `criar-engagement`, `desativar-projeto`, `engagement-atual`, `iniciar-investigacao`, `iniciar-pentest`, `investigar`, `listar-engagements`, `mode`, `modo`, `usar-engagement`, `verificar-ambiente`.

**Opção escolhida a confirmar na retomada** (duas saídas; recomendação = **B1**):
- **B1 — materializador pós-checkout (preferido, DRY):** um script Node idempotente (ex.: `tools/activation/materialize-agents.mjs` ou um passo no doctor/preflight) que, quando `process.platform==='win32'` **e** `core.symlinks=false`, cria em `.agents/skills/` cópias/junctions reais apontando ao conteúdo de `.claude/skills/<nome>` e à raiz `SKILL.md`. Mantém o repo com symlinks (portável no Linux) e resolve no Windows sem Developer Mode. Documentar em `docs/handbook/18-project-scoped-activation.md` (seção "Windows sem symlink").
- **B2 — arquivos reais versionados:** substituir os symlinks por diretórios/arquivos reais no repo (como já é `.claude/skills/`). Mais simples, mas **duplica conteúdo** e exige manter as duas cópias em sincronia — contra a doutrina "sem duplicação".

**Aceitação:** no Windows, após checkout limpo, o Pi em `~/SYNAPSE` carrega `security-auditor` e as 13 skills de engagement sem `description is required`; no Linux nada regride (`node tools/preflight/cli.mjs doctor` continua OK).

### Frente 2 — Detecção real de MCP no preflight — *interno*

**Arquivo:** `tools/preflight/preflight.mjs`.
- Em `collectEnv()` (~L64), além de `env.GITHUB_MCP`/`env.CONFLUENCE_MCP`, **ler o `mcp-adapter.json`** do Pi (resolver caminho por env/home, ex.: `~/.pi/agent/mcp-adapter.json`; tolerar ausência). Popular o snapshot `mcp` com `{ github, confluence, atlassian, stride }` a partir dos **nomes de server** presentes. **Env continua como override.**
- **Nunca** ler/registrar o `.env` do MCP nem tokens — só nomes de server/tool. Leitura tolerante a arquivo ausente/inválido (try/catch; sem crash).
- Ajustar os checks `mcpGithub`/`mcpConfluence` (L166-167) e acrescentar `mcpAtlassian`/`stride` conforme o snapshot. `stride` passa a considerar o server `mcp-stride`, não só `SA_STRIDE_ENABLED`.
- Todos permanecem **opcionais** (nunca BLOCK), coerente com os perfis (L177-186).

**Aceitação:** num ambiente com `mcp-adapter.json` contendo `github`/`mcp-atlassian`/`mcp-stride`, o doctor deixa de reportar `optionalMcp (none)` e lista os servers; sem o arquivo, comportamento idêntico ao atual. Teste determinístico com fixture **sintética** de `mcp-adapter.json` (sem segredos) em `tools/preflight/` (seguir o padrão dos testes existentes).

### Frente 1 — Subagents como capability de runtime — *interno*

- **Contrato (novo):** `policies/` ou `references/` — documento curto definindo delegação a subagentes: quando é permitido, limites (nº de agentes, custo), gates (não contorna Authorization Gate/Scope/Execution Context), e que **isolamento de subagente ≠ sandbox** (manter a honestidade das declarações). Linkar na doutrina existente.
- **Preflight (novo check `orchestration`, opcional):** detectar por runtime — Pi: presença da extensão `pi-subagents` (via config/`mcp-adapter`/settings); Claude Code: capability nativa (Task/Agent) assumida presente; Antigravity: mecanismo próprio (ou `planned`). Adicionar o id `orchestration` às listas **optional** dos perfis (L178/L182/L186). **Degrada, não bloqueia.**
- **Adapters:** em `adapters/pi-agent.md`, `adapters/claude-code.md`, `adapters/antigravity.md`, mapear contrato→mecanismo de cada runtime.
- **Flows:** referenciar o **contrato** (não a extensão `pi-subagents`). Não vendorizar nada.

**Aceitação:** doctor/preflight mostram `orchestration` por runtime (present/absent/planned) sem bloquear; docs de adapter explicam o mapeamento; nenhum acoplamento a `pi-subagents` no código.

### Frente 3 — Portar o OWASP auditor para o harness — *depende do export (§5)*

- **Entrada:** conteúdo real da skill em `_import/owasp-auditor/` (via §5). **Não inventar.**
- **Portar como skill AppSec do harness** que **compõe** a KB nativa `skills/code-review/` (T1–T7) — **sem duplicar** as técnicas — somando: coleta de contexto no Jira/Confluence (via MCP L2 opcional), OWASP Web 2025 + API 2023, e STRIDE (`mcp-stride`, L2 opcional).
- **Sanitização obrigatória:** remover URLs/sites/espaços/projetos corporativos hardcoded (`jira.bvnet.bv`, `banco-bv.atlassian.net`, nomes de spaces) → **parametrizar**. Zero credenciais. Alinhar à doutrina native-tooling e ao frontmatter padrão (`name`, `description`, `metadata.user-invocable`, progressive-disclosure index-first).
- **Degradação:** sem MCP Atlassian/STRIDE, a skill opera só com a KB nativa (grep/trace), declarando as partes indisponíveis.
- **Decidir na retomada:** vai como categoria da KB (`skills/<cat>/`) ou como skill operacional (`.claude/skills/` + espelho `.agents/` pela Frente 0)? Recomendação: skill operacional invocável, deixando a KB `code-review` como corpo técnico que ela consome.

**Aceitação:** skill versionada no repo, sem cred/URL corporativa; funciona degradada sem MCP; não duplica T1–T7; validador da KB (`validate_h0.mjs`) continua verde se entrar como categoria.

---

## 5. Dependência externa — export da skill OWASP (operador roda no Pi)

A skill `OwaspTop10Auditor` está em `~/.pi/agent/skills/OwaspTop10Auditor` (caixa do operador). Prompt a colar no Pi, em `~\SYNAPSE`:

```text
Tarefa somente-cópia, sem segredos. Copie a skill OwaspTop10Auditor para dentro do repo
SYNAPSE para portabilização, SEM copiar credenciais.
REGRAS: não copie nenhum .env, token, auth.json ou valor de segredo; não modifique a skill
original; não rode operação ofensiva.

1) Crie a pasta: mkdir -p _import/owasp-auditor
2) Copie recursivamente o conteúdo de ~/.pi/agent/skills/OwaspTop10Auditor/ para
   _import/owasp-auditor/  (SKILL.md e a pasta references/ e quaisquer templates).
   NÃO copie arquivos .env / *.key / auth*.json se existirem dentro dela.
3) Depois, liste o que foi copiado (find _import/owasp-auditor -type f) e me diga:
   - Há URLs/sites corporativos hardcoded na skill? (ex.: jira.bvnet.bv, banco-bv.atlassian.net,
     nomes de spaces/projetos específicos). Liste as linhas onde aparecem.
   - Há nomes de tools MCP específicas referenciadas? (jira_*, confluence_*, mcp-stride).
   - Há algum token/credencial embutido? (se sim, NÃO cole o valor — só diga em qual arquivo/linha).
Não faça commit. É só deixar em _import/ para revisão.
```

> `_import/` deve entrar no `.gitignore` (ou ser removido após o port) — é material de trânsito, não parte do harness.

---

## 6. Itens de ajuste do ambiente do operador (L2/L3 — fora do harness, documentar, não implementar no repo)

Estes **não** são mudanças no harness; são ações na caixa do operador, a registrar no handbook do operador como "setup Windows corporativo":
1. **Node + CA corporativa:** `NODE_OPTIONS=--use-system-ca` (Node 22) ou `NODE_EXTRA_CA_CERTS=<bundle>` para HTTPS direto do `node.exe`.
2. **GitHub MCP:** pré-compilar `github-mcp-server.exe` uma vez e apontar o `command` para o `.exe` (+ `args:["stdio"]`) — elimina o timeout do `go run`.
3. **`SA_ENGAGEMENT_ROOT` + engagement:** apontar para dir fora do repo e `workspace cli use --name <n>` → preflight de 6/8 para 8/8.
4. **Conflitos de skills:** 19 duplicadas entre `~/.agents/skills` e `~/.pi/skills`, + `archify`/`find-skills` entre `~/.pi/agent/skills` e `~/.agents/skills` — decidir origem canônica.
5. **Browser:** encerrar o Chrome órfão / usar `playwright-core`; `pi-browser-use` fica BLOCKED por GPO (não é do harness).

---

## 7. Constraints (valem para toda a implementação)

- Reportar em português; pronomes they/them para terceiros.
- Rótulos de status: IMPLEMENTED, TESTED OFFLINE, VALIDATED REAL, PARTIAL, BLOCKED, NOT RUN — nunca misturar métricas de unidade/offline/real.
- **Sem** `.env` real, tokens, engagements reais ou fixtures sensíveis no repo. Não imprimir segredos. Não copiar `.env` real para fixtures (usar sintéticas).
- Não modificar credenciais nem configs corporativas. Não instalar skills globalmente. Não contornar política corporativa/permissões (`permissions.allow`, `--dangerously-skip-permissions`). Não inventar parâmetros.
- Não afirmar isolamento completo contra agente com shell irrestrito; não afirmar Antigravity homologado.
- Git: sem force push; sem novo repositório; sem mudar visibilidade. Commit só quando o operador pedir; mensagens terminam com a linha de atribuição vigente (ver reminder da sessão — à época deste handoff, `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`).

---

## 8. Verificação (rodar na retomada)

- Linux (dev): `node tools/preflight/cli.mjs doctor` e `preflight` continuam OK; testes determinísticos do preflight verdes; `validate_h0.mjs` 127/127 se a KB mudar.
- Windows (operador, via Pi): após Frente 0, Pi carrega as skills sem `description is required`; após Frente 2, doctor lista os MCP reais; após Frente 1, `orchestration` aparece por runtime sem bloquear.
- Nada de afirmação "pleno no Windows" sem a passada real do operador confirmando.

## 9. Primeiro passo da retomada

Confirmar a opção da Frente 0 (**B1** materializador recomendado) e começar por **0 → 2 → 1** no repo (sem commit até o operador pedir); a Frente 3 inicia quando o export (§5) chegar em `_import/owasp-auditor/`.
