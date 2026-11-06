# Web Runtime — backends (HTTP Inspection F1 · Visual Browser F2)

SYNAPSE's Web Runtime. Two backends share one capability contract:

- **`http-inspect` (F1)** — static HTTP/HTML inspection. **Node.js stdlib only — no deps,
  no child processes, no shell, no Docker/WSL.** Always available; the fallback.
- **`browser` (F2)** — visual browser via **`playwright-core` driving a PRE-INSTALLED
  Chrome/Edge** (never downloads a browser). Rendered DOM, screenshots, clicks/fills,
  network+console. Availability is a **runtime probe**; when unavailable the runtime
  falls back to `http-inspect` with visual capabilities reported `false`.

> `playwright-core` is an **optional dependency** (pinned `1.64.1`, zero transitive deps,
> installed with `--ignore-scripts`; see `package.json`/`package-lock.json`). It **never
> downloads a browser** — it drives the installed Chrome/Edge via `executablePath`/channel.
> When absent, the visual backend reports `available:false` and the runtime falls back to
> `http-inspect`. Approval to install in the **dev environment does not extend to Windows
> corporate**, where browser launch may be blocked by policy (auto-fallback applies).

Tests: `node test.mjs` (F1), `node test-browser.mjs` (F2 mock), `node test-e2e.mjs`
(F2 real browser against synthetic loopback fixtures; auto-BLOCKED if no browser),
`node test-sessions.mjs` (H1b-F1 multi-session), `node test-authz.mjs` (H1b-F2
authorization matrix), `node test-concurrent.mjs` (H1c-F1 concurrent execution), `node test-race.mjs` (H1c-F2
stateful race & TOCTOU) — real browser, synthetic loopback; auto-BLOCKED if none.

## Multi-Session Runtime (H1b-F1)

`capability.sessions.manager()` returns a **Session Manager**: multiple independent
principals and authenticated sessions, each in its OWN isolated `BrowserContext`
(cookies/localStorage/sessionStorage isolated) under ONE shared browser process. The
single-session `browser` facade above is unchanged (backward compatible).

- **Capabilities:** `create`, `get`, `list`, `status`, `bindIdentity`, `request`,
  `close`, `closeAll`. Identities are **owner / cross-user / noauth**.
- **Opaque, distinct ids:** `principalId` (identity) · `sessionId` (session) ·
  `contextId` (BrowserContext). Credentials/tokens/`storageState` are **never** returned —
  the Identity Registry seals auth state in-memory for *controlled reuse* only.
- **Isolation & limits:** Scope Guard per session; per-session `maxActions` /
  `maxDurationMs` / network cap; manager-level `maxSessions`; `AbortSignal` cancel;
  `close` releases one context without touching siblings; `closeAll` releases the browser.
- **Authenticated POST** is validated (method/body preserved + in-scope redirect followed
  under `route.fetch` interception) before use. WebSocket / downloads / dialogs remain
  unsupported. **HTTP fallback never claims authentication** (`authenticated:false`).
- **Not here (later phases):** race conditions (H1c), external integrations. No DB, vault,
  scheduler or auth framework.

## Authorization Matrix (H1b-F2)

`capability.authz` runs a **sequential** IDOR/BOLA investigation across identities, built on
the multi-session manager + a minimal `ResourceRegistry`. No concurrency (that is H1c).

- **Pieces:** `authz.resources()` (resource registry), `authz.matrix({manager, resources})`
  (sequential executor + classifier). Ids stay distinct: `principalId`/`sessionId`/
  `contextId`/`resourceId`.
- **Expectations state their ORIGIN** — `documented-policy` / `lab-fixture` /
  `approved-premise`; `unknown` means no expectation. Different users are **never** assumed
  unable to share a resource — only explicit policy drives a deny.
- **Classification:** `conforme` · `anomalia-de-autorizacao` · `violacao-confirmada` ·
  `inconclusivo`. A 200 (or a structural divergence) **alone never confirms** a violation:
  confirmation requires **ownership evidence** (the owner's resource content came back) **and**
  an established rule. State-changing ops require `authorizedStateChange` + a reversible fixture.
- **Evidence (Rule 6 + hygiene):** results carry correlation ids, HTTP metadata, **normalized
  structure (keys only, never values)**, ownership-evidence as a **boolean**, and safe key-diffs.
  Raw bodies, cookies, tokens and one principal's content never enter another's result.

## Concurrent Execution Foundation (H1c-F1)

`capability.concurrent.executor({manager})` coordinates bounded, barrier-synchronized
concurrent HTTP operations over existing authenticated sessions. **Deterministic in
coordination only — it does NOT promise requests arrive at the server simultaneously.**

- **Capabilities:** `prepare` · `run` · `cancel` · `status`. Each op declares
  `operationId`/`sessionId` (→ `principalId`) / method / url / body / policy / limits /
  `experimentId`, and runs on the session's authenticated channel — **cookies/tokens are
  never extracted** from the BrowserContext.
- **Coordination:** an async START BARRIER opens all ops together; a counting semaphore bounds
  in-flight ops to `maxConcurrency` (**default 2**). Timings recorded: prepared / barrier-
  released / per-op start-end / latency.
- **Safety:** Rule 0 (out-of-scope blocked at prepare) · Rule 6 + hygiene (**no response bodies
  in results**) · per-op (in-page fetch abort) and global timeouts · explicit cancel · state-
  changing ops need `authorizedStateChange` + reversible fixture · no global-policy changes.
- **Not here:** Caido, advanced orchestration. No scheduler, DB, queue or worker processes.

## Stateful Race & TOCTOU Validator (H1c-F2)

`capability.race.validator({manager, executor})` turns concurrent operations into
**reproducible** security experiments that demonstrate business-invariant / authorization
violations. Built on the concurrent executor + a reversible synthetic lab
(`fixtures/race-lab.mjs`, with an authoritative `GET /_state` oracle + verified reset).

- **Experiment contract (declared, never invented by the agent):** identities/sessions, lab
  resources, hypothesis, **expected rule + its source** (`documented-policy`/`lab-fixture`/
  `approved-premise`), required initial state, concurrent operations, authoritative observation
  source, reset procedure, attempt limit, concurrency/duration limits.
- **Cycle:** validate scope/authz → prove initial state → preconditions → prepare ops → release
  barrier → execute → await/timeout → observe final state (authoritative) → evaluate invariants →
  record → **verifiable reset** → repeat. If initial state can't be proven, it does not run; if
  reset fails, attempts stop and the lab is flagged **contaminated**. Attempts are **sequential**.
- **Classification:** `conforme` · `anomalia` · `violacao-observada` · `violacao-reproduzida` ·
  `inconclusivo`. A violation requires **state-change evidence** (or an authz decision)
  incompatible with an established rule — **200/size/latency/error codes are never proof**.
  Reproduction raises confidence but does not discard a single-observed violation.
- **Evidence:** normalized initial/final state, evaluated assertions, per-attempt result, valid-
  attempt and violation counts, variability, reset/isolation evidence — **directly-observed
  evidence is separated from agent inferences**; no secrets or sensitive bodies.

## Capability Bridge + Pi Adapter (H1d-F1)

`createBridge()` (from `bridge.mjs`) is a **reusable, stateful, same-process** ESM library that
makes all of the above capabilities reachable by an agent runtime — **without rebuilding the
harness**. It only validates, correlates, forwards and manages lifecycle; it reuses the
`capability.*` APIs verbatim and adds **no** executor, plugin framework, scheduler, HTTP service,
database or daemon. **Zero external dependencies.**

- **Trust model:** the **Execution Context** (authorized scope, allowed capabilities, operational
  limits, per-action approvals) is supplied by the **adapter/operator**, never by the LLM. The
  agent names only an opaque `investigationId` + `op` + `params`; it **cannot invent
  authorization**. The bridge validates and delegates the technical scope/security decision to the
  existing Scope Guard / Rule 0 / Rule 6 mechanisms.
- **Single typed entrypoint:** `bridge.invoke({ investigationId, op, params, operationId? })`.
  Operation ids (`BRIDGE_OPS`) span `capabilities.*`, `http.*`, `sessions.*`, `browser.*`,
  `authorization.*`, `concurrent.*`, `race.*`. Discovery via `capabilities.list` / `capabilities.probe`.
- **Classifier preservation:** AuthZ/Race verdicts are **copied verbatim** from the validators —
  the bridge has no code path that writes a classification, so it can never turn an *anomaly* into
  a *confirmed violation*.
- **State & lifecycle:** opaque session ids; sessions reused across calls **within** an
  investigation; isolation **between** investigations; `cancel()` (per-op or all); `closeInvestigation()`
  releases that investigation's browser contexts (siblings untouched); `shutdown()` releases the
  browser and **invalidates** in-memory state. A new process = a new `instanceId`; a prior
  `investigationId` is rejected (`unknown-investigation`) — **no fake recovery**.
- **Pi Adapter** (`adapters/pi/`): `extension.mjs` (dependency-injected core) + `extension-pi.mjs`
  (discovery entry the operator installs into Pi). Registers **two** native Pi tools —
  `securityauditor_capabilities` and `securityauditor_invoke` — via `pi.registerTool`, honoring Pi's
  `AbortSignal`. Verified against **@earendil-works/pi-coding-agent 1.4.0** under Pi's real
  extension runtime. The Execution Context is read from an operator-written JSON file
  (`SECAUDIT_BRIDGE_CONTEXTS`), never from the model.
- **CLI Adapter** (`adapters/cli.mjs`): optional, **stateless-only** (`capabilities.*`, `http.*`);
  stateful domains are refused with a pointer to the in-process bridge / Pi adapter. With
  `SECAUDIT_BRIDGE_CONTEXTS` it takes a context from that file, bound to the engagement selected in the project, and
  refuses a caller scope. Either way it reports `operatorVerified: false`: its caller may be the agent itself.

Tests: `node test-bridge.mjs` (15 bridge areas, real browser) and `node test-pi-adapter.mjs`
(native registration + execution under Pi's real runtime; **BLOCKED** if Pi is absent — mocks are
never counted as end-to-end proof).

Select the active backend with `capability.select()`; see the full matrix with
`capability.matrix()`.

## F1 — HTTP Inspection (below)

> **This is NOT a visual browser.** It does not execute JavaScript, does not render a
> DOM, and does not take screenshots. It retrieves **static HTML** and labels it
> distinctly from any rendered DOM. Visual operations are explicitly **unavailable** here
> and remain so until a visual backend (F2+) is approved.

## Capability surface (stable contracts)

| Contract | Module | Purpose |
|----------|--------|---------|
| `capability.probe()` | `capability.mjs` | List backends + capabilities + limits |
| `http.open(req, ctx)` | `backends/http-inspect.mjs` | One transaction with controlled redirects, scope re-validation, limits, timeout, cancel |
| `http.inspect(req, ctx)` | `backends/http-inspect.mjs` | Static inspection: status, headers, **staticHtml**, referenced resources, network metadata (`rendered:false`, `dom:null`, `screenshot:null`) |
| `http.headers(req, ctx)` | `backends/http-inspect.mjs` | Status + headers only (no body) |
| `evidence.record(insp, ctx)` | `evidence.mjs` | Persist a **sanitized** artifact (portable filename + sha256) |

Typed contracts: `contracts.d.ts` (consumed via JSDoc `@typedef`).

## Capabilities

**Supported:** `http_request`, `headers`, `redirects` (scope-checked), `static_html`,
`network_metadata`, `referenced_resources`, `evidence_record`.

**Unavailable in this backend (reported `false` by `capability.probe`):**
`dom_rendered`, `screenshot`, `javascript`, `interaction`. These light up only with a
future visual backend (Playwright / CDP / Chrome DevTools MCP), never here.

## Security model

- **Rule 0 (authorization/scope):** allowlist-first. `validateTarget()` runs **before the
  first request and after every redirect**. Out-of-scope hosts are blocked.
- **SSRF / internal-destination guard:** private, loopback, link-local (incl.
  `169.254.169.254` metadata), ULA/v6 and bare hostnames are blocked unless
  `scope.allowPrivate` **and** explicitly allowlisted. No DNS resolution (no real-network
  dependency): hostnames are authorized only via the allowlist; IP literals are
  range-checked directly.
- **Rule 6 (secrets):** sensitive request/response headers (`Authorization`, `Cookie`,
  `Set-Cookie`, API keys, …) are redacted from every returned/stored object. Evidence
  artifacts additionally run a credential-redaction pass (Bearer/JWT/password patterns).
- **Limits:** `maxBytes` (2 MiB), `maxRedirects` (5), `maxRequests` (6), `timeoutMs`
  (15 000) — all overridable per call. Bodies are truncated (flagged) at `maxBytes`.
- **Cancellation:** honors an `AbortSignal`.

## Usage (illustrative; no real targets this round)

```js
import { capability, http, evidence } from "./capability.mjs";

capability.probe(); // -> [{ id:"http-inspect", capabilities:{...}, limits:{...} }]

const ctx = { scope: { allowHosts: ["app.example.com"] } };     // Rule 0 allowlist
const insp = await http.inspect({ url: "https://app.example.com/" }, ctx);
// insp.rendered === false, insp.dom === null  (static, never a DOM)
await evidence.record(insp, { dir: "./out/evidence" });          // sanitized artifact
```

Inject a transport for tests/mocks: `http.inspect(req, { scope, transport })`.

## Tests

`node test.mjs` — 19 automated checks (mocked network + one loopback fixture for
timeout/size/real-transport). Covers redirects, scope enforcement (pre + post-redirect),
SSRF guard, timeouts, cancellation, limits, sanitization, unavailable capabilities,
portable filenames, and static-not-DOM labeling. No external targets.

## Not implemented here (by design)

No visual browser, no generic plugin framework, no scheduler, no Session Manager. Those
belong to later phases (see `docs/architecture-review/18-h1a-f1-http-inspection.md`).
