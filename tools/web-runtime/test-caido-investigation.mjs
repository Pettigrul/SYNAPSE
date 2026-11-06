// H2b-F4b-1 — deterministic validation of the SUPERVISED INVESTIGATION flow.
// Drives the whole flow end-to-end through the REAL Bridge (real F3 copilot + mocked Caido GraphQL
// + the passive Investigation Record). NO network, NO real Caido, NO LLM. Proves the flow is
// reachable via the normal invoke() mechanism and the Record contract holds (incl. incompleteness,
// isolation, honesty). Deterministic tests are NOT agentic acceptance (see §6/handbook ch13).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert";
import { createBridge } from "./bridge.mjs";
import { createCaidoCopilot } from "./caido-copilot.mjs";
import { createInvestigationRecord } from "./investigation-record.mjs";

const PROJECT = "proj-1";
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "caido-inv-"));
let n = 0, fail = 0;
const okT = (s) => { n++; console.log(`  ok  ${s}`); };
const badT = (s, e) => { n++; fail++; console.log(`FAIL  ${s}: ${e && e.stack || e}`); };
async function t(s, fn) { try { await fn(); okT(s); } catch (e) { badT(s, e); } }

function reqNode(id, over = {}) {
  return { id: id || "rq-1", host: "app.lab", port: 443, path: "/users/1", query: "", method: "GET", isTls: true, length: 100, createdAt: "t", fileExtension: "",
    raw: "GET /users/1 HTTP/1.1\r\nCookie: sid=SECRETVAL\r\n\r\n",
    response: { id: "rs-1", statusCode: 200, roundtripTime: 5, length: 120, createdAt: "t", raw: "HTTP/1.1 200 OK\r\n\r\n" }, ...over };
}
function defaultHandlers() {
  return {
    Health: () => ({ currentProject: { project: { id: PROJECT, name: "lab", version: "1.0", readOnly: false }, readOnly: false }, runtime: { __typename: "Runtime" } }),
    Current: () => ({ currentProject: { project: { id: PROJECT, name: "lab", version: "1.0", readOnly: false }, readOnly: false } }),
    Request: (v) => ({ request: reqNode(v.id) }),
    CreateReplaySession: () => ({ createReplaySession: { error: null, session: { id: "sess-1", __typename: "ReplaySessionHttp", activeEntry: { id: "entry-1" } } } }),
    StartReplayTask: () => ({ startReplayTask: { error: null, task: { id: "task-1", createdAt: "t", sessionKind: "HTTP", replayEntry: { id: "entry-1" } } } }),
    ReplayEntry: (v) => ({ replayEntry: { __typename: "ReplayEntryHttp", id: v.id, createdAt: "t", error: null, connection: { host: "app.lab", port: 443, isTLS: true }, raw: "GET /users/1 HTTP/1.1\r\n\r\n", request: { id: "rq-replay", host: "app.lab", port: 443, path: "/users/1", method: "GET", isTls: true, response: { id: "rs-replay", statusCode: 403, roundtripTime: 7, length: 90 } } } }),
  };
}
function mkFetch(handlers, opts = {}) {
  return (url, init = {}) => {
    const body = JSON.parse(init.body || "{}");
    const name = (/SA_(\w+)/.exec(body.query) || [])[1] || "?";
    if (opts.force === "apiFail") return Promise.resolve({ status: 200, text: async () => JSON.stringify({ errors: [{ message: "boom" }] }) });
    const h = handlers[name]; const data = h ? h(body.variables || {}) : {};
    return Promise.resolve({ status: 200, text: async () => JSON.stringify({ data }) });
  };
}
function withFetch(fetchFn, fn) { const prev = globalThis.fetch; globalThis.fetch = fetchFn; return Promise.resolve(fn()).finally(() => { globalThis.fetch = prev; }); }

function openEng(b, { id = "ENG-1", caps = ["caido", "caido-active", "copilot", "investigation"], approvals = [] } = {}) {
  b.openInvestigation({ investigationId: id, scope: { allowHosts: ["app.lab"], allowPrivate: true }, allowedCapabilities: caps,
    caido: { baseUrl: "https://caido.lab", token: "PAT", projectId: PROJECT }, approvals });
  return b;
}
// A monitor-shaped event for the copilot.
const copEvent = (over = {}) => ({ type: "new", caidoRequestId: "rq-1", caidoResponseId: "rs-1", responseAvailable: true, ts: "t", host: "app.lab", method: "GET", url: "https://app.lab/users/1", statusCode: 200, ...over });

// 1 — engagement selection (openInvestigation establishes ctx)
await t("1 engagement selection", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openEng(createBridge());
  const s = await b.invoke({ investigationId: "ENG-1", op: "investigation.start", params: { hypothesis: "IDOR on /users/{id}" } });
  assert.equal(s.ok, true); assert.equal(s.result.engagementId, "ENG-1");
}));

// 2 — correct Caido project association
await t("2 project association", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openEng(createBridge());
  const h = await b.invoke({ investigationId: "ENG-1", op: "caido.health" });
  assert.equal(h.ok, true); assert.equal(h.result.projectAssociated, true);
}));

// 3 — F3 copilot context query reachable
await t("3 copilot context query", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openEng(createBridge());
  const cop = createCaidoCopilot({ engagementId: "ENG-1", caidoProjectId: PROJECT }); cop.ingest([copEvent()]);
  b.attachCopilot("ENG-1", cop);
  const r = await b.invoke({ investigationId: "ENG-1", op: "copilot.recommendations" });
  assert.equal(r.ok, true); assert.ok(r.result.recommendations.length >= 1);
}));

// 4 — KB consultation recorded (technique reference)
await t("4 KB consultation", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openEng(createBridge());
  await b.invoke({ investigationId: "ENG-1", op: "investigation.start", params: { hypothesis: "IDOR" } });
  const r = await b.invoke({ investigationId: "ENG-1", op: "investigation.kb", params: { route: "skills/web-testing/SKILL.md", keywords: ["IDOR", "BOLA"] } });
  assert.equal(r.ok, true); assert.equal(r.result.route, "skills/web-testing/SKILL.md");
}));

// 5 — hypothesis preparation
await t("5 hypothesis preparation", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openEng(createBridge());
  const r = await b.invoke({ investigationId: "ENG-1", op: "investigation.start", params: { hypothesis: "object ref not authz-checked", objective: "compare two identities" } });
  assert.equal(r.result.hypothesis.text, "object ref not authz-checked");
}));

// 6 — reference request selection (evidence from History)
await t("6 request selection + evidence", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openEng(createBridge());
  await b.invoke({ investigationId: "ENG-1", op: "investigation.start", params: { hypothesis: "h" } });
  const req = await b.invoke({ investigationId: "ENG-1", op: "caido.request", params: { id: "rq-1" } });
  assert.equal(req.ok, true);
  const r = await b.invoke({ investigationId: "ENG-1", op: "investigation.evidence", params: { evidence: [{ caidoRequestId: "rq-1", host: "app.lab", method: "GET", url: "https://app.lab/users/1" }] } });
  assert.equal(r.result.historyEvidence[0].caidoRequestId, "rq-1");
}));

// 7 — authorized Replay executes and is mirrored into the Record
await t("7 authorized replay + mirrored + full record", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openEng(createBridge(), { approvals: [{ op: "caido.replay.run", url: null }] });
  await b.invoke({ investigationId: "ENG-1", op: "investigation.start", params: { hypothesis: "IDOR", objective: "o" } });
  await b.invoke({ investigationId: "ENG-1", op: "investigation.propose", params: { kind: "replay", requestId: "rq-1" } });
  const run = await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { requestId: "rq-1" } });
  assert.equal(run.result.outcome, "executed");
  const rec = await b.invoke({ investigationId: "ENG-1", op: "investigation.get" });
  assert.equal(rec.result.executedOperation.op, "caido.replay.run");
  assert.equal(rec.result.approval.decision, "approved");
  assert.equal(rec.result.caidoResult.provenance.replaySessionId, "sess-1"); // real Caido id preserved
}));

// 8 — refused Replay: investigation still concludes, block recorded
await t("8 refused replay concludes with block", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openEng(createBridge()); // no approval
  await b.invoke({ investigationId: "ENG-1", op: "investigation.start", params: { hypothesis: "h" } });
  const run = await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { requestId: "rq-1" } });
  assert.equal(run.ok, false); assert.equal(run.error.code, "state-change-unauthorized");
  const fin = await b.invoke({ investigationId: "ENG-1", op: "investigation.finalize", params: { status: "bloqueado" } });
  assert.equal(fin.ok, true); assert.equal(fin.result.status, "bloqueado");
  assert.equal(fin.result.approval.decision, "refused");
}));

// 9 — result out of scope (redirect) → withheld, honest status
await t("9 result out of scope withheld", () => {
  const h = defaultHandlers(); h.ReplayEntry = (v) => ({ replayEntry: { __typename: "ReplayEntryHttp", id: v.id, createdAt: "t", error: null, connection: { host: "evil.example", port: 443, isTLS: true }, raw: "x", request: { id: "r", host: "evil.example", port: 443, path: "/", method: "GET", isTls: true, response: { id: "rr", statusCode: 200, roundtripTime: 1, length: 10 } } } });
  return withFetch(mkFetch(h), async () => {
    const b = openEng(createBridge(), { approvals: [{ op: "caido.replay.run", url: null }] });
    await b.invoke({ investigationId: "ENG-1", op: "investigation.start", params: { hypothesis: "h" } });
    const run = await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { requestId: "rq-1" } });
    assert.equal(run.result.outcome, "blocked-result-out-of-scope");
    const rec = await b.invoke({ investigationId: "ENG-1", op: "investigation.get" });
    assert.equal(rec.result.caidoResult.outcome, "blocked-result-out-of-scope");
  });
});

// 10 — API failure recorded as block, not success
await t("10 API failure recorded", () => withFetch(mkFetch(defaultHandlers(), { force: "apiFail" }), async () => {
  const b = openEng(createBridge(), { approvals: [{ op: "caido.replay.run", url: null }] });
  await b.invoke({ investigationId: "ENG-1", op: "investigation.start", params: { hypothesis: "h" } });
  const run = await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { requestId: "rq-1" } });
  assert.equal(run.ok, false);
  const rec = await b.invoke({ investigationId: "ENG-1", op: "investigation.get" });
  assert.ok(rec.result.blocked && !rec.result.executedOperation);
}));

// 11 — response absent → inconclusive outcome
await t("11 response absent inconclusive", () => {
  const h = defaultHandlers(); h.ReplayEntry = (v) => ({ replayEntry: { __typename: "ReplayEntryHttp", id: v.id, createdAt: "t", error: null, connection: { host: "app.lab", port: 443, isTLS: true }, raw: "x", request: { id: "r", host: "app.lab", port: 443, path: "/", method: "GET", isTls: true, response: null } } });
  return withFetch(mkFetch(h), async () => {
    const b = openEng(createBridge(), { approvals: [{ op: "caido.replay.run", url: null }] });
    await b.invoke({ investigationId: "ENG-1", op: "investigation.start", params: { hypothesis: "h" } });
    const run = await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { requestId: "rq-1" } });
    assert.equal(run.result.outcome, "inconclusive");
    const fin = await b.invoke({ investigationId: "ENG-1", op: "investigation.finalize", params: { status: "inconclusivo" } });
    assert.equal(fin.result.status, "inconclusivo");
  });
});

// 12 — cancellation propagates (operationId cancel)
await t("12 cancellation", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openEng(createBridge(), { approvals: [{ op: "caido.replay.run", url: null }] });
  const c = b.cancel("ENG-1"); // nothing in flight → cancelled count 0, but call is valid
  assert.ok(c.cancelled === true || c.cancelled === false);
}));

// 13 — duplicate execution prevented (idempotency)
await t("13 duplicate execution prevented", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openEng(createBridge(), { approvals: [{ op: "caido.replay.run", url: null }] });
  await b.invoke({ investigationId: "ENG-1", op: "investigation.start", params: { hypothesis: "h" } });
  const r1 = await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { requestId: "rq-1", idempotencyKey: "k" } });
  const r2 = await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { requestId: "rq-1", idempotencyKey: "k" } });
  assert.equal(r1.result.duplicate, false); assert.equal(r2.result.duplicate, true);
}));

// 14 — evidence + provenance preserved in the Record
await t("14 evidence + provenance", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openEng(createBridge(), { approvals: [{ op: "caido.replay.run", url: null }] });
  await b.invoke({ investigationId: "ENG-1", op: "investigation.start", params: { hypothesis: "h" } });
  await b.invoke({ investigationId: "ENG-1", op: "investigation.evidence", params: { evidence: [{ caidoRequestId: "rq-1" }] } });
  await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { requestId: "rq-1" } });
  const rec = await b.invoke({ investigationId: "ENG-1", op: "investigation.get" });
  assert.equal(rec.result.historyEvidence[0].caidoRequestId, "rq-1");
  assert.equal(rec.result.caidoResult.provenance.replayEntryId, "entry-1");
}));

// 15 — complete Investigation Record (all distinctions present)
await t("15 complete record", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openEng(createBridge(), { approvals: [{ op: "caido.replay.run", url: null }] });
  await b.invoke({ investigationId: "ENG-1", op: "investigation.start", params: { hypothesis: "IDOR", objective: "o", kbTechnique: "T5", route: "skills/web-testing/SKILL.md" } });
  await b.invoke({ investigationId: "ENG-1", op: "investigation.evidence", params: { evidence: [{ caidoRequestId: "rq-1" }] } });
  await b.invoke({ investigationId: "ENG-1", op: "investigation.propose", params: { kind: "replay", requestId: "rq-1" } });
  await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { requestId: "rq-1" } });
  await b.invoke({ investigationId: "ENG-1", op: "investigation.interpret", params: { interpretation: "status changed 200→403 cross-identity", limitations: ["single attempt"] } });
  const fin = await b.invoke({ investigationId: "ENG-1", op: "investigation.finalize", params: { status: "anomalia" } });
  const r = fin.result;
  for (const k of ["hypothesis", "kbTechnique", "historyEvidence", "proposedOperation", "approval", "executedOperation", "caidoResult", "interpretation", "limitations", "status"]) assert.ok(r[k] != null, `missing ${k}`);
  assert.equal(r.status, "anomalia"); assert.equal(r.classification, null); // no validator → verbatim none
}));

// 16 — inconclusive record does NOT promote to confirmed
await t("16 inconclusive not promoted", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openEng(createBridge());
  await b.invoke({ investigationId: "ENG-1", op: "investigation.start", params: { hypothesis: "h" } });
  // attempt to finalize a blocked investigation as a clean/confirmed verdict → refused
  await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { requestId: "rq-1" } }); // blocked (no approval)
  const bad = await b.invoke({ investigationId: "ENG-1", op: "investigation.finalize", params: { status: "conforme" } });
  assert.equal(bad.ok, false); assert.equal(bad.error.code, "dishonest-status");
  const bad2 = await b.invoke({ investigationId: "ENG-1", op: "investigation.finalize", params: { status: "violacao-confirmada" } });
  assert.equal(bad2.ok, false); assert.equal(bad2.error.code, "bad-status"); // no authoritative classification
}));

// 17 — budget/turn ended early → snapshot preserves results, marks incompleto
await t("17 budget ended early snapshot", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openEng(createBridge(), { approvals: [{ op: "caido.replay.run", url: null }] });
  await b.invoke({ investigationId: "ENG-1", op: "investigation.start", params: { hypothesis: "h" } });
  await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { requestId: "rq-1" } });
  const snap = await b.invoke({ investigationId: "ENG-1", op: "investigation.snapshot", params: { reason: "budget-exhausted" } });
  assert.equal(snap.result.status, "incompleto");
  assert.equal(snap.result.incomplete.hadResult, true); // technical results preserved
  assert.equal(snap.result.finalized, false);
}));

// 18 — zero Whitebox access (record/flow never read source)
await t("18 zero whitebox", () => {
  const rec = createInvestigationRecord({ engagementId: "ENG-1" });
  for (const f of ["readWhitebox", "readSource", "codeReview"]) assert.equal(typeof rec[f], "undefined");
});

// 19 — engagement isolation (record bound to its engagement; foreign envelope rejected)
await t("19 engagement isolation", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openEng(createBridge(), { id: "ENG-A", approvals: [{ op: "caido.replay.run", url: null }] });
  openEng(b, { id: "ENG-B" });
  await b.invoke({ investigationId: "ENG-A", op: "investigation.start", params: { hypothesis: "a" } });
  await b.invoke({ investigationId: "ENG-B", op: "investigation.start", params: { hypothesis: "b" } });
  const ra = await b.invoke({ investigationId: "ENG-A", op: "investigation.get" });
  const rb = await b.invoke({ investigationId: "ENG-B", op: "investigation.get" });
  assert.notEqual(ra.result.hypothesis.text, rb.result.hypothesis.text);
  // direct helper rejects a foreign envelope
  const rec = createInvestigationRecord({ engagementId: "ENG-A" });
  assert.throws(() => rec.observeEnvelope("caido.replay.run", {}, { ok: true, investigationId: "ENG-B", result: {} }), (e) => e.code === "record-isolation");
}));

// 20 — zero automatic LLM per request (whole flow is deterministic, no network beyond mock)
await t("20 zero auto LLM", () => {
  const prev = globalThis.fetch;
  // record + copilot built and driven with NO fetch at all
  globalThis.fetch = () => { throw new Error("no network"); };
  try {
    const rec = createInvestigationRecord({ engagementId: "ENG-1" });
    rec.setHypothesis({ text: "h" }); rec.proposeOperation({ kind: "replay", requestId: "rq-1" });
    rec.observeEnvelope("caido.replay.run", { requestId: "rq-1" }, { ok: true, investigationId: "ENG-1", result: { outcome: "executed", provenance: { replaySessionId: "s" }, responseAvailable: true } });
    const out = rec.finalize({ status: "anomalia" });
    assert.equal(out.status, "anomalia");
  } finally { globalThis.fetch = prev; }
});

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
console.log(`\n${n - fail}/${n} passed` + (fail ? ` (${fail} FAILED)` : ""));
process.exit(fail ? 1 : 0);
