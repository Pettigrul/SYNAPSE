#!/usr/bin/env node
// SecurityAuditor — CLI Adapter (H1d-F1), OPTIONAL and intentionally LIMITED.
//
// Exposes ONLY stateless operations (capabilities.*, http.*), because a CLI invocation is a
// fresh process with no shared state between calls. Stateful domains (sessions / browser /
// concurrent / race) REQUIRE a persistent process and are REFUSED here with a clear message
// pointing to the in-process bridge / Pi adapter. This honors the "no fake recovery" rule:
// a CLI cannot pretend to reuse a browser session across invocations.
//
// Usage:
//   node adapters/cli.mjs '<json-request>'            # request as argv
//   echo '<json-request>' | node adapters/cli.mjs     # request on stdin
// request = { "op": "...", "params": {...}, "investigationId": "eng:<active engagement>" }
//   Context: read from the file named by SECAUDIT_BRIDGE_CONTEXTS (same format as the Pi adapter) and bound
//   to the engagement selected for this project's session. A caller-supplied "scope" is then refused.
// request = { "op": "...", "params": {...}, "scope": {...} }   (only without SECAUDIT_BRIDGE_CONTEXTS)
//   The caller chooses this scope.
// This process can't tell who wrote that file or set that variable: its caller may be the agent itself. So neither form is
// proof of authorization, and provenance always says operatorVerified:false. Only OS isolation of the file can make it one.
import fs from "node:fs";
import path from "node:path";
import { createBridge } from "../bridge.mjs";
import { getActiveEngagement, resolveProjectContext, resolveSessionId, assertInsideEngagement, STATE_DIR } from "../../workspace/engagement.mjs";
import { loadScopedEnv } from "../../preflight/env-loader.mjs";

const STATELESS = new Set(["capabilities.list", "capabilities.probe", "http.inspect", "http.headers"]);

async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8").trim();
}

function out(obj, code = 0) { process.stdout.write(JSON.stringify(obj) + "\n"); process.exitCode = code; }

// The context for the engagement SELECTED in this session (never an inline SA_ENGAGEMENT), or the refusal. Its own
// `engagement` field, else its eng:<name> id, must name that engagement: an honest file can't serve another client's project.
function operatorContext(req) {
  const fail = (code, message) => ({ error: { code, message } });
  const active = getActiveEngagement({ root: process.env.SA_ENGAGEMENT_ROOT || null, env: {}, sessionId: resolveSessionId() });
  if (!active.name || !active.dir) return fail("no-active-engagement", "operator context needs an active engagement in this project (tools/workspace/cli.mjs use --name <n>)");
  if (typeof req.investigationId !== "string") return fail("no-trusted-context", "investigationId must be a string");
  let ctx = null;
  try { const all = JSON.parse(fs.readFileSync(process.env.SECAUDIT_BRIDGE_CONTEXTS, "utf8")); if (Object.hasOwn(all, req.investigationId)) ctx = all[req.investigationId]; } catch { /* absent or invalid: refused below */ }
  if (!ctx) return fail("no-trusted-context", `no Execution Context for ${req.investigationId} in the contexts file`);
  if ((ctx.engagement ?? req.investigationId.replace(/^eng:/, "")) !== active.name) return fail("engagement-mismatch", `context ${req.investigationId} does not belong to the active engagement ${active.name}`);
  const { engagement: _bound, ...execution } = ctx;
  return { ctx: execution, active };
}

// Names and hosts only: query strings and headers can carry secrets. Best effort, like the workspace audit log.
function recordProvenance(engDir, p, host, ok) {
  try {
    const f = assertInsideEngagement(engDir, path.join(STATE_DIR, "cli-adapter.jsonl"));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.appendFileSync(f, JSON.stringify({ at: new Date().toISOString(), ...p, host, ok }) + "\n");
  } catch { /* best effort */ }
}

async function main() {
  let raw = process.argv[2];
  if (raw === "--help" || raw === "-h") { console.log("usage: node adapters/cli.mjs '<json-request>' (or the request on stdin); capabilities.* and http.* only; with SECAUDIT_BRIDGE_CONTEXTS, name investigationId eng:<active engagement>"); return 0; }
  if (!raw) raw = await readStdin();
  if (!raw) return out({ ok: false, error: { code: "no-request", message: "provide a JSON request via argv or stdin" } }, 2);

  let req;
  try { req = JSON.parse(raw); } catch (e) { return out({ ok: false, error: { code: "bad-json", message: String(e && e.message || e) } }, 2); }
  const op = req.op;
  if (!op) return out({ ok: false, error: { code: "bad-request", message: "request.op is required" } }, 2);

  if (!STATELESS.has(op)) {
    return out({
      ok: false, op,
      error: { code: "stateful-op-unsupported-in-cli", message: `"${op}" needs a persistent process (session/browser/concurrent/race state cannot survive a CLI invocation). Use the in-process bridge or the Pi adapter.` },
    }, 3);
  }

  const bridge = createBridge();
  try {
    if (op.startsWith("capabilities.")) {
      return out(await bridge.invoke({ op }));
    }
    // Set only in the central .env and withheld here: the operator expects the file to decide, so don't fall back to a caller scope.
    if (loadScopedEnv()?.withheld?.includes("SECAUDIT_BRIDGE_CONTEXTS")) return out({ ok: false, op, error: { code: "contexts-file-withheld", message: "SECAUDIT_BRIDGE_CONTEXTS in the central .env applies only at the harness root; export it for this command" } }, 1);
    const ctxPlace = resolveProjectContext();
    const base = { adapter: "cli-stateless", operatorVerified: false, project: ctxPlace.dir, session: resolveSessionId() };
    let investigationId, provenance, engDir = null;
    if (process.env.SECAUDIT_BRIDGE_CONTEXTS) {
      if (req.scope) return out({ ok: false, op, error: { code: "caller-scope-refused", message: "SECAUDIT_BRIDGE_CONTEXTS is set: the contexts file decides the scope; name its investigationId instead" } }, 1);
      if (!req.investigationId) return out({ ok: false, op, error: { code: "bad-request", message: "name the context: investigationId eng:<selected engagement>" } }, 2);
      const r = operatorContext(req);
      if (r.error) return out({ ok: false, op, error: r.error }, 1);
      investigationId = req.investigationId; engDir = r.active.dir;
      bridge.openInvestigation({ ...r.ctx, investigationId });
      provenance = { ...base, scopeSource: "context-file", engagement: r.active.name, investigationId };
    } else {
      if (!req.scope) return out({ ok: false, op, error: { code: "bad-request", message: "http.* requires a scope: a contexts file (SECAUDIT_BRIDGE_CONTEXTS) or a caller-supplied scope; neither is proof of authorization" } }, 2);
      investigationId = `cli-${Date.now()}`;
      bridge.openInvestigation({ investigationId, scope: req.scope, allowedCapabilities: ["http"] });
      provenance = { ...base, scopeSource: "caller-supplied" };
    }
    const env = await bridge.invoke({ investigationId, op, params: req.params || {} });
    if (engDir) { let host = null; try { host = new URL(req.params.url).host; } catch { /* no url */ } recordProvenance(engDir, provenance, host, !!env.ok); }
    return out({ ...env, provenance }, env.ok ? 0 : 1);
  } catch (e) {
    return out({ ok: false, op, error: { code: e.code || "error", message: String(e && e.message || e) } }, 1);
  } finally {
    try { await bridge.shutdown(); } catch { /* ignore */ }
  }
}

main();
