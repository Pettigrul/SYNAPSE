# 15 — Windows Bootstrap & Environment Preflight (H2d-F0/F1)

> Incremento **H2d-F0/F1**: implantação reproduzível em **Windows corporativo restrito** (sem Docker/WSL/
> admin) + **SYNAPSE Doctor** (diagnóstico informativo) + **Environment Preflight** (veredito por perfil,
> **sem LLM e sem operação ofensiva**). Determinístico, offline, Node stdlib, **zero deps**.
> Artefatos: `tools/preflight/` — `preflight.mjs`, `doctor.mjs`, `cli.mjs`, `env-loader.mjs`,
> `preflight.bat`, `doctor.bat`, `bootstrap.bat`, `test-preflight.mjs`, `test-env-loader.mjs` + raiz:
> `.env.example` (`.env` gitignored). Diagnóstico F0: [`../architecture-review/35-h2d-f0-windows-bootstrap-preflight-assessment.md`](../architecture-review/35-h2d-f0-windows-bootstrap-preflight-assessment.md).
> Config local `.env` (nativo Node 22, sem deps): **§15.6**.

## 15.1 Bootstrap (Windows, sem admin)

`bootstrap.bat` (escopo de usuário): verifica Node na PATH; cria `%LOCALAPPDATA%\SecurityAuditor\`
(engagements/evidence **fora do repo**); imprime **guidance de persistência segura** (PAT via `setx
CAIDO_TOKEN` ou arquivo com ACL restrita — **nunca** no repo); roda Doctor + Preflight `core-lab`. **Não**
instala Node nem credenciais corporativas (restrição de ambiente); orienta o operador. Integração com
credential store do Windows e auto-config de runtimes/MCPs é **H2d-F2+** (PLANNED).

## 15.2 SYNAPSE Doctor (informativo)

`doctor.bat` → `node cli.mjs doctor [--json]`. Reporta **fatos** (Node/SO, runtimes detectados, categorias
KB, policies, bridge, workspace, engagement root, browser, config Caido presente, dir de evidências, MCPs) +
**hints** de correção. **Sem veredito, sem gating, sem LLM, sem ofensa.**

## 15.3 Environment Preflight (veredito por perfil)

`preflight.bat [--profile <p>] [--json]` → `node cli.mjs preflight`. **Determinístico/offline:** cada check
lê estrutura/config local — **nunca** requisita alvo, lança browser ou chama Caido. `collectEnv()` coleta um
*snapshot*; os checks são **puros** (testáveis com fixtures injetadas).

**Perfis e checks required/optional:**

| Check | core-lab | caido-native | full-engagement |
|-------|----------|--------------|-----------------|
| runtimes, kb, policies, executionContext | **req** | **req** | **req** |
| evidence (`<engagement>/evidence`) | opt | **req** | **req** |
| caido (instância: baseUrl+token), workspace, **caidoProject** (binding) | opt | **req** | **req** |
| scope | opt | opt | **req** |
| extensions, browser | opt | opt | opt |
| mcpGithub, mcpConfluence, stride | — | opt | opt |
| **nativeWorkflows (F5b)** | — | **opt (planned)** | **opt (planned)** |

> `caido` passou a verificar só a config de **instância** (baseUrl+token). O **binding projeto↔engagement**
> é o check `caidoProject`, derivado do engagement ativo (manifesto) — ver cap. 16 (multi-engagement).

**Vereditos:** `BLOCKED` se algum **required** = missing/error; `DEGRADED` se algum required = degraded **ou**
qualquer optional ≠ ok; senão `READY`. **Exit codes** (`preflight.bat`): `0`=READY, `1`=DEGRADED, `2`=BLOCKED,
`3`=uso inválido, `9`=Node ausente.

> **Opcionais nunca bloqueiam** (decisão de produto 2026-11-05): GitHub/Confluence/STRIDE **e a geração de
> workflows NATIVOS do Caido (H2b-F5b, PLANNED/V2)** → no máximo `DEGRADED`, **nunca** `BLOCKED`. O perfil
> `caido-native` fica apto (READY/DEGRADED) com History/monitoramento/Copilot/Replay/Automate(leitura)/
> Findings/Investigation Records + integração real, **sem** workflows nativos.

## 15.4 Segurança e invariantes

Preflight/Doctor: **sem LLM** (`llmUsed:false`), **sem operação ofensiva** (`offensiveOps:false`), sem rede a
alvos, sem lançar browser. Lê apenas **presença** de config (nunca valores de segredo). Secrets ficam fora do
repo (env de usuário / arquivo ACL-restrito). Nenhuma dependência nova; `agents/`, `policies/` e os 127
corpos da KB **inalterados**.

## 15.5 Testes determinísticos (28/28)

`node tools/preflight/test-preflight.mjs` → **28/28** (fixtures injetadas; inclui cenários
multi-engagement/compat + evidência por engagement — ver cap. 16): env saudável nunca BLOCKED ·
core-lab READY mínimo · required ausente (kb/policies/evidence/scope/caido/runtimes) → BLOCKED · **workflows
nativos (planned) nunca bloqueiam caido-native** · optional ausente → DEGRADED · browser ausente → DEGRADED
(fallback HTTP) · runtime ausente c/ docs → DEGRADED, sem docs → BLOCKED · perfil inválido lança ·
vocabulário de veredito/status · invariantes no-LLM/no-ofensa · config Caido parcial → DEGRADED · Doctor
informativo (sem veredito) · `collectEnv` real · perfis bem-formados. Validador V1 **127/127** e regressões
do Web Runtime verdes (mudança isolada em `tools/preflight/`).

## 15.6 Config local persistente via `.env` (nativo Node 22, zero deps)

Para **não exportar variáveis a cada sessão**, o Doctor/Preflight carregam automaticamente `<repo>/.env`
usando o parser **nativo** do Node 22 (`node:util` `parseEnv`) — **sem `dotenv`**, **sem nova dependência**.
Módulo compartilhado: `tools/preflight/env-loader.mjs` (`loadProjectEnv`/`applyEnv`/`parseEnvContent`/
`projectRoot`), reutilizável por qualquer entry point via `import`.

- **Setup:** `cp .env.example .env` (Linux/macOS) ou `copy .env.example .env` (Windows) e preencher.
  `.env.example` persiste **config de instância** (`CAIDO_BASE_URL`, `CAIDO_TOKEN`) + a **base** de
  engagements (`SA_ENGAGEMENT_ROOT`). O engagement **ativo** é selecionado por sessão (`cli.mjs use`, cap. 16
  §16.4.1); `SA_ENGAGEMENT` é seletor opcional, só fora de projeto, e `CAIDO_PROJECT_ID` é compat single-engagement (o projeto
  normalmente vem do engagement). **Evidências** vão para `<engagement>/evidence` (sem dir global; o check
  `evidence` resolve o engagement ativo — ver cap. 16 §16.5.1); `SA_EVIDENCE_DIR` está **deprecado** (compat
  legada só sem engagement ativo).
- **Precedência:** variáveis **já definidas no ambiente vencem** — o `.env` **nunca** sobrescreve (exceto
  `override:true` explícito, não usado nos entry points).
- **Raiz real do projeto:** o arquivo é localizado a partir da posição do módulo, **independente do cwd**.
- **Sanitização:** nunca imprime/retorna **valores** — só **nomes** de variáveis (Doctor mostra, ex.:
  `.env  loaded 1 var(s) [CAIDO_TOKEN]; kept from environment: CAIDO_PROJECT_ID`).
- **Segurança:** `.env` e variantes (`.env`, `.env.*`, `*.env`, `.env.local`) estão no `.gitignore`
  (`.env.example` permanece versionado). A **presença do arquivo NÃO autoriza operação** — autorização
  segue no Execution Context/policies (intocados). Compatível com Linux e Windows (inclusive CRLF).
- **Escopo:** é conveniência de config — **não** é H2d-F2, **não** é gerenciador de segredos nem nova
  arquitetura de configuração.
- **Testes:** `node tools/preflight/test-env-loader.mjs` → **15/15** (parsing · load · ausência ·
  precedência · `override` · sanitização sem vazar valor · independência de cwd · CRLF · artefatos
  `.env.example`/`.gitignore` · módulo não imprime).

## 15.7 Limitações / F2+ (PLANNED)

- Comprova **presença/estrutura**, não **conectividade viva** (probe real Caido/host é F2+, opcional/soft).
- Detecção de runtime usa sinais locais; confirmação plena do binário fica com o operador/Doctor.
- Bootstrap orienta (não executa) instalação de Node e credenciais corporativas.
- **F2+ (PLANNED):** credential store do Windows; auto-config de runtimes/MCPs; probe de conectividade; e os
  checks do **gate F5b/V2** (versão do Caido + node kinds de workflow) — todos **sem** bloquear o MVP.
