// SecurityAuditor — Web Runtime capability surface (H1a-F1).
// Single stable entry point. The contract is backend-agnostic so future backends
// (Playwright, CDP, Chrome DevTools MCP, Caido) can register alongside http-inspect
// and light up the visual capabilities this backend reports as unavailable.
// This is a small registry — NOT a generic plugin framework, scheduler or session manager.
import { backend as httpInspect, open, inspect, headers } from "./backends/http-inspect.mjs";
import { backend as browserBackend, probe as browserProbe } from "./backends/browser.mjs";
import { record } from "./evidence.mjs";
import { SessionManager, createSessionManager } from "./session-manager.mjs";
import { ResourceRegistry } from "./resource-registry.mjs";
import { AuthorizationMatrix, createAuthorizationMatrix, classify as authzClassify, diffShapes } from "./authz-matrix.mjs";
import { ConcurrentExecutor, createConcurrentExecutor } from "./concurrent-executor.mjs";
import { StatefulRaceValidator, createRaceValidator } from "./race-validator.mjs";
import { createCaidoClient } from "./backends/caido.mjs";
import { createCaidoActiveClient } from "./backends/caido-active.mjs";
import { createInvestigationRecord } from "./investigation-record.mjs";
import { createWorkflowPlanner } from "./caido-workflow.mjs";

/** @typedef {import('./contracts.d.ts').ProbeResult} ProbeResult */

// F1 registers exactly one STATIC backend (http-inspect). The visual backend's
// availability is a RUNTIME probe (never a static claim), exposed via select()/matrix().
const BACKENDS = [httpInspect];

/**
 * Report available backends and their capabilities (capability.probe).
 * @returns {ProbeResult[]}
 */
export function probe() {
  return BACKENDS.map((b) => ({
    id: b.id,
    kind: b.kind,
    available: true,
    capabilities: b.capabilities,
    limits: b.limits,
  }));
}

/**
 * Runtime capability matrix across backends. The visual backend is probed live
 * (playwright-core + installed browser) WITHOUT launching/downloading anything.
 * @returns {Promise<ProbeResult[]>}
 */
export async function matrix() {
  const http = { id: httpInspect.id, kind: httpInspect.kind, available: true, capabilities: httpInspect.capabilities, limits: httpInspect.limits };
  const br = await browserProbe();
  return [http, { id: br.id, kind: br.kind, available: br.available, capabilities: br.capabilities, reason: br.reason, channel: br.channel }];
}

/**
 * Select the active backend. Prefers the visual backend when available; otherwise
 * falls back to http-inspect and reports visual:false EXPLICITLY (never claims visual
 * capabilities when only HTTP is working).
 * @returns {Promise<{backend:string, visual:boolean, reason:string}>}
 */
export async function select({ probe = browserProbe } = {}) {
  const br = await probe();
  if (br.available) return { backend: "browser", visual: true, reason: "" };
  return { backend: "http-inspect", visual: false, reason: `fallback HTTP — visual indisponível: ${br.reason}` };
}

// Contract-named surface.
export const capability = { probe, matrix, select };
export const http = { open, inspect, headers };
export const evidence = { record };
export const browser = browserBackend;
// Multi-session runtime (H1b-F1): a factory for an isolated-session manager. Backward
// compatible — the single-session `browser` facade above is unchanged.
export const sessions = { manager: (opts) => createSessionManager(opts), SessionManager };
// Authorization Matrix (H1b-F2): sequential IDOR/BOLA investigation across identities.
// Builds on the multi-session manager + a minimal resource registry; no concurrency (H1c).
export const authz = {
  resources: () => new ResourceRegistry(),
  matrix: (deps) => createAuthorizationMatrix(deps),
  classify: authzClassify,
  diffShapes,
  ResourceRegistry, AuthorizationMatrix,
};
// Concurrent Execution Foundation (H1c-F1): bounded, barrier-synchronized concurrent HTTP
// operations over existing authenticated sessions. No race/TOCTOU logic (that is H1c-F2).
export const concurrent = {
  executor: (deps) => createConcurrentExecutor(deps),
  ConcurrentExecutor,
};
// Stateful Race & TOCTOU Validator (H1c-F2): reproducible race experiments that confirm a
// business-invariant/authz violation ONLY via authoritative state change (never timing alone).
export const race = {
  validator: (deps) => createRaceValidator(deps),
  StatefulRaceValidator,
};
// Caido read-only connectivity & HTTP Intelligence (H2b-F1): a GraphQL client over
// native fetch. Read-only (no mutations/Replay/Findings/workflows); zero new deps.
export const caido = {
  client: (opts) => createCaidoClient(opts),
  // H2b-F4a: ACTIVE client (supervised Replay + Findings create + read). Reachable only via
  // the bridge's `caido-active` capability, which gates each active op with an operator approval.
  activeClient: (opts) => createCaidoActiveClient(opts),
};

// Supervised Investigation Record (H2b-F4b-1): deterministic, passive record builder. Not a
// coordinator/scheduler — the agent drives, this only records + enforces the contract.
export const investigation = {
  record: (opts) => createInvestigationRecord(opts),
};

// Caido Workflow Intelligence (H2b-F5a): offline planner/validator. Local, no Caido effects, no publish,
// no execution. Native generation is BLOCKED (opaque definition) — produces intermediate specs only.
export const workflow = {
  planner: (opts) => createWorkflowPlanner(opts),
};

export { httpInspect, browserBackend, BACKENDS };
