# 28 — H1d-F1: Capability Bridge Foundation (Relatório de Aceitação)

> Disponibiliza as seis capacidades de `tools/web-runtime/` ao runtime de agentes **sem reconstruir
> o harness**. Entrega: um **Capability Bridge** (biblioteca ESM stateful, mesmo processo, **sem
> dependências**) que apenas valida, correlaciona, encaminha e gerencia ciclo de vida; um **Pi
> Adapter** que registra ferramentas nativas e foi **validado sob o runtime real do Pi 1.4.0**; e um
> **CLI Adapter** stateless opcional. Contexto de execução vem do **adaptador/operador, nunca do
> LLM**. Classificadores de AuthZ/Race **preservados**. **127 entradas intactas; `agents/` (17),
> policies (3) e corpos técnicos preservados; nenhuma dependência nova.**

## 1. Investigação do Pi (obrigatória — código real, sem presumir)

Pi instalado: **`@earendil-works/pi-coding-agent` 1.4.0** (`~/.local/share/pi-node/.../bin/pi`).
Extension API **verificada nos tipos e no runtime instalados** (não em exemplos de outras versões):

| Item | Achado verificado |
|------|-------------------|
| Entry de extension | `export default (pi: ExtensionAPI) => void \| Promise<void>` (async suportado) — confirmado pela extension real `herdr-agent-state.ts` e por `ExtensionFactory`. |
| Registro de ferramenta | **`pi.registerTool(ToolDefinition)`** existe (`ExtensionAPI.registerTool`). Helper **`defineTool`** exportado pelo pacote. `parameters` é **TypeBox** (`typebox`, presente no env do Pi). |
| Ciclo de vida | `pi.on("session_start"\|"agent_start"\|"agent_settled"\|"session_shutdown", (event, ctx)=>…)`; `pi.events.on(...)`. |
| Cancelamento | `execute(toolCallId, params, signal: AbortSignal, onUpdate, ctx)` — **AbortSignal** entregue por chamada. |
| Carregamento | `loader.loadExtensionFromFactory/loadExtensions/discoverAndLoadExtensions` + `createExtensionRuntime`; `Extension.tools: Map<string, RegisteredTool>` permite inspecionar o registro. |
| Resultado | `AgentToolResult = { content: (Text\|Image)[], details, structuredContent?, isError?, terminate? }`. |

**Conclusão:** o registro nativo **pode ser validado** sem modelo/auth, carregando a extension sob o
runtime real do Pi e invocando o `execute` da ferramenta registrada. Logo o **Pi Adapter é VALIDADO**
(não BLOCKED). **Nenhuma versão/instância do Pi foi instalada; nenhuma dependência adicionada.**

## 2. Arquitetura (separação conceitual exigida)

| Peça | Arquivo | Papel |
|------|---------|-------|
| **Capability Bridge** | `bridge.mjs` | Validação de chamadas, correlação, encaminhamento e **lifecycle** stateful. Reusa `capability.*` verbatim. Sem executor/plugin/scheduler/HTTP/DB/daemon novos. |
| **Pi Adapter (núcleo)** | `adapters/pi/extension.mjs` | Registra 2 ferramentas nativas; **injeção de dependência** (`defineTool`/`Type`/`bridge`/`resolveContext`) → testável e carregável sob o Pi. |
| **Pi Adapter (entrada)** | `adapters/pi/extension-pi.mjs` | Entrada de descoberta que o operador instala no Pi; liga `defineTool`/`Type` reais + bridge real + fonte de contexto do operador. |
| **CLI Adapter** | `adapters/cli.mjs` | Opcional, **apenas operações stateless** (`capabilities.*`, `http.*`); recusa domínios stateful. |

## 3. Interface do bridge (superfície mínima e estável)

**Um único entrypoint tipado:** `bridge.invoke({ investigationId, op, params, operationId? })`.
Operações (`BRIDGE_OPS`), por domínio — **sem registrar dezenas de ferramentas distintas**:
`capabilities.list/probe` · `http.inspect/headers` · `sessions.create/list/status/bindIdentity/close`
· `browser.navigate/snapshot/screenshot/click/fill/network/console/probe` · `authorization.registerResource/run`
· `concurrent.run` · `race.run`. O Pi expõe só **2 tools** (`securityauditor_capabilities`,
`securityauditor_invoke`) — baixo custo de contexto, validação centralizada no bridge.

**Preservação de classificadores (regra dura):** o envelope copia `classification` **verbatim** do
validador (`AuthorizationMatrix`/`StatefulRaceValidator`). O bridge **não possui caminho de código
que escreva uma classificação** — não pode transformar `anomalia` em `violação confirmada` (prova: B12).

## 4. Contexto de execução confiável (fornecido pelo adaptador, não pelo LLM)

`openInvestigation(ctx)` registra um **Execution Context** com `investigationId`, **escopo autorizado**,
**capacidades permitidas**, **limites**, **aprovações específicas** (por-ação) e `operationalSessionId`.
O agente fornece **apenas** `investigationId`/`op`/`params` — não inventa escopo nem autorização:
- `scope` do contexto é forçado em toda chamada (o agente não amplia escopo); o Scope Guard decide.
- operações sensíveis (state-changing) exigem **aprovação do contexto**; sem ela o bridge **não
  fabrica** `authorizedStateChange` → o gate já existente bloqueia (prova: B15).
- No Pi, o contexto vem de um JSON do operador (`SECAUDIT_BRIDGE_CONTEXTS`); investigação não
  provisionada → `no-trusted-context` (prova: P4). **Não há token que o agente possa inventar.**

## 5. Estado e lifecycle

IDs de sessão **opacos** reutilizados entre chamadas **dentro** de uma investigação (B6); **isolamento
entre investigações** (B7, `session-not-in-investigation`); **cancelamento** por-op/global (B8);
`closeInvestigation` fecha só as sessões daquela investigação (irmãs/navegador intactos); `shutdown`
libera o navegador e **invalida** o estado. Falha do navegador tratada limpa (B10). **Reinício =
novo `instanceId`**: um `investigationId` anterior é rejeitado como `unknown-investigation` — **sem
fingir recuperação automática** (B13). Resultados JSON **sanitizados** (B11; sem corpos/cookies/
tokens/`storageState`).

## 6. Testes (áreas 1–15) + evidências

**`test-bridge.mjs` — 15/15 PASS (navegador real, `evilHits=0`):**

| Área | Caso | Resultado |
|------|------|-----------|
| 1 Descoberta | B1 capabilities.list/probe | ok |
| 2 Chamadas válidas/ inválidas | B2 (ok / unsupported-op / unknown-investigation) | ok |
| 3 Validação de params | B3 (bad-params) | ok |
| 4 Escopo | B4 fora de escopo bloqueado; evil intocado | ok |
| 5 Operações permitidas | B5 capability-not-allowed | ok |
| 6 Reuso de sessão | B6 **persistência entre 3 chamadas no mesmo processo** | ok |
| 7 Isolamento | B7 entre investigações | ok |
| 8 Cancelamento | B8 aborta op em voo | ok |
| 9 Timeout | B9 por-op | ok |
| 10 Falha do navegador | B10 limpa | ok |
| 11 Sanitização | B11 sem cookie/token/storageState | ok |
| 12 Classificadores | B12 AuthZ `anomalia` permanece; Race `violacao-observada` do validador | ok |
| 13 Cleanup/reload | B13 shutdown + id antigo rejeitado | ok |
| 14 Compatibilidade | B14 igual a `capability.*` direto | ok |
| (policies) | B15 state-change exige aprovação do adaptador | ok |

**`test-pi-adapter.mjs` — 7/7 PASS sob o runtime REAL do Pi** (registro via `pi.registerTool`,
execução do tool, recusa sem contexto, enforcement de capacidade, cancelamento por AbortSignal,
shape `AgentToolResult` sanitizado). **BLOCKED** se o Pi ausente — **mocks nunca contam como prova
end-to-end** (nota explícita na suíte). **Demonstração de sessões persistindo entre chamadas:** B6.
**Evidências de policies:** B4/B5/B11/B15 + P4/P5.

**Área 15 — regressão integral:** F1 **19** · F2 mock **16** · F2 e2e **11** · H1b-F1 **15** · H1b-F2
**18** · H1c-F1 **18** · H1c-F2 **20** · **bridge 15** · **Pi 7** · **Validador V1 127/127**. Mudanças:
**somente** `tools/web-runtime/` (+ `manifest-h0.json` gerado). `agents/` (17), policies (3), corpos e
deps (`playwright-core 1.64.1`) inalterados.

## 7. Limitações por runtime

- **Pi (1.4.0):** registro + execução **validados** sob o runtime real. **NÃO** exercitado aqui: um
  turno completo dirigido por LLM em sessão autenticada (exige model/auth/provider/TUI) — fora do
  escopo de F1. A entrada de descoberta usa specifiers nativos do Pi (resolvidos no env do Pi).
- **Claude Code / Antigravity:** o bridge é runtime-agnóstico (ESM in-process); um adaptador nativo
  por runtime é incremento futuro. Antigravity segue com carga e2e **PENDENTE** (host de validação).
- **CLI:** stateless-only por design — não finge persistir sessão entre processos.
- **Herdados do runtime:** cancelamento não interrompe `fetch` em voo; um navegador compartilhado por
  bridge; Windows corporativo não validado (degradação para HTTP).

## 8. Riscos e mitigação

| Risco | Mitigação |
|------|-----------|
| LLM inventar autorização/escopo | Contexto só pelo adaptador; `scope`/approvals nunca vêm de params; `authorizedStateChange` nunca fabricado. |
| LLM reinterpretar veredicto | `classification` copiada verbatim; bridge sem caminho que a escreva (B12). |
| Vazamento de segredo pelo canal JSON | Sanitização recursiva + redação de mensagens de erro; módulos já redatam (Rule 6). |
| Vazamento de objetos Playwright | `closeInvestigation`/`shutdown` fecham contextos; falha de navegador tratada (B10). |
| Estado órfão após reinício | Estado só em memória; id antigo rejeitado (B13) — sem recuperação falsa. |
| Resolução de deps do Pi no núcleo | Núcleo é injetável (zero import do Pi); só a entrada de descoberta usa specifiers do Pi. |

## 9. Critérios de aceite e rollback

**Aceite (atingido):** bridge funcional; contratos tipados (`contracts.d.ts`); Pi Adapter mínimo
**validado**; testes + regressão verdes; **persistência entre chamadas demonstrada** (B6); **evidências
de policies** (B4/B5/B11/B15/P4/P5); limitações por runtime documentadas (§7). **Rollback:** todos os
artefatos são **aditivos** (`bridge.mjs`, `adapters/`, `test-bridge.mjs`, `test-pi-adapter.mjs`, tipos,
scripts, seção do README). Remover esses arquivos retorna ao estado pré-H1d-F1 sem migração; nada no
caminho operacional depende deles ainda.

## 10. Plano de integração com o dispatcher (H1d-F2 — para aprovação, NÃO executado)

1. **Reconhecimento no dispatcher:** 1 linha em `SKILL.md ## File Map` + nota de roteamento em
   `native-tooling-doctrine.md` (Tier-1 Node → preferir o bridge a forjar script ad-hoc para T5/T6/
   T8/T10) — **sem tocar os 127 corpos**.
2. **Seção `## Capability request` no brief template** (`flows-agents.md`): como o agente nomeia um
   `investigationId` provisionado e emite `securityauditor_invoke`; o operador provisiona o Execution
   Context (escopo + aprovações) fora do alcance do LLM.
3. **Contrato de investigação** (da doc 27): correlaciona `investigationId`/`techniqueId`/`hypothesisId`
   /`experimentId`/ids de sessão/recurso; o Resultado de Investigação (envelope do bridge) é colado no
   retorno do agente e **re-verificado** pelo coordenador antes de virar `ccLeads`/`ccGadgets`.
4. **Ciclo:** Flow 9 (focused dispatch) → provisionar contexto → `securityauditor_invoke` → envelope
   sanitizado com `classification` do validador → re-verificação → lead/gadget.
5. **Aceite H1d-F2:** caso end-to-end da doc 27 em modo sequencial; classificação sempre do validador;
   regressão verde. **Rollback:** reverter as notas de texto.

## 11. Recomendação

**Recomendo aceitar o H1d-F1.** O bridge conecta as seis capacidades ao runtime de agentes de forma
mínima, stateful e segura; o Pi Adapter está **validado sob o runtime real do Pi 1.4.0**; não há
regressão. **Não** foram implementados ciclo de investigação completo (H1d-F2), Caido, MCP, Antigravity,
novos backends ou framework de agentes; `agents/` não arquivado; policies imutáveis preservadas.
**Aguardando aprovação específica para H1d-F2**, sem avançar automaticamente.
