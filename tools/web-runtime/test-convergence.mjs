// SecurityAuditor — Agent Convergence Fixes (H1e-F1) deterministic suite.
// Covers P1 (ensureOpen single-flight), P2 (observerSessionId / race prerequisites + valid-kind
// feedback), P4 (classifier preservation — no promotion) and the P3/P4 dispatch-brief contract.
// BROWSER-FREE and LLM-FREE by construction: the adapter is built with injected stubs
// (defineTool/Type/bridge/resolveContext); race prerequisites and classifier preservation are
// checked against the REAL bridge without ever launching a browser. No billed turns, no targets.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createSecurityAuditorExtension, TOOL_NAMES } from "./adapters/pi/extension.mjs";
import { createBridge, BridgeError } from "./bridge.mjs";
import { IdentityRegistry, KINDS } from "./identity-registry.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`FAIL   ${name}\n       ${(e && e.message || e).toString().split("\n")[0]}`); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("web-runtime Agent Convergence Fixes — deterministic suite (H1e-F1)\n");

// ---- Pi-runtime stubs (identity defineTool + permissive Type), browser-free -------------------
const defineTool = (tool) => tool;                                   // real behavior is identity
const Type = new Proxy({}, { get: () => (..._a) => ({}) });          // schemas are not validated here
function buildAdapter({ resolveContext, bridge }) {
  const tools = new Map();
  const pi = { registerTool: (tool) => tools.set(tool.name, tool) };
  const factory = createSecurityAuditorExtension({ defineTool, Type, bridge, resolveContext });
  factory(pi);
  return tools.get(TOOL_NAMES.invoke);
}
// A spy bridge that mimics the REAL bridge's one-per-id rule: openInvestigation throws
// duplicate-investigation on a second open of the same id (so a broken driver is observable).
function spyBridge() {
  const open = new Map(); let openCalls = 0;
  return {
    openCalls: () => openCalls,
    openInvestigation(ctx) {
      openCalls++;
      if (open.has(ctx.investigationId)) throw new BridgeError("duplicate-investigation", `investigation already open: ${ctx.investigationId}`);
      open.set(ctx.investigationId, true);
      return { investigationId: ctx.investigationId };
    },
    async invoke(req) { return { ok: true, op: req.op, investigationId: req.investigationId, result: {} }; },
  };
}
// The ORIGINAL (buggy) ensureOpen, inlined to PROVE the race existed and is now fixed.
function makeOldEnsureOpen(bridge, resolveContext) {
  const opened = new Set();
  return async function ensureOpen(id) {
    if (opened.has(id)) return { ok: true };
    const ctx = await resolveContext(id);            // <-- await BEFORE recording "opened": the TOCTOU
    if (!ctx) return { ok: false, error: { code: "no-trusted-context" } };
    try { bridge.openInvestigation({ ...ctx, investigationId: id }); opened.add(id); return { ok: true }; }
    catch (e) { return { ok: false, error: { code: e.code || "context-error", message: String(e && e.message) } }; }
  };
}

// === P1 — ensureOpen single-flight ============================================================

// 1 — reproduce the ORIGINAL failure: concurrent inits race openInvestigation -> duplicate error.
await t("P1.0 — original ensureOpen RACES under concurrency (regression reproduced)", async () => {
  const bridge = spyBridge();
  const slowResolve = async () => { await wait(20); return { scope: {}, allowedCapabilities: ["http"] }; };
  const oldEnsure = makeOldEnsureOpen(bridge, slowResolve);
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => oldEnsure("INV-x")));
  assert.ok(bridge.openCalls() > 1, `buggy path calls openInvestigation more than once (got ${bridge.openCalls()})`);
  assert.ok(results.some((r) => r.ok === false && r.error.code === "duplicate-investigation"), "buggy path surfaces duplicate-investigation");
});

// 2 — the FIX: N concurrent tool calls for one id -> exactly ONE openInvestigation, all succeed.
await t("P1.1 — concurrent calls share ONE init (no duplicate-investigation)", async () => {
  const bridge = spyBridge();
  const slowResolve = async () => { await wait(20); return { scope: {}, allowedCapabilities: ["http"] }; };
  const invoke = buildAdapter({ resolveContext: slowResolve, bridge });
  const calls = [1, 2, 3, 4, 5].map((i) =>
    invoke.execute(`tc-${i}`, { investigationId: "INV-1", op: "http.inspect", params: {} }, undefined, undefined, {}));
  const res = await Promise.all(calls);
  for (const r of res) { const env = JSON.parse(r.content[0].text); assert.equal(env.ok, true, `all concurrent calls succeed (${JSON.stringify(env.error || {})})`); }
  assert.equal(bridge.openCalls(), 1, `openInvestigation ran exactly once (got ${bridge.openCalls()})`);
});

// 3 — single initialization is remembered: a later call does not re-open.
await t("P1.2 — single initialization per investigation (memoized)", async () => {
  const bridge = spyBridge();
  const invoke = buildAdapter({ resolveContext: async () => ({ scope: {}, allowedCapabilities: ["http"] }), bridge });
  await invoke.execute("a", { investigationId: "INV-2", op: "http.inspect", params: {} }, undefined, undefined, {});
  await invoke.execute("b", { investigationId: "INV-2", op: "http.inspect", params: {} }, undefined, undefined, {});
  assert.equal(bridge.openCalls(), 1, "second call reuses the opened investigation");
});

// 4 — failure + controlled retry: a failed init leaves NO state; a later call retries and succeeds.
await t("P1.3 — init failure does not poison state; retry recovers", async () => {
  const bridge = spyBridge();
  let provisioned = false;
  const resolveContext = async () => (provisioned ? { scope: {}, allowedCapabilities: ["http"] } : null);
  const invoke = buildAdapter({ resolveContext, bridge });
  // concurrent first attempts all fail cleanly (no context yet) and open nothing
  const first = await Promise.all([1, 2, 3].map((i) =>
    invoke.execute(`f${i}`, { investigationId: "INV-3", op: "http.inspect", params: {} }, undefined, undefined, {})));
  for (const r of first) { const env = JSON.parse(r.content[0].text); assert.equal(env.ok, false); assert.equal(env.error.code, "no-trusted-context"); }
  assert.equal(bridge.openCalls(), 0, "no openInvestigation on failed init");
  // operator provisions the context -> a later call retries and succeeds exactly once
  provisioned = true;
  const r2 = await invoke.execute("g", { investigationId: "INV-3", op: "http.inspect", params: {} }, undefined, undefined, {});
  assert.equal(JSON.parse(r2.content[0].text).ok, true);
  assert.equal(bridge.openCalls(), 1, "retry opened exactly once");
});

// 5 — init that THROWS (bad context) is reported cleanly and still allows a later clean retry.
await t("P1.4 — throwing init is clean and retryable (no half-open state)", async () => {
  let good = false;
  const bridge = {
    _opened: new Set(), _calls: 0, openCalls() { return this._calls; },
    openInvestigation(ctx) { this._calls++; if (!good) throw new BridgeError("bad-context", "scope required"); this._opened.add(ctx.investigationId); },
    async invoke(req) { return { ok: true, op: req.op, result: {} }; },
  };
  const invoke = buildAdapter({ resolveContext: async () => ({ scope: {}, allowedCapabilities: ["http"] }), bridge });
  const bad = await invoke.execute("x", { investigationId: "INV-4", op: "http.inspect", params: {} }, undefined, undefined, {});
  const badEnv = JSON.parse(bad.content[0].text);
  assert.equal(badEnv.ok, false); assert.equal(badEnv.error.code, "bad-context");
  good = true;
  const okRes = await invoke.execute("y", { investigationId: "INV-4", op: "http.inspect", params: {} }, undefined, undefined, {});
  assert.equal(JSON.parse(okRes.content[0].text).ok, true, "retry after a throwing init succeeds");
});

// 6 — isolation: distinct investigations open independently (one open each).
await t("P1.5 — isolation between investigations", async () => {
  const bridge = spyBridge();
  const invoke = buildAdapter({ resolveContext: async () => ({ scope: {}, allowedCapabilities: ["http"] }), bridge });
  await Promise.all([
    invoke.execute("p", { investigationId: "INV-A", op: "http.inspect", params: {} }, undefined, undefined, {}),
    invoke.execute("q", { investigationId: "INV-B", op: "http.inspect", params: {} }, undefined, undefined, {}),
  ]);
  assert.equal(bridge.openCalls(), 2, "each investigation opened once, independently");
});

// === P2 — observerSessionId contract + structured, recoverable feedback =======================

// 7 — unknown identity kind lists the valid kinds (recovery without trial and error).
await t("P2.0 — unknown identity kind error lists valid kinds", async () => {
  const reg = new IdentityRegistry();
  assert.throws(() => reg.register({ kind: "observer" }), (e) => {
    assert.match(e.message, /unknown identity kind: observer/);
    for (const k of KINDS) assert.ok(e.message.includes(k), `lists valid kind ${k}`);
    return true;
  });
  // a valid kind recovers immediately
  assert.ok(reg.register({ kind: "noauth" }).startsWith("pr-"));
});

// 8 — race.run without operations fails fast with a self-describing prerequisites error
//     (observerSessionId clarified as an existing session, not a new identity kind). No browser.
await t("P2.1 — race.run prerequisites error is structured and self-describing", async () => {
  const br = createBridge();
  br.openInvestigation({ investigationId: "INV-R", scope: { allowHosts: ["127.0.0.1"], allowPrivate: true }, allowedCapabilities: ["sessions", "concurrent", "race"] });
  const r = await br.invoke({ investigationId: "INV-R", op: "race.run", params: { experiment: { operations: [] } } });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "race-prerequisites");
  assert.match(r.error.message, /observerSessionId is OPTIONAL/);
  assert.match(r.error.message, /NOT a new identity kind/);
  await br.shutdown();
});

// 9 — differentiate missing session vs invalid session vs missing authorization (distinct codes).
await t("P2.2 — session errors are differentiated by code", async () => {
  const br = createBridge();
  br.openInvestigation({ investigationId: "INV-R2", scope: { allowHosts: ["127.0.0.1"], allowPrivate: true }, allowedCapabilities: ["sessions", "concurrent", "race"] });
  // invalid/unknown session referenced by a race op -> session-not-in-investigation (NOT bad-params)
  const invalid = await br.invoke({ investigationId: "INV-R2", op: "race.run", params: { experiment: { operations: [{ sessionId: "ghost", method: "POST", url: "http://127.0.0.1/x" }] } } });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, "session-not-in-investigation");
  // missing sessionId (e.g. sessions.status with none) -> bad-params, a different, clear code
  const missing = await br.invoke({ investigationId: "INV-R2", op: "sessions.status", params: {} });
  assert.equal(missing.error.code, "bad-params");
  // capability not allowed is yet another distinct code (authorization/capability axis)
  br.openInvestigation({ investigationId: "INV-R3", scope: { allowHosts: ["127.0.0.1"], allowPrivate: true }, allowedCapabilities: ["http"] });
  const notAllowed = await br.invoke({ investigationId: "INV-R3", op: "race.run", params: { experiment: { operations: [{ sessionId: "s", url: "http://127.0.0.1/x" }] } } });
  assert.equal(notAllowed.error.code, "capability-not-allowed");
  await br.shutdown();
});

// === P4 — classifier preservation (the bridge never promotes or invents a verdict) ============

// 10 — _ok copies a validator classification VERBATIM and never fabricates one for absence.
await t("P4.0 — classifier preserved verbatim; absence is NOT converted to a verdict", async () => {
  const br = createBridge();
  const spec = { capability: "race" };
  const anom = br._ok("race.run", spec, "INV", { classification: "anomalia-de-autorizacao", x: 1 });
  assert.equal(anom.classification, "anomalia-de-autorizacao");
  assert.notEqual(anom.classification, "violacao-confirmada");
  const viol = br._ok("race.run", spec, "INV", { classification: "violacao-observada" });
  assert.equal(viol.classification, "violacao-observada");       // copied as-is, not altered
  const none = br._ok("http.inspect", { capability: "http" }, "INV", { status: 200 });
  assert.ok(!("classification" in none), "no verdict is invented when the result carries none");
  await br.shutdown();
});

// === P3/P4 — dispatch-brief contract (Markdown instruction, compatible with the dispatcher) ====

// 11 — the dispatch brief carries the execution-discipline + mandatory-closure clauses,
//      and still has its original MANDATORY structure (no dispatcher regression).
await t("P3/P4 — flows-agents.md carries the new contract and keeps its structure", async () => {
  const brief = readFileSync(join(HERE, "../../references/flows-agents.md"), "utf8");
  // original structure preserved
  assert.match(brief, /Dispatch brief template \(MANDATORY structure\)/);
  assert.match(brief, /## Objective/);
  assert.match(brief, /## Return contract/);
  assert.match(brief, /## Verification contract/);
  // P3 — essential experiment first (a priority, not a fixed sequence)
  assert.match(brief, /Execution discipline/);
  assert.match(brief, /essential operation/i);
  assert.match(brief, /PRIORITY, not a fixed tool sequence/);
  // P4 — mandatory Investigation Record even on failure/blocked/inconclusive; no false conformity
  assert.match(brief, /Investigation record \(MANDATORY/);
  assert.match(brief, /the experiment failed, an operation was blocked, the result was/);
  assert.match(brief, /NEVER convert absence of evidence into a clean\/conformant verdict/);
  // classifier still verbatim
  assert.match(brief, /classification VERBATIM/);
});

console.log(`\n${pass} passed, ${fail} failed`);
console.log("NOTE: deterministic — no browser, no LLM, no live targets. Browser-grounded classifier");
console.log("preservation under a real validator is additionally exercised by test-bridge.mjs (B12).");
process.exit(fail ? 1 : 0);
