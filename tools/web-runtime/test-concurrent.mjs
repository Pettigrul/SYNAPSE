// SecurityAuditor — Concurrent Execution Foundation synthetic suite (H1c-F1).
// Bounded, barrier-synchronized concurrent HTTP ops over authenticated sessions, against a
// SYNTHETIC LOOPBACK app on 127.0.0.1 (with a /slow endpoint to observe overlap) and an
// out-of-scope "evil" app on 127.0.0.2. No real targets, no race/TOCTOU logic (that is H1c-F2).
// If the browser cannot launch, every case is BLOCKED (never PASS).
import assert from "node:assert/strict";
import http from "node:http";
import { SessionManager } from "./session-manager.mjs";
import { ResourceRegistry } from "./resource-registry.mjs";
import { AuthorizationMatrix } from "./authz-matrix.mjs";
import { ConcurrentExecutor } from "./concurrent-executor.mjs";
import { probe } from "./session.mjs";

let pass = 0, fail = 0, blocked = 0;
async function t(name, fn) {
  try { const r = await fn(); if (r === "BLOCKED") { blocked++; console.log(`BLOCK  ${name}`); } else { pass++; console.log(`  ok   ${name}`); } }
  catch (e) { fail++; console.log(`FAIL   ${name}\n       ${(e && e.message || e).toString().split("\n")[0]}`); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- synthetic apps ------------------------------------------------------
let evilHits = 0;
const evil = http.createServer((q, s) => { evilHits++; s.writeHead(200); s.end("EVIL"); });
let hits = 0, inflight = 0, maxInflight = 0;
function sidUser(req) { const m = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || ""); return m ? m[1] : null; }
const app = http.createServer((req, res) => {
  const u = new URL(req.url, "http://127.0.0.1");
  const p = u.pathname;
  if (p === "/login") { res.writeHead(200, { "content-type": "text/html", "set-cookie": `sid=${u.searchParams.get("user") || "anon"}; Path=/`, "x-auth-token": "tok_sekret_99" }); return res.end("<!doctype html><title>l</title>ok"); }
  if (p === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<!doctype html><title>a</title>home"); }
  if (p === "/redirect-evil") { res.writeHead(302, { location: `${EVIL}/x` }); return res.end(); }
  hits++; inflight++; maxInflight = Math.max(maxInflight, inflight);
  const done = (code, obj) => { inflight--; res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (p === "/slow") { const ms = Number(u.searchParams.get("ms") || 300); return void setTimeout(() => done(200, { tag: u.searchParams.get("tag") || "", user: sidUser(req) }), ms); }
  if (p === "/whoami") return done(200, { user: sidUser(req) });
  if (p === "/public") return done(200, { ok: true });
  if (p === "/error") return done(500, { error: "boom" });
  if (p === "/state" && req.method === "POST") return done(200, { ok: true });
  done(404, { error: "nf" });
});
const listen = (srv, host) => new Promise((r) => srv.listen(0, host, () => r(srv.address().port)));

console.log("web-runtime Concurrent Execution Foundation — synthetic suite (H1c-F1)\n");
const pr = await probe();
if (!pr.available) { console.log(`ALL BLOCKED — browser unavailable: ${pr.reason}\n0 passed, 0 failed, 18 blocked`); process.exit(0); }

const evilPort = await listen(evil, "127.0.0.2"); var EVIL = `http://127.0.0.2:${evilPort}`;
const appPort = await listen(app, "127.0.0.1"); const APP = `http://127.0.0.1:${appPort}`;
const SCOPE = { allowHosts: ["127.0.0.1"], allowPrivate: true };

async function mkUser(mgr, kind, user) {
  const s = await mgr.create({ scope: SCOPE, kind, label: user || "noauth" });
  await mgr.request(s.sessionId, { op: "navigate", url: APP + (user ? `/login?user=${user}` : "/") });
  return s;
}

const m = new SessionManager({ maxSessions: 12 });
const alice = await mkUser(m, "owner", "alice");
const bob = await mkUser(m, "cross-user", "bob");
const ex = new ConcurrentExecutor({ manager: m });

// 1 — two simultaneous operations.
await t("C1 — two concurrent operations both complete", async () => {
  const prep = ex.prepare({ operations: [
    { operationId: "a", sessionId: alice.sessionId, url: APP + "/public" },
    { operationId: "b", sessionId: bob.sessionId, url: APP + "/public" },
  ] });
  const r = await ex.run(prep);
  assert.equal(r.summary.ok, 2);
  assert.ok(r.timings.barrierReleasedAt >= r.timings.preparedAt);
});

// 2 — three ops with concurrency limit 2 (observe server never sees >2 in flight).
await t("C2 — three ops, maxConcurrency 2 (server inflight never exceeds 2)", async () => {
  maxInflight = 0;
  const prep = ex.prepare({ limits: { maxConcurrency: 2 }, operations: [
    { operationId: "s1", sessionId: alice.sessionId, url: APP + "/slow?ms=400&tag=1" },
    { operationId: "s2", sessionId: bob.sessionId, url: APP + "/slow?ms=400&tag=2" },
    { operationId: "s3", sessionId: alice.sessionId, url: APP + "/slow?ms=400&tag=3" },
  ] });
  const r = await ex.run(prep);
  assert.equal(r.summary.ok, 3);
  assert.ok(maxInflight <= 2, `maxInflight was ${maxInflight}`);
  assert.equal(maxInflight, 2);
});

// 3 — identity preserved per session under concurrency.
await t("C3 — identity preserved per session under concurrency", async () => {
  const prep = ex.prepare({ operations: [
    { operationId: "wa", sessionId: alice.sessionId, url: APP + "/whoami" },
    { operationId: "wb", sessionId: bob.sessionId, url: APP + "/whoami" },
  ] });
  await ex.run(prep);
  const wa = await m.request(alice.sessionId, { op: "probe", url: APP + "/whoami" });
  const wb = await m.request(bob.sessionId, { op: "probe", url: APP + "/whoami" });
  assert.ok(wa.body.includes('"user":"alice"') && wb.body.includes('"user":"bob"'), "identity crossed between sessions");
});

// 4 — cookie/token isolation (no secret carried across; each session keeps its own).
await t("C4 — cookies/tokens isolated across concurrent sessions", async () => {
  const prep = ex.prepare({ operations: [
    { operationId: "a", sessionId: alice.sessionId, url: APP + "/whoami" },
    { operationId: "b", sessionId: bob.sessionId, url: APP + "/whoami" },
  ] });
  const r = await ex.run(prep);
  assert.ok(!/sid=|tok_sekret|x-auth-token/i.test(JSON.stringify(r)), "secret leaked into results");
});

// 5 — out-of-scope destination blocked at prepare.
await t("C5 — out-of-scope destination blocked (never executed)", async () => {
  const before = evilHits;
  const prep = ex.prepare({ operations: [{ operationId: "x", sessionId: alice.sessionId, url: EVIL + "/x" }] });
  assert.equal(prep.operations[0].valid, false);
  assert.equal(prep.operations[0].blockReason, "out-of-scope");
  const r = await ex.run(prep);
  assert.equal(r.results[0].state, "blocked");
  assert.equal(evilHits, before, "evil contacted");
});

// 6 — authenticated operation permitted.
await t("C6 — authenticated operation permitted (200)", async () => {
  const prep = ex.prepare({ operations: [{ operationId: "w", sessionId: alice.sessionId, url: APP + "/whoami" }] });
  const r = await ex.run(prep);
  assert.equal(r.results[0].state, "ok"); assert.equal(r.results[0].status, 200);
});

// 7 — state-changing operation blocked without authorization.
await t("C7 — state-changing op blocked without authorization", async () => {
  const before = hits;
  const prep = ex.prepare({ operations: [{ operationId: "p", sessionId: alice.sessionId, method: "POST", url: APP + "/state", body: "{}", policy: { stateChanging: true } }] });
  assert.equal(prep.operations[0].blockReason, "state-change-unauthorized");
  const r = await ex.run(prep);
  assert.equal(r.results[0].state, "blocked");
  assert.equal(hits, before, "blocked state-changing op must not hit the server");
});

// 8 — cancellation BEFORE the barrier opens -> nothing runs.
await t("C8 — cancel before barrier release -> all cancelled, zero requests", async () => {
  const before = hits;
  const prep = ex.prepare({ operations: [
    { operationId: "s1", sessionId: alice.sessionId, url: APP + "/slow?ms=200" },
    { operationId: "s2", sessionId: bob.sessionId, url: APP + "/slow?ms=200" },
  ] });
  ex.cancel(prep.experimentId);
  const r = await ex.run(prep);
  assert.equal(r.state, "cancelled");
  assert.equal(r.summary.cancelled, 2);
  assert.equal(hits, before, "cancelled-before-barrier must issue no requests");
});

// 9 — cancellation DURING execution -> queued ops cancelled.
await t("C9 — cancel during execution cancels not-yet-started ops", async () => {
  const before = hits;
  const prep = ex.prepare({ limits: { maxConcurrency: 1 }, operations: [
    { operationId: "s1", sessionId: alice.sessionId, url: APP + "/slow?ms=500" },
    { operationId: "s2", sessionId: alice.sessionId, url: APP + "/slow?ms=500" },
    { operationId: "s3", sessionId: alice.sessionId, url: APP + "/slow?ms=500" },
    { operationId: "s4", sessionId: alice.sessionId, url: APP + "/slow?ms=500" },
  ] });
  const p = ex.run(prep);
  await wait(150); ex.cancel(prep.experimentId);
  const r = await p;
  assert.ok(r.summary.cancelled >= 2, `cancelled=${r.summary.cancelled}`);
  assert.equal(hits - before, 1, "only the in-flight op should have hit the server");
});

// 10 — individual timeout (in-page fetch abort).
await t("C10 — individual timeout marks the op timeout", async () => {
  const prep = ex.prepare({ limits: { opTimeoutMs: 200 }, operations: [{ operationId: "slow", sessionId: alice.sessionId, url: APP + "/slow?ms=1500" }] });
  const r = await ex.run(prep);
  assert.equal(r.results[0].state, "timeout");
});

// 11 — global timeout aborts the experiment.
await t("C11 — global timeout cancels remaining ops", async () => {
  const prep = ex.prepare({ limits: { maxConcurrency: 1, globalTimeoutMs: 250 }, operations: [
    { operationId: "s1", sessionId: alice.sessionId, url: APP + "/slow?ms=400" },
    { operationId: "s2", sessionId: alice.sessionId, url: APP + "/slow?ms=400" },
    { operationId: "s3", sessionId: alice.sessionId, url: APP + "/slow?ms=400" },
  ] });
  const r = await ex.run(prep);
  assert.equal(r.state, "cancelled");
  assert.ok(r.summary.cancelled >= 2, `cancelled=${r.summary.cancelled}`);
});

// 12 — one operation fails without losing the others' results.
await t("C12 — one op fails; others still produce results", async () => {
  const doomed = await mkUser(m, "owner", "doomed");
  const prep = ex.prepare({ operations: [
    { operationId: "ok1", sessionId: alice.sessionId, url: APP + "/public" },
    { operationId: "boom", sessionId: doomed.sessionId, url: APP + "/public" },
    { operationId: "ok2", sessionId: bob.sessionId, url: APP + "/public" },
  ] });
  await m.close(doomed.sessionId); // break one op's session after prepare
  const r = await ex.run(prep);
  const byId = Object.fromEntries(r.results.map((x) => [x.operationId, x]));
  assert.equal(byId.ok1.state, "ok"); assert.equal(byId.ok2.state, "ok");
  assert.equal(byId.boom.state, "failed");
});

// 13 — unexpected browser failure mid-run: captured, executor returns cleanly.
await t("C13 — unexpected browser failure handled cleanly", async () => {
  const m2 = new SessionManager({ maxSessions: 4 });
  const a2 = await mkUser(m2, "owner", "alice");
  const ex2 = new ConcurrentExecutor({ manager: m2 });
  const prep = ex2.prepare({ limits: { maxConcurrency: 2 }, operations: [
    { operationId: "s1", sessionId: a2.sessionId, url: APP + "/slow?ms=600" },
    { operationId: "s2", sessionId: a2.sessionId, url: APP + "/slow?ms=600" },
  ] });
  const p = ex2.run(prep);
  await wait(150); try { await m2._pool._browser.close(); } catch {} // force-disconnect mid-run
  const r = await p; // must resolve, not throw
  assert.ok(["done", "cancelled"].includes(r.state));
  assert.ok(r.results.every((x) => ["failed", "cancelled", "timeout", "ok"].includes(x.state)));
  try { await m2.closeAll(); } catch {}
});

// 14 — resources released after cancellation (sessions remain usable; closeAll ok).
await t("C14 — resources released after cancellation", async () => {
  const prep = ex.prepare({ operations: [{ operationId: "s", sessionId: alice.sessionId, url: APP + "/slow?ms=400" }] });
  const p = ex.run(prep); await wait(50); ex.cancel(prep.experimentId); await p;
  const check = await m.request(alice.sessionId, { op: "probe", url: APP + "/public" }); // session still usable
  assert.equal(check.status, 200);
});

// 15 — evidence sanitized (no bodies/cookies/tokens in results).
await t("C15 — evidence sanitized (no response bodies or secrets)", async () => {
  const prep = ex.prepare({ operations: [{ operationId: "w", sessionId: alice.sessionId, url: APP + "/whoami" }] });
  const r = await ex.run(prep);
  assert.ok(!("body" in r.results[0]), "results must not carry response bodies");
  assert.ok(!/sid=|tok_sekret|x-auth-token/i.test(JSON.stringify(r)));
  assert.ok(typeof r.results[0].latencyMs === "number" && r.results[0].requestId);
});

// 16 — compatibility with Session Manager preserved.
await t("C16 — Session Manager compatibility preserved", async () => {
  const list = m.list().filter((s) => !s.closed);
  assert.ok(list.length >= 2);
  const st = m.status(alice.sessionId);
  assert.equal(st.kind, "owner");
  const nav = await m.request(alice.sessionId, { op: "navigate", url: APP + "/public" });
  assert.equal(nav.status, 200);
});

// 17 — compatibility with Authorization Matrix preserved.
await t("C17 — Authorization Matrix still works after concurrency", async () => {
  const R = new ResourceRegistry();
  const pub = R.register({ label: "public", request: { url: APP + "/public" }, classification: "public" });
  const mx = new AuthorizationMatrix({ manager: m, resources: R });
  const run = await mx.run([{ caseId: "ok", resourceId: pub, sessionId: alice.sessionId, expected: { outcome: "allow", origin: "lab-fixture" } }]);
  assert.equal(run.results[0].classification, "conforme");
});

// 18 — no additional requests after termination.
await t("C18 — no additional requests after an experiment terminates", async () => {
  const prep = ex.prepare({ operations: [{ operationId: "w", sessionId: alice.sessionId, url: APP + "/whoami" }] });
  await ex.run(prep);
  const after = hits;
  await wait(300);
  assert.equal(hits, after, "requests continued after termination");
  // and a cancelled-before-barrier experiment issues nothing at all
  const before2 = hits;
  const prep2 = ex.prepare({ operations: [{ operationId: "s", sessionId: alice.sessionId, url: APP + "/slow?ms=200" }] });
  ex.cancel(prep2.experimentId); await ex.run(prep2); await wait(300);
  assert.equal(hits, before2);
});

await m.closeAll();
app.close(); evil.close();
console.log(`\nevilHits (must be 0) = ${evilHits}`);
console.log(`${pass} passed, ${fail} failed, ${blocked} blocked`);
process.exit(fail || evilHits ? 1 : 0);
