# 33 — H3-F0: Guia reproduzível para o primeiro uso supervisionado

> Objetivo: um operador reproduz a inicialização e executa um smoke test **seguindo apenas este
> documento**. Todos os comandos/caminhos abaixo foram **verificados neste host de desenvolvimento
> Linux** (salvo onde marcado como *dependente de Windows / não validado*). Não há comandos inventados.
> **Nenhum turno de LLM é necessário para o smoke determinístico (passos 1–5 + 3).** A investigação
> supervisionada por LLM (passo 6) exige provider/cota.

## 0. Variáveis (caminhos reais deste host)

```bash
PI=/home/pettigrul/.local/share/pi-node/node-v22.23.1-linux-x64/bin/pi
PI_PKG=/home/pettigrul/.local/share/pi-node/node-v22.23.1-linux-x64/lib/node_modules/@earendil-works/pi-coding-agent
REPO=/home/pettigrul/projetos/SecurityAuditor/SecurityAuditor
ENTRY=$REPO/tools/web-runtime/adapters/pi/extension-pi.mjs
```
> No Windows corporativo esses caminhos **mudam** (prefixo de instalação do Pi, local do pacote, raiz do
> repo). Ajuste as 4 variáveis; os passos seguintes são idênticos.

## 1. Iniciar o Pi Agent / verificar o provider

```bash
"$PI" --help            # confirma que o binário responde
"$PI" auth check --provider openai-codex   # readiness do provider (OAuth); use --json para parse
```
- `auth check` confirma credencial/validade **sem expor segredo** (adicione `--credentials` só se
  precisar — evite). Se falhar: o provider não está autenticado/sem cota → a investigação por LLM (passo
  6) fica **BLOCKED**; o smoke determinístico (passo 3) ainda roda.

## 2. Carregar a extensão do HackBot

Caminho **validado**: passar a entry de descoberta diretamente com `-e` (o loader do Pi resolve os bare
specifiers da extensão sem instalar nada):

```bash
"$PI" --mode rpc -e "$ENTRY" --no-mcp --no-context-files   # (exemplo; ver passo 6 para a forma interativa)
```
- Alternativa persistente **não exercida nesta validação**: `pi install <source>` registra a extensão em
  settings (`pi list` confirma). Tratar como *não validado* até testar no host-alvo.

## 3. Verificar as capacidades registradas (SMOKE determinístico — sem modelo)

```bash
PI_PKG_DIR="$PI_PKG" node "$REPO/tools/web-runtime/test-pi-entry.mjs"   # carrega as 2 tools + invoca sem modelo
PI_BINARY="$PI"      node "$REPO/tools/web-runtime/test-pi-rpc.mjs"      # RPC get_state (loader OK em <20s)
PI_PKG_DIR="$PI_PKG" node "$REPO/tools/web-runtime/test-pi-adapter.mjs"  # registro nativo sob o runtime real do Pi
```
Esperado: `test-pi-entry` → "capabilities invoked without model"; `test-pi-rpc` → `success:true` com
`model`/`provider`; `test-pi-adapter` → "7 passed". As duas tools são **`securityauditor_capabilities`**
e **`securityauditor_invoke`**. Em tempo de execução, o próprio agente descobre via
`securityauditor_capabilities` (op `list`/`probe`).

Regressão operacional opcional (determinística, sem modelo, precisa de navegador para as de browser):
```bash
cd "$REPO/tools/web-runtime" && node test-convergence.mjs && node test-bridge.mjs && node test-investigation.mjs
```

## 4. Configurar um Execution Context autorizado (operador, nunca o LLM)

Crie um arquivo JSON e aponte `SECAUDIT_BRIDGE_CONTEXTS` para ele. **Estrutura real** (chaveado por
`investigationId`):

```json
{
  "INV-PILOT-1": {
    "scope": { "allowHosts": ["127.0.0.1"], "allowPrivate": true },
    "allowedCapabilities": ["capabilities", "sessions", "browser", "authorization"],
    "limits": { "maxSessions": 6 },
    "approvals": []
  }
}
```
- `allowedCapabilities` ⊆ `["capabilities","http","sessions","browser","authorization","concurrent","race"]`.
- Mudanças de estado (ex.: `browser.fill`, `race.run`, POST) exigem uma entrada em `approvals`
  `[{"op":"race.run","url":"http://127.0.0.1:8731/coupon/redeem"}]` — o agente **não** pode se
  autoconceder. Ausência/arquivo inválido ⇒ as tools recusam (`no-trusted-context`).

```bash
export SECAUDIT_BRIDGE_CONTEXTS="$REPO/.pilot/contexts.json"   # caminho do operador
```

## 5. Selecionar uma aplicação sintética (local, reversível)

Fixtures reais em `tools/web-runtime/fixtures/`: `investigation-lab.mjs` (IDOR/race/SPA) e `race-lab.mjs`.
Launcher mínimo compondo o export real `createInvestigationLab()`:

```bash
cd "$REPO/tools/web-runtime"
node --input-type=module -e 'import("./fixtures/investigation-lab.mjs").then(m=>{const s=m.createInvestigationLab();s.listen(8731,"127.0.0.1",()=>console.log("lab on http://127.0.0.1:8731"));});' &
curl -s http://127.0.0.1:8731/_state    # oráculo autoritativo (ex.: {"couponUses":0})
```
> Endpoints sintéticos: `POST /coupon/redeem` (double-spend), `GET /_state` (oráculo), `GET /app` +
> `/app.js` (SPA benigna). **Apenas 127.0.0.1 — nunca alvos reais.**

## 6. Executar uma investigação supervisionada (LLM — exige provider do passo 1)

Modo interativo (texto), com a extensão carregada e o allowlist das tools:

```bash
SECAUDIT_BRIDGE_CONTEXTS="$REPO/.pilot/contexts.json" \
"$PI" -e "$ENTRY" --provider openai-codex --model gpt-5.6-sol --thinking medium \
      --tools read,bash,securityauditor_capabilities,securityauditor_invoke \
      --no-mcp --no-context-files
```
No prompt, o operador descreve a investigação **sem** entregar a técnica nem a sequência de ferramentas
(ex.: *"App sintética em http://127.0.0.1:8731; regra: cupom resgatável no máximo uma vez; verifique se o
limite pode ser burlado. Use a investigação INV-PILOT-1; consulte a KB e cite a técnica; preserve o
veredito do validador; produza um Investigation Record."*). O agente consulta a KB, escolhe a técnica,
monta sessões e invoca a capacidade. **Supervisão:** acompanhe as tool calls; se o agente encerrar antes
de completar o Record, peça explicitamente "complete o Investigation Record" (dívida técnica conhecida —
ver [30] Parte III, Cenário B).

## 7. Consultar evidências e Investigation Records

- **Investigation Record:** emitido pelo agente como mensagem final (Technique+KB, hipótese, resultados,
  **classificação do validador VERBATIM**, conclusão). A classificação nunca deve ser promovida pelo
  agente.
- **Screenshots:** gravados no diretório passado em `browser.screenshot` (`opts.dir`), ex.:
  `/tmp/securityauditor-inv-*/...png` (com SHA-256 no registro). **Nota honesta:** o `evidenceDir` não é
  auto-derivado do Execution Context hoje — o diretório vem do parâmetro da operação.
- **Estado de sessões:** `securityauditor_invoke` op `sessions.status`/`sessions.list` (contadores,
  último URL, nº de ações) — sem cookies/tokens (redigidos).

## 8. Encerrar os recursos corretamente

- **Pi:** encerrar a sessão (Ctrl-D/saída) dispara `session_shutdown` → `bridge.shutdown()` que libera os
  BrowserContexts e invalida as investigações (sem recuperação falsa entre processos).
- **RPC:** cancelar um turno em andamento com o comando real **`{"type":"abort"}`** (confirmado na 1.4.0).
- **Lab sintético:** encerrar o processo iniciado no passo 5 (ex.: `kill %1` / fechar o `node`).

## 9. Diagnosticar problemas de inicialização

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| `auth check` falha / investigação "BLOCKED" | provider sem credencial/cota | reautenticar; smoke determinístico (passo 3) independe disso |
| `Failed to load extension` / `ERR_MODULE_NOT_FOUND` | caminho de `-e` errado ou pacote Pi ausente | conferir `$ENTRY` e `$PI_PKG`; rodar `test-pi-rpc.mjs` |
| `capabilities.probe` → `visual:false` | navegador ausente (não baixa browser) | instalar Chrome/Edge; sem ele, cai no fallback `http-inspect` |
| tools recusam com `no-trusted-context` | `SECAUDIT_BRIDGE_CONTEXTS` ausente/ inválido | criar o JSON (passo 4) e exportar a env |
| `state-change-unauthorized` | operação de estado sem aprovação | adicionar `{op,url}` em `approvals` (operador) |
| `listen EPERM` / exit 144 | sandbox bloqueia *listen* em tarefa de **background** | rodar o lab/driver em **foreground** |
| turno "zero bytes" em `-p` | print mode bufferiza até sair; turno leva ~100–140s | usar `--mode rpc` (streaming) |

## 10. Validado × dependente de Windows corporativo

**Validado neste host de desenvolvimento (Linux):**
- Pi Agent **1.4.0**; carga da extensão via `-e`; **2 tools** registradas; RPC `get_state`.
- Smoke determinístico: `test-pi-entry` / `test-pi-rpc` / `test-pi-adapter` verdes; regressão Web Runtime
  verde; **Validador V1 127/127**.
- Investigação agêntica real (`openai-codex/gpt-5.6-sol`): A **PASS**, C **PASS**, B **PARTIAL** (ver [30]).

**Dependente de Windows corporativo (NÃO validado aqui):**
- Caminhos de instalação do Pi e do pacote; `pi install` como registro persistente.
- Autenticação/cota do provider no ambiente corporativo.
- Canal/`executablePath` do navegador (Chrome/Edge gerenciado).
- Bootstrap `.bat`, MCPs (H2d) — fora do escopo desta rodada.
- (O `README.md` do Web Runtime já alerta: aprovação de instalação no dev **não** se estende ao Windows.)

## 11. Critério de aceite do H3-F0

Atingido quando um operador, **usando só este guia**, reproduz os passos 1–5 e executa o **smoke
determinístico** (passo 3, verde) — e, com provider disponível, conduz uma **investigação supervisionada**
(passo 6) que produz um Investigation Record. A validação em Windows corporativo é **pendência explícita**
(§10), não requisito para o smoke em laboratório.

## 12. Bloqueios reais para começar a usar o HackBot

1. **Provider/cota** no host-alvo (para investigações por LLM; o caminho determinístico não precisa).
2. **Navegador instalado** (Chrome/Edge) para o backend visual; sem ele, só `http-inspect`.
3. **Validação em Windows corporativo pendente** (caminhos, `pi install`, auth, `.bat`) — H2d/H3.
4. **Dívida: completude do Record em turnos interrompidos** (Cenário B) — mitigada pela supervisão.
5. **Sandbox dev:** *listen* em background bloqueado — rodar em foreground.
