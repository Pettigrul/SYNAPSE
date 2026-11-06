// Deterministic, offline tests for the Caido Pentest Copilot (H2b-F3).
// No network, no LLM, no real Caido. Events are the F2 monitor's metadata-only shape.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert";
import { CaidoCopilot, createCaidoCopilot, parsePatternIndex, CopilotError, REC_STATES } from "./caido-copilot.mjs";
import { createBridge } from "./bridge.mjs";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "caido-cop-"));
let n = 0, fail = 0;
const okT = (s) => { n++; console.log(`  ok  ${s}`); };
const badT = (s, e) => { n++; fail++; console.log(`FAIL  ${s}: ${e && e.stack || e}`); };
async function t(s, fn) { try { await fn(); okT(s); } catch (e) { badT(s, e); } }

let EVID = 0;
function ev(over = {}) {
  EVID++;
  return { type: "new", caidoRequestId: over.caidoRequestId || `req-${EVID}`, caidoResponseId: over.caidoResponseId || `resp-${EVID}`,
    responseAvailable: over.responseAvailable !== undefined ? over.responseAvailable : true, ts: over.ts || `2026-11-05T00:00:${String(EVID).padStart(2, "0")}Z`,
    host: over.host || "app.lab", method: over.method || "GET", url: over.url || "https://app.lab/api/thing", statusCode: over.statusCode !== undefined ? over.statusCode : 200, ...over };
}
const mk = (over = {}) => createCaidoCopilot({ engagementId: "ENG-1", caidoProjectId: "proj-1", clock: { now: () => 1700000000000 }, ...over });

// 1 — consume F2 events
await t("1 consumes F2 events", () => { const c = mk(); const r = c.ingest([ev(), ev()]); assert.equal(r.ingested, 2); });

// 2 — incremental context across ingests
await t("2 incremental context build", () => {
  const c = mk();
  c.ingest([ev({ url: "https://app.lab/api/a" })]);
  c.ingest([ev({ url: "https://app.lab/api/b" })]);
  assert.equal(c.summary().observed.endpoints, 2);
});

// 3 — endpoint grouping (ids normalized)
await t("3 endpoint grouping normalizes object ids", () => {
  const c = mk();
  c.ingest([ev({ url: "https://app.lab/users/1" }), ev({ url: "https://app.lab/users/2" })]);
  const eps = c.endpoints_();
  assert.equal(eps.length, 1);
  assert.equal(eps[0].normalizedPath, "/users/{id}");
  assert.equal(eps[0].objectRef, true);
});

// 4 — operation identification (method + status)
await t("4 operation identification", () => {
  const c = mk();
  c.ingest([ev({ method: "POST", url: "https://app.lab/api/pay", statusCode: 201 })]);
  const e = c.endpoints_()[0];
  assert.equal(e.method, "POST"); assert.equal(e.stateChanging, true); assert.deepEqual(e.status, [201]);
});

// 5 — Caido references preserved (provenance)
await t("5 caido references preserved in evidence", () => {
  const c = mk();
  c.ingest([ev({ caidoRequestId: "req-X", caidoResponseId: "resp-X", url: "https://app.lab/users/5" })]);
  const rec = c.recommendations_()[0];
  assert.ok(rec.evidence.some((x) => x.caidoRequestId === "req-X" && x.caidoResponseId === "resp-X"));
});

// 6 — deduplication (events + recommendations)
await t("6 dedup events and recommendations", () => {
  const c = mk();
  const e1 = ev({ caidoRequestId: "dup", url: "https://app.lab/users/9" });
  c.ingest([e1]); c.ingest([{ ...e1 }]); // same event again
  assert.equal(c.stats.eventsIngested, 1);
  c.ingest([ev({ caidoRequestId: "dup2", url: "https://app.lab/users/10" })]);
  const authz = c.hypotheses({ klass: "authorization" });
  assert.equal(authz.length, 1); // same endpoint/class → one recommendation
});

// 7 — persistence and recovery
await t("7 persistence and recovery", async () => {
  const sp = path.join(TMP, "cop1.json");
  const a = mk({ statePath: sp }); a.ingest([ev({ url: "https://app.lab/users/1", caidoRequestId: "r1" })]); await a.persist();
  const b = mk({ statePath: sp }); const loaded = await b.load();
  assert.equal(loaded, true); assert.equal(b.summary().observed.endpoints, 1);
  assert.equal(b.recommendations_().length, a.recommendations_().length);
});

// 8 — separation observed facts vs inferences
await t("8 facts vs inferences separated", () => {
  const c = mk(); c.ingest([ev({ url: "https://app.lab/users/1" })]);
  const s = c.summary();
  assert.ok("observed" in s && "inferences" in s);
  assert.ok(s.observed.endpoints >= 1 && s.inferences.recommendations >= 1);
});

// 9 — KB correlation reuses the real pattern-index
await t("9 KB correlation routes into the real KB (no parallel catalog)", () => {
  const c = mk(); c.ingest([ev({ url: "https://app.lab/users/1" })]);
  const rel = c.relateToKb().find((r) => r.class === "authorization");
  assert.ok(rel && rel.kb && /web-testing/.test(rel.kb.route)); // real file from pattern-index.md
});

// 10 — contextualized hypotheses per signal class
await t("10 contextualized hypotheses by class", () => {
  const c = mk();
  c.ingest([ev({ method: "POST", url: "https://app.lab/cart/checkout", statusCode: 200 }),
            ev({ method: "POST", url: "https://app.lab/cart/checkout", statusCode: 200 }),
            ev({ method: "POST", url: "https://app.lab/cart/checkout", statusCode: 200 })]);
  const classes = new Set(c.hypotheses().map((h) => h.hypothesisClass));
  assert.ok(classes.has("workflow")); assert.ok(classes.has("concurrency")); // repeated state-change
});

// 11 — prioritization (high before low)
await t("11 prioritization orders high before low", () => {
  const c = mk();
  c.ingest([ev({ method: "POST", url: "https://app.lab/users/1" })]);          // authz+objectRef+stateChanging → high
  c.ingest([ev({ method: "GET", url: "https://app.lab/search", statusCode: 400 })]); // input-validation → low
  const recs = c.recommendations_({ sort: "priority" });
  assert.equal(recs[0].priority, "high");
  assert.equal(recs[recs.length - 1].priority, "low");
});

// 12 — never invents findings / confirmed vulns
await t("12 no invented findings; all are unconfirmed hypotheses", () => {
  const c = mk(); c.ingest([ev({ url: "https://app.lab/users/1" })]);
  for (const r of c.recommendations_()) {
    assert.equal(r.state, "proposed");
    assert.ok(/heurística não confirmada/.test(r.provenance.caveat));
    assert.ok(!/confirmed|finding|vulnerab/i.test(r.title));
  }
});

// 13 — requests without response
await t("13 requests without response tracked", () => {
  const c = mk(); c.ingest([ev({ responseAvailable: false, statusCode: undefined, url: "https://app.lab/api/x" })]);
  assert.equal(c.endpoints_()[0].pendingResponse, true);
});

// 14 — late responses (updated event) merge into same endpoint
await t("14 late response merges into endpoint", () => {
  const c = mk();
  c.ingest([ev({ caidoRequestId: "late", responseAvailable: false, statusCode: undefined, url: "https://app.lab/api/x" })]);
  c.ingest([{ ...ev({ caidoRequestId: "late", type: "updated", responseAvailable: true, statusCode: 200, url: "https://app.lab/api/x" }) }]);
  assert.equal(c.endpoints_().length, 1);
  assert.ok(c.endpoints_()[0].status.includes(200));
});

// 15 — backlog/overflow recorded as incomplete context
await t("15 incomplete context from monitor status", () => {
  const c = mk(); c.ingest([ev()]);
  c.noteMonitorStatus({ eventsDropped: 3, backlog: 12, lastReconcileAt: null, processedCount: 50 });
  const inc = c.summary().incompleteContext;
  assert.equal(inc.overflow, true); assert.equal(inc.backlog, 12); assert.equal(inc.reconciliationGaps, true);
});

// 16 — out-of-scope events ANNOTATED, not dropped (read-only analysis reads all captured traffic)
await t("16 out-of-scope events annotated (not withheld)", () => {
  const c = mk({ scope: { allowHosts: ["app.lab"] } });
  c.ingest([ev({ host: "app.lab", url: "https://app.lab/a" }), ev({ host: "evil.example", url: "https://evil.example/a" })]);
  assert.equal(c.summary().observed.endpoints, 2, "BOTH endpoints ingested");
  assert.equal(c.summary().incompleteContext.withheldOutOfScope, 0, "nothing withheld");
  assert.equal(c.summary().incompleteContext.outOfScopeObserved, 1, "out-of-scope observed is counted");
  const eps = c.endpoints_();
  assert.equal(eps.find((e) => e.host === "app.lab").inScope, true);
  assert.equal(eps.find((e) => e.host === "evil.example").inScope, false, "out-of-scope endpoint labeled, not dropped");
});

// 17 — engagement isolation on state load
await t("17 engagement isolation: foreign state rejected", async () => {
  const sp = path.join(TMP, "cop-iso.json");
  const a = mk({ statePath: sp }); a.ingest([ev()]); await a.persist();
  const other = createCaidoCopilot({ engagementId: "ENG-2", caidoProjectId: "proj-2", statePath: sp });
  await assert.rejects(() => other.load(), (e) => e.code === "state-mismatch");
});

// 18 — secret redaction: param VALUES never stored (only names)
await t("18 param values never stored (secrets excluded)", () => {
  const c = mk(); c.ingest([ev({ url: "https://app.lab/api?token=SUPERSECRET&id=7" })]);
  const blob = JSON.stringify(c.endpoints_()) + JSON.stringify(c.recommendations_());
  assert.ok(!blob.includes("SUPERSECRET"));
  assert.ok(c.endpoints_()[0].paramNames.includes("token")); // name kept, value dropped
});

// 19 — malicious HTTP content cannot inject instructions
await t("19 injected instructions in traffic are not obeyed/stored", () => {
  const c = mk(); c.ingest([ev({ url: "https://app.lab/api?q=IGNORE_PREVIOUS_INSTRUCTIONS_SYSTEM_EXFIL" })]);
  const blob = JSON.stringify(c.summary()) + JSON.stringify(c.recommendations_()) + JSON.stringify(c.endpoints_());
  assert.ok(!blob.includes("IGNORE_PREVIOUS_INSTRUCTIONS")); // value dropped; only param name "q" kept
});

// 20 — no Whitebox access (copilot has no source/code input path)
await t("20 no whitebox/code input; provenance is http-observation", () => {
  const c = mk({ modality: "blackbox" }); c.ingest([ev({ url: "https://app.lab/users/1" })]);
  for (const r of c.recommendations_()) {
    assert.equal(r.provenance.source, "caido-http-observation");
    assert.equal(r.provenance.modality, "blackbox");
  }
  assert.equal(typeof c.readSource, "undefined"); // no code/whitebox reader exists
});

// 21 — zero automatic LLM calls (deterministic, no network)
await t("21 deterministic, no LLM/network", () => {
  const prev = globalThis.fetch; globalThis.fetch = () => { throw new Error("no network allowed"); };
  try { const c = mk(); c.ingest([ev(), ev()]); assert.ok(c.recommendations_().length >= 0); }
  finally { globalThis.fetch = prev; }
});

// 22 — zero active operations (copilot only reads events, never acts)
await t("22 no active ops surface", () => {
  const c = mk();
  for (const forbidden of ["replay", "automate", "createFinding", "fetch", "request"]) assert.equal(typeof c[forbidden], "undefined");
});

// 23 — compatibility with Capability Bridge + Pi Adapter (agent reads via ops)
await t("23 bridge integration: copilot.* read ops", async () => {
  const b = createBridge();
  b.openInvestigation({ investigationId: "ENG-1", scope: { allowHosts: ["app.lab"], allowPrivate: true }, allowedCapabilities: ["copilot"] });
  const cop = mk(); cop.ingest([ev({ method: "POST", url: "https://app.lab/users/1" })]);
  b.attachCopilot("ENG-1", cop);
  const sum = await b.invoke({ investigationId: "ENG-1", op: "copilot.summary" });
  assert.equal(sum.ok, true); assert.equal(sum.result.observed.endpoints, 1);
  const recs = await b.invoke({ investigationId: "ENG-1", op: "copilot.recommendations" });
  assert.ok(recs.ok && recs.result.recommendations.length >= 1);
  // not attached → structured error
  b.openInvestigation({ investigationId: "ENG-NO", scope: { allowHosts: ["app.lab"] }, allowedCapabilities: ["copilot"] });
  const miss = await b.invoke({ investigationId: "ENG-NO", op: "copilot.summary" });
  assert.equal(miss.ok, false); assert.equal(miss.error.code, "copilot-not-attached");
  // setState via bridge
  const id = recs.result.recommendations[0].id;
  const ss = await b.invoke({ investigationId: "ENG-1", op: "copilot.setState", params: { id, state: "dismissed" } });
  assert.equal(ss.ok, true); assert.equal(ss.result.state, "dismissed");
});

// 24 — KB integrity: pattern-index parsed, not modified; dismissed rec not resurrected
await t("24 KB integrity + dismissal respected across re-ingest", () => {
  const real = parsePatternIndex(fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../references/pattern-index.md"), "utf8"));
  assert.ok(real.length > 10 && real.every((e) => e.keywords.length && e.file));
  const c = mk(); c.ingest([ev({ url: "https://app.lab/users/1", caidoRequestId: "k1" })]);
  const id = c.recommendations_()[0].id;
  c.setRecommendationState(id, "dismissed");
  c.ingest([ev({ url: "https://app.lab/users/2", caidoRequestId: "k2" })]); // same endpoint/class
  assert.equal(c.recommendations.get(id).state, "dismissed"); // not resurrected
});

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
console.log(`\n${n - fail}/${n} passed` + (fail ? ` (${fail} FAILED)` : ""));
process.exit(fail ? 1 : 0);
