# 04 — Matriz Comparativa (Etapa B)

> Comparação dimensão-a-dimensão. Legenda de evidência: **C** = [CODE-PROVEN], **D** = [DOCUMENTED], **P** = [PROPOSED], **—** = ausente/não mencionado. Compatibilidade Windows corporativo avaliada no doc 06; aqui é só o sinal do projeto.

---

## 1. Matriz principal

| Dimensão | HackBot (atual) | strix | pentagi | PentestPi | omega | cyber-harness | caido-mcp-server |
|----------|------------------|-------|---------|-----------|-------|---------------|------------------|
| Linguagem/runtime | Markdown + runtime do agente | Python | Go+React | Python+Node | Node/TS | Go | Go |
| Modelo de agentes | KB declarativo + subagente efêmero | Graph of Agents (C) | 13 papéis (D) | Single+Observer (D) | core+4 workers (D) | "tudo é extensão" (D) | N/A (server) |
| Paralelismo | MAX_AGENTS (default 3), degrada p/ sequencial | paralelo (D) | 12+ flows (D) | single (D) | fork/task (D) | — | batch ≤50 (D) |
| Skills/progressive load | **Sim (Index→tags→T[N]) (C)** | load_skill tool (C) | — | playbooks on-demand (D) | prompts on-demand (D) | knowledge module (D) | N/A |
| Browser/navegação | MCP opcional (chrome-devtools) | agent_browser (C) | browser em container (D) | — | CDP + extensão (D) | full edition (D) | — |
| Captura/manip HTTP | Probe nativo + proxy opcional | Caido (C) | — | sidecar proxy (D) | http_request/replay/diff (D) | proxy routing (D) | **70 tools (D)** |
| Sessão autenticada | session.md + creds por ref | flag de cred (D) | só login próprio | state files (D) | browser bridge (D) | tokens (D) | **cookie jar + OAuth (D)** |
| IDOR/BOLA | KB web-testing T5 (nativo) | listado, sem método (D) | — | — | — | — | **multi-token batch (D)** |
| Race condition | KB code-review T10 (PS jobs) | business-logic (D) | — | — | — | — | **Replay Pipelines (D)** |
| Validação de vuln | **Verification contract + re-verify (C)** | PoC + CVSS (C/D) | — | fatos vs hipóteses (D) | worker+skeptic (D) | --verify (D) | diff responses (D) |
| Persistência de evidência | numbered dirs + cc*.md (C) | strix_runs/ (C) | Postgres+pgvector (D) | missions/evidence (D) | /report MD (D) | JSONL+SQLite (D) | findings (D) |
| Dep. externas | **Nenhuma (só runtime)** | **Docker** | **Docker+PG+stack** | **WSL2+binários** | Node | Go binário | Caido + binário |
| Doutrina no-install | **Sim (única)** | — (oposto) | — (oposto) | — (embute tools) | — | — | N/A |
| Licença | (projeto do usuário) | Apache-2.0 | MIT | Apache-2.0 | MIT | AGPL-3.0 | MIT |
| Adoção (★ aprox.) | — | ~73k | ~33k | ~34 | ~1 | ~380 | ~138 |

---

## 2. Compatibilidade com Windows corporativo restrito (resumo; detalhe no doc 06)

| Projeto | Barreira de instalação | Veredito corporativo |
|---------|------------------------|----------------------|
| **HackBot** | Só o runtime do agente (Node) | ✅ **Compatível** |
| @soulofzephir/pi-skill-pentesting | Pi + npm (0 deps); scripts .ps1 | ✅ Compatível (mas recomenda tools externas) |
| omega | Node/npm, `.ps1`/`.bat` | ✅ Compatível (puro Node) |
| baryonlabs/pi-agent-harness | Pi + npm | ✅ Provável (não testa Windows, mas puro Node) |
| caido-mcp-server | Caido + binário Go Windows | ⚠️ Condicional — depende de permitir Caido + binário |
| VibeHacking | Caido ≥0.59 (plugin in-proc) | ⚠️ Condicional — depende de permitir Caido |
| cyber-harness | binário Go `.exe` (+ MSYS2 p/ build) | ⚠️ Condicional — execução de binário |
| a-conte/pi-harness | Bun + just | ❌ Improvável (toolchain extra) |
| pi-subagent | tmux (WSL) | ❌ **Incompatível** (WSL indisponível) |
| PentestPi | WSL2 | ❌ **Incompatível** |
| strix | Docker | ❌ **Incompatível** |
| pentagi | Docker/Podman + Postgres | ❌ **Incompatível** |

**Leitura:** a arquitetura de referência mais adotada (strix, pentagi) é a **menos compatível** com o ambiente-alvo. O HackBot está no quadrante certo; os componentes adotáveis são os puro-Node/Caido.

---

## 3. Onde cada projeto é forte (o que vale estudar, não copiar)

| Capacidade | Melhor referência | O que aprender |
|-----------|-------------------|----------------|
| Estrutura de skill portável | **baryonlabs/pi-agent-harness** | `.pi/skills/*/SKILL.md` + `references/`; skills do Claude carregáveis no Pi via settings — o padrão de portabilidade |
| Sessão autenticada + IDOR/BOLA | **caido-mcp-server** | cookie jar por sessão, batch multi-token (owner/cross/noauth), diff de respostas |
| Race condition | **caido-mcp-server** | Replay Pipelines + last-byte-sync |
| MCP dentro do proxy (sem runtime extra) | **VibeHacking** | MCP in-Caido + gating auto/confirm/disabled por tool |
| Separação identidade↔runtime | **Nebula** | registry de adaptadores de CLI (claude/codex/gemini) |
| Subagente observável + allowlist de tools | **pi-subagent** | brief `--prompt/--file`, `--tools` allowlist, nested disabled |
| Validação cética separada | **omega** | goal + skeptic independente; fatos vs inferências |
| Desenho de perfis de auth multi-conta | **strix issue #777 [P]** | perfis nomeados, cred por referência, troca substitui contexto |

---

## 4. Lacunas do campo (oportunidades de diferenciação do HackBot)

1. **Operação sem binários instalados** — ninguém mais faz. Diferencial para ambientes restritos.
2. **IDOR/BOLA com método reproduzível** — só caido-mcp-server tem; strix só "lista". Capability dedicada ainda é rara.
3. **Race condition como capability de 1ª classe** — quase inexistente fora do Caido.
4. **Gate de autorização por-ação imutável com Risk Card** — nenhuma referência tem controle de segurança comparável; a maioria é "autônoma" sem freio humano por ação. (VibeHacking tem gating por-tool; é o mais próximo.)
5. **Contrato de verificação anti-alucinação com re-verificação do coordenador** — mais rigoroso que o campo.

---

## 5. Veredito de adoção por componente

| Componente de referência | Decisão recomendada | Razão (1 linha) |
|---------------------------|---------------------|-----------------|
| Padrão `*/SKILL.md` + `references/` (pi-agent-harness) | **Adotar (padrão, não código)** | Portabilidade Claude↔Pi quase grátis |
| caido-mcp-server | **Adotar condicionalmente (MVP+1)** | Melhor HTTP/sessão/IDOR/race; MIT; binário Windows — se corporativo permitir Caido |
| VibeHacking | **Avaliar como alternativa a Caido-MCP** | MCP in-proc evita binário externo separado |
| Nebula (padrão identidade↔runtime) | **Adotar conceito** | Fundamenta o desenho de adaptadores (doc 07) |
| strix, pentagi | **Descartar como base** | Docker → reprova no corporativo; arquitetura oposta à doutrina |
| PentestPi, pi-subagent | **Descartar** | WSL/tmux → incompatível |
| a-conte/pi-harness | **Estudar só o multi-runtime** | Conceito útil; Bun+just reprova |
| omega | **Estudar validação cética** | Padrão de verificação; não é base |
