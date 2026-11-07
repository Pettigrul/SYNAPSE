// Deterministic tests for the .agents/skills materializer (Windows no-symlink fix).
// Simulates a Windows checkout (core.symlinks=false): tracked symlinks land as 1-line text files whose content
// is the link target. No real symlinks are created, so this runs identically on POSIX and Windows CI.

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { plan, materialize, unmaterializedLink } from "./materialize-agents-skills.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "materialize-agents-skills.mjs");

let n = 0, fail = 0;
function t(s, fn) { n++; try { fn(); console.log(`  ok  ${s}`); } catch (e) { fail++; console.log(`FAIL  ${s}: ${e && e.stack || e}`); } }

// Build a fake repo where .agents/skills entries are un-materialized (text files), mirroring a Windows checkout.
function fakeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sa-mat-"));
  // real skill sources
  fs.mkdirSync(path.join(root, ".claude", "skills", "modo"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claude", "skills", "modo", "SKILL.md"), "---\nname: modo\ndescription: x\n---\nbody\n");
  fs.writeFileSync(path.join(root, "SKILL.md"), "---\nname: security-auditor\ndescription: y\n---\ndispatcher\n");
  // un-materialized .agents/skills (what Git writes on core.symlinks=false)
  const ag = path.join(root, ".agents", "skills");
  fs.mkdirSync(path.join(ag, "security-auditor"), { recursive: true });
  fs.writeFileSync(path.join(ag, "modo"), "../../.claude/skills/modo");            // dir target
  fs.writeFileSync(path.join(ag, "security-auditor", "SKILL.md"), "../../../SKILL.md"); // file target
  return root;
}

// 1 — before materialize: plan finds both un-materialized entries; SKILL.md does NOT resolve yet
t("1 detects un-materialized entries", () => {
  const root = fakeRepo();
  try {
    const p = plan(root);
    assert.equal(p.present, true);
    const names = new Set(p.items.map((i) => i.name));
    assert.ok(names.has("modo") && names.has("security-auditor"), `got ${[...names]}`);
    // the Antigravity loader cannot read a skill yet
    assert.throws(() => fs.readFileSync(path.join(root, ".agents/skills/modo/SKILL.md"), "utf8"));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// 2 — after materialize: both resolve to the real SKILL.md content
t("2 materialize resolves dir + file targets", () => {
  const root = fakeRepo();
  try {
    const r = materialize({ root });            // uses current platform (POSIX in CI → symlink/copy)
    assert.equal(r.materialized.length, 2);
    const modo = fs.readFileSync(path.join(root, ".agents/skills/modo/SKILL.md"), "utf8");
    assert.ok(modo.startsWith("---") && /name: modo/.test(modo));
    const sa = fs.readFileSync(path.join(root, ".agents/skills/security-auditor/SKILL.md"), "utf8");
    assert.ok(sa.startsWith("---") && /security-auditor/.test(sa));
    // idempotent: a second pass finds nothing to do
    assert.equal(materialize({ root }).materialized.length, 0);
    assert.equal(plan(root).items.length, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// 3 — simulate win32 path: file target copied, dir target linked as junction (falls back to copy if denied)
t("3 win32 materialize produces a readable skill", () => {
  const root = fakeRepo();
  try {
    materialize({ root, platform: "win32" });
    const modo = fs.readFileSync(path.join(root, ".agents/skills/modo/SKILL.md"), "utf8");
    assert.ok(/name: modo/.test(modo));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// 4 — unmaterializedLink ignores a normal file (not a single-line path) and a real symlink
t("4 does not touch ordinary files", () => {
  const root = fakeRepo();
  try {
    const normal = path.join(root, ".agents", "skills", "readme.txt");
    fs.writeFileSync(normal, "this is a normal file\nwith two lines\n");
    assert.equal(unmaterializedLink(normal), null);
    // a single-line path whose target does NOT exist is left alone (fail-closed)
    const dangling = path.join(root, ".agents", "skills", "dangling");
    fs.writeFileSync(dangling, "../../.claude/skills/does-not-exist");
    assert.equal(unmaterializedLink(dangling), null);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// 5 — the CLI entrypoint actually RUNS (guards against the Windows `file://`+argv entrypoint no-op). Copy the
// self-contained script into a fake repo so its repoRoot() resolves there, then drive it as a real subprocess.
t("5 CLI runs end-to-end (entrypoint guard fires)", () => {
  const root = fakeRepo();
  try {
    const dst = path.join(root, "tools", "activation"); fs.mkdirSync(dst, { recursive: true });
    fs.copyFileSync(SCRIPT, path.join(dst, "materialize-agents-skills.mjs"));
    const cli = path.join(dst, "materialize-agents-skills.mjs");
    const run = (args) => { try { return { code: 0, out: execFileSync(process.execPath, [cli, ...args], { encoding: "utf8" }) }; } catch (e) { return { code: e.status ?? 1, out: `${e.stdout || ""}${e.stderr || ""}` }; } };
    // --check BEFORE: unresolved entries present → exit 1 and names reported (NOT a silent exit-0 no-op)
    const before = run(["--check"]);
    assert.equal(before.code, 1, `--check should exit 1 while broken; got ${before.code} / ${before.out}`);
    assert.ok(/modo|security-auditor/.test(before.out), `--check should name unresolved entries: ${before.out}`);
    // apply: materializes and prints what it did
    const applied = run([]);
    assert.equal(applied.code, 0);
    assert.ok(/materialized/.test(applied.out), `apply should report work: ${applied.out}`);
    assert.ok(fs.readFileSync(path.join(root, ".agents/skills/modo/SKILL.md"), "utf8").startsWith("---"));
    // --check AFTER: clean → exit 0
    const after = run(["--check"]);
    assert.equal(after.code, 0, `--check should exit 0 once resolved; got ${after.code} / ${after.out}`);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

console.log(`\n${n - fail}/${n} passed` + (fail ? ` (${fail} FAILED)` : ""));
process.exit(fail ? 1 : 0);
