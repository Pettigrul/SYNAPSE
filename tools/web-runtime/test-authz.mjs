// SecurityAuditor — Authorization Matrix synthetic suite (H1b-F2).
// SEQUENTIAL IDOR/BOLA investigation across identities against a SYNTHETIC LOOPBACK app on
// 127.0.0.1 (secure endpoints + one deliberately IDOR-vulnerable path for a positive case),
// with an out-of-scope "evil" app on 127.0.0.2. No real targets, no offensive payloads, no
// concurrency (that is H1c). If the browser cannot launch, every case is BLOCKED (never PASS).
import assert from "node:assert/strict";
import http from "node:http";
import { SessionManager } from "./session-manager.mjs";
import { ResourceRegistry } from "./resource-registry.mjs";
import { AuthorizationMatrix } from "./authz-matrix.mjs";
import { probe } from "./session.mjs";

let pass = 0, fail = 0, blocked = 0;
async function t(name, fn) {
  try { const r = await fn(); if (r === "BLOCKED") { blocked++; console.log(`BLOCK  ${name}`); } else { pass++; console.log(`  ok   ${name}`); } }
  catch (e) { fail++; console.log(`FAIL   ${name}\n       ${(e && e.message || e).toString().split("\n")[0]}`); }
}

// ---- synthetic apps ------------------------------------------------------
let evilHits = 0;
const evil = http.createServer((q, s) => { evilHits++; s.writeHead(200); s.end("EVIL"); });
const DEFAULTS = () => ({ 1: { owner: "alice", item: "secret-A" }, 2: { owner: "bob", item: "secret-B" } });
let orders = DEFAULTS();
const readBody = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });
function sid(req) { const m = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || ""); return m ? decodeURIComponent(m[1]) : null; }
function who(req) { const s = sid(req); if (!s) return { user: null }; if (s.startsWith("expired")) return { user: null, expired: true }; return { user: s }; }
const json = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
const orderBody = (id) => ({ id: Number(id), marker: `OWN-${orders[id].owner}-${id}`, item: orders[id].item });

const app = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://127.0.0.1");
  const p = u.pathname;
  const w = who(req);
  // login (GET): set cookie from query; exp=1 -> expired-marked cookie
  if (p === "/login") {
    const user = u.searchParams.get("user") || "anon";
    const val = u.searchParams.get("exp") ? `expired-${user}` : user;
    res.writeHead(200, { "content-type": "text/html", "set-cookie": `sid=${val}; Path=/`, "x-auth-token": "tok_sekret_123456" });
    return res.end("<!doctype html><title>login</title><body>ok</body>");
  }
  if (p === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<!doctype html><title>app</title><body>home</body>"); }
  if (p === "/reset" && req.method === "POST") { orders = DEFAULTS(); return json(res, 200, { reset: true }); }
  if (p === "/public/info") return json(res, 200, { service: "info", ok: true });
  if (p === "/api/mystery/1") return json(res, 200, { m: true });
  if (p === "/redirect-evil") { res.writeHead(302, { location: `${EVIL}/x` }); return res.end(); }

  // everything below requires a (non-expired) session
  if (w.expired) return json(res, 401, { error: "session expired" });
  const m1 = /^\/api\/orders\/(\d+)$/.exec(p);
  const mv = /^\/vuln\/orders\/(\d+)$/.exec(p);
  const md = /^\/shared\/doc\/(\d+)$/.exec(p);
  if (p === "/admin/panel") {
    if (!w.user) return json(res, 401, { error: "auth required" });
    return w.user === "carol" ? json(res, 200, { panel: true, marker: "ADMIN-ONLY" }) : json(res, 403, { error: "forbidden" });
  }
  if (md) {
    if (!w.user) return json(res, 401, { error: "auth required" });
    return ["alice", "bob", "carol"].includes(w.user) ? json(res, 200, { id: Number(md[1]), marker: "SHARED-DOC", title: "shared" }) : json(res, 403, { error: "forbidden" });
  }
  if (mv) { // VULNERABLE: no owner check (IDOR)
    if (!w.user) return json(res, 401, { error: "auth required" });
    const o = orders[mv[1]]; if (!o) return json(res, 404, { error: "not found" });
    return json(res, 200, orderBody(mv[1]));
  }
  if (m1) {
    const id = m1[1];
    if (req.method === "POST") {
      if (!w.user) return json(res, 401, { error: "auth required" });
      const o = orders[id]; if (!o) return json(res, 404, { error: "not found" });
      if (w.user !== o.owner) return json(res, 403, { error: "forbidden" }); // denied, NO mutation
      const body = await readBody(req); try { const b = JSON.parse(body); if (b && b.item) o.item = b.item; } catch {}
      return json(res, 200, { ok: true });
    }
    if (!w.user) return json(res, 401, { error: "auth required" });
    const o = orders[id]; if (!o) return json(res, 404, { error: "not found" });
    return (w.user === o.owner || w.user === "carol") ? json(res, 200, orderBody(id)) : json(res, 403, { error: "forbidden" });
  }
  json(res, 404, { error: "not found" });
});
const listen = (srv, host) => new Promise((r) => srv.listen(0, host, () => r(srv.address().port)));

console.log("web-runtime Authorization Matrix — synthetic suite (H1b-F2)\n");
const pr = await probe();
if (!pr.available) { console.log(`ALL BLOCKED — browser unavailable: ${pr.reason}\n0 passed, 0 failed, 18 blocked`); process.exit(0); }

const evilPort = await listen(evil, "127.0.0.2"); var EVIL = `http://127.0.0.2:${evilPort}`;
const appPort = await listen(app, "127.0.0.1"); const APP = `http://127.0.0.1:${appPort}`;
const SCOPE = { allowHosts: ["127.0.0.1"], allowPrivate: true };

const m = new SessionManager({ maxSessions: 12 });
const R = new ResourceRegistry();
async function mkUser(kind, label, user, exp = false) {
  const s = await m.create({ scope: SCOPE, kind, label });
  await m.request(s.sessionId, { op: "navigate", url: APP + (user ? `/login?user=${user}${exp ? "&exp=1" : ""}` : "/") });
  return s;
}
const alice = await mkUser("owner", "alice", "alice");
const bob = await mkUser("cross-user", "bob", "bob");
const carol = await mkUser("owner", "admin-carol", "carol");
const guest = await mkUser("noauth", "noauth", null);
const expired = await mkUser("owner", "expired", "alice", true);

// resources (resourceId distinct from principal/session/context ids)
const order1 = R.register({ label: "order#1 (alice)", request: { url: APP + "/api/orders/1" }, classification: "private", ownerPrincipalId: alice.principalId, ownershipMarker: "OWN-alice-1" });
const order2 = R.register({ label: "order#2 (bob)", request: { url: APP + "/api/orders/2" }, classification: "private", ownerPrincipalId: bob.principalId, ownershipMarker: "OWN-bob-2" });
const order2vuln = R.register({ label: "order#2 via vulnerable path", request: { url: APP + "/vuln/orders/2" }, classification: "private", ownerPrincipalId: bob.principalId, ownershipMarker: "OWN-bob-2" });
const sharedDoc = R.register({ label: "shared doc#1", request: { url: APP + "/shared/doc/1" }, classification: "shared", sharedWith: [alice.principalId, bob.principalId] });
const pub = R.register({ label: "public info", request: { url: APP + "/public/info" }, classification: "public" });
const admin = R.register({ label: "admin panel", request: { url: APP + "/admin/panel" }, classification: "admin", ownerPrincipalId: carol.principalId, ownershipMarker: "ADMIN-ONLY" });
const missing = R.register({ label: "nonexistent order#999", request: { url: APP + "/api/orders/999" }, classification: "private", ownerPrincipalId: alice.principalId });
const mystery = R.register({ label: "mystery (unknown policy)", request: { url: APP + "/api/mystery/1" }, classification: "unknown" });
const order1post = R.register({ label: "POST order#1 (alice)", request: { method: "POST", url: APP + "/api/orders/1", body: JSON.stringify({ item: "updated-A" }), stateChanging: true }, classification: "private", ownerPrincipalId: alice.principalId });
const order2post = R.register({ label: "POST order#2 (bob) by other", request: { method: "POST", url: APP + "/api/orders/2", body: JSON.stringify({ item: "hacked" }), stateChanging: true }, classification: "private", ownerPrincipalId: bob.principalId });
const redir = R.register({ label: "redirect to out-of-scope", request: { url: APP + "/redirect-evil" }, classification: "unknown", expectScopeBlock: true });

const LAB = "lab-fixture";
const mx = new AuthorizationMatrix({ manager: m, resources: R });
// the main matrix (cases 1-12, 16) — expectation ORIGIN is always stated
const cases = [
  { caseId: "C1-owner-own", resourceId: order1, sessionId: alice.sessionId, expected: { outcome: "allow", origin: LAB } },
  { caseId: "C2-cross-private", resourceId: order2, sessionId: alice.sessionId, expected: { outcome: "deny", origin: LAB } },
  { caseId: "C3-noauth-protected", resourceId: order1, sessionId: guest.sessionId, expected: { outcome: "deny", origin: LAB } },
  { caseId: "C4a-shared-alice", resourceId: sharedDoc, sessionId: alice.sessionId, expected: { outcome: "allow", origin: LAB } },
  { caseId: "C4b-shared-bob", resourceId: sharedDoc, sessionId: bob.sessionId, expected: { outcome: "allow", origin: LAB } },
  { caseId: "C5-public", resourceId: pub, sessionId: alice.sessionId, expected: { outcome: "allow", origin: LAB } },
  { caseId: "C6-common-admin", resourceId: admin, sessionId: alice.sessionId, expected: { outcome: "deny", origin: LAB } },
  { caseId: "C7-200-nosensitive", resourceId: pub, sessionId: bob.sessionId, expected: { outcome: "allow", origin: LAB } },
  { caseId: "C8-idor-confirmed", resourceId: order2vuln, sessionId: alice.sessionId, expected: { outcome: "deny", origin: LAB } },
  { caseId: "C9-deny-policy", resourceId: order1, sessionId: bob.sessionId, expected: { outcome: "deny", origin: LAB } },
  { caseId: "C10-unknown-policy", resourceId: mystery, sessionId: alice.sessionId, expected: { outcome: "unknown", origin: null } },
  { caseId: "C11-nonexistent", resourceId: missing, sessionId: alice.sessionId, expected: { outcome: "allow", origin: LAB } },
  { caseId: "C12-expired", resourceId: order1, sessionId: expired.sessionId, expected: { outcome: "deny", origin: LAB } },
  { caseId: "C16-redirect-oos", resourceId: redir, sessionId: alice.sessionId, expected: { outcome: "unknown", origin: null } },
];
const run = await mx.run(cases);
const by = Object.fromEntries(run.results.map((r) => [r.caseId, r]));

await t("C1 — owner accesses own resource -> Conforme", async () => assert.equal(by["C1-owner-own"].classification, "conforme"));
await t("C2 — cross-user private resource (secure) -> Conforme (denied)", async () => { assert.equal(by["C2-cross-private"].classification, "conforme"); assert.equal(by["C2-cross-private"].status, 403); });
await t("C3 — no-auth protected resource -> Conforme (denied)", async () => { assert.equal(by["C3-noauth-protected"].classification, "conforme"); assert.equal(by["C3-noauth-protected"].status, 401); });
await t("C4 — two users on legitimately shared resource -> Conforme (both allowed)", async () => { assert.equal(by["C4a-shared-alice"].classification, "conforme"); assert.equal(by["C4b-shared-bob"].classification, "conforme"); });
await t("C5 — user accesses public resource -> Conforme", async () => assert.equal(by["C5-public"].classification, "conforme"));
await t("C6 — common user tries admin op -> Conforme (denied, vertical)", async () => { assert.equal(by["C6-common-admin"].classification, "conforme"); assert.equal(by["C6-common-admin"].status, 403); });
await t("C7 — HTTP 200 without sensitive content -> Conforme (no violation)", async () => { assert.equal(by["C7-200-nosensitive"].status, 200); assert.equal(by["C7-200-nosensitive"].classification, "conforme"); });
await t("C8 — HTTP 200 WITH improper resource content -> Violação confirmada (IDOR)", async () => {
  const r = by["C8-idor-confirmed"];
  assert.equal(r.status, 200);
  assert.equal(r.classification, "violacao-confirmada");
  assert.equal(r.evidence.ownershipEvidence, true);
  assert.ok(r.confirmedBy.includes("evidencia-de-posse") && r.confirmedBy.includes("regra-estabelecida"));
});
await t("C9 — 403 per policy -> Conforme", async () => assert.equal(by["C9-deny-policy"].classification, "conforme"));
await t("C10 — unknown policy -> Inconclusivo (200 alone cannot classify)", async () => { assert.equal(by["C10-unknown-policy"].status, 200); assert.equal(by["C10-unknown-policy"].classification, "inconclusivo"); });
await t("C11 — nonexistent resource (404) -> Inconclusivo", async () => { assert.equal(by["C11-nonexistent"].status, 404); assert.equal(by["C11-nonexistent"].classification, "inconclusivo"); });
await t("C12 — expired session -> Conforme (denied 401)", async () => { assert.equal(by["C12-expired"].status, 401); assert.equal(by["C12-expired"].classification, "conforme"); });

// C13 — authorized POST (state-changing, reversible fixture).
await t("C13 — authorized POST changes own state -> Conforme", async () => {
  const r = await mx.run([{ caseId: "C13", resourceId: order1post, sessionId: alice.sessionId, expected: { outcome: "allow", origin: LAB }, authorizedStateChange: true }]);
  const c = r.results[0];
  assert.equal(c.status, 200); assert.equal(c.classification, "conforme");
  const check = await m.request(alice.sessionId, { op: "probe", method: "GET", url: APP + "/api/orders/1" });
  assert.ok(check.body.includes("updated-A"), "state not changed by authorized POST");
  await m.request(alice.sessionId, { op: "probe", method: "POST", url: APP + "/reset" }); // reversible fixture
});

// C14 — denied POST must NOT change state.
await t("C14 — denied POST leaves state unchanged -> Conforme", async () => {
  const r = await mx.run([{ caseId: "C14", resourceId: order2post, sessionId: alice.sessionId, expected: { outcome: "deny", origin: LAB }, authorizedStateChange: true }]);
  const c = r.results[0];
  assert.equal(c.status, 403); assert.equal(c.classification, "conforme");
  const check = await m.request(bob.sessionId, { op: "probe", method: "GET", url: APP + "/api/orders/2" });
  assert.ok(check.body.includes("secret-B") && !check.body.includes("hacked"), "denied POST changed state");
});

// C15 — failure/cancellation mid-matrix: some executed, broken ones inconclusivo; + aborted signal.
await t("C15 — failure/cancellation mid-matrix handled cleanly (partial results)", async () => {
  const tmp = await m.create({ scope: SCOPE });
  await m.request(tmp.sessionId, { op: "navigate", url: APP + "/login?user=alice" });
  await m.close(tmp.sessionId); // this session breaks mid-list
  const r = await mx.run([
    { caseId: "C15-ok1", resourceId: pub, sessionId: alice.sessionId, expected: { outcome: "allow", origin: LAB } },
    { caseId: "C15-broken", resourceId: pub, sessionId: tmp.sessionId, expected: { outcome: "allow", origin: LAB } },
    { caseId: "C15-ok2", resourceId: pub, sessionId: alice.sessionId, expected: { outcome: "allow", origin: LAB } },
  ]);
  assert.equal(r.results[0].classification, "conforme");
  assert.equal(r.results[1].classification, "inconclusivo"); assert.equal(r.results[1].executed, false);
  assert.equal(r.results[2].classification, "conforme");
  const ac = new AbortController(); ac.abort();
  const r2 = await mx.run([{ caseId: "C15-cancel", resourceId: pub, sessionId: alice.sessionId, expected: { outcome: "allow", origin: LAB } }], { signal: ac.signal });
  assert.equal(r2.results[0].classification, "inconclusivo");
  assert.match(r2.results[0].rationale, /cancel/i);
});

// C16 — redirect to out-of-scope destination blocked; evil not contacted.
await t("C16 — redirect/out-of-scope destination blocked (Scope Guard)", async () => {
  const before = evilHits;
  assert.equal(by["C16-redirect-oos"].classification, "conforme");
  assert.equal(by["C16-redirect-oos"].evidence.scopeBlocked, true);
  assert.equal(evilHits, before, "evil must not be contacted");
});

// C17 — evidence sanitized: no cookie/token/raw secret anywhere in results.
await t("C17 — evidence sanitized (no cookie/token/raw secret in any result)", async () => {
  const dump = JSON.stringify(run.results) + JSON.stringify(by["C8-idor-confirmed"]);
  assert.ok(!/sid=|tok_sekret|x-auth-token|secret-A|secret-B/i.test(dump), "secret leaked into results");
  // results carry only normalized structure (keys), never raw values
  assert.ok(by["C1-owner-own"].evidence.shape && Array.isArray(by["C1-owner-own"].evidence.shape.keys));
});

// C18 — no cross-session leakage: alice's IDOR result exposes only an ownership BOOLEAN, not bob's content.
await t("C18 — no cross-session content leakage (ownership as boolean, not raw)", async () => {
  const r = by["C8-idor-confirmed"];
  const s = JSON.stringify(r);
  assert.ok(!s.includes("secret-B"), "bob's raw content leaked into alice's result");
  assert.equal(r.evidence.ownershipEvidence, true); // the violation is evidenced by a boolean + shape, not raw data
  assert.ok(r.evidence.shape.keys.includes("marker")); // structure only
});

await m.closeAll();
app.close(); evil.close();
console.log(`\nevilHits (must be 0) = ${evilHits}`);
console.log("summary:", JSON.stringify(mx.summary()));
console.log(`${pass} passed, ${fail} failed, ${blocked} blocked`);
process.exit(fail || evilHits ? 1 : 0);
