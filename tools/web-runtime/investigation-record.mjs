// SecurityAuditor — Supervised Investigation Record (H2b-F4b-1).
//
// A DETERMINISTIC, PASSIVE record builder for a supervised Caido investigation. It does NOT
// orchestrate, schedule, dispatch, or call an LLM or the Bridge — the AGENT drives the tool calls;
// this helper only RECORDS what happened and ENFORCES the Record contract's honesty invariants.
// It EXTENDS the existing Investigation Record contract (references/flows-agents.md "Return contract")
// for the Caido supervised flow, reusing existing persistence patterns (atomic file state, like the
// F2 monitor / F3 copilot) — NO new persistence architecture, NO new authorization mechanism.
// Node stdlib only, ZERO deps.
//
// Honesty invariants enforced:
//  - Caido IDs come ONLY from real bridge result envelopes — never invented.
//  - A blocked/failed/denied execution is recorded as such — success is NEVER declared without
//    a confirming Caido result.
//  - An authoritative validator classification (when present on the envelope) is copied VERBATIM;
//    this helper never promotes a hypothesis to a confirmed violation on its own.
//  - If the turn/budget ends before finalization, snapshot() preserves the technical results and
//    marks the Record "incompleto" — it never fabricates a conclusion.

import fs from "node:fs";
import path from "node:path";

export const RECORD_SCHEMA = 1;
// Interpretive statuses this helper may set. "violacao-confirmada"/"violacao-reproduzida" are NOT here:
// they require an authoritative validator classification (copied verbatim), which Replay/Findings do not emit.
export const FINAL_STATUSES = Object.freeze(["conforme", "anomalia", "inconclusivo", "bloqueado", "incompleto"]);
const MIRRORED_OPS = new Set(["caido.replay.run", "caido.findings.create"]);

export class RecordError extends Error {
  constructor(code, message) { super(message || code); this.name = "RecordError"; this.code = code; }
}

export class InvestigationRecord {
  constructor({ engagementId, caidoProjectId = null, modality = "blackbox", statePath = null, fsImpl = fs, clock } = {}) {
    if (!engagementId) throw new RecordError("bad-config", "engagementId required");
    this.engagementId = engagementId;
    this.caidoProjectId = caidoProjectId;
    this.modality = modality;
    this.statePath = statePath;
    this.fs = fsImpl;
    this.clock = clock || { now: () => Date.now() };
    this._reset();
  }

  _reset() {
    this.hypothesis = null;         // {id, text, objective}
    this.kbTechnique = null;        // {id?, route?, keywords?}
    this.historyEvidence = [];      // [{caidoRequestId, caidoResponseId?, host, method, url}]
    this.proposedOperation = null;  // {kind, requestId?, modified?, summary}
    this.approval = { decision: "not-requested", source: null, reason: null };
    this.executedOperation = null;  // {op, requestId?, modified?}
    this.caidoResult = null;        // honest result snapshot (provenance/IDs/outcome)
    this.classification = null;     // authoritative, VERBATIM; null when no validator ran
    this.interpretation = null;
    this.limitations = [];
    this.status = null;
    this.blocked = null;            // {op, code} when an active op was denied/failed
    this.finalized = false;
    this.events = [];
  }

  _event(kind, detail) { this.events.push({ at: new Date(this.clock.now()).toISOString(), kind, detail }); }

  // ---- interpretive fields (agent-driven) ---------------------------------
  setHypothesis({ id = null, text, objective = null } = {}) {
    if (!text) throw new RecordError("bad-params", "hypothesis text required");
    this.hypothesis = { id: id || null, text, objective: objective || null };
    this._event("hypothesis", { id: this.hypothesis.id });
    return this.hypothesis;
  }
  setKbTechnique({ id = null, route = null, keywords = null } = {}) {
    this.kbTechnique = { id: id || null, route: route || null, keywords: keywords || null };
    this._event("kb", this.kbTechnique);
    return this.kbTechnique;
  }
  addHistoryEvidence(list = []) {
    for (const e of list) {
      if (!e || !e.caidoRequestId) continue; // never invent a Caido id
      this.historyEvidence.push({ caidoRequestId: e.caidoRequestId, caidoResponseId: e.caidoResponseId || null, host: e.host || null, method: e.method || null, url: e.url || null });
    }
    this._event("evidence", { count: this.historyEvidence.length });
    return this.historyEvidence;
  }
  proposeOperation({ kind, requestId = null, modified = false, summary = null } = {}) {
    if (!kind) throw new RecordError("bad-params", "proposed operation requires a kind");
    this.proposedOperation = { kind, requestId: requestId || null, modified: !!modified, summary: summary || null };
    this._event("proposed", { kind, requestId });
    return this.proposedOperation;
  }
  setInterpretation(text) { this.interpretation = text || null; this._event("interpretation", {}); return this.interpretation; }
  addLimitation(text) { if (text) { this.limitations.push(String(text)); this._event("limitation", {}); } return this.limitations; }

  // ---- factual execution (auto-mirrored from real Bridge envelopes) -------
  // env = { ok, result?, error?, classification? } exactly as bridge.invoke() returned it.
  observeEnvelope(op, params = {}, env = {}) {
    if (!MIRRORED_OPS.has(op)) return;
    if (env && env.investigationId && env.investigationId !== this.engagementId) {
      throw new RecordError("record-isolation", `envelope investigationId ${env.investigationId} != record engagement ${this.engagementId}`);
    }
    if (env.ok) {
      this.approval = { decision: "approved", source: "execution-context", reason: null };
      this.executedOperation = { op, requestId: params.requestId || null, modified: !!params.modifiedRaw };
      const r = env.result || {};
      if (op === "caido.replay.run") {
        this.caidoResult = { kind: "replay", outcome: r.outcome || null, provenance: r.provenance || null, comparison: r.comparison || null, responseAvailable: !!r.responseAvailable };
      } else {
        this.caidoResult = { kind: "finding", created: !!r.created, duplicate: !!r.duplicate, provenance: r.provenance || null, findingId: r.finding ? r.finding.id : null };
      }
      // Authoritative classification, VERBATIM (replay/findings normally carry none).
      if (typeof env.classification === "string") this.classification = env.classification;
      this.blocked = null;
      this._event("executed", { op, outcome: this.caidoResult.outcome || (this.caidoResult.created ? "created" : "duplicate") });
    } else {
      const code = env.error && env.error.code || "error";
      if (code === "state-change-unauthorized") {
        this.approval = { decision: "refused", source: "execution-context", reason: code };
      } else if (this.approval.decision === "not-requested") {
        this.approval = { decision: "not-executed", source: null, reason: code };
      }
      this.executedOperation = null;
      this.blocked = { op, code };
      this._event("blocked", { op, code });
    }
    return this;
  }

  // ---- completion ----------------------------------------------------------
  _assertStatus(status) {
    if (this.classification && status === this.classification) return; // authoritative, verbatim
    if (!FINAL_STATUSES.includes(status)) throw new RecordError("bad-status", `invalid status "${status}" (allowed: ${FINAL_STATUSES.join(", ")}${this.classification ? `, or verbatim "${this.classification}"` : ""})`);
    // Honesty: with no confirming execution and a recorded block, refuse a clean/anomaly verdict.
    if (!this.executedOperation && this.blocked && !["bloqueado", "inconclusivo", "incompleto"].includes(status)) {
      throw new RecordError("dishonest-status", `operation was blocked (${this.blocked.code}); status must be bloqueado/inconclusivo/incompleto, not "${status}"`);
    }
  }
  finalize({ status } = {}) {
    if (!status) throw new RecordError("bad-params", "finalize requires a status");
    this._assertStatus(status);
    this.status = status;
    this.finalized = true;
    this._event("finalized", { status });
    return this.toJSON();
  }
  // Non-destructive incomplete view for an interrupted turn / exhausted budget.
  snapshot(reason = "turn-or-budget-ended") {
    const snap = this.toJSON();
    snap.status = "incompleto";
    snap.incomplete = { reason, hadExecution: !!this.executedOperation, hadResult: !!this.caidoResult, finalized: this.finalized };
    this._event("snapshot", { reason });
    return snap;
  }

  toJSON() {
    return {
      schema: RECORD_SCHEMA, engagementId: this.engagementId, caidoProjectId: this.caidoProjectId, modality: this.modality,
      hypothesis: this.hypothesis, kbTechnique: this.kbTechnique, historyEvidence: this.historyEvidence,
      proposedOperation: this.proposedOperation, approval: this.approval, executedOperation: this.executedOperation,
      caidoResult: this.caidoResult, classification: this.classification, interpretation: this.interpretation,
      limitations: this.limitations, status: this.status, blocked: this.blocked, finalized: this.finalized,
      provenanceSource: "caido", updatedAt: new Date(this.clock.now()).toISOString(),
    };
  }
  toMarkdown() {
    const j = this.toJSON();
    const refs = j.historyEvidence.map((e) => e.caidoRequestId).join(", ") || "—";
    const cls = j.classification || "none — no validator ran";
    return [
      `## Investigation record (Caido supervised)`,
      `- engagement: ${j.engagementId} · caidoProject: ${j.caidoProjectId || "—"} · modality: ${j.modality}`,
      `- hypothesis: ${j.hypothesis ? j.hypothesis.text : "—"}`,
      `- KB technique: ${j.kbTechnique ? (j.kbTechnique.id || j.kbTechnique.route || "—") : "—"}`,
      `- History evidence (Caido requestIds): ${refs}`,
      `- proposed operation: ${j.proposedOperation ? `${j.proposedOperation.kind}${j.proposedOperation.requestId ? ` (${j.proposedOperation.requestId})` : ""}` : "—"}`,
      `- approval: ${j.approval.decision}${j.approval.source ? ` (${j.approval.source})` : ""}`,
      `- executed operation: ${j.executedOperation ? j.executedOperation.op : "none"}`,
      `- Caido result: ${j.caidoResult ? JSON.stringify(j.caidoResult) : "none"}`,
      `- authoritative classification (verbatim): ${cls}`,
      `- agent interpretation: ${j.interpretation || "—"}`,
      `- limitations: ${j.limitations.length ? j.limitations.join("; ") : "—"}`,
      `- status: ${j.status || (j.finalized ? "—" : "incompleto (not finalized)")}`,
    ].join("\n");
  }

  // ---- persistence (reuse atomic pattern; optional) -----------------------
  persist() {
    if (!this.statePath) return;
    const dir = path.dirname(this.statePath); this.fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.statePath}.tmp-${process.pid}-${this.clock.now()}`;
    const payload = { ...this.toJSON(), events: this.events };
    this.fs.writeFileSync(tmp, JSON.stringify(payload, null, 2)); this.fs.renameSync(tmp, this.statePath);
  }
  load() {
    if (!this.statePath || !this.fs.existsSync(this.statePath)) return false;
    let st; try { st = JSON.parse(this.fs.readFileSync(this.statePath, "utf8")); } catch { return false; }
    if (st.schema > RECORD_SCHEMA) throw new RecordError("schema-too-new", `record schema ${st.schema} > ${RECORD_SCHEMA}`);
    if (st.engagementId !== this.engagementId) throw new RecordError("record-isolation", "record belongs to a different engagement");
    Object.assign(this, { hypothesis: st.hypothesis, kbTechnique: st.kbTechnique, historyEvidence: st.historyEvidence || [],
      proposedOperation: st.proposedOperation, approval: st.approval || this.approval, executedOperation: st.executedOperation,
      caidoResult: st.caidoResult, classification: st.classification, interpretation: st.interpretation,
      limitations: st.limitations || [], status: st.status, blocked: st.blocked, finalized: !!st.finalized, caidoProjectId: st.caidoProjectId, modality: st.modality || this.modality });
    this.events = st.events || [];
    return true;
  }
}

export function createInvestigationRecord(opts) { return new InvestigationRecord(opts); }
