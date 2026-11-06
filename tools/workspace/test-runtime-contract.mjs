#!/usr/bin/env node
// SecurityAuditor — runtime-facing workspace contract (deterministic, offline, no LLM, no offensive ops).
// Per-project session derivation, isolation between projects sharing a root, bootstrap runtime selection,
// preflight scope states, the root-inside-harness refusal, adapter CLI exit codes, mode reset on a switch, and
// --help never mutating. The only network use is a loopback fixture started and stopped by this file.

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { initEngagement, resolveSessionId, assertRootOutsideHarness, bootstrapEngagement, WorkspaceError, STATE_DIR, STATE_ROOT_DIR, AUDIT_LOG } from "./engagement.mjs";
import { activate } from "../activation/activate.mjs";
import { getMode, setMode } from "../modes/mode.mjs";
import { collectEnv } from "../preflight/preflight.mjs";
import { runDoctor } from "../preflight/doctor.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const H = path.resolve(HERE, "..", "..");
const WCLI = path.join(H, "tools", "workspace", "cli.mjs");
const MCLI = path.join(H, "tools", "modes", "cli.mjs");
const PCLI = path.join(H, "tools", "preflight", "cli.mjs");
const ACLI = path.join(H, "tools", "web-runtime", "adapters", "cli.mjs");
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sa-rtcontract-")));
const FAKE_HOME = path.join(TMP, "_home"); fs.mkdirSync(FAKE_HOME);
let n = 0, fail = 0, seq = 0;
async function t(name, fn) { n++; try { await fn(); console.log(`  ok   ${name}`); } catch (e) { fail++; console.log(`  FAIL ${name}: ${e.message}`); } }
const baseEnv = () => ({ PATH: process.env.PATH, HOME: FAKE_HOME, SA_SKIP_ENV_FILE: "1" });
function run(bin, args, { cwd = TMP, env = {} } = {}) {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", input: "", env: { ...baseEnv(), ...env } });
  return { code: r.status, out: r.stdout || "", err: r.stderr || "" };
}
const fresh = (prefix) => { const d = path.join(TMP, `${prefix}${++seq}`); fs.mkdirSync(d); return d; };
const project = (runtimes) => { const p = fresh("proj"); activate({ projectDir: p, home: H, runtimes }); return p; };
function tree(dir, base = dir, acc = {}) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name), rel = path.relative(base, abs);
    if (e.isSymbolicLink()) acc[rel] = `-> ${fs.readlinkSync(abs)}`;
    else if (e.isDirectory()) { acc[rel] = "dir"; tree(abs, base, acc); }
    else acc[rel] = createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
  }
  return acc;
}
const SCOPE_OK = "# Scope\n\n## In Scope\n- 127.0.0.1\n";

// ---- session derivation ----

await t("explicit SA_SESSION_ID wins over the activation marker", () => {
  const p = project(["pi"]);
  assert.equal(resolveSessionId({ env: { SA_SESSION_ID: "mine" }, cwd: p }), "mine");
});

await t("activated project: stable prj-<12 hex> session, same from a subdirectory", () => {
  const p = project(["pi"]); const sub = path.join(p, "a", "b"); fs.mkdirSync(sub, { recursive: true });
  const s = resolveSessionId({ env: {}, cwd: p });
  assert.match(s, /^prj-[0-9a-f]{12}$/);
  assert.equal(resolveSessionId({ env: {}, cwd: sub }), s);
  assert.equal(resolveSessionId({ env: {}, cwd: p }), s, "stable across calls");
});

await t("the session follows the real project, whatever path reaches it", () => {
  const p = project(["pi"]); const alias = path.join(TMP, `alias${++seq}`); fs.symlinkSync(p, alias);
  assert.equal(resolveSessionId({ env: {}, cwd: alias }), resolveSessionId({ env: {}, cwd: p }));
});

await t("two projects derive different sessions; no marker derives none", () => {
  assert.notEqual(resolveSessionId({ env: {}, cwd: project(["pi"]) }), resolveSessionId({ env: {}, cwd: project(["pi"]) }));
  assert.equal(resolveSessionId({ env: {}, cwd: fresh("plain") }), null);
});

await t("session survives cd into a linked dir: the shell's PWD still names the project", () => {
  const p = project(["pi"]); const logical = path.join(p, "tools"); const physical = fs.realpathSync(logical);
  assert.notEqual(physical, logical);
  assert.equal(resolveSessionId({ env: { PWD: logical }, cwd: physical }), resolveSessionId({ env: {}, cwd: p }));
  assert.notEqual(resolveSessionId({ env: { PWD: p }, cwd: physical }), resolveSessionId({ env: {}, cwd: p }), "a stale PWD is ignored");
});

await t("a link from outside into the project still finds its marker on the physical path", () => {
  const p = project(["pi"]); const sub = path.join(p, "sub"); fs.mkdirSync(sub);
  const alias = path.join(TMP, `alias${++seq}`); fs.symlinkSync(sub, alias);
  assert.equal(resolveSessionId({ env: { PWD: alias }, cwd: fs.realpathSync(alias) }), resolveSessionId({ env: {}, cwd: p }));
});

// ---- isolation between two projects sharing a root ----

const SHARED = fresh("root");
initEngagement({ root: SHARED, name: "alpha" }); initEngagement({ root: SHARED, name: "beta" });
const P1 = project(["pi"]), P2 = project(["antigravity"]);
const inP = (p, args, env = {}) => run(WCLI, args, { cwd: p, env: { SA_ENGAGEMENT_ROOT: SHARED, ...env } });
const modeIn = (p, args, env = {}) => run(MCLI, args, { cwd: p, env: { SA_ENGAGEMENT_ROOT: SHARED, ...env } });

await t("two projects sharing a root keep independent selections across processes", () => {
  assert.equal(inP(P1, ["use", "--name", "alpha"]).code, 0);
  assert.equal(inP(P2, ["use", "--name", "beta"]).code, 0);
  assert.match(inP(P1, ["active"]).out, /active: alpha/);
  assert.match(inP(P2, ["active"]).out, /active: beta/);
  const pointers = fs.readdirSync(path.join(SHARED, STATE_ROOT_DIR)).filter((f) => f.startsWith("active"));
  assert.equal(pointers.length, 2, pointers.join(","));
  assert.ok(!pointers.includes("active.json"), "the shared default pointer must stay unused");
});

await t("clearing one project's selection leaves the other", () => {
  const a = project(["pi"]), b = project(["pi"]);
  inP(a, ["use", "--name", "alpha"]); inP(b, ["use", "--name", "alpha"]);
  assert.equal(inP(a, ["clear"]).code, 0);
  assert.match(inP(a, ["active"]).out, /no active engagement/);
  assert.match(inP(b, ["active"]).out, /active: alpha/);
});

await t("two projects on the SAME engagement keep independent modes", () => {
  const a = project(["pi"]), b = project(["pi"]);
  inP(a, ["use", "--name", "alpha"]); inP(b, ["use", "--name", "alpha"]);
  assert.equal(modeIn(a, ["autopilot"]).code, 0);
  assert.match(modeIn(a, ["status"]).out, /mode: autopilot/);
  assert.match(modeIn(b, ["status"]).out, /mode: copilot/);
});

await t("explicit SA_SESSION_ID: both projects share that one pointer", () => {
  const env = { SA_SESSION_ID: "shared-op" };
  assert.equal(inP(P1, ["use", "--name", "beta"], env).code, 0);
  assert.match(inP(P2, ["active"], env).out, /active: beta/);
  assert.match(inP(P1, ["active"]).out, /active: alpha/, "the derived session is untouched");
});

await t("non-activated cwd keeps the legacy default pointer, separate from projects", () => {
  const plain = fresh("plain");
  assert.match(inP(plain, ["active"]).out, /no active engagement/);
  assert.equal(inP(plain, ["use", "--name", "alpha"]).code, 0);
  assert.ok(fs.existsSync(path.join(SHARED, STATE_ROOT_DIR, "active.json")));
  assert.match(inP(plain, ["active"]).out, /active: alpha/);
});

// ---- bootstrap runtime selection and idempotency ----

const bootCase = (runtimes, flag = []) => {
  const root = fresh("root"); initEngagement({ root, name: "x" });
  const p = runtimes ? project(runtimes) : fresh("plain");
  const r = run(WCLI, ["bootstrap", "--name", "x", ...flag], { cwd: p, env: { SA_ENGAGEMENT_ROOT: root } });
  assert.equal(r.code, 0, r.err);
  const has = (f) => fs.existsSync(path.join(root, "x", f));
  return { claude: has("CLAUDE.md"), agents: has("AGENTS.md"), root, p, out: r.out };
};
for (const [label, runtimes, flag, claude, agents] of [
  ["marker pi → AGENTS.md", ["pi"], [], false, true],
  ["marker antigravity → AGENTS.md", ["antigravity"], [], false, true],
  ["marker claude-code → CLAUDE.md", ["claude-code"], [], true, false],
  ["marker with several runtimes → both", ["claude-code", "pi"], [], true, true],
  ["no marker → CLAUDE.md (unchanged default)", null, [], true, false],
  ["--runtime agents beats a claude-code marker", ["claude-code"], ["--runtime", "agents"], false, true],
  ["--runtime claude beats a pi marker", ["pi"], ["--runtime", "claude"], true, false],
]) {
  await t(`bootstrap: ${label}`, () => {
    const c = bootCase(runtimes, flag);
    assert.equal(c.claude, claude, "CLAUDE.md"); assert.equal(c.agents, agents, "AGENTS.md");
  });
}

await t("bootstrap follows the marker from a project subdirectory too", () => {
  const root = fresh("root"); initEngagement({ root, name: "x" });
  const p = project(["antigravity"]); const sub = path.join(p, "src"); fs.mkdirSync(sub);
  assert.equal(run(WCLI, ["bootstrap", "--name", "x"], { cwd: sub, env: { SA_ENGAGEMENT_ROOT: root } }).code, 0);
  assert.ok(fs.existsSync(path.join(root, "x", "AGENTS.md")), "AGENTS.md expected");
  assert.ok(!fs.existsSync(path.join(root, "x", "CLAUDE.md")), "CLAUDE.md must not be created");
});

await t("bootstrap creates the nine numbered dirs and operational docs", () => {
  const { root } = bootCase(["pi"]);
  const dirs = fs.readdirSync(path.join(root, "x"), { withFileTypes: true }).filter((e) => e.isDirectory() && /^\d-/.test(e.name)).map((e) => e.name);
  assert.equal(dirs.length, 9, dirs.join(","));
  for (const f of ["session.md", "toDoList.md", "ccLog.md", "ccNotes.md", "ccFailed.md", "ccLeads.md", "ccGadgets.md", "ccSurface.md"]) assert.ok(fs.existsSync(path.join(root, "x", f)), f);
});

await t("bootstrap is idempotent: second run changes no byte and says so", () => {
  const { root, p } = bootCase(["pi"]); const dir = path.join(root, "x"); const log = path.join(dir, AUDIT_LOG);
  const snap = () => { const s = tree(dir); delete s[AUDIT_LOG]; return s; };
  const before = snap(), auditBefore = fs.readFileSync(log, "utf8");
  const r = run(WCLI, ["bootstrap", "--name", "x"], { cwd: p, env: { SA_ENGAGEMENT_ROOT: root } });
  assert.equal(r.code, 0); assert.match(r.out, /verified \(already complete\)/);
  assert.deepEqual(snap(), before);
  assert.ok(fs.readFileSync(log, "utf8").startsWith(auditBefore), "the audit log only appends"); // its own contract: every load is logged
});

await t("bootstrap: invalid runtime exits 2 and writes nothing (CLI and API)", () => {
  const root = fresh("root"); initEngagement({ root, name: "x" }); const before = tree(root);
  const r = run(WCLI, ["bootstrap", "--name", "x", "--runtime", "gemini"], { env: { SA_ENGAGEMENT_ROOT: root } });
  assert.equal(r.code, 2); assert.match(r.err, /bad-runtime/);
  assert.deepEqual(tree(root), before);
  assert.throws(() => bootstrapEngagement({ dir: path.join(root, "x"), name: "x" }, { runtime: "gemini" }), (e) => e instanceof WorkspaceError && e.code === "bad-runtime");
});

// ---- preflight scope states ----

const scopeCheck = (env, cwd) => {
  const r = run(PCLI, ["preflight", "--json", "--profile", "full-engagement"], { cwd, env });
  return JSON.parse(r.out).checks.find((c) => c.id === "scope");
};

await t("preflight scope: no root → missing", () => assert.equal(scopeCheck({}, fresh("plain")).status, "missing"));

await t("preflight scope: root but nothing selected → missing", () => {
  const root = fresh("root"); initEngagement({ root, name: "x" });
  assert.equal(scopeCheck({ SA_ENGAGEMENT_ROOT: root }, fresh("plain")).status, "missing");
});

await t("preflight scope: selected, scope.md absent → missing", () => {
  const root = fresh("root"); initEngagement({ root, name: "x" }); fs.rmSync(path.join(root, "x", "scope.md"), { force: true });
  assert.equal(scopeCheck({ SA_ENGAGEMENT_ROOT: root, SA_ENGAGEMENT: "x" }, fresh("plain")).status, "missing");
});

await t("preflight scope: selected, scope.md invalid → missing", () => {
  const root = fresh("root"); initEngagement({ root, name: "x" }); fs.writeFileSync(path.join(root, "x", "scope.md"), "no headings\n");
  assert.equal(scopeCheck({ SA_ENGAGEMENT_ROOT: root, SA_ENGAGEMENT: "x" }, fresh("plain")).status, "missing");
});

await t("preflight scope: selected, scope.md valid → ok", () => {
  const root = fresh("root"); initEngagement({ root, name: "x" }); fs.writeFileSync(path.join(root, "x", "scope.md"), SCOPE_OK);
  assert.equal(scopeCheck({ SA_ENGAGEMENT_ROOT: root, SA_ENGAGEMENT: "x" }, fresh("plain")).status, "ok");
});

await t("preflight sees the selection a project made through the derived session", () => {
  const root = fresh("root"); initEngagement({ root, name: "x" }); fs.writeFileSync(path.join(root, "x", "scope.md"), SCOPE_OK);
  const p = project(["pi"]);
  assert.equal(run(WCLI, ["use", "--name", "x"], { cwd: p, env: { SA_ENGAGEMENT_ROOT: root } }).code, 0);
  assert.equal(scopeCheck({ SA_ENGAGEMENT_ROOT: root }, p).status, "ok");
});

// ---- doctor ----

await t("doctor reports runtimes from PATH, not from harness files", () => {
  const bin = fresh("bin"); for (const b of ["pi", "agy"]) { fs.writeFileSync(path.join(bin, b), ""); fs.chmodSync(path.join(bin, b), 0o755); }
  const found = collectEnv({ env: { PATH: bin }, platform: "linux" });
  assert.equal(found.runtimes.pi, true); assert.equal(found.runtimes.antigravity, true); assert.equal(found.runtimes.claudeCode, false);
  const none = collectEnv({ env: { PATH: fresh("empty") }, platform: "linux" });
  assert.deepEqual(none.runtimes, { claudeCode: false, pi: false, antigravity: false });
  const hints = runDoctor(found).hints.join("\n");
  assert.match(hints, /\/skill:/); assert.match(hints, /agy/);
  assert.doesNotMatch(runDoctor(none).hints.join("\n"), /\/skill:/);
});

await t("doctor reports the cwd project's activation", () => {
  const p = project(["antigravity"]);
  const out = JSON.parse(run(PCLI, ["doctor", "--json"], { cwd: p }).out).facts.activation;
  assert.match(out, /declared: antigravity/); assert.match(out, /healthy: true/);
  assert.match(JSON.parse(run(PCLI, ["doctor", "--json"], { cwd: fresh("plain") }).out).facts.activation, /not an activated project/);
});

// ---- root inside the harness ----

await t("root inside the harness refused, engagements/ allowed (API)", () => {
  const refused = (r) => assert.throws(() => assertRootOutsideHarness(r), (e) => e.code === "root-inside-harness", r);
  refused(H); refused(path.join(H, "docs")); refused(path.join(H, "tools", "x")); refused(path.join(H, "engagements-evil"));
  assert.equal(assertRootOutsideHarness(path.join(H, "engagements")), path.join(H, "engagements"));
  assert.equal(assertRootOutsideHarness(path.join(H, "engagements", "sub")), path.join(H, "engagements", "sub"));
  const out = fresh("root"); assert.equal(assertRootOutsideHarness(out), out);
});

await t("root reached through an activated project's links is refused (CLI, env and --root)", () => {
  const p = project(["pi"]); const inside = path.join(p, "tools", "__nope__");
  const a = run(WCLI, ["init", "--name", "x"], { cwd: p, env: { SA_ENGAGEMENT_ROOT: inside } });
  assert.equal(a.code, 2); assert.match(a.err, /root-inside-harness/);
  const b = run(WCLI, ["init", "--name", "x", "--root", path.join(p, "references", "__nope__")], { cwd: p });
  assert.equal(b.code, 2); assert.match(b.err, /root-inside-harness/);
  assert.ok(!fs.existsSync(path.join(H, "tools", "__nope__")), "nothing written into the harness");
  assert.ok(!fs.existsSync(path.join(H, "references", "__nope__")), "nothing written into the harness");
});

// ---- adapter CLI exit codes ----

const adapter = (req) => new Promise((resolve) => {
  const child = execFile(process.execPath, req === null ? [ACLI] : [ACLI, req], { cwd: TMP, env: baseEnv(), encoding: "utf8" }, (err, stdout) => {
    resolve({ code: err ? err.code : 0, json: stdout ? JSON.parse(stdout) : null });
  });
  child.stdin.end();
});
await t("adapter CLI: no request 2, bad JSON 2, no op 2", async () => {
  assert.equal((await adapter(null)).code, 2);
  assert.equal((await adapter("{nope")).code, 2);
  assert.equal((await adapter("{}")).code, 2);
});
await t("adapter CLI: stateful op refused with 3", async () => {
  const r = await adapter(JSON.stringify({ op: "browser.navigate" }));
  assert.equal(r.code, 3); assert.equal(r.json.error.code, "stateful-op-unsupported-in-cli");
});
await t("adapter CLI: capabilities.list 0; http.* with no scope 2", async () => {
  assert.equal((await adapter(JSON.stringify({ op: "capabilities.list" }))).code, 0);
  assert.equal((await adapter(JSON.stringify({ op: "http.inspect", params: { url: "http://127.0.0.1:1/" } }))).code, 2);
});
const hits = [];
const lab = http.createServer((req, res) => { hits.push(req.url); res.writeHead(200, { "content-type": "text/plain" }); res.end("ok"); });
await new Promise((r) => lab.listen(0, "127.0.0.1", r));
const LAB = `http://127.0.0.1:${lab.address().port}`;
const LOCAL_SCOPE = { allowHosts: ["127.0.0.1"], allowPrivate: true };
await t("adapter CLI: in-scope http.inspect exits 0 and reaches the fixture", async () => {
  const r = await adapter(JSON.stringify({ op: "http.inspect", params: { url: `${LAB}/in` }, scope: LOCAL_SCOPE }));
  assert.equal(r.code, 0); assert.equal(r.json.ok, true); assert.ok(hits.includes("/in"));
});
await t("adapter CLI: out-of-scope http.inspect exits 1, ok=false, no request sent", async () => {
  const before = hits.length;
  const r = await adapter(JSON.stringify({ op: "http.inspect", params: { url: "http://lab.example.test/x" }, scope: LOCAL_SCOPE }));
  assert.equal(r.code, 1); assert.equal(r.json.ok, false); assert.match(JSON.stringify(r.json.error), /out of scope/);
  assert.equal(hits.length, before);
});
await new Promise((r) => lab.close(r));

// ---- modes ----

const modeFixture = () => { const root = fresh("root"); initEngagement({ root, name: "a" }); initEngagement({ root, name: "b" }); return root; };
const W = (root, args, env = {}, cwd = TMP) => run(WCLI, args, { cwd, env: { SA_ENGAGEMENT_ROOT: root, SA_SESSION_ID: "s", ...env } });
const M = (root, args, env = {}, cwd = TMP) => run(MCLI, args, { cwd, env: { SA_ENGAGEMENT_ROOT: root, SA_SESSION_ID: "s", ...env } });

await t("switching engagement returns to copilot; going back does not resurrect autopilot", () => {
  const root = modeFixture();
  W(root, ["use", "--name", "a"]); assert.equal(M(root, ["autopilot"]).code, 0);
  assert.match(M(root, ["status"]).out, /mode: autopilot/);
  assert.match(W(root, ["use", "--name", "b"]).out, /switched from 'a'/);
  assert.match(M(root, ["status"]).out, /mode: copilot/);
  assert.equal(M(root, ["autopilot"]).code, 0);
  W(root, ["use", "--name", "a"]);
  assert.match(M(root, ["status"]).out, /mode: copilot/);
});

await t("re-selecting the same engagement keeps the mode", () => {
  const root = modeFixture();
  W(root, ["use", "--name", "a"]); M(root, ["autopilot"]); W(root, ["use", "--name", "a"]);
  assert.match(M(root, ["status"]).out, /mode: autopilot/);
});

await t("a switch in one session leaves another session's mode alone", () => {
  const root = modeFixture();
  W(root, ["use", "--name", "b"], { SA_SESSION_ID: "other" }); M(root, ["autopilot"], { SA_SESSION_ID: "other" });
  W(root, ["use", "--name", "a"]); W(root, ["use", "--name", "b"]);
  assert.match(M(root, ["status"], { SA_SESSION_ID: "other" }).out, /mode: autopilot/);
  assert.match(M(root, ["status"]).out, /mode: copilot/);
});

await t("mode file key is sanitized like the pointer: a hostile session id stays confined", () => {
  const root = modeFixture(); const eng = { dir: path.join(root, "a"), name: "a" }; const sid = "../../../evil";
  setMode({ engagement: eng, sessionId: sid, mode: "autopilot" });
  assert.equal(getMode({ engagement: eng, sessionId: sid }).mode, "autopilot");
  assert.ok(!fs.existsSync(path.join(root, "evil.json")) && !fs.existsSync(path.join(root, "mode-evil.json")));
  assert.ok(fs.readdirSync(path.join(eng.dir, STATE_DIR)).some((f) => f.startsWith("mode-") && f.includes("evil")));
});

await t("mode state follows the derived session of an activated project across processes", () => {
  const root = modeFixture(); const p = project(["pi"]); const env = { SA_ENGAGEMENT_ROOT: root };
  assert.equal(run(WCLI, ["use", "--name", "a"], { cwd: p, env }).code, 0);
  assert.equal(run(MCLI, ["autopilot"], { cwd: p, env }).code, 0);
  const r = run(MCLI, ["status"], { cwd: p, env });
  assert.match(r.out, /mode: autopilot/); assert.match(r.out, /session\s+prj-[0-9a-f]{12}/);
});

// ---- --help never mutates ----

for (const args of [["--help"], ["-h"], ["autopilot", "--help"], ["autopilot", "-h"], ["clear", "--help"], ["copilot", "--help"]]) {
  await t(`modes help never changes the mode: ${args.join(" ")}`, () => {
    const root = modeFixture(); W(root, ["use", "--name", "a"]); M(root, ["autopilot"]); const before = tree(root);
    const r = M(root, args);
    assert.equal(r.code, 0, r.err); assert.match(r.out, /Usage:/);
    assert.deepEqual(tree(root), before);
  });
}

for (const args of [["--help"], ["-h"], ["init", "--name", "z", "--help"], ["init", "--name", "z", "-h"], ["use", "--name", "b", "--help"], ["use", "--name", "b", "-h"], ["clear", "--help"], ["clear", "-h"], ["bootstrap", "--name", "a", "--help"], ["bootstrap", "--name", "a", "-h"]]) {
  await t(`workspace help never runs a subcommand: ${args.join(" ")}`, () => {
    const root = modeFixture(); W(root, ["use", "--name", "a"]); const before = tree(root);
    const r = W(root, args);
    assert.equal(r.code, 0, r.err); assert.match(r.out, /cli\.mjs bootstrap/);
    assert.deepEqual(tree(root), before);
  });
}

// ---- select fragment ----

await t("select prints a context fragment shaped like SECAUDIT_BRIDGE_CONTEXTS, with no env refs", () => {
  const root = modeFixture(); W(root, ["use", "--name", "a"]);
  const r = W(root, ["select"]); assert.equal(r.code, 0, r.err);
  const line = r.out.split("\n").find((l) => l.trim().startsWith("{"));
  const frag = JSON.parse(line); const ctx = frag["eng:a"];
  assert.ok(ctx, "keyed by investigation id");
  assert.ok(Array.isArray(ctx.scope.allowHosts) && Array.isArray(ctx.allowedCapabilities) && Array.isArray(ctx.approvals));
  assert.equal(ctx.evidenceDir, path.join(root, "a", "evidence"));
  assert.doesNotMatch(line, /\$CAIDO/, "env refs are not expanded by the Bridge");
});

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }
console.log(`\n${n - fail}/${n} passed` + (fail ? ` (${fail} FAILED)` : ""));
process.exit(fail ? 1 : 0);
