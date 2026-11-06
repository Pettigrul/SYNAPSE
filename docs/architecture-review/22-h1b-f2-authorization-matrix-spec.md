# 22 — H1b-F2: Authorization Matrix (Especificação Preliminar)

> **Especificação apenas** — nenhuma implementação, nenhum teste IDOR/BOLA executado.
> Documento para subsidiar a decisão de autorizar (ou não) o H1b-F2. Constrói sobre o
> Multi-Session Runtime do H1b-F1 ([`21-h1b-f1-multi-session.md`](21-h1b-f1-multi-session.md))
> sem alterar a base de conhecimento, `agents/` ou dependências.

## 1. Objetivo

Comparar, de forma controlada, como um **mesmo recurso** responde quando acessado por
**principais diferentes** (owner / cross-user / noauth), produzindo uma **matriz de
autorização** que evidencie acesso indevido (IDOR/BOLA) — **sem executar payloads ofensivos
fora de laboratório sintético autorizado** e sem alterar estado do alvo além do necessário.

## 2. Modelo

- **`resourceId`** (novo, opaco): identifica um recurso alvo (ex.: `/api/orders/{id}`) de forma
  estável entre principais. Distinto de `principalId`/`sessionId`/`contextId` (já separados no F1).
- **Principais**: reutiliza o Identity Registry (owner = dono legítimo; cross-user = outro usuário
  autenticado; noauth = sem credenciais).
- **Sonda de acesso**: para cada `(resourceId, principal)`, uma `session.request` **idempotente**
  (preferir GET/HEAD; mutações só com autorização explícita e em laboratório sintético).
- **Matriz**: `resourceId × principal → {status, tamanho/estrutura normalizada, decisão}`.
  Decisão derivada de regras explícitas (ex.: cross-user recebendo 200 + corpo equivalente ao do
  owner ⇒ **suspeita de IDOR**; noauth recebendo recurso autenticado ⇒ **suspeita de BOLA/missing
  authN**).

## 3. Comparação de respostas (sem vazamento entre principais)

- Comparar **metadados normalizados** (status, content-type, tamanho, forma/campos) — **não** o
  conteúdo bruto do recurso de um principal exposto ao artefato de outro.
- **Evidência diferencial sanitizada**: registrar *que* houve equivalência/divergência, não o dado
  sensível em si. Segredos e PII do recurso permanecem fora do contexto do LLM (Rule 6 estendido
  ao conteúdo de resposta, não só a credenciais).
- Hash/forma estrutural em vez de corpo literal quando o corpo puder conter dados do titular.

## 4. Capacidades previstas (a detalhar na autorização)

- `authz.defineResource({resourceId, request})` — registra um alvo idempotente.
- `authz.probe({resourceId, principals[]})` — executa sondas por sessão existente (reusa `session.request`).
- `authz.matrix()` — devolve a matriz com decisões e evidência diferencial sanitizada.
- `authz.explain({resourceId})` — justificativa por célula (regra aplicada).

## 5. Testes sintéticos previstos (laboratório loopback)

1. App com objetos por usuário (`/orders/{id}`): owner 200/próprio; cross-user 403/404 esperado.
2. IDOR positivo sintético: cross-user obtém 200 + corpo equivalente → detectado.
3. BOLA sintético: noauth acessa recurso autenticado → detectado.
4. Falso positivo: respostas genéricas iguais (ex.: 404 padrão) **não** classificadas como IDOR.
5. Isolamento: a sonda de um principal não contamina cookies/estado de outro (herdado do F1).
6. Evidência diferencial não contém PII/segredo do titular.

## 6. Não-objetivos (mantidos fora até autorização específica)

- Execução de IDOR/BOLA fora de laboratório sintético ou contra alvos reais.
- Mutações destrutivas, fuzzing de autorização em massa, enumeração agressiva de IDs.
- Concorrência/paralelismo (é **H1c**): a matriz roda **sequencialmente** por sessão.
- Integrações externas (Caido/MCP). Banco de dados/vault/scheduler.

## 7. Pré-requisitos (gate de entrada)

1. **H1b-F1 aceito** (entregue).
2. Definição aprovada de `resourceId` e do conjunto de **regras de decisão** da matriz.
3. **Política de evidência diferencial** aprovada (metadados normalizados; sem conteúdo sensível
   cruzado).
4. Decisão explícita: **sequencial** até H1c.
5. Laboratório sintético dedicado; nenhum alvo real nesta fase.

## 8. Riscos e questões em aberto

- **Risco de vazamento transversal** se a comparação registrar corpos brutos → mitigado por
  metadados normalizados + hashing estrutural.
- **Mutações idempotentes**: como tratar endpoints que só evidenciam IDOR via POST/PUT? Requer
  autorização explícita e rollback sintético.
- **Classificação**: limiar de equivalência de respostas (tamanho/estrutura) a calibrar para
  reduzir falsos positivos/negativos.
- **Windows corporativo**: herda a pendência (degradação para HTTP sem auth de navegador).

> Decisão solicitada: autorizar o detalhamento/implementação do H1b-F2 sob estes critérios, ou
> ajustar o modelo antes.
