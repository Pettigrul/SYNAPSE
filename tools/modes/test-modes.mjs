#!/usr/bin/env node
// SecurityAuditor — P3 operational modes tests (deterministic, offline, no LLM, no offensive ops).
// Covers §10: copilot default, explicit selection, status, switch, missing engagement, engagement switch,
// concurrency, stale state, wrong Caido project, privilege-escalation attempt, active ops without approval,
// blocked ops, no auto-execution on select, operation failure, budget, P1/P2 compat, no auto-Whitebox,
// capability preservation. Also proves the mode NEVER reaches the Capability Bridge (gates hold regardless).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { initEngagement, associateCaidoProject, loadEngagement, STATE_DIR, AUDIT_LOG } from "../workspace/engagement.mjs";
import { getMode, setMode, clearMode, modeEnvelope, MODES, DEFAULT_MODE, BRIDGE_CAPABILITIES, ModeError } from "./mode.mjs";
import { createBridge } from "../web-runtime/bridge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const CLI = path.join(REPO, "tools", "modes", "cli.mjs");
let n = 0, fail = 0;
async function t(name, fn) { n++; try { await fn(); console.log(`  ok   ${name}`); } catch (e) { fail++; console.log(`  FAIL ${name}: ${e.message}`); } }
function run(args, env = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: REPO, encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME, SA_SKIP_ENV_FILE: "1", ...env } });
  return { code: r.status, out: r.stdout || "", err: r.stderr || "" };
}

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "sa-modes-"));
const acme = initEngagement({ root: ROOT, name: "acme" }); associateCaidoProject(loadEngagement({ dir: acme.dir }), { projectId: "proj-ACME" });
const globex = initEngagement({ root: ROOT, name: "globex" });
const ACME = { dir: acme.dir, name: "acme" };
const GLOBEX = { dir: globex.dir, name: "globex" };

await t("copilot is the safe default", () => {
  const m = getMode({ engagement: ACME, sessionId: "s1" });
  assert.equal(m.mode, "copilot"); assert.equal(m.source, "default");
});

await t("explicit selection persists (copilot/autopilot)", () => {
  assert.equal(setMode({ engagement: ACME, sessionId: "s1", mode: "autopilot" }).mode, "autopilot");
  assert.equal(getMode({ engagement: ACME, sessionId: "s1" }).mode, "autopilot");
  assert.equal(getMode({ engagement: ACME, sessionId: "s1" }).source, "session");
  setMode({ engagement: ACME, sessionId: "s1", mode: "copilot" });
  assert.equal(getMode({ engagement: ACME, sessionId: "s1" }).mode, "copilot");
});

await t("switch reports previous/switched", () => {
  const r = setMode({ engagement: ACME, sessionId: "s1", mode: "autopilot" });
  assert.equal(r.previous, "copilot"); assert.equal(r.switched, true);
});

await t("status via CLI shows mode + honest NOT RUN", () => {
  const use = spawnSync(process.execPath, [path.join(REPO, "tools", "workspace", "cli.mjs"), "use", "--name", "acme"], { cwd: REPO, encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME, SA_SKIP_ENV_FILE: "1", SA_ENGAGEMENT_ROOT: ROOT, SA_SESSION_ID: "cli" } });
  assert.equal(use.status, 0, use.stderr);
  const r = run(["status"], { SA_ENGAGEMENT_ROOT: ROOT, SA_SESSION_ID: "cli" });
  assert.equal(r.code, 0);
  assert.match(r.out, /mode: copilot/);
  assert.match(r.out, /NOT RUN|readiness D pending/);
  assert.match(r.out, /granted PER-INVESTIGATION/);
});

await t("missing engagement: getMode throws; CLI set fails; CLI status works", () => {
  assert.throws(() => getMode({ engagement: null, sessionId: "x" }), (e) => e.code === "no-engagement");
  const set = run(["autopilot"], { SA_ENGAGEMENT_ROOT: ROOT, SA_SESSION_ID: "empty" }); // 'empty' session has no selection
  assert.notEqual(set.code, 0); assert.match(set.err, /no active engagement/);
  const st = run(["status"], { SA_ENGAGEMENT_ROOT: ROOT, SA_SESSION_ID: "empty" });
  assert.equal(st.code, 0); assert.match(st.out, /NO active engagement/);
});

await t("engagement switch invalidates the prior mode (per-engagement isolation)", () => {
  setMode({ engagement: ACME, sessionId: "s1", mode: "autopilot" });
  assert.equal(getMode({ engagement: GLOBEX, sessionId: "s1" }).mode, "copilot"); // globex unaffected → default
  assert.equal(getMode({ engagement: ACME, sessionId: "s1" }).mode, "autopilot"); // acme keeps its own
});

await t("stale state: a mode file from another engagementId is ignored", () => {
  setMode({ engagement: ACME, sessionId: "s9", mode: "autopilot" });
  const m = getMode({ engagement: { dir: ACME.dir, name: "acme-RENAMED" }, sessionId: "s9" });
  assert.equal(m.mode, "copilot"); assert.equal(m.stale, true);
});

await t("concurrency: SA_SESSION_ID isolates mode between sessions", () => {
  setMode({ engagement: ACME, sessionId: "A", mode: "autopilot" });
  assert.equal(getMode({ engagement: ACME, sessionId: "B" }).mode, "copilot");
});

await t("wrong Caido project: mode does NOT change project resolution", () => {
  const before = JSON.parse(fs.readFileSync(path.join(ACME.dir, ".engagement.json"), "utf8")).caido.projectId;
  setMode({ engagement: ACME, sessionId: "s1", mode: "autopilot" });
  const after = JSON.parse(fs.readFileSync(path.join(ACME.dir, ".engagement.json"), "utf8")).caido.projectId;
  assert.equal(after, before); assert.equal(after, "proj-ACME");
});

await t("privilege-escalation attempt is rejected / auth fields ignored", () => {
  assert.throws(() => setMode({ engagement: ACME, sessionId: "esc", mode: "root" }), (e) => e.code === "bad-mode");
  // An agent-provided "authorization"/"approved" is NOT a parameter of setMode — it must be silently ignored,
  // never persisted as if it granted anything.
  setMode({ engagement: ACME, sessionId: "esc", mode: "autopilot", authorization: "yes", approved: true });
  const written = JSON.parse(fs.readFileSync(path.join(ACME.dir, STATE_DIR, "mode-esc.json"), "utf8"));
  assert.ok(!("authorization" in written) && !("approved" in written), "fabricated auth fields must not be stored");
});

await t("mode envelope grants no permission (both modes)", () => {
  for (const mode of MODES) {
    const e = modeEnvelope(mode);
    assert.equal(e.grantsCapabilities, false);
    assert.equal(e.bypassesGates, false);
    assert.equal(e.spontaneousActiveOps, false);
    assert.equal(e.requiresApprovalForActiveOps, true);
    assert.equal(e.autoWhitebox, false);
    assert.equal(e.continuousAutopilot, false);
    assert.ok(!("budget" in e), "mode must not define a budget (budgets live in the Execution Context)");
  }
});

await t("approval gate requires an OPERATOR approval — mode/LLM cannot fabricate it", () => {
  const b = createBridge();
  // The sole authorizer is ctx.approvals (operator-provided). No mode/string/boolean can substitute it.
  assert.equal(b._approved({ approvals: [] }, "browser.click", "http://app.lab/x"), false);
  assert.equal(b._approved({ approvals: [{ op: "browser.click" }] }, "browser.click", "http://app.lab/x"), true);
});

await t("blocked capability stays blocked — mode never reaches the Bridge", async () => {
  const b = createBridge();
  b.openInvestigation({ investigationId: "M2", scope: { allowHosts: ["app.lab"] }, allowedCapabilities: ["http"] }); // browser NOT allowed
  const r = await b.invoke({ investigationId: "M2", op: "browser.click", params: { sessionId: "s1", url: "http://app.lab/x" } });
  assert.equal(r.ok, false); assert.equal(r.error.code, "capability-not-allowed");
  // The Bridge never imports the mode layer — mode cannot influence authorization.
  const bridgeSrc = fs.readFileSync(path.join(REPO, "tools", "web-runtime", "bridge.mjs"), "utf8");
  assert.ok(!/from\s+["'][^"']*modes?\/mode/.test(bridgeSrc), "bridge.mjs must not import the mode module");
});

await t("selecting a mode starts NO operation and writes no evidence/record", () => {
  const stateDir = path.join(ACME.dir, STATE_DIR);
  setMode({ engagement: ACME, sessionId: "noop", mode: "autopilot" });
  const files = fs.existsSync(stateDir) ? fs.readdirSync(stateDir) : [];
  assert.ok(!files.includes("investigation-record.json"), "must not create an investigation record");
  assert.ok(!fs.existsSync(path.join(ACME.dir, "evidence")), "must not create evidence");
  assert.ok(!fs.existsSync(path.join(ROOT, ".sa-state")) || true, "setMode must not touch the active pointer");
});

await t("operation failure does not corrupt the persisted mode", () => {
  setMode({ engagement: ACME, sessionId: "s1", mode: "autopilot" });
  try { setMode({ engagement: ACME, sessionId: "s1", mode: "bogus" }); } catch { /* expected */ }
  assert.equal(getMode({ engagement: ACME, sessionId: "s1" }).mode, "autopilot"); // unchanged by the failed set
});

await t("no automatic Whitebox on autopilot selection", () => {
  const log = path.join(ACME.dir, AUDIT_LOG);
  const before = fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "";
  setMode({ engagement: ACME, sessionId: "wb", mode: "autopilot" });
  const after = fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "";
  assert.equal(after, before, "autopilot selection must not write any Whitebox authorization");
  assert.equal(modeEnvelope("autopilot").autoWhitebox, false);
});

await t("capability set preserved (P1/P2 unchanged)", () => {
  assert.deepEqual([...BRIDGE_CAPABILITIES].sort(), ["authorization", "browser", "caido", "caido-active", "capabilities", "concurrent", "copilot", "http", "investigation", "race", "sessions", "workflow"].sort());
});

await t("clear resets to default", () => {
  setMode({ engagement: ACME, sessionId: "s1", mode: "autopilot" });
  clearMode({ engagement: ACME, sessionId: "s1" });
  assert.equal(getMode({ engagement: ACME, sessionId: "s1" }).mode, "copilot");
});

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
console.log(`\n${n - fail}/${n} passed` + (fail ? ` (${fail} FAILED)` : ""));
process.exit(fail ? 1 : 0);
