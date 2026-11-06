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
  assert.equal(resolveSessionId({ cwd: fs.realpathSync(linked), env }), null, "every project's linked dir lands here: no session");
  assert.match(resolveSessionId({ cwd: H, env }), /^shared--prj-/, "the harness root binds the id to itself");
  assert.match(resolveSessionId({ cwd: path.join(H, "docs"), env }), /^shared--repo-/, "a harness subdir no project links to keeps its binding");
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
  const repoKey = resolveSessionId({ cwd: path.join(H, "docs"), env: { SA_SESSION_ID: "x" } }).split("--")[1];
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
t("SA_ENGAGEMENT conflicting with this project's selection: refused everywhere, and nothing is written", () => {
  const root = fresh("root-conflict"); for (const c of ["client-a", "client-b"]) initEngagement({ root, name: c });
  const p = project(), env = { SA_ENGAGEMENT: "client-b" };
  assert.equal(run(WCLI, ["use", "--name", "client-a"], p, {}, root).code, 0);
  for (const args of [["bootstrap"], ["next"], ["select"], ["show"]]) {
    const r = run(WCLI, args, p, env, root);
    assert.equal(r.code, 2, args[0]); assert.match(r.err, /SA_ENGAGEMENT=client-b conflicts with 'client-a'/, args[0]);
  }
  const rep = run(WCLI, ["active"], p, env, root); assert.equal(rep.code, 0, "active reports"); assert.match(rep.out, /no active engagement: SA_ENGAGEMENT=client-b conflicts with 'client-a'/);
  const m = run(MCLI, ["autopilot"], p, env, root);
  assert.equal(m.code, 2); assert.match(m.err, /conflicts/);
  assert.ok(!fs.existsSync(path.join(root, "client-b", "1-Reports")), "bootstrap must not write to client-b");
  assert.ok(!fs.existsSync(path.join(root, "client-b", ".hackbot")), "mode must not write to client-b");
  assert.match(run(MCLI, ["status"], p, env, root).out, /conflicts/);
  assert.match(run(WCLI, ["list"], p, env, root).out, /conflicts/);
  assert.doesNotMatch(run(WCLI, ["list"], p, env, root).out, /^ \*/m, "no engagement marked active");
});
t("SA_ENGAGEMENT conflict: --name and use settle it, and an agreeing export is silent", () => {
  const root = fresh("root-settle"); for (const c of ["client-a", "client-b"]) initEngagement({ root, name: c });
  const p = project(), env = { SA_ENGAGEMENT: "client-b" };
  assert.equal(run(WCLI, ["use", "--name", "client-a"], p, {}, root).code, 0);
  assert.equal(JSON.parse(run(WCLI, ["show", "--name", "client-a"], p, env, root).out).name, "client-a");
  const warned = run(WCLI, ["use", "--name", "client-a"], p, env, root);
  assert.equal(warned.code, 0); assert.match(warned.err, /commands will refuse until you unset it/);
  const u = run(WCLI, ["use", "--name", "client-b"], p, env, root);
  assert.equal(u.code, 0); assert.doesNotMatch(u.err, /refuse/);
  const a = run(WCLI, ["active"], p, env, root);
  assert.match(a.out, /active: client-b\s+\(via env\)/); assert.equal(a.err, "", "agreeing export needs no note");
});
// A leftover export in a bound context used to create files in another client's engagement, with only a note on stderr.
t("SA_ENGAGEMENT in a bound context with no selection selects nothing: acting commands refuse and write nothing, reporting commands report", () => {
  const root = fresh("root-bound"); initEngagement({ root, name: "client-c" });
  const p = project(), bad = fresh("bad-marker"); fs.writeFileSync(path.join(bad, MARKER), "{ nope");
  const sub = path.join(p, "src", "deep"); fs.mkdirSync(sub, { recursive: true });
  const linkMarker = fresh("link-marker"); fs.symlinkSync(path.join(TMP, "absent-target"), path.join(linkMarker, MARKER));
  for (const cwd of [p, sub, bad, linkMarker, path.join(p, "tools")]) {
    const env = { SA_ENGAGEMENT: "client-c" };
    for (const args of [["bootstrap"], ["next"], ["select"], ["show"]]) {
      const r = run(WCLI, args, cwd, env, root); assert.equal(r.code, 2, `${args[0]} in ${cwd}`); assert.match(r.err, /selects nothing here/, args[0]); assert.match(r.err, /use --name client-c/, args[0]);
    }
    assert.equal(run(MCLI, ["autopilot"], cwd, env, root).code, 2, cwd);
    assert.ok(!fs.existsSync(path.join(root, "client-c", "1-Reports")), cwd); assert.ok(!fs.existsSync(path.join(root, "client-c", ".hackbot")), cwd);
    for (const [bin, args] of [[WCLI, ["active"]], [WCLI, ["list"]], [MCLI, ["status"]], [PCLI, ["doctor"]]]) {
      const r = run(bin, args, cwd, env, root); assert.equal(r.code, 0, `${args[0]} in ${cwd}: ${r.err}`); assert.match(r.out, /selects nothing here/, args[0]); assert.doesNotMatch(r.all ?? r.out, /at file:/);
    }
    assert.equal(run(PCLI, ["preflight", "--profile", "caido-native"], cwd, env, root).code, 2, cwd);
  }
  // Physically at the harness, but arrived from the project (<project>/tools/..): still the project's context, not the harness's.
  assert.equal(run(WCLI, ["show"], H, { SA_ENGAGEMENT: "client-c", PWD: p }, root).code, 2);
  // In a project, the two ways that are explicit keep working.
  assert.equal(JSON.parse(run(WCLI, ["show", "--name", "client-c"], p, { SA_ENGAGEMENT: "client-c" }, root).out).name, "client-c");
  assert.equal(run(WCLI, ["use", "--name", "client-c"], p, { SA_ENGAGEMENT: "client-c" }, root).code, 0);
  assert.match(run(WCLI, ["active"], p, { SA_ENGAGEMENT: "client-c" }, root).out, /active: client-c/);
});
t("harness root: no project binds it, so SA_ENGAGEMENT still selects, with the note; a pointer there still wins the same way", () => {
  const root = fresh("root-harness"); for (const c of ["client-c", "client-d"]) initEngagement({ root, name: c });
  const a = run(WCLI, ["active"], H, { SA_ENGAGEMENT: "client-c" }, root); assert.equal(a.code, 0); assert.match(a.out, /active: client-c/); assert.match(a.err, /comes from SA_ENGAGEMENT/);
  assert.equal(run(WCLI, ["use", "--name", "client-d"], H, {}, root).code, 0);
  assert.equal(run(WCLI, ["show"], H, { SA_ENGAGEMENT: "client-c" }, root).code, 2);
});
t("SA_ENGAGEMENT with no selection in a plain directory still works, and says where it came from", () => {
  const root = fresh("root-note"); initEngagement({ root, name: "client-c" });
  for (const cwd of [fresh("plain")]) {
    const a = run(WCLI, ["active"], cwd, { SA_ENGAGEMENT: "client-c" }, root);
    assert.equal(a.code, 0); assert.match(a.out, /via env/); assert.match(a.err, /comes from SA_ENGAGEMENT/);
    const s = run(WCLI, ["show"], cwd, { SA_ENGAGEMENT: "client-c" }, root);
    assert.equal(JSON.parse(s.out).name, "client-c", "stdout stays parseable"); assert.match(s.err, /comes from SA_ENGAGEMENT/);
  }
});
t("SA_ENGAGEMENT conflict: a stale or broken pointer is one, no fall-through; the same engagement by another spelling isn't", () => {
  const root = fresh("root-stale"); for (const c of ["gone", "client-a"]) initEngagement({ root, name: c });
  const p = project();
  assert.equal(run(WCLI, ["use", "--name", "gone"], p, {}, root).code, 0);
  fs.renameSync(path.join(root, "gone"), path.join(TMP, `gone-${++n}`));
  const env = { SA_ENGAGEMENT: "client-a" };
  assert.match(run(WCLI, ["active"], p, env, root).out, /no active engagement: .*'gone' no longer exists/);
  const b = run(WCLI, ["bootstrap"], p, env, root); assert.equal(b.code, 2); assert.match(b.err, /'gone' no longer exists/); assert.match(b.err, /use --name client-a/);
  assert.ok(!fs.existsSync(path.join(root, "client-a", "1-Reports")));
  assert.equal(run(MCLI, ["autopilot"], p, env, root).code, 2);
  // Stale with explicit session in a plain directory too: the pointer is this session's selection, wherever the command runs.
  const plain = fresh("plain"), se = { SA_SESSION_ID: "auto-1" };
  assert.equal(run(WCLI, ["use", "--name", "gone-too"], plain, se, root).code !== 0, true);
  initEngagement({ root, name: "gone-too" }); assert.equal(run(WCLI, ["use", "--name", "gone-too"], plain, se, root).code, 0);
  fs.renameSync(path.join(root, "gone-too"), path.join(TMP, `gone-${++n}`));
  assert.equal(run(WCLI, ["show"], plain, { ...se, ...env }, root).code, 2);
  assert.equal(run(WCLI, ["use", "--name", "client-a"], p, {}, root).code, 0);
  assert.match(run(WCLI, ["active"], p, { SA_ENGAGEMENT: "CLIENT-A" }, root).out, /active: client-a/);
});
t("doctor and preflight report the conflict instead of an engagement", () => {
  const root = fresh("root-dr"); for (const c of ["client-a", "client-b"]) initEngagement({ root, name: c });
  const p = project(); assert.equal(run(WCLI, ["use", "--name", "client-a"], p, {}, root).code, 0);
  const d = run(PCLI, ["doctor"], p, { SA_ENGAGEMENT: "client-b" }, root);
  assert.equal(d.code, 0); assert.match(d.out, /conflicts with 'client-a'/); assert.doesNotMatch(d.out, /activeEngagement\s+client-/);
  const f = run(PCLI, ["preflight", "--profile", "caido-native"], p, { SA_ENGAGEMENT: "client-b" }, root);
  assert.equal(f.code, 2); assert.match(f.out, /conflicts with 'client-a'/); assert.doesNotMatch(f.out, /evidence dir.*client-b/);
});
t("SA_SESSION_ID: a selection made in a plain directory doesn't reach the harness root, which also gets the central .env", () => {
  const root = fresh("root-hs"); initEngagement({ root, name: "client-a" });
  const env = { SA_SESSION_ID: "same" };
  assert.equal(run(WCLI, ["use", "--name", "client-a"], fresh("plain"), env, root).code, 0);
  assert.match(run(WCLI, ["active"], H, env, root).out, /no active engagement/);
  assert.equal(run(WCLI, ["use", "--name", "client-a"], H, env, root).code, 0);
  assert.match(run(WCLI, ["active"], H, env, root).out, /active: client-a/, "at the root itself it still works across processes");
});
t("SA_SESSION_ID in the linked dirs of two projects, without a logical path: refused, so it can't cross", () => {
  const root = fresh("root-cross"); initEngagement({ root, name: "client-a" });
  const env = { SA_SESSION_ID: "shared" }, a = path.join(project(), "tools"), b = path.join(project(), "tools");
  const u = run(WCLI, ["use", "--name", "client-a"], a, env, root);
  assert.equal(u.code, 2); assert.match(u.err, /can't tell them apart/);
  assert.deepEqual(pointers(root), [], "no pointer written");
  assert.doesNotMatch(run(WCLI, ["active"], b, env, root).all, /client-a/);
  assert.equal(run(WCLI, ["use", "--name", "client-a"], a, { ...env, PWD: a }, root).code, 0, "with the shell's logical path it is the project");
  assert.match(run(WCLI, ["active"], a, { ...env, PWD: a }, root).out, /active: client-a/);
  assert.match(run(WCLI, ["active"], b, { ...env, PWD: b }, root).out, /no active engagement/);
});
t("cwd=<project>/tools/.. with the PWD inherited from the project: not the harness's context", () => {
  const root = fresh("root-up"); initEngagement({ root, name: "client-x" });
  assert.equal(run(WCLI, ["use", "--name", "client-x"], H, {}, root).code, 0);
  const p = project(), up = `${p}/tools/..`;
  assert.equal(fs.realpathSync.native(up), fs.realpathSync(H), "physically the harness root");
  const r = run(WCLI, ["active"], up, { PWD: p }, root);
  assert.equal(r.code, 2); assert.match(r.err, /physically at the harness root/); assert.doesNotMatch(r.all, /client-x/);
  assert.equal(resolveSessionId({ cwd: H, env: { PWD: p, SA_SESSION_ID: "s" } }), null, "an explicit id doesn't rescue it");
  assert.equal(resolveProjectContext({ cwd: H, env: { PWD: fresh("plain") } }).kind, "harness", "a stale PWD outside any project changes nothing");
  assert.equal(resolveProjectContext({ cwd: H, env: { PWD: H } }).kind, "harness");
  assert.match(run(WCLI, ["active"], up, {}, root).out, /active: client-x/, "declared limit: with PWD scrubbed it can't be told from the harness root");
});
t("a logical PWD through a planted link doesn't outrank where the process physically is", () => {
  const root = fresh("root-pwd"); for (const c of ["client-a", "client-b"]) initEngagement({ root, name: c });
  const pa = project(), pb = project();
  assert.equal(run(WCLI, ["use", "--name", "client-a"], pa, {}, root).code, 0);
  assert.equal(run(WCLI, ["use", "--name", "client-b"], pb, {}, root).code, 0);
  fs.mkdirSync(path.join(pb, "sub")); const l = path.join(pa, "lnk"); fs.symlinkSync(path.join(pb, "sub"), l);
  assert.match(run(WCLI, ["active"], l, { PWD: l }, root).out, /active: client-b/);
  const outside = fresh("outside"), o = path.join(pa, "shared"); fs.symlinkSync(outside, o);
  const r = run(WCLI, ["active"], o, { PWD: o }, root);
  assert.equal(r.code, 2); assert.doesNotMatch(r.all, /client-a/, "a link out to a plain directory has no project context");
  fs.mkdirSync(path.join(pa, "real")); const inner = path.join(pa, "inner"); fs.symlinkSync(path.join(pa, "real"), inner);
  assert.match(run(WCLI, ["active"], inner, { PWD: inner }, root).out, /active: client-a/, "a link inside the project is still the project");
  const via = path.join(fresh("alias"), "proj"); fs.symlinkSync(pa, via);
  assert.match(run(WCLI, ["active"], via, { PWD: via }, root).out, /active: client-a/, "a project reached through a link is the same project");
  assert.equal(resolveSessionId({ cwd: via, env: { PWD: via } }), resolveSessionId({ cwd: pa, env: {} }), "keyed by real path");
});
t("invalid identifiers: unusable names stop with a message, and none escapes the root", () => {
  const root = fresh("root-ids"); initEngagement({ root, name: "client-a" });
  const p = project();
  for (const bad of ["...", "///", "..\\.."]) {
    const r = run(WCLI, ["use", "--name", bad], p, {}, root);
    assert.equal(r.code, 2, bad); assert.doesNotMatch(r.err, /at file:|TypeError/, bad);
  }
  assert.deepEqual(pointers(root), []);
  fs.writeFileSync(path.join(path.dirname(root), "outside-marker"), "x");
  for (const name of ["../outside", "../../etc", "/etc/passwd"]) assert.equal(run(WCLI, ["use", "--name", name], p, {}, root).code, 2, name);
  const s = run(WCLI, ["active"], fresh("plain"), { SA_SESSION_ID: "///" }, root);
  assert.equal(s.code, 2); assert.match(s.err, /SA_SESSION_ID has no usable characters/);
  assert.match(run(WCLI, ["active"], fresh("plain"), { SA_ENGAGEMENT: "../../etc" }, root).out, /UNRESOLVED/);
  assert.match(run(WCLI, ["active"], p, { SA_ENGAGEMENT: "../../etc" }, root).out, /selects nothing here/);
});
t("control and bidi characters in SA_ENGAGEMENT never reach the output", () => {
  const root = fresh("root-ctl"); initEngagement({ root, name: "client-a" }); const nasty = "x\u001b[31mRED\u0007\nactive: client-a\u202e";
  const CTL = /[\u0000-\u0009\u000b-\u001f\u007f\u202a-\u202e]/;
  const p = project(), sel = project(); assert.equal(run(WCLI, ["use", "--name", "client-a"], sel, {}, root).code, 0);
  for (const cwd of [fresh("plain"), p, sel]) for (const [bin, args] of [[WCLI, ["active"]], [WCLI, ["list"]], [WCLI, ["show"]], [WCLI, ["bootstrap"]], [WCLI, ["use", "--name", "client-a"]], [MCLI, ["status"]], [MCLI, ["autopilot"]], [PCLI, ["doctor"]]]) {
    const r = run(bin, args, cwd, { SA_ENGAGEMENT: nasty }, root), all = r.out + r.err;
    assert.doesNotMatch(all, CTL, `${args[0]} in ${cwd}`); assert.doesNotMatch(all, /^active: client-a\ufffd/m, "no forged line");
    assert.equal(all.split("\n").filter((l) => /^active: client-a/.test(l) && !l.includes("via")).length, 0, args[0]);
  }
  assert.match(run(WCLI, ["active"], sel, {}, root).out, /active: client-a/);
});
t("identity is the directory, not the manifest's name: a copied folder selects and acts on itself", () => {
  const root = fresh("root-copy"); initEngagement({ root, name: "client-a" }); fs.cpSync(path.join(root, "client-a"), path.join(root, "client-copy"), { recursive: true });
  const p = project(), plain = fresh("plain");
  assert.match(run(WCLI, ["use", "--name", "client-copy"], p, {}, root).out, /active engagement set: client-copy/);
  assert.equal(JSON.parse(run(WCLI, ["show"], p, {}, root).out).dir, path.join(root, "client-copy"));
  assert.match(run(WCLI, ["active"], p, {}, root).out, /active: client-copy/);
  assert.equal(run(MCLI, ["autopilot"], p, {}, root).code, 0);
  assert.ok(!fs.existsSync(path.join(root, "client-a", ".hackbot")), "the original is untouched");
  assert.equal(JSON.parse(run(WCLI, ["show"], plain, { SA_ENGAGEMENT: "client-copy" }, root).out).dir, path.join(root, "client-copy"));
  const marks = run(WCLI, ["list"], p, {}, root).out.split("\n").filter((l) => /^ \*/.test(l)); assert.equal(marks.length, 1); assert.match(marks[0], /client-copy/);
});
t("a manifest name with control characters never reaches the output", () => {
  const root = fresh("root-mctl"); initEngagement({ root, name: "client-a" }); const f = path.join(root, "client-a", ".engagement.json");
  fs.writeFileSync(f, JSON.stringify({ ...JSON.parse(fs.readFileSync(f, "utf8")), name: "x\u001b[31m\nactive: forged" }));
  const p = project(), BAD = /[\u0000-\u0009\u000b-\u001f]|^active: forged/m;
  const u = run(WCLI, ["use", "--name", "client-a"], p, {}, root); assert.doesNotMatch(u.out + u.err, BAD);
  for (const args of [["active"], ["list"]]) assert.doesNotMatch(run(WCLI, args, p, {}, root).out, BAD, args[0]);
  assert.match(run(WCLI, ["active"], p, {}, root).out, /active: client-a/);
  assert.doesNotMatch(run(WCLI, ["active"], fresh("plain"), { SA_ENGAGEMENT: "client-a" }, root).out, BAD);
});
t("manifest fields can't forge list, use, select, show or status lines", () => {
  const root = fresh("root-mf"); initEngagement({ root, name: "client-a" }); const f = path.join(root, "client-a", ".engagement.json"), BAD = /[\u0000-\u0009\u000b-\u001f]|^forged line/m, evil = "p\u001b[31m\nforged line";
  fs.writeFileSync(f, JSON.stringify({ ...JSON.parse(fs.readFileSync(f, "utf8")), modality: evil, caido: { projectId: evil, projectName: evil } }));
  const p = project(); const u = run(WCLI, ["use", "--name", "client-a"], p, {}, root); assert.equal(u.code, 0); assert.doesNotMatch(u.out, BAD);
  for (const [bin, args] of [[WCLI, ["list"]], [WCLI, ["select"]], [WCLI, ["bootstrap"]], [MCLI, ["status"]], [PCLI, ["doctor"]]]) { const r = run(bin, args, p, {}, root); assert.doesNotMatch(r.out, BAD, args[0]); }
  const pf = run(PCLI, ["preflight", "--profile", "caido-native"], p, {}, root); assert.doesNotMatch(pf.out, BAD, "preflight");
});
t("die cleans the whole message at the CLI: no control characters, no forged line", () => {
  const nasty = "x\u001b[31m\nerror: forged", BAD = /[\u0000-\u0009\u000b-\u001f]|^error: forged/m, root = fresh("root-die"); initEngagement({ root, name: "client-a" });
  const w = run(WCLI, ["use", "--name", nasty], project(), {}, root); assert.equal(w.code, 2); assert.doesNotMatch(w.err, BAD);
  const r2 = path.join(TMP, `root-x\u001b[31m\nerror: forged-${++n}`); fs.mkdirSync(r2);
  const m = run(MCLI, ["autopilot"], fresh("plain"), { SA_ENGAGEMENT: "ghost" }, r2); assert.notEqual(m.code, 0); assert.match(m.err, /error:/); assert.doesNotMatch(m.err, BAD);
});
t("mode status with SA_ENGAGEMENT as the selection says so, in current terms", () => {
  const root = fresh("root-word"); initEngagement({ root, name: "client-a" });
  const r = run(MCLI, ["status"], fresh("plain"), { SA_ENGAGEMENT: "client-a" }, root); assert.match(r.out, /session\s+\(none: selected by SA_ENGAGEMENT\)/); assert.doesNotMatch(r.out, /override/);
});
t("a nested repository in an activated project: an export selects nothing and writes nothing; --name stays; no selection is inherited", () => {
  const root = fresh("root-nest"); initEngagement({ root, name: "client-c" });
  const p = project(), nested = path.join(p, "vendor", "repo"), deep = path.join(nested, "src"); fs.mkdirSync(deep, { recursive: true }); fs.mkdirSync(path.join(nested, ".git"));
  assert.equal(run(WCLI, ["use", "--name", "client-c"], p, {}, root).code, 0, "the parent's selection doesn't change this");
  const env = { SA_ENGAGEMENT: "client-c" };
  for (const cwd of [nested, deep]) {
    assert.equal(resolveProjectContext({ cwd, env: {} }).kind, "none");
    const b = run(WCLI, ["bootstrap"], cwd, env, root); assert.equal(b.code, 2); assert.match(b.err, /selects nothing here/);
    assert.equal(run(MCLI, ["autopilot"], cwd, env, root).code, 2);
    assert.match(run(WCLI, ["active"], cwd, env, root).out, /no active engagement: .*selects nothing here/);
  }
  assert.ok(!fs.existsSync(path.join(root, "client-c", "1-Reports"))); assert.ok(!fs.existsSync(path.join(root, "client-c", ".hackbot")));
  assert.equal(JSON.parse(run(WCLI, ["show", "--name", "client-c"], nested, env, root).out).name, "client-c");
  const alone = fresh("repo"); fs.mkdirSync(path.join(alone, ".git"));
  assert.match(run(WCLI, ["active"], alone, env, root).out, /active: client-c/, "a repository outside any project keeps automation");
});
t("malformed state: a manifest or pointer of the wrong type gives no selection and no raw error", () => {
  const root = fresh("root-mal"); initEngagement({ root, name: "client-a" });
  for (const [name, text] of [["nul", "null"], ["list", "[]"], ["num", "5"]]) {
    fs.mkdirSync(path.join(root, name)); fs.writeFileSync(path.join(root, name, ".engagement.json"), text);
    const r = run(WCLI, ["use", "--name", name], project(), {}, root);
    assert.equal(r.code, 2, name); assert.match(r.err, /bad-manifest/, name); assert.doesNotMatch(r.err, /Cannot read/, name);
  }
  const p = project(), key = resolveSessionId({ cwd: p, env: {} });
  fs.mkdirSync(path.join(root, STATE_ROOT_DIR), { recursive: true });
  for (const text of ["null", "[]", '{"name":5}', "{ nope", '{"name":"../client-a/../nope"}']) {
    fs.writeFileSync(path.join(root, STATE_ROOT_DIR, `active-${key}.json`), text);
    const r = run(WCLI, ["active"], p, {}, root);
    assert.equal(r.code, 0, text); assert.match(r.out, /no active engagement/, text);
  }
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
