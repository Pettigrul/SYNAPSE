// SecurityAuditor — Caido Pentest Copilot Intelligence (H2b-F3).
//
// A DETERMINISTIC layer that turns the F2 History Monitor's metadata-only events
// into incremental operational CONTEXT and contextualized pentest RECOMMENDATIONS,
// while the operator works manually. NO LLM calls (deterministic processing), NO
// active HTTP ops, NO Replay/Automate/Findings/workflows, NO new catalog of
// vulnerabilities (it REUSES references/pattern-index.md as the KB router), NO DB.
// Node stdlib only, ZERO new dependencies.
//
// It separates FACTS (observed: endpoints, methods, status codes, structural param
// NAMES, object-reference shape, provenance) from INFERENCES (heuristic hypotheses
// that reference KB techniques and are NEVER confirmed findings). It never presumes
// a vulnerability from endpoint or parameter NAMES — only from structural signals.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const COPILOT_SCHEMA = 1;
export const REC_STATES = Object.freeze(["proposed", "accepted", "deferred", "dismissed"]);
export const HYPOTHESIS_CLASSES = Object.freeze(["authorization", "workflow", "access-control", "concurrency", "input-validation"]);
export const DEFAULT_LIMITS = Object.freeze({ maxEndpoints: 2000, maxRecommendations: 1000, maxEvidencePerRec: 10, repeatedFlowThreshold: 3 });

const STATE_CHANGING = /^(POST|PUT|DELETE|PATCH)$/i;
const ID_LIKE = [/^\d+$/, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, /^[0-9a-f]{16,}$/i, /^[A-Za-z0-9_-]{20,}$/];

// Lookup phrases per class — all VERIFIED to exist in pattern-index.md, so we route
// INTO the real KB rather than inventing a parallel catalog.
const CLASS_LOOKUP = Object.freeze({
  authorization: ["object reference", "idor", "bola"],
  workflow: ["business-invariant bypass", "mass assignment"],
  "access-control": ["auth bypass", "broken auth"],
  concurrency: ["race condition", "toctou", "double spend"],
  "input-validation": ["malformed input", "boundary"],
});

export class CopilotError extends Error {
  constructor(code, message) { super(message || code); this.name = "CopilotError"; this.code = code; }
}

function defaultIndexPath() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../references/pattern-index.md");
}

// Parse the pattern-index table into [{ keywords:[lc], file, idHint }]. Read-only.
export function parsePatternIndex(text) {
  const out = [];
  for (const line of String(text).split("\n")) {
    const m = /^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
    if (!m) continue;
    if (/^[-\s|]+$/.test(line) || /^\|\s*Keywords/i.test(line)) continue;
    const keywords = m[1].replace(/\*\*/g, "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const fileCell = m[2];
    const fileM = /`([^`]+)`/.exec(fileCell);
    const idM = /\bT(\d+)\b/.exec(fileCell);
    if (!keywords.length) continue;
    out.push({ keywords, file: fileM ? fileM[1] : fileCell.trim(), idHint: idM ? `T${idM[1]}` : null });
  }
  return out;
}

function isIdLike(seg) { return !!seg && ID_LIKE.some((re) => re.test(seg)); }

export class CaidoCopilot {
  constructor({ engagementId, caidoProjectId, modality = "blackbox", statePath = null, indexPath = null, fsImpl = fs, scope = null, limits = {}, clock } = {}) {
    if (!engagementId) throw new CopilotError("bad-config", "engagementId required");
    if (!caidoProjectId) throw new CopilotError("bad-config", "caidoProjectId required");
    this.engagementId = engagementId;
    this.caidoProjectId = caidoProjectId;
    this.modality = modality;
    this.statePath = statePath;
    this.fs = fsImpl;
    this.scope = scope; // optional allowHosts list for defense-in-depth drop of out-of-scope events
    this.L = { ...DEFAULT_LIMITS, ...limits };
    this.clock = clock || { now: () => Date.now() };
    this._index = null; this._indexPath = indexPath || defaultIndexPath();
    this._reset();
  }

  _reset() {
    this.endpoints = new Map();        // key -> fact record
    this.recommendations = new Map();  // id -> recommendation
    this.seenEventKeys = new Set();     // dedup: caidoRequestId + ":" + type
    this.incomplete = { overflow: false, backlog: 0, reconciliationGaps: false, withheldOutOfScope: 0, outOfScopeObserved: 0, droppedEndpoints: 0 };
    this.stats = { eventsIngested: 0, observedEndpoints: 0, hypotheses: 0 };
  }

  _loadIndex() {
    if (this._index) return this._index;
    try { this._index = parsePatternIndex(this.fs.readFileSync(this._indexPath, "utf8")); }
    catch { this._index = []; } // degrade: recommendations still emitted with kb:null
    return this._index;
  }

  _routeFor(klass) {
    const idx = this._loadIndex();
    const phrases = CLASS_LOOKUP[klass] || [];
    for (const entry of idx) {
      for (const ph of phrases) {
        if (entry.keywords.some((k) => k.includes(ph))) return { file: entry.file, keywords: entry.keywords.slice(0, 6), idHint: entry.idHint, matched: ph };
      }
    }
    return null;
  }

  _nowIso() { return new Date(this.clock.now()).toISOString(); }

  // ---- ingest (deterministic; events are UNTRUSTED metadata) --------------
  ingest(events = []) {
    const added = [];
    for (const ev of events) {
      if (!ev || !ev.caidoRequestId) continue;
      const dedupKey = `${ev.caidoRequestId}:${ev.type || "new"}`;
      if (this.seenEventKeys.has(dedupKey)) continue;

      let u; try { u = new URL(ev.url); } catch { u = null; }
      const host = (u && u.hostname) || ev.host || null;
      // Passive analysis reads ALL captured traffic in the authorized project; scope is ANNOTATED, not
      // dropped (the in/out-of-scope label is kept per endpoint). Active ops enforce scope elsewhere, and
      // an out-of-scope host here is NEVER authorization to act against it.
      const inScope = !(this.scope && Array.isArray(this.scope.allowHosts) && host) || this.scope.allowHosts.includes(host);
      if (!inScope) this.incomplete.outOfScopeObserved++;
      this.seenEventKeys.add(dedupKey);
      this.stats.eventsIngested++;

      const method = (ev.method || "GET").toUpperCase();
      const rawSegs = u ? u.pathname.split("/").filter(Boolean) : [];
      const objectRef = rawSegs.some(isIdLike);
      const normPath = "/" + rawSegs.map((s) => (isIdLike(s) ? "{id}" : s)).join("/");
      // Only structural param NAMES are kept — NEVER values (values may carry secrets/injection).
      const paramNames = u ? [...new Set([...u.searchParams.keys()])].sort() : [];
      const key = `${method} ${host}${normPath}`;

      if (!this.endpoints.has(key)) {
        if (this.endpoints.size >= this.L.maxEndpoints) { this.incomplete.droppedEndpoints++; continue; }
        this.endpoints.set(key, { method, host, inScope, normalizedPath: normPath, examplePath: u ? u.pathname : (ev.url || ""),
          count: 0, statusCodes: new Set(), paramNames: new Set(), objectRef: false, stateChanging: STATE_CHANGING.test(method),
          pendingResponse: false, auth: { seen401: false, seen403: false }, evidence: [] });
      }
      const e = this.endpoints.get(key);
      e.count++;
      if (objectRef) e.objectRef = true;
      for (const p of paramNames) e.paramNames.add(p);
      if (typeof ev.statusCode === "number") { e.statusCodes.add(ev.statusCode); if (ev.statusCode === 401) e.auth.seen401 = true; if (ev.statusCode === 403) e.auth.seen403 = true; }
      if (!ev.responseAvailable) e.pendingResponse = true; else e.pendingResponse = e.pendingResponse && false;
      if (e.evidence.length < this.L.maxEvidencePerRec) e.evidence.push({ caidoRequestId: ev.caidoRequestId, caidoResponseId: ev.caidoResponseId || null, ts: ev.ts || null });
      added.push(key);
    }
    this.stats.observedEndpoints = this.endpoints.size;
    this._correlate();
    return { ingested: added.length, endpoints: this.endpoints.size };
  }

  // Record incomplete-context signals from the monitor status (overflow/backlog/gaps).
  noteMonitorStatus(status = {}) {
    if (status.eventsDropped > 0 || status.pendingNotices > 0) this.incomplete.overflow = true;
    if (typeof status.backlog === "number") this.incomplete.backlog = status.backlog;
    if (status.lastReconcileAt == null && status.processedCount > 0) this.incomplete.reconciliationGaps = true;
  }

  // ---- correlate observations -> heuristic hypotheses (KB-referenced) -----
  _correlate() {
    for (const [key, e] of this.endpoints) {
      const classes = new Set();
      if (e.objectRef) classes.add("authorization");
      if (e.stateChanging) { classes.add("workflow"); if (e.count >= this.L.repeatedFlowThreshold) classes.add("concurrency"); }
      if (e.auth.seen401 || e.auth.seen403) classes.add("access-control");
      const hasError = [...e.statusCodes].some((c) => c >= 400 && c !== 401 && c !== 403);
      if (hasError) classes.add("input-validation");
      for (const klass of classes) this._upsertRecommendation(key, e, klass);
    }
    this.stats.hypotheses = this.recommendations.size;
  }

  _recId(key, klass) { return "REC-" + crypto.createHash("sha1").update(`${this.engagementId}|${key}|${klass}`).digest("hex").slice(0, 10); }

  _upsertRecommendation(key, e, klass) {
    const id = this._recId(key, klass);
    const existing = this.recommendations.get(id);
    if (existing && existing.state === "dismissed") return; // respect operator dismissal
    if (this.recommendations.size >= this.L.maxRecommendations && !existing) { this.incomplete.overflow = true; return; }
    const route = this._routeFor(klass);
    const spec = this._classSpec(klass, e);
    const rec = {
      id, title: spec.title, hypothesisClass: klass, hypothesis: spec.hypothesis, rationale: spec.rationale,
      evidence: e.evidence.slice(0, this.L.maxEvidencePerRec),
      kb: route ? { route: route.file, keywords: route.keywords, idHint: route.idHint } : null,
      priority: spec.priority, confidence: spec.confidence, limitations: spec.limitations,
      prerequisites: spec.prerequisites, nextTest: spec.nextTest,
      state: existing ? existing.state : "proposed",
      endpoint: { method: e.method, host: e.host, normalizedPath: e.normalizedPath, observedStatus: [...e.statusCodes].sort((a, b) => a - b), paramNames: [...e.paramNames].sort() },
      provenance: { source: "caido-http-observation", modality: this.modality, caveat: "heurística não confirmada; não é finding" },
      updatedAt: this._nowIso(),
    };
    this.recommendations.set(id, rec);
  }

  _classSpec(klass, e) {
    const ep = `${e.method} ${e.normalizedPath}`;
    switch (klass) {
      case "authorization": return {
        title: `Possível IDOR/BOLA em ${ep}`,
        hypothesis: `O endpoint expõe referência(s) de objeto (${e.normalizedPath.includes("{id}") ? "id em path" : "id em parâmetro"}); autorização por objeto pode estar ausente.`,
        rationale: "Sinal ESTRUTURAL observado: segmento/parâmetro com forma de identificador. Não inferido do nome.",
        priority: e.stateChanging ? "high" : "medium", confidence: "medium",
        limitations: "Observação de tráfego; não confirma falta de controle de acesso.",
        prerequisites: "≥2 identidades/sessões autorizadas (owner + cross-user).",
        nextTest: "Authorization Matrix (authorization.run) comparando as identidades sobre o mesmo objeto {id}.",
      };
      case "workflow": return {
        title: `Mudança de estado em ${ep} — verificar invariante de negócio`,
        hypothesis: "Operação que altera estado pode permitir quebra de invariante / mass assignment.",
        rationale: "Sinal ESTRUTURAL: método mutante observado no endpoint.",
        priority: "medium", confidence: "low",
        limitations: "Lógica de negócio não é observável só pelo tráfego; hipótese fraca.",
        prerequisites: "Sequência de estado conhecida e aprovação para operação sensível.",
        nextTest: "Testar quebra de invariante/mass assignment na sequência observada (sem automatizar escrita).",
      };
      case "access-control": return {
        title: `Controle de acesso observável em ${ep} (status ${e.auth.seen401 ? "401" : ""}${e.auth.seen403 ? " 403" : ""})`,
        hypothesis: "Respostas 401/403 observadas indicam fronteira de autorização a avaliar.",
        rationale: "FATO observado: código(s) de status de autenticação/autorização.",
        priority: "medium", confidence: "low",
        limitations: "Status observado é fato; a existência de bypass é inferência não confirmada.",
        prerequisites: "Credenciais/identidades distintas autorizadas.",
        nextTest: "Comparar acesso com/sem credencial e entre papéis (sessions + authorization).",
      };
      case "concurrency": return {
        title: `Fluxo repetido mutante em ${ep} — candidato a race/TOCTOU`,
        hypothesis: "Operação mutante repetida pode ser sensível a corrida/idempotência.",
        rationale: `Sinal ESTRUTURAL: ${e.count} ocorrências de método mutante no mesmo endpoint.`,
        priority: "medium", confidence: "low",
        limitations: "Repetição é fato; violação por corrida exige reprodução com oráculo de estado.",
        prerequisites: "Estado inicial verificável + reset + aprovação para a operação.",
        nextTest: "Race Validator (race.run) com rajada concorrente e oráculo de estado.",
      };
      default: return {
        title: `Entrada potencialmente malformada em ${ep}`,
        hypothesis: "Respostas de erro observadas sugerem tratamento de entrada a exercitar.",
        rationale: "FATO observado: status de erro (≠401/403).",
        priority: "low", confidence: "low",
        limitations: "Erro observado não implica vulnerabilidade.",
        prerequisites: "Parâmetros observados.",
        nextTest: "chaos/fuzz de entrada malformada nos parâmetros observados.",
      };
    }
  }

  // ---- read API (deterministic; the agent phrases the NL answer) ----------
  summary() {
    const byStatus = {};
    for (const e of this.endpoints.values()) for (const s of e.statusCodes) byStatus[s] = (byStatus[s] || 0) + 1;
    return {
      engagementId: this.engagementId, caidoProjectId: this.caidoProjectId, modality: this.modality,
      observed: { endpoints: this.endpoints.size, events: this.stats.eventsIngested, statusDistribution: byStatus },
      inferences: { recommendations: this.recommendations.size },
      incompleteContext: this.incomplete,
    };
  }
  endpoints_() { return [...this.endpoints.values()].map((e) => ({ method: e.method, host: e.host, inScope: e.inScope !== false, normalizedPath: e.normalizedPath, count: e.count, status: [...e.statusCodes].sort((a, b) => a - b), paramNames: [...e.paramNames].sort(), objectRef: e.objectRef, stateChanging: e.stateChanging, pendingResponse: e.pendingResponse })); }
  hypotheses({ klass = null } = {}) { return [...this.recommendations.values()].filter((r) => !klass || r.hypothesisClass === klass); }
  recommendations_({ state = null, sort = "priority" } = {}) {
    const order = { high: 0, medium: 1, low: 2 };
    let list = [...this.recommendations.values()].filter((r) => !state || r.state === state);
    if (sort === "priority") list = list.sort((a, b) => (order[a.priority] - order[b.priority]) || a.id.localeCompare(b.id));
    return list;
  }
  unassessedSurface() {
    // Observed endpoints that have NO recommendation yet (nothing to test inferred) — honest "not yet assessed".
    const withRec = new Set([...this.recommendations.values()].map((r) => `${r.endpoint.method} ${r.endpoint.host}${r.endpoint.normalizedPath}`));
    return this.endpoints_().filter((e) => !withRec.has(`${e.method} ${e.host}${e.normalizedPath}`));
  }
  relateToKb() { return this.hypotheses().map((r) => ({ endpoint: `${r.endpoint.method} ${r.endpoint.normalizedPath}`, class: r.hypothesisClass, kb: r.kb })); }
  setRecommendationState(id, state) {
    if (!REC_STATES.includes(state)) throw new CopilotError("bad-state", `invalid state: ${state} (valid: ${REC_STATES.join(", ")})`);
    const r = this.recommendations.get(id); if (!r) throw new CopilotError("not-found", `no recommendation ${id}`);
    r.state = state; r.updatedAt = this._nowIso(); return r;
  }

  // ---- persistence (atomic; versioned; metadata/refs only, NO full history)
  async persist() {
    if (!this.statePath) return;
    const snap = {
      schema: COPILOT_SCHEMA, engagementId: this.engagementId, caidoProjectId: this.caidoProjectId, modality: this.modality,
      endpoints: Object.fromEntries([...this.endpoints].map(([k, e]) => [k, { ...e, statusCodes: [...e.statusCodes], paramNames: [...e.paramNames] }])),
      recommendations: Object.fromEntries(this.recommendations),
      seenEventKeys: [...this.seenEventKeys].slice(-20000),
      incomplete: this.incomplete, stats: this.stats, updatedAt: this._nowIso(),
    };
    const dir = path.dirname(this.statePath); this.fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.statePath}.tmp-${process.pid}-${this.clock.now()}`;
    this.fs.writeFileSync(tmp, JSON.stringify(snap, null, 2)); this.fs.renameSync(tmp, this.statePath);
  }
  async load() {
    if (!this.statePath || !this.fs.existsSync(this.statePath)) return false;
    let st; try { st = JSON.parse(this.fs.readFileSync(this.statePath, "utf8")); } catch { return false; }
    if (st.schema > COPILOT_SCHEMA) throw new CopilotError("schema-too-new", `state schema ${st.schema} > ${COPILOT_SCHEMA}`);
    if (st.engagementId !== this.engagementId || st.caidoProjectId !== this.caidoProjectId) throw new CopilotError("state-mismatch", "state belongs to a different engagement/project");
    this.modality = st.modality || this.modality;
    this.endpoints = new Map(Object.entries(st.endpoints || {}).map(([k, e]) => [k, { ...e, statusCodes: new Set(e.statusCodes || []), paramNames: new Set(e.paramNames || []) }]));
    this.recommendations = new Map(Object.entries(st.recommendations || {}));
    this.seenEventKeys = new Set(st.seenEventKeys || []);
    this.incomplete = st.incomplete || this.incomplete; this.stats = st.stats || this.stats;
    return true;
  }
}

export function createCaidoCopilot(opts) { return new CaidoCopilot(opts); }
