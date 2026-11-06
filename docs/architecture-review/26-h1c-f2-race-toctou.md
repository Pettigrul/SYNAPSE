# 26 — H1c-F2: Stateful Race & TOCTOU Validation (Relatório de Aceitação)

> Transforma operações concorrentes em **experimentos de segurança reproduzíveis** que demonstram
> violações de **invariantes de negócio** e de **autorização** (double-spend, overdraw, TOCTOU de
> revogação). Reutiliza ConcurrentExecutor, Session Manager, Authorization Matrix, Browser Runtime,
> Scope Guard, Evidence, Rule 0/6. Navegador real + **fixture de laboratório reversível**. Uma
> violação é confirmada **apenas** por alteração de estado na fonte autoritativa — nunca por
> status/latência. **Sem alvos reais. 127 entradas intactas; `agents/`, policies e corpos técnicos
> preservados; nenhuma dependência nova.**

## 1. Arquitetura (reuso + mínimo)

| Componente | Arquivo | Papel |
|------------|---------|-------|
| Fixture reversível | `fixtures/race-lab.mjs` | Oráculo autoritativo `GET /_state`; `POST /_reset` (e `/_reset-broken`); variantes **vulnerável** (check→await→act) e **segura** (atômica); TOCTOU de revogação. |
| Validador stateful | `race-validator.mjs` | Ciclo de 12 passos, invariantes declaradas, reprodutibilidade, reset verificável, classificação. |

Adicionado **somente**: definição de experimentos stateful, validação de invariantes e
repetição/avaliação de reprodutibilidade. **Nenhum** scheduler distribuído, banco, motor
multiagente, fila ou executor externo. As operações concorrentes usam o **ConcurrentExecutor**
(barreira + pool) sobre o canal autenticado das sessões (cookies/tokens nunca extraídos).

## 2. Contrato do experimento (declarado — o agente não inventa regras)

Declara: `experimentId`, identidades/sessões, recursos de laboratório, **hipótese**, **regra
esperada + fonte** (`documented-policy`/`lab-fixture`/`approved-premise`), **estado inicial
exigido**, operações concorrentes, condições de sincronização, estado final esperado, **fonte
autoritativa de observação**, **procedimento de reset**, limite de tentativas, limites de
concorrência/duração e política de evidências. Sem regra estabelecida (fonte válida) **e**
invariante declarada, o validador retorna `inconclusivo` — **não inventa** regra de negócio ou
política de autorização.

## 3. Ciclo de execução (12 passos)

validar escopo/autz → **preparar estado inicial** → **verificar pré-condição** → preparar operações
→ liberar barreira → executar → aguardar/timeout → **observar estado final (fonte autoritativa)** →
avaliar invariantes → registrar evidências → **restaurar estado (verificável)** → repetir.
- Estado inicial **não comprovável** ⇒ **não executa** (R10/R19).
- **Reset falha** ⇒ interrompe as tentativas e marca estado **potencialmente contaminado** (R11).
- Tentativas são **sequenciais** (compartilham estado de laboratório); só as **operações** de uma
  tentativa correm em concorrência — sem tentativas simultâneas sobre estado compartilhado.

## 4. Classificação (regra dura)

`conforme` · `anomalia` · `violacao-observada` · `violacao-reproduzida` · `inconclusivo`.
- **Violação exige evidência de alteração de estado** (ou decisão de autorização) incompatível com
  regra **previamente estabelecida**. **HTTP 200, tamanho, latência e códigos de erro não são prova**
  (R6).
- Reprodução (≥2 tentativas independentes) ⇒ `violacao-reproduzida` (R8); observação única ⇒
  `violacao-observada` e **não é descartada** (R2/R7).

## 5. Testes sintéticos (20/20 PASS, navegador real, `evilHits=0`)

| # | Caso | Resultado |
|---|------|-----------|
| 1 | Duas ops, limite de uma efetivação (seguro) | conforme (couponUses=1) |
| 2 | Sistema vulnerável efetiva duas | **violação observada** (couponUses=2) |
| 3 | Sistema seguro com controle atômico | conforme |
| 4 | TOCTOU com revogação de autorização | **violação observada** (actionsAfterRevoke=1) |
| 5 | Ops simultâneas entre identidades diferentes | **violação observada** (2 principais) |
| 6 | HTTP 200 sem alteração de estado | conforme (200 não é prova) |
| 7 | Violação observada uma única vez | violacao-observada (reproduced=false) |
| 8 | Violação reproduzida em N tentativas | **violação reproduzida** (≥2/3) |
| 9 | Ausência de violação em N tentativas | conforme |
| 10 | Falha de pré-condição | inconclusivo (não executado) |
| 11 | Falha de reset | para + **contaminado** |
| 12 | Timeout de operação | timeout capturado; sem falsa violação |
| 13 | Timeout global | cancelado; sem falsa violação |
| 14 | Cancelamento durante experimento | inconclusivo |
| 15 | Falha de uma sessão | bloqueado limpo → inconclusivo |
| 16 | Falha do navegador | tratada limpa (sem throw) |
| 17 | Destino fora de escopo | bloqueado; evil não contatado |
| 18 | Operação sem autorização | bloqueado (state-change-unauthorized) |
| 19 | Evidência insuficiente | inconclusivo |
| 20 | Limpeza de recursos após encerramento | sessões utilizáveis; sem vazamento |

## 6. Evidências de violação e reprodução

- **Violação (R2/R5):** estado final autoritativo `couponUses=2` com `stateChanged=true` sob regra
  `lab-fixture` ⇒ `violacao-observada`. A variante **segura** (R1/R3/R9) mantém `couponUses≤1` ⇒
  `conforme`. **TOCTOU (R4):** `actionsAfterRevoke=1`.
- **Reprodução (R8):** `summary.violations≥2`, `reproduced=true`, `variability` registrada.
- **Negativo forte (R6):** 200 concorrente sem mudança de estado ⇒ `conforme` — confirma que
  status/latência não bastam.
- **Evidência separada:** cada tentativa carrega `observed` (leituras da fonte autoritativa) vs
  `derived` (veredicto do validador). Sem segredos/corpos sensíveis; reset/isolamento registrados.

## 7. Regressão (item 7)

F1 **19/19** · F2 mock **16/16** · F2 e2e **11/11** · H1b-F1 **15/15** · H1b-F2 **18/18** · H1c-F1
**18/18** · H1c-F2 **20/20** · Validador V1 **127/127** · **corpos técnicos, policies e `agents/`
(17) preservados** · **nenhuma dependência nova** (`playwright-core 1.64.1`). Mudanças: **somente**
`tools/web-runtime/` (+ `manifest-h0.json`, saída gerada pelo Validador).

## 8. Limitações técnicas e riscos

1. **Força da corrida em loopback**: o `await` nas variantes vulneráveis torna a corrida confiável
   no laboratório; alvos reais têm jitter maior — a confirmação depende de **efeito de estado**,
   não de timing, o que mitiga falso positivo, mas corridas estreitas podem exigir mais tentativas.
2. **Cancelamento não interrompe fetch em voo** (herdado do H1c-F1): só impede ops não iniciadas.
3. **Fonte autoritativa é a fixture** (`/_state`). Em alvos reais, a observação precisará de fonte
   equivalente (API de leitura, log de servidor, premissa aprovada) — **nunca** inferida do tráfego
   da corrida.
4. **Reversibilidade** depende de reset confiável; endpoints sem reset exigiriam premissa aprovada +
   controle de impacto. Reset quebrado ⇒ estado marcado contaminado e parada (sem mascarar).
5. **Um navegador compartilhado**: falha do processo derruba as sessões (tratada limpa).
6. **Windows corporativo** não validado (degradação para HTTP, sem auth de navegador).

## 9. Recomendações para os próximos incrementos do HackBot

1. **Ponte de observação para alvos reais**: abstrair a "fonte autoritativa" além da fixture (API de
   leitura/eventos de servidor), com a mesma regra dura (efeito observável + regra estabelecida).
2. **Integração com a base de conhecimento**: mapear as classes/veredictos (IDOR/BOLA, race/TOCTOU)
   para as 127 técnicas/blueprints, **sem alterar os corpos** — apenas correlação de evidências.
3. **Windows corporativo**: validar launch/degradação em ambiente homologado (autorização própria).
4. **Cobertura de canais**: POST com corpo multipart, WebSocket, downloads/diálogos — ainda não
   suportados; avaliar sob demanda.
5. **Caido / orquestração multiagente**: só após decisão explícita; manter limites conservadores.
6. **Relatório unificado de experimento** (authz + race) para consumo pelo dispatcher, preservando
   evidence-hygiene e a distinção observado×inferido.

## 10. Recomendação

**Recomendo aceitar o H1c-F2** no ambiente de desenvolvimento: o validador produz experimentos
reproduzíveis, confirma violações **apenas** por estado autoritativo, trata pré-condição/reset/
timeout/cancelamento/falhas de forma limpa e honesta, e não há regressão. **Não** foram iniciados
Caido, motor multiagente ou novos backends; `agents/` não arquivado; P3/P4/P5 não executados.
Aguardando aprovação para a próxima evolução.
