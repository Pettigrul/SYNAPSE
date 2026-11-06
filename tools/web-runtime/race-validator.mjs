// SecurityAuditor — Stateful Race & TOCTOU Validator (H1c-F2).
// Turns concurrent operations into REPRODUCIBLE security experiments that demonstrate business-
// invariant / authorization violations. Reuses the ConcurrentExecutor (barrier + bounded pool),
// Session Manager, Scope Guard, Rule 0/6 and evidence-hygiene. No scheduler/DB/queue/multiagent.
//
// Core honesty rules (from the authorization):
//  - A violation requires EVIDENCE OF STATE CHANGE (or an authz decision) incompatible with a
//    PREVIOUSLY ESTABLISHED rule — HTTP 200, size, latency or error codes are never enough.
//  - The expected rule + invariant + their SOURCE are DECLARED in the experiment. The validator
//    only evaluates them; it never invents a business rule or authorization policy.
//  - Reproduction raises confidence but does NOT discard a violation observed a single time.
//  - If the initial state cannot be PROVEN, the experiment does not run. If reset fails, the
//    remaining attempts stop and the lab state is flagged potentially contaminated.
//  - Attempts are SEQUENTIAL (they share lab state); only the operations WITHIN an attempt run
//    concurrently — no simultaneous attempts over shared state without explicit isolation.
import crypto from "node:crypto";

export const RACE_CLASSES = Object.freeze(["conforme", "anomalia", "violacao-observada", "violacao-reproduzida", "inconclusivo"]);
export const RULE_SOURCES = Object.freeze(["documented-policy", "lab-fixture", "approved-premise"]);
const CMP = { "<=": (a, b) => a <= b, "<": (a, b) => a < b, "==": (a, b) => a == b, ">=": (a, b) => a >= b, ">": (a, b) => a > b, "!=": (a, b) => a != b };
const MAX_ATTEMPTS = 10;

function pick(obj, fields) { const o = {}; for (const f of fields || []) o[f] = obj ? obj[f] : undefined; return o; }
function matchesSubset(state, required) { for (const k of Object.keys(required || {})) { if (state[k] !== required[k]) return false; } return true; }

export class StatefulRaceValidator {
  /** @param {{manager, executor}} deps */
  constructor({ manager, executor }) {
    if (!manager || !executor) throw new Error("StatefulRaceValidator requires { manager, executor }");
    this.m = manager; this.ex = executor;
  }

  async _observe(exp) {
    try {
      const p = await this.m.request(exp.observerSessionId, { op: "probe", url: exp.observe.stateUrl });
      if (!p || p.status !== 200 || !p.body) return { ok: false, reason: `state oracle status=${p && p.status}` };
      let obj; try { obj = JSON.parse(p.body); } catch { return { ok: false, reason: "state oracle not JSON" }; }
      return { ok: true, state: pick(obj, exp.observe.fields) };
    } catch (e) { return { ok: false, reason: String(e && e.message || e) }; }
  }
  async _reset(exp, url) {
    try { const p = await this.m.request(exp.observerSessionId, { op: "probe", method: "POST", url }); return !!p && p.status >= 200 && p.status < 300; }
    catch { return false; }
  }
  _invariantHolds(inv, initial, final) {
    if (typeof inv.assert === "function") return !!inv.assert(initial, final);
    const v = final[inv.field]; const cmp = CMP[inv.op];
    if (!cmp) throw new Error(`unknown invariant op: ${inv.op}`);
    return cmp(v, inv.value);
  }

  /** Run the stateful experiment. Returns a structured, sanitized report. */
  async run(experiment, { signal } = {}) {
    const exp = experiment || {};
    const experimentId = exp.experimentId || `rex-${crypto.randomBytes(5).toString("hex")}`;
    const rule = exp.expectedRule || {};
    const inv = exp.invariant;
    const base = { experimentId, hypothesis: exp.hypothesis || "", rule: { description: rule.description || "", source: rule.source || null } };

    // Guard: a rule must be ESTABLISHED with a stated source, and an invariant declared.
    if (!inv || !rule.source || !RULE_SOURCES.includes(rule.source)) {
      return { ...base, classification: "inconclusivo", rationale: "regra não estabelecida (fonte ausente/ inválida) — o validador não inventa regras", attempts: [], summary: emptySummary(), contaminated: false };
    }
    if (!exp.observe || !exp.observe.stateUrl) return { ...base, classification: "inconclusivo", rationale: "fonte autoritativa de observação ausente", attempts: [], summary: emptySummary(), contaminated: false };

    const maxAttempts = Math.min(exp.attempts || 1, MAX_ATTEMPTS);
    const attempts = [];
    let contaminated = false;

    for (let i = 1; i <= maxAttempts; i++) {
      if (signal && signal.aborted) { attempts.push({ attempt: i, state: "inconclusivo", reason: "cancelado durante o experimento", executed: false }); break; }

      // (2) prepare initial state + (3) verify precondition via the AUTHORITATIVE oracle
      await this._reset(exp, (exp.reset && exp.reset.url) || null).catch(() => false);
      const obs0 = await this._observe(exp);
      if (!obs0.ok) { attempts.push({ attempt: i, state: "inconclusivo", reason: `estado inicial não comprovável: ${obs0.reason}`, executed: false }); break; }
      if (exp.requiredInitialState && !matchesSubset(obs0.state, exp.requiredInitialState)) {
        attempts.push({ attempt: i, state: "inconclusivo", reason: "pré-condição falhou (estado inicial diverge do exigido)", executed: false, observed: { initial: obs0.state } });
        break; // initial state cannot be proven as required -> do not execute
      }

      // (4) prepare operations (Scope Guard + state-change gate applied here)
      const prep = this.ex.prepare({ experimentId: `${experimentId}-a${i}`, operations: exp.operations, limits: exp.limits });
      const blocked = prep.operations.filter((o) => !o.valid);
      if (blocked.length) {
        attempts.push({ attempt: i, state: "inconclusivo", reason: `operação(ões) bloqueada(s): ${blocked.map((b) => b.blockReason).join(",")}`, executed: false, observed: { initial: obs0.state } });
        break; // cannot run the intended race (out-of-scope or unauthorized state change)
      }

      // (5-7) release barrier, execute, await/timeout
      const res = await this.ex.run(prep, { signal });

      // (8) observe final state by the authoritative source
      const obs1 = await this._observe(exp);
      if (!obs1.ok) { attempts.push({ attempt: i, state: "inconclusivo", reason: `estado final não observável: ${obs1.reason}`, executed: true, observed: { initial: obs0.state }, ops: res.summary }); }
      else {
        // (9) evaluate invariants over AUTHORITATIVE state (never from HTTP results alone)
        const held = this._invariantHolds(inv, obs0.state, obs1.state);
        const stateChanged = JSON.stringify(obs0.state) !== JSON.stringify(obs1.state);
        const violation = !held && stateChanged; // state-change evidence required
        const st = violation ? "violacao" : (held ? "conforme" : "anomalia");
        attempts.push({
          attempt: i, state: st, executed: true,
          observed: { initial: obs0.state, final: obs1.state, opsSummary: res.summary }, // directly observed
          derived: { invariantHeld: held, stateChanged, violation },                      // agent-derived from observation
        });
      }

      // (11) restore initial state VERIFIABLY
      const resetOk = await this._reset(exp, (exp.reset && exp.reset.url) || null);
      const obsR = resetOk ? await this._observe(exp) : { ok: false };
      const restored = obsR.ok && (!exp.requiredInitialState || matchesSubset(obsR.state, exp.requiredInitialState));
      attempts[attempts.length - 1].resetVerified = !!restored;
      if (!restored) { contaminated = true; attempts[attempts.length - 1].resetFailed = true; break; } // stop; state potentially contaminated
    }

    // aggregate + classify
    const valid = attempts.filter((a) => a.executed && (a.state === "conforme" || a.state === "anomalia" || a.state === "violacao"));
    const violations = valid.filter((a) => a.state === "violacao").length;
    const anomalies = valid.filter((a) => a.state === "anomalia").length;
    const sigs = new Set(valid.map((a) => JSON.stringify(a.observed && a.observed.final)));
    const summary = { attemptsTotal: attempts.length, validAttempts: valid.length, violations, anomalies, reproduced: violations >= 2, variability: sigs.size };

    let classification, rationale;
    if (valid.length === 0) { classification = "inconclusivo"; rationale = attempts.length ? (attempts[attempts.length - 1].reason || "nenhuma tentativa válida") : "sem tentativas"; }
    else if (violations >= 2) { classification = "violacao-reproduzida"; rationale = `invariante violada com evidência de alteração de estado em ${violations}/${valid.length} tentativas independentes sob regra ${rule.source}`; }
    else if (violations === 1) { classification = "violacao-observada"; rationale = `invariante violada com evidência de alteração de estado em 1 tentativa (observada; reprodução não descarta) sob regra ${rule.source}`; }
    else if (anomalies > 0) { classification = "anomalia"; rationale = "desvio sem evidência de alteração de estado — não confirmável como violação"; }
    else { classification = "conforme"; rationale = `invariante preservada em ${valid.length} tentativa(s)`; }

    return {
      ...base, classification, rationale, attempts, summary, contaminated,
      evidenceNote: "observed = leituras da fonte autoritativa; derived = veredicto do validador sobre as observações",
    };
  }
}

function emptySummary() { return { attemptsTotal: 0, validAttempts: 0, violations: 0, anomalies: 0, reproduced: false, variability: 0 }; }

export function createRaceValidator(deps) { return new StatefulRaceValidator(deps); }
