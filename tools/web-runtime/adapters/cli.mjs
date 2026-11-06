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
// request = { "op": "...", "params": {...}, "scope": {...} }   (scope is operator-provided)
import { createBridge } from "../bridge.mjs";

const STATELESS = new Set(["capabilities.list", "capabilities.probe", "http.inspect", "http.headers"]);

async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8").trim();
}

function out(obj, code = 0) { process.stdout.write(JSON.stringify(obj) + "\n"); process.exitCode = code; }

async function main() {
  let raw = process.argv[2];
  if (raw === "--help" || raw === "-h") { console.log("usage: node adapters/cli.mjs '<json-request>' (or the request on stdin); capabilities.* and http.* only"); return 0; }
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
    // http.* needs an authorized scope; the CLI caller (operator/dispatcher) supplies it.
    if (!req.scope) return out({ ok: false, op, error: { code: "bad-request", message: "http.* requires an operator-provided scope" } }, 2);
    const investigationId = `cli-${Date.now()}`;
    bridge.openInvestigation({ investigationId, scope: req.scope, allowedCapabilities: ["http"] });
    const env = await bridge.invoke({ investigationId, op, params: req.params || {} });
    return out(env, env.ok ? 0 : 1);
  } catch (e) {
    return out({ ok: false, op, error: { code: e.code || "error", message: String(e && e.message || e) } }, 1);
  } finally {
    try { await bridge.shutdown(); } catch { /* ignore */ }
  }
}

main();
