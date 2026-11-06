# 10 — Plano de Implementação

> Plano incremental, por fases, para aprovação. **Nada aqui foi executado** — esta etapa é só pesquisa/análise/documentação. Cada fase tem entrada, saída e critério de validação. A ordem respeita dependências e o princípio anti-overengineering (construir sob necessidade).

---

## Fase 0 — Teste de aceitação do ambiente (pré-requisito de tudo que é externo)

**Objetivo:** substituir "o README diz que roda no Windows" por fato no ambiente corporativo real.

| Passo | Ação | Critério de aceitação |
|-------|------|-----------------------|
| 0.1 | Rodar o runtime availability check do HackBot no host alvo | `$PSVersionTable`, `Get-Command python,go,node,npm` registrados em `ccNotes.md ## What Works Here` |
| 0.2 | Confirmar leitura/execução das skills Markdown pelo runtime (Pi e/ou Claude Code e/ou Antigravity) | Skill carrega, dispatch roteia, brief é gerado com as 3 policies |
| 0.3 | (Condicional, só se H2 for desejado) Tentar instalar Caido + executar `caido-mcp-server` | App instala sem admin? binário executa? cert CA importa? — resultado documentado, SIM/NÃO |
| 0.4 | Testar serviço HTTP local (forge OAST) e processo-filho (subagente) | Porta localhost abre? subagente despacha? — se não, marcar como indisponível e usar fallback |

**Saída:** matriz de capacidades realmente disponíveis no ambiente. **Gate:** sem 0.1–0.2 OK, nada prossegue; 0.3–0.4 só gateiam o H2.

---

## Fase 1 — Migração H0 (reembalagem portável; perda-zero)

**Objetivo:** `agents/`→`skills/`, policies explícitas, adaptadores — sem mudar comportamento.

| Passo | Ação | Validação |
|-------|------|-----------|
| 1.1 | Criar `skills/`, `policies/`, `workflows/`, `tools/`, `adapters/` (cópia, não move) | Estrutura existe; originais intactos |
| 1.2 | Mover 3 docs imutáveis → `policies/` preservando marcadores | `grep SECAUDIT_*_v1` encontra os 3 |
| 1.3 | Converter cada KB `agents/<x>` → `skills/<x>/SKILL.md` + `references/` (corpo verbatim) | **Validador V1** (abaixo) passa |
| 1.4 | Reescrever `SKILL.md` como roteador magro apontando para sub-skills | Todo trigger do dispatch resolve para uma skill/workflow |
| 1.5 | Atualizar `pattern-index` keyword→skill | **Validador V2** (abaixo) passa |
| 1.6 | Criar adaptadores finos (Claude/Pi/Antigravity) apontando para `skills/` | Cada adapter referencia `skills/`, não copia |
| 1.7 | Rodar suíte de validação; só então aposentar `agents/` para `8-Archive/` | Todos validadores verdes |

### Validadores (scripts a escrever em Fase 1)
- **V1 — perda-zero:** para cada `T[N]` original, o corpo (`Steps`+`Payload`+`Why`+`Tier`+`Escalation`+`Source`) existe byte-a-byte na skill-destino. Diff vazio = OK. Contagem total de técnicas bate (~120).
- **V2 — roteamento tri-consistente:** todo keyword do `pattern-index` resolve para uma skill existente; todo trigger do `SKILL.md` idem; toda skill tem entrada de roteamento.
- **V3 — policies intactas:** os 3 marcadores presentes; Rule 0 presente; um brief de teste gerado contém os 3 docs verbatim.
- **V4 — anti-regressão native-tooling:** nenhum `Payload` de skill invoca ferramenta da lista `## Banned tools` sem o equivalente nativo.
- **V5 — nomes portáveis:** todos os novos arquivos passam no sanitizador Windows (sem char reservado, sem colisão case-only).

**Saída:** HackBot portável, organizado, com perda-zero comprovada. **Reversível** até 1.7.

---

## Fase 2 — Split de `web-testing` (opcional ao core; melhora disclosure)

| Passo | Ação | Validação |
|-------|------|-----------|
| 2.1 | Dividir T1–T14 em `skills/web-exploitation/references/<classe>.md` | V1 (corpo verbatim) por técnica |
| 2.2 | `## Index` da skill lista todas as classes com `Tier`/`Tags` | Carrega só a classe casada, não o arquivo inteiro |

---

## Fase 3 — Extensões de valor H1 (nativas; sob gate de necessidade)

> Construir **quando um engajamento concreto exigir** (D3). Ordem obrigatória por dependência.

| Passo | Capability | Entrega mínima (nativa) | Validação |
|-------|-----------|-------------------------|-----------|
| 3.1 | (6) Session Manager | Perfis nomeados em `scope.md`/`session.md` (ref + renovação); `request_as(profile)` como padrão de workflow | Dois perfis isolados; troca substitui contexto; Rule 6 respeitada (sem valor em arquivo) |
| 3.2 | (7) AuthZ-Test (IDOR/BOLA) | Workflow owner/cross/noauth sobre 3.1 + diff | Nunca declara IDOR sem comparação dois-principal; evidência roteada |
| 3.3 | (8) Concurrent (race) | Blueprint forge + workflow (`concurrent.futures`/PS jobs) | Dispara N concorrentes; detecta anomalia; Classe A sob gate + DELAY |

**Saída:** três capabilities que são lacuna do campo, 100% nativas, sem dependência externa.

---

## Fase 4 — Integrações condicionais H2 (só se Fase 0.3 aprovou)

> Troca o **backend** de (5)/(6)/(7)/(8) para Caido sem mudar a interface.

| Passo | Ação | Pré-condição |
|-------|------|--------------|
| 4.1 | Integrar `caido-mcp-server` como backend de (5) HTTP (history/replay/diff) | Fase 0.3 = SIM; licença MIT confirmada (D5) |
| 4.2 | Cookie jar automático → (6) Session | 4.1 OK |
| 4.3 | Batch multi-token → (7) AuthZ | 4.1 OK |
| 4.4 | Replay Pipelines → (8) Concurrent | 4.1 OK |
| 4.5 | (Alternativa) Se binário externo bloqueado: avaliar VibeHacking (MCP in-Caido) | Fase 0.3 = binário NÃO, plugin SIM |

**Regra de retrocesso:** se qualquer passo da Fase 4 falhar no ambiente, o sistema permanece no H1 nativo (Fase 3) sem retrabalho — a interface é a mesma.

---

## Fase 5 — Futuro H3 (reavaliar)

Tools determinísticas empacotadas (3.1 do doc 08), multi-runtime pleno, validação cética separada — só sob necessidade medida.

---

## Cronograma lógico (dependências, não datas)

```
Fase 0 (aceitação) ─┬─> Fase 1 (migração H0) ─> Fase 2 (split, opcional)
                    │
                    └─> [0.3/0.4 gateiam] ──────────────> Fase 4 (Caido H2)
                                                              ▲
Fase 3 (H1 nativo, sob necessidade) ──────────────────────────┘ (turbina, não bloqueia)
```

- **Caminho crítico:** Fase 0 → Fase 1. É o que entrega valor (portabilidade + organização) com risco mínimo.
- **Fase 3** é independente da 4 e nasce nativa; a 4 só a *turbina* se o ambiente permitir.
- **Fase 2** é cosmética de disclosure; não bloqueia nada.

---

## Definição de pronto (por fase)

- **F0:** matriz de capacidades do ambiente documentada; go/no-go para H2 registrado.
- **F1:** V1–V5 verdes; `agents/` arquivado; HackBot roda idêntico em Claude e Pi (e Antigravity se disponível).
- **F2:** `web-exploitation` carrega por classe; V1 por técnica verde.
- **F3:** cada capability com um engajamento/caso de teste que a exercita e evidência roteada.
- **F4:** backend Caido ativo com mesma interface; teste de retrocesso (desligar Caido → fallback nativo) passa.

---

## Primeiro passo concreto, se aprovado
Rodar **Fase 0.1–0.2** (availability check + carga de skill num runtime) e o **Validador V1 em modo dry-run** sobre `agents/` para medir a baseline de ~120 técnicas — antes de mover qualquer arquivo. Isso confirma perda-zero como meta mensurável e não altera nada.
