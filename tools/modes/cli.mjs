#!/usr/bin/env node
// SecurityAuditor — P3 /modo CLI (thin; pure state; offline; no LLM; no offensive ops; no new authorization).
//
// Usage:
//   node tools/modes/cli.mjs status
//   node tools/modes/cli.mjs copilot          # set the safe default mode
//   node tools/modes/cli.mjs autopilot        # set supervised autopilot (grants NOTHING; still gated)
//   node tools/modes/cli.mjs clear
// Mode belongs to the ACTIVE engagement + session (SA_SESSION_ID), never to global .env. Selecting a mode runs
// no operation and grants no capability.

import { getMode, setMode, clearMode, modeEnvelope, MODES, DEFAULT_MODE, BRIDGE_CAPABILITIES, ModeError } from "./mode.mjs";
import { getActiveEngagement, selectEngagement, resolveSessionId, noContextHelp, WorkspaceError } from "../workspace/engagement.mjs";
import { loadScopedEnv } from "../preflight/env-loader.mjs";

loadScopedEnv();

const rootOf = () => process.env.SA_ENGAGEMENT_ROOT || null;
const sessionOf = () => resolveSessionId();
function die(msg, code = 2) { console.error(`error: ${msg}`); process.exit(code); }

function resolveActive() {
  const root = rootOf();
  const active = getActiveEngagement({ root, sessionId: sessionOf() });
  if (!active.name) return { root, engagement: null, noContext: !!active.noContext };
  const sel = selectEngagement({ root, name: active.name, envProjectId: process.env.CAIDO_PROJECT_ID || null });
  return { root, engagement: { dir: sel.dir, name: sel.name }, sel, source: active.source };
}

function printStatus() {
  const { engagement, sel, source, noContext } = resolveActive();
  if (!engagement) {
    console.log(`mode: ${DEFAULT_MODE} (default) — NO active engagement`);
    if (noContext) console.log(`  ${noContextHelp()}`);
    console.log(`  mode belongs to an engagement session; select one: node tools/workspace/cli.mjs use --name <n>`);
    console.log(`  (read-only status works without a selection; mode cannot be SET without one)`);
    return 0;
  }
  const m = getMode({ engagement, sessionId: sessionOf() });
  console.log(`mode: ${m.mode}  (${m.source}${m.stale ? "; previous engagement's mode ignored" : ""})`);
  console.log(`  engagement    ${engagement.name}  (via ${source})`);
  console.log(`  session       ${sessionOf() || "(none: SA_ENGAGEMENT override)"}`);
  console.log(`  caido project ${sel.caidoProjectId ? `${sel.caidoProjectId} (${sel.caidoProjectSource})` : "NONE — associate one"}`);
  console.log(`  scope.md      ${sel.scopePresent ? (sel.scopeValid ? "present & valid" : "present but INVALID") : "ABSENT"}`);
  console.log(`  evidence dir  ${sel.evidenceDir}`);
  const e = m.envelope;
  console.log(`\n  behavior:`);
  if (e.posture) console.log(`    posture                 ${e.posture}`);
  console.log(`    autonomous planning     ${e.autonomousPlanning}`);
  console.log(`    may propose active ops  ${e.mayProposeActiveOps}  (execution ALWAYS needs the Approval Gate)`);
  console.log(`    spontaneous active ops  ${e.spontaneousActiveOps}  (never)`);
  console.log(`    grants capabilities     ${e.grantsCapabilities}  (never — set per-investigation by the operator)`);
  console.log(`    bypasses gates          ${e.bypassesGates}  (never)`);
  console.log(`    auto Whitebox           ${e.autoWhitebox}  (never)`);
  console.log(`\n  capabilities (granted PER-INVESTIGATION via the Execution Context, NOT by the mode):`);
  console.log(`    ${BRIDGE_CAPABILITIES.join(", ")}`);
  console.log(`\n  limitations / pending:`);
  console.log(`    - Autopilot is SUPERVISED only: it may plan/propose toward a bounded objective, but every`);
  console.log(`      Class A action passes Scope Guard + capabilities + Approval Gate + budget/limits + cancel.`);
  console.log(`    - Continuous/durable/scheduled autopilot is POST-MVP (not implemented).`);
  console.log(`    - Real agentic Autopilot: bounded chain validated on Pi with synthetic data only; Antigravity headless BLOCKED by shell permissions; real targets NOT RUN.`);
  return 0;
}

function setActive(mode) {
  const { engagement, noContext } = resolveActive();
  if (noContext) die(`cannot set mode '${mode}': ${noContextHelp()}`);
  if (!engagement) die(`cannot set mode '${mode}': no active engagement (mode belongs to an engagement session) — run: node tools/workspace/cli.mjs use --name <n>`);
  const r = setMode({ engagement, sessionId: sessionOf(), mode, operator: process.env.USER || null });
  console.log(`mode set: ${r.mode}${r.switched ? ` (was ${r.previous})` : ""}  [engagement ${r.engagementId}, session ${sessionOf() || "default"}]`);
  if (mode === "autopilot") {
    console.log(`\n⚠ Autopilot is SUPERVISED. Selecting it grants NO capability and authorizes NO target.`);
    console.log(`  Every active operation still requires Scope Guard + Execution Context capabilities + the`);
    console.log(`  Approval Gate + budget/limits. Blocked operations stay blocked. No continuous/autonomous run.`);
    console.log(`  This selection started NO operation.`);
  }
  return 0;
}

function main() {
  const cmd = process.argv[2] || "status";
  if (process.argv.includes("--help") || process.argv.includes("-h")) { console.log("Usage: cli.mjs status|copilot|autopilot|clear"); return 0; } // never change mode for --help
  if (cmd === "status") return printStatus();
  if (MODES.includes(cmd)) return setActive(cmd);
  if (cmd === "clear") { const { engagement } = resolveActive(); if (!engagement) die("no active engagement"); clearMode({ engagement, sessionId: sessionOf() }); console.log(`mode cleared → default (${DEFAULT_MODE})`); return 0; }
  die(`unknown command: ${cmd} (status|${MODES.join("|")}|clear)`, 3);
}

try { process.exit(main()); }
catch (e) { if (e instanceof ModeError || e instanceof WorkspaceError) die(`${e.code}: ${e.message}`, 2); die(String(e && e.message || e), 1); }
