#!/usr/bin/env node
// SecurityAuditor — CLI adapter trust boundary (deterministic, offline, no LLM, no offensive ops).
// Neither form is proof of authorization and provenance says so; a contexts file is bound to the engagement selected
// in the project's session; provenance records names and hosts, never secrets. Network: one loopback fixture from this file.

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { initEngagement, STATE_DIR } from "../workspace/engagement.mjs";
import { activate } from "../activation/activate.mjs";

const H = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ACLI = path.join(H, "tools", "web-runtime", "adapters", "cli.mjs"), WCLI = path.join(H, "tools", "workspace", "cli.mjs");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "sa-cliadapter-"));
let n = 0; const fresh = (l) => { const d = path.join(TMP, `${l}-${++n}`); fs.mkdirSync(d, { recursive: true }); return d; };

let hits = 0;
const server = http.createServer((req, res) => { hits++; res.end("ok"); });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const URL_OK = `http://127.0.0.1:${server.address().port}/secret-path?token=QUERYSECRET`;

const ROOT = fresh("root"); for (const c of ["client-a", "client-b"]) initEngagement({ root: ROOT, name: c });
const CTX = path.join(TMP, "contexts.json");
const http_ = { allowHosts: ["127.0.0.1"], allowPrivate: true };
fs.writeFileSync(CTX, JSON.stringify({
  "eng:client-a": { scope: http_, allowedCapabilities: ["http"] },
  "eng:client-b": { scope: http_, allowedCapabilities: ["http"] },
  "named": { engagement: "client-a", scope: http_, allowedCapabilities: ["http"] },
  "narrow": { engagement: "client-a", scope: { allowHosts: ["lab.example.test"] }, allowedCapabilities: ["http"] },
}));
const project = () => { const p = fresh("prj"); activate({ projectDir: p, home: H, runtimes: ["antigravity"] }); return p; };
const baseEnv = { PATH: process.env.PATH, HOME: TMP, SA_SKIP_ENV_FILE: "1", SA_ENGAGEMENT_ROOT: ROOT };
const node = (args, cwd, env) => new Promise((resolve) => execFile(process.execPath, args, { cwd, encoding: "utf8", env: { ...baseEnv, ...env } }, (e, stdout, stderr) => resolve({ code: e ? e.code : 0, out: stdout || "", err: stderr || "" })));
const call = async (req, cwd, env = { SECAUDIT_BRIDGE_CONTEXTS: CTX }) => { const r = await node([ACLI, JSON.stringify(req)], cwd, env); return { ...r, j: JSON.parse(r.out) }; };
const use = (p, name) => node([WCLI, "use", "--name", name], p, {});
const req = (extra) => ({ op: "http.inspect", params: { url: URL_OK }, ...extra });

let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log(`  ok  ${name}`); } catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); } };

console.log("CLI adapter trust boundary\n");

await t("caller-supplied scope: runs, but declares that nothing verified it", async () => {
  const r = await call(req({ scope: http_ }), project(), {});
  assert.equal(r.code, 0); assert.equal(r.j.ok, true);
  assert.equal(r.j.provenance.scopeSource, "caller-supplied"); assert.equal(r.j.provenance.operatorVerified, false);
});
await t("with an operator context file, a caller-supplied scope is refused and nothing is sent", async () => {
  const p = project(); await use(p, "client-a"); hits = 0;
  const r = await call(req({ scope: { allowHosts: ["*"] }, investigationId: "eng:client-a" }), p);
  assert.equal(r.code, 1); assert.equal(r.j.error.code, "caller-scope-refused"); assert.equal(hits, 0);
});
await t("context of the selected engagement: allowed, with full provenance, and still not called verified", async () => {
  const p = project(); await use(p, "client-a");
  const r = await call(req({ investigationId: "eng:client-a" }), p);
  assert.equal(r.code, 0, r.out); assert.equal(r.j.ok, true);
  const v = r.j.provenance;
  assert.equal(v.operatorVerified, false); assert.equal(v.scopeSource, "context-file"); assert.equal(v.engagement, "client-a");
  assert.ok(!("operatorAuthorized" in v));
  assert.equal(v.investigationId, "eng:client-a"); assert.equal(fs.realpathSync(v.project), fs.realpathSync(p)); assert.match(v.session, /^prj-/); assert.equal(v.adapter, "cli-stateless");
});
await t("operator context of ANOTHER client's engagement: refused, nothing sent", async () => {
  const p = project(); await use(p, "client-a"); hits = 0;
  const r = await call(req({ investigationId: "eng:client-b" }), p);
  assert.equal(r.code, 1); assert.equal(r.j.error.code, "engagement-mismatch"); assert.equal(hits, 0);
});
await t("context bound by its engagement field works; for another engagement it is refused", async () => {
  const a = project(); await use(a, "client-a");
  assert.equal((await call(req({ investigationId: "named" }), a)).code, 0);
  const b = project(); await use(b, "client-b");
  assert.equal((await call(req({ investigationId: "named" }), b)).j.error.code, "engagement-mismatch");
});
await t("a context file the agent itself writes gets no authority claim", async () => {
  const forged = path.join(TMP, "forged.json"); fs.writeFileSync(forged, JSON.stringify({ "eng:client-a": { scope: { allowHosts: ["*"] }, allowedCapabilities: ["http"] } }));
  const p = project(); await use(p, "client-a");
  const r = await call(req({ investigationId: "eng:client-a" }), p, { SECAUDIT_BRIDGE_CONTEXTS: forged });
  assert.equal(r.j.provenance.operatorVerified, false);
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, "client-a", STATE_DIR, "cli-adapter.jsonl"), "utf8"), /"operatorVerified":true|operatorAuthorized/);
});
await t("an inline SA_ENGAGEMENT can't pick another client's context, in a project or out of one", async () => {
  const p = project(); await use(p, "client-a"); hits = 0;
  const env = { SECAUDIT_BRIDGE_CONTEXTS: CTX, SA_ENGAGEMENT: "client-b" };
  assert.equal((await call(req({ investigationId: "eng:client-b" }), p, env)).j.error.code, "engagement-mismatch");
  assert.equal((await call(req({ investigationId: "eng:client-b" }), fresh("plain"), env)).j.error.code, "no-active-engagement");
  assert.equal(hits, 0);
});
await t("the context's engagement field outranks its id; odd ids are refused", async () => {
  const f = path.join(TMP, "odd.json"); fs.writeFileSync(f, JSON.stringify({ "eng:client-a": { engagement: "client-b", scope: http_, allowedCapabilities: ["http"] }, "named": { engagement: "client-a", scope: http_, allowedCapabilities: ["http"] } }));
  const p = project(); await use(p, "client-a"); hits = 0;
  const env = { SECAUDIT_BRIDGE_CONTEXTS: f };
  assert.equal((await call(req({ investigationId: "eng:client-a" }), p, env)).j.error.code, "engagement-mismatch");
  assert.equal((await call(req({ investigationId: ["named"] }), p, env)).j.error.code, "no-trusted-context");
  assert.equal((await call(req({ investigationId: "__proto__" }), p, env)).j.error.code, "no-trusted-context");
  assert.equal(hits, 0);
});
await t("no active engagement, or no project context: refused", async () => {
  assert.equal((await call(req({ investigationId: "eng:client-a" }), project())).j.error.code, "no-active-engagement");
  assert.equal((await call(req({ investigationId: "eng:client-a" }), fresh("plain"))).j.error.code, "no-active-engagement");
});
await t("unknown id, unreadable file, or missing id: refused", async () => {
  const p = project(); await use(p, "client-a");
  assert.equal((await call(req({ investigationId: "nope" }), p)).j.error.code, "no-trusted-context");
  assert.equal((await call(req({ investigationId: "eng:client-a" }), p, { SECAUDIT_BRIDGE_CONTEXTS: path.join(TMP, "absent.json") })).j.error.code, "no-trusted-context");
  assert.equal((await call(req({}), p)).code, 2);
});
await t("the operator's scope decides: a host outside it is refused by the Bridge", async () => {
  const p = project(); await use(p, "client-a"); hits = 0;
  const r = await call(req({ investigationId: "narrow" }), p);
  assert.equal(r.code, 1); assert.equal(r.j.ok, false); assert.equal(hits, 0);
});
await t("provenance on disk: confined to the engagement, host only, no query or path", async () => {
  const p = project(); await use(p, "client-a");
  await call(req({ investigationId: "eng:client-a" }), p);
  const log = fs.readFileSync(path.join(ROOT, "client-a", STATE_DIR, "cli-adapter.jsonl"), "utf8");
  assert.match(log, /"scopeSource":"context-file"/); assert.match(log, /"host":"127\.0\.0\.1:/);
  assert.doesNotMatch(log, /QUERYSECRET|secret-path/);
});
await t("stateful ops stay refused: no path for /investigar here", async () => {
  const p = project(); await use(p, "client-a");
  for (const op of ["sessions.create", "investigation.start", "caido.replay.run", "browser.open"]) {
    const r = await call({ op, investigationId: "eng:client-a" }, p);
    assert.equal(r.code, 3, op); assert.equal(r.j.error.code, "stateful-op-unsupported-in-cli", op);
  }
});
await t("pointer and skill don't claim a protection the runtime lacks", () => {
  const agents = fs.readFileSync(path.join(H, "AGENTS.md"), "utf8");
  assert.match(agents, /Scope Guard, Execution Context and Approval Gate don't cover shell commands or any other tool outside the harness, so never claim their protection for those\./);
  assert.doesNotMatch(agents, /still apply|when unsure/);
  const skill = fs.readFileSync(path.join(H, ".claude", "skills", "investigar", "SKILL.md"), "utf8");
  assert.match(skill, /Sem `securityauditor_invoke`/); assert.match(skill, /\*\*não\*\* está protegido pela Bridge/);
  const adapter = fs.readFileSync(path.join(H, "adapters", "antigravity.md"), "utf8");
  assert.match(adapter, /os fluxos \*\*não\*\* são protegidos por ela/);
  assert.match(fs.readFileSync(path.join(H, "docs", "handbook", "operator", "antigravity.md"), "utf8"), /\*\*O `\/investigar` e os demais fluxos no `agy` não estão protegidos pela Bridge\.\*\*/);
});

server.close();
console.log(`\ncli adapter: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
