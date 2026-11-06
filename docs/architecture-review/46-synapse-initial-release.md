# 46 — SYNAPSE: limpeza final e release inicial privado

> Data: 2026-11-06. Registro da preparação e publicação do primeiro release. Testes offline **não** são validação
> real, e Pi e Antigravity seguem sem homologação ao vivo.

## 1. Estado inicial

Raiz `SYNAPSE/` íntegra após a migração, branch `main`, sem commits nem remoto, 346 arquivos staged, validador
127/127, 26 suítes não-Pi aprovadas e as 3 do Pi bloqueadas. O hook do Codex apontava para um caminho inexistente, e `Prompt.md` estava
fora do índice.

## 2. Método

Cinco frentes: A (repositório e dependências), B (runtimes), C (documentação e assets), D (Git e dados sensíveis),
todas somente leitura, e E (revisor independente). As alterações ficaram com um único autor. E emitiu **NO-GO** na
primeira revisão, por três defeitos no README; após a correção, emitiu **GO** para a árvore
`04b362d8c7cf06f13fded90328dbea0a2dc5277e`.

## 3. Inventário da limpeza

| Item | Classe | Destino e justificativa |
|---|---|---|
| `.codex/` (2 arquivos) | REMOVE | Quarentena. Decisão de escopo; nada importava o hook, cópia antiga do `.claude/hooks/consult-kb.mjs` |
| 29 imagens em `images/assets/` | REMOVE | Quarentena. Sem referência em nenhum arquivo rastreado; arte sem consumidor concreto |
| `h0-staging/` (40 arquivos) | ARCHIVE | `docs/architecture-review/archive/h0-staging/`. Baseline histórico; só docs o citam |
| `migrate-to-synapse.sh` | ARCHIVE | `docs/architecture-review/archive/`. Migração concluída; o gate corrigido fica preservado |
| `Prompt.md` | KEEP | Autorizado pelo operador; lido integralmente, sem segredos ou nomes corporativos; inalterado |
| `docs/architecture-review/` | KEEP | Histórico; alterado só na sanitização da seção 6 e em um link para o script arquivado |
| 12 imagens usadas, `manifest-h0.json`, `baseline/`, `validate_h0.mjs`, `.bat`, fixtures | KEEP | Em uso por runtime, testes ou documentação |
| `intake/files/` | KEEP | `.gitkeep` adicionado: `SKILL.md` espera o diretório em um clone |
| `.env`, `engagements/`, `.vscode/`, `intake/scratch.md`, `node_modules/`, `pre-promotion-snapshot.tgz` | IGNORE | Locais; não foram tocados nem publicados |

A quarentena fica fora do repositório, em `_synapse-quarantine-20261106/`, no diretório pai, com `MANIFEST.txt`
(hashes conferidos). O backup `_synapse-backup-20261106-021308/` foi mantido. Nenhum engagement ou evidência foi
apagado.

## 4. Retirada do Codex (decisão de escopo)

Não é correção de defeito: o Codex só deixou de fazer parte desta distribuição. Saíram `.codex/`, o alias
`runtime === "codex"` em `engagement.mjs` e as menções em `SKILL.md`, `references/`, `workflows/` e handbook.

Permanecem de propósito:

- `".codex"` na lista de diretórios globais recusados por `activate.mjs`, que é um controle de segurança.
- `openai-codex` no handbook 06, nome de um provider de modelo do Pi na execução registrada.
- Registros históricos em `docs/architecture-review/`.

Nenhum teste dependia do Codex, e nenhum foi removido. A reintrodução futura exige recriar o adaptador; a cópia
retirada está na quarentena.

## 5. Alterações além da limpeza

- `activate.mjs`: `workflows` entrou em `LINKS`, com asserção em `test-activation.mjs`. `SKILL.md` roteia 9 arquivos de flow
  (11 referências) para `workflows/`, e essas rotas quebravam em projetos ativados. Marcadores antigos reportam `healthy` até a
  reativação.
- `workflows/flows-agents.md` e `flows-scope.md` sincronizados a partir de `references/`. A divergência era
  estritamente aditiva (0 linhas exclusivas de `workflows/`) e restaura instruções de controle na rota do dispatcher.
- README, adapters e handbook: declarações alinhadas ao que foi exercido. Pi e Antigravity foram reduzidos; Claude Code em
  `runtimes.md` e as linhas de Copilot, S3 e P3 em `readiness.md` foram elevados conforme a aceitação S4. `pi install` deixou de ser o caminho
  principal, `AGENTS.md` está descrito como gerado na raiz do engagement, e Antigravity consta como contrato.
- Nomes: pacotes `synapse-*`, rótulo `SYNAPSE Doctor` e cabeçalhos. Identificadores reais (`SA_*`, `.hackbot`,
  `securityauditor_*`, skill `security-auditor`) ficaram.

## 6. Dados sensíveis

| Verificação | Resultado |
|---|---|
| Tokens, senhas, cookies, chaves, URLs com credencial | Nenhum real; ocorrências são placeholders, fixtures ou código |
| Valor real de `CAIDO_TOKEN` | Ausente do clone publicado |
| CPF/CNPJ, e-mails, hosts internos | Nenhum real, por padrões; apenas exemplos |
| Imagens | Sem dados sensíveis nas folhas de contato; banner com manifesto C2PA de geração, sem dado pessoal encontrado por filtro de strings |
| Identificadores de engagement | As docs divergiam entre "laboratório" e "dados reais". Por classificação incerta, viraram `ENG-A`, `ENG-B`, `<in-scope-host>` e `<project-id>` nas docs 37, 38, 41, 42, 43, 44 e em `readiness.md` |
| Rótulo "Testes harness" | Mantido: genérico, sem identidade de cliente ou alvo |

Restrições de estação corporativa sem nome, em várias docs históricas e no handbook (ex.: docs 00, 06, 08, 17), e caminhos com o usuário local em docs históricas
permaneceram. São aceitáveis em repositório privado; revise antes de qualquer abertura.

**`.gitignore`:** ampliado para credenciais, chaves, capturas de tráfego, dumps, artefatos de engagement na raiz,
caches (`__pycache__/`, `.cache/`, `.pytest_cache/`), logs, temporários, compactados e estado local (`.pi/`,
`.gemini/`, `.codex/`). A negação sem efeito de `.vscode` foi retirada. Nenhum arquivo rastreado é atingido.

**Gate de sensíveis:** bateria de 66 casos aprovada; limpo sobre o índice e sobre o commit.

## 7. Compatibilidade de runtimes

| Runtime | Estado |
|---|---|
| Pi Agent | Adaptador, entry e startup RPC **PASS** contra o pacote Pi real instalado, offline, sem turno de LLM. Pentest ao vivo: **NOT RUN** |
| Google Antigravity | Só contrato `AGENTS.md`, gerado por `bootstrap --runtime agents` (smoke PASS) sobre o núcleo compartilhado. Runtime indisponível: **NOT RUN** |
| Claude Code | Validado em S4 (integração e experiência). Análise in-scope: **NOT RUN (NO DATA)** |
| Windows | `.bat` e symlinks: **NOT RUN** neste release |

## 8. Regressões

| Item | Resultado |
|---|---|
| Validador KB (clone) | **127/127**, 0 achados |
| Suítes (clone, `HOME` isolado, sem credenciais) | **29/29 PASS**: 26 não-Pi e 3 do Pi (`adapter`, `entry`, `rpc`), antes bloqueadas por falta do pacote/binário Pi. As docs 44/45 registravam 26/26 + 2 NOT RUN, com outro recorte: incluíam `test-pi-adapter` e não listavam `web-runtime/test.mjs` |
| FAIL / BLOCKED | 0 / 0 |
| NOT RUN | Pentest ao vivo em Pi e Antigravity; `.bat` no Windows; `pi --skill` carregando o dispatcher em sessão real |
| Links | 176 de 178; os 2 restantes são caminhos fictícios de uma fixture de teste. Âncoras do README verificadas por C |
| Assets | 12 de 12 referenciadas; assinaturas PNG válidas |
| Diagramas | 3 mermaid do README com parse OK (sem renderização visual) |
| Ativação + desativação | Smoke PASS, com rotas `workflows/` resolvendo em projeto ativado |

## 9. Publicação

| Item | Valor |
|---|---|
| Repositório | `https://github.com/Pettigrul/SYNAPSE` (conta pessoal, tipo `User`) |
| Visibilidade | **PRIVATE**, confirmada pela API; acesso anônimo recebe 404 em API, web e raw |
| Commit inicial | `1d34ce7ec77d9c871ad7e017ca8d8487209390f6`, árvore igual à revisada |
| Push | Sem force. SSH sem chave neste host, então HTTPS com o auxiliar de credenciais do `gh`, só no comando |
| Clone de validação | 318 arquivos; sem `.env`, engagements, caches, dependências, `.codex/` ou compactados |

Este relatório entrou em um commit posterior normal, com nova revisão de segurança.

## 10. Limitações e pendências

1. Homologar Pi e Antigravity ao vivo, e obter tráfego in-scope para a cadeia análise → leads → Investigation Record.
2. Testar os `.bat` e a ativação no Windows.
3. Qualificar "VALIDATED REAL" como laboratório sintético no README, linhas 122-123 e 214 (a matriz já o faz).
4. `--runtime codex` agora cai silenciosamente em `CLAUDE.md`, como qualquer valor desconhecido.
5. Reativar projetos já ativados para que recebam o link `workflows/`.
6. `pre-promotion-snapshot.tgz` é local: os comandos de rollback em doc 15 não funcionam em um clone.
7. Antes de tornar o repositório público: sanitizar caminhos locais, rever notas de ambiente corporativo e o e-mail de autoria.
8. A revisão não pode atestar a política corporativa sobre `Prompt.md` ou o projeto; a inclusão segue a decisão do operador.
9. Descartar quarentena e backup quando o operador julgar adequado.
