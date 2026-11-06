// SecurityAuditor — Concurrent Execution Foundation (H1c-F1).
// Coordinates MULTIPLE authenticated HTTP operations across existing sessions, with a bounded
// concurrency pool and an async START BARRIER. Deterministic in COORDINATION only — it does NOT
// promise that requests ARRIVE at the server simultaneously (that honesty is a design rule).
//
// Reuses the Session Manager's authenticated channel (`request({op:"probe"})`) — cookies/tokens
// stay sealed in each BrowserContext and are NEVER extracted. Reuses Rule 0 (Scope Guard),
// Rule 6 + evidence-hygiene (no sensitive bodies stored). No scheduler, DB, queue, worker process
// or orchestration framework. No race/TOCTOU logic (that is H1c-F2).
import crypto from "node:crypto";
import { validateTarget, ScopeError } from "./scope.mjs";

export const DEFAULT_LIMITS = Object.freeze({
  maxConcurrency: 2,     // conservative default
  maxOps: 16,            // per experiment
  opTimeoutMs: 10000,    // individual (in-page fetch abort)
  globalTimeoutMs: 30000, // whole experiment
});

export const OP_STATES = Object.freeze(["ok", "failed", "timeout", "cancelled", "blocked"]);

function newId(p) { return `${p}-${crypto.randomBytes(5).toString("hex")}`; }

/** Minimal counting semaphore (bounds in-flight operations). */
function semaphore(max) {
  let cur = 0; const q = [];
  const acquire = () => new Promise((res) => { const go = () => { if (cur < max) { cur++; res(); } else q.push(go); }; go(); });
  const release = () => { cur = Math.max(0, cur - 1); const n = q.shift(); if (n) n(); };
  return { acquire, release };
}

export class ConcurrentExecutor {
  /** @param {{manager, limits?}} deps */
  constructor({ manager, limits = {} } = {}) {
    if (!manager) throw new Error("ConcurrentExecutor requires { manager }");
    this.m = manager;
    this._defaults = { ...DEFAULT_LIMITS, ...limits };
    this._experiments = new Map(); // experimentId -> record
  }

  // ---- concurrent.prepare --------------------------------------------------
  /** Validate operations, bind sessions, apply scope + state-change gates. No execution. */
  prepare(experiment = {}) {
    const limits = { ...this._defaults, ...(experiment.limits || {}) };
    const ops = Array.isArray(experiment.operations) ? experiment.operations : [];
    if (ops.length > limits.maxOps) throw new Error(`too many operations (${ops.length} > maxOps ${limits.maxOps})`);
    const experimentId = experiment.experimentId || newId("exp");

    const operations = ops.map((op, i) => {
      const operationId = op.operationId || `op-${i + 1}`;
      const sessionId = op.sessionId;
      const method = (op.method || "GET").toUpperCase();
      const url = op.url;
      const desc = { operationId, sessionId, principalId: null, method, url, hasBody: op.body != null, timeoutMs: op.timeoutMs || null, valid: true, blockReason: null, _body: op.body ?? null };
      const meta = this.m.get(sessionId);
      if (!meta || meta.closed) { desc.valid = false; desc.blockReason = "session-invalid"; return desc; }
      desc.principalId = meta.principalId;
      // Rule 0: block out-of-scope targets BEFORE running
      const scope = this.m.scopeOf(sessionId);
      try { if (!url) throw new ScopeError("missing url", url); validateTarget(url, scope); }
      catch { desc.valid = false; desc.blockReason = "out-of-scope"; return desc; }
      // state-changing ops require explicit authorization + reversible fixture
      if (op.policy && op.policy.stateChanging && !op.authorizedStateChange) { desc.valid = false; desc.blockReason = "state-change-unauthorized"; }
      return desc;
    });

    const abort = new AbortController();
    const rec = { experimentId, state: "prepared", limits, operations, results: null, abort, cancelled: false, preparedAt: Date.now(), barrierReleasedAt: null, finishedAt: null };
    this._experiments.set(experimentId, rec);
    return { experimentId, state: "prepared", limits, operations: operations.map(({ _body, ...d }) => d) };
  }

  // ---- concurrent.run ------------------------------------------------------
  /** Release the barrier and execute (bounded by maxConcurrency). Honors cancel/timeouts. */
  async run(prepared, { signal } = {}) {
    const experimentId = typeof prepared === "string" ? prepared : prepared && prepared.experimentId;
    const rec = this._experiments.get(experimentId);
    if (!rec) throw new Error(`unknown experiment: ${experimentId}`);
    if (rec.state === "running") throw new Error(`experiment already running: ${experimentId}`);

    const mkResult = (d, extra) => ({ operationId: d.operationId, principalId: d.principalId, sessionId: d.sessionId, method: d.method, url: d.url, requestId: null, status: null, ok: false, latencyMs: null, startedAt: null, endedAt: null, error: null, blockReason: d.blockReason, ...extra });

    // Cancelled before the barrier ever opened → nothing runs.
    if (rec.cancelled || rec.abort.signal.aborted) {
      rec.state = "cancelled"; rec.finishedAt = Date.now();
      rec.results = rec.operations.map((d) => mkResult(d, { state: "cancelled" }));
      return this._report(rec);
    }

    rec.state = "running";
    if (signal) { if (signal.aborted) rec.abort.abort(); else signal.addEventListener("abort", () => rec.abort.abort(), { once: true }); }
    const globalTimer = setTimeout(() => rec.abort.abort(), rec.limits.globalTimeoutMs);
    const sem = semaphore(rec.limits.maxConcurrency);

    let release; const barrier = new Promise((r) => (release = r));
    const results = new Array(rec.operations.length);

    const runners = rec.operations.map((d, idx) => (async () => {
      if (!d.valid) { results[idx] = mkResult(d, { state: "blocked" }); return; }
      await barrier;
      if (rec.abort.signal.aborted) { results[idx] = mkResult(d, { state: "cancelled" }); return; }
      await sem.acquire();
      try {
        if (rec.abort.signal.aborted) { results[idx] = mkResult(d, { state: "cancelled" }); return; }
        const startedAt = Date.now();
        const opTimeout = Math.min(d.timeoutMs || Infinity, rec.limits.opTimeoutMs);
        let p;
        try { p = await this.m.request(d.sessionId, { op: "probe", method: d.method, url: d.url, body: d._body, timeoutMs: opTimeout }); }
        catch (e) {
          const endedAt = Date.now();
          results[idx] = mkResult(d, { state: "failed", startedAt, endedAt, latencyMs: endedAt - startedAt, error: String(e && e.message || e) });
          return;
        }
        const endedAt = Date.now();
        const status = p.status || 0;
        const state = p.error === "timeout" ? "timeout" : (status > 0 ? "ok" : "failed");
        results[idx] = mkResult(d, { state, status, ok: status >= 200 && status < 300, requestId: p.requestId, startedAt, endedAt, latencyMs: endedAt - startedAt, error: p.error || null });
      } finally { sem.release(); }
    })());

    rec.barrierReleasedAt = Date.now();
    release(); // open the barrier (coordination point — NOT a guarantee of simultaneous arrival)
    await Promise.allSettled(runners);
    clearTimeout(globalTimer);

    rec.results = results.map((r, i) => r || mkResult(rec.operations[i], { state: rec.abort.signal.aborted ? "cancelled" : "failed" }));
    rec.state = rec.abort.signal.aborted ? "cancelled" : "done";
    rec.finishedAt = Date.now();
    return this._report(rec);
  }

  // ---- concurrent.cancel ---------------------------------------------------
  cancel(experimentId) {
    const rec = this._experiments.get(typeof experimentId === "string" ? experimentId : experimentId && experimentId.experimentId);
    if (!rec) return { cancelled: false };
    rec.cancelled = true; rec.abort.abort();
    return { cancelled: true, experimentId: rec.experimentId };
  }

  // ---- concurrent.status ---------------------------------------------------
  status(experimentId) {
    const rec = this._experiments.get(typeof experimentId === "string" ? experimentId : experimentId && experimentId.experimentId);
    if (!rec) return null;
    const byState = {}; for (const s of OP_STATES) byState[s] = 0;
    for (const r of rec.results || []) if (byState[r.state] != null) byState[r.state]++;
    return { experimentId: rec.experimentId, state: rec.state, total: rec.operations.length, byState, preparedAt: rec.preparedAt, barrierReleasedAt: rec.barrierReleasedAt, finishedAt: rec.finishedAt };
  }

  _report(rec) {
    const summary = {}; for (const s of OP_STATES) summary[s] = 0;
    for (const r of rec.results) if (summary[r.state] != null) summary[r.state]++;
    return {
      experimentId: rec.experimentId, state: rec.state,
      results: rec.results.slice(),
      summary,
      timings: { preparedAt: rec.preparedAt, barrierReleasedAt: rec.barrierReleasedAt, finishedAt: rec.finishedAt },
    };
  }
}

export function createConcurrentExecutor(deps) { return new ConcurrentExecutor(deps); }
