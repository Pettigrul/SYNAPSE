// SecurityAuditor — Stateful Race & TOCTOU Validator synthetic suite (H1c-F2).
// Reproducible race experiments against the REVERSIBLE synthetic lab (fixtures/race-lab.mjs) on
// 127.0.0.1, with an out-of-scope "evil" app on 127.0.0.2. Violations are confirmed ONLY by the
// authoritative state oracle (never by HTTP status/latency). No real targets. BLOCKED if no browser.
import assert from "node:assert/strict";
import http from "node:http";
import { SessionManager } from "./session-manager.mjs";
import { ConcurrentExecutor } from "./concurrent-executor.mjs";
import { StatefulRaceValidator } from "./race-validator.mjs";
import { createRaceLab } from "./fixtures/race-lab.mjs";
import { probe } from "./session.mjs";

let pass = 0, fail = 0, blocked = 0;
async function t(name, fn) {
  try { const r = await fn(); if (r === "BLOCKED") { blocked++; console.log(`BLOCK  ${name}`); } else { pass++; console.log(`  ok   ${name}`); } }
  catch (e) { fail++; console.log(`FAIL   ${name}\n       ${(e && e.message || e).toString().split("\n")[0]}`); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let evilHits = 0;
const evil = http.createServer((q, s) => { evilHits++; s.writeHead(200); s.end("EVIL"); });
const listen = (srv, host) => new Promise((r) => srv.listen(0, host, () => r(srv.address().port)));

console.log("web-runtime Stateful Race & TOCTOU Validator — synthetic suite (H1c-F2)\n");
const pr = await probe();
if (!pr.available) { console.log(`ALL BLOCKED — browser unavailable: ${pr.reason}\n0 passed, 0 failed, 20 blocked`); process.exit(0); }

const evilPort = await listen(evil, "127.0.0.2"); const EVIL = `http://127.0.0.2:${evilPort}`;
const lab = createRaceLab({ evilBase: EVIL });
const appPort = await listen(lab, "127.0.0.1"); const APP = `http://127.0.0.1:${appPort}`;
const SCOPE = { allowHosts: ["127.0.0.1"], allowPrivate: true };
const FIELDS = ["couponUses", "balance", "tokenValid", "acted", "actionsAfterRevoke"];

const m = new SessionManager({ maxSessions: 12 });
async function mkUser(mgr, kind, user) { const s = await mgr.create({ scope: SCOPE, kind, label: user }); await mgr.request(s.sessionId, { op: "navigate", url: APP + `/login?user=${user}` }); return s; }
const alice = await mkUser(m, "owner", "alice");
const bob = await mkUser(m, "cross-user", "bob");
const observer = await mkUser(m, "owner", "observer");
const ex = new ConcurrentExecutor({ manager: m });
const val = new StatefulRaceValidator({ manager: m, executor: ex });

const sc = (s) => ({ sessionId: s, method: "POST", url: APP + "/coupon/redeem-safe", body: "{}", policy: { stateChanging: true }, authorizedStateChange: true });
const vc = (s) => ({ sessionId: s, method: "POST", url: APP + "/coupon/redeem-vuln", body: "{}", policy: { stateChanging: true }, authorizedStateChange: true });
const INV_COUPON = { field: "couponUses", op: "<=", value: 1 };
function experiment(over) {
  return {
    observerSessionId: observer.sessionId, hypothesis: over.hypothesis || "double-spend",
    expectedRule: { description: over.rule || "coupon usable at most once", source: "lab-fixture" },
    requiredInitialState: over.required || { couponUses: 0 },
    operations: over.operations, invariant: over.invariant || INV_COUPON,
    observe: { stateUrl: APP + (over.stateUrl || "/_state"), fields: FIELDS },
    reset: { url: APP + (over.resetUrl || "/_reset") },
    attempts: over.attempts || 1, limits: over.limits,
    ...(over.experimentId ? { experimentId: over.experimentId } : {}),
  };
}

// 1 — two concurrent ops with a single-effect limit (secure) -> Conforme.
await t("R1 — two concurrent ops, single-effect limit (secure) -> conforme", async () => {
  const r = await val.run(experiment({ operations: [sc(alice.sessionId), sc(bob.sessionId)] }));
  assert.equal(r.classification, "conforme");
  assert.equal(r.attempts[0].observed.final.couponUses, 1);
});
// 2 — vulnerable system effects two operations -> violation (observed, 1 attempt).
await t("R2 — vulnerable double-effect -> violacao-observada (couponUses=2)", async () => {
  const r = await val.run(experiment({ operations: [vc(alice.sessionId), vc(bob.sessionId)] }));
  assert.equal(r.attempts[0].observed.final.couponUses, 2);
  assert.equal(r.classification, "violacao-observada");
  assert.equal(r.attempts[0].derived.stateChanged, true);
});
// 3 — secure system with atomic control -> Conforme.
await t("R3 — secure atomic control over 3 attempts -> conforme", async () => {
  const r = await val.run(experiment({ operations: [sc(alice.sessionId), sc(bob.sessionId)], attempts: 3 }));
  assert.equal(r.classification, "conforme");
});
// 4 — TOCTOU with authorization revocation -> violation.
await t("R4 — TOCTOU authorization revocation -> violacao-observada", async () => {
  const ops = [
    { sessionId: alice.sessionId, method: "POST", url: APP + "/action-vuln", body: "{}", policy: { stateChanging: true }, authorizedStateChange: true },
    { sessionId: bob.sessionId, method: "POST", url: APP + "/revoke", body: "{}", policy: { stateChanging: true }, authorizedStateChange: true },
  ];
  const r = await val.run(experiment({ hypothesis: "action after revoke", rule: "no action after revocation", operations: ops, invariant: { field: "actionsAfterRevoke", op: "==", value: 0 } }));
  assert.equal(r.attempts[0].observed.final.actionsAfterRevoke, 1);
  assert.equal(r.classification, "violacao-observada");
});
// 5 — concurrent ops across different identities -> violation (two principals race).
await t("R5 — concurrent ops across different identities -> violacao-observada", async () => {
  const r = await val.run(experiment({ operations: [vc(alice.sessionId), vc(bob.sessionId)] }));
  assert.equal(r.attempts[0].observed.opsSummary.ok, 2);
  assert.equal(r.attempts[0].observed.final.couponUses, 2);
  assert.equal(r.classification, "violacao-observada");
});
// 6 — HTTP 200 without state change -> Conforme (200 is not proof).
await t("R6 — HTTP 200 without state change -> conforme", async () => {
  const ops = [{ sessionId: alice.sessionId, url: APP + "/public" }, { sessionId: bob.sessionId, url: APP + "/public" }];
  const r = await val.run(experiment({ operations: ops }));
  assert.equal(r.classification, "conforme");
  assert.equal(r.attempts[0].derived.stateChanged, false);
});
// 7 — violation observed a single time -> violacao-observada.
await t("R7 — violation observed once -> violacao-observada", async () => {
  const r = await val.run(experiment({ operations: [vc(alice.sessionId), vc(bob.sessionId)], attempts: 1 }));
  assert.equal(r.classification, "violacao-observada");
  assert.equal(r.summary.reproduced, false);
});
// 8 — violation reproduced in independent attempts -> violacao-reproduzida.
await t("R8 — violation reproduced over 3 attempts -> violacao-reproduzida", async () => {
  const r = await val.run(experiment({ operations: [vc(alice.sessionId), vc(bob.sessionId)], attempts: 3 }));
  assert.equal(r.classification, "violacao-reproduzida");
  assert.ok(r.summary.violations >= 2 && r.summary.reproduced === true);
});
// 9 — no violation in N attempts (secure) -> Conforme.
await t("R9 — no violation across N attempts (secure) -> conforme", async () => {
  const r = await val.run(experiment({ operations: [sc(alice.sessionId), sc(bob.sessionId)], attempts: 3 }));
  assert.equal(r.classification, "conforme");
  assert.equal(r.summary.violations, 0);
});
// 10 — precondition failure -> Inconclusivo (not executed).
await t("R10 — precondition failure -> inconclusivo (not executed)", async () => {
  const r = await val.run(experiment({ operations: [vc(alice.sessionId)], required: { couponUses: 5 } }));
  assert.equal(r.classification, "inconclusivo");
  assert.match(r.attempts[0].reason, /pré-condição/i);
  assert.equal(r.attempts[0].executed, false);
});
// 11 — reset failure -> stop + contaminated flag.
await t("R11 — reset failure -> stops attempts + contaminated", async () => {
  await m.request(observer.sessionId, { op: "probe", method: "POST", url: APP + "/_reset" }); // good reset first
  const r = await val.run(experiment({ operations: [vc(alice.sessionId), vc(bob.sessionId)], attempts: 3, resetUrl: "/_reset-broken" }));
  assert.equal(r.contaminated, true);
  assert.ok(r.attempts.length < 3, "attempts must stop after reset failure");
  assert.equal(r.attempts[r.attempts.length - 1].resetFailed, true);
  await m.request(observer.sessionId, { op: "probe", method: "POST", url: APP + "/_reset" }); // restore for later tests
});
// 12 — individual operation timeout handled.
await t("R12 — operation timeout captured; no false violation", async () => {
  const ops = [{ sessionId: alice.sessionId, url: APP + "/slow?ms=1500" }];
  const r = await val.run(experiment({ operations: ops, limits: { opTimeoutMs: 200 }, invariant: INV_COUPON }));
  assert.ok(r.attempts[0].observed.opsSummary.timeout >= 1);
  assert.equal(r.classification, "conforme");
});
// 13 — global timeout handled.
await t("R13 — global timeout cancels remaining ops; no false violation", async () => {
  const ops = [{ sessionId: alice.sessionId, url: APP + "/slow?ms=400" }, { sessionId: alice.sessionId, url: APP + "/slow?ms=400" }];
  const r = await val.run(experiment({ operations: ops, limits: { maxConcurrency: 1, globalTimeoutMs: 250 } }));
  assert.ok(r.attempts[0].observed.opsSummary.cancelled >= 1);
  assert.equal(r.classification, "conforme");
});
// 14 — cancellation during experiment.
await t("R14 — cancellation during experiment -> inconclusivo", async () => {
  const ac = new AbortController(); ac.abort();
  const r = await val.run(experiment({ operations: [vc(alice.sessionId), vc(bob.sessionId)], attempts: 3 }), { signal: ac.signal });
  assert.equal(r.classification, "inconclusivo");
  assert.match(r.attempts[0].reason, /cancel/i);
});
// 15 — failure of one session (closed before run) surfaces as blocked -> inconclusivo.
await t("R15 — a failed session surfaces cleanly (blocked)", async () => {
  const doomed = await mkUser(m, "owner", "doomed");
  await m.close(doomed.sessionId);
  const r = await val.run(experiment({ operations: [vc(alice.sessionId), vc(doomed.sessionId)] }));
  assert.equal(r.classification, "inconclusivo");
  assert.match(r.attempts[0].reason, /bloquead|session-invalid/i);
});
// 16 — unexpected browser failure handled cleanly.
await t("R16 — unexpected browser failure handled cleanly", async () => {
  const m2 = new SessionManager({ maxSessions: 4 });
  const obs2 = await mkUser(m2, "owner", "obs2");
  const a2 = await mkUser(m2, "owner", "a2");
  const ex2 = new ConcurrentExecutor({ manager: m2 });
  const val2 = new StatefulRaceValidator({ manager: m2, executor: ex2 });
  const p = val2.run({ observerSessionId: obs2.sessionId, hypothesis: "x", expectedRule: { description: "y", source: "lab-fixture" }, requiredInitialState: { couponUses: 0 }, operations: [{ sessionId: a2.sessionId, method: "POST", url: APP + "/coupon/redeem-vuln", body: "{}", policy: { stateChanging: true }, authorizedStateChange: true }], invariant: INV_COUPON, observe: { stateUrl: APP + "/_state", fields: FIELDS }, reset: { url: APP + "/_reset" }, attempts: 1 });
  await wait(120); try { await m2._pool._browser.close(); } catch {}
  const r = await p; // must resolve
  assert.ok(RACE_CLASSES_INCLUDE(r.classification));
  try { await m2.closeAll(); } catch {}
});
function RACE_CLASSES_INCLUDE(c) { return ["conforme", "anomalia", "violacao-observada", "violacao-reproduzida", "inconclusivo"].includes(c); }
// 17 — out-of-scope destination blocked.
await t("R17 — out-of-scope destination blocked (never executed)", async () => {
  const before = evilHits;
  const r = await val.run(experiment({ operations: [{ sessionId: alice.sessionId, url: EVIL + "/x", policy: { stateChanging: false } }] }));
  assert.equal(r.classification, "inconclusivo");
  assert.match(r.attempts[0].reason, /out-of-scope|bloquead/i);
  assert.equal(evilHits, before);
});
// 18 — operation without authorization (state-changing, not authorized) blocked.
await t("R18 — unauthorized state-changing op blocked", async () => {
  const r = await val.run(experiment({ operations: [{ sessionId: alice.sessionId, method: "POST", url: APP + "/coupon/redeem-vuln", body: "{}", policy: { stateChanging: true } }] }));
  assert.equal(r.classification, "inconclusivo");
  assert.match(r.attempts[0].reason, /state-change-unauthorized|bloquead/i);
});
// 19 — insufficient evidence (authoritative source unavailable) -> inconclusivo.
await t("R19 — insufficient evidence (no authoritative state) -> inconclusivo", async () => {
  const r = await val.run(experiment({ operations: [vc(alice.sessionId)], stateUrl: "/nope" }));
  assert.equal(r.classification, "inconclusivo");
  assert.match(r.attempts[0].reason, /não comprovável|não observ/i);
});
// 20 — resource cleanup after termination.
await t("R20 — resources cleaned up after termination", async () => {
  await val.run(experiment({ operations: [sc(alice.sessionId)] }));
  const chk = await m.request(alice.sessionId, { op: "probe", url: APP + "/public" });
  assert.equal(chk.status, 200); // sessions still usable
  assert.ok(m.list().filter((s) => !s.closed).length >= 3);
});

await m.closeAll();
lab.close(); evil.close();
console.log(`\nevilHits (must be 0) = ${evilHits}`);
console.log(`${pass} passed, ${fail} failed, ${blocked} blocked`);
process.exit(fail || evilHits ? 1 : 0);
