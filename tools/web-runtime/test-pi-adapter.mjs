// SecurityAuditor — Pi Adapter validation (H1d-F1).
//
// Loads the adapter under Pi's REAL extension runtime (createExtensionRuntime + createEventBus +
// loadExtensionFromFactory) using Pi's GENUINE `defineTool` and the bundled TypeBox `Type` —
// NOT a mock of Pi. It asserts: native tool registration, the registered tool's execute() path,
// cancellation via Pi's AbortSignal, and sanitized JSON results.
//
// SCOPE OF PROOF (honest): this validates registration + execution of the tools under Pi's own
// runtime. It does NOT drive a full authenticated, LLM-driven agent turn (that needs model auth
// + a live provider + a TUI/RPC session, out of scope for F1). If Pi is not installed, the whole
// suite is BLOCKED (never reported as pass).
import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";
import fs from "node:fs";
import { createBridge } from "./bridge.mjs";
import { createSecurityAuditorExtension, TOOL_NAMES } from "./adapters/pi/extension.mjs";

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`FAIL   ${name}\n       ${(e && e.message || e).toString().split("\n")[0]}`); }
}

console.log("web-runtime Pi Adapter — native registration validation (H1d-F1)\n");

// Locate the installed Pi package (verified: @earendil-works/pi-coding-agent).
const PI_CANDIDATES = [
  process.env.PI_PKG_DIR,
  `${process.env.HOME}/.local/share/pi-node/node-v22.23.1-linux-x64/lib/node_modules/@earendil-works/pi-coding-agent`,
].filter(Boolean);
let PI = null;
for (const c of PI_CANDIDATES) { try { if (fs.existsSync(`${c}/dist/index.js`)) { PI = c; break; } } catch { /* ignore */ } }
// Fallback: resolve via node's own resolution if it happens to be on the path.
if (!PI) { try { const r = createRequire(import.meta.url); PI = r.resolve("@earendil-works/pi-coding-agent").replace(/\/dist\/.*$/, ""); } catch { /* ignore */ } }

if (!PI) {
  console.log("ALL BLOCKED — Pi Agent (@earendil-works/pi-coding-agent) not found on this host.");
  console.log("Impediment: cannot validate NATIVE registration without the installed Pi runtime.");
  console.log("0 passed, 0 failed, PI-ADAPTER BLOCKED");
  process.exit(0);
}
console.log(`Pi package: ${PI}\n`);

// Pi's genuine exports (real runtime, not a mock).
const pi = await import(`${PI}/dist/index.js`);
const loader = await import(`${PI}/dist/core/extensions/loader.js`);
const require = createRequire(`${PI}/dist/index.js`);
const { Type } = await import(require.resolve("typebox"));
const { defineTool, createEventBus } = pi;
const { createExtensionRuntime, loadExtensionFromFactory } = loader;

// A tiny synthetic lab so execute() has something real to talk to.
const lab = http.createServer((q, s) => { s.writeHead(200, { "content-type": "application/json" }); s.end('{"ok":true}'); });
const slow = http.createServer(async (q, s) => { await new Promise((r) => setTimeout(r, 1500)); s.writeHead(200); s.end("slow"); });
const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
const LPORT = await listen(lab); const SPORT = await listen(slow);
const APP = `http://127.0.0.1:${LPORT}`; const SLOW = `http://127.0.0.1:${SPORT}`;
const SCOPE = { allowHosts: ["127.0.0.1"], allowPrivate: true };

// Build the adapter with a TRUSTED context source (operator-provided, not the LLM).
function buildExtension() {
  const bridge = createBridge();
  const contexts = { "INV-pi": { scope: SCOPE, allowedCapabilities: ["capabilities", "http"] } };
  const resolveContext = async (id) => contexts[id] || null;
  const factory = createSecurityAuditorExtension({ defineTool, Type, bridge, resolveContext });
  return { factory, bridge };
}

async function loadTools(factory) {
  const eventBus = createEventBus();
  const runtime = createExtensionRuntime();
  const ext = await loadExtensionFromFactory(factory, process.cwd(), eventBus, runtime);
  return ext;
}

// 1 — native registration under Pi's real runtime.
let sharedBridge;
await t("P1 — registers native tools via pi.registerTool", async () => {
  const { factory, bridge } = buildExtension(); sharedBridge = bridge;
  const ext = await loadTools(factory);
  assert.ok(ext.tools instanceof Map, "extension exposes a tools Map");
  assert.ok(ext.tools.has(TOOL_NAMES.capabilities), "capabilities tool registered");
  assert.ok(ext.tools.has(TOOL_NAMES.invoke), "invoke tool registered");
  const def = ext.tools.get(TOOL_NAMES.invoke).definition;
  assert.equal(typeof def.execute, "function");
  assert.ok(def.parameters && typeof def.parameters === "object", "has a TypeBox parameter schema");
});

// 2 — discovery tool executes.
await t("P2 — capabilities tool executes under Pi", async () => {
  const { factory } = buildExtension();
  const ext = await loadTools(factory);
  const def = ext.tools.get(TOOL_NAMES.capabilities).definition;
  const res = await def.execute("tc-1", { op: "list" }, undefined, undefined, {});
  const env = JSON.parse(res.content[0].text);
  assert.equal(env.ok, true);
  assert.ok(env.result.capabilities.includes("http"));
  assert.equal(res.isError, false);
});

// 3 — invoke tool executes a real stateless op through the bridge.
await t("P3 — invoke tool runs http.inspect through the bridge", async () => {
  const { factory } = buildExtension();
  const ext = await loadTools(factory);
  const def = ext.tools.get(TOOL_NAMES.invoke).definition;
  const res = await def.execute("tc-2", { investigationId: "INV-pi", op: "http.inspect", params: { url: APP + "/" } }, undefined, undefined, {});
  const env = JSON.parse(res.content[0].text);
  assert.equal(env.ok, true); assert.equal(env.result.status, 200);
});

// 4 — unknown / non-provisioned investigation is refused (agent cannot invent context).
await t("P4 — refuses an investigation with no operator context", async () => {
  const { factory } = buildExtension();
  const ext = await loadTools(factory);
  const def = ext.tools.get(TOOL_NAMES.invoke).definition;
  const res = await def.execute("tc-3", { investigationId: "INV-unprovisioned", op: "http.inspect", params: { url: APP + "/" } }, undefined, undefined, {});
  const env = JSON.parse(res.content[0].text);
  assert.equal(env.ok, false); assert.equal(env.error.code, "no-trusted-context");
  assert.equal(res.isError, true);
});

// 5 — capability-not-allowed enforced through the adapter (context allows only http).
await t("P5 — adapter enforces allowed capabilities", async () => {
  const { factory } = buildExtension();
  const ext = await loadTools(factory);
  const def = ext.tools.get(TOOL_NAMES.invoke).definition;
  const res = await def.execute("tc-4", { investigationId: "INV-pi", op: "sessions.create", params: { kind: "noauth" } }, undefined, undefined, {});
  const env = JSON.parse(res.content[0].text);
  assert.equal(env.ok, false); assert.equal(env.error.code, "capability-not-allowed");
});

// 6 — cancellation via Pi's AbortSignal.
await t("P6 — honors Pi AbortSignal (cancellation)", async () => {
  const { factory } = buildExtension();
  const ext = await loadTools(factory);
  const def = ext.tools.get(TOOL_NAMES.invoke).definition;
  const ac = new AbortController();
  const p = def.execute("tc-5", { investigationId: "INV-pi", op: "http.inspect", params: { url: SLOW + "/" } }, ac.signal, undefined, {});
  setTimeout(() => ac.abort(), 40);
  const res = await p;
  const env = JSON.parse(res.content[0].text);
  assert.ok(env.ok === false || (env.result && (env.result.error || env.result.status === 0)), "aborted op must not return a clean success");
});

// 7 — result shape is Pi-native and sanitized.
await t("P7 — Pi-native AgentToolResult shape, sanitized", async () => {
  const { factory } = buildExtension();
  const ext = await loadTools(factory);
  const def = ext.tools.get(TOOL_NAMES.capabilities).definition;
  const res = await def.execute("tc-6", { op: "probe" }, undefined, undefined, {});
  assert.ok(Array.isArray(res.content) && res.content[0].type === "text", "content is TextContent[]");
  assert.ok("details" in res && "structuredContent" in res, "carries details + structuredContent");
  assert.ok(!JSON.stringify(res).toLowerCase().includes("storagestate"));
});

lab.close(); slow.close();
console.log(`\n${pass} passed, ${fail} failed`);
console.log("NOTE: validates native registration + execution under Pi's real runtime; a full");
console.log("LLM-driven authenticated agent turn is NOT exercised here (needs model auth/provider).");
process.exit(fail ? 1 : 0);
