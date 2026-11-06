// SecurityAuditor — Capability Bridge synthetic suite (H1d-F1).
// Real browser against the reversible synthetic lab on 127.0.0.1 + an out-of-scope "evil" app
// on 127.0.0.2. Exercises the 14 in-process bridge areas (area 15 = external regression run),
// plus the required session-persistence demo, policy-enforcement evidence, result sanitization
// and AuthZ/Race classifier preservation. No real targets. BLOCKED if no browser.
import assert from "node:assert/strict";
import http from "node:http";
import { createBridge } from "./bridge.mjs";
import * as cap from "./capability.mjs";
import { createRaceLab } from "./fixtures/race-lab.mjs";
import { probe } from "./session.mjs";

let pass = 0, fail = 0;
async function t(name, fn) {
  try { const r = await fn(); if (r === "BLOCKED") { console.log(`BLOCK  ${name}`); } else { pass++; console.log(`  ok   ${name}`); } }
  catch (e) { fail++; console.log(`FAIL   ${name}\n       ${(e && e.message || e).toString().split("\n")[0]}`); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let evilHits = 0;
const evil = http.createServer((q, s) => { evilHits++; s.writeHead(200); s.end("EVIL"); });
const listen = (srv, host) => new Promise((r) => srv.listen(0, host, () => r(srv.address().port)));

console.log("web-runtime Capability Bridge — synthetic suite (H1d-F1)\n");
const pr = await probe();
if (!pr.available) { console.log(`ALL BLOCKED — browser unavailable: ${pr.reason}\n0 passed, 0 failed, 15 blocked`); process.exit(0); }

const evilPort = await listen(evil, "127.0.0.2"); const EVIL = `http://127.0.0.2:${evilPort}`;
const lab = createRaceLab({ evilBase: EVIL });
const appPort = await listen(lab, "127.0.0.1"); const APP = `http://127.0.0.1:${appPort}`;
const SCOPE = { allowHosts: ["127.0.0.1"], allowPrivate: true };

const br = createBridge();
const INV = "INV-main";
br.openInvestigation({
  investigationId: INV, scope: SCOPE,
  allowedCapabilities: ["capabilities", "http", "sessions", "browser", "authorization", "concurrent", "race"],
  approvals: [{ op: "race.run", url: APP + "/coupon/redeem-vuln" }, { op: "browser.probe", url: APP + "/coupon/redeem-vuln" }],
});

// 1 — capability discovery.
await t("B1 — capability discovery (list + probe)", async () => {
  const list = await br.invoke({ op: "capabilities.list" });
  assert.equal(list.ok, true);
  assert.deepEqual([...list.result.capabilities].sort(), ["authorization", "browser", "caido", "caido-active", "capabilities", "concurrent", "copilot", "http", "investigation", "race", "sessions", "workflow"]);
  assert.ok(list.result.operations.race.includes("race.run"));
  const pb = await br.invoke({ op: "capabilities.probe" });
  assert.equal(pb.ok, true); assert.equal(typeof pb.result.visual, "boolean");
});
// 2 — valid + invalid calls.
await t("B2 — valid and invalid calls", async () => {
  const ok = await br.invoke({ investigationId: INV, op: "http.inspect", params: { url: APP + "/public" } });
  assert.equal(ok.ok, true); assert.equal(ok.result.status, 200);
  const badOp = await br.invoke({ investigationId: INV, op: "no.such.op", params: {} });
  assert.equal(badOp.ok, false); assert.equal(badOp.error.code, "unsupported-op");
  const badInv = await br.invoke({ investigationId: "nope", op: "http.inspect", params: { url: APP + "/public" } });
  assert.equal(badInv.ok, false); assert.equal(badInv.error.code, "unknown-investigation");
});
// 3 — parameter validation.
await t("B3 — parameter validation", async () => {
  const a = await br.invoke({ investigationId: INV, op: "sessions.status", params: {} });
  assert.equal(a.ok, false); assert.equal(a.error.code, "bad-params");
  const b = await br.invoke({ investigationId: INV, op: "browser.navigate", params: {} });
  assert.equal(b.ok, false); assert.equal(b.error.code, "bad-params");
});
// 4 — scope enforcement.
await t("B4 — scope enforcement blocks out-of-scope (evil untouched)", async () => {
  const before = evilHits;
  const r = await br.invoke({ investigationId: INV, op: "http.inspect", params: { url: EVIL + "/x" } });
  assert.ok(r.ok === false || (r.result && (r.result.status === 0 || r.result.error)), "out-of-scope must not succeed");
  assert.equal(evilHits, before);
});
// 5 — allowed-operations enforcement.
await t("B5 — capability-not-allowed enforcement", async () => {
  br.openInvestigation({ investigationId: "INV-httponly", scope: SCOPE, allowedCapabilities: ["http"] });
  const r = await br.invoke({ investigationId: "INV-httponly", op: "sessions.create", params: { kind: "noauth" } });
  assert.equal(r.ok, false); assert.equal(r.error.code, "capability-not-allowed");
  await br.closeInvestigation("INV-httponly");
});
// 6 — session reuse across calls (PERSISTENCE DEMO: same process, 3 separate invokes).
await t("B6 — session persists across calls (in-process reuse)", async () => {
  const c = await br.invoke({ investigationId: INV, op: "sessions.create", params: { kind: "owner", label: "persist" } });
  assert.equal(c.ok, true); const S = c.result.sessionId;
  const n1 = await br.invoke({ investigationId: INV, op: "browser.navigate", params: { sessionId: S, url: APP + "/login?user=alice" } });
  assert.equal(n1.ok, true);
  const n2 = await br.invoke({ investigationId: INV, op: "browser.navigate", params: { sessionId: S, url: APP + "/" } });
  assert.equal(n2.ok, true);
  const st = await br.invoke({ investigationId: INV, op: "sessions.status", params: { sessionId: S } });
  assert.equal(st.ok, true);
  assert.ok(st.result.actions >= 2, `same session accumulated actions across calls (got ${st.result.actions})`);
  assert.equal(st.result.lastUrl, APP + "/");
  await br.invoke({ investigationId: INV, op: "sessions.close", params: { sessionId: S } });
});
// 7 — isolation between investigations.
await t("B7 — isolation between investigations", async () => {
  br.openInvestigation({ investigationId: "INV-B", scope: SCOPE, allowedCapabilities: ["sessions", "browser"] });
  const c = await br.invoke({ investigationId: "INV-B", op: "sessions.create", params: { kind: "owner" } });
  const Sb = c.result.sessionId;
  const cross = await br.invoke({ investigationId: INV, op: "browser.navigate", params: { sessionId: Sb, url: APP + "/" } });
  assert.equal(cross.ok, false); assert.equal(cross.error.code, "session-not-in-investigation");
  const listMain = await br.invoke({ investigationId: INV, op: "sessions.list", params: {} });
  assert.ok(!listMain.result.sessions.some((s) => s.sessionId === Sb), "INV-main must not see INV-B's session");
  await br.closeInvestigation("INV-B");
});
// 8 — cancellation.
await t("B8 — cancellation aborts an in-flight op", async () => {
  const p = br.invoke({ investigationId: INV, op: "http.inspect", params: { url: APP + "/slow?ms=1500" }, operationId: "cancel-me" });
  await wait(30);
  const c = br.cancel(INV, "cancel-me");
  assert.equal(c.cancelled, true);
  const r = await p;
  assert.ok(r.ok === false || (r.result && r.result.error) || (r.result && r.result.status === 0), "cancelled op must not return a clean success");
});
// 9 — timeout.
await t("B9 — per-op timeout", async () => {
  const c = await br.invoke({ investigationId: INV, op: "sessions.create", params: { kind: "owner" } });
  const S = c.result.sessionId;
  await br.invoke({ investigationId: INV, op: "browser.navigate", params: { sessionId: S, url: APP + "/" } });
  const r = await br.invoke({ investigationId: INV, op: "browser.probe", params: { sessionId: S, url: APP + "/slow?ms=1500", timeoutMs: 200 } });
  assert.equal(r.ok, true);
  assert.ok(r.result.error || r.result.status === 0, "slow probe must hit the timeout");
  await br.invoke({ investigationId: INV, op: "sessions.close", params: { sessionId: S } });
});
// 11 — sanitization.
await t("B11 — results are sanitized (no cookie/token/storageState leak)", async () => {
  const r = await br.invoke({ investigationId: INV, op: "http.inspect", params: { url: APP + "/login?user=alice" } });
  assert.equal(r.ok, true);
  const txt = JSON.stringify(r);
  assert.ok(!txt.includes("sid=alice"), "Set-Cookie value must be redacted");
  const c = await br.invoke({ investigationId: INV, op: "sessions.create", params: { kind: "owner" } });
  assert.ok(!JSON.stringify(c).toLowerCase().includes("storagestate"), "sessions.create must not return storageState");
  await br.invoke({ investigationId: INV, op: "sessions.close", params: { sessionId: c.result.sessionId } });
});
// 12 — classifier preservation (AuthZ anomaly stays anomaly; Race verdict from the validator).
await t("B12 — AuthZ/Race classifiers preserved (bridge never upgrades)", async () => {
  // AuthZ: a 200 where policy says deny, with NO ownership evidence -> anomaly, NOT confirmed.
  const a = await br.invoke({ investigationId: INV, op: "sessions.create", params: { kind: "owner", label: "az" } });
  const Sa = a.result.sessionId;
  await br.invoke({ investigationId: INV, op: "browser.navigate", params: { sessionId: Sa, url: APP + "/login?user=alice" } });
  const reg = await br.invoke({ investigationId: INV, op: "authorization.registerResource", params: { resource: { label: "public-as-private", request: { url: APP + "/public" }, classification: "private", ownerPrincipalId: "someone-else" } } });
  const resourceId = reg.result.resourceId;
  const az = await br.invoke({ investigationId: INV, op: "authorization.run", params: { cases: [{ caseId: "AZ1", resourceId, sessionId: Sa, expected: { outcome: "deny", origin: "lab-fixture" } }] } });
  assert.equal(az.ok, true);
  assert.equal(az.result.results[0].classification, "anomalia-de-autorizacao");
  assert.notEqual(az.result.results[0].classification, "violacao-confirmada");
  await br.invoke({ investigationId: INV, op: "sessions.close", params: { sessionId: Sa } });

  // Race: double-spend coupon -> violation observed, classification straight from the validator.
  const mk = async (u) => { const c = await br.invoke({ investigationId: INV, op: "sessions.create", params: { kind: "owner", label: u } }); await br.invoke({ investigationId: INV, op: "browser.navigate", params: { sessionId: c.result.sessionId, url: APP + `/login?user=${u}` } }); return c.result.sessionId; };
  const [alice, bob, obs] = [await mk("alice"), await mk("bob"), await mk("obs")];
  const exp = {
    experimentId: "br-race", observerSessionId: obs, hypothesis: "double-spend",
    expectedRule: { description: "coupon usable at most once", source: "lab-fixture" },
    requiredInitialState: { couponUses: 0 },
    operations: [
      { sessionId: alice, method: "POST", url: APP + "/coupon/redeem-vuln", body: "{}", policy: { stateChanging: true } },
      { sessionId: bob, method: "POST", url: APP + "/coupon/redeem-vuln", body: "{}", policy: { stateChanging: true } },
    ],
    invariant: { field: "couponUses", op: "<=", value: 1 },
    observe: { stateUrl: APP + "/_state", fields: ["couponUses"] }, reset: { url: APP + "/_reset" }, attempts: 1,
  };
  const rc = await br.invoke({ investigationId: INV, op: "race.run", params: { experiment: exp } });
  assert.equal(rc.ok, true);
  assert.equal(rc.result.classification, "violacao-observada");
  assert.equal(rc.classification, rc.result.classification); // envelope copies the validator verdict verbatim
  for (const u of [alice, bob, obs]) await br.invoke({ investigationId: INV, op: "sessions.close", params: { sessionId: u } });
});
// 14 — compatibility with existing APIs.
await t("B14 — compatible with existing capability.* APIs", async () => {
  const viaBridge = await br.invoke({ investigationId: INV, op: "http.inspect", params: { url: APP + "/public" } });
  const direct = await cap.http.inspect({ url: APP + "/public" }, { scope: SCOPE });
  assert.equal(viaBridge.result.status, direct.status);
  assert.equal(viaBridge.result.rendered, direct.rendered);
});
// 15-local — policy enforcement evidence: state-change needs an adapter approval.
await t("B15 — state-change requires adapter-provided approval", async () => {
  const c = await br.invoke({ investigationId: INV, op: "sessions.create", params: { kind: "owner" } });
  const S = c.result.sessionId;
  await br.invoke({ investigationId: INV, op: "browser.navigate", params: { sessionId: S, url: APP + "/" } });
  // Not approved -> blocked (coupon redeem via a POST probe to an unapproved URL).
  const denied = await br.invoke({ investigationId: INV, op: "browser.probe", params: { sessionId: S, method: "POST", url: APP + "/withdraw-vuln?amt=10" } });
  assert.equal(denied.ok, false); assert.equal(denied.error.code, "state-change-unauthorized");
  // Approved URL (coupon) -> allowed to proceed.
  const okAppr = await br.invoke({ investigationId: INV, op: "browser.probe", params: { sessionId: S, method: "POST", url: APP + "/coupon/redeem-vuln" } });
  assert.equal(okAppr.ok, true);
  await br.invoke({ investigationId: INV, op: "sessions.close", params: { sessionId: S } });
});
// 10 — unexpected browser failure (own bridge; destroys the browser).
await t("B10 — unexpected browser failure handled cleanly", async () => {
  const brF = createBridge();
  brF.openInvestigation({ investigationId: "INV-fail", scope: SCOPE, allowedCapabilities: ["sessions", "browser"] });
  const c = await brF.invoke({ investigationId: "INV-fail", op: "sessions.create", params: { kind: "owner" } });
  const S = c.result.sessionId;
  try { await brF._manager._pool._browser.close(); } catch { /* ignore */ }
  const r = await brF.invoke({ investigationId: "INV-fail", op: "browser.snapshot", params: { sessionId: S } });
  assert.equal(r.ok, false); // clean structured failure, no throw
  try { await brF.shutdown(); } catch { /* ignore */ }
});
// 13 — cleanup + reload (no fake recovery across process instances).
await t("B13 — cleanup, shutdown and reload invalidation", async () => {
  const ci = await br.closeInvestigation("INV-main"); // closes INV-main's sessions
  assert.equal(ci.closed, true);
  const after = await br.invoke({ investigationId: "INV-main", op: "http.inspect", params: { url: APP + "/public" } });
  assert.equal(after.ok, false); assert.equal(after.error.code, "unknown-investigation");
  const sd = await br.shutdown();
  assert.ok(sd.closedInvestigations >= 0);
  const closed = await br.invoke({ op: "capabilities.list" });
  assert.equal(closed.ok, false); assert.equal(closed.error.code, "bridge-closed");
  // Reload = a NEW bridge instance: a prior investigationId is unknown (no fake recovery).
  const br2 = createBridge();
  assert.notEqual(br2.instanceId, br.instanceId);
  const stale = await br2.invoke({ investigationId: "INV-main", op: "http.inspect", params: { url: APP + "/public" } });
  assert.equal(stale.ok, false); assert.equal(stale.error.code, "unknown-investigation");
  await br2.shutdown();
});

lab.close(); evil.close();
console.log(`\nevilHits (must be 0) = ${evilHits}`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail || evilHits ? 1 : 0);
