#!/usr/bin/env node
// SecurityAuditor — Pi Bridge context bound to the selected engagement (deterministic, offline, no LLM, no offensive ops).
// The agent names the investigationId, so a contexts file with several clients must not let it run under another one. Uses the real
// file source and core with injected defineTool/Type and a recording bridge: nothing is sent. Real Pi loading is test-pi-entry's job.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { createSecurityAuditorExtension, makeFileContextSource } from "./adapters/pi/extension.mjs";
import { initEngagement, associateCaidoProject, loadEngagement } from "../workspace/engagement.mjs";
import { activate } from "../activation/activate.mjs";

const H = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const WCLI = path.join(H, "tools", "workspace", "cli.mjs");
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sa-pibind-")));
let n = 0; const fresh = (l) => { const d = path.join(TMP, `${l}-${++n}`); fs.mkdirSync(d, { recursive: true }); return d; };
const ROOT = fresh("root"); for (const c of ["client-a", "client-b"]) initEngagement({ root: ROOT, name: c });
associateCaidoProject(loadEngagement({ dir: path.join(ROOT, "client-a") }), { projectId: "proj-A" });
const c = { scope: { allowHosts: ["127.0.0.1"], allowPrivate: true }, allowedCapabilities: ["http"] };
const CTX = path.join(TMP, "ctx.json");
fs.writeFileSync(CTX, JSON.stringify({
  "eng:client-a": c, "eng:client-b": c, "field-a": { ...c, engagement: "client-a" }, "field-b": { ...c, engagement: "client-b" },
  "evid-a": { ...c, evidenceDir: path.join(ROOT, "client-a", "evidence") }, "evid-b": { ...c, evidenceDir: path.join(ROOT, "client-b", "evidence") },
  "evid-out": { ...c, evidenceDir: path.join(TMP, "elsewhere") }, "proj-a": { ...c, caido: { projectId: "proj-A" } }, "proj-b": { ...c, caido: { projectId: "proj-B" } },
  "bad-name": { ...c, engagement: "///" }, "opaque": c,
  "caido-url": { ...c, caido: { baseUrl: "http://127.0.0.1:1" } }, "caido-token": { ...c, caido: { token: "fake-token" } }, "caido-both": { ...c, caido: { baseUrl: "http://127.0.0.1:1", token: "fake-token" } }, "caido-empty": { ...c, caido: {} },
  "a-with-proj-b": { ...c, engagement: "client-a", caido: { projectId: "proj-B" } }, "a-with-evid-b": { ...c, engagement: "client-a", evidenceDir: path.join(ROOT, "client-b", "evidence") }, "x\u001b[31m\ny": { ...c, engagement: "client-b" },
}));

// The source reads process state, as under Pi: each scenario sets it, with its own project.
const scenario = (cwd, env = {}) => {
  process.chdir(cwd);
  for (const k of ["SA_ENGAGEMENT", "SA_SESSION_ID", "PWD", "CAIDO_PROJECT_ID"]) delete process.env[k];
  Object.assign(process.env, { SA_SKIP_ENV_FILE: "1", SA_ENGAGEMENT_ROOT: ROOT, SECAUDIT_BRIDGE_CONTEXTS: CTX, HOME: TMP }, env);
};
function adapter() {
  const opened = [], tools = {};
  const bridge = { openInvestigation: (x) => opened.push(x), invoke: async (x) => ({ ok: true, op: x.op, investigationId: x.investigationId }), shutdown: async () => {} };
  const defineTool = (d) => d, Type = { Object: (x) => x, Union: (x) => x, Literal: (x) => x, String: (x) => x, Optional: (x) => x, Any: () => ({}) };
  createSecurityAuditorExtension({ defineTool, Type, bridge, ...makeFileContextSource() })({ registerTool: (d) => { tools[d.name] = d; } });
  const call = async (id) => (await tools.securityauditor_invoke.execute(`c-${id}`, { investigationId: id, op: "http.inspect", params: {} }, new AbortController().signal)).details;
  return { call, opened };
}
const cli = (args, cwd) => spawnSync(process.execPath, [WCLI, ...args], { cwd, encoding: "utf8", env: { PATH: process.env.PATH, HOME: TMP, SA_SKIP_ENV_FILE: "1", SA_ENGAGEMENT_ROOT: ROOT } });
const project = (sel) => { const p = fresh("prj"); activate({ projectDir: p, home: H, runtimes: ["pi"] }); if (sel) assert.equal(cli(["use", "--name", sel], p).status, 0); return p; };

let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log(`  ok  ${name}`); } catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); } };

console.log("Pi Bridge binding\n");

await t("selected client-a: its contexts run, however they say so", async () => {
  scenario(project("client-a")); const { call, opened } = adapter();
  for (const id of ["eng:client-a", "field-a", "evid-a", "proj-a"]) assert.equal((await call(id)).ok, true, id);
  assert.equal(opened.length, 4); assert.ok(opened.every((x) => !("engagement" in x)), "the binding field isn't part of the Execution Context");
});
await t("selected client-a: another client's context is refused and never opened, however it says so", async () => {
  scenario(project("client-a")); const { call, opened } = adapter();
  for (const id of ["eng:client-b", "field-b", "evid-b", "proj-b", "bad-name"]) {
    const r = await call(id); assert.equal(r.ok, false, id); assert.equal(r.error.code, "engagement-mismatch", id);
  }
  assert.deepEqual(opened, []);
});
await t("no selection in this project: a context that belongs to an engagement is refused; an unattributed one keeps working", async () => {
  scenario(project()); const { call, opened } = adapter();
  const r = await call("eng:client-a"); assert.equal(r.error.code, "no-active-engagement"); assert.match(r.error.message, /use --name/);
  assert.equal((await call("evid-b")).error.code, "no-active-engagement");
  assert.equal((await call("opaque")).ok, true, "the documented opaque id with no sign of an engagement");
  assert.equal((await call("evid-out")).ok, true, "evidence outside the root says nothing");
  assert.equal(opened.length, 2);
});
await t("outside any project: same rule, and the message explains the missing context", async () => {
  scenario(fresh("plain")); const { call } = adapter();
  const r = await call("eng:client-a"); assert.equal(r.error.code, "no-active-engagement"); assert.match(r.error.message, /no unambiguous project context/);
  assert.equal((await call("opaque")).ok, true);
});
await t("a later `use` counts: an investigation already open stops working when the engagement changes", async () => {
  const p = project("client-a"); scenario(p); const { call } = adapter();
  assert.equal((await call("eng:client-a")).ok, true);
  assert.equal(cli(["use", "--name", "client-b"], p).status, 0);
  assert.equal((await call("eng:client-a")).error.code, "engagement-mismatch");
  assert.equal((await call("eng:client-b")).ok, true);
  assert.equal(cli(["use", "--name", "client-a"], p).status, 0);
  assert.equal((await call("eng:client-a")).ok, true, "and works again when selected again");
});
await t("Pi started with a conflicting SA_ENGAGEMENT: refused for every context, the opaque one too", async () => {
  scenario(project("client-a"), { SA_ENGAGEMENT: "client-b" }); const { call, opened } = adapter();
  for (const id of ["eng:client-a", "eng:client-b", "opaque"]) assert.equal((await call(id)).error.code, "engagement-conflict", id);
  assert.deepEqual(opened, []);
});
await t("Pi started in a project with SA_ENGAGEMENT and no pointer: not a selection, every context refused", async () => {
  scenario(project(), { SA_ENGAGEMENT: "client-b" }); const { call, opened } = adapter();
  for (const id of ["eng:client-b", "eng:client-a", "proj-a", "opaque"]) { const r = await call(id); assert.equal(r.error.code, "engagement-conflict", id); assert.match(r.error.message, /use --name client-b/, id); }
  assert.deepEqual(opened, []);
});
await t("Pi in a project whose pointer names a removed engagement, plus SA_ENGAGEMENT: refused, no fall-through", async () => {
  const root = fresh("root-stale"); for (const x of ["gone", "client-b"]) initEngagement({ root, name: x });
  const p = fresh("prj"); activate({ projectDir: p, home: H, runtimes: ["pi"] });
  assert.equal(spawnSync(process.execPath, [WCLI, "use", "--name", "gone"], { cwd: p, encoding: "utf8", env: { PATH: process.env.PATH, HOME: TMP, SA_SKIP_ENV_FILE: "1", SA_ENGAGEMENT_ROOT: root } }).status, 0);
  fs.renameSync(path.join(root, "gone"), path.join(TMP, `gone-${++n}`));
  scenario(p, { SA_ENGAGEMENT_ROOT: root, SA_ENGAGEMENT: "client-b" }); const { call } = adapter();
  assert.equal((await call("eng:client-b")).error.code, "engagement-conflict");
});
await t("Pi in a plain directory with SA_ENGAGEMENT: there it is the selection (automation)", async () => {
  scenario(fresh("plain"), { SA_ENGAGEMENT: "client-b" }); const { call } = adapter();
  assert.equal((await call("eng:client-b")).ok, true);
  assert.equal((await call("eng:client-a")).error.code, "engagement-mismatch");
});
await t("a context that only carries a Caido project is a sign: no selection, no run", async () => {
  for (const cwd of [project(), fresh("plain")]) {
    scenario(cwd); const { call, opened } = adapter();
    for (const id of ["proj-a", "proj-b"]) { const r = await call(id); assert.equal(r.error.code, "no-active-engagement", id); assert.match(r.error.message, /Caido project/, id); }
    assert.deepEqual(opened, []);
  }
});
await t("a Caido block with a URL or token and no project is a sign too; with a selection it stays usable for discovery", async () => {
  for (const cwd of [project(), fresh("plain")]) {
    scenario(cwd); const { call, opened } = adapter();
    for (const id of ["caido-url", "caido-token", "caido-both"]) { const r = await call(id); assert.equal(r.error.code, "no-active-engagement", id); assert.match(r.error.message, /a Caido instance/, id); assert.doesNotMatch(r.error.message, /fake-token/, id); }
    assert.deepEqual(opened, []);
    assert.equal((await call("caido-empty")).ok, true, "an empty block reaches nothing");
  }
  for (const sel of ["client-b", "client-a"]) { // unbound and bound: a block without a project claims none
    scenario(project(sel)); const { call } = adapter();
    for (const id of ["caido-url", "caido-token", "caido-both"]) assert.equal((await call(id)).ok, true, `${sel} ${id}`);
  }
});
await t("a Caido project needs the selected engagement's own binding", async () => {
  scenario(project("client-b")); let { call, opened } = adapter();
  for (const id of ["proj-a", "proj-b"]) { const r = await call(id); assert.equal(r.error.code, "engagement-mismatch", id); assert.match(r.error.message, /not bound to any/, id); }
  assert.deepEqual(opened, []);
  scenario(project("client-b"), { CAIDO_PROJECT_ID: "proj-B" }); ({ call } = adapter());
  assert.equal((await call("proj-b")).error.code, "engagement-mismatch", "the global compat variable is not a binding");
  scenario(project("client-a")); ({ call } = adapter());
  assert.equal((await call("proj-a")).ok, true); assert.match((await call("proj-b")).error.message, /bound to proj-A/);
});
await t("every sign has to match: a right one doesn't vouch for a wrong one", async () => {
  scenario(project("client-a")); const { call } = adapter();
  for (const id of ["a-with-proj-b", "a-with-evid-b"]) assert.equal((await call(id)).error.code, "engagement-mismatch", id);
});
await t("refusal messages carry no control characters from the id or the variable", async () => {
  scenario(project("client-a")); let { call } = adapter();
  assert.doesNotMatch((await call("x\u001b[31m\ny")).error.message, /[\u0000-\u001f]/);
  scenario(project(), { SA_ENGAGEMENT: "x\u001b[31m\nforged" }); ({ call } = adapter());
  assert.doesNotMatch((await call("opaque")).error.message, /[\u0000-\u001f]/);
});
await t("unprovisioned id and absent file: still no-trusted-context", async () => {
  scenario(project("client-a")); assert.equal((await adapter().call("nope")).error.code, "no-trusted-context");
  assert.equal((await adapter().call("constructor")).error.code, "no-trusted-context", "not a prototype property");
  scenario(project("client-a"), { SECAUDIT_BRIDGE_CONTEXTS: path.join(TMP, "absent.json") });
  assert.equal((await adapter().call("eng:client-a")).error.code, "no-trusted-context");
});
await t("a root set only in .env counts, and the source leaves Pi's environment as it found it", async () => {
  // In a disposable harness with a fixture .env, in a child: this process must never load the real one.
  const copy = path.join(TMP, "harness-copy"); fs.mkdirSync(copy); fs.copyFileSync(path.join(H, "SKILL.md"), path.join(copy, "SKILL.md"));
  fs.cpSync(path.join(H, "tools"), path.join(copy, "tools"), { recursive: true, filter: (x) => !x.includes(`${path.sep}node_modules`) });
  fs.writeFileSync(path.join(copy, ".env"), `SA_ENGAGEMENT_ROOT=${ROOT}\nCAIDO_BASE_URL=http://127.0.0.1:1\n`);
  const p = project("client-a");
  const code = `const { makeFileContextSource: m } = await import(${JSON.stringify(path.join(copy, "tools/web-runtime/adapters/pi/extension.mjs"))}); const before = JSON.stringify(process.env); const g = m().guardContext;
    console.log(JSON.stringify({ own: await g("eng:client-a"), other: (await g("eng:client-b"))?.code, same: before === JSON.stringify(process.env) }));`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: p, encoding: "utf8", env: { PATH: process.env.PATH, HOME: TMP, SECAUDIT_BRIDGE_CONTEXTS: CTX } });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { own: null, other: "engagement-mismatch", same: true });
});

process.chdir(H);
console.log(`\npi binding: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
