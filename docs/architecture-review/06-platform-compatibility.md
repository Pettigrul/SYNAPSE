# 06 — Compatibilidade de Plataforma e Portabilidade

> **Restrição fundamental #2 (Windows corporativo restrito)** e **#3 (portabilidade Pi Agent ↔ Antigravity)**.
> **Princípio declarado no enunciado, aqui reforçado:** *documentação de uma ferramenta externa não é comprovação de compatibilidade no ambiente corporativo.* Tudo abaixo distingue "o projeto diz que roda no Windows" de "roda no SEU Windows restrito". A comprovação final exige um teste de aceitação no ambiente real (doc 10).

---

## 1. O ambiente-alvo (premissas do enunciado)

- Node.js e npm **disponíveis**.
- Docker e WSL2 **indisponíveis**.
- Downloads e execução de binários **restritos**.
- Ferramentas externas possivelmente **bloqueadas**.
- **Sem privilégios de administrador.**
- Serviços HTTP locais, MCPs e processos filhos **sujeitos a restrição**.
- Operação **parcialmente offline** possível.

---

## 2. Duas camadas de compatibilidade (não confundir)

O erro clássico é misturar a compatibilidade do **harness** (o que executa a skill) com a do **alvo** (o que é testado).

| Camada | O que é | Restrição aplicável |
|--------|---------|---------------------|
| **Harness runtime** | O agente que lê a skill (Pi/Claude Code/Antigravity sobre Node) | Node/npm OK; sem Docker/WSL; execução de binário restrita |
| **Alvo** | O host/app sendo avaliado | A doutrina native-tooling já resolve: nada instalado no alvo |

**A doutrina native-tooling do HackBot é sobre o ALVO.** Ela já garante compatibilidade do que roda *no alvo*. A questão nova é a compatibilidade do *harness e seus componentes externos* (Caido, MCP servers, binários Go) no Windows corporativo.

---

## 3. HackBot: compatibilidade atual

| Item | Situação | Veredito |
|------|----------|----------|
| Núcleo (Markdown + runtime) | Sem binário próprio, sem Docker, sem serviço | ✅ **Compatível por construção** |
| Tier-1 runtimes (Python/Go/Node) | Verificados por sessão, nunca presumidos; caminho fecha se ausente | ✅ Degradação graciosa já implementada |
| Serviço HTTP local (forge OAST B8) | Opcional, Classe A sob gate; `HttpListener`/`http.server` | ⚠️ Pode ser bloqueado → é opcional e autorizado por-ação |
| MCP (chrome-devtools/firecrawl) | Opcional, "reduz falso-positivo"; fallback a probe nativo | ⚠️ Degradação já prevista |
| Subagentes | Textual; degrada para fases sequenciais em runtime sem paralelo | ✅ Sem dependência de processo externo obrigatória |
| Privilégio admin | Não exigido pelo harness; técnicas de privesc são *sobre* o alvo | ✅ Harness roda sem admin |

**Conclusão:** o HackBot **já satisfaz** a restrição corporativa. Nenhuma mudança é necessária para compatibilidade; as mudanças propostas (docs 05/07) são de *portabilidade e organização*, não de compatibilidade.

---

## 4. Componentes externos avaliados contra a restrição

Reavaliação explícita (não é "o README diz Windows"):

| Componente | "Projeto diz Windows?" | Exige o quê | Veredito no ambiente restrito |
|------------|------------------------|-------------|-------------------------------|
| Caido (app) | Sim (instalador desktop) | Instalação de app + import de cert CA | ⚠️ **Depende de política** — instalação de app pode ser bloqueada; sem admin, o instalador e o cert CA são o risco |
| caido-mcp-server (Go) | Sim (binários Windows) | **Executar binário Go** + Caido rodando + token | ⚠️ **Condicional** — "execução de binários restrita" é exatamente a barreira; precisa de exceção/allowlist |
| VibeHacking (plugin in-Caido) | Não afirma | Caido ≥0.59 + plugin (sem runtime extra) | ⚠️ Condicional — só precisa Caido; evita o binário externo separado |
| MCP server local (qualquer) | Varia | Processo filho + porta localhost | ⚠️ "MCPs sujeitos a restrição" — tratar como opcional |
| strix / pentagi | — | **Docker** | ❌ **Incompatível** (Docker indisponível) |
| PentestPi | — | **WSL2** | ❌ **Incompatível** |
| pi-subagent | — | **tmux (WSL)** | ❌ **Incompatível** |
| a-conte/pi-harness | — | **Bun + just** | ❌ Improvável (toolchain extra, download de binário) |
| pi-mono / pi-agent-harness / omega | Sim (Node/.ps1/.bat) | Node + npm | ✅ Compatível (dentro das premissas) |

**Regra de projeto derivada:** todo componente externo entra como **opcional com fallback nativo**. Nenhuma capacidade do MVP pode *depender* de Caido, de um binário Go, de Docker ou de MCP. O HackBot funciona 100% nativo; integrações são aceleradores, não pré-requisitos.

---

## 5. Portabilidade Pi Agent ↔ Antigravity (Restrição #3)

### 5.1 O que o HackBot já faz
- **Arquivo de instruções dual:** Flow 8 resolve `CLAUDE.md` (Claude Code/SDK) vs `AGENTS.md` (Antigravity/Codex); cross-runtime cria ambos, com conteúdo idêntico e self-heal do bloco native-tooling.
- **Runtime-agnóstico declarado:** o contrato de verificação e a disciplina de tarefas "bind Claude Code, Agent SDK, Antigravity, Codex e todo subagente via embedding de brief".
- **Degradação de paralelismo:** sem dispatch paralelo → fases sequenciais escritas em `4-Analysis/briefs/`.

### 5.2 O que a pesquisa confirma
- **O padrão `SKILL.md` + `references/` é compartilhado** entre Claude Code e Pi (baryonlabs/pi-agent-harness: "skills do Claude carregáveis no Pi via `settings.json`"). Migrar `agents/` para esse padrão (doc 05) **compra portabilidade Claude↔Pi quase de graça.**
- **Nebula** demonstra o padrão "identidade↔runtime": uma base de conhecimento única, adaptadores finos por runtime.

### 5.3 O desenho de portabilidade (sem duplicar conhecimento)
```
security-auditor/                 ← base de conhecimento ÚNICA (fonte da verdade)
  SKILL.md                        ← manifesto/roteador portável
  policies/                       ← 3 docs imutáveis (injetados em brief)
  skills/<classe>/SKILL.md        ← padrão Agent Skills (Claude + Pi leem o mesmo)
  workflows/                      ← flows
  tools/                          ← determinísticas (forge)
  adapters/
    claude-code.md  → gera/liga CLAUDE.md, registra como skill
    pi-agent.md     → entrada em settings.json do Pi apontando para skills/
    antigravity.md  → gera/liga AGENTS.md
```
- **Conhecimento não é duplicado:** `skills/` é a fonte única; cada adaptador é um arquivo fino que *aponta* para ela (link/registro), não copia.
- **`CLAUDE.md`/`AGENTS.md`** passam a ser gerados do mesmo template (como já são no Flow 8) — a duplicação atual (conteúdo idêntico em dois arquivos) é aceitável porque é gerada, não mantida à mão.

---

## 6. Modo parcialmente offline

- A base de conhecimento é toda local (Markdown) → **funciona offline**.
- Pontos que exigem rede: intake de URLs (Flow 1), fetch de CVE/docs no contrato de verificação, crt.sh (web-inventory). Todos degradam: o contrato de verificação já prevê "marcar UNVERIFIED ou dropar a claim" quando o fetch falha.
- **Recomendação:** marcar no `scope.md ## Runtime Availability` um campo `NETWORK_EGRESS` (full/limited/none) para o harness ajustar expectativas de verificação offline. (Pequena extensão; doc 08.)

---

## 7. Veredito de compatibilidade

1. **HackBot core: ✅ compatível hoje.** A restrição corporativa já é cidadã de primeira classe do design.
2. **Integrações externas: ⚠️ todas opcionais com fallback.** Caido/caido-mcp-server são o maior ganho *se* o ambiente permitir app + binário; caso contrário, o probe nativo (web-testing/web-inventory) cobre o essencial.
3. **Portabilidade: ✅ caminho claro e barato** via padrão `SKILL.md` + adaptadores finos; o HackBot já tem a fundação (dual-file, runtime-agnóstico).
4. **Comprovação pendente:** um teste de aceitação no Windows corporativo real (doc 10, Fase 0) é obrigatório antes de depender de qualquer integração externa — a documentação do vendor não substitui esse teste.
