// SecurityAuditor — Caido Workflow Intelligence: offline Generation & Validation (H2b-F5a).
//
// HONEST SCOPE — the native Caido workflow format is NOT PROVABLE from public schemas:
// the SDL (github.com/caido/schemas, proxy/schema.graphql) carries the workflow node graph only as
// an OPAQUE `definition: JsonObject!` with NO node-kind schema, NO version field, and NO
// import/export mutation. Therefore this module does NOT emit a Caido-importable artifact. It
// produces a DOCUMENTED, VERSIONED INTERMEDIATE SPEC (IR) + contract validation only. Native
// generation is recorded as BLOCKED (see NATIVE_WORKFLOW_GATE). No publish, no import, no execution,
// no Caido effects, no LLM, no arbitrary JavaScript emitted. Node stdlib, ZERO deps.

import crypto from "node:crypto";
import { validateTarget } from "./scope.mjs";

export const WORKFLOW_IR_VERSION = "sa-workflow-ir/1"; // OUR intermediate format — NOT a Caido export.

// Verified from the SDL: `enum WorkflowKind { ACTIVE CONVERT PASSIVE }`. We map our lowercase kinds.
export const KIND_TO_CAIDO = Object.freeze({ passive: "PASSIVE", active: "ACTIVE", convert: "CONVERT" });
export const SUPPORTED_KINDS = Object.freeze(Object.keys(KIND_TO_CAIDO));

// The §2/§8 verdict, carried on every artifact so no consumer mistakes the IR for a native export.
export const NATIVE_WORKFLOW_GATE = Object.freeze({
  importable: false,
  status: "BLOCKED",
  reason: "Caido workflow node-graph is an opaque `definition: JsonObject!` in the public SDL; no node schema, no version, no import/export mutation — a native importable artifact cannot be proven or constructed offline.",
  provable: Object.freeze(["WorkflowKind enum (ACTIVE/CONVERT/PASSIVE)", "createWorkflow@cloud/updateWorkflow/deleteWorkflow/toggleWorkflow CRUD", "runActiveWorkflow(requestId)", "runConvertWorkflow(Blob)", "testWorkflow{Active,Convert,Passive}(definition:JsonObject)", "Workflow.definition:JsonObject! (opaque)"]),
  notProvable: Object.freeze(["node-kind enum/union (HTTPQL/JavaScript/Create Finding/Check Finding)", "edge/graph structure", "definition serialization + schema version", "importWorkflow/exportWorkflow (NOT PRESENT)"]),
  unblockPath: "confirm the definition node-graph shape from a running authorized lab instance (workflow(id).definition) or official docs, then compile the IR to JsonObject under F5b.",
});

// Allowlisted convert transforms — we DESCRIBE them; we NEVER emit arbitrary JavaScript.
export const CONVERT_TRANSFORMS = Object.freeze(["base64-decode", "url-decode", "hex-decode", "json-normalize"]);
export const CLASSIFICATION_LEVELS = Object.freeze(["investigation-indicator", "observable-anomaly", "confirmed-vulnerability", "n/a-transform"]);

export class WorkflowError extends Error {
  constructor(code, message) { super(message || code); this.name = "WorkflowError"; this.code = code; }
}

// Secret-shaped patterns refused in any proposal field (the IR should carry IDs/param NAMES only).
const SECRET_PATTERNS = [/bearer\s+[a-z0-9._-]+/i, /authorization\s*:/i, /\b(password|secret|api[_-]?key|token)\s*[=:]\s*\S+/i, /\bsid\s*=\s*\S+/i, /eyJ[A-Za-z0-9_-]{10,}\./];

// §1/§3: assess whether a discovery is convertible into a detection/analysis/transformation.
// A Copilot recommendation ALONE is not enough — a concrete structural signal/evidence is required.
export function assessConvertibility(discovery = {}) {
  if (!discovery || typeof discovery !== "object") return { convertible: false, reason: "no discovery" };
  const kind = discovery.kind;
  if (!SUPPORTED_KINDS.includes(kind)) return { convertible: false, reason: `unsupported or missing kind (want ${SUPPORTED_KINDS.join("/")})` };
  if (kind === "convert") {
    const valid = (discovery.transforms || []).filter((t) => CONVERT_TRANSFORMS.includes(t));
    if (!valid.length) return { convertible: false, reason: `convert needs at least one allowlisted transform (${CONVERT_TRANSFORMS.join(", ")})` };
    return { convertible: true, suggestedKind: "convert" };
  }
  // passive/active need a concrete structural signal + at least one evidence reference OR an explicit structural match.
  const hasSignal = !!(discovery.structuralSignal || (discovery.match && Object.keys(discovery.match).length));
  const hasEvidence = Array.isArray(discovery.evidence) && discovery.evidence.some((e) => e && e.caidoRequestId);
  if (!hasSignal) return { convertible: false, reason: "no concrete structural signal (a Copilot recommendation alone is insufficient)" };
  if (kind === "active" && !hasEvidence) return { convertible: false, reason: "active workflow needs an evidence request reference" };
  return { convertible: true, suggestedKind: kind };
}

function proposalId(engagementId, kind, objective, evidence) {
  const ev = (evidence || []).map((e) => e && e.caidoRequestId).filter(Boolean).sort().join(",");
  return "WF-" + crypto.createHash("sha1").update(`${engagementId}|${kind}|${objective}|${ev}`).digest("hex").slice(0, 10);
}

// Build an INTERMEDIATE SPEC (IR) from a discovery. Pure. Never emits native JSON or raw JS.
export function planWorkflow(discovery = {}, ctx = {}) {
  const assess = assessConvertibility(discovery);
  if (!assess.convertible) throw new WorkflowError("not-convertible", assess.reason);
  const kind = discovery.kind;
  const engagementId = ctx.engagementId || discovery.engagementId || null;
  if (!engagementId) throw new WorkflowError("bad-params", "engagementId required");
  const objective = String(discovery.objective || "").trim();
  if (!objective) throw new WorkflowError("bad-params", "objective required");
  const evidence = (discovery.evidence || []).filter((e) => e && e.caidoRequestId).map((e) => ({ caidoRequestId: e.caidoRequestId, caidoResponseId: e.caidoResponseId || null }));

  // §3: default classification is an INVESTIGATION INDICATOR. Never auto-promote to confirmed.
  let level = discovery.classificationLevel || "investigation-indicator";
  if (kind === "convert") level = "n/a-transform";

  const base = {
    ir: WORKFLOW_IR_VERSION,
    native: NATIVE_WORKFLOW_GATE,                 // honesty: this is NOT a Caido-importable artifact
    id: proposalId(engagementId, kind, objective, evidence),
    kind, caidoKind: KIND_TO_CAIDO[kind],
    objective,
    provenance: {
      engagementId, caidoProjectId: ctx.caidoProjectId || discovery.caidoProjectId || null,
      hypothesisId: discovery.hypothesisId || null,
      investigationRecordRef: discovery.investigationRecordRef || null,
      copilotRecommendationId: discovery.copilotRecommendationId || null,
      kbTechnique: discovery.kbTechnique || null,       // id/route reference ONLY — KB bodies untouched
      evidence,
      confirmedFinding: discovery.confirmedFinding || null, // a real Caido finding id, if any
    },
    classification: { level, note: "indicator/anomaly ≠ confirmed vulnerability" },
    authorization: { required: kind === "active", approvalNeeded: kind === "active", note: kind === "active" ? "operator approval + F4a replay for any active test" : "no active request" },
    limitations: Array.isArray(discovery.limitations) ? discovery.limitations.slice() : [],
    falsePositiveRisk: discovery.falsePositiveRisk || (kind === "passive" ? "high — structural signal is a candidate, not a vulnerability" : "unknown"),
    validationCriteria: [],
    createdAtNote: "deterministic; no LLM used",
  };

  if (kind === "passive") {
    base.activation = { trigger: "passive-each-request-response", match: discovery.match || { pathHasIdLike: true } };
    base.inputs = ["request.path", "request.query", "response.statusCode"];
    base.outputs = ["candidate: { endpoint, referenceKind } → investigation-indicator"];
    base.detection = { signal: discovery.structuralSignal || "structural object reference (id-like)", emits: "investigation-indicator" };
    base.logic = { steps: [{ op: "inspect-structural-signal" }, { op: "flag-candidate-if-match" }] };
    base.limitations.push("metadata/structural level; not a finding; no authorization proof");
    base.validationCriteria = ["matches only structural signals, never endpoint/param NAMES", "emits investigation-indicator, never confirmed-vulnerability"];
  } else if (kind === "active") {
    base.activation = { trigger: "operator", caidoOp: "runActiveWorkflow", input: { requestId: evidence[0] ? evidence[0].caidoRequestId : "<operator-selected>" } };
    base.inputs = ["requestId (operator-selected)"];
    base.outputs = ["contextual analysis summary for operator decision (NO automatic execution)"];
    base.detection = { signal: discovery.structuralSignal || "operator-scoped contextual check", emits: "investigation-indicator" };
    base.logic = { steps: [{ op: "gather-context" }, { op: "present-for-operator-decision" }] };
    base.limitations.push("no automatic execution; any active test requires operator approval via F4a (caido.replay.run)");
    base.validationCriteria = ["never self-executes", "requires operator approval", "does not promote hypothesis to finding"];
  } else { // convert
    const transforms = (discovery.transforms || []).filter((t) => CONVERT_TRANSFORMS.includes(t));
    if (!transforms.length) throw new WorkflowError("bad-params", `convert requires transforms from allowlist: ${CONVERT_TRANSFORMS.join(", ")}`);
    base.activation = { trigger: "operator", caidoOp: "runConvertWorkflow" };
    base.inputs = ["data: Blob (synthetic)"];
    base.outputs = ["decoded/normalized data"];
    base.detection = null;
    base.logic = { steps: transforms.map((t) => ({ transform: t })), jsNode: null }; // NO arbitrary JS
    base.limitations.push("synthetic data only; no network; transforms from allowlist, no arbitrary JavaScript");
    base.validationCriteria = ["transforms ⊆ allowlist", "no raw JavaScript emitted"];
  }
  return base;
}

// Contract validation ONLY. NOT a simulation (testWorkflow*) and NOT real execution — both BLOCKED.
export function validateWorkflowProposal(proposal = {}, { scope = null, engagementId = null } = {}) {
  const errors = [], warnings = [];
  const E = (code, field, msg) => errors.push({ code, field, msg });

  if (proposal.ir !== WORKFLOW_IR_VERSION) E("incompatible-version", "ir", `IR version ${proposal.ir} != ${WORKFLOW_IR_VERSION}`);
  if (!SUPPORTED_KINDS.includes(proposal.kind)) E("unsupported-kind", "kind", `kind "${proposal.kind}" not in ${SUPPORTED_KINDS.join("/")}`);
  // Required fields (§3).
  for (const f of ["id", "objective", "activation", "inputs", "outputs", "classification", "authorization", "validationCriteria"]) {
    if (proposal[f] == null) E("missing-field", f, `required field "${f}" missing`);
  }
  if (!proposal.provenance || !proposal.provenance.engagementId) E("missing-provenance", "provenance.engagementId", "provenance.engagementId required");
  if (engagementId && proposal.provenance && proposal.provenance.engagementId !== engagementId) E("engagement-mismatch", "provenance.engagementId", "proposal belongs to a different engagement");

  // §3: never promote hypothesis → confirmed without authoritative evidence.
  if (proposal.classification && proposal.classification.level === "confirmed-vulnerability") {
    const auth = proposal.provenance && (proposal.provenance.confirmedFinding || proposal.provenance.authoritativeClassification);
    if (!auth) E("unsupported-promotion", "classification.level", "confirmed-vulnerability requires a confirmed finding / authoritative classification");
  }
  if (proposal.classification && !CLASSIFICATION_LEVELS.includes(proposal.classification.level)) E("bad-classification", "classification.level", `invalid level "${proposal.classification.level}"`);

  // §6: no secrets embedded.
  const blob = safeStringify(proposal);
  for (const re of SECRET_PATTERNS) if (re.test(blob)) { E("secret-detected", "*", `possible secret matching ${re}`); break; }

  // §6: convert must not carry arbitrary JS; transforms ⊆ allowlist.
  if (proposal.kind === "convert" && proposal.logic) {
    if (proposal.logic.jsNode) E("untrusted-js", "logic.jsNode", "arbitrary JavaScript is not allowed without validation");
    for (const s of (proposal.logic.steps || [])) if (s.transform && !CONVERT_TRANSFORMS.includes(s.transform)) E("bad-transform", "logic.steps", `transform "${s.transform}" not in allowlist`);
  }

  // §6/§10: scope + association — any host referenced must be in scope.
  if (scope) {
    for (const host of collectHosts(proposal)) {
      try { validateTarget(/^https?:\/\//.test(host) ? host : `https://${host}/`, scope); }
      catch { E("out-of-scope", "activation", `referenced host ${host} is outside the engagement scope`); }
    }
  }

  // Native importability is expected false (BLOCKED) — surface as a WARNING, not a pass/fail.
  if (!proposal.native || proposal.native.importable !== false) warnings.push({ code: "native-gate-missing", msg: "proposal must carry native.importable=false (BLOCKED gate)" });
  else warnings.push({ code: "native-blocked", msg: "native Caido generation is BLOCKED; this IR is an intermediate spec, not an importable artifact" });

  return { valid: errors.length === 0, errors, warnings, contractValidated: true, simulated: false, executed: false, nativeImportable: false };
}

function collectHosts(proposal) {
  const hosts = new Set();
  const a = proposal.activation || {};
  if (a.match && a.match.host) hosts.add(a.match.host);
  for (const e of (proposal.provenance && proposal.provenance.evidence) || []) { /* evidence carries IDs only, no host */ }
  return [...hosts];
}
function safeStringify(o) { try { return JSON.stringify(o); } catch { return String(o); } }

// A local, side-effect-free planner for the bridge: propose/get/list/validate/generate. No Caido calls.
export class WorkflowPlanner {
  constructor({ engagementId, caidoProjectId = null, modality = "blackbox", scope = null } = {}) {
    if (!engagementId) throw new WorkflowError("bad-config", "engagementId required");
    this.engagementId = engagementId; this.caidoProjectId = caidoProjectId; this.modality = modality; this.scope = scope;
    this.proposals = new Map();
  }
  propose(discovery = {}) {
    const p = planWorkflow(discovery, { engagementId: this.engagementId, caidoProjectId: this.caidoProjectId });
    if (this.proposals.has(p.id)) return { duplicate: true, proposal: this.proposals.get(p.id) };
    this.proposals.set(p.id, p);
    return { duplicate: false, proposal: p };
  }
  get(id) { const p = this.proposals.get(id); if (!p) throw new WorkflowError("not-found", `no proposal ${id}`); return p; }
  list() { return [...this.proposals.values()]; }
  validate(id) { return validateWorkflowProposal(this.get(id), { scope: this.scope, engagementId: this.engagementId }); }
  // "generate" returns the intermediate artifact — explicitly non-native, with the BLOCKED gate.
  generate(id) {
    const p = this.get(id);
    const v = validateWorkflowProposal(p, { scope: this.scope, engagementId: this.engagementId });
    return { artifactKind: "intermediate-spec", nativeImportable: false, native: NATIVE_WORKFLOW_GATE, validation: v, spec: p };
  }
}

export function createWorkflowPlanner(opts) { return new WorkflowPlanner(opts); }

// The three canonical example discoveries (§4 A/B/C), for docs and deterministic tests.
export const EXAMPLE_DISCOVERIES = Object.freeze({
  A_passive: { kind: "passive", objective: "Flag endpoints exposing object references for authorization investigation", structuralSignal: "id-like path/query segment", match: { pathHasIdLike: true }, kbTechnique: { id: null, route: "skills/web-testing/SKILL.md", keywords: ["IDOR", "BOLA", "object reference"] }, evidence: [{ caidoRequestId: "rq-1" }] },
  B_active: { kind: "active", objective: "Operator-triggered contextual authorization analysis for a selected request", structuralSignal: "operator-scoped authz check", kbTechnique: { route: "skills/web-testing/SKILL.md" }, evidence: [{ caidoRequestId: "rq-1" }] },
  C_convert: { kind: "convert", objective: "Normalize/decode synthetic encoded data", transforms: ["base64-decode", "url-decode", "json-normalize"] },
});
