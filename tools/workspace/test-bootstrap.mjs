#!/usr/bin/env node
// SecurityAuditor — S1 deterministic operational-bootstrap tests.
// Verifies bootstrapEngagement() + the `bootstrap` CLI restore the original HackBot
// Flow-8 Step-2 structure (nine numbered dirs + operational docs from template-files.md)
// idempotently and self-healingly, WITHOUT overwriting content, inventing tasks/findings,
// touching the manifest/evidence, or granting authorizations. Deterministic, offline, no LLM.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import {
  initEngagement, loadEngagement, bootstrapEngagement, associateCaidoProject,
  validateScope, WorkspaceError, BUCKETS, OPERATIONAL_DOCS,
} from "./engagement.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const CLI = path.join(REPO, "tools", "workspace", "cli.mjs");
const SKILL = path.join(REPO, ".claude", "skills", "iniciar-pentest", "SKILL.md");

let n = 0, fail = 0;
function t(name, fn) { n++; try { fn(); console.log(`  ok   ${name}`); } catch (e) { fail++; console.log(`  FAIL ${name}: ${e.message}`); } }
function run(args, env = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: REPO, encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: process.env.HOME, SA_SKIP_ENV_FILE: "1", ...env } });
  return { code: r.status, out: r.stdout || "", err: r.stderr || "" };
}

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "sa-boot-"));   // external engagement root (Layout B / external)
assert.ok(!ROOT.startsWith(REPO), "test root must be external to the repo");
const mk = (name, opts = {}) => initEngagement({ root: ROOT, name, ...opts });
const eng = (name) => ({ dir: path.join(ROOT, name), name });
const exists = (name, rel) => fs.existsSync(path.join(ROOT, name, rel));
const read = (name, rel) => fs.readFileSync(path.join(ROOT, name, rel), "utf8");

const NINE = Object.values(BUCKETS); // 1-Reports … 9-Trashcan (verbatim)
const RT = ["scope.md", "session.md", "toDoList.md", "ccSurface.md", "ccLeads.md", "ccGadgets.md", "ccNotes.md", "ccLog.md", "ccFailed.md"];

// --- 1. New engagement → bootstrap creates the full structure ---
t("1. new engagement: bootstrap creates docs + dirs + runtime file + .config", () => {
  mk("alpha", { modality: "graybox" });
  const rep = bootstrapEngagement(eng("alpha"));
  assert.ok(rep.created.includes("CLAUDE.md"), "runtime instructions file created");
  assert.ok(rep.created.includes(".config"), ".config stub created");
  assert.equal(rep.dirsCreated.length, 9, "nine dirs created");
  for (const d of RT) assert.ok(exists("alpha", d), `missing ${d}`);
});

// --- 2. The nine numbered directories, exact contract names ---
t("2. nine numbered directories created with the verbatim BUCKETS names", () => {
  for (const d of NINE) assert.ok(fs.statSync(path.join(ROOT, "alpha", d)).isDirectory(), `missing dir ${d}`);
  assert.deepEqual(NINE, ["1-Reports","2-Findings","3-Recon","4-Analysis","5-Scripts","6-Lists","7-Random","8-Archive","9-Trashcan"]);
});

// --- 3. All operational documents present ---
t("3. all operational documents created (6 cc* + session + toDoList + scope)", () => {
  assert.deepEqual([...OPERATIONAL_DOCS].sort(), [...RT].sort());
  for (const d of OPERATIONAL_DOCS) assert.ok(exists("alpha", d), `missing ${d}`);
});

// --- 4. Templates/structure correct ---
t("4. templates correct: scope valid, toDoList section order load-bearing, cc headers", () => {
  assert.ok(validateScope(path.join(ROOT, "alpha", "scope.md")).ok, "generated scope.md must be structurally valid");
  const todo = read("alpha", "toDoList.md");
  const iUser = todo.indexOf("## For the user (@user)"), iTasks = todo.indexOf("## Tasks"), iLog = todo.indexOf("## Validation log");
  assert.ok(iUser > -1 && iUser < iTasks && iTasks < iLog, "@user section must precede ## Tasks before ## Validation log");
  assert.match(read("alpha", "ccGadgets.md"), /^# Gadgets —/m);
  assert.match(read("alpha", "ccSurface.md"), /## Hosts/);
  assert.match(read("alpha", "CLAUDE.md"), /NATIVE-TOOLING CONSTRAINT/);
  // No fabricated findings/tasks: no open task boxes, no GAD/LEAD entries seeded.
  assert.ok(!/^- \[ \] \*\*TASK-\d/m.test(todo), "must not seed concrete tasks");
  assert.ok(!/^### GAD-\d/m.test(read("alpha", "ccGadgets.md")), "must not seed gadgets");
});

// --- 5. Bootstrap runs BEFORE recon (skill contract) ---
t("5. /iniciar-pentest runs deterministic bootstrap before routing to recon/dispatcher", () => {
  const md = fs.readFileSync(SKILL, "utf8");
  assert.ok(/tools\/workspace\/cli\.mjs bootstrap/.test(md), "skill must invoke the bootstrap CLI");
  assert.ok(/proibido iniciar reconhecimento antes|antes de qualquer recon/i.test(md), "must forbid recon before bootstrap");
  assert.ok(md.indexOf("cli.mjs bootstrap") < md.indexOf("rotear ao dispatcher"), "bootstrap must precede dispatcher routing");
});

// --- 6. Second bootstrap = no overwrite (idempotent) ---
t("6. second bootstrap overwrites nothing (idempotent)", () => {
  const before = RT.map((d) => read("alpha", d));
  const rep = bootstrapEngagement(eng("alpha"));
  assert.equal(rep.created.length, 0, "nothing created on re-run");
  assert.equal(rep.dirsCreated.length, 0, "no dirs re-created");
  RT.forEach((d, i) => assert.equal(read("alpha", d), before[i], `${d} content changed`));
});

// --- 7. Resume with preexisting files preserves content ---
t("7. resume: preexisting (edited) files are preserved verbatim", () => {
  fs.writeFileSync(path.join(ROOT, "alpha", "ccNotes.md"), "# Notes — alpha\nREAL OPERATOR CONTENT\n");
  bootstrapEngagement(eng("alpha"));
  assert.match(read("alpha", "ccNotes.md"), /REAL OPERATOR CONTENT/);
});

// --- 8. Self-healing recovery of a single missing document ---
t("8. self-heal: a deleted document is recreated (only it)", () => {
  fs.rmSync(path.join(ROOT, "alpha", "ccLog.md"));
  const rep = bootstrapEngagement(eng("alpha"));
  assert.deepEqual(rep.created, ["ccLog.md"], "only the missing doc is recreated");
  assert.ok(exists("alpha", "ccLog.md"));
  assert.match(read("alpha", "ccNotes.md"), /REAL OPERATOR CONTENT/, "other files untouched");
});

// --- 9. Preservation of tasks and evidence ---
t("9. tasks and evidence are preserved across bootstrap", () => {
  const todoP = path.join(ROOT, "alpha", "toDoList.md");
  fs.appendFileSync(todoP, "\n- [ ] **TASK-001**: real task\n");
  fs.mkdirSync(path.join(ROOT, "alpha", "evidence"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "alpha", "evidence", "shot.png"), "BINARY");
  bootstrapEngagement(eng("alpha"));
  assert.match(fs.readFileSync(todoP, "utf8"), /TASK-001.*real task/, "tasks preserved");
  assert.equal(fs.readFileSync(path.join(ROOT, "alpha", "evidence", "shot.png"), "utf8"), "BINARY", "evidence untouched");
});

// --- 10. No duplication ---
t("10. no duplicated tasks, files or dirs after repeated bootstrap", () => {
  bootstrapEngagement(eng("alpha")); bootstrapEngagement(eng("alpha"));
  const todo = read("alpha", "toDoList.md");
  assert.equal((todo.match(/TASK-001/g) || []).length, 1, "task not duplicated");
  assert.equal((todo.match(/^## Tasks$/gm) || []).length, 1, "## Tasks header not duplicated");
  // dirs are real directories, not nested duplicates
  for (const d of NINE) assert.ok(fs.statSync(path.join(ROOT, "alpha", d)).isDirectory());
});

// --- 11. Isolation between two engagements ---
t("11. bootstrapping one engagement never writes into another", () => {
  mk("beta");
  const betaBefore = fs.existsSync(path.join(ROOT, "beta", "ccNotes.md"));
  bootstrapEngagement(eng("alpha"));
  assert.equal(betaBefore, false);
  assert.equal(fs.existsSync(path.join(ROOT, "beta", "ccNotes.md")), false, "beta must stay empty");
  bootstrapEngagement(eng("beta"));
  assert.match(read("beta", "ccNotes.md"), /# Notes — beta/, "beta gets its OWN name substituted");
  assert.match(read("alpha", "ccNotes.md"), /REAL OPERATOR CONTENT/, "alpha unaffected");
});

// --- 12 & 13. Layout A (internal-style path) and external root both work ---
t("12+13. works for an internal-style root and an external root (same code path)", () => {
  const internalish = fs.mkdtempSync(path.join(REPO, "engagements-test-"));  // simulate Layout A (inside repo tree)
  try {
    initEngagement({ root: internalish, name: "lab" });
    const rep = bootstrapEngagement({ dir: path.join(internalish, "lab"), name: "lab" });
    assert.equal(rep.dirsCreated.length, 9);
    assert.ok(fs.existsSync(path.join(internalish, "lab", "session.md")));
    // external root already exercised by every other test (ROOT is in os.tmpdir()).
    assert.ok(ROOT.startsWith(os.tmpdir()));
  } finally { fs.rmSync(internalish, { recursive: true, force: true }); }
});

// --- 14. Compatibility with project activation (symlink-safe; no unsafe write-out) ---
t("14. activation compat: writes stay confined; a symlink escaping the engagement is refused", () => {
  mk("gamma");
  bootstrapEngagement(eng("gamma"));
  // Simulate a hostile/misconfigured symlink that would redirect a write outside the engagement.
  const outside = path.join(ROOT, "OUTSIDE.md");
  const link = path.join(ROOT, "gamma", "ccLog.md");
  fs.rmSync(link); fs.symlinkSync(outside, link);
  assert.throws(() => bootstrapEngagement(eng("gamma")), (e) => e instanceof WorkspaceError && e.code === "path-escape",
    "a symlink escaping the engagement must be refused (path-escape), not followed");
  assert.equal(fs.existsSync(outside), false, "nothing written outside the engagement");
});

// --- 15. Controlled failure on an existing-but-invalid scope.md ---
t("15. invalid scope.md → controlled failure (module throws bad-scope; CLI exits 2)", () => {
  mk("delta");
  fs.writeFileSync(path.join(ROOT, "delta", "scope.md"), "this is not a valid scope file\n");
  assert.throws(() => bootstrapEngagement(eng("delta")), (e) => e instanceof WorkspaceError && e.code === "bad-scope");
  const r = run(["bootstrap", "--name", "delta"], { SA_ENGAGEMENT_ROOT: ROOT, SA_SESSION_ID: "s" });
  assert.equal(r.code, 2, "CLI controlled failure exit 2");
  assert.match(r.err, /bad-scope|invalid scope/);
  // Did not steamroll: no cc docs created for delta because scope validation gates first.
  assert.equal(exists("delta", "ccNotes.md"), false, "must not create docs when scope is invalid");
});

// --- 16. No implicit grant of authorizations ---
t("16. bootstrap grants no authorization (whitebox stays unauthorized)", () => {
  mk("epsilon", { modality: "whitebox" });
  bootstrapEngagement(eng("epsilon"));
  const m = loadEngagement({ dir: path.join(ROOT, "epsilon") });
  assert.equal(m.whitebox.authorized, false, "must NOT auto-authorize whitebox");
  assert.deepEqual(m.whitebox.grants, [], "no grants added");
  assert.equal(fs.existsSync(path.join(ROOT, "epsilon", "Whitebox")), false, "no Whitebox dir materialized implicitly");
});

// --- 17. Caido association preserved ---
t("17. Caido association in the manifest is preserved untouched", () => {
  mk("zeta");
  associateCaidoProject({ dir: path.join(ROOT, "zeta") }, { projectId: "proj-ZETA-999" });
  bootstrapEngagement(eng("zeta"));
  const m = loadEngagement({ dir: path.join(ROOT, "zeta") });
  assert.equal(m.caido.projectId, "proj-ZETA-999", "projectId must be unchanged");
});

// --- 18. Bootstrap is independent of preflight optionals ---
t("18. optional-driven preflight DEGRADED never blocks bootstrap", () => {
  // bootstrapEngagement does not consult preflight/optionals at all — it succeeds regardless.
  mk("eta");
  const rep = bootstrapEngagement(eng("eta"));
  assert.equal(rep.dirsCreated.length, 9);
  assert.ok(exists("eta", "session.md"));
});

// --- CLI happy-path smoke (active selection → bootstrap report) ---
t("CLI: bootstrap resolves the ACTIVE engagement and reports readiness", () => {
  run(["init", "--name", "theta"], { SA_ENGAGEMENT_ROOT: ROOT, SA_SESSION_ID: "c" });
  run(["use", "--name", "theta"], { SA_ENGAGEMENT_ROOT: ROOT, SA_SESSION_ID: "c" });
  const r = run(["bootstrap"], { SA_ENGAGEMENT_ROOT: ROOT, SA_SESSION_ID: "c" });
  assert.equal(r.code, 0);
  assert.match(r.out, /bootstrap prepared: theta/);
  assert.match(r.out, /do NOT start recon before this bootstrap/);
  // Honesty: a fresh engagement has NO real tasks — commented template examples must not be counted.
  assert.match(r.out, /state \(resume\) open tasks=0, @user tasks=0, active gadgets=0, queued leads=0/);
});

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
console.log(`\n${n - fail}/${n} passed` + (fail ? ` (${fail} FAILED)` : ""));
process.exit(fail ? 1 : 0);
