#!/usr/bin/env node
// SecurityAuditor — the activation marker is project-editable data (deterministic, offline, no LLM, no offensive ops).
// An invalid or forged marker can't make activate/deactivate act outside the project, each failure says how to get out, and the
// repair path removes only what activation created. Synthetic temp dirs only; never reads the real .env.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { activate, deactivate, statusActivation, readMarker, auditRuntimeConfig, hackbotHome, MARKER } from "./activate.mjs";

const H = hackbotHome();
const CLI = path.join(H, "tools", "activation", "cli.mjs"), PCLI = path.join(H, "tools", "preflight", "cli.mjs");
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sa-marker-")));
const FAKE_HOME = path.join(TMP, "_home"); fs.mkdirSync(FAKE_HOME);
let n = 0, fail = 0, seq = 0;
function t(name, fn) { n++; try { fn(); console.log(`  ok   ${name}`); } catch (e) { fail++; console.log(`  FAIL ${name}: ${e.message}`); } }
const mk = () => { const p = path.join(TMP, `p${++seq}`); fs.mkdirSync(p); return p; };
function cli(args, cwd = TMP, bin = CLI) {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", env: { PATH: process.env.PATH, HOME: FAKE_HOME, SA_SKIP_ENV_FILE: "1" } });
  return { code: r.status, out: r.stdout || "", err: r.stderr || "", all: (r.stdout || "") + (r.stderr || "") };
}
function tree(dir, base = dir, acc = {}) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name), rel = path.relative(base, abs);
    if (e.isSymbolicLink()) acc[rel] = `-> ${fs.readlinkSync(abs)}`;
    else if (e.isDirectory()) { acc[rel] = "dir"; tree(abs, base, acc); }
    else acc[rel] = createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
  }
  return acc;
}
const write = (p, m) => fs.writeFileSync(path.join(p, MARKER), typeof m === "string" ? m : JSON.stringify(m));
const RAW = /must be of type|not iterable|Cannot read|is not a function|Unexpected token|Expected property|at file:/;
const SECRET = "marker-content-sentinel";

const BAD = [
  ["not JSON", `{ ${SECRET}`], ["null", "null"], ["a list", "[]"], ["a number", "5"],
  ["home of the wrong type", { hackbotHome: 1, links: [] }], ["no home", { links: [] }], ["empty home", { hackbotHome: "", links: [] }],
  ["links of the wrong type", { hackbotHome: "/x", links: 1 }], ["links with a non-string", { hackbotHome: "/x", links: [1] }],
  ["links escaping", { hackbotHome: "/x", links: ["../x"] }], ["links absolute", { hackbotHome: "/x", links: ["/etc/passwd"] }],
  ["backups of the wrong type", { hackbotHome: "/x", links: [], backups: [] }], ["backups escaping", { hackbotHome: "/x", links: [], backups: { "../a": "b" } }],
  ["backups sourced outside", { hackbotHome: "/x", links: [], backups: { a: "../b" } }], ["createdDirs escaping", { hackbotHome: "/x", links: [], createdDirs: ["../.."] }],
];

console.log("Activation marker\n");

// ---- invalid markers ----

for (const [label, content] of BAD) {
  t(`invalid marker (${label}): status, activate and deactivate explain and change nothing`, () => {
    const p = mk(); write(p, content); const before = tree(p);
    assert.equal(readMarker(p).state, "invalid");
    const s = cli(["status", "--project", p]);
    assert.equal(s.code, 1); assert.match(s.out, /marker invalid/); assert.match(s.out, /--repair/);
    for (const c of ["activate", "deactivate"]) {
      const r = cli([c, "--project", p]);
      assert.equal(r.code, 2, c); assert.match(r.err, /invalid-marker/, c); assert.match(r.err, /--repair/, c);
      assert.doesNotMatch(r.all, RAW, c); assert.ok(!r.all.includes(SECRET), `${c} must not quote the file`);
    }
    assert.deepEqual(tree(p), before);
  });
}
t("a marker that can't be read (a directory in its place) is invalid, not absent", () => {
  const p = mk(); fs.mkdirSync(path.join(p, MARKER));
  assert.match(readMarker(p).reason, /not a regular file/);
  assert.equal(cli(["activate", "--project", p]).code, 2);
});
// The marker as a link: activate used to write through it, creating or overwriting a file outside the project.
const outsideDir = () => { const d = path.join(TMP, `out${++seq}`); fs.mkdirSync(d); return d; };
const okMarker = (extra = {}) => JSON.stringify({ hackbotHome: H, links: [], runtimes: [], ...extra });
t("a marker that is a dangling link: activate refuses and creates nothing outside", () => {
  const p = mk(), o = outsideDir(), target = path.join(o, "created.json"); fs.symlinkSync(target, path.join(p, MARKER));
  assert.deepEqual([readMarker(p).state, readMarker(p).link], ["invalid", true]);
  const r = cli(["activate", "--project", p]); assert.equal(r.code, 2); assert.match(r.err, /symbolic link/); assert.match(r.err, /--repair/);
  assert.deepEqual(fs.readdirSync(o), []); assert.equal(fs.lstatSync(path.join(p, MARKER)).isSymbolicLink(), true);
  assert.deepEqual(fs.readdirSync(p), [MARKER], "no link was created either");
});
for (const [label, content] of [["another valid marker", okMarker()], ["JSON shaped like a marker", JSON.stringify({ hackbotHome: "/x", links: [] })], ["anything else", SECRET]]) {
  t(`a marker linking to ${label} outside: never read as this project's, activate and deactivate refuse, the target is untouched`, () => {
    const p = mk(), o = outsideDir(), target = path.join(o, "victim.json"); fs.writeFileSync(target, content); fs.symlinkSync(target, path.join(p, MARKER));
    assert.equal(readMarker(p).marker, undefined);
    const s = statusActivation({ projectDir: p, home: H }); assert.equal(s.activated, false); assert.ok(!s.healthy); assert.doesNotMatch(JSON.stringify(s), new RegExp(SECRET));
    for (const args of [["activate", "--project", p], ["activate", "--project", p, "--force"], ["deactivate", "--project", p]]) {
      const r = cli(args); assert.equal(r.code, 2, args[0]); assert.match(r.err, /symbolic link/, args[0]); assert.doesNotMatch(r.all, new RegExp(SECRET));
    }
    assert.equal(fs.readFileSync(target, "utf8"), content); assert.equal(fs.lstatSync(path.join(p, MARKER)).isSymbolicLink(), true);
  });
}
t("repair removes a marker link without following it, then activate works and writes inside the project", () => {
  const p = mk(), o = outsideDir(), target = path.join(o, "victim.json"); fs.writeFileSync(target, SECRET); fs.symlinkSync(target, path.join(p, MARKER));
  const r = cli(["deactivate", "--project", p, "--repair"]); assert.equal(r.code, 0, r.err); assert.match(r.out, /removed the link, its target was not touched/);
  assert.equal(fs.readFileSync(target, "utf8"), SECRET); assert.deepEqual(fs.readdirSync(o), ["victim.json"]);
  assert.throws(() => fs.lstatSync(path.join(p, MARKER))); assert.throws(() => fs.lstatSync(path.join(p, `${MARKER}.invalid`)), "a link is not kept as a backup of the marker");
  assert.equal(cli(["activate", "--project", p]).code, 0); assert.equal(fs.lstatSync(path.join(p, MARKER)).isFile(), true); assert.equal(fs.readFileSync(target, "utf8"), SECRET);
});
t("repair of a dangling marker link: removed, and nothing appears at its target", () => {
  const p = mk(), o = outsideDir(); fs.symlinkSync(path.join(o, "nope"), path.join(p, MARKER));
  assert.equal(cli(["deactivate", "--project", p, "--repair"]).code, 0); assert.deepEqual(fs.readdirSync(o), []); assert.equal(readMarker(p).state, "absent");
});
t("repair with <marker>.invalid already a link outside: replaces the link, never writes through it", () => {
  const p = mk(), o = outsideDir(), target = path.join(o, "x"); fs.writeFileSync(target, SECRET); fs.symlinkSync(target, path.join(p, `${MARKER}.invalid`)); write(p, "{ nope");
  assert.equal(cli(["deactivate", "--project", p, "--repair"]).code, 0); assert.equal(fs.readFileSync(target, "utf8"), SECRET);
});
t("a marker hard-linked to an outside file: reactivating replaces the entry, the other file keeps its content", () => {
  const p = mk(), o = outsideDir(), target = path.join(o, "victim.json"), content = okMarker(); fs.writeFileSync(target, content); fs.linkSync(target, path.join(p, MARKER));
  assert.equal(cli(["activate", "--project", p]).code, 0); assert.equal(fs.readFileSync(target, "utf8"), content);
  assert.equal(fs.lstatSync(path.join(p, MARKER)).nlink, 1); assert.deepEqual(fs.readdirSync(p).filter((f) => f.includes(".tmp-")), [], "no temp left");
});
t("a FIFO as the marker is refused without hanging", () => {
  const p = mk(), m = spawnSync("mkfifo", [path.join(p, MARKER)]); if (m.status !== 0) return;
  assert.match(readMarker(p).reason, /not a regular file/);
});
t("a file planted at the marker's temp path: never written through, and repair gets out", () => {
  const p = mk(), o = outsideDir(), target = path.join(o, "created"), tmp = path.join(p, `${MARKER}.tmp-${process.pid}`); fs.symlinkSync(target, tmp);
  assert.throws(() => activate({ projectDir: p, home: H, runtimes: ["pi"] }), (e) => e.code === "marker-write" && /move it away/.test(e.message));
  assert.deepEqual(fs.readdirSync(o), []); assert.equal(fs.readlinkSync(tmp), target); assert.equal(readMarker(p).state, "absent");
  fs.unlinkSync(tmp); assert.equal(cli(["deactivate", "--project", p, "--repair"]).code, 0); assert.equal(cli(["activate", "--project", p]).code, 0);
});
// Marker fields printed raw let a repository draw its own status lines.
const CTL = /[\u0000-\u0009\u000b-\u001f\u007f\u202a-\u202e]/;
const FORGED = "x\u001b[31m\n  runtimes: pi  |  mcp: false  |  caido opt-in: true  |  healthy: true";
const noForgery = (out, label) => { assert.doesNotMatch(out, CTL, label); assert.equal(out.split("\n").filter((l) => /^ {2}runtimes: pi  \|/.test(l)).length, 0, label); };
t("status can't be forged from marker fields: home, runtimes and links are cleaned", () => {
  for (const m of [{ hackbotHome: `/${FORGED}`, links: [], runtimes: [] }, { hackbotHome: H, links: [], runtimes: [FORGED] }, { hackbotHome: H, links: [FORGED], runtimes: [] }]) {
    const p = mk(); write(p, m); assert.equal(readMarker(p).state, "ok", JSON.stringify(m));
    const r = cli(["status", "--project", p]); noForgery(r.all, "status"); assert.match(r.out, /caido opt-in: false/);
    noForgery(cli(["doctor"], p, PCLI).all, "doctor");
  }
});
t("deactivate prints a marker's backup names cleaned", () => {
  const p = mk(), bak = `b${FORGED.replace(/[\n/]/g, (x) => (x === "\n" ? "\n" : "_"))}`; fs.writeFileSync(path.join(p, bak), "mine"); fs.writeFileSync(path.join(p, "AGENTS.md"), "newer");
  write(p, { hackbotHome: H, links: [], runtimes: [], backups: { "AGENTS.md": bak } }); assert.equal(readMarker(p).state, "ok");
  const r = cli(["deactivate", "--project", p]); assert.equal(r.code, 0, r.err); assert.match(r.out, /kept/); noForgery(r.all, "deactivate");
});
t("a project path with control characters doesn't forge activate, status or error output", () => {
  const p = path.join(TMP, `q${++seq}\u001b[31m\nactivated: forged`); fs.mkdirSync(p);
  for (const args of [["activate", "--project", p], ["status", "--project", p], ["deactivate", "--project", p], ["activate", "--project", `${p}-absent`]]) {
    const r = cli(args); assert.doesNotMatch(r.all, CTL, args[0]); assert.doesNotMatch(r.all, /^activated: forged/m, args[0]); assert.doesNotMatch(r.err, /^activated: forged/m);
  }
});
// Same class on the other paths activation touches in the project.
t("a .hackbot-bak that is a dangling link to outside counts as taken: --force refuses, nothing is created or lost", () => {
  const p = mk(), o = outsideDir(); fs.writeFileSync(path.join(p, "AGENTS.md"), "mine"); fs.symlinkSync(path.join(o, "bak"), path.join(p, "AGENTS.md.hackbot-bak"));
  const r = cli(["activate", "--project", p, "--runtime", "pi", "--force"]); assert.equal(r.code, 2); assert.match(r.err, /hackbot-bak already exists/);
  assert.deepEqual(fs.readdirSync(o), []); assert.equal(fs.readFileSync(path.join(p, "AGENTS.md"), "utf8"), "mine");
});
for (const parent of [".claude", ".pi", ".agents"]) for (const dangling of [true, false]) {
  t(`${parent} as a ${dangling ? "dangling " : ""}link to outside: activate --force writes nothing through it`, () => {
    const p = mk(), o = outsideDir(), target = dangling ? path.join(o, "absent") : o; fs.symlinkSync(target, path.join(p, parent));
    const before = tree(o); assert.notEqual(cli(["activate", "--project", p, "--runtime", "pi,antigravity", "--force"]).code, 0); assert.deepEqual(tree(o), before);
    assert.equal(fs.lstatSync(path.join(p, parent)).isSymbolicLink(), true);
  });
}
t("--force over a symlink at a target, and a forged backup that is a link: the outside stays untouched through deactivate", () => {
  const p = mk(), o = outsideDir(); fs.writeFileSync(path.join(o, "keep"), SECRET); fs.symlinkSync(o, path.join(p, "AGENTS.md"));
  assert.equal(cli(["activate", "--project", p, "--runtime", "pi", "--force"]).code, 0); assert.equal(fs.lstatSync(path.join(p, "AGENTS.md.hackbot-bak")).isSymbolicLink(), true);
  assert.equal(cli(["deactivate", "--project", p]).code, 0); assert.equal(fs.readFileSync(path.join(o, "keep"), "utf8"), SECRET);
  assert.equal(fs.readlinkSync(path.join(p, "AGENTS.md")), o, "the operator's own link comes back as it was");
});
if (process.platform !== "win32" && process.getuid() !== 0) {
  t("a marker without read permission is invalid, with its code", () => {
    const p = mk(); write(p, "{}"); fs.chmodSync(path.join(p, MARKER), 0o000);
    assert.match(cli(["status", "--project", p]).out, /can't be read \(EACCES\)/);
    fs.chmodSync(path.join(p, MARKER), 0o600);
  });
  t("a project without write permission: a guiding message, no raw stack", () => {
    const p = mk(); fs.chmodSync(p, 0o555);
    const r = cli(["activate", "--project", p]);
    assert.notEqual(r.code, 0); assert.match(r.err, /permission denied \(EACCES\)/); assert.match(r.err, /fix its owner or mode/); assert.doesNotMatch(r.err, /at file:/);
    fs.chmodSync(p, 0o755);
  });
}
t("runtimes of the wrong type are ignored, not fatal", () => {
  for (const runtimes of [1, "pi", {}, [1, null], ["__proto__", "constructor"]]) {
    const p = mk(); write(p, { hackbotHome: H, links: [], runtimes });
    const a = cli(["activate", "--project", p]); assert.equal(a.code, 0, `${JSON.stringify(runtimes)}: ${a.err}`);
    assert.equal(statusActivation({ projectDir: p }).healthy, true);
  }
});
t("doctor names an invalid marker in the cwd and how to repair it", () => {
  const p = mk(); write(p, "{ nope");
  const r = cli(["doctor"], p, PCLI);
  assert.equal(r.code, 0); assert.match(r.out, /--repair/); assert.doesNotMatch(r.all, RAW);
});
t("absent marker: status and deactivate say so plainly", () => {
  const p = mk();
  assert.match(cli(["status", "--project", p]).out, /not activated/);
  const d = cli(["deactivate", "--project", p]); assert.equal(d.code, 2); assert.match(d.err, /not-activated.*nothing to deactivate/);
});

// ---- a forged marker can't reach outside the project ----

t("attack: backups can't place a file outside the project, lexically or through a symlinked subdir", () => {
  const p = mk(), v = mk(); fs.writeFileSync(path.join(p, "payload"), "x");
  write(p, { hackbotHome: H, links: [], backups: { [`../${path.basename(v)}/authorized_keys`]: "payload" } });
  assert.equal(cli(["deactivate", "--project", p]).code, 2);
  assert.deepEqual(fs.readdirSync(v), []); assert.ok(fs.existsSync(path.join(p, "payload")));
  const q = mk(), w = mk(); fs.symlinkSync(w, path.join(q, "sub")); fs.writeFileSync(path.join(q, "payload"), "x");
  write(q, { hackbotHome: H, links: [], backups: { "sub/authorized_keys": "payload" } });
  const r = cli(["deactivate", "--project", q]);
  assert.equal(r.code, 0, r.err); assert.match(r.out, /left alone, they lead outside/);
  assert.deepEqual(fs.readdirSync(w), []); assert.ok(fs.existsSync(path.join(q, "payload")));
});
t("attack: backups can't pull a file in from outside through a symlinked subdir", () => {
  const p = mk(), w = mk(); fs.writeFileSync(path.join(w, "secret"), "x"); fs.symlinkSync(w, path.join(p, "sub"));
  write(p, { hackbotHome: H, links: [], backups: { stolen: "sub/secret" } });
  assert.equal(cli(["deactivate", "--project", p]).code, 0);
  assert.ok(fs.existsSync(path.join(w, "secret"))); assert.ok(!fs.existsSync(path.join(p, "stolen")));
});
t("attack: links and createdDirs can't remove anything outside the project through a symlinked subdir", () => {
  const p = mk(), w = mk(), home = mk(); fs.writeFileSync(path.join(home, "t"), "x");
  fs.symlinkSync(path.join(home, "t"), path.join(w, "t")); fs.mkdirSync(path.join(w, "empty")); fs.symlinkSync(w, path.join(p, "sub"));
  const before = tree(w);
  write(p, { hackbotHome: path.join(home, "sub", ".."), links: ["sub/t"], createdDirs: ["sub/empty"] });
  assert.equal(cli(["deactivate", "--project", p]).code, 0);
  assert.deepEqual(tree(w), before);
});
t("attack: re-activation over a marker with a symlinked subdir doesn't act through it either", () => {
  const p = mk(), w = mk(); fs.mkdirSync(path.join(w, "empty")); fs.symlinkSync(w, path.join(p, "sub")); const before = tree(w);
  write(p, { hackbotHome: H, links: [], createdDirs: ["sub/empty"], backups: {} });
  assert.equal(cli(["activate", "--project", p]).code, 0);
  assert.deepEqual(tree(w), before);
});
t("attack: a repository's .claude -> elsewhere can't turn activation into a write outside the project", () => {
  const p = mk(), w = mk(); fs.symlinkSync(w, path.join(p, ".claude"));
  for (const extra of [[], ["--force"]]) {
    const r = cli(["activate", "--project", p, ...extra]);
    assert.equal(r.code, 2); assert.match(r.err, /unsafe-target.*leads outside the project/); assert.deepEqual(fs.readdirSync(w), []);
  }
  assert.ok(!fs.existsSync(path.join(p, MARKER)), "refused before any change");
});
t("attack: --force through a symlink to the harness is refused; the harness keeps its tools", () => {
  // Against a disposable copy: if this guard ever regresses, the real harness must not be the one that loses its tools/.
  const copy = path.join(TMP, "harness-copy"); fs.mkdirSync(copy); fs.copyFileSync(path.join(H, "SKILL.md"), path.join(copy, "SKILL.md"));
  fs.cpSync(path.join(H, "tools"), path.join(copy, "tools"), { recursive: true, filter: (s) => !s.includes(`${path.sep}node_modules`) });
  const copyCli = path.join(copy, "tools", "activation", "cli.mjs");
  const l = path.join(mk(), "looks-external"); fs.symlinkSync(copy, l);
  const r = cli(["activate", "--project", l, "--force"], TMP, copyCli);
  assert.equal(r.code, 2); assert.match(r.err, /inside-harness/);
  assert.ok(fs.lstatSync(path.join(copy, "tools")).isDirectory()); assert.ok(!fs.existsSync(path.join(copy, "tools.hackbot-bak"))); assert.ok(!fs.existsSync(path.join(copy, MARKER)));
  const inner = path.join(mk(), "into-tools"); fs.symlinkSync(path.join(copy, "tools"), inner);
  assert.equal(cli(["activate", "--project", inner], TMP, copyCli).code, 2);
});
t("the runtime config audit survives an invalid marker", () => {
  const p = mk(); write(p, { hackbotHome: 1, links: 1 }); fs.mkdirSync(path.join(p, ".pi")); fs.mkdirSync(path.join(p, ".pi", "extensions"));
  assert.ok(auditRuntimeConfig({ projectDir: p }).some((f) => f.path === ".pi/extensions"));
});

// ---- repair ----

t("repair: removes only this harness's links, keeps the operator's files and the bad marker", () => {
  const p = mk(); fs.writeFileSync(path.join(p, "app.txt"), "data\n"); fs.mkdirSync(path.join(p, ".claude")); fs.writeFileSync(path.join(p, ".claude", "mine.json"), "{}");
  activate({ projectDir: p, home: H, runtimes: ["pi", "antigravity"] });
  const foreign = mk(); fs.symlinkSync(foreign, path.join(p, "keep-link")); fs.unlinkSync(path.join(p, "references")); fs.symlinkSync(foreign, path.join(p, "references")); // same name, not ours
  write(p, `{ ${SECRET}`);
  const r = cli(["deactivate", "--project", p, "--repair"]);
  assert.equal(r.code, 0, r.err); assert.match(r.out, /repaired:/); assert.match(r.out, new RegExp(`${MARKER}\\.invalid`)); assert.ok(!r.all.includes(SECRET));
  for (const l of ["tools", "SKILL.md", "AGENTS.md", ".pi/settings.json", ".agents/skills", ".claude/skills"]) assert.throws(() => fs.lstatSync(path.join(p, l)), undefined, l);
  assert.equal(fs.readFileSync(path.join(p, "app.txt"), "utf8"), "data\n"); assert.ok(fs.existsSync(path.join(p, ".claude", "mine.json")));
  assert.equal(fs.readlinkSync(path.join(p, "keep-link")), foreign); assert.equal(fs.readlinkSync(path.join(p, "references")), foreign);
  assert.ok(fs.readFileSync(path.join(p, `${MARKER}.invalid`), "utf8").includes(SECRET)); assert.ok(!fs.existsSync(path.join(p, MARKER)));
  assert.equal(statusActivation({ projectDir: p }).activated, false);
  fs.unlinkSync(path.join(p, "references"));
  assert.equal(cli(["activate", "--project", p, "--runtime", "pi"]).code, 0, "activates again");
  assert.equal(statusActivation({ projectDir: p }).healthy, true);
});
t("repair: backups stay where they are, and are named", () => {
  const p = mk(); fs.writeFileSync(path.join(p, "AGENTS.md"), "my rules\n");
  activate({ projectDir: p, home: H, runtimes: ["pi"], force: true }); write(p, "{ nope");
  const r = cli(["deactivate", "--project", p, "--repair"]);
  assert.equal(r.code, 0, r.err); assert.match(r.out, /AGENTS\.md\.hackbot-bak/);
  assert.equal(fs.readFileSync(path.join(p, "AGENTS.md.hackbot-bak"), "utf8"), "my rules\n");
});
t("repair: ignores what the bad marker says, and an old .invalid isn't overwritten", () => {
  const p = mk(), w = mk(); fs.writeFileSync(path.join(p, `${MARKER}.invalid`), "older"); fs.writeFileSync(path.join(p, "payload"), "x");
  write(p, { hackbotHome: H, links: [], backups: { [`../${path.basename(w)}/x`]: "payload" } });
  const r = deactivate({ projectDir: p, repair: true });
  assert.equal(r.markerKept, `${MARKER}.invalid.1`); assert.equal(fs.readFileSync(path.join(p, `${MARKER}.invalid`), "utf8"), "older");
  assert.deepEqual(fs.readdirSync(w), []); assert.ok(fs.existsSync(path.join(p, "payload")));
});
t("repair: links left without a marker are removed; with nothing of ours it says so", () => {
  const p = mk(); activate({ projectDir: p, home: H, runtimes: ["pi"] }); fs.unlinkSync(path.join(p, MARKER));
  const r = cli(["deactivate", "--project", p, "--repair"]);
  assert.equal(r.code, 0, r.err); assert.throws(() => fs.lstatSync(path.join(p, "tools")));
  const q = mk(); fs.writeFileSync(path.join(q, "a"), "x"); const before = tree(q);
  const e = cli(["deactivate", "--project", q, "--repair"]);
  assert.equal(e.code, 2); assert.match(e.err, /nothing to repair/); assert.deepEqual(tree(q), before);
});
t("repair on a valid marker is the ordinary deactivate, restoring the exact tree", () => {
  const p = mk(); fs.writeFileSync(path.join(p, "app.txt"), "x"); const before = tree(p);
  activate({ projectDir: p, home: H, runtimes: ["pi"] });
  assert.equal(cli(["deactivate", "--project", p, "--repair"]).code, 0);
  assert.deepEqual(tree(p), before);
});

// ---- normal UX unchanged, help ----

t("correct project: same flow, no warning, no opt-in file written", () => {
  const p = mk();
  const a = cli(["activate", "--project", p, "--runtime", "pi"]);
  assert.equal(a.code, 0); assert.doesNotMatch(a.all, /⚠ (this project's marker|the Caido)/); assert.match(a.out, /withheld \(--caido to opt in\)/);
  const s = cli(["status", "--project", p]);
  assert.equal(s.code, 0); assert.match(s.out, /caido opt-in: false/); assert.doesNotMatch(s.out, /no longer honored|Fix it/);
  assert.equal(cli(["deactivate", "--project", p]).code, 0);
  assert.deepEqual(tree(p), {});
});
t("--help explains --caido, --repair and the limit, and runs nothing", () => {
  const p = mk(); const r = cli(["deactivate", "--project", p, "--repair", "--help"]);
  assert.equal(r.code, 0); for (const w of [/--repair/, /--no-caido/, /real path/, /not against a shell/]) assert.match(r.out, w);
  assert.deepEqual(tree(p), {});
});

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }
console.log(`\n${n - fail}/${n} passed` + (fail ? ` (${fail} FAILED)` : ""));
process.exit(fail ? 1 : 0);
