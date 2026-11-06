// SecurityAuditor — Authorization Matrix (H1b-F2).
// A SEQUENTIAL executor that probes resources with multiple authenticated identities and
// classifies horizontal/vertical authorization behavior (IDOR/BOLA) WITHOUT relying solely
// on LLM interpretation. Reuses the Session Manager (identities/sessions/contexts), Resource
// Registry, Scope Guard and Evidence hygiene. No concurrency (that is H1c).
//
// Hard rules (from the authorization):
//  - A 200, or a structural divergence, ALONE never confirms IDOR/BOLA.
//  - Confirming a violation REQUIRES evidence of resource ownership AND an established
//    authorization rule (expected=deny with a stated origin).
//  - Never auto-infer that different users cannot share a resource — only EXPLICIT policy
//    (documented / lab-fixture / approved-premise) drives a deny expectation.
//  - Evidence is sanitized: identifiers, HTTP metadata, normalized STRUCTURE (keys only,
//    never values), ownership-evidence as a boolean, safe key-diffs. Raw bodies, cookies,
//    tokens and one principal's content are NEVER persisted into another's result.
import crypto from "node:crypto";
import { validateTarget, ScopeError } from "./scope.mjs";

export const EXPECT_OUTCOMES = Object.freeze(["allow", "deny", "unknown"]);
export const EXPECT_ORIGINS = Object.freeze(["documented-policy", "lab-fixture", "approved-premise"]);
export const CLASSES = Object.freeze(["conforme", "anomalia-de-autorizacao", "violacao-confirmada", "inconclusivo"]);

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 16);

/** Collect KEY PATHS only (never values) — the normalized structure used for safe diffs. */
function shapeKeys(o, prefix = "", acc = []) {
  if (o === null || typeof o !== "object") return acc;
  if (Array.isArray(o)) { if (o.length) shapeKeys(o[0], prefix + "[]", acc); return acc; }
  for (const k of Object.keys(o).sort()) { const p = prefix ? `${prefix}.${k}` : k; acc.push(p); shapeKeys(o[k], p, acc); }
  return acc;
}
function normalize(raw, ctype) {
  if (raw == null) return { kind: "none" };
  if (/json/i.test(ctype || "")) {
    try { const keys = shapeKeys(JSON.parse(raw)).sort(); return { kind: "json", keys, hash: sha(keys.join("|")) }; }
    catch { /* fall through to text */ }
  }
  return { kind: "text", bytes: raw.length, hash: sha(`len:${raw.length}`) }; // never the raw text
}

/** Pure classifier. Inputs are already sanitized/derived; returns a decision + rationale. */
export function classify({ expected, observed, resource, ownershipPresent, scopeBlocked }) {
  if (scopeBlocked) return { classification: "conforme", rationale: "destino fora do escopo bloqueado pelo Scope Guard (contenção preservada)" };
  if (observed.status === 0 && observed.error) return { classification: "inconclusivo", rationale: `erro na sonda: ${observed.error}` };
  if (!expected || expected.outcome === "unknown") return { classification: "inconclusivo", rationale: "política de autorização desconhecida — status/estrutura sozinhos não classificam" };

  const granted = observed.status >= 200 && observed.status < 300;
  if (observed.status === 404) {
    return expected.outcome === "allow"
      ? { classification: "inconclusivo", rationale: "recurso inexistente (404) — não é possível avaliar o acesso esperado" }
      : { classification: "conforme", rationale: "404 consistente com negação" };
  }
  if (expected.outcome === "allow") {
    return granted
      ? { classification: "conforme", rationale: `acesso concedido conforme esperado (origem=${expected.origin})` }
      : { classification: "anomalia-de-autorizacao", rationale: `esperado allow (origem=${expected.origin}) mas negado (status=${observed.status})` };
  }
  // expected deny
  if (!granted) return { classification: "conforme", rationale: `acesso negado conforme esperado (status=${observed.status}, origem=${expected.origin})` };
  const establishedRule = EXPECT_ORIGINS.includes(expected.origin);
  if (ownershipPresent && establishedRule) {
    return {
      classification: "violacao-confirmada",
      rationale: `acesso concedido a recurso proibido para o principal E a resposta trouxe o conteúdo do dono (evidência de posse) sob regra ${expected.origin} estabelecida`,
      confirmedBy: ["evidencia-de-posse", "regra-estabelecida", "acesso-concedido"],
    };
  }
  return { classification: "anomalia-de-autorizacao", rationale: `acesso concedido onde se esperava negar (status=${observed.status}), porém SEM evidência de posse — não confirmável como IDOR/BOLA` };
}

export class AuthorizationMatrix {
  /** @param {{manager, resources}} deps */
  constructor({ manager, resources }) {
    if (!manager || !resources) throw new Error("AuthorizationMatrix requires { manager, resources }");
    this.m = manager; this.resources = resources; this.results = [];
  }

  _corr(c, extra = {}) {
    const meta = this.m.get(c.sessionId) || {};
    return { caseId: c.caseId, principalId: meta.principalId || null, sessionId: c.sessionId, contextId: meta.contextId || null, resourceId: c.resourceId, ...extra };
  }

  async _runCase(c) {
    const meta = this.m.get(c.sessionId);
    if (!meta || meta.closed) return { ...this._corr(c), classification: "inconclusivo", rationale: "sessão inexistente/fechada", executed: false };
    if (!this.resources.has(c.resourceId)) return { ...this._corr(c), classification: "inconclusivo", rationale: "recurso desconhecido", executed: false };
    const resource = this.resources._get(c.resourceId);
    const method = c.methodOverride || resource.request.method;
    const url = resource.request.url;
    const body = c.bodyOverride !== undefined ? c.bodyOverride : resource.request.body;

    // State-changing operations require explicit authorization + reversible fixture.
    if (resource.request.stateChanging && !c.authorizedStateChange) {
      return { ...this._corr(c, { requestId: null, method, status: null }), classification: "inconclusivo", rationale: "operação com alteração de estado exige autorização específica + fixture reversível", executed: false };
    }

    let observed;
    try {
      const p = await this.m.request(c.sessionId, { op: "probe", method, url, body });
      observed = { status: p.status, contentType: p.contentType, error: p.error, requestId: p.requestId, raw: p.body };
    } catch (e) {
      if (e instanceof ScopeError) return { ...this._corr(c, { requestId: null, method, status: null }), classification: "conforme", rationale: "alvo fora do escopo — bloqueado antes da requisição", evidence: { scopeBlocked: true } };
      return { ...this._corr(c, { method }), classification: "inconclusivo", rationale: `erro de execução: ${e && e.message}`, executed: false };
    }

    // Transient normalization + ownership evidence; raw body is discarded after this block.
    const shape = normalize(observed.raw, observed.contentType);
    const ownershipPresent = !!(resource.ownershipMarker && observed.raw && observed.raw.includes(resource.ownershipMarker));
    const scopeBlocked = resource.expectScopeBlock && observed.status === 0 && !!observed.error;
    const cls = classify({ expected: c.expected, observed, resource, ownershipPresent, scopeBlocked });

    return {
      ...this._corr(c, { requestId: observed.requestId }),
      method, status: observed.status, contentType: observed.contentType,
      expected: c.expected || { outcome: "unknown", origin: null },
      classification: cls.classification, rationale: cls.rationale, confirmedBy: cls.confirmedBy || [],
      evidence: { shape, bytes: observed.raw ? observed.raw.length : 0, ownershipEvidence: ownershipPresent, scopeBlocked, error: observed.error || null },
      executed: true,
    };
  }

  /** Run the matrix SEQUENTIALLY. Honors an AbortSignal: remaining cases are inconclusivo (cancelled). */
  async run(cases, { signal } = {}) {
    this.results = [];
    let cancelled = false;
    for (const c of cases) {
      if (cancelled || (signal && signal.aborted)) { cancelled = true; this.results.push({ ...this._corr(c), classification: "inconclusivo", rationale: "cancelado antes da execução (falha/cancelamento no meio da matriz)", executed: false }); continue; }
      let r;
      try { r = await this._runCase(c); }
      catch (e) { r = { ...this._corr(c), classification: "inconclusivo", rationale: `erro inesperado: ${e && e.message}`, executed: false }; }
      this.results.push(r);
      if (signal && signal.aborted) cancelled = true;
    }
    return { results: this.results.slice(), summary: this.summary() };
  }

  summary() {
    const t = { conforme: 0, "anomalia-de-autorizacao": 0, "violacao-confirmada": 0, inconclusivo: 0 };
    for (const r of this.results) if (t[r.classification] != null) t[r.classification]++;
    return t;
  }

  /** Cross-principal comparison for one resource: KEY-only shape diffs (safe, no values). */
  compareByResource(resourceId) {
    const rows = this.results.filter((r) => r.resourceId === resourceId && r.evidence && r.evidence.shape);
    return rows.map((r) => ({ caseId: r.caseId, principalId: r.principalId, status: r.status, shapeHash: r.evidence.shape.hash, keys: r.evidence.shape.keys || [], classification: r.classification }));
  }
}

/** KEY-only symmetric diff between two normalized shapes (values never compared/exposed). */
export function diffShapes(a, b) {
  const ka = new Set((a && a.keys) || []); const kb = new Set((b && b.keys) || []);
  return { onlyA: [...ka].filter((k) => !kb.has(k)), onlyB: [...kb].filter((k) => !ka.has(k)) };
}

export function createAuthorizationMatrix(deps) { return new AuthorizationMatrix(deps); }
