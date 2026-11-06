# 17 — Skills Operacionais & UX de Engagement (Claude Code)

> Transforma os comandos frequentes de gerenciamento de engagement em **skills invocáveis do Claude Code**,
> finas, sobre o CLI/Bridge já existentes. **Não** há segundo dispatcher, duplicação de lógica, nova
> dependência, novo framework, nem mudança em KB/`agents`/`policies`. Par do cap. 16 (multi-engagement) e
> cap. 15 (preflight). Inclui a **consolidação semântica P1** (pentest × investigação). ✅🧪 `test-skills.mjs` **48/48**.

## 17.1 Instalação única do harness

O **harness é único e compartilhado**. Inicie o Claude Code **na raiz do repositório** (onde vivem
`SKILL.md`, `references/`, `policies/`, `skills/` (KB), `tools/`, `.claude/` e os MCPs). **Não** se copia
skills/agents/tools/MCPs para cada pentest — todos os engagements usam o mesmo harness.

```bash
cd /caminho/para/SYNAPSE     # raiz do harness
claude                               # inicia o Claude Code aqui; as skills de .claude/skills/ são descobertas
```

## 17.2 Organização dos engagements (dentro OU fora do repo)

Os engagements vivem sob **`SA_ENGAGEMENT_ROOT`** (config persistente no `.env`), que **pode e deve ficar
FORA do repositório**:

```
SA_ENGAGEMENT_ROOT=/home/op/engagements      # externo ao repo (recomendado)
└── acme/     .engagement.json (caido.projectId) · scope.md · .hackbot/ · evidence/ · 1-Reports/ …
└── globex/   …
.sa-state/    active[-<SA_SESSION_ID>].json   # ponteiro de seleção por sessão
```

- **Ambos os layouts são suportados** quando corretamente configurados: `SA_ENGAGEMENT_ROOT` externo
  (recomendado) **ou** um diretório dentro do repo (legado). **Não** há migração forçada dos engagements
  existentes — nada é movido/reescrito.
- Um **projeto Caido por engagement** (binding no manifesto; ver cap. 16). Evidências/estado **persistem
  dentro do engagement** (`evidence/`, `.hackbot/`), nunca no repo nem em `/tmp`.

## 17.3 Catálogo de skills operacionais

Em `.claude/skills/<nome>/SKILL.md` (mecanismo **nativo** de skills do Claude Code). Cada skill é uma
**interface fina**: valida/decide **nada** no prompt — apenas invoca o CLI Node correspondente, mostra a
saída e repassa erros acionáveis. O enforcement real vive no CLI/Bridge.

**Gestão do engagement (6 skills preservadas):**

| Skill | Faz | CLI subjacente |
|-------|-----|----------------|
| `/listar-engagements` | Lista engagements sob o root; `*` marca o ativo | `cli.mjs list` |
| `/criar-engagement` | Cria `SA_ENGAGEMENT_ROOT/<nome>` (não ativa, não autoriza) | `cli.mjs init --name <n> [--modality …]` |
| `/usar-engagement` | **Seleciona** o ativo da sessão; avisa troca/sessão limpa | `cli.mjs use --name <n>` |
| `/engagement-atual` | Mostra o ativo (read-only) ou "nenhum" | `cli.mjs active` |
| `/associar-caido` | Associa projeto Caido ao manifesto (sem fallback global) | `cli.mjs projects` / `cli.mjs associate --name <n> --project-id <id>` |
| `/verificar-ambiente` | Preflight/Doctor determinístico (offline, sem LLM) | `preflight/cli.mjs preflight|doctor` |

**Operações de pentest (consolidação semântica P1):**

| Skill | Faz | Rota |
|-------|-----|------|
| `/investigar` | **Investigação técnica PONTUAL** (um comportamento/endpoint/hipótese) → **Investigation Record**; reutiliza o fluxo supervisionado e o Caido quando aplicável. **Não** inicia pentest completo | `cli.mjs active` + mecanismo normal do agente + `references/flows-caido-investigation.md` + `flows-agents.md` (Return/Record) |
| `/iniciar-pentest` | **Início ou RETOMADA do pentest completo** no engagement ativo; **roteia ao dispatcher principal** e aos flows (escopo→recon→investigação→validação→reteste→consolidação) | `cli.mjs active` + `preflight full-engagement` + `SKILL.md` (dispatcher) + `flows-scope/recon/agents/status/report.md` |
| `/iniciar-investigacao` | **Alias DEPRECADO e TEMPORÁRIO** de `/investigar` (compat da rodada anterior; a remover) | → `/investigar` |

**Ativação local por projeto (P2 — ver cap. 18):**

| Skill | Faz | CLI subjacente |
|-------|-----|----------------|
| `/ativar-projeto` | Linka o harness central num projeto externo (sem global, sem duplicar KB) | `activation/cli.mjs activate --project <dir> [--runtime …] [--mcp] [--force]` |
| `/desativar-projeto` | Remove só os links/marcador da ativação; preserva dados do pentest | `activation/cli.mjs deactivate --project <dir>` |

**Modo operacional (P3 — ver cap. 19):**

| Skill | Faz | CLI subjacente |
|-------|-----|----------------|
| `/modo` | Consulta/seleciona o modo da sessão: **copilot** (padrão) ou **autopilot supervisionado**; não concede capability nem autoriza alvo | `modes/cli.mjs status|copilot|autopilot` |

Não colidem com as categorias da KB (`skills/`: chaos, forge, web-testing, …) nem com o dispatcher
`security-auditor`. `test-skills.mjs` verifica o contrato (presença, frontmatter, nome==diretório, unicidade,
ausência de colisão, interface fina, semântica P1 e compatibilidade com os flows).

## 17.3.1 Gerenciamento do engagement × operações de pentest

As 6 primeiras skills **gerenciam o engagement** (unidade de trabalho autorizado: escopo, projeto Caido,
evidências, ciclo de vida) — criar, selecionar, associar, verificar. **`/investigar`** e **`/iniciar-pentest`**
operam **dentro** do engagement ativo. Gerenciar ≠ operar: selecionar um engagement **não** inicia o pentest,
e nenhuma skill amplia permissões por ser invocada.

## 17.4 Exemplos de uso

```text
# começar do zero (harness externo)
/verificar-ambiente            → preflight core-lab: o que falta
/criar-engagement acme         → cria <root>/acme (não ativa)
/associar-caido                → lista projetos Caido; associa acme → <uuid>
/usar-engagement acme          → acme vira o ativo da sessão; mostra evidence dir + projeto
/engagement-atual              → confirma: acme (via session)
/iniciar-pentest               → confirma ativo + preflight full-engagement; roteia ao dispatcher (escopo→recon→…)
/investigar este endpoint      → investigação pontual → Investigation Record (sob aprovação)

# trocar de pentest (aviso de sessão limpa)
/usar-engagement globex        → "⚠ switched from 'acme' … start a CLEAN session"
```

## 17.5 Seleção & segurança (resumo; detalhes no cap. 16)

- **Seleção sempre explícita**, nunca inferida; match **exato** ou lista de candidatos para o operador.
- **Contexto válido** exigido antes de operações dependentes de engagement; sem seleção → bloqueado (mas
  read-only e `/verificar-ambiente` funcionam).
- **Projeto Caido** vem do **manifesto** do engagement selecionado; **sem** troca silenciosa entre projetos.
- **Evidências confinadas** ao workspace ativo (`confineWithin`, symlink-safe).
- **`SA_SESSION_ID`** isola sessões concorrentes e **propaga entre processos** (o ponteiro é lido/escrito por
  processo filho) — verificado em `test-skills.mjs`.
- **Troca** reporta `switched`/`requiresCleanContext`: a skill **avisa** e **oferece** sessão limpa, **sem
  declarar** que o histórico do LLM foi apagado.

## 17.6 Portabilidade (Pi) & limitação de isolamento

- **Pi inalterado.** As skills do Claude Code vivem em `.claude/skills/` (específico do Claude Code); o Pi
  continua usando `SKILL.md` + `adapters/`. O **conteúdo canônico reutilizável** é o CLI Node
  (`tools/workspace/cli.mjs`, `tools/preflight/cli.mjs`), idêntico entre runtimes. **Nenhum adaptador novo**
  foi adicionado nesta rodada (sem necessidade comprovada).
- **Limitação de enforcement (honesta):** uma skill é um prompt fino — **não** impõe nada por si. O
  enforcement real está no **Node/Bridge** quando ops Caido/evidência passam por ele. Ferramentas genéricas do
  Claude Code (`bash cat`, `Read`) podem ler arquivos de outro engagement fora desse caminho — **mesma**
  limitação de camada-de-ferramentas do Whitebox (cap. 16 §16.5). **Não** há isolamento universal sem um
  wrapper de enforcement por runtime (candidato a H2d-F2+; **não** iniciado aqui).

## 17.7 Automação hermética

Para automação/testes sem depender do `.env` local do operador, defina **`SA_SKIP_ENV_FILE=1`**: os CLIs
**não** carregam `<repo>/.env` (o ambiente fornecido vence integralmente). Usado por `test-skills.mjs` para
rodar os CLIs como processos filhos contra um root **externo** e hermético.

## 17.9 Nomenclatura (consolidação semântica P1)

| Termo | Significado | Skill / artefato |
|-------|-------------|------------------|
| **Engagement** | Unidade completa de trabalho autorizado: escopo, projeto Caido, evidências, ciclo de vida | `/criar-`,`/usar-`,`/listar-`,`/engagement-atual`,`/associar-caido` |
| **Pentest** | Execução das atividades de teste **dentro** do engagement | `/iniciar-pentest` (entrada; dispatcher+flows) |
| **Investigação** | Análise técnica **pontual** de um comportamento/endpoint/hipótese/recomendação | `/investigar` |
| **Investigation Record** | Registro de hipótese, execução, evidências e conclusão de **uma** investigação | contrato em `references/flows-agents.md` |
| **Finding** | Achado **validado**, com classificação e suporte técnico | — (NÃO há `/registrar-achado` nesta rodada) |
| **Relatório** | Consolidação dos resultados do engagement | `flows-report.md` (NÃO há `/gerar-relatorio` nesta rodada) |

**Como iniciar/retomar um pentest:** selecione o engagement (`/usar-engagement`), depois `/iniciar-pentest` —
ele confirma ativo + preflight e **roteia ao dispatcher** para carregar escopo/estado e conduzir as fases
(recon → mapeamento → investigação → validação → reteste → consolidação) **sob supervisão**. Não há execução
autônoma contínua (sem Autopilot).

**Como iniciar uma investigação específica:** `/investigar <alvo/hipótese>` — conduz **uma** investigação pelo
fluxo supervisionado e termina num **Investigation Record**. Não inicia o pentest completo.

**O que cada skill executa de fato:** as skills são **finas** — invocam o CLI Node e/ou roteiam ao
dispatcher/flows; não executam operações ofensivas por conta própria. Ações Class A (payload/probe/replay/
escrita em alvo) exigem **autorização por ação** via Approval Gate.

**O que permanece planejado:** orquestração automática ponta-a-ponta, modos Copilot/Autopilot, ativação local
por projeto, `/gerar-relatorio`, `/registrar-achado`, `/modo` — **não** implementados nesta rodada (ver cap. 7/8).

## 17.10 Testes (`node tools/workspace/test-skills.mjs` → 48/48)

- **Contrato das skills:** descoberta/presença, frontmatter válido (nome==diretório, descrição-gatilho),
  unicidade, ausência de colisão (KB/dispatcher), **interface fina** (invoca o CLI Node; alias dispensado).
- **Semântica P1:** `/investigar` é pontual → Investigation Record, reutiliza o fluxo supervisionado e **não**
  inicia pentest; `/iniciar-pentest` **roteia ao dispatcher+flows**, declara **não criar novo orquestrador** e
  **não presumir** execução autônoma; os flows referenciados **existem**; `/iniciar-investigacao` é **alias
  não-divergente** (deprecado, sem re-implementar lógica); **um único** dono da entrada de pentest completo;
  nenhuma skill carrega op ativa espontânea (replay/findings só sob contexto negado/gated).
- **Fluxo CLI (processos filhos, root externo, hermético):** listagem vazia · criação de dois engagements ·
  seleção explícita + ponteiro persistido · **`SA_SESSION_ID` propaga entre processos** · **isolamento** entre
  sessões concorrentes · troca com aviso de sessão limpa (sem alegar purge) · engagement inexistente → erro
  acionável (sem adivinhação) · associação Caido · `list` marca o ativo · **sem seleção → op dependente
  bloqueada** · **pentest sem engagement → `active` reporta nenhum (entrada deve parar)** · **pentest com
  engagement válido + projeto Caido correto do manifesto** · read-only funciona sem seleção · **evidências
  confinadas** ao engagement ativo.
- **Preflight:** executa com verdict + mapeamento de exit; Doctor sai 0 e **nunca imprime valor de segredo**.
- Acesso cruzado via Bridge e ausência de ops ativas não autorizadas: cobertos por `test-multi-engagement.mjs`
  (**31/31**) e `test-caido-active.mjs` (**27/27**).
- **Smoke test de reconhecimento no runtime Claude Code:** **NOT RUN** — as skills recém-criadas em
  `.claude/skills/` são descobertas na inicialização da sessão; não é possível confirmar o reconhecimento ao
  vivo sem uma nova sessão/turno de LLM (fora do escopo desta rodada). O contrato de descoberta é validado
  deterministicamente por `test-skills.mjs` (estrutura/frontmatter que o loader consome).
