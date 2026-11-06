// SecurityAuditor — P3: Operational Modes (Copilot / Supervised Autopilot). Pure state + behavioral envelope.
//
// The MODE is a per-engagement, per-session BEHAVIORAL hint consumed at the existing prompt-level entry points
// (/iniciar-pentest, /investigar). It is NOT an authorization mechanism: selecting a mode grants NO capability,
// bypasses NO gate, authorizes NO target, and never reaches the Capability Bridge (whose only authority is the
// operator-provided allowedCapabilities + Execution Context approvals). No new dispatcher/coordinator/DB/durable
// execution. State persists with the EXISTING per-engagement pattern (<engagement>/.hackbot/, confined).

import fs from "node:fs";
import path from "node:path";
import { STATE_DIR, assertInsideEngagement, WorkspaceError } from "../workspace/engagement.mjs";

export class ModeError extends Error { constructor(code, msg) { super(msg); this.code = code; this.name = "ModeError"; } }

export const MODES = Object.freeze(["copilot", "autopilot"]);
export const DEFAULT_MODE = "copilot"; // safe default

// Honest behavioral envelope. NOTE every field that could look like a permission is false for BOTH modes:
// the difference is ONLY whether the agent may plan/propose toward a bounded objective — execution of any
// Class A action still goes through the unchanged Approval Gate.
export function modeEnvelope(mode) {
  const base = { grantsCapabilities: false, bypassesGates: false, spontaneousActiveOps: false, requiresApprovalForActiveOps: true, autoWhitebox: false, continuousAutopilot: false };
  // `posture` is a DESCRIPTIVE behavioral hint only (R6) — it changes no permission flag above. Copilot is
  // assisted EXECUTION of permitted Class R work when the operator asks, NOT a consult-only mode.
  if (mode === "autopilot") return { mode, autonomousPlanning: true, mayProposeActiveOps: true,
    posture: "supervised: plan/propose toward a bounded objective; every Class A action still needs per-action approval", ...base };
  return { mode: "copilot", autonomousPlanning: false, mayProposeActiveOps: false,
    posture: "assisted execution: do the permitted read-only/discovery/analysis/record work the operator asks for; never start Class A spontaneously", ...base };
}

function modeFile(engagement, sessionId) {
  const name = sessionId ? `mode-${String(sessionId)}.json` : "mode.json";
  return assertInsideEngagement(engagement.dir, path.join(STATE_DIR, name)); // confined to the engagement
}

// Resolve the mode for the active engagement+session. Absent OR stale (belongs to another engagement) → default.
export function getMode({ engagement, sessionId = null } = {}) {
  if (!engagement || !engagement.dir) throw new ModeError("no-engagement", "mode belongs to an engagement session — none active");
  const engId = engagement.name || path.basename(engagement.dir);
  const f = modeFile(engagement, sessionId);
  if (!fs.existsSync(f)) return { mode: DEFAULT_MODE, source: "default", engagementId: engId, envelope: modeEnvelope(DEFAULT_MODE) };
  let st; try { st = JSON.parse(fs.readFileSync(f, "utf8")); } catch { return { mode: DEFAULT_MODE, source: "default", engagementId: engId, corrupt: true, envelope: modeEnvelope(DEFAULT_MODE) }; }
  if (st.engagementId && st.engagementId !== engId) return { mode: DEFAULT_MODE, source: "default", stale: true, engagementId: engId, previousEngagement: st.engagementId, envelope: modeEnvelope(DEFAULT_MODE) };
  const mode = MODES.includes(st.mode) ? st.mode : DEFAULT_MODE;
  return { mode, source: "session", engagementId: engId, updated: st.updated || null, sessionId: sessionId || null, envelope: modeEnvelope(mode) };
}

// Set the mode for the active engagement+session. EXACT mode only; no "authorization" argument is accepted.
export function setMode({ engagement, sessionId = null, mode, operator = null } = {}) {
  if (!engagement || !engagement.dir) throw new ModeError("no-engagement", "cannot set a mode without an active engagement");
  if (!MODES.includes(mode)) throw new ModeError("bad-mode", `unknown mode '${mode}' (valid: ${MODES.join(", ")})`);
  const engId = engagement.name || path.basename(engagement.dir);
  const prev = getMode({ engagement, sessionId });
  const f = modeFile(engagement, sessionId);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ version: 1, engagementId: engId, mode, sessionId: sessionId || null, operator: operator || null, updated: new Date().toISOString() }, null, 2) + "\n");
  // Selecting a mode performs NO operation: no investigation starts, no capability is granted, nothing is sent.
  return { mode, previous: prev.mode, switched: prev.mode !== mode, engagementId: engId, envelope: modeEnvelope(mode) };
}

export function clearMode({ engagement, sessionId = null } = {}) {
  if (!engagement || !engagement.dir) throw new ModeError("no-engagement", "no active engagement");
  const f = modeFile(engagement, sessionId);
  if (fs.existsSync(f)) fs.unlinkSync(f);
  return { mode: DEFAULT_MODE, cleared: true };
}

// Re-export so a mode status view can show the TRUE capability set (granted per-investigation, not by the mode).
export { BRIDGE_CAPABILITIES } from "../web-runtime/bridge.mjs";
export { WorkspaceError };
