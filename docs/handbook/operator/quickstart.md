# Quickstart operacional

> Primeira utilização ponta-a-ponta. **Apenas comandos/flags que existem** (verificados em
> `tools/workspace/cli.mjs`, `tools/preflight/cli.mjs`, `tools/activation/cli.mjs`, `tools/modes/cli.mjs`).
> Exemplos Linux/Omarchy; notas Windows em [runtimes.md](runtimes.md). **Nunca** inclua credenciais reais.

```bash
# 1. INSTALAÇÃO CENTRAL (uma vez) — nada global, nada por-engagement
git clone <repo> ~/harness/SYNAPSE
cd ~/harness/SYNAPSE

# 2. .env (config persistente da INSTÂNCIA) — ver configuration.md
cp .env.example .env
#   edite: CAIDO_BASE_URL, CAIDO_TOKEN, SA_ENGAGEMENT_ROOT (externo ao repo; dentro dele só engagements/ é aceito)
#   todo projeto ativado carrega este .env (variáveis exportadas vencem)

# 3. CAIDO: instância + autenticação — ver caido.md
#   GraphQL em <CAIDO_BASE_URL>/graphql, header Authorization: Bearer <token> (PAT 'caido_…' ou access token)

# 4. CRIAR o primeiro engagement (não ativa, não autoriza)
node tools/workspace/cli.mjs init --name acme --modality graybox

# 5. scope.md — precisa de '# Scope' e '## In Scope' (validado)
#   crie <SA_ENGAGEMENT_ROOT>/acme/scope.md, depois:
node tools/workspace/cli.mjs scope --name acme --file "<SA_ENGAGEMENT_ROOT>/acme/scope.md"

# 6. DESCOBRIR e ASSOCIAR o projeto Caido (UUID vem do manifesto do engagement)
node tools/workspace/cli.mjs projects                                  # lista UUIDs (precisa instância)
node tools/workspace/cli.mjs associate --name acme --project-id <uuid>

# 7. ATIVAÇÃO LOCAL (opcional — Layout C; só se for operar de DENTRO de um projeto externo)
node tools/activation/cli.mjs activate --project ~/pentests/acme --runtime pi   # linka o harness central (symlinks)
#   --runtime claude-code|pi|antigravity|all, ou lista: pi,antigravity. Sem a flag, reativar mantém o marcador

# 8. INICIAR o runtime escolhido na pasta desejada (raiz central OU projeto ativado)
#   Pi:          pi -a --provider openai-codex --model gpt-6-luna --thinking low   (skills: /skill:<nome>; ver pi-agent.md)
#   Antigravity: agy   (skills: /<nome>; comandos de shell sem interação são negados; ver antigravity.md)
#   Claude Code: abra a pasta; as skills de .claude/skills são descobertas (ver runtimes.md)

# 9. SELECIONAR o engagement da sessão (explícito; nunca adivinhado)
node tools/workspace/cli.mjs use --name acme       # ou /usar-engagement acme (Pi: /skill:usar-engagement)
#   em projeto ativado a seleção é por projeto; SA_SESSION_ID é opcional

# 10. DOCTOR + PREFLIGHT (determinístico, offline, sem LLM)
node tools/preflight/cli.mjs doctor
node tools/preflight/cli.mjs preflight --profile full-engagement       # 0 READY / 1 DEGRADED / 2 BLOCKED

# 11. MODO (copilot = padrão seguro; autopilot = supervisionado — não concede nada)
node tools/modes/cli.mjs status
node tools/modes/cli.mjs copilot        # ou: autopilot   (ou /modo copilot|autopilot|status)

# 12. INICIAR / RETOMAR o pentest (roteia ao dispatcher + flows; respeita o modo)
#   /iniciar-pentest
#   → prepara AUTOMATICAMENTE a estrutura operacional ANTES do recon (nove diretórios +
#     session.md/toDoList.md/cc*.md/.config + CLAUDE.md ou AGENTS.md, conforme o marcador), idempotente e sem sobrescrever.
#     Equivale a: node tools/workspace/cli.mjs bootstrap   (você NÃO precisa rodar à mão)

# 13. INVESTIGAÇÃO técnica pontual → Investigation Record
#   /investigar <endpoint|hipótese>

# 14. EVIDÊNCIAS e resultados (por engagement)
#   <SA_ENGAGEMENT_ROOT>/acme/evidence/        capturas/screenshots/records
#   <SA_ENGAGEMENT_ROOT>/acme/2-Findings/ , 1-Reports/  (buckets do workspace)

# 15. ENCERRAR / TROCAR com segurança
node tools/workspace/cli.mjs use --name outro-engagement   # avisa troca, volta o modo a copilot → inicie uma sessão LIMPA
node tools/activation/cli.mjs deactivate --project ~/pentests/acme   # se tiver ativado (preserva dados)
```

**Mapa das skills para os comandos acima:** [skills-catalog.md](skills-catalog.md). **Se algo falhar:**
[troubleshooting.md](troubleshooting.md).
