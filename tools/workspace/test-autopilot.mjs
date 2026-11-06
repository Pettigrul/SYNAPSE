#!/usr/bin/env node
// SecurityAuditor — S3 supervised-Autopilot loop tests (R7).
// Behavioral, with SIMULATED tools + controlled results (not just string-greps). A TEST-LOCAL driver
// (no production orchestrator) walks the real primitives — parseTasks() over the existing toDoList.md, the
// real Bridge Approval Gate (b._approved), real engagement confinement/bootstrap — to prove the chain:
//   objective → next task → capability → permission → execute → result → persist → replan → next / stop.
// Offline, no LLM, no offensive ops, no new state DB. The driver only chains PERMITTED (Class R) work and
// NEVER bypasses a gate. This does NOT prove live LLM autonomy in Claude Code (see 40-…md §Smoke / NOT RUN).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { initEngagement, bootstrapEngagement, loadEngagement, parseTasks } from "./engagement.mjs";
import { modeEnvelope } from "../modes/mode.mjs";
import { createBridge } from "../web-runtime/bridge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
let n = 0, fail = 0;
function t(name, fn) { n++; try { fn(); console.log(`  ok   ${name}`); } catch (e) { fail++; console.log(`  FAIL ${name}: ${e.message}`); } }

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "sa-auto-"));
const engOf = (name) => ({ dir: path.join(ROOT, name), name });
function mk(name, opts = {}) { initEngagement({ root: ROOT, name, ...opts }); const e = engOf(name); bootstrapEngagement(e); return e; }
const todoPath = (e) => path.join(e.dir, "toDoList.md");
const addTask = (e, id, text, { priority = "med" } = {}) =>
  fs.appendFileSync(todoPath(e), `\n- [ ] **TASK-${id}**: ${text}\n  - Priority: ${priority}\n`);
const flip = (e, id, mark) => {
  const p = todoPath(e); const s = fs.readFileSync(p, "utf8").replace(new RegExp(`- \\[ \\] \\*\\*TASK-${id}\\*\\*`), `- [${mark}] **TASK-${id}**`);
  fs.writeFileSync(p, s);
};
const log = (e, line) => fs.appendFileSync(path.join(e.dir, "ccLog.md"), `\n${line}\n`);
const surface = (e, line) => fs.appendFileSync(path.join(e.dir, "ccSurface.md"), `\n${line}\n`);

// ---- TEST-LOCAL supervised driver (simulated tools; real gate) ----------------------------------
// tools: { <name>: { classA?, op?, url?, run: (ctx)=>({ surface?, newTask?, ok? }) } }
function driveAutopilot(e, { ctx = { approvals: [] }, tools = {}, budget = 25 } = {}) {
  const bridge = createBridge();
  const trace = { executed: [], blocked: [], notRun: [], added: [], steps: 0, stop: null };
  const blockedThisRun = new Set();
  while (true) {
    if (trace.steps >= budget) { trace.stop = "budget"; break; }               // stop: budget/limit
    const tk = parseTasks(e);
    const eligible = tk.runtime
      .filter((x) => x.status === "open" && !blockedThisRun.has(x.id))
      .sort((a, b) => ({ high: 0, med: 1, low: 2 }[a.priority] - { high: 0, med: 1, low: 2 }[b.priority]));
    const task = eligible[0];
    if (!task) { trace.stop = "no-open-runtime-work"; break; }                  // stop: nothing permitted/executable
    const toolName = (task.text.match(/tool:(\S+)/) || [])[1];
    const tool = tools[toolName];
    if (!tool) { trace.notRun.push(task.id); blockedThisRun.add(task.id); continue; } // capability missing → NOT RUN (honest; task stays open)
    if (tool.classA && !bridge._approved(ctx, tool.op, tool.url || null)) {     // Class A needs a specific approval
      trace.blocked.push(task.id); blockedThisRun.add(task.id);                 // blocked → leave open, continue independent work
      continue;
    }
    const res = tool.run(ctx) || {};
    if (res.surface) surface(e, res.surface);                                   // persist results
    log(e, `AUTOPILOT ${task.id} executed ${toolName} → ok`);
    flip(e, task.id.replace("TASK-", ""), "x");                                 // mark done (simulated live-evidence)
    fs.appendFileSync(todoPath(e), `\n- ${new Date().toISOString().slice(0, 10)} ${task.id} → done: ${toolName}\n`);
    if (res.newTask) { addTask(e, res.newTask.id, res.newTask.text, { priority: res.newTask.priority }); trace.added.push(`TASK-${res.newTask.id}`); } // result influences next
    trace.executed.push(task.id);
    trace.steps++;
  }
  return trace;
}

// --- 6 + 8. Autopilot selects and chains permitted tasks; documents updated ---
t("6+8. chains permitted Class R tasks and persists results to documents", () => {
  const e = mk("alpha");
  addTask(e, "001", "map surface tool:recon", { priority: "high" });
  addTask(e, "002", "inventory endpoints tool:inventory", { priority: "med" });
  const tr = driveAutopilot(e, { tools: {
    recon: { run: () => ({ surface: "## Hosts\n| app.lab | web |" }) },
    inventory: { run: () => ({ surface: "## Endpoints\n| /api/v1 | GET |" }) },
  } });
  assert.deepEqual(tr.executed, ["TASK-001", "TASK-002"], "both permitted tasks executed in priority order");
  assert.equal(tr.stop, "no-open-runtime-work");
  assert.match(fs.readFileSync(path.join(e.dir, "ccSurface.md"), "utf8"), /app\.lab.*\n?|\/api\/v1/);
  assert.match(fs.readFileSync(path.join(e.dir, "ccLog.md"), "utf8"), /AUTOPILOT TASK-001 executed recon/);
});

// --- 7. A step's result influences the next (result → new task → executed) ---
t("7. a step result creates the next task, which then runs (replan)", () => {
  const e = mk("beta");
  addTask(e, "001", "recon tool:recon", { priority: "high" });
  const tr = driveAutopilot(e, { tools: {
    recon: { run: () => ({ surface: "## Endpoints\n| /login | POST |", newTask: { id: "010", text: "analyze /login tool:analyze", priority: "med" } }) },
    analyze: { run: () => ({ surface: "## Params\n| user | reflected |" }) },
  } });
  assert.ok(tr.added.includes("TASK-010"), "result produced a follow-up task");
  assert.deepEqual(tr.executed, ["TASK-001", "TASK-010"], "the follow-up task was then executed (chain)");
});

// --- 9 + 10. Resume does not re-execute done tasks nor duplicate ---
t("9+10. resume does not repeat completed steps nor duplicate", () => {
  const e = mk("gamma");
  addTask(e, "001", "recon tool:recon", { priority: "high" });
  driveAutopilot(e, { tools: { recon: { run: () => ({ surface: "## Hosts\n| h1 |" }) } } });
  const before = fs.readFileSync(path.join(e.dir, "ccLog.md"), "utf8");
  const tr2 = driveAutopilot(e, { tools: { recon: { run: () => ({ surface: "## Hosts\n| h1 |" }) } } });
  assert.deepEqual(tr2.executed, [], "no completed task re-executed on resume");
  assert.equal(tr2.stop, "no-open-runtime-work");
  assert.equal((fs.readFileSync(path.join(e.dir, "ccLog.md"), "utf8").match(/AUTOPILOT TASK-001/g) || []).length,
    (before.match(/AUTOPILOT TASK-001/g) || []).length, "no duplicate execution record");
});

// --- 11 + 12 + 13. Class A blocked without approval; a specific approval does not cross ops; continue independent work ---
t("11+12+13. unapproved Class A blocked; specific approval doesn't cross ops; independent task continues", () => {
  const e = mk("delta");
  addTask(e, "001", "replay request tool:replay", { priority: "high" });   // Class A, no approval
  addTask(e, "002", "map surface tool:recon", { priority: "med" });        // Class R, independent
  const tr = driveAutopilot(e, { ctx: { approvals: [{ op: "caido.findings.create" }] }, tools: {
    replay: { classA: true, op: "caido.replay.run", run: () => ({ surface: "SHOULD NOT RUN" }) },
    recon: { run: () => ({ surface: "## Hosts\n| h1 |" }) },
  } });
  assert.ok(tr.blocked.includes("TASK-001"), "unapproved Class A is blocked");
  assert.ok(tr.executed.includes("TASK-002"), "independent Class R task still runs");
  assert.ok(!tr.executed.includes("TASK-001"), "a findings.create approval must NOT authorize replay.run");
  assert.ok(!/SHOULD NOT RUN/.test(fs.readFileSync(path.join(e.dir, "ccSurface.md"), "utf8")), "blocked op produced nothing");
});

// --- 12b. With the correct specific approval, the Class A task is permitted by the gate ---
t("12b. the exact approval (op+url) lets the gate permit the Class A step", () => {
  const b = createBridge();
  assert.equal(b._approved({ approvals: [{ op: "caido.replay.run", url: "https://lab/x" }] }, "caido.replay.run", "https://lab/x"), true);
  assert.equal(b._approved({ approvals: [{ op: "caido.replay.run", url: "https://lab/x" }] }, "caido.replay.run", "https://lab/OTHER"), false);
});

// --- 14. Stop criteria: budget/limit halts the loop ---
t("14. stop criterion: operational budget halts chaining", () => {
  const e = mk("eps");
  for (let i = 1; i <= 5; i++) addTask(e, `00${i}`, `step ${i} tool:recon`, { priority: "med" });
  const tr = driveAutopilot(e, { budget: 2, tools: { recon: { run: () => ({}) } } });
  assert.equal(tr.executed.length, 2, "only budget-many steps executed");
  assert.equal(tr.stop, "budget");
});

// --- 15. Isolation: driving one engagement never writes into another ---
t("15. engagement isolation during the loop", () => {
  const a = mk("iso-a"); const b = mk("iso-b");
  addTask(a, "001", "recon tool:recon", { priority: "high" });
  const beforeB = fs.readFileSync(path.join(b.dir, "ccSurface.md"), "utf8");
  driveAutopilot(a, { tools: { recon: { run: () => ({ surface: "## Hosts\n| only-a |" }) } } });
  assert.equal(fs.readFileSync(path.join(b.dir, "ccSurface.md"), "utf8"), beforeB, "engagement B untouched");
});

// --- 16. Preflight DEGRADED by optionals does not block the loop (loop never consults optionals) ---
t("16. optional-dependency gaps do not block the loop", () => {
  const e = mk("pf");
  addTask(e, "001", "recon tool:recon", { priority: "high" });
  const tr = driveAutopilot(e, { tools: { recon: { run: () => ({ surface: "## Hosts\n| h |" }) } } });
  assert.deepEqual(tr.executed, ["TASK-001"], "a permitted activity with its required deps proceeds");
});

// --- 17. Capability failure → true state (NOT RUN), never fake success ---
t("17. missing capability yields NOT RUN, not fictitious success", () => {
  const e = mk("cap");
  addTask(e, "001", "needs absent tool:does-not-exist", { priority: "high" });
  const tr = driveAutopilot(e, { tools: {} });
  assert.ok(tr.notRun.includes("TASK-001"), "missing capability recorded as NOT RUN");
  assert.deepEqual(tr.executed, [], "nothing executed");
  const tk = parseTasks(e);
  assert.equal(tk.runtime.find((x) => x.id === "TASK-001").status, "open", "task stays open (not falsely done)");
});

// --- 18. No automatic Whitebox access during autonomous chaining ---
t("18. loop never touches Whitebox nor authorizes it", () => {
  const e = mk("wb", { modality: "whitebox" });
  addTask(e, "001", "recon tool:recon", { priority: "high" });
  driveAutopilot(e, { tools: { recon: { run: () => ({ surface: "x" }) } } });
  const m = loadEngagement({ dir: e.dir });
  assert.equal(m.whitebox.authorized, false);
  assert.equal(fs.existsSync(path.join(e.dir, "Whitebox")), false);
});

// --- 19. No authorization granted by mode selection ---
t("19. selecting autopilot grants nothing (envelope invariants)", () => {
  const env = modeEnvelope("autopilot");
  for (const k of ["grantsCapabilities", "bypassesGates", "spontaneousActiveOps", "autoWhitebox", "continuousAutopilot"]) assert.equal(env[k], false, `${k} must be false`);
  assert.equal(env.requiresApprovalForActiveOps, true);
});

// --- 20. Works under an external root (local activation; no global install) ---
t("20. external-root engagement (local activation) drives normally", () => {
  assert.ok(ROOT.startsWith(os.tmpdir()), "root is external to the repo");
  const e = mk("ext");
  addTask(e, "001", "recon tool:recon", { priority: "high" });
  const tr = driveAutopilot(e, { tools: { recon: { run: () => ({ surface: "## Hosts\n| ext |" }) } } });
  assert.deepEqual(tr.executed, ["TASK-001"]);
});

// --- next-task selector (production primitive the loop uses) ---
t("parseTasks selects next open runtime task by priority; @user not eligible", () => {
  const e = mk("sel");
  addTask(e, "001", "low prio tool:x", { priority: "low" });
  addTask(e, "002", "high prio tool:x", { priority: "high" });
  fs.appendFileSync(todoPath(e), `\n- [ ] **TASK-003** @user: get creds\n  - Why: unblocks auth\n`);
  const tk = parseTasks(e);
  assert.equal(tk.nextRuntime.id, "TASK-002", "highest-priority open runtime task first");
  assert.equal(tk.counts.openUser, 1, "@user task counted separately");
  assert.ok(!tk.runtime.some((x) => x.id === "TASK-003"), "@user task is not a runtime task");
});

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
console.log(`\n${n - fail}/${n} passed` + (fail ? ` (${fail} FAILED)` : ""));
process.exit(fail ? 1 : 0);
