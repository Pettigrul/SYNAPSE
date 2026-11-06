#!/usr/bin/env node
// SecurityAuditor — S2 operational-fluidity tests (R3/R4/R6).
// Deterministic, offline, no LLM, no offensive ops. Verifies the INSTRUCTION contract
// (operational-fluidity.md + the entry/mgmt skills) AND the underlying code invariants that
// make fluidity safe: the Approval Gate still gates Class A, modes grant nothing, optional
// Preflight checks never BLOCK, engagement state stays isolated. Pure agentic behavior
// (does the live agent actually stop asking / execute?) needs Claude Code → see test 17 (NOT RUN).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { initEngagement, bootstrapEngagement, selectEngagement, associateCaidoProject } from "./engagement.mjs";
import { modeEnvelope, getMode, setMode } from "../modes/mode.mjs";
import { runPreflight, PROFILES } from "../preflight/preflight.mjs";
import { createBridge } from "../web-runtime/bridge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const PRECLI = path.join(REPO, "tools", "preflight", "cli.mjs");
const SKILLS = path.join(REPO, ".claude", "skills");
const FLUID = fs.readFileSync(path.join(REPO, "references", "operational-fluidity.md"), "utf8");
const FLUIDP = FLUID.replace(/[*`]/g, ""); // markdown-emphasis-stripped, for prose assertions
const skill = (n) => fs.readFileSync(path.join(SKILLS, n, "SKILL.md"), "utf8");

let n = 0, fail = 0;
function t(name, fn) { n++; try { fn(); console.log(`  ok   ${name}`); } catch (e) { fail++; console.log(`  FAIL ${name}: ${e.message}`); } }

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "sa-fluid-"));
const mk = (name, opts = {}) => { initEngagement({ root: ROOT, name, ...opts }); return { dir: path.join(ROOT, name), name }; };

// --- 1. Information already in the engagement is retrievable (no need to re-ask) ---
t("1. existing engagement info is resolvable from context (not re-asked)", () => {
  const e = mk("acme", { modality: "graybox" });
  bootstrapEngagement(e);
  associateCaidoProject(e, { projectId: "proj-ACME-1" });
  const sel = selectEngagement({ root: ROOT, name: "acme" });
  assert.equal(sel.modality, "graybox");          // modality answered by manifest
  assert.equal(sel.scopeValid, true);             // scope answered by scope.md
  assert.equal(sel.caidoProjectId, "proj-ACME-1");// project answered by manifest
  assert.ok(sel.statePaths && sel.evidenceDir);   // state/evidence answered by resolver
  // contract: the don't-re-ask list is written down
  assert.ok(/Não pergunte de novo/i.test(FLUID) && /quando já está ativo/i.test(FLUID));
});

// --- 2. Friendly name != hostname must not block ---
t("2. engagement name differing from the scope domain does not block", () => {
  const e = mk("project-x");
  bootstrapEngagement(e);
  fs.writeFileSync(path.join(ROOT, "project-x", "scope.md"), "# Scope — project-x\n\n## In Scope\n- app.totally-different-domain.com\n");
  const sel = selectEngagement({ root: ROOT, name: "project-x" });
  assert.equal(sel.scopeValid, true, "name/domain divergence must not invalidate selection");
  assert.ok(/nome amigável.*dom[íi]nio.*n[ãa]o[\s\S]*interromper/i.test(FLUID), "contract must state the divergence is not a blocker");
});

// --- 3. Valid scope + explicitly-requested permitted (Class R) work → no extra confirmation ---
t("3. redundant conversational confirmation (type D) is eliminated in the contract", () => {
  assert.ok(/\bD\b[\s\S]*Elimine/i.test(FLUID), "type D interruptions must be eliminated");
  assert.ok(/execução assistida|execute\b/i.test(FLUID));
  // and the immutable happy-path (Class R = no gate) still lives in the policy (unmodified)
  const gate = fs.readFileSync(path.join(REPO, "policies", "authorization-gate.md"), "utf8");
  assert.ok(/Class R[\s\S]*No gate|proceed freely/i.test(gate));
});

// --- 4 & 5. Approval Gate still gates Class A (unapproved refused, approved allowed) ---
t("4+5. Approval Gate: Class A unapproved is refused; a specific approval allows it", () => {
  const b = createBridge();
  const url = "https://lab.example/replay";
  assert.equal(b._approved({ approvals: [] }, "caido.replay.run", url), false, "no approval → refused");
  assert.equal(b._approved({ approvals: [{ op: "caido.replay.run", url }] }, "caido.replay.run", url), true, "specific approval → allowed");
  // a limited approval for ONE op/url does not roll forward to a different op
  assert.equal(b._approved({ approvals: [{ op: "caido.replay.run", url }] }, "caido.findings.create", url), false, "approval does not cross operations");
});

// --- 6. Preflight DEGRADED by optionals never BLOCKS ---
t("6. optional Preflight checks never cause BLOCKED", () => {
  for (const [name, def] of Object.entries(PROFILES)) {
    assert.equal(def.required.filter((r) => def.optional.includes(r)).length, 0, `${name}: required/optional must be disjoint`);
  }
  // behavioral: in-repo, core-lab required deps are present → verdict is never BLOCKED (opt missing → DEGRADED)
  const r = spawnSync(process.execPath, [PRECLI, "preflight", "--profile", "core-lab"], {
    cwd: REPO, encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME, SA_SKIP_ENV_FILE: "1", SA_ENGAGEMENT_ROOT: ROOT } });
  assert.notEqual(r.status, 2, "core-lab must not BLOCK when required deps are present (optionals → DEGRADED)");
  assert.match(r.stdout, /verdict: (READY|DEGRADED)/);
});

// --- 7. /iniciar-pentest runs bootstrap before any technical step ---
t("7. /iniciar-pentest sequences bootstrap before dispatcher/recon", () => {
  const md = skill("iniciar-pentest");
  assert.ok(/tools\/workspace\/cli\.mjs bootstrap/.test(md));
  assert.ok(md.indexOf("cli.mjs bootstrap") < md.indexOf("rotear ao dispatcher"));
  assert.ok(/antes de qualquer recon|proibido iniciar reconhecimento antes/i.test(md));
});

// --- 8. Continuity: do not end on an announcement when no real blocker exists ---
t("8. contract forbids ending on 'pentest iniciado' / 'posso começar' without a blocker", () => {
  assert.ok(/Pentest iniciado[\s\S]*Posso começar/i.test(FLUID), "forbidden stop-phrases must be named");
  assert.ok(/concluído \/ em andamento \/ bloqueado \/ não executado/i.test(FLUID), "must separate done/in-progress/blocked/not-run");
  assert.ok(/execute\b/i.test(skill("iniciar-pentest")), "entry skill must instruct execution, not announcement");
});

// --- 9. Copilot = assisted execution (not consult-only), granting nothing ---
t("9. Copilot posture is assisted execution; grants nothing", () => {
  const cop = modeEnvelope("copilot");
  assert.match(cop.posture, /assisted execution/i);
  assert.equal(cop.grantsCapabilities, false);
  assert.equal(cop.bypassesGates, false);
  assert.equal(cop.spontaneousActiveOps, false);
  assert.ok(/execução assistida/i.test(skill("modo")), "modo skill must describe Copilot as assisted execution");
});

// --- 10. No executable capability → NOT RUN, never simulated success ---
t("10. contract: missing capability → NOT RUN with precise limitation (no simulation)", () => {
  assert.ok(/NOT RUN/.test(FLUID));
  assert.ok(/n[ãa]o\s+invente[\s\S]*simule|n[ãa]o\s+simule/i.test(FLUIDP));
});

// --- 11. Real results are persisted to the working documents ---
t("11. contract maps persistence to the working documents", () => {
  for (const f of ["session.md", "toDoList.md", "ccSurface.md", "ccLeads.md", "ccNotes.md", "ccLog.md", "Investigation Records"]) {
    assert.ok(FLUID.includes(f), `persistence contract must mention ${f}`);
  }
  assert.ok(/n[ãa]o\s+produza evid[êe]ncia fict[íi]cia/i.test(FLUIDP));
});

// --- 12. Pending tasks are preserved across a resume (behavioral, reuses S1) ---
t("12. pending tasks survive re-bootstrap (resume)", () => {
  const e = mk("beta"); bootstrapEngagement(e);
  fs.appendFileSync(path.join(ROOT, "beta", "toDoList.md"), "\n- [ ] **TASK-001**: real pending task\n");
  bootstrapEngagement(e);
  assert.match(fs.readFileSync(path.join(ROOT, "beta", "toDoList.md"), "utf8"), /TASK-001.*real pending task/);
});

// --- 13. Resume does not repeat completed steps (idempotent bootstrap) ---
t("13. resume does not recreate already-present structure", () => {
  const e = mk("gamma"); bootstrapEngagement(e);
  const rep = bootstrapEngagement(e);
  assert.equal(rep.created.length, 0);
  assert.equal(rep.dirsCreated.length, 0);
});

// --- 14. Skills frame the CLI as internal; never force the operator to type Node ---
t("14. skills treat Node CLI as internal (not an operator-facing manual step)", () => {
  const all = ["iniciar-pentest", "investigar", "modo", "criar-engagement", "usar-engagement", "associar-caido", "verificar-ambiente", "engagement-atual", "listar-engagements"];
  for (const s of all) {
    const md = skill(s);
    if (!/node tools\//.test(md)) continue;  // skill uses no CLI → nothing to frame
    assert.ok(/Interface \*\*fina\*\*|vive no Node|s[ãa]o \*\*internos\*\*|implementação interna|não por este prompt/i.test(md),
      `${s}: must frame the Node CLI as internal`);
    assert.ok(!/pe[çc]a ao operador que (digite|rode|execute)/i.test(md), `${s}: must not ask the operator to type Node`);
  }
  // entry skills point to the fluidity contract
  assert.ok(/operational-fluidity\.md/.test(skill("iniciar-pentest")) && /operational-fluidity\.md/.test(skill("investigar")));
});

// --- 15. Another engagement's mode/state is not accessed ---
t("15. mode state is isolated per engagement (no cross-read)", () => {
  const a = mk("eng-a"); const b = mk("eng-b");
  setMode({ engagement: a, sessionId: "s", mode: "autopilot" });
  const mb = getMode({ engagement: b, sessionId: "s" });
  assert.equal(mb.mode, "copilot", "engagement B must see the default, not A's autopilot");
  assert.equal(mb.source, "default");
});

// --- 16. No sensitive op gets implicit approval via a mode ---
t("16. no mode grants implicit approval for sensitive ops", () => {
  for (const mode of ["copilot", "autopilot"]) {
    const e = modeEnvelope(mode);
    assert.equal(e.grantsCapabilities, false);
    assert.equal(e.bypassesGates, false);
    assert.equal(e.spontaneousActiveOps, false);
    assert.equal(e.requiresApprovalForActiveOps, true);
    assert.equal(e.autoWhitebox, false);
    assert.equal(e.continuousAutopilot, false);
  }
  const b = createBridge();
  assert.equal(b._approved({ approvals: [] }, "caido.replay.run", null), false);
});

// --- 17. Real agentic behavior (does the LIVE agent stop asking / execute?) — NOT RUN ---
t("17. live agentic fluidity is NOT RUN here (needs Claude Code) — documented smoke test exists", () => {
  // This suite proves the instruction contract + the safety invariants, NOT that the live LLM behaves.
  // The acceptance smoke test is documented in docs/architecture-review/39-s2-operational-fluidity.md §Smoke.
  assert.ok(fs.existsSync(path.join(REPO, "docs", "architecture-review", "39-s2-operational-fluidity.md")));
});

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
console.log(`\n${n - fail}/${n} passed` + (fail ? ` (${fail} FAILED)` : ""));
process.exit(fail ? 1 : 0);
