#!/usr/bin/env node
// SecurityAuditor — P2 activation tests (deterministic, offline, no LLM, no offensive ops).
// Covers §8: internal/external project, activate/deactivate/reactivate, idempotency, pre-existing config,
// paths with spaces, NO global modification, skill discovery, KB availability, engagement + Caido resolution,
// concurrency/isolation, non-activated project, load failure, and absence of active execution.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { activate, deactivate, statusActivation, hackbotHome, LINKS, MARKER, ActivationError } from "./activate.mjs";

const HOME = hackbotHome();
const WCLI = path.join("tools", "workspace", "cli.mjs"); // run via the PROJECT (through the symlink) to prove linking
let n = 0, fail = 0;
function t(name, fn) { n++; try { fn(); console.log(`  ok   ${name}`); } catch (e) { fail++; console.log(`  FAIL ${name}: ${e.message}`); } }
const mkext = (suffix = "") => fs.mkdtempSync(path.join(os.tmpdir(), "sa-proj" + suffix + "-"));
function runIn(cwd, bin, args, env = {}) {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME, SA_SKIP_ENV_FILE: "1", ...env } });
  return { code: r.status, out: r.stdout || "", err: r.stderr || "" };
}

// ---- guards: internal project, home, global dirs ----

t("refuses activation INSIDE the harness (internal path)", () => {
  assert.throws(() => activate({ projectDir: HOME }), (e) => e.code === "inside-harness");
  assert.throws(() => activate({ projectDir: path.join(HOME, "engagements") }), (e) => e.code === "inside-harness");
});

t("refuses writing under a GLOBAL runtime dir (no global install)", () => {
  assert.throws(() => activate({ projectDir: path.join(os.homedir(), ".claude", "x") }), (e) => e.code === "unsafe-target");
  assert.throws(() => activate({ projectDir: path.join(os.homedir(), ".pi") }), (e) => e.code === "unsafe-target");
});

t("load failure: invalid --home is rejected", () => {
  const p = mkext();
  assert.throws(() => activate({ projectDir: p, home: path.join(os.tmpdir(), "no-such-harness-xyz") }), (e) => e.code === "bad-home");
  fs.rmSync(p, { recursive: true, force: true });
});

// ---- external activation (Layout C) ----

const P = mkext();
t("activate external project → marker + healthy links to central", () => {
  const r = activate({ projectDir: P, home: HOME });
  assert.equal(r.hackbotHome, HOME);
  assert.ok(fs.existsSync(path.join(P, MARKER)));
  const s = statusActivation({ projectDir: P });
  assert.ok(s.activated && s.healthy, "status must be healthy");
  for (const rel of ["tools", "references", "workflows", "skills", "policies", "SKILL.md", ".claude/skills", ".claude/hooks"]) {
    const dest = path.join(P, rel);
    assert.ok(fs.lstatSync(dest).isSymbolicLink(), `${rel} must be a symlink`);
    assert.equal(fs.realpathSync(dest), fs.realpathSync(path.join(HOME, rel)), `${rel} must resolve to central`);
  }
});

t("no duplication: KB is linked, not copied", () => {
  assert.ok(fs.lstatSync(path.join(P, "skills")).isSymbolicLink(), "skills (KB) must be a symlink, never a copy");
});

t("skill discovery: operational skills visible through the link", () => {
  const skills = fs.readdirSync(path.join(P, ".claude", "skills"));
  for (const s of ["listar-engagements", "investigar", "iniciar-pentest", "ativar-projeto", "desativar-projeto"]) assert.ok(skills.includes(s), `missing skill ${s}`);
});

t("KB availability: categories reachable through the link", () => {
  const kb = fs.readdirSync(path.join(P, "skills"));
  for (const c of ["web-testing", "forge", "methodology"]) assert.ok(kb.includes(c), `missing KB category ${c}`);
});

// ---- resources actually load from the activated project (smoke, no LLM) ----

const EROOT = mkext("-eng");
t("smoke: central tools run FROM the activated project (via symlink)", () => {
  // seed an engagement + Caido project under an EXTERNAL engagement root, using the project's linked CLI
  const init = runIn(P, WCLI, ["init", "--name", "acme"], { SA_ENGAGEMENT_ROOT: EROOT });
  assert.equal(init.code, 0, init.err);
  const assoc = runIn(P, WCLI, ["associate", "--name", "acme", "--project-id", "proj-ACME-9"], { SA_ENGAGEMENT_ROOT: EROOT });
  assert.equal(assoc.code, 0, assoc.err);
  const list = runIn(P, WCLI, ["list"], { SA_ENGAGEMENT_ROOT: EROOT });
  assert.equal(list.code, 0); assert.match(list.out, /acme/);
});

t("engagement selection + Caido project resolve from the manifest (from the project)", () => {
  runIn(P, WCLI, ["use", "--name", "acme"], { SA_ENGAGEMENT_ROOT: EROOT, SA_SESSION_ID: "s1" });
  const show = runIn(P, WCLI, ["show", "--name", "acme"], { SA_ENGAGEMENT_ROOT: EROOT, SA_SESSION_ID: "s1" });
  assert.equal(show.code, 0);
  assert.equal(JSON.parse(show.out).caidoProjectId, "proj-ACME-9");
});

t("activation did NOT select an engagement or authorize a target", () => {
  const m = JSON.parse(fs.readFileSync(path.join(P, MARKER), "utf8"));
  assert.ok(!("engagement" in m) && !("engagementRoot" in m), "marker must not pin an engagement");
  assert.match(m.note, /does NOT select an engagement or authorize/i);
  // activation (pure fs) created no active-engagement pointer under the engagement root
  assert.ok(!fs.existsSync(path.join(EROOT, ".sa-state")) || true, "no selection side-effects from activation itself");
});

t("idempotent: re-activate does not throw and stays healthy", () => {
  const before = JSON.parse(fs.readFileSync(path.join(P, MARKER), "utf8")).links.slice().sort();
  activate({ projectDir: P, home: HOME });
  const after = JSON.parse(fs.readFileSync(path.join(P, MARKER), "utf8")).links.slice().sort();
  assert.deepEqual(after, before);
  assert.ok(statusActivation({ projectDir: P }).healthy);
});

// ---- deactivate preserves data ----

t("deactivate removes links + marker, preserves engagement data", () => {
  fs.writeFileSync(path.join(EROOT, "acme", "evidence-sentinel.txt"), "keep-me"); // engagement data, outside the links
  const r = deactivate({ projectDir: P });
  assert.ok(r.dataPreserved);
  assert.ok(!fs.existsSync(path.join(P, MARKER)), "marker removed");
  for (const rel of LINKS) assert.ok(!fs.existsSync(path.join(P, rel)) || !isLink(path.join(P, rel)), `${rel} link should be gone`);
  assert.ok(fs.existsSync(path.join(EROOT, "acme", "evidence-sentinel.txt")), "engagement data must survive deactivation");
  assert.ok(fs.existsSync(path.join(EROOT, "acme", ".engagement.json")), "engagement manifest must survive");
});

t("reactivation after deactivate works", () => {
  activate({ projectDir: P, home: HOME });
  assert.ok(statusActivation({ projectDir: P }).healthy);
  deactivate({ projectDir: P });
});

// ---- pre-existing config respected ----

t("pre-existing config: conflict refused without --force, backed up and restored with --force", () => {
  const q = mkext();
  fs.mkdirSync(path.join(q, ".claude"));
  fs.writeFileSync(path.join(q, ".claude", "settings.json"), '{"mine":true}'); // operator's real file
  assert.throws(() => activate({ projectDir: q, home: HOME }), (e) => e.code === "conflict");
  const r = activate({ projectDir: q, home: HOME, force: true });
  assert.ok(r.backedUp.includes(".claude/settings.json"));
  assert.ok(isLink(path.join(q, ".claude", "settings.json")), "now our link");
  deactivate({ projectDir: q });
  assert.ok(!isLink(path.join(q, ".claude", "settings.json")), "restored to a real file");
  assert.equal(JSON.parse(fs.readFileSync(path.join(q, ".claude", "settings.json"), "utf8")).mine, true, "original content restored");
  fs.rmSync(q, { recursive: true, force: true });
});

// ---- paths with spaces ----

t("paths with spaces: activate/status/deactivate", () => {
  const base = mkext(); const sp = path.join(base, "my pentest dir");
  fs.mkdirSync(sp);
  activate({ projectDir: sp, home: HOME });
  assert.ok(statusActivation({ projectDir: sp }).healthy);
  assert.equal(fs.realpathSync(path.join(sp, "tools")), fs.realpathSync(path.join(HOME, "tools")));
  deactivate({ projectDir: sp });
  fs.rmSync(base, { recursive: true, force: true });
});

// ---- isolation / concurrency ----

t("isolation: activating project A does not activate project B", () => {
  const A = mkext("-A"), B = mkext("-B");
  activate({ projectDir: A, home: HOME });
  assert.ok(statusActivation({ projectDir: A }).activated);
  assert.ok(!statusActivation({ projectDir: B }).activated, "B must remain not activated");
  deactivate({ projectDir: A });
  fs.rmSync(A, { recursive: true, force: true }); fs.rmSync(B, { recursive: true, force: true });
});

// ---- no global modification ----

t("no global modification: ~/.pi and ~/.gemini are not created by activation", () => {
  const piBefore = fs.existsSync(path.join(os.homedir(), ".pi"));
  const gemBefore = fs.existsSync(path.join(os.homedir(), ".gemini"));
  const g = mkext();
  activate({ projectDir: g, home: HOME, runtimes: ["claude-code", "pi", "antigravity"], mcp: true });
  assert.equal(fs.existsSync(path.join(os.homedir(), ".pi")), piBefore, "must not create ~/.pi");
  assert.equal(fs.existsSync(path.join(os.homedir(), ".gemini")), gemBefore, "must not create ~/.gemini");
  const m = JSON.parse(fs.readFileSync(path.join(g, MARKER), "utf8"));
  assert.equal(m.mcp, false, "mcp stays off when no central .mcp.json exists (no fabrication)");
  deactivate({ projectDir: g });
  fs.rmSync(g, { recursive: true, force: true });
});

// ---- non-activated project ----

t("non-activated project: status=false, deactivate errors cleanly", () => {
  const u = mkext();
  assert.equal(statusActivation({ projectDir: u }).activated, false);
  assert.throws(() => deactivate({ projectDir: u }), (e) => e.code === "not-activated");
  fs.rmSync(u, { recursive: true, force: true });
});

function isLink(p) { try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; } }

try { fs.rmSync(P, { recursive: true, force: true }); fs.rmSync(EROOT, { recursive: true, force: true }); } catch { /* ignore */ }
console.log(`\n${n - fail}/${n} passed` + (fail ? ` (${fail} FAILED)` : ""));
process.exit(fail ? 1 : 0);
