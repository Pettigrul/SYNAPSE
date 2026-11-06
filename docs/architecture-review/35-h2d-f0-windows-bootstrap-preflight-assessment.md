# 35 — H2d-F0: Windows Bootstrap & Environment Preflight — Diagnóstico

> Diagnóstico (F0) que fundamenta a implementação mínima (F1) de bootstrap/doctor/preflight para Windows
> corporativo restrito. Par de `08-capability-roadmap.md` §8 (H2d) e handbook cap. 7 §7.3 / cap. 15.

## 1. Restrições do ambiente-alvo

Windows corporativo restrito: **sem Docker, sem WSL, sem privilégios de administrador**. Instalação e
operação apenas por: scripts `.bat` em escopo de usuário, Node.js instalado em escopo de usuário (zip +
PATH do usuário), variáveis de ambiente de usuário (`setx`), diretórios sob `%LOCALAPPDATA%`. Nenhuma
dependência que exija elevação, container ou serviço.

## 2. O que o Preflight precisa verificar (inventário real do repo)

| Alvo | Evidência no repo | Obrigatório em |
|------|-------------------|----------------|
| Runtimes (Pi/Claude Code/Antigravity) | `adapters/*.md` + `.claude/settings.json` + env | todos os perfis |
| Extensão/hook | `.claude/hooks` / `settings.json` | opcional |
| KB | `skills/` (15 categorias) + validador + manifesto | todos |
| Policies | `policies/` (3 arquivos) | todos |
| Execution Context / Bridge | `tools/web-runtime/bridge.mjs` | todos |
| Scope | engagement root + `scope.md` | full-engagement |
| Browser | `playwright-core` em `web-runtime/package.json` | opcional (fallback HTTP) |
| Caido | config (`CAIDO_BASE_URL/TOKEN/PROJECT_ID`) | caido-native, full-engagement |
| Workspace | `tools/workspace/engagement.mjs` + engagement root | caido-native, full-engagement |
| Evidências | diretório gravável | todos |
| MCPs (GitHub/Confluence), STRIDE | config/env | opcionais |
| **Workflows nativos (F5b)** | — | **opcional/PLANNED (V2)** |

## 3. Decisões de projeto (F1)

1. **Determinístico e offline:** todo check lê **estrutura/config local** — **nenhuma** requisição a alvo,
   **nenhum** navegador lançado, **nenhuma** chamada ao Caido, **nenhum** LLM. A parte impura (`collectEnv`)
   só coleta um *snapshot*; os checks são **puros** sobre ele (testáveis com fixtures).
2. **Perfis:** `core-lab` (núcleo H1, sem Caido), `caido-native` (MVP), `full-engagement` (+scope/escopo).
   Cada perfil declara checks **required** vs **optional**.
3. **Vereditos:** `BLOCKED` se algum **required** estiver missing/error; `DEGRADED` se algum required
   estiver degraded **ou** qualquer optional não-ok; caso contrário `READY`.
4. **Opcionais nunca bloqueiam:** GitHub/Confluence/STRIDE **e geração de workflows nativos** (F5b,
   PLANNED/V2) → no máximo `DEGRADED`, **nunca** `BLOCKED` — preserva a decisão de produto de 2026-11-05.
5. **Módulo Node compartilhado + wrappers `.bat`:** `preflight.mjs`/`doctor.mjs`/`cli.mjs` + `preflight.bat`
   /`doctor.bat`/`bootstrap.bat` (thin wrappers, sem admin/Docker/WSL).
6. **Persistência segura:** o `bootstrap.bat` orienta armazenar o PAT em env var de usuário ou arquivo com
   ACL restrita sob `%LOCALAPPDATA%\SecurityAuditor`, **nunca** no repo; o Preflight lê apenas **presença**,
   nunca o valor.

## 4. Escopo F1 vs F2+

- **F1 (entregue):** checks estruturais, perfis, vereditos, Doctor informativo, wrappers `.bat`,
  bootstrap mínimo (scaffolding + guidance), testes determinísticos.
- **F2+ (PLANNED):** integração com credential store do Windows; auto-config de runtimes/MCPs; probe de
  conectividade real (Caido/host) como check *soft* opcional; verificação de versão do Caido e dos node
  kinds de workflow (gate de F5b/V2).

## 5. Limitações declaradas

- O Preflight comprova **presença/estrutura**, não **conectividade viva** (probe real é F2+, opcional).
- "Runtime detectado" usa sinais locais (`.claude/settings.json`, env vars); a confirmação plena do binário
  do runtime é responsabilidade do operador/Doctor.
- O bootstrap não automatiza a instalação do Node nem a configuração de credenciais corporativas — orienta,
  não executa (restrição de ambiente).
