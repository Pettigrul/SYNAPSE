// SecurityAuditor — Caido Live History Monitor (H2b-F2).
//
// An INCREMENTAL, DETERMINISTIC poller over the read-only Caido Adapter (H2b-F1).
// It tails a project's HTTP History while the operator pentests manually, WITHOUT
// per-request LLM calls, writes, Replay, Findings or workflows. Node stdlib only,
// ZERO new dependencies, no database, no generic scheduler, no extra service.
//
// DIAGNOSIS (why this design): the Caido GraphQL `requests` connection is a
// cursor-paginated QUERY over a MUTABLE dataset (it exposes a `snapshot` scalar),
// NOT an append-only event log. Cursors are opaque and there is no documented
// change-feed. So this monitor does NOT treat `after: endCursor` as an event log:
//   - it orders by CREATED_AT ASC (verified enum) and DEDUPES by the stable
//     request `id` (never re-emitting a seen record — idempotent reprocessing);
//   - it reconciles LATE-ARRIVING responses by re-reading specific request ids
//     (not by hoping the cursor re-surfaces them);
//   - it periodically RECONCILES a createdAt window to catch out-of-order inserts
//     / records missed across disconnects.
// It reuses the F1 bridge path (project association + Scope Guard + provenance +
// redaction) through an injected `source`, so every F1 guarantee holds here too.

import fs from "node:fs";
import path from "node:path";

export const MONITOR_SCHEMA = 1;
export const MONITOR_STATES = Object.freeze(["IDLE", "RUNNING", "PAUSED", "STOPPED", "ERROR"]);
export const CONNECTION = Object.freeze(["unknown", "up", "down"]);

export const DEFAULT_LIMITS = Object.freeze({
  pageSize: 50,
  maxPagesPerCycle: 10,       // bound work per tick (backlog control)
  maxSeenIds: 10000,          // dedup memory cap
  maxAwaiting: 2000,          // pending-response memory cap
  maxEvents: 5000,            // read-buffer cap for F3
  reconcileEveryCycles: 10,   // periodic out-of-order / missed reconciliation
  reconcilePerCycle: 50,      // late-response re-reads per tick (bounded)
  maxRetries: 5,              // transient-failure retries before ERROR
  backoffBaseMs: 200,
  backoffMaxMs: 5000,
});

// Error codes that are PERMANENT (go straight to ERROR, no retry) vs transient.
const PERMANENT = /caido-(project-mismatch|not-configured|no-project|auth-failed|bad-config)|out-of-scope/;

export class MonitorError extends Error {
  constructor(code, message) { super(message || code); this.name = "MonitorError"; this.code = code; }
}

// Build a monitor `source` from the Capability Bridge — reusing the F1 read ops
// (so association, scope filtering, provenance and redaction all apply).
export function createBridgeSource({ bridge, investigationId }) {
  const call = async (op, params, signal) => {
    const r = await bridge.invoke({ investigationId, op, params }, { signal });
    if (!r.ok) { const e = new MonitorError(r.error.code, r.error.message); throw e; }
    return r.result;
  };
  return {
    history: (params, { signal } = {}) => call("caido.history", params, signal),
    getRequest: (id, { signal } = {}) => call("caido.request", { id }, signal),
  };
}

function nowIso(clock) { return new Date(clock.now()).toISOString(); }

// Metadata-only event (references + provenance, never full traffic content).
function toEvent(type, rec, clock) {
  const p = rec.provenance || {};
  const r = rec.resource || {};
  return {
    type, at: nowIso(clock),
    engagementId: p.engagementId || null, caidoProjectId: p.caidoProjectId || null,
    caidoRequestId: p.caidoRequestId || null, caidoResponseId: p.caidoResponseId || null,
    responseAvailable: !!p.responseAvailable, ts: p.ts || null,
    host: r.host || null, method: r.method || null, url: r.url || null, statusCode: r.statusCode || null,
  };
}

export class CaidoHistoryMonitor {
  constructor({ engagementId, caidoProjectId, source, statePath = null, limits = {}, clock, sleep } = {}) {
    if (!engagementId) throw new MonitorError("bad-config", "engagementId required");
    if (!caidoProjectId) throw new MonitorError("bad-config", "caidoProjectId required");
    if (!source || typeof source.history !== "function") throw new MonitorError("bad-config", "source.history required");
    this.engagementId = engagementId;
    this.caidoProjectId = caidoProjectId;
    this.source = source;
    this.statePath = statePath;
    this.L = { ...DEFAULT_LIMITS, ...limits };
    this.clock = clock || { now: () => Date.now() };
    this.sleep = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    this._timer = null;
    this._events = [];
    this._eventsDropped = 0;
    this._cycles = 0;
    this._reset();
  }

  _reset() {
    this.state = "IDLE";
    this.connection = "unknown";
    this.cursor = null;
    this.lastCreatedAt = null;
    this.processedCount = 0;
    this.seenIds = new Set();
    this.seenOrder = [];           // insertion order for bounded eviction
    this.awaiting = new Map();     // id -> { firstSeenAt, cycles }
    this.failures = [];
    this.pending = [];             // recorded drops / overflow (NO silent loss)
    this.backlog = null;
    this.lastSyncAt = null;
    this.lastReconcileAt = null;
    this.stats = { new: 0, updated: 0 };
    this._retries = 0;
  }

  // ---- persistence (atomic temp+rename; crash-safe) -----------------------
  async load() {
    if (!this.statePath || !fs.existsSync(this.statePath)) return false;
    let st;
    try { st = JSON.parse(fs.readFileSync(this.statePath, "utf8")); }
    catch { this.pending.push({ at: nowIso(this.clock), kind: "corrupt-state", note: "ignored unreadable state file" }); return false; }
    if (st.schema > MONITOR_SCHEMA) throw new MonitorError("schema-too-new", `state schema ${st.schema} > ${MONITOR_SCHEMA}`);
    if (st.engagementId !== this.engagementId || st.caidoProjectId !== this.caidoProjectId) {
      throw new MonitorError("state-mismatch", "state file belongs to a different engagement/project");
    }
    const c = st.checkpoint || {};
    this.cursor = c.cursor || null;
    this.lastCreatedAt = c.lastCreatedAt || null;
    this.processedCount = c.processedCount || 0;
    this.seenIds = new Set(st.seenIds || []);
    this.seenOrder = [...(st.seenIds || [])];
    this.awaiting = new Map(Object.entries(st.awaitingResponse || {}));
    this.lastReconcileAt = st.lastReconcileAt || null;
    this.failures = st.failures || [];
    this.stats = st.stats || { new: 0, updated: 0 };
    this.state = (st.state === "RUNNING") ? "PAUSED" : (st.state || "IDLE"); // never auto-resume on load
    return true;
  }

  async persist() {
    if (!this.statePath) return;
    const snapshot = {
      schema: MONITOR_SCHEMA,
      engagementId: this.engagementId, caidoProjectId: this.caidoProjectId,
      state: this.state,
      checkpoint: { cursor: this.cursor, lastCreatedAt: this.lastCreatedAt, processedCount: this.processedCount },
      seenIds: this.seenOrder.slice(-this.L.maxSeenIds),
      awaitingResponse: Object.fromEntries(this.awaiting),
      lastReconcileAt: this.lastReconcileAt,
      failures: this.failures.slice(-50),
      stats: this.stats,
      updatedAt: nowIso(this.clock),
    };
    const dir = path.dirname(this.statePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.statePath}.tmp-${process.pid}-${this.clock.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2));
    fs.renameSync(tmp, this.statePath); // atomic replace
  }

  // ---- lifecycle ----------------------------------------------------------
  async start({ intervalMs = 5000, immediate = true } = {}) {
    if (this.state === "RUNNING") return this.status();
    await this.load().catch((e) => { this.pending.push({ at: nowIso(this.clock), kind: "load-error", note: e.code || e.message }); });
    this.state = "RUNNING";
    const loop = async () => {
      if (this.state !== "RUNNING") return;
      try { await this.tick(); } catch (e) { /* tick records its own failures */ }
      if (this.state === "RUNNING") this._timer = setTimeout(loop, intervalMs);
    };
    if (immediate) await loop(); else this._timer = setTimeout(loop, intervalMs);
    return this.status();
  }

  pause() { if (this.state === "RUNNING") this.state = "PAUSED"; this._clearTimer(); return this.status(); }
  resume({ intervalMs = 5000 } = {}) { if (this.state === "PAUSED") return this.start({ intervalMs }); return this.status(); }
  async stop() { this.state = "STOPPED"; this._clearTimer(); await this.persist().catch(() => {}); return this.status(); }
  async shutdown() { this._clearTimer(); if (this.state !== "STOPPED") this.state = "STOPPED"; await this.persist().catch(() => {}); return this.status(); }
  _clearTimer() { if (this._timer) { clearTimeout(this._timer); this._timer = null; } }

  // ---- the deterministic unit of work ------------------------------------
  // One incremental cycle. Safe to call directly in tests (no real timers).
  async tick({ signal } = {}) {
    if (this.state !== "RUNNING") return { skipped: this.state };
    this._cycles++;
    const reconcile = (this._cycles % this.L.reconcileEveryCycles === 0);
    try {
      await this._poll({ signal, reconcile });
      await this._reconcileResponses({ signal });
      this.connection = "up";
      this._retries = 0;
      this.lastSyncAt = nowIso(this.clock);
      if (reconcile) this.lastReconcileAt = this.lastSyncAt;
      await this.persist();
      return { ok: true, cycle: this._cycles, reconcile };
    } catch (e) {
      return await this._onFailure(e, signal);
    }
  }

  async _poll({ signal, reconcile }) {
    // reconcile mode: re-scan from the beginning (or last window) to catch
    // out-of-order inserts / records missed across a disconnect. Dedup makes it idempotent.
    let after = reconcile ? null : this.cursor;
    let lastCount = null;
    for (let page = 0; page < this.L.maxPagesPerCycle; page++) {
      if (signal && signal.aborted) throw new MonitorError("cancelled", "monitor cancelled");
      const res = await this.source.history({
        first: this.L.pageSize, after, orderBy: "CREATED_AT", ordering: "ASC",
      }, { signal });
      if (typeof res.count === "number") lastCount = res.count;
      const edges = res.edges || [];
      let newInPage = 0;
      for (const edge of edges) {
        const id = edge.provenance && edge.provenance.caidoRequestId;
        if (!id) continue;
        const ts = edge.provenance.ts || null;
        if (this.seenIds.has(id)) {
          // already seen: detect a response that arrived since.
          if (edge.record && edge.record.responseAvailable && this.awaiting.has(id)) this._markUpdated(id, edge);
          continue;
        }
        this._addSeen(id);
        this.processedCount++;
        newInPage++;
        this.stats.new++;
        this._emit(toEvent("new", edge, this.clock));
        if (!(edge.record && edge.record.responseAvailable)) this._addAwaiting(id);
        else this.awaiting.delete(id);
        if (ts && (!this.lastCreatedAt || ts > this.lastCreatedAt)) this.lastCreatedAt = ts;
      }
      // advance the fast-path cursor from the connection's pageInfo
      const pi = res.pageInfo || {};
      if (!reconcile && pi.endCursor) this.cursor = pi.endCursor;
      if (!pi.hasNextPage) break;
      if (!reconcile && newInPage === 0) break; // fast-path: nothing new beyond cursor
      after = pi.endCursor || after;
    }
    // backlog computed AFTER processing, against the final processed count.
    if (lastCount != null) this.backlog = Math.max(0, lastCount - this.processedCount);
  }

  // Late-arriving responses: re-read a bounded batch of awaiting ids by id.
  async _reconcileResponses({ signal }) {
    if (!this.source.getRequest || this.awaiting.size === 0) return;
    const ids = [...this.awaiting.keys()].slice(0, this.L.reconcilePerCycle);
    for (const id of ids) {
      if (signal && signal.aborted) throw new MonitorError("cancelled", "monitor cancelled");
      const r = await this.source.getRequest(id, { signal }).catch(() => null);
      if (r && r.found && r.record && r.record.responseAvailable) this._markUpdated(id, r);
      else if (this.awaiting.has(id)) { const a = this.awaiting.get(id); a.cycles = (a.cycles || 0) + 1; }
    }
  }

  _markUpdated(id, rec) {
    this.awaiting.delete(id);
    this.stats.updated++;
    this._emit(toEvent("updated", rec, this.clock));
  }

  _addSeen(id) {
    this.seenIds.add(id); this.seenOrder.push(id);
    if (this.seenOrder.length > this.L.maxSeenIds) {
      const evicted = this.seenOrder.shift();
      this.seenIds.delete(evicted);
      this.pending.push({ at: nowIso(this.clock), kind: "seen-evicted", id: evicted }); // recorded, not silent
    }
  }

  _addAwaiting(id) {
    if (this.awaiting.size >= this.L.maxAwaiting) {
      this.pending.push({ at: nowIso(this.clock), kind: "awaiting-overflow", id }); // recorded, not silent
      return;
    }
    this.awaiting.set(id, { firstSeenAt: nowIso(this.clock), cycles: 0 });
  }

  _emit(ev) {
    this._events.push(ev);
    if (this._events.length > this.L.maxEvents) { this._events.shift(); this._eventsDropped++; }
  }

  async _onFailure(e, signal) {
    const code = e && e.code || "error";
    this.connection = "down";
    this.failures.push({ at: nowIso(this.clock), code, message: String(e && e.message || e).slice(0, 200) });
    if (this.failures.length > 50) this.failures.shift();
    if (code === "cancelled") { return { ok: false, cancelled: true }; }
    if (PERMANENT.test(code)) { this.state = "ERROR"; await this.persist().catch(() => {}); return { ok: false, permanent: true, code }; }
    // transient: bounded backoff
    this._retries++;
    if (this._retries > this.L.maxRetries) { this.state = "ERROR"; await this.persist().catch(() => {}); return { ok: false, exhausted: true, code }; }
    const wait = Math.min(this.L.backoffMaxMs, this.L.backoffBaseMs * (2 ** (this._retries - 1)));
    await this.sleep(wait);
    return { ok: false, retry: this._retries, code };
  }

  // ---- read interface (for H2b-F3 / Preflight H2d) ------------------------
  status() {
    return {
      state: this.state, connection: this.connection,
      engagementId: this.engagementId, caidoProjectId: this.caidoProjectId,
      lastSyncAt: this.lastSyncAt, lastReconcileAt: this.lastReconcileAt,
      new: this.stats.new, updated: this.stats.updated,
      pendingResponses: this.awaiting.size, backlog: this.backlog,
      processedCount: this.processedCount,
      failures: this.failures.length, lastFailure: this.failures[this.failures.length - 1] || null,
      pendingNotices: this.pending.length, eventsBuffered: this._events.length, eventsDropped: this._eventsDropped,
      checkpoint: { cursor: this.cursor, lastCreatedAt: this.lastCreatedAt },
    };
  }

  // Drain up to `max` buffered events (metadata only) for a downstream consumer.
  drainEvents(max = Infinity) { return this._events.splice(0, max === Infinity ? this._events.length : max); }
  peekEvents() { return [...this._events]; }
}

export function createCaidoHistoryMonitor(opts) { return new CaidoHistoryMonitor(opts); }
