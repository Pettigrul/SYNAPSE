// SecurityAuditor — Capability Bridge (H1d-F1).
//
// A reusable, STATEFUL, SAME-PROCESS ESM library that makes the already-built Web Runtime
// capabilities (HTTP Inspection, Browser Runtime, Multi-Session, Authorization Matrix,
// Concurrent Executor, Race & TOCTOU Validator) reachable by an agent runtime — WITHOUT
// rebuilding the harness. It only VALIDATES, CORRELATES, FORWARDS and manages LIFECYCLE.
//
// It reuses the public `capability.*` APIs verbatim. It adds NO new executor, plugin
// framework, scheduler, HTTP service, database or daemon. Zero external dependencies
// (Node stdlib only). The classifiers of AuthZ/Race are PRESERVED: the bridge never turns an
// anomaly into a confirmed violation — it copies the validator's verdict and never writes one.
//
// TRUST MODEL (critical): the Execution Context is supplied by the ADAPTER, never by the LLM.
// The agent only names an opaque `investigationId` + an `op` + `params`. Scope, allowed
// capabilities, limits and per-action approvals live in the adapter-provided context; the
// bridge validates against it and delegates the technical scope/security decision to the
// existing Scope Guard / Rule 0 / Rule 6 mechanisms. The agent cannot invent authorization.
import crypto from "node:crypto";
import * as cap from "./capability.mjs";
import { probe as browserProbe } from "./session.mjs";
import { validateTarget } from "./scope.mjs";
import { confineWithin } from "../workspace/engagement.mjs"; // reuse the ONE symlink-safe path confinement

const SECRET_KEY = /^(authorization|cookie|set-cookie|proxy-authorization|x-api-key|api[-_]?key|token|password|secret|storagestate|credentials?)$/i;

/** Capability domains the bridge exposes. */
export const BRIDGE_CAPABILITIES = Object.freeze([
  "capabilities", "http", "sessions", "browser", "authorization", "concurrent", "race", "caido", "copilot", "caido-active", "investigation", "workflow",
]);

/** Active Caido ops whose real outcome is auto-mirrored into an attached Investigation Record. */
const MIRRORED_OPS = new Set(["caido.replay.run", "caido.findings.create"]);

/** Operation registry: op -> { capability, stateful, sensitive }. The single, stable surface. */
export const BRIDGE_OPS = Object.freeze({
  "capabilities.list":        { capability: "capabilities", stateful: false, sensitive: false },
  "capabilities.probe":       { capability: "capabilities", stateful: false, sensitive: false },
  "http.inspect":             { capability: "http",         stateful: false, sensitive: false },
  "http.headers":             { capability: "http",         stateful: false, sensitive: false },
  "sessions.create":          { capability: "sessions",     stateful: true,  sensitive: false },
  "sessions.list":            { capability: "sessions",     stateful: true,  sensitive: false },
  "sessions.status":          { capability: "sessions",     stateful: true,  sensitive: false },
  "sessions.bindIdentity":    { capability: "sessions",     stateful: true,  sensitive: false },
  "sessions.close":           { capability: "sessions",     stateful: true,  sensitive: false },
  "browser.navigate":         { capability: "browser",      stateful: true,  sensitive: false },
  "browser.snapshot":         { capability: "browser",      stateful: true,  sensitive: false },
  "browser.screenshot":       { capability: "browser",      stateful: true,  sensitive: false },
  "browser.click":            { capability: "browser",      stateful: true,  sensitive: true  },
  "browser.fill":             { capability: "browser",      stateful: true,  sensitive: true  },
  "browser.network":          { capability: "browser",      stateful: true,  sensitive: false },
  "browser.console":          { capability: "browser",      stateful: true,  sensitive: false },
  "browser.probe":            { capability: "browser",      stateful: true,  sensitive: false }, // GET only; POST-ish -> sensitive handled per-call
  "authorization.registerResource": { capability: "authorization", stateful: true, sensitive: false },
  "authorization.run":        { capability: "authorization", stateful: true, sensitive: true  },
  "concurrent.run":           { capability: "concurrent",   stateful: true,  sensitive: true  },
  "race.run":                 { capability: "race",         stateful: true,  sensitive: true  },
  // Caido read-only (H2b-F1): connectivity + HTTP Intelligence. NO writes, NO approval
  // needed (read-only), but gated by allowedCapabilities + scope + project association.
  "caido.health":             { capability: "caido",        stateful: false, sensitive: false },
  "caido.projects":           { capability: "caido",        stateful: false, sensitive: false },
  "caido.history":            { capability: "caido",        stateful: false, sensitive: false },
  "caido.request":            { capability: "caido",        stateful: false, sensitive: false },
  // Copilot Intelligence read API (H2b-F3): deterministic context/recommendations built
  // from F2 monitor events. Read-only, no LLM, no active ops. The copilot is attached by
  // the host (attachCopilot), never created by the agent.
  "copilot.summary":          { capability: "copilot",      stateful: true,  sensitive: false },
  "copilot.endpoints":        { capability: "copilot",      stateful: true,  sensitive: false },
  "copilot.hypotheses":       { capability: "copilot",      stateful: true,  sensitive: false },
  "copilot.recommendations":  { capability: "copilot",      stateful: true,  sensitive: false },
  "copilot.unassessed":       { capability: "copilot",      stateful: true,  sensitive: false },
  "copilot.relate":           { capability: "copilot",      stateful: true,  sensitive: false },
  "copilot.setState":         { capability: "copilot",      stateful: true,  sensitive: false },
  // Caido Testing Operations (H2b-F4a). READ ops (findings/automate/replay results) stay under
  // the `caido` capability. ACTIVE ops (Replay execution, Finding creation) live under the SEPARATE
  // `caido-active` capability — reading History must NOT by itself authorize Replay — and are
  // SENSITIVE: each requires an operator approval in the Execution Context (never an LLM boolean).
  "caido.findings.list":      { capability: "caido",        stateful: false, sensitive: false },
  "caido.findings.get":       { capability: "caido",        stateful: false, sensitive: false },
  "caido.replay.sessions":    { capability: "caido",        stateful: false, sensitive: false },
  "caido.replay.entry":       { capability: "caido",        stateful: false, sensitive: false },
  "caido.automate.sessions":  { capability: "caido",        stateful: false, sensitive: false },
  "caido.automate.session":   { capability: "caido",        stateful: false, sensitive: false },
  "caido.replay.run":         { capability: "caido-active", stateful: true,  sensitive: true  },
  "caido.findings.create":    { capability: "caido-active", stateful: true,  sensitive: true  },
  // Supervised Investigation Record (H2b-F4b-1): interpretive fields are agent-set; factual
  // execution is AUTO-MIRRORED from the real envelopes of caido.replay.run / caido.findings.create.
  // Passive — never dispatches ops, never approves, never calls an LLM.
  "investigation.start":      { capability: "investigation", stateful: true, sensitive: false },
  "investigation.kb":         { capability: "investigation", stateful: true, sensitive: false },
  "investigation.evidence":   { capability: "investigation", stateful: true, sensitive: false },
  "investigation.propose":    { capability: "investigation", stateful: true, sensitive: false },
  "investigation.interpret":  { capability: "investigation", stateful: true, sensitive: false },
  "investigation.finalize":   { capability: "investigation", stateful: true, sensitive: false },
  "investigation.snapshot":   { capability: "investigation", stateful: true, sensitive: false },
  "investigation.get":        { capability: "investigation", stateful: true, sensitive: false },
  // Caido Workflow Intelligence (H2b-F5a): LOCAL offline planner/validator. No Caido effects, no publish,
  // no execution — native generation is BLOCKED (opaque definition). Produces intermediate specs only.
  "workflow.propose":         { capability: "workflow",      stateful: true, sensitive: false },
  "workflow.get":             { capability: "workflow",      stateful: true, sensitive: false },
  "workflow.list":            { capability: "workflow",      stateful: true, sensitive: false },
  "workflow.validate":        { capability: "workflow",      stateful: true, sensitive: false },
  "workflow.generate":        { capability: "workflow",      stateful: true, sensitive: false },
});

export class BridgeError extends Error {
  constructor(code, message) { super(message || code); this.name = "BridgeError"; this.code = code; }
}

/** Deep-strip secret-looking keys; cap structure so results stay JSON-safe and leak-free. */
export function sanitizeResult(value, depth = 0) {
  if (depth > 12 || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 500).map((v) => sanitizeResult(v, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEY.test(k)) { out[k] = "[redacted]"; continue; }
      out[k] = sanitizeResult(v, depth + 1);
    }
    return out;
  }
  return value;
}

const STATE_CHANGING_METHOD = /^(post|put|delete|patch)$/i;

export class CapabilityBridge {
  /** @param {{driver?, limits?}} opts  driver injected in tests; null => real lazy driver. */
  constructor({ driver = null, limits = {} } = {}) {
    this._driver = driver;
    this._limits = limits;
    this._instanceId = `bridge-${crypto.randomBytes(6).toString("hex")}`; // epoch: stale ids rejected
    this._manager = null;                 // ONE shared SessionManager (one browser, many isolated contexts)
    this._investigations = new Map();     // investigationId -> InvestigationState
    this._closed = false;
  }

  get instanceId() { return this._instanceId; }

  _manager_() {
    if (!this._manager) this._manager = cap.sessions.manager({ driver: this._driver, limits: this._limits });
    return this._manager;
  }

  // ---- Execution Context lifecycle (adapter-driven) -----------------------
  /**
   * Register a TRUSTED Execution Context. Called by the ADAPTER, never by the LLM.
   * ctx = { investigationId, scope, allowedCapabilities, limits?, approvals?, operationalSessionId? }
   */
  openInvestigation(ctx = {}) {
    if (this._closed) throw new BridgeError("bridge-closed", "bridge is shut down");
    const { investigationId, scope, allowedCapabilities } = ctx;
    if (!investigationId) throw new BridgeError("bad-context", "Execution Context requires investigationId");
    if (!scope || typeof scope !== "object") throw new BridgeError("bad-context", "Execution Context requires an authorized scope (Rule 0)");
    if (!Array.isArray(allowedCapabilities) || allowedCapabilities.length === 0) throw new BridgeError("bad-context", "Execution Context requires allowedCapabilities");
    for (const c of allowedCapabilities) if (!BRIDGE_CAPABILITIES.includes(c)) throw new BridgeError("bad-context", `unknown capability in context: ${c}`);
    if (this._investigations.has(investigationId)) throw new BridgeError("duplicate-investigation", `investigation already open: ${investigationId}`);
    const state = {
      ctx: {
        investigationId,
        scope: Object.freeze({ ...scope }),
        allowedCapabilities: Object.freeze([...allowedCapabilities]),
        limits: Object.freeze({ ...(ctx.limits || {}) }),
        approvals: Object.freeze((ctx.approvals || []).map((a) => ({ op: a.op || null, url: a.url || null }))),
        operationalSessionId: ctx.operationalSessionId || null,
        // Caido config (H2b-F1): operator-provided, NEVER from the LLM. The token is held
        // here only for the lifetime of the investigation and is never echoed in results.
        caido: ctx.caido ? Object.freeze({ baseUrl: ctx.caido.baseUrl || null, token: ctx.caido.token || null, projectId: ctx.caido.projectId || null, scopeId: ctx.caido.scopeId || null }) : null,
        // Persistent AUDIT evidence directory of the ACTIVE engagement (operator-provided, derived from
        // selectEngagement().evidenceDir). Absent ⇒ evidence-persisting ops are refused. NEVER a /tmp fallback.
        evidenceDir: ctx.evidenceDir || null,
      },
      sessions: new Set(),
      aborters: new Map(),
      resources: null, matrix: null, executor: null, validator: null, caido: null, copilot: null,
      caidoActive: null, caidoActiveLog: new Map(), caidoActiveCount: 0,
      record: null, workflow: null,
      createdAt: Date.now(),
    };
    this._investigations.set(investigationId, state);
    return { investigationId, instanceId: this._instanceId, allowedCapabilities: [...allowedCapabilities] };
  }

  _inv(investigationId) {
    const st = this._investigations.get(investigationId);
    if (!st) throw new BridgeError("unknown-investigation", `no such investigation in this process instance: ${investigationId}`);
    return st;
  }

  /** Attach a deterministic Copilot (H2b-F3) to an investigation. HOST/adapter-driven,
   *  never the LLM. The agent then READS it via copilot.* ops. */
  attachCopilot(investigationId, copilot) {
    const st = this._inv(investigationId);
    st.copilot = copilot || null;
    return { attached: !!copilot, investigationId };
  }
  _copilot(st) {
    if (!st.copilot) throw new BridgeError("copilot-not-attached", "no Copilot attached to this investigation (host must attachCopilot)");
    return st.copilot;
  }

  /** Attach a pre-built Investigation Record (H2b-F4b-1). Optional: the agent can also create one
   *  lazily via investigation.start. HOST-driven; the record is passive. */
  attachInvestigationRecord(investigationId, record) {
    const st = this._inv(investigationId);
    st.record = record || null;
    return { attached: !!record, investigationId };
  }
  // Lazily materialise the per-investigation Workflow planner (local; no Caido effects).
  _workflow(st) {
    if (!st.workflow) st.workflow = cap.workflow.planner({ engagementId: st.ctx.investigationId, caidoProjectId: st.ctx.caido ? st.ctx.caido.projectId : null, scope: st.ctx.scope });
    return st.workflow;
  }
  // From an existing Investigation Record (if attached), seed a workflow discovery (operator-initiated).
  _discoveryFromRecord(st, discovery) {
    if (discovery.from === "investigation" && st.record) {
      const r = st.record.toJSON();
      return { ...discovery, objective: discovery.objective || (r.hypothesis && r.hypothesis.text) || null,
        hypothesisId: r.hypothesis && r.hypothesis.id, investigationRecordRef: r.engagementId,
        kbTechnique: r.kbTechnique, evidence: discovery.evidence || r.historyEvidence };
    }
    return discovery;
  }

  // Lazily materialise the per-investigation record (bound to this engagement + Caido project).
  _record(st, createIfAbsent = false) {
    if (!st.record && createIfAbsent) {
      st.record = cap.investigation.record({ engagementId: st.ctx.investigationId, caidoProjectId: st.ctx.caido ? st.ctx.caido.projectId : null });
    }
    if (!st.record) throw new BridgeError("no-investigation-record", "no Investigation Record for this investigation (call investigation.start first)");
    return st.record;
  }

  _approved(ctx, op, url) {
    return ctx.approvals.some((a) => (a.op == null || a.op === op) && (a.url == null || a.url === url));
  }

  // ---- Caido read-only helpers (H2b-F1) -----------------------------------
  _caido(st) {
    const cfg = st.ctx.caido;
    if (!cfg || !cfg.baseUrl) throw new BridgeError("caido-not-configured", "this investigation has no operator-provided Caido config (baseUrl/token/projectId)");
    st.caido ||= cap.caido.client({ baseUrl: cfg.baseUrl, token: cfg.token });
    return st.caido;
  }

  // Enforce the explicit project↔engagement association: refuse to expose data
  // unless the instance's current project equals the authorized projectId. This
  // is what prevents cross-project / cross-engagement access.
  async _caidoAssoc(st, client, signal) {
    const want = st.ctx.caido.projectId;
    if (!want) throw new BridgeError("caido-no-project", "no authorized Caido projectId in the Execution Context");
    const cur = await client.currentProject({ signal });
    if (!cur || cur.id !== want) {
      throw new BridgeError("caido-project-mismatch", `authorized project ${want} is not the instance's current project${cur ? ` (${cur.id})` : ""}; refusing cross-project access`);
    }
    return cur;
  }

  // Keep only records whose target is in the engagement scope (Rule 0). Out-of-scope
  // records are withheld and counted, never handed to the agent.
  _scopeFilter(ctx, records) {
    let withheld = 0;
    const kept = [];
    for (const r of records) {
      try { validateTarget(r.url || r.record && r.record.url, ctx.scope); kept.push(r); }
      catch { withheld++; }
    }
    return { kept, withheld };
  }

  // Read-only scope ANNOTATION (never withholds). Marks whether a captured URL falls in the engagement
  // scope. Passive HTTP-History reads of the AUTHORIZED project (operator-approved via the project
  // association) expose ALL captured traffic; the in/out-of-scope LABEL is preserved for documents and
  // reports. This does NOT relax ACTIVE ops: caido.replay.run / caido.findings.create still hard-enforce
  // Rule 0 scope independently, and a host appearing in History is NEVER authorization to act against it.
  _inScope(ctx, url) { try { validateTarget(url, ctx.scope); return true; } catch { return false; } }

  // Structured evidence provenance, binding each record to its Caido origin and the
  // engagement, preserving the link to the original record. No credentials included.
  _caidoProvenance(projectId, engagementId, record) {
    return {
      provenance: {
        source: "caido", engagementId, caidoProjectId: projectId,
        caidoRequestId: record.caidoRequestId,
        caidoResponseId: record.response ? record.response.caidoResponseId : null,
        responseAvailable: record.responseAvailable,
        ts: record.createdAt || null,
      },
      resource: { host: record.host, method: record.method, url: record.url, statusCode: record.response ? record.response.statusCode : null },
      record, // inert, untrusted traffic data
    };
  }

  // ---- Caido ACTIVE helpers (H2b-F4a) -------------------------------------
  _caidoActive(st) {
    const cfg = st.ctx.caido;
    if (!cfg || !cfg.baseUrl) throw new BridgeError("caido-not-configured", "this investigation has no operator-provided Caido config (baseUrl/token/projectId)");
    st.caidoActive ||= cap.caido.activeClient({ baseUrl: cfg.baseUrl, token: cfg.token });
    return st.caidoActive;
  }
  // Resolve the EFFECTIVE replay target (host/port/isTLS → url) so scope is checked against the
  // destination that will actually be hit. A modified replay carries its own connection (this is
  // how a redirect to another host is detected); an unmodified replay uses the original request's.
  async _resolveReplayTarget(st, params, signal) {
    if (params.modifiedRaw != null) {
      const c = params.connection;
      if (!c || !c.host) throw new BridgeError("replay-prerequisites", "modified replay requires connection {host, isTLS, port}");
      return { url: `${c.isTLS ? "https" : "http"}://${c.host}${c.port && c.port !== (c.isTLS ? 443 : 80) ? `:${c.port}` : ""}/`, host: c.host, record: null };
    }
    if (!params.requestId) throw new BridgeError("replay-prerequisites", "caido.replay.run requires requestId or (modifiedRaw + connection)");
    const r = await this._caido(st).getRequest(params.requestId, { detail: true }, { signal });
    if (!r.found) throw new BridgeError("replay-prerequisites", `original request ${params.requestId} not found in Caido`);
    return { url: r.record.url, host: r.record.host, record: r.record };
  }
  _activeLimit(st) {
    const max = (st.ctx.limits && st.ctx.limits.maxActiveCaidoOps) || 20;
    if (st.caidoActiveCount >= max) throw new BridgeError("active-limit", `active Caido op limit reached for this investigation (${max})`);
  }

  // Resolve + CONFINE the destination for a persistent evidence write to the active engagement's
  // evidence dir. No engagement evidence dir in the context ⇒ refuse explicitly (never /tmp, never silent).
  _evidenceDir(st, candidate) {
    const base = st.ctx.evidenceDir;
    if (!base) throw new BridgeError("evidence-no-engagement", "persisting evidence requires an active engagement — none selected (its evidence dir is absent from the Execution Context)");
    try { return confineWithin(base, candidate || null, { ensureBase: true, ensure: !!candidate }); }
    catch { throw new BridgeError("evidence-path-escape", `evidence destination escapes the engagement evidence dir: ${candidate}`); }
  }

  _ownSession(st, sessionId, label = "session") {
    if (!sessionId) throw new BridgeError("bad-params", `${label} requires sessionId`);
    if (!st.sessions.has(sessionId)) throw new BridgeError("session-not-in-investigation", `${sessionId} does not belong to this investigation`);
    return sessionId;
  }

  // ---- The single typed entrypoint ----------------------------------------
  /**
   * invoke({ investigationId, op, params, operationId? }, { signal? }) -> sanitized JSON result.
   * The one call an adapter forwards from a registered tool. Never throws for domain failures:
   * returns { ok:false, error } so the agent gets a structured outcome.
   */
  async invoke(request = {}, { signal } = {}) {
    const { op, params = {}, investigationId, operationId = null } = request;
    try {
      if (this._closed) throw new BridgeError("bridge-closed", "bridge is shut down");
      const spec = BRIDGE_OPS[op];
      if (!spec) throw new BridgeError("unsupported-op", `unsupported op: ${op}`);

      // capabilities.* is pure discovery — allowed without an investigation.
      if (spec.capability === "capabilities") {
        const result = await this._discovery(op);
        return this._ok(op, spec, investigationId || null, result);
      }

      const st = this._inv(investigationId);
      const ctx = st.ctx;
      if (!ctx.allowedCapabilities.includes(spec.capability)) {
        throw new BridgeError("capability-not-allowed", `capability "${spec.capability}" not in this investigation's allowedCapabilities`);
      }

      // per-op AbortController, combined with the caller's signal (Pi passes its own).
      const ac = new AbortController();
      if (signal) { if (signal.aborted) ac.abort(); else signal.addEventListener("abort", () => ac.abort(), { once: true }); }
      if (operationId) st.aborters.set(operationId, ac);
      try {
        const result = await this._dispatch(st, op, spec, params, ac.signal);
        const env = this._ok(op, spec, investigationId, result);
        // Auto-mirror active-op outcome into the Investigation Record (honest; agent cannot fake it).
        if (st.record && MIRRORED_OPS.has(op)) { try { st.record.observeEnvelope(op, params, env); } catch { /* record never blocks the op */ } }
        return env;
      } finally {
        if (operationId) st.aborters.delete(operationId);
      }
    } catch (err) {
      // Preserve a structured code for BridgeError AND for CaidoError (prefixed), so the
      // agent gets precise, recoverable feedback instead of a generic "error".
      const code = (err instanceof BridgeError) ? err.code
        : (err && err.name === "CaidoError" && typeof err.code === "string") ? `caido-${err.code}`
        : (err && (err.name === "RecordError" || err.name === "WorkflowError") && typeof err.code === "string") ? err.code : "error";
      const env = { ok: false, instanceId: this._instanceId, investigationId: investigationId || null, op: op || null, error: { code, message: sanitizeMessage(err && err.message) } };
      // Mirror a blocked/failed active op into the Record (records the block honestly; never a success).
      if (MIRRORED_OPS.has(op)) { const st2 = investigationId ? this._investigations.get(investigationId) : null; if (st2 && st2.record) { try { st2.record.observeEnvelope(op, params, env); } catch { /* ignore */ } } }
      return env;
    }
  }

  _ok(op, spec, investigationId, result) {
    const envelope = { ok: true, instanceId: this._instanceId, investigationId, op, capability: spec.capability, result: sanitizeResult(result) };
    // Classifier preservation: copy the validator's verdict verbatim; the bridge never sets one.
    if (result && typeof result === "object" && typeof result.classification === "string") envelope.classification = result.classification;
    return envelope;
  }

  async _discovery(op) {
    if (op === "capabilities.list") {
      const byCap = {};
      for (const [name, s] of Object.entries(BRIDGE_OPS)) (byCap[s.capability] ||= []).push(name);
      return { instanceId: this._instanceId, capabilities: BRIDGE_CAPABILITIES, operations: byCap };
    }
    // capabilities.probe
    let visual = false, reason = null;
    try { const pr = await browserProbe(); visual = !!pr.available; reason = pr.reason || null; } catch (e) { reason = String(e && e.message || e); }
    return { backends: cap.capability.probe(), visual, reason };
  }

  async _dispatch(st, op, spec, params, signal) {
    const ctx = st.ctx;
    const manager = this._manager_();
    switch (op) {
      // ---- http.* (stateless) --------------------------------------------
      case "http.inspect": return cap.http.inspect({ url: params.url, method: params.method, headers: params.headers }, { scope: ctx.scope, signal });
      case "http.headers": return cap.http.headers({ url: params.url, method: params.method }, { scope: ctx.scope, signal });

      // ---- sessions.* (lifecycle) ----------------------------------------
      case "sessions.create": {
        const r = await manager.create({ scope: ctx.scope, kind: params.kind || "noauth", label: params.label || "", principal: params.principal || null, limits: ctx.limits, signal });
        st.sessions.add(r.sessionId);
        return r;
      }
      case "sessions.list": return { sessions: manager.list().filter((s) => st.sessions.has(s.sessionId)) };
      case "sessions.status": return manager.status(this._ownSession(st, params.sessionId));
      case "sessions.bindIdentity": return manager.bindIdentity(this._ownSession(st, params.sessionId), { principal: params.principal || null, kind: params.kind || "owner", label: params.label || "", captureAuthState: !!params.captureAuthState });
      case "sessions.close": { const id = this._ownSession(st, params.sessionId); const r = await manager.close(id); st.sessions.delete(id); return r; }

      // ---- browser.* (per-session actions) -------------------------------
      case "browser.navigate": return manager.request(this._ownSession(st, params.sessionId), { op: "navigate", url: params.url });
      case "browser.snapshot": return manager.request(this._ownSession(st, params.sessionId), { op: "snapshot" });
      case "browser.screenshot": { const dir = this._evidenceDir(st, params.dir); return manager.request(this._ownSession(st, params.sessionId), { op: "screenshot", dir }); }
      case "browser.network": return manager.request(this._ownSession(st, params.sessionId), { op: "network" });
      case "browser.console": return manager.request(this._ownSession(st, params.sessionId), { op: "console" });
      case "browser.click": {
        const id = this._ownSession(st, params.sessionId);
        if (!this._approved(ctx, op, params.url || null)) throw new BridgeError("state-change-unauthorized", "browser.click requires an adapter-provided approval");
        return manager.request(id, { op: "click", locator: params.locator });
      }
      case "browser.fill": {
        const id = this._ownSession(st, params.sessionId);
        if (!this._approved(ctx, op, params.url || null)) throw new BridgeError("state-change-unauthorized", "browser.fill requires an adapter-provided approval");
        return manager.request(id, { op: "fill", locator: params.locator, value: params.value });
      }
      case "browser.probe": {
        const id = this._ownSession(st, params.sessionId);
        const method = params.method || "GET";
        if (STATE_CHANGING_METHOD.test(method) && !this._approved(ctx, op, params.url || null)) {
          throw new BridgeError("state-change-unauthorized", `browser.probe ${method} requires an adapter-provided approval`);
        }
        return manager.request(id, { op: "probe", method, url: params.url, body: params.body, timeoutMs: params.timeoutMs });
      }

      // ---- authorization.* (IDOR/BOLA matrix; classifier preserved) ------
      case "authorization.registerResource": {
        st.resources ||= cap.authz.resources();
        return { resourceId: st.resources.register(params.resource || params) };
      }
      case "authorization.run": {
        st.resources ||= cap.authz.resources();
        st.matrix ||= cap.authz.matrix({ manager, resources: st.resources });
        const cases = (params.cases || []).map((c) => {
          this._ownSession(st, c.sessionId, "authorization case");
          // The agent cannot self-authorize: the bridge sets authorizedStateChange ONLY from ctx approvals.
          return { ...c, authorizedStateChange: this._approved(ctx, op, c.url || (c.request && c.request.url) || null) };
        });
        return st.matrix.run(cases, { signal });
      }

      // ---- concurrent.* --------------------------------------------------
      case "concurrent.run": {
        st.executor ||= cap.concurrent.executor({ manager });
        const exp = params.experiment || params;
        const operations = (exp.operations || []).map((o) => {
          this._ownSession(st, o.sessionId, "concurrent op");
          return { ...o, authorizedStateChange: this._approved(ctx, op, o.url || null) };
        });
        const prepared = st.executor.prepare({ ...exp, operations });
        return st.executor.run(prepared, { signal });
      }

      // ---- race.* (stateful validator; classifier preserved) -------------
      case "race.run": {
        const exp = params.experiment || params;
        // P2: fail fast with a RECOVERABLE, self-describing prerequisites error instead of a deep
        // or obscure failure. observerSessionId (when given) is an EXISTING session in this
        // investigation — NOT a new identity kind.
        if (!Array.isArray(exp.operations) || exp.operations.length === 0) {
          throw new BridgeError("race-prerequisites", "race.run requires experiment.operations: a non-empty array, each operation naming an existing in-investigation sessionId plus url/method; observerSessionId is OPTIONAL and must also be an existing session here (NOT a new identity kind — sessions.create kinds are owner|cross-user|noauth)");
        }
        st.executor ||= cap.concurrent.executor({ manager });
        st.validator ||= cap.race.validator({ manager, executor: st.executor });
        if (exp.observerSessionId) this._ownSession(st, exp.observerSessionId, "race.run observerSessionId (an existing authorized session in this investigation; not a new identity kind)");
        const operations = exp.operations.map((o) => {
          this._ownSession(st, o.sessionId, "race op");
          return { ...o, authorizedStateChange: this._approved(ctx, op, o.url || null) };
        });
        return st.validator.run({ ...exp, operations }, { signal });
      }

      // ---- caido.* (read-only; project-associated; scope-enforced) -------
      case "caido.health": {
        const client = this._caido(st);
        const health = await client.health({ signal });
        const want = ctx.caido.projectId;
        const associated = !!(want && health.currentProject && health.currentProject.id === want);
        return { source: "caido", endpoint: client.endpoint, ...health, authorizedProjectId: want || null, projectAssociated: associated };
      }
      case "caido.projects": {
        const client = this._caido(st);
        const r = await client.listProjects({ signal });
        // Do NOT auto-expose all projects' data: this only identifies accessibility.
        return { source: "caido", authorizedProjectId: ctx.caido.projectId || null, ...r };
      }
      case "caido.history": {
        const client = this._caido(st);
        const project = await this._caidoAssoc(st, client, signal);
        const page = await client.history({
          httpql: params.httpql || null, first: params.first, after: params.after || null,
          orderBy: params.orderBy, ordering: params.ordering,
          scopeId: ctx.caido.scopeId || params.scopeId || null, detail: !!params.detail,
        }, { signal });
        // Passive History of the authorized project is read IN FULL; each edge is annotated in/out-of-scope
        // (never withheld). The in/out distinction is preserved for documents/reports and analysis.
        let inScopeN = 0;
        const edges = page.edges.map((e) => {
          const inScope = this._inScope(ctx, e.record && e.record.url);
          if (inScope) inScopeN++;
          return { cursor: e.cursor, inScope, ...this._caidoProvenance(project.id, st.ctx.investigationId, e.record) };
        });
        return {
          source: "caido", caidoProjectId: project.id, engagementId: st.ctx.investigationId,
          count: page.count, order: page.order, pageInfo: page.pageInfo,
          scopeCounts: { inScope: inScopeN, outOfScope: edges.length - inScopeN },
          outOfScopeWithheld: 0, // read path no longer withholds captured History (see edge.inScope)
          edges,
        };
      }
      case "caido.request": {
        const client = this._caido(st);
        const project = await this._caidoAssoc(st, client, signal);
        const r = await client.getRequest(params.id, { detail: !!params.detail }, { signal });
        if (!r.found) return { source: "caido", caidoProjectId: project.id, found: false, caidoRequestId: r.caidoRequestId };
        // Read-only recovery of a captured request/response is allowed for ANY host in the authorized
        // project; annotate in/out-of-scope rather than refusing. Active ops still enforce scope separately.
        const inScope = this._inScope(ctx, r.record.url);
        return { source: "caido", found: true, inScope, ...this._caidoProvenance(project.id, st.ctx.investigationId, r.record) };
      }

      // ---- copilot.* (read-only deterministic context; no LLM) -----------
      case "copilot.summary":         return this._copilot(st).summary();
      case "copilot.endpoints":       return { endpoints: this._copilot(st).endpoints_() };
      case "copilot.hypotheses":      return { hypotheses: this._copilot(st).hypotheses({ klass: params.klass || null }) };
      case "copilot.recommendations": return { recommendations: this._copilot(st).recommendations_({ state: params.state || null, sort: params.sort || "priority" }) };
      case "copilot.unassessed":      return { unassessed: this._copilot(st).unassessedSurface() };
      case "copilot.relate":          return { relations: this._copilot(st).relateToKb() };
      case "copilot.setState":        return this._copilot(st).setRecommendationState(params.id, params.state);

      // ---- caido.* READ testing ops (H2b-F4a; capability "caido") ---------
      case "caido.findings.list": {
        const client = this._caidoActive(st);
        const project = await this._caidoAssoc(st, this._caido(st), signal);
        const r = await client.listFindings({ reporter: params.reporter || null, first: params.first, after: params.after || null }, { signal });
        const kept = []; let withheld = 0;
        for (const f of r.findings) { try { validateTarget(`https://${f.host}${f.path || "/"}`, ctx.scope); kept.push(f); } catch { withheld++; } }
        return { source: "caido", caidoProjectId: project.id, engagementId: ctx.investigationId, pageInfo: r.pageInfo, outOfScopeWithheld: withheld, findings: kept };
      }
      case "caido.findings.get": {
        const client = this._caidoActive(st);
        const project = await this._caidoAssoc(st, this._caido(st), signal);
        const f = await client.getFinding(params.id, { signal });
        if (!f) return { source: "caido", caidoProjectId: project.id, found: false };
        try { validateTarget(`https://${f.host}${f.path || "/"}`, ctx.scope); } catch { throw new BridgeError("out-of-scope", `finding ${params.id} target is outside the engagement scope`); }
        return { source: "caido", caidoProjectId: project.id, found: true, finding: f };
      }
      case "caido.replay.sessions": {
        const client = this._caidoActive(st);
        const project = await this._caidoAssoc(st, this._caido(st), signal);
        const r = await client.listReplaySessions({ first: params.first, after: params.after || null }, { signal });
        return { source: "caido", caidoProjectId: project.id, ...r };
      }
      case "caido.replay.entry": {
        const client = this._caidoActive(st);
        const project = await this._caidoAssoc(st, this._caido(st), signal);
        const entry = await client.getReplayEntry(params.id, params.kind || "HTTP", { signal });
        if (entry) { const h = entry.connection && entry.connection.host || entry.request && entry.request.host;
          if (h) { try { validateTarget(`https://${h}/`, ctx.scope); } catch { throw new BridgeError("out-of-scope", `replay entry ${params.id} target is outside the engagement scope`); } } }
        return { source: "caido", caidoProjectId: project.id, engagementId: ctx.investigationId, entry };
      }
      case "caido.automate.sessions": {
        const client = this._caidoActive(st);
        const project = await this._caidoAssoc(st, this._caido(st), signal);
        const r = await client.listAutomateSessions({ first: params.first, after: params.after || null }, { signal });
        const kept = []; let withheld = 0;
        for (const s of r.sessions) { const h = s.connection && s.connection.host; try { if (h) validateTarget(`https://${h}/`, ctx.scope); kept.push(s); } catch { withheld++; } }
        return { source: "caido", caidoProjectId: project.id, pageInfo: r.pageInfo, outOfScopeWithheld: withheld, sessions: kept };
      }
      case "caido.automate.session": {
        const client = this._caidoActive(st);
        const project = await this._caidoAssoc(st, this._caido(st), signal);
        const s = await client.getAutomateSession(params.id, { signal });
        if (s && s.connection && s.connection.host) { try { validateTarget(`https://${s.connection.host}/`, ctx.scope); } catch { throw new BridgeError("out-of-scope", `automate session ${params.id} target is outside the engagement scope`); } }
        return { source: "caido", caidoProjectId: project.id, session: s || null };
      }

      // ---- caido.* ACTIVE testing ops (H2b-F4a; capability "caido-active") -
      case "caido.replay.run": {
        // 1) prerequisites + effective target resolution (detects modified-connection redirects)
        const target = await this._resolveReplayTarget(st, params, signal);
        // 2) scope BEFORE execution (Rule 0) — refuse out-of-scope / redirected destinations
        try { validateTarget(target.url, ctx.scope); }
        catch { throw new BridgeError("out-of-scope", `replay target ${target.host} is outside the engagement scope`); }
        // 3) operator approval (NOT an LLM boolean): reading History does not authorize Replay
        if (!this._approved(ctx, op, target.url) && !this._approved(ctx, op, null)) {
          throw new BridgeError("state-change-unauthorized", "caido.replay.run requires an operator approval for this target");
        }
        // 4) idempotency: the same key never double-executes after a retry
        const idem = params.idempotencyKey || `replay:${params.requestId || ""}:${target.host}:${params.modifiedRaw ? "mod" : "orig"}`;
        if (st.caidoActiveLog.has(idem)) return { ...st.caidoActiveLog.get(idem), duplicate: true };
        // 5) quantity limit + project association
        this._activeLimit(st);
        const project = await this._caidoAssoc(st, this._caido(st), signal);
        // 6) execute (server-side active request)
        st.caidoActiveCount++;
        const r = await this._caidoActive(st).replay({ requestId: params.requestId || null, kind: params.kind || "HTTP", modifiedRaw: params.modifiedRaw != null ? params.modifiedRaw : null, connection: params.connection || null, settings: params.settings || null }, { signal });
        // 7) scope AFTER: a result whose effective host left scope is withheld (redirect control)
        let resultOutOfScope = false;
        const effHost = r.entry && (r.entry.connection && r.entry.connection.host || r.entry.request && r.entry.request.host);
        if (effHost) { try { validateTarget(`https://${effHost}/`, ctx.scope); } catch { resultOutOfScope = true; } }
        if (resultOutOfScope && r.entry) { r.entry.raw = null; r.entry.response = null; }
        const outcome = resultOutOfScope ? "blocked-result-out-of-scope" : (r.responseAvailable ? "executed" : "inconclusive");
        // 8) comparison with the original request (when replaying an existing one)
        let comparison = null;
        if (target.record && target.record.response && r.entry && r.entry.response) {
          comparison = { original: { statusCode: target.record.response.statusCode, length: target.record.response.length },
            replay: { statusCode: r.entry.response.statusCode, length: r.entry.response.length },
            changed: target.record.response.statusCode !== r.entry.response.statusCode || target.record.response.length !== r.entry.response.length };
        }
        const result = {
          source: "caido", caidoProjectId: project.id, engagementId: ctx.investigationId, outcome,
          provenance: { source: "caido-replay", engagementId: ctx.investigationId, caidoProjectId: project.id,
            originalRequestId: params.requestId || null, replaySessionId: r.sessionId, replayTaskId: r.taskId,
            replayEntryId: r.entry ? r.entry.replayEntryId : null, responseAvailable: r.responseAvailable, ts: new Date().toISOString() },
          resource: { host: target.host, resultOutOfScope }, comparison, entry: r.entry,
        };
        st.caidoActiveLog.set(idem, result);
        return { ...result, duplicate: false };
      }
      case "caido.findings.create": {
        if (!params.requestId) throw new BridgeError("findings-prerequisites", "caido.findings.create requires a requestId (identifiable evidence) — no finding without evidence");
        if (!params.title || !params.reporter) throw new BridgeError("findings-prerequisites", "caido.findings.create requires title and reporter");
        // Operator approval required — a Copilot heuristic alone never creates a finding.
        if (!this._approved(ctx, op, null) && !this._approved(ctx, op, params.requestId)) {
          throw new BridgeError("state-change-unauthorized", "caido.findings.create requires an operator approval");
        }
        const client = this._caidoActive(st);
        const project = await this._caidoAssoc(st, this._caido(st), signal);
        // Evidence must exist & be in scope (traceable to a real request).
        const orig = await this._caido(st).getRequest(params.requestId, { detail: false }, { signal });
        if (!orig.found) throw new BridgeError("findings-prerequisites", `evidence request ${params.requestId} not found in Caido`);
        try { validateTarget(orig.record.url, ctx.scope); } catch { throw new BridgeError("out-of-scope", `finding evidence ${params.requestId} is outside the engagement scope`); }
        this._activeLimit(st);
        st.caidoActiveCount++;
        const r = await client.createFinding({ requestId: params.requestId, title: params.title, reporter: params.reporter, dedupeKey: params.dedupeKey || null, description: params.description || null }, { signal });
        return { source: "caido", caidoProjectId: project.id, engagementId: ctx.investigationId, created: r.created, duplicate: r.duplicate,
          provenance: { source: "caido-finding", engagementId: ctx.investigationId, caidoProjectId: project.id, requestId: params.requestId, ts: new Date().toISOString() },
          finding: r.finding };
      }

      // ---- investigation.* (passive Supervised Investigation Record) ------
      case "investigation.start": {
        const rec = this._record(st, true);
        if (params.hypothesis) rec.setHypothesis({ id: params.hypothesisId || null, text: params.hypothesis, objective: params.objective || null });
        if (params.modality) rec.modality = params.modality;
        if (params.kbTechnique || params.route) rec.setKbTechnique({ id: params.kbTechnique || null, route: params.route || null, keywords: params.keywords || null });
        return rec.toJSON();
      }
      case "investigation.kb":        return this._record(st).setKbTechnique({ id: params.techniqueId || null, route: params.route || null, keywords: params.keywords || null });
      case "investigation.evidence":  return { historyEvidence: this._record(st).addHistoryEvidence(params.evidence || []) };
      case "investigation.propose":   return this._record(st).proposeOperation({ kind: params.kind, requestId: params.requestId || null, modified: !!params.modified, summary: params.summary || null });
      case "investigation.interpret": {
        const rec = this._record(st);
        if (params.interpretation != null) rec.setInterpretation(params.interpretation);
        for (const l of (params.limitations || [])) rec.addLimitation(l);
        return rec.toJSON();
      }
      case "investigation.finalize":  return this._record(st).finalize({ status: params.status });
      case "investigation.snapshot":  return this._record(st).snapshot(params.reason || "turn-or-budget-ended");
      case "investigation.get":       return this._record(st).toJSON();

      // ---- workflow.* (local offline planner/validator; no Caido effects) -
      case "workflow.propose":  return this._workflow(st).propose(this._discoveryFromRecord(st, params.discovery || params || {}));
      case "workflow.get":      return this._workflow(st).get(params.id);
      case "workflow.list":     return { proposals: this._workflow(st).list() };
      case "workflow.validate": return this._workflow(st).validate(params.id);
      case "workflow.generate": return this._workflow(st).generate(params.id);

      default: throw new BridgeError("unsupported-op", `unsupported op: ${op}`);
    }
  }

  // ---- cancellation / cleanup / shutdown ----------------------------------
  /** Cancel one op (by operationId) or every in-flight op of an investigation. */
  cancel(investigationId, operationId = null) {
    const st = this._investigations.get(investigationId);
    if (!st) return { cancelled: false, reason: "unknown-investigation" };
    if (operationId) { const ac = st.aborters.get(operationId); if (ac) { ac.abort(); return { cancelled: true, operationId }; } return { cancelled: false, reason: "unknown-operation" }; }
    let n = 0; for (const ac of st.aborters.values()) { ac.abort(); n++; } return { cancelled: true, aborted: n };
  }

  /** Close one investigation: abort its ops, close ITS sessions (siblings/browser untouched). */
  async closeInvestigation(investigationId) {
    const st = this._investigations.get(investigationId);
    if (!st) return { closed: false, reason: "unknown-investigation" };
    for (const ac of st.aborters.values()) { try { ac.abort(); } catch { /* ignore */ } }
    let closedSessions = 0;
    if (this._manager) {
      for (const id of st.sessions) { try { await this._manager.close(id); closedSessions++; } catch { /* ignore */ } }
    }
    this._investigations.delete(investigationId);
    return { closed: true, investigationId, closedSessions };
  }

  /** Shut the bridge down: close every investigation and RELEASE the browser. In-memory state
   *  is invalidated explicitly — a restarted process does NOT recover sessions (no fake recovery). */
  async shutdown() {
    const ids = [...this._investigations.keys()];
    for (const id of ids) { try { await this.closeInvestigation(id); } catch { /* ignore */ } }
    if (this._manager) { try { await this._manager.closeAll(); } catch { /* ignore */ } this._manager = null; }
    this._closed = true;
    return { closedInvestigations: ids.length };
  }

  /** Visual browser availability (runtime probe; never a static claim). */
  async visualAvailable() { return this._manager_().visualAvailable(); }
}

function sanitizeMessage(msg) {
  if (!msg) return "error";
  // Never echo a cookie/token/password that happened to land in an error string.
  return String(msg).replace(/(authorization|cookie|token|password|bearer)\s*[:=]\s*\S+/gi, "$1=[redacted]").slice(0, 400);
}

export function createBridge(opts) { return new CapabilityBridge(opts); }
