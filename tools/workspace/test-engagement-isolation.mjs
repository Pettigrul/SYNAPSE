#!/usr/bin/env node
// SecurityAuditor — engagement isolation between projects and clients (deterministic, offline, no LLM, no offensive ops).
// A selection is bound to where it runs: activated project, central harness, or an explicit SA_SESSION_ID. Without
// that context nothing is selected and nothing is written. Synthetic temp dirs only; never reads the real .env.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { initEngagement, resolveSessionId, resolveProjectContext, setActiveEngagement, clearActiveEngagement, getActiveEngagement, STATE_ROOT_DIR, WorkspaceError } from "./engagement.mjs";
import { activate, MARKER } from "../activation/activate.mjs";

const H = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const WCLI = path.join(H, "tools", "workspace", "cli.mjs"), MCLI = path.join(H, "tools", "modes", "cli.mjs"), PCLI = path.join(H, "tools", "preflight", "cli.mjs");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "sa-isolation-"));
let n = 0; const fresh = (l) => { const d = path.join(TMP, `${l}-${++n}`); fs.mkdirSync(d, { recursive: true }); return d; };
const project = (rt = ["pi"]) => { const p = fresh("prj"); activate({ projectDir: p, home: H, runtimes: rt }); return p; };

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log(`  ok  ${name}`); } catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); } };

const ROOT = fresh("root");
for (const c of ["client-a", "client-b", "client-c"]) initEngagement({ root: ROOT, name: c });
function run(cli, args, cwd, env = {}, root = ROOT) {
  const r = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8", env: { PATH: process.env.PATH, HOME: TMP, SA_SKIP_ENV_FILE: "1", SA_ENGAGEMENT_ROOT: root, ...env } });
  return { code: r.status, out: r.stdout || "", err: r.stderr || "", all: (r.stdout || "") + (r.stderr || "") };
}
const pointers = (root = ROOT) => { try { return fs.readdirSync(path.join(root, STATE_ROOT_DIR)).sort(); } catch { return []; } };

console.log("Engagement isolation\n");

// ---- projeto ativado ----
const PA = project(), PB = project(["antigravity"]);
t("activated project: selection works and stays in that project", () => {
  assert.equal(run(WCLI, ["use", "--name", "client-a"], PA).code, 0);
  assert.match(run(WCLI, ["active"], PA).out, /active: client-a/);
  assert.equal(run(WCLI, ["use", "--name", "client-b"], PB).code, 0);
  assert.match(run(WCLI, ["active"], PB).out, /active: client-b/);
  assert.match(run(WCLI, ["active"], PA).out, /active: client-a/);
});
t("activated project: a subdirectory resolves to the same project", () => {
  const sub = path.join(PA, "deep", "er"); fs.mkdirSync(sub, { recursive: true });
  assert.match(run(WCLI, ["active"], sub).out, /active: client-a/);
});
t("nested project: the nearest marker wins, never the parent's selection", () => {
  const inner = path.join(PA, "vendor", "other-client"); fs.mkdirSync(inner, { recursive: true });
  activate({ projectDir: inner, home: H, runtimes: ["pi"] });
  assert.match(run(WCLI, ["active"], inner).out, /no active engagement/);
  assert.equal(run(WCLI, ["use", "--name", "client-c"], inner).code, 0);
  assert.match(run(WCLI, ["active"], PA).out, /active: client-a/);
});

// ---- projeto não ativado ----
t("non-activated dir sees no selection, even with other projects selected on the root", () => {
  const plain = fresh("plain");
  const r = run(WCLI, ["active"], plain);
  assert.equal(r.code, 2); assert.match(r.err, /no unambiguous project context/);
  assert.doesNotMatch(r.all, /client-a|client-b/, "must not name another client's engagement");
});
t("non-activated dir: use and clear refuse and write nothing", () => {
  const root = fresh("root-w"); initEngagement({ root, name: "client-a" });
  const plain = fresh("plain");
  for (const args of [["use", "--name", "client-a"], ["clear"], ["use"]]) {
    const r = run(WCLI, args, plain, {}, root);
    assert.equal(r.code, 2, args.join(" ")); assert.match(r.err, /no unambiguous project context/);
  }
  assert.deepEqual(pointers(root), [], "no pointer written");
});
t("non-activated dir: commands needing the active engagement refuse, without listing other clients", () => {
  const plain = fresh("plain");
  for (const c of ["next", "bootstrap", "show", "select"]) {
    const r = run(WCLI, [c], plain);
    assert.equal(r.code, 2, c); assert.match(r.err, /no unambiguous project context/, c);
    assert.doesNotMatch(r.all, /client-[abc]/, c);
  }
});
t("non-activated dir: mode can't be set and status says why", () => {
  const plain = fresh("plain");
  assert.equal(run(MCLI, ["autopilot"], plain).code, 2);
  assert.match(run(MCLI, ["status"], plain).out, /no unambiguous project context/);
});
t("a legacy default pointer (active.json) is ignored and left in place", () => {
  const root = fresh("root-l"); initEngagement({ root, name: "client-a" });
  fs.mkdirSync(path.join(root, STATE_ROOT_DIR));
  const legacy = path.join(root, STATE_ROOT_DIR, "active.json");
  fs.writeFileSync(legacy, JSON.stringify({ name: "client-a" }));
  const plain = fresh("plain");
  assert.equal(run(WCLI, ["active"], plain, {}, root).code, 2);
  assert.match(run(WCLI, ["active"], project(), {}, root).out, /no active engagement/);
  assert.equal(run(WCLI, ["clear"], plain, {}, root).code, 2);
  assert.ok(fs.existsSync(legacy));
});
t("a corrupt marker fails closed: never walks up to a parent project's selection", () => {
  const inner = path.join(PA, "broken"); fs.mkdirSync(inner, { recursive: true });
  fs.writeFileSync(path.join(inner, MARKER), "{ not json");
  assert.equal(resolveProjectContext({ cwd: inner, env: {} }).kind, "invalid-marker");
  assert.equal(resolveSessionId({ cwd: inner, env: {} }), null);
  const r = run(WCLI, ["active"], inner);
  assert.equal(r.code, 2); assert.match(r.err, /marker .*unreadable/);
});
t("doctor and preflight run without context and report no selection", () => {
  const plain = fresh("plain");
  const pf = run(PCLI, ["preflight"], plain);
  assert.ok([0, 1, 2].includes(pf.code)); assert.doesNotMatch(pf.out, /client-[abc]/);
  const d = run(PCLI, ["doctor"], plain);
  assert.equal(d.code, 0); assert.match(d.out, /sessionContext\s+none; session \(none\)/);
  assert.doesNotMatch(d.out, /activeEngagement\s+client-/);
  assert.match(d.out, /No project context here/);
});

// ---- harness central ----
t("an unusable SA_SESSION_ID: doctor and preflight report no selection instead of crashing", () => {
  for (const c of [["doctor"], ["preflight"]]) {
    const r = run(PCLI, c, fresh("plain"), { SA_SESSION_ID: "///" });
    assert.ok([0, 1, 2].includes(r.code), c[0]); assert.doesNotMatch(r.err, /at file:|WorkspaceError/, c[0]);
  }
});
t("a very long SA_SESSION_ID still selects: it names a file, so it is bounded and stays distinct", () => {
  const root = fresh("root-long"); initEngagement({ root, name: "client-a" });
  const env = { SA_SESSION_ID: "x".repeat(400) }, plain = fresh("plain");
  assert.equal(run(WCLI, ["use", "--name", "client-a"], plain, env, root).code, 0);
  assert.match(run(WCLI, ["active"], plain, env, root).out, /active: client-a/);
  assert.match(run(WCLI, ["active"], plain, { SA_SESSION_ID: "x".repeat(399) }, root).out, /no active engagement/);
});
t("explicit SA_SESSION_ID under a corrupt marker stays bound to that directory", () => {
  const d = fresh("bad"); fs.writeFileSync(path.join(d, MARKER), "{ not json");
  assert.match(resolveSessionId({ cwd: d, env: { SA_SESSION_ID: "s" } }), /^s--prj-/);
});
t("process started inside a project's linked dir, without a logical PWD: fails closed, never the harness's selection", () => {
  const root = fresh("root-link"); for (const c of ["client-a", "client-x"]) initEngagement({ root, name: c });
  const p = project();
  assert.equal(run(WCLI, ["use", "--name", "client-a"], p, {}, root).code, 0);
  assert.equal(run(WCLI, ["use", "--name", "client-x"], H, {}, root).code, 0);
  const linked = path.join(p, "tools");
  // spawn resolves cwd physically into the harness, and no PWD is passed, as with a runtime's workdir parameter
  const a = run(WCLI, ["active"], linked, {}, root);
  assert.equal(a.code, 2, a.all); assert.doesNotMatch(a.all, /client-x/);
  assert.equal(run(MCLI, ["autopilot"], linked, {}, root).code, 2);
  assert.equal(run(WCLI, ["use", "--name", "client-a"], linked, {}, root).code, 2);
  assert.equal(run(WCLI, ["bootstrap"], linked, {}, root).code, 2);
  assert.ok(!fs.existsSync(path.join(root, "client-x", "1-Reports")), "bootstrap must not touch the harness's selection");
  assert.match(run(WCLI, ["active"], H, {}, root).out, /active: client-x/, "the harness pointer is unchanged");
  // with the shell's logical PWD (cd tools), the project is still found
  assert.match(run(WCLI, ["active"], linked, { PWD: linked }, root).out, /active: client-a/);
});
t("a nested repository inside an activated project doesn't inherit its selection", () => {
  const repo = path.join(PA, "client-b-repo", "src"); fs.mkdirSync(repo, { recursive: true }); fs.mkdirSync(path.join(PA, "client-b-repo", ".git"));
  assert.equal(resolveProjectContext({ cwd: repo, env: {} }).kind, "none");
  const r = run(WCLI, ["active"], repo);
  assert.equal(r.code, 2); assert.doesNotMatch(r.all, /client-a/);
});
t("explicit SA_SESSION_ID in a nested repository stays bound to that repository", () => {
  const root = fresh("root-repo"); initEngagement({ root, name: "client-x" });
  const env = { SA_SESSION_ID: "shared" }, plain = fresh("plain");
  assert.equal(run(WCLI, ["use", "--name", "client-x"], plain, env, root).code, 0);
  const nested = path.join(project(), "evil"); fs.mkdirSync(path.join(nested, ".git"), { recursive: true });
  assert.doesNotMatch(run(WCLI, ["active"], nested, env, root).out, /client-x/);
  assert.match(resolveSessionId({ cwd: nested, env }), /^shared--repo-/);
  const other = fresh("other"); fs.mkdirSync(path.join(other, ".git"));
  assert.notEqual(resolveSessionId({ cwd: other, env }), resolveSessionId({ cwd: nested, env }));
  assert.equal(resolveSessionId({ cwd: plain, env }), "shared", "a plain directory keeps the automation id");
});
t("explicit SA_SESSION_ID in a project's linked dir (physically a harness subdir) doesn't reach another place's selection", () => {
  const root = fresh("root-sub"); initEngagement({ root, name: "client-x" });
  const env = { SA_SESSION_ID: "shared" }, plain = fresh("plain");
  assert.equal(run(WCLI, ["use", "--name", "client-x"], plain, env, root).code, 0);
  const linked = path.join(project(), "tools");
  assert.doesNotMatch(run(WCLI, ["active"], linked, env, root).out, /client-x/);
  assert.match(resolveSessionId({ cwd: fs.realpathSync(linked), env }), /^shared--repo-/);
  assert.equal(resolveSessionId({ cwd: H, env }), "shared", "the harness root itself keeps the plain id");
});
t("a malformed marker fails closed, with no crash", () => {
  for (const bad of [{ hackbotHome: "/x", links: [1, {}] }, { hackbotHome: "/x", links: 1 }, { hackbotHome: "/x", links: {} }, { hackbotHome: 1, links: [] }]) {
    const d = fresh("bad-links"); fs.writeFileSync(path.join(d, MARKER), JSON.stringify({ ...bad, caido: true }));
    assert.equal(resolveProjectContext({ cwd: d, env: {} }).kind, "invalid-marker", JSON.stringify(bad));
    for (const c of [["doctor"], ["preflight"]]) assert.doesNotMatch(run(PCLI, c, d).err, /at file:|TypeError/, `${c[0]} ${JSON.stringify(bad)}`);
  }
  const d = fresh("bad-runtimes"); fs.writeFileSync(path.join(d, MARKER), JSON.stringify({ hackbotHome: "/x", links: [], runtimes: 1 }));
  assert.doesNotMatch(run(PCLI, ["doctor"], d).err, /at file:|TypeError/, "runtimes");
});
t("an id shaped like a derived session can't read that project's pointer", () => {
  const p = project(), key = resolveSessionId({ cwd: p, env: {} }), plain = fresh("plain");
  assert.notEqual(resolveSessionId({ cwd: plain, env: { SA_SESSION_ID: key } }), key);
  assert.notEqual(resolveSessionId({ cwd: plain, env: { SA_SESSION_ID: `x--${key}` } }), `x--${key}`);
  const repoKey = resolveSessionId({ cwd: fs.realpathSync(path.join(p, "tools")), env: { SA_SESSION_ID: "x" } }).split("--")[1];
  assert.match(repoKey, /^repo-/);
  assert.notEqual(resolveSessionId({ cwd: plain, env: { SA_SESSION_ID: `x--${repoKey}` } }), `x--${repoKey}`);
});
t("a marker beside .git still counts: the activated project is itself a repository", () => {
  const p = project(); fs.mkdirSync(path.join(p, ".git"));
  assert.equal(resolveProjectContext({ cwd: p, env: {} }).kind, "project");
});
t("central harness has its own session, separate from every project", () => {
  const s = resolveSessionId({ cwd: H, env: {} });
  assert.match(s, /^prj-[0-9a-f]{12}$/);
  assert.notEqual(s, resolveSessionId({ cwd: PA, env: {} }));
  assert.equal(resolveSessionId({ cwd: path.join(H, "docs"), env: {} }), null, "only its root counts");
  const root = fresh("root-h"); initEngagement({ root, name: "client-a" });
  assert.equal(run(WCLI, ["use", "--name", "client-a"], H, {}, root).code, 0);
  assert.match(run(WCLI, ["active"], H, {}, root).out, /active: client-a/);
  assert.match(run(WCLI, ["active"], project(), {}, root).out, /no active engagement/);
});

// ---- seleção explícita ----
t("--name stays explicit outside a project, and writes only the named engagement", () => {
  const plain = fresh("plain");
  assert.equal(run(WCLI, ["show", "--name", "client-c"], plain).code, 0);
  assert.equal(run(WCLI, ["next", "--name", "client-c"], plain).code, 0);
});
t("SA_ENGAGEMENT override stays explicit outside a project", () => {
  const plain = fresh("plain");
  assert.match(run(WCLI, ["active"], plain, { SA_ENGAGEMENT: "client-c" }).out, /active: client-c\s+\(via env\)/);
});
t("SA_SESSION_ID outside a project: works across processes and isolates sessions", () => {
  const root = fresh("root-s"); initEngagement({ root, name: "client-a" });
  const plain = fresh("plain");
  assert.equal(run(WCLI, ["use", "--name", "client-a"], plain, { SA_SESSION_ID: "auto-1" }, root).code, 0);
  assert.match(run(WCLI, ["active"], fresh("plain"), { SA_SESSION_ID: "auto-1" }, root).out, /active: client-a/);
  assert.match(run(WCLI, ["active"], plain, { SA_SESSION_ID: "auto-2" }, root).out, /no active engagement/);
  assert.ok(pointers(root).includes("active-auto-1.json"));
});
t("SA_SESSION_ID is bound to the project: the same id cannot carry a selection across clients", () => {
  const a = project(), b = project(), env = { SA_SESSION_ID: "leaked" };
  assert.equal(run(WCLI, ["use", "--name", "client-a"], a, env).code, 0);
  assert.match(run(WCLI, ["active"], a, env).out, /active: client-a/);
  assert.match(run(WCLI, ["active"], b, env).out, /no active engagement/);
  assert.equal(run(WCLI, ["use", "--name", "client-b"], b, env).code, 0);
  assert.match(run(WCLI, ["active"], a, env).out, /active: client-a/, "b's selection must not overwrite a's");
});
t("SA_SESSION_ID: selection made outside a project does not leak into one", () => {
  const root = fresh("root-o"); initEngagement({ root, name: "client-a" });
  const env = { SA_SESSION_ID: "same" };
  assert.equal(run(WCLI, ["use", "--name", "client-a"], fresh("plain"), env, root).code, 0);
  assert.match(run(WCLI, ["active"], project(), env, root).out, /no active engagement/);
});
t("SA_SESSION_ID: ids differing only in case or symbols stay distinct", () => {
  const ids = ["Client/A", "client_a", "CLIENT_A", "client-a"].map((id) => resolveSessionId({ cwd: TMP, env: { SA_SESSION_ID: id } }));
  assert.equal(new Set(ids).size, ids.length, ids.join(" "));
});
t("SA_SESSION_ID that sanitizes to nothing fails instead of sharing a pointer", () => {
  assert.throws(() => resolveSessionId({ cwd: TMP, env: { SA_SESSION_ID: "///" } }), (e) => e instanceof WorkspaceError && e.code === "bad-name");
});

// ---- sessão inexistente ----
t("session with no pointer: no selection, no fallback to any other session", () => {
  const a = getActiveEngagement({ root: ROOT, env: {}, sessionId: "never-used" });
  assert.equal(a.name, null); assert.ok(!a.noContext);
});
t("stale pointer (engagement gone): no fallback to another engagement", () => {
  const root = fresh("root-g"); initEngagement({ root, name: "gone" }); initEngagement({ root, name: "client-a" });
  const p = project();
  assert.equal(run(WCLI, ["use", "--name", "gone"], p, {}, root).code, 0);
  fs.renameSync(path.join(root, "gone"), path.join(TMP, `gone-${++n}`));
  assert.match(run(WCLI, ["active"], p, {}, root).out, /no active engagement/);
});
t("use of a nonexistent engagement fails and changes no pointer", () => {
  const p = project();
  const before = pointers();
  const r = run(WCLI, ["use", "--name", "client"], p); // a prefix: never fuzzy
  assert.equal(r.code, 2); assert.match(r.err, /exact match required/);
  assert.deepEqual(pointers(), before);
});

// ---- múltiplos clientes, API ----
t("library: no session means no selection and refusal on write", () => {
  assert.deepEqual(getActiveEngagement({ root: ROOT, env: {} }), { name: null, source: null, dir: null, noContext: true });
  assert.throws(() => setActiveEngagement({ root: ROOT, name: "client-a" }), (e) => e.code === "no-session-context");
  assert.throws(() => clearActiveEngagement({ root: ROOT }), (e) => e.code === "no-session-context");
  assert.ok(!pointers().includes("active.json"));
});
t("multiple clients: three projects, three selections, modes independent", () => {
  const root = fresh("root-m"); const names = ["acme", "globex", "initech"];
  for (const c of names) initEngagement({ root, name: c });
  const ps = names.map(() => project());
  ps.forEach((p, i) => assert.equal(run(WCLI, ["use", "--name", names[i]], p, {}, root).code, 0));
  assert.equal(run(MCLI, ["autopilot"], ps[1], {}, root).code, 0);
  ps.forEach((p, i) => assert.match(run(WCLI, ["active"], p, {}, root).out, new RegExp(`active: ${names[i]}`)));
  assert.match(run(MCLI, ["status"], ps[0], {}, root).out, /mode: copilot/);
  assert.match(run(MCLI, ["status"], ps[1], {}, root).out, /mode: autopilot/);
  assert.equal(pointers(root).length, 3); assert.ok(!pointers(root).includes("active.json"));
});

console.log(`\nengagement isolation: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
