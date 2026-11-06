# 47 — Integração de runtimes e aceitação real (Pi e Antigravity)

> Data: 2026-11-06. Resultado: **Pi validado em execução real com dados sintéticos; Antigravity parcial, com execução
> headless bloqueada por permissão.** Nenhum alvo real, tráfego real do Caido ou engagement real foi usado. Testes
> offline e execuções agênticas são contados em separado.

Rótulos: IMPLEMENTED, TESTED OFFLINE, VALIDATED REAL, PARTIAL, BLOCKED, NOT RUN.

## 1. Estado inicial

`main` em `697a9c8`, igual ao remoto privado. Validador 127/127 e 29 suítes verdes. Pi só provado sem turno de LLM;
Antigravity registrado como indisponível; sem `AGENTS.md` na raiz. O README estava em português, embora a missão
pedisse "manter" o inglês: foi traduzido nesta rodada.

## 2. Ambiente descoberto

Linux. `pi` 1.4.0 e `agy` (antigravity-cli 1.5.1), ambos instalados e autenticados. Caido sem instância de laboratório.

## 3. Pi: versão e contrato

Modos `-p`, `--mode json` (JSONL com chamadas de ferramenta) e `--mode rpc`; sessões por `--session-dir` e `--continue`.
`.pi/settings.json` e `.agents/skills` do projeto só carregam com confiança (`-a` ou `/trust`); `AGENTS.md` carrega sem
ela. Skills como `/skill:<nome>`. O modelo padrão local não é OpenAI, então provider e modelo são sempre explícitos.

## 4. Antigravity: versão e contrato

`agy` é uma CLI agêntica headless real, não um lançador de interface. Descobre `AGENTS.md` e
`.agents/skills/<nome>/SKILL.md`; `/skills` responde sem turno de modelo. O registro anterior de "indisponível" estava
errado para este host.

## 5. Modelos usados

| Runtime | Modelo | Execuções na rodada | Tokens | Custo |
|---|---|---|---|---|
| Pi | `openai-codex/gpt-6-luna`, `--thinking low` | 48: descoberta 6, QA 11, passadas intermediárias 11 e 10, passada final 10 | a passada final usou 1.879.079, a maioria leitura de cache | ≈ US$ 0,22 no total; final US$ 0,0493 |
| Antigravity | `gemini-3.8-flash-low` | 15: descoberta 2, QA 12, reconfirmação de S2 1 | QA 250.114; reconfirmação 20.345 | não exibido pelo runtime |

Sem falhas de autenticação, cota ou limite no Pi. O teto de 12 execuções por runtime dado à frente de QA valeu para
aquela frente; a reconfirmação de S2 foi uma execução adicional, com a hipótese do ponteiro novo. Nenhum consumo anormal.

## 6. Arquitetura integrada

Sem segundo dispatcher, KB duplicada ou nova camada de persistência. A ativação ganhou conjuntos de links por runtime:

| Runtime | Links além do conjunto comum | Efeito |
|---|---|---|
| Pi | `AGENTS.md`, `.pi/settings.json` | Dispatcher, 13 skills e extensão da Bridge via links do próprio projeto |
| Antigravity | `AGENTS.md`, `.agents/skills` | As mesmas 13 skills, por link rastreado para `.claude/skills` |

`AGENTS.md` é um ponteiro curto (menos de 1 KB). Linkar o dispatcher de 48 KB como `AGENTS.md` foi rejeitado pelo custo
por turno.

## 7. Defeitos

| # | Severidade | Defeito | Componente |
|---|---|---|---|
| 1 | Alta | Ativação Pi/Antigravity só rotulava o runtime: 0 itens SYNAPSE descobertos | `activate.mjs` |
| 2 | Alta | Ponteiro padrão compartilhado entre projetos: risco de agir no cliente errado. Mitigado, não eliminado (seção 17) | `engagement.mjs` |
| 3 | Alta | `deactivate -h` desativava de fato; o mesmo em `activate`, `init`, `use`, `clear`, `bootstrap` | CLIs |
| 4 | Média | Troca de runtime recusada ainda removia links | `activate.mjs` |
| 5 | Média | Runtime desconhecido gravava `CLAUDE.md` em silêncio | `bootstrap` |
| 6 | Média | Preflight dava escopo OK com conteúdo inválido | `preflight.mjs` |
| 7 | Média | `adapters/cli.mjs` saía com 0 em recusa fora de escopo | adapter CLI |
| 8 | Média | Agente adivinhava caminho de CLI inexistente; S12 falhou na passada intermediária | `AGENTS.md` |
| 9 | Média | Raiz de engagement aceita dentro do harness | `engagement.mjs` |
| 10 | Média | Modo não voltava ao padrão ao trocar de engagement; chave de sessão não saneada | `mode.mjs` |
| 11 | Média | `--force` e `deactivate` apagavam arquivo novo do operador; backup não voltava ao trocar de runtime; recusa parcial deixava `.pi/` vazio | `activate.mjs` |
| 12 | Baixa | Doctor não detectava Pi/`agy`; fragmento de `select` inutilizável; descrição do `SKILL.md` acima do limite do Pi; `--help` de preflight e adapter; diretório vazio após troca de runtime | vários |

## 8. Causas raiz

A ativação foi desenhada para o Claude Code, e os demais runtimes herdaram só o rótulo. A sessão dependia de
`SA_SESSION_ID`, que nenhum runtime novo define. Os parsers das CLIs só reconheciam ajuda em uma posição. Os demais
defeitos eram validações ausentes em entradas que os fluxos antigos nunca exercitaram.

## 9. Correções

Links por runtime, validação de `--runtime` e reativação que respeita o marcador. Sessão estável por projeto derivada do
marcador, com `SA_SESSION_ID` explícito prevalecendo. `bootstrap` segue o marcador e recusa runtime desconhecido. As
demais correções são locais a cada componente da seção 7. Scope Guard, Approval Gate e a semântica de escopo não foram
alterados nem enfraquecidos.

## 10. Testes de aceitação

`tools/acceptance/runtime-acceptance.mjs`: fora das suítes offline, exige `--accept-model-cost` e um export sem `.env`
nem `engagements/`. O veredito combina chamadas de ferramenta no log JSON e efeitos em disco, nunca só o texto do modelo;
S10 e S12 também checam esse texto, e checagens leves sobre ele podem rebaixar para PARTIAL. Não usa flag que ignore
permissões.

Ajustes feitos depois de ver falhas, para leitura crítica:

- S9: o prompt passou a nomear o seletor `next`, pois a primeira tentativa o chamou só uma vez. O PASS depende dessa
  indicação.
- S12: o critério aceita uma verificação fundamentada em `list`, além da tentativa de `use`. Na passada final o agente
  tentou `show` e `select` em `nao-existe` e recebeu `not-found`. A recusa real de `use` foi exercida em uma passada
  anterior. A primeira leitura da passada final deu FAIL por falso negativo: a resposta dizia "não há engagement com esse
  nome", fora da regex. A regex foi ampliada e o cenário, rejulgado do log, sem nova chamada ao modelo.
- S5: o verificador passou a contar comandos encadeados.
- S9: o script rotula a tarefa como Class A e o agente para nela. Isso prova a disciplina do modelo, não um mecanismo:
  nenhum gate foi acionado.

## 11. Evidência de execução real

Os logs ficaram fora do repositório, por serem de sessão. A verificação combina: `SKILL.md` lido (S2); manifesto do
engagement criado (S3); 9 diretórios e terceira execução idêntica em bytes (S5); linha calculada em `ccNotes.md` (S8); 2
tarefas concluídas, Class A aberta e 0 POST (S9); mesma sessão em novo processo (S10); GET no log da fixture local e host
fora de escopo recusado (S11); seleções e modos independentes (S13). A execução é reproduzível com o script da seção 10.

## 12. Resultados por runtime

Pi: uma única passada sobre o código final, com S12 rejulgado do log (seção 10). Passadas anteriores mostram variação do
modelo: o fluxo pelo qual o agente chega ao resultado muda entre execuções. A última correção, depois desta passada, muda
só a recuperação de sessão por link e o `deactivate` com arquivo novo; foi validada offline.
Antigravity: passada de QA; S1 e S2 reconfirmados com o ponteiro final.

| # | Cenário | Pi | Antigravity |
|---|---|---|---|
| 1 | Instalação e ativação | PASS | PASS (13/13 skills) |
| 2 | Reconhecimento e dispatcher | PASS | **FAIL**: responde pelo ponteiro, sem abrir `SKILL.md` |
| 3 | Engagement | PASS | BLOCKED |
| 4 | Escopo | PASS | BLOCKED |
| 5 | Bootstrap e idempotência | PASS | BLOCKED |
| 6 | Skill | PASS | BLOCKED: skill expandida, shell negado |
| 7 | Troca de modo | PASS | BLOCKED |
| 8 | Copilot | PASS | BLOCKED |
| 9 | Autopilot | PASS | BLOCKED |
| 10 | Persistência e retomada | PASS | BLOCKED: conversa retomada, leitura de estado negada |
| 11 | Capability Bridge | PASS | BLOCKED: sem adapter; shell negado |
| 12 | Falha controlada | PASS | PASS, só no caminho de falha de leitura |
| 13 | Isolamento | PASS | PARTIAL: verificado só pela CLI |
| 14 | Paridade de documentação | PASS | PASS, só em comandos não agênticos; os agênticos seguem bloqueados |

Caido: NOT RUN em ambos, sem instância de laboratório. S14 deixou como NOT RUN `npm install`, `cp .env.example .env` e
`pi install`, por mutarem a árvore ou o ambiente global.

**Bloqueio do Antigravity, nas palavras do runtime:** `--mode auto is not available for this account` e
`a tool required the "command" permission that headless mode cannot prompt for, so it was auto-denied`. A execução negada
sai com rc=0 e `status: SUCCESS`, resposta vazia: quem automatizar deve checar `denied_actions`. Nenhuma regra de
permissão foi adicionada e nenhuma flag de bypass foi usada, pois a decisão é do operador. Os cenários 3 a 11 nunca
rodaram além da negação, e o uso interativo não foi testado.

## 13. Regressões

| Item | Resultado |
|---|---|
| Validador KB (export) | 127/127, 0 achados |
| Suítes offline (HOME isolado, sem credenciais) | 31/31: 29 de base + `test-runtime-links` 44/44 + `test-runtime-contract` 59/59 |
| Mutações de sanidade nos testes novos | 22/22 da QA (relatadas por ela, sem log salvo) e 6/6 das correções finais, em export descartável |
| Links | 218 de 220; os 2 restantes são caminhos fictícios de `fixtures/sample.html` |
| Assets | 12 de 12 referenciadas |
| Mermaid | 3 blocos, mesma estrutura; rótulos traduzidos |

`test-modes` falhou uma vez nesta rodada: um texto novo apagou a declaração de NOT RUN exigida pelo teste. O texto foi
corrigido e o teste, mantido.

## 14. Segurança

Todas as execuções usaram export sem `.env` e `engagements/`, projetos e raízes descartáveis, `CAIDO_*` limpas e fixture
em loopback. Hashes de `~/.pi/agent/{settings,trust}.json` e das configurações do `agy` não mudaram; o `agy` gravou só
artefatos de sessão esperados. Varredura de segredos nos logs sem achados, e nenhum processo remanescente.

Limitações que o operador precisa conhecer:

- **O `bash` do Pi não tem sandbox.** O agente pode editar o arquivo de contextos da Bridge ou acessar hosts
  diretamente. A Bridge limita as próprias ferramentas, não o agente; contenção real exige isolamento no SO.
- **`adapters/cli.mjs` recebe o escopo de quem chama:** não é um gate do operador.
- **O `.env` central alcança todo projeto ativado** (salvo `SA_SKIP_ENV_FILE=1`); variáveis exportadas têm precedência.
- **O `HOME` real do Pi** carrega também as skills globais do usuário, sem isolamento testado nesta rodada.

## 15. Documentação atualizada

README traduzido para inglês e atualizado; guias novos `handbook/operator/pi-agent.md` e `antigravity.md`; `adapters/`,
`handbook/06`, `handbook/18`, `handbook/README`, guia do operador, `docs/README.md`, `tools/README.md`, `.env.example` e
as skills `ativar-projeto` e `criar-engagement`.

## 16. Revisão independente

Revisor independente, a partir do diff real e dos resultados, com regressões refeitas por conta própria:

| Rodada | Veredito | Motivo |
|---|---|---|
| 1 | NO-GO | README creditava ao Pi a aprovação faseada; relatório dizia que o veredito nunca usa o texto do modelo |
| 2 | NO-GO | A correção por `PWD` perdia o marcador do caminho físico: risco de cliente errado |
| 3 | GO | Bloqueios resolvidos. Apontou um caminho restante de perda de dados sob `--force` |
| 4 | GO | Conferência do delta dessa última correção, sem reexecutar o validador; o orquestrador o rodou nesta árvore (127/127) |

O revisor não fez chamadas a modelo: o comportamento ao vivo foi auditado pelos logs. Não verificou as mutações relatadas
na seção 13.

## 17. Limitações restantes

1. Antigravity: decisão do operador sobre permissões; uso interativo NOT RUN; sem adapter da Bridge, logo `/investigar`
   sem caminho stateful; `gemini-3.8-flash-low` não abriu o dispatcher. Sem homologação.
2. Pi: TUI, `/trust`, RPC com modelo, operações sob aprovação executadas de fato, Caido e alvos reais: NOT RUN.
3. Windows: NOT RUN.
4. Sessão por projeto: fora do projeto ativado não há marcador, e a CLI cai no ponteiro padrão, que pode ser de outro
   cliente. Rode da raiz do projeto ou defina `SA_SESSION_ID`.
5. `pi -a` confia em todo recurso local do projeto, inclusive `.pi` de um repositório de cliente (documentação do Pi, não
   testado). Use só em projeto revisado.
6. Baixas, sem correção: projeto já ativado perde a seleção ao atualizar (falha segura; selecione de novo); `clear` seguido
   de `use` do mesmo engagement mantém o Autopilot; `.agents` como arquivo gera ativação parcial; `.pi` como link para fora
   recebe o link por dentro; `doctor` em subdiretório diz "não ativado".
7. Claude Code: suítes verdes, sem nova execução ao vivo nesta rodada.
8. Validação sintética, em uma máquina e um modelo por runtime: não mede a qualidade de um pentest real.

## 18. Commit e push

Registrados no commit seguinte, com o hash publicado e a confirmação do remoto.

## 19. Próximos passos

1. Operador: decidir como liberar comandos do `agy` e reexecutar o script de aceitação.
2. Avaliar um adapter da Bridge para Antigravity (por exemplo, MCP), funcionalidade nova fora desta rodada.
3. Exercitar no Pi a TUI, `/trust` e uma operação sob aprovação.
4. Testar em laboratório com instância do Caido e no Windows.
