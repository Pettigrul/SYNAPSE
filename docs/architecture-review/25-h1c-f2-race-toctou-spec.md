# 25 — H1c-F2: Race & TOCTOU Validation (Especificação Preliminar)

> **Especificação apenas** — nenhuma implementação, nenhum teste de corrida/TOCTOU executado.
> Documento para subsidiar a decisão de autorizar (ou não) o H1c-F2. Constrói sobre a Concurrent
> Execution Foundation (H1c-F1, [`24-h1c-f1-concurrent-execution.md`](24-h1c-f1-concurrent-execution.md))
> sem alterar base de conhecimento, `agents/` ou dependências.

## 1. Objetivo

Investigar, de forma reproduzível e conservadora, **condições de corrida de autorização e
TOCTOU** (time-of-check/time-of-use) — por exemplo, uso duplo de cupom, saque concorrente,
bypass de verificação por janela de corrida — usando o executor concorrente do H1c-F1, **sem
depender de timing isolado** para concluir.

## 2. Modelo

- **Janela de corrida**: um conjunto de operações preparadas que disputam um **recurso com estado
  observável** (saldo, contador, flag de uso único).
- **Efeito observável** (análogo ao marcador de posse do H1b-F2): o estado do recurso **após** a
  janela evidencia a corrida (ex.: saldo debitado duas vezes; cupom usado N>1). É a evidência que
  distingue **corrida confirmada** de **suspeita**.
- **Reprodutibilidade**: repetição controlada (N tentativas) com relato de taxa de sucesso da
  corrida; resultados **não determinísticos** são tratados estatisticamente, nunca como prova
  única por um único timing.

## 3. Classificação (regra dura, herdada)

`conforme` · `anomalia` · `corrida-confirmada` · `inconclusivo`.
- **Um timing favorável — ou uma única ocorrência — NÃO confirma** a corrida.
- **Corrida confirmada exige**: efeito de estado observável que **viole** uma regra estabelecida
  (origem declarada: fixture/política/premissa) **e** reprodutibilidade acima de um limiar.
- Sem efeito observável ou sem regra → `anomalia`/`inconclusivo`.

## 4. Capacidades previstas (a detalhar na autorização)

- `race.defineWindow({resource, operations, repetitions})`.
- `race.run()` — reusa `concurrent.prepare/run` por tentativa; mede efeito pós-janela.
- `race.classify()` — aplica a regra dura com reprodutibilidade.

## 5. Testes sintéticos previstos (laboratório, reversível)

1. Uso único corretamente serializado (sem corrida) → `conforme`.
2. Cupom de uso único vulnerável a double-spend sob concorrência → `corrida-confirmada`.
3. Saldo concorrente com verificação TOCTOU → `corrida-confirmada` (saldo negativo).
4. Falso positivo: respostas 200 concorrentes sem efeito de estado → `conforme`/`anomalia`.
5. Reprodutibilidade abaixo do limiar → `inconclusivo`.
6. Isolamento e sanitização de evidências sob repetição (herdado).
7. Fixtures reversíveis: reset entre tentativas; estado restaurado.

## 6. Não-objetivos (até autorização específica)

- Alvos reais; mutações destrutivas fora de fixture reversível.
- Orquestração multiagente avançada; integração Caido.
- Concorrência ilimitada (mantém limites conservadores do H1c-F1).

## 7. Pré-requisitos (gate)

1. H1c-F1 aceito (entregue).
2. Modelo de efeito observável + limiar de reprodutibilidade aprovado.
3. Fixtures reversíveis com estado observável.
4. Política de evidência para resultados não determinísticos (Rule 6 preservado).

## 8. Riscos e questões em aberto

- **Jitter de rede/navegador** limita a força da corrida em loopback; a confirmação depende de
  efeito de estado, não de timing — mitiga falso positivo/negativo.
- **Repetições** aumentam carga; exigem limites e cancelamento (reuso do H1c-F1).
- **Reversibilidade**: endpoints sem reset exigiriam premissa aprovada e controle de impacto.

> Decisão solicitada: autorizar o detalhamento/implementação do H1c-F2 sob estes critérios, ou
> ajustar o modelo antes.
