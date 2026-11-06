// Deterministic, offline tests for Caido Testing Operations (H2b-F4a).
// NO network, NO real Caido, NO LLM. A GraphQL mock dispatches on the SA_* operation name.
// Active ops run against the mock only; real integration remains NOT RUN.

import assert from "node:assert";
import { createBridge } from "./bridge.mjs";
import { createCaidoActiveClient } from "./backends/caido-active.mjs";

const PROJECT = "proj-1";
let n = 0, fail = 0;
const okT = (s) => { n++; console.log(`  ok  ${s}`); };
const badT = (s, e) => { n++; fail++; console.log(`FAIL  ${s}: ${e && e.stack || e}`); };
async function t(s, fn) { try { await fn(); okT(s); } catch (e) { badT(s, e); } }

// --- GraphQL mock ------------------------------------------------------------
function reqNode(id, over = {}) {
  return { id: id || "rq-1", host: "app.lab", port: 443, path: "/users/1", query: "", method: "GET", isTls: true, length: 100, createdAt: "t", fileExtension: "",
    raw: "GET /users/1 HTTP/1.1\r\nHost: app.lab\r\nCookie: sid=SECRETVAL\r\n\r\n",
    response: { id: "rs-1", statusCode: 200, roundtripTime: 5, length: 120, createdAt: "t", raw: "HTTP/1.1 200 OK\r\n\r\n" }, ...over };
}
function defaultHandlers() {
  return {
    Current: () => ({ currentProject: { project: { id: PROJECT, name: "lab", version: "1.0", readOnly: false }, readOnly: false } }),
    Request: (v) => ({ request: reqNode(v.id) }),
    Findings: () => ({ findings: { edges: [{ cursor: "c1", node: { id: "f1", title: "Observed", reporter: "hackbot", host: "app.lab", path: "/users/1", dedupeKey: "dk-1", hidden: false, createdAt: "t", request: { id: "rq1", host: "app.lab", path: "/users/1", method: "GET" } } }], pageInfo: { endCursor: "c1", hasNextPage: false } } }),
    Finding: (v) => ({ finding: { id: v.id, title: "T", reporter: "hackbot", host: "app.lab", path: "/x", dedupeKey: null, hidden: false, description: null, createdAt: "t", request: { id: "rq", host: "app.lab", port: 443, path: "/x", method: "GET", isTls: true } } }),
    CreateFinding: (v) => ({ createFinding: { error: null, finding: { id: "newf", title: v.input.title, reporter: v.input.reporter, host: "app.lab", path: "/users/1", dedupeKey: v.input.dedupeKey || null, createdAt: "t" } } }),
    ReplayEntry: (v) => ({ replayEntry: { __typename: "ReplayEntryHttp", id: v.id, createdAt: "t", error: null, connection: { host: "app.lab", port: 443, isTLS: true }, raw: "GET /users/1 HTTP/1.1\r\nCookie: sid=SECRETVAL\r\n\r\n", request: { id: "rq-replay", host: "app.lab", port: 443, path: "/users/1", method: "GET", isTls: true, response: { id: "rs-replay", statusCode: 403, roundtripTime: 7, length: 90 } } } }),
    ReplaySessions: () => ({ replaySessions: { edges: [{ cursor: "s1", node: { id: "sess-1", name: "replay 1", __typename: "ReplaySessionHttp" } }], pageInfo: { endCursor: "s1", hasNextPage: false } } }),
    CreateReplaySession: () => ({ createReplaySession: { error: null, session: { id: "sess-1", __typename: "ReplaySessionHttp", activeEntry: { id: "entry-1" } } } }),
    StartReplayTask: () => ({ startReplayTask: { error: null, task: { id: "task-1", createdAt: "t", sessionKind: "HTTP", replayEntry: { id: "entry-1" } } } }),
    AutomateSessions: () => ({ automateSessions: { edges: [{ cursor: "a1", node: { id: "as1", name: "auto", connection: { host: "app.lab", port: 443, isTLS: true }, createdAt: "t" } }], pageInfo: { endCursor: "a1", hasNextPage: false } } }),
    AutomateSession: (v) => ({ automateSession: { id: v.id, name: "auto", connection: { host: "app.lab", port: 443, isTLS: true }, createdAt: "t", entries: [{ id: "ae1", name: "e", createdAt: "t" }] } }),
  };
}
// mkFetch(handlers, {force, log}) returns a fetch-like fn. force: authFail|serverError|graphqlError|hang.
function mkFetch(handlers, opts = {}) {
  const log = opts.log || [];
  return (url, init = {}) => {
    const body = JSON.parse(init.body || "{}");
    const name = (/SA_(\w+)/.exec(body.query) || [])[1] || "?";
    log.push(name);
    if (opts.force === "hang") return new Promise((_, rej) => { const onAbort = () => { const e = new Error("aborted"); e.name = "AbortError"; rej(e); }; if (init.signal && init.signal.aborted) return onAbort(); init.signal && init.signal.addEventListener("abort", onAbort); });
    if (opts.force === "authFail") return Promise.resolve({ status: 401, text: async () => "unauthorized" });
    if (opts.force === "serverError") return Promise.resolve({ status: 500, text: async () => "boom" });
    if (opts.force === "graphqlError") return Promise.resolve({ status: 200, text: async () => JSON.stringify({ errors: [{ message: "field X not found" }] }) });
    const h = handlers[name];
    const data = h ? h(body.variables || {}) : {};
    return Promise.resolve({ status: 200, text: async () => JSON.stringify({ data }) });
  };
}

function openInv(b, { caps = ["caido", "caido-active"], approvals = [], scope } = {}) {
  b.openInvestigation({ investigationId: "ENG-1", scope: scope || { allowHosts: ["app.lab"], allowPrivate: true }, allowedCapabilities: caps,
    caido: { baseUrl: "https://caido.lab", token: "PAT", projectId: PROJECT }, approvals });
  return b;
}
function withFetch(fetchFn, fn) { const prev = globalThis.fetch; globalThis.fetch = fetchFn; return Promise.resolve(fn()).finally(() => { globalThis.fetch = prev; }); }

// 1 — read-only findings query, scope-filtered
await t("1 read findings.list ok", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openInv(createBridge());
  const r = await b.invoke({ investigationId: "ENG-1", op: "caido.findings.list" });
  assert.equal(r.ok, true); assert.equal(r.result.findings.length, 1); assert.equal(r.result.findings[0].id, "f1");
}));

// 2 — active replay AUTHORIZED (approval + in scope) → executed
await t("2 replay.run authorized executes", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openInv(createBridge(), { approvals: [{ op: "caido.replay.run", url: null }] });
  const r = await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { requestId: "rq-1" } });
  assert.equal(r.ok, true); assert.equal(r.result.outcome, "executed"); assert.equal(r.result.provenance.source, "caido-replay");
}));

// 3 — active replay REFUSED (no approval) → blocked
await t("3 replay.run without approval blocked", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openInv(createBridge());
  const r = await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { requestId: "rq-1" } });
  assert.equal(r.ok, false); assert.equal(r.error.code, "state-change-unauthorized");
}));

// 4 — wrong project → caido-project-mismatch
await t("4 wrong project refused", () => {
  const h = defaultHandlers(); h.Current = () => ({ currentProject: { project: { id: "OTHER", name: "x", version: "1", readOnly: false }, readOnly: false } });
  return withFetch(mkFetch(h), async () => {
    const b = openInv(createBridge(), { approvals: [{ op: "caido.replay.run", url: null }] });
    const r = await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { requestId: "rq-1" } });
    assert.equal(r.ok, false); assert.equal(r.error.code, "caido-project-mismatch");
  });
});

// 5 — wrong scope (original target out of scope) → out-of-scope
await t("5 replay target out of scope refused", () => {
  const h = defaultHandlers(); h.Request = (v) => ({ request: reqNode(v.id, { host: "evil.example" }) });
  return withFetch(mkFetch(h), async () => {
    const b = openInv(createBridge(), { approvals: [{ op: "caido.replay.run", url: null }] });
    const r = await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { requestId: "rq-1" } });
    assert.equal(r.ok, false); assert.equal(r.error.code, "out-of-scope");
  });
});

// 6 — destination altered to an IN-scope host (modified raw) → executes
await t("6 modified replay to in-scope host executes", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openInv(createBridge(), { approvals: [{ op: "caido.replay.run", url: null }] });
  const r = await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { modifiedRaw: "GET /x HTTP/1.1\r\n\r\n", connection: { host: "app.lab", isTLS: true, port: 443 } } });
  assert.equal(r.ok, true); assert.equal(r.result.outcome, "executed");
}));

// 7a — redirect OUT of scope (modified connection) refused BEFORE execution
await t("7a modified replay to out-of-scope host refused", () => {
  const log = []; return withFetch(mkFetch(defaultHandlers(), { log }), async () => {
    const b = openInv(createBridge(), { approvals: [{ op: "caido.replay.run", url: null }] });
    const r = await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { modifiedRaw: "x", connection: { host: "evil.example", isTLS: true, port: 443 } } });
    assert.equal(r.ok, false); assert.equal(r.error.code, "out-of-scope");
    assert.ok(!log.includes("CreateReplaySession")); // never executed
  });
});

// 7b — result entry whose effective host LEFT scope → result withheld
await t("7b replay result out-of-scope withheld", () => {
  const h = defaultHandlers(); h.ReplayEntry = (v) => ({ replayEntry: { __typename: "ReplayEntryHttp", id: v.id, createdAt: "t", error: null, connection: { host: "evil.example", port: 443, isTLS: true }, raw: "x", request: { id: "r", host: "evil.example", port: 443, path: "/", method: "GET", isTls: true, response: { id: "rr", statusCode: 200, roundtripTime: 1, length: 10 } } } });
  return withFetch(mkFetch(h), async () => {
    const b = openInv(createBridge(), { approvals: [{ op: "caido.replay.run", url: null }] });
    const r = await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { requestId: "rq-1" } });
    assert.equal(r.ok, true); assert.equal(r.result.outcome, "blocked-result-out-of-scope");
    assert.equal(r.result.entry.raw, null); assert.equal(r.result.entry.response, null);
  });
});

// 8 — invalid params → replay-prerequisites
await t("8 replay without requestId/raw refused", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openInv(createBridge(), { approvals: [{ op: "caido.replay.run", url: null }] });
  const r = await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: {} });
  assert.equal(r.ok, false); assert.equal(r.error.code, "replay-prerequisites");
}));

// 9 — auth failure (client level)
await t("9 auth failure", () => withFetch(mkFetch(defaultHandlers(), { force: "authFail" }), async () => {
  const c = createCaidoActiveClient({ baseUrl: "https://caido.lab", token: "x" });
  await assert.rejects(() => c.listFindings({}), (e) => e.name === "CaidoError" && e.code === "auth-failed");
}));

// 10 — API/GraphQL failure
await t("10 graphql error surfaced", () => withFetch(mkFetch(defaultHandlers(), { force: "graphqlError" }), async () => {
  const c = createCaidoActiveClient({ baseUrl: "https://caido.lab", token: "x" });
  await assert.rejects(() => c.listFindings({}), (e) => e.code === "graphql-error");
}));

// 11 — timeout (client level, tiny timeout + hanging fetch)
await t("11 timeout", async () => {
  const c = createCaidoActiveClient({ baseUrl: "https://caido.lab", token: "x", fetchImpl: mkFetch(defaultHandlers(), { force: "hang" }), limits: { timeoutMs: 20 } });
  await assert.rejects(() => c.listFindings({}), (e) => e.code === "timeout");
});

// 12 — cancellation (client level, pre-aborted signal)
await t("12 cancellation", async () => {
  const c = createCaidoActiveClient({ baseUrl: "https://caido.lab", token: "x", fetchImpl: mkFetch(defaultHandlers(), { force: "hang" }) });
  const ac = new AbortController(); ac.abort();
  await assert.rejects(() => c.listFindings({}, { signal: ac.signal }), (e) => e.code === "cancelled");
});

// 13 — concurrency / quantity limit
await t("13 active-op limit enforced", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = createBridge();
  b.openInvestigation({ investigationId: "ENG-1", scope: { allowHosts: ["app.lab"], allowPrivate: true }, allowedCapabilities: ["caido", "caido-active"],
    caido: { baseUrl: "https://caido.lab", token: "PAT", projectId: PROJECT }, approvals: [{ op: "caido.replay.run", url: null }], limits: { maxActiveCaidoOps: 1 } });
  const r1 = await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { requestId: "rq-1", idempotencyKey: "k1" } });
  const r2 = await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { requestId: "rq-1", idempotencyKey: "k2" } });
  assert.equal(r1.ok, true); assert.equal(r2.ok, false); assert.equal(r2.error.code, "active-limit");
}));

// 14 — duplicate execution (same idempotencyKey) → cached, no second mutation
await t("14 idempotent replay not re-executed", () => {
  const log = []; return withFetch(mkFetch(defaultHandlers(), { log }), async () => {
    const b = openInv(createBridge(), { approvals: [{ op: "caido.replay.run", url: null }] });
    const r1 = await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { requestId: "rq-1", idempotencyKey: "dup" } });
    const r2 = await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { requestId: "rq-1", idempotencyKey: "dup" } });
    assert.equal(r1.result.duplicate, false); assert.equal(r2.result.duplicate, true);
    assert.equal(log.filter((x) => x === "CreateReplaySession").length, 1); // executed once only
  });
});

// 15 — result without response → inconclusive
await t("15 replay result without response is inconclusive", () => {
  const h = defaultHandlers(); h.ReplayEntry = (v) => ({ replayEntry: { __typename: "ReplayEntryHttp", id: v.id, createdAt: "t", error: null, connection: { host: "app.lab", port: 443, isTLS: true }, raw: "x", request: { id: "r", host: "app.lab", port: 443, path: "/", method: "GET", isTls: true, response: null } } });
  return withFetch(mkFetch(h), async () => {
    const b = openInv(createBridge(), { approvals: [{ op: "caido.replay.run", url: null }] });
    const r = await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { requestId: "rq-1" } });
    assert.equal(r.ok, true); assert.equal(r.result.outcome, "inconclusive"); assert.equal(r.result.responseAvailable, undefined);
  });
});

// 16 — evidence & provenance present, with comparison to original
await t("16 provenance + comparison present", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openInv(createBridge(), { approvals: [{ op: "caido.replay.run", url: null }] });
  const r = await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { requestId: "rq-1" } });
  assert.equal(r.result.provenance.replaySessionId, "sess-1");
  assert.equal(r.result.provenance.originalRequestId, "rq-1");
  assert.ok(r.result.comparison && r.result.comparison.changed === true); // original 200 vs replay 403
}));

// 17 — secret sanitization (cookie redacted in replay raw)
await t("17 secrets redacted in replay entry raw", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openInv(createBridge(), { approvals: [{ op: "caido.replay.run", url: null }] });
  const r = await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { requestId: "rq-1" } });
  assert.ok(!JSON.stringify(r).includes("SECRETVAL"));
}));

// 18 — idempotency on findings via dedupeKey (no duplicate)
await t("18 finding dedupe prevents duplicate", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openInv(createBridge(), { approvals: [{ op: "caido.findings.create", url: null }] });
  const r = await b.invoke({ investigationId: "ENG-1", op: "caido.findings.create", params: { requestId: "rq-1", title: "x", reporter: "hackbot", dedupeKey: "dk-1" } });
  assert.equal(r.ok, true); assert.equal(r.result.created, false); assert.equal(r.result.duplicate, true);
}));

// 19 — finding WITHOUT evidence refused
await t("19 finding without requestId refused", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openInv(createBridge(), { approvals: [{ op: "caido.findings.create", url: null }] });
  const r = await b.invoke({ investigationId: "ENG-1", op: "caido.findings.create", params: { title: "x", reporter: "hackbot" } });
  assert.equal(r.ok, false); assert.equal(r.error.code, "findings-prerequisites");
}));

// 20 — finding create AUTHORIZED (new dedupeKey) → created
await t("20 finding create authorized", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openInv(createBridge(), { approvals: [{ op: "caido.findings.create", url: null }] });
  const r = await b.invoke({ investigationId: "ENG-1", op: "caido.findings.create", params: { requestId: "rq-1", title: "IDOR", reporter: "hackbot", dedupeKey: "new-key" } });
  assert.equal(r.ok, true); assert.equal(r.result.created, true); assert.equal(r.result.finding.id, "newf");
}));

// 21 — hypotheses stay unconfirmed: finding needs explicit approval; no auto-confirm classification
await t("21 finding create without approval blocked (no heuristic auto-publish)", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openInv(createBridge()); // no approval
  const r = await b.invoke({ investigationId: "ENG-1", op: "caido.findings.create", params: { requestId: "rq-1", title: "x", reporter: "hackbot" } });
  assert.equal(r.ok, false); assert.equal(r.error.code, "state-change-unauthorized");
  assert.equal(r.classification, undefined); // bridge never promotes to a confirmed vuln
}));

// 22 — no Whitebox / source reader on the active client
await t("22 no whitebox/source surface", () => {
  const c = createCaidoActiveClient({ baseUrl: "https://caido.lab", token: "x" });
  for (const f of ["readWhitebox", "readSource", "codeReview", "stride"]) assert.equal(typeof c[f], "undefined");
});

// 23 — compat Bridge/Pi Adapter: capability listing + read op via bridge
await t("23 bridge compat: capabilities + read ops", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openInv(createBridge());
  const caps = await b.invoke({ op: "capabilities.list" });
  assert.ok(caps.result.capabilities.includes("caido-active"));
  const auto = await b.invoke({ investigationId: "ENG-1", op: "caido.automate.sessions" });
  assert.equal(auto.ok, true); assert.equal(auto.result.sessions.length, 1);
  const repl = await b.invoke({ investigationId: "ENG-1", op: "caido.replay.sessions" });
  assert.equal(repl.ok, true); assert.equal(repl.result.sessions[0].id, "sess-1");
}));

// 24 — reading History does NOT authorize Replay (capability separation)
await t("24 caido (read) capability cannot run replay", () => withFetch(mkFetch(defaultHandlers()), async () => {
  const b = openInv(createBridge(), { caps: ["caido"], approvals: [{ op: "caido.replay.run", url: null }] });
  const r = await b.invoke({ investigationId: "ENG-1", op: "caido.replay.run", params: { requestId: "rq-1" } });
  assert.equal(r.ok, false); assert.equal(r.error.code, "capability-not-allowed");
}));

// 25 — bad params on client (invalid replay kind / missing ids)
await t("25 client bad-params", async () => {
  const c = createCaidoActiveClient({ baseUrl: "https://caido.lab", token: "x", fetchImpl: mkFetch(defaultHandlers()) });
  await assert.rejects(() => c.replay({ requestId: "x", kind: "BOGUS" }), (e) => e.code === "bad-params");
  await assert.rejects(() => c.getReplayEntry(null), (e) => e.code === "bad-params");
  await assert.rejects(() => c.createFinding({ requestId: "x" }), (e) => e.code === "bad-params");
});

// 26 — findings.get out-of-scope refused
await t("26 findings.get out-of-scope refused", () => {
  const h = defaultHandlers(); h.Finding = (v) => ({ finding: { id: v.id, title: "T", reporter: "r", host: "evil.example", path: "/x", dedupeKey: null, hidden: false, description: null, createdAt: "t", request: { id: "rq", host: "evil.example", port: 443, path: "/x", method: "GET", isTls: true } } });
  return withFetch(mkFetch(h), async () => {
    const b = openInv(createBridge());
    const r = await b.invoke({ investigationId: "ENG-1", op: "caido.findings.get", params: { id: "f9" } });
    assert.equal(r.ok, false); assert.equal(r.error.code, "out-of-scope");
  });
});

console.log(`\n${n - fail}/${n} passed` + (fail ? ` (${fail} FAILED)` : ""));
process.exit(fail ? 1 : 0);
