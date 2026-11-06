#!/usr/bin/env node
// SecurityAuditor — Pi project trust, against the installed Pi, no model turn (RPC startup only).
// A synthetic project ships an extension that only touches a canary file: `pi -a` runs it; no flag and `-na` don't, and
// `-na` with explicit paths still gives the SYNAPSE skills and tools. HOME is isolated. Prints NOT RUN without Pi.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { activate, auditRuntimeConfig } from "../activation/activate.mjs";

const PI = process.env.PI_BINARY || (spawnSync("sh", ["-c", "command -v pi"], { encoding: "utf8" }).stdout || "").trim();
const H = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "sa-pitrust-"));
const P = path.join(TMP, "client"), HOME = path.join(TMP, "home"), CANARY = path.join(TMP, "CANARY");
fs.mkdirSync(path.join(P, ".pi", "extensions"), { recursive: true }); fs.mkdirSync(HOME);
fs.writeFileSync(path.join(P, ".pi", "extensions", "client-ext.js"), `const fs = require("node:fs"); module.exports = function () { fs.writeFileSync(${JSON.stringify(CANARY)}, "x"); };\n`);

let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log(`  ok  ${name}`); } catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); } };

await t("audit reports the project's extension as executable; SYNAPSE's own links are not reported", () => {
  activate({ projectDir: P, home: H, runtimes: ["pi"] });
  const f = auditRuntimeConfig({ projectDir: P });
  assert.ok(f.some((x) => x.path === ".pi/extensions" && x.kind === "executable"), JSON.stringify(f));
  assert.ok(!f.some((x) => x.path === ".pi/settings.json" || x.path === "AGENTS.md"), JSON.stringify(f));
});

if (!PI) { console.log(`\npi trust: ${pass} passed, ${fail} failed; RPC checks NOT RUN (pi not on PATH)`); process.exit(fail ? 1 : 0); }

function commands(flags) {
  return new Promise((resolve, reject) => {
    try { fs.unlinkSync(CANARY); } catch { /* absent */ }
    const child = spawn(PI, ["--mode", "rpc", "--no-session", ...flags], { cwd: P, env: { PATH: process.env.PATH, HOME, PI_TELEMETRY: "0" } });
    let buf = "";
    const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error("RPC get_commands exceeded 25 seconds")); }, 25000);
    child.stdout.on("data", (c) => {
      buf += c; let e;
      while ((e = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, e); buf = buf.slice(e + 1);
        try { const j = JSON.parse(line); if (j.id === "c") { clearTimeout(timer); child.kill("SIGTERM"); resolve({ names: (j.data?.commands || []).map((x) => x.name), canary: fs.existsSync(CANARY) }); } } catch { /* not JSON */ }
      }
    });
    child.stdin.write(`${JSON.stringify({ id: "c", type: "get_commands" })}\n`);
  });
}

await t("pi -a runs the project's extension: trusting a client repo executes its code", async () => {
  assert.equal((await commands(["-a"])).canary, true);
});
await t("no flag: the project's extension and settings don't load", async () => {
  const r = await commands([]);
  assert.equal(r.canary, false); assert.ok(!r.names.includes("skill:security-auditor"));
});
await t("-na with explicit paths: SYNAPSE skills load, the project's extension doesn't", async () => {
  const r = await commands(["-na", "--skill", path.join(H, "SKILL.md"), "--skill", path.join(H, ".claude", "skills"), "-e", path.join(H, "tools", "web-runtime", "adapters", "pi", "extension-pi.mjs")]);
  assert.equal(r.canary, false);
  assert.ok(r.names.includes("skill:security-auditor"), r.names.join(","));
  assert.ok(r.names.includes("skill:investigar"), r.names.join(","));
});

console.log(`\npi trust: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
