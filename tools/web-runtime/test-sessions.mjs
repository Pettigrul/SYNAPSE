// SecurityAuditor — Multi-Session Runtime synthetic suite (H1b-F1).
// Real browser (playwright-core + installed Chrome) against SYNTHETIC LOOPBACK apps ONLY:
//   auth app on 127.0.0.1 (login sets a cookie); "evil" app on 127.0.0.2 (NOT allowlisted).
// No external targets, no offensive payloads, no IDOR/BOLA execution (that is H1b-F2).
// If the browser cannot launch, every case is reported BLOCKED (never PASS).
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionManager } from "./session-manager.mjs";
import { probe } from "./session.mjs";
import * as B from "./backends/browser.mjs";
import { ScopeError } from "./scope.mjs";

let pass = 0, fail = 0, blocked = 0;
const openMgrs = new Set();
async function t(name, fn) {
  try { const r = await fn(); if (r === "BLOCKED") { blocked++; console.log(`BLOCK  ${name}`); } else { pass++; console.log(`  ok   ${name}`); } }
  catch (e) { fail++; console.log(`FAIL   ${name}\n       ${(e && e.message || e).toString().split("\n")[0]}`); }
}
function mgr(opts) { const m = new SessionManager(opts); openMgrs.add(m); return m; }

// ---- synthetic apps ------------------------------------------------------
let evilHits = 0;
const evil = http.createServer((req, res) => { evilHits++; res.writeHead(200, { "content-type": "text/plain" }); res.end("EVIL"); });
const readBody = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });
function cookieUser(req) {
  const c = req.headers.cookie || "";
  const m = /(?:^|;\s*)sid=([^;]+)/.exec(c);
  return m ? decodeURIComponent(m[1]).replace(/-sek$/, "") : "anon";
}
const app = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://127.0.0.1");
  if (req.method === "POST" && u.pathname === "/login") {
    const body = await readBody(req);
    const user = (/(?:^|&)user=([^&]*)/.exec(body) || [, "anon"])[1];
    res.writeHead(200, { "content-type": "text/plain", "set-cookie": `sid=${decodeURIComponent(user)}-sek; Path=/; HttpOnly`, "x-auth-token": "tok_deadbeef123456" });
    return res.end("logged:" + decodeURIComponent(user));
  }
  if (u.pathname === "/whoami") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("who:" + cookieUser(req)); }
  if (u.pathname === "/login-redirect" && req.method === "POST") {
    const body = await readBody(req);
    const user = (/(?:^|&)user=([^&]*)/.exec(body) || [, "anon"])[1];
    res.writeHead(303, { "set-cookie": `sid=${decodeURIComponent(user)}-sek; Path=/`, location: "/whoami" });
    return res.end();
  }
  // login page
  res.writeHead(200, { "content-type": "text/html", "set-cookie": "landing=1; Path=/" });
  res.end(`<!doctype html><html><head><meta charset=utf-8><title>Auth</title></head><body>
  <h1 id=title>Auth App</h1>
  <label for=email>E-mail</label><input id=email>
  <label for=pwd>Senha</label><input id=pwd type=password>
  <button onclick="login()">Entrar</button>
  <div id=result>-</div><div id=whoami>-</div>
  <div id=token>api_token=abcdef1234567890</div>
  <script>
    window.login = async function(){
      var email = document.getElementById('email').value;
      await fetch('/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'user='+encodeURIComponent(email)});
      var who = await (await fetch('/whoami')).text();
      document.getElementById('result').textContent='ok';
      document.getElementById('whoami').textContent=who;
    };
  </script></body></html>`);
});
const listen = (srv, host) => new Promise((r) => srv.listen(0, host, () => r(srv.address().port)));

console.log("web-runtime multi-session runtime — synthetic suite\n");
const pr = await probe();
if (!pr.available) { console.log(`ALL BLOCKED — browser unavailable: ${pr.reason}\n0 passed, 0 failed, 15 blocked`); process.exit(0); }

const evilPort = await listen(evil, "127.0.0.2"); const EVIL = `http://127.0.0.2:${evilPort}`;
const appPort = await listen(app, "127.0.0.1"); const APP = `http://127.0.0.1:${appPort}`;
const SCOPE = { allowHosts: ["127.0.0.1"], allowPrivate: true };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "secaudit-sess-"));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// log in a session (fill + click + settle); proves POST body/method survive interception.
async function login(m, sid, user) {
  await m.request(sid, { op: "navigate", url: APP });
  await m.request(sid, { op: "fill", locator: { label: "E-mail" }, value: user });
  await m.request(sid, { op: "click", locator: { role: "button", name: "Entrar" } });
  await wait(400);
}

// S0 — PREREQUISITE (section 4): POST method+body preserved + in-scope redirect under interception.
await t("S0 — PREREQ: authenticated POST preserves method/body; in-scope redirect followed", async () => {
  const m = mgr();
  const { sessionId } = await m.create({ scope: SCOPE });
  await login(m, sessionId, "alice");
  const snap = await m.request(sessionId, { op: "snapshot" });
  assert.ok(snap.html.includes("who:alice"), "POST body/method not preserved (whoami != alice)"); // fetch POST carried body; cookie set+carried
  // in-scope redirect after POST (303 -> /whoami) must be followed within scope
  const s2 = await m.create({ scope: SCOPE });
  await m.request(s2.sessionId, { op: "navigate", url: APP });
  await m._sessions.get(s2.sessionId).handle.evaluate(async () => {
    await fetch('/login-redirect', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'user=bob' });
  });
  await wait(300);
  const who = await m._sessions.get(s2.sessionId).handle.evaluate(async () => (await fetch('/whoami')).text());
  assert.ok(who.includes("who:bob"), "redirect-after-POST auth not established in scope");
  await m.closeAll();
});

// S1 — three independent sessions; identifiers are distinct and opaque.
await t("S1 — create three independent sessions (distinct principal/session/context ids)", async () => {
  const m = mgr();
  const a = await m.create({ scope: SCOPE, kind: "owner", label: "A" });
  const b = await m.create({ scope: SCOPE, kind: "cross-user", label: "B" });
  const c = await m.create({ scope: SCOPE, kind: "noauth" });
  const ids = [a, b, c];
  assert.equal(new Set(ids.map((x) => x.sessionId)).size, 3);
  assert.equal(new Set(ids.map((x) => x.principalId)).size, 3);
  assert.equal(new Set(ids.map((x) => x.contextId)).size, 3);
  assert.ok(a.sessionId.startsWith("br-") && a.principalId.startsWith("pr-") && a.contextId.startsWith("ctx-"));
  assert.equal(m.list().length, 3);
  await m.closeAll();
});

// S2 — cookie + localStorage + sessionStorage isolation across contexts.
await t("S2 — cookies / localStorage / sessionStorage isolated per session", async () => {
  const m = mgr();
  const a = await m.create({ scope: SCOPE }); const b = await m.create({ scope: SCOPE });
  await login(m, a.sessionId, "alice"); // sets cookie sid=alice in A's context
  await m._sessions.get(a.sessionId).handle.evaluate(() => { localStorage.setItem("k", "A"); sessionStorage.setItem("s", "A"); });
  await m.request(b.sessionId, { op: "navigate", url: APP });
  const who = await m._sessions.get(b.sessionId).handle.evaluate(async () => (await fetch('/whoami')).text());
  assert.ok(who.includes("who:anon"), "cookie leaked across sessions");
  const [lk, sk] = await m._sessions.get(b.sessionId).handle.evaluate(() => [localStorage.getItem("k"), sessionStorage.getItem("s")]);
  assert.equal(lk, null, "localStorage leaked across sessions");
  assert.equal(sk, null, "sessionStorage leaked across sessions");
  await m.closeAll();
});

// S3 — alternate navigation between A and B keeps each context's state.
await t("S3 — alternating navigation between A and B preserves per-session state", async () => {
  const m = mgr();
  const a = await m.create({ scope: SCOPE }); const b = await m.create({ scope: SCOPE });
  await login(m, a.sessionId, "alice");
  await login(m, b.sessionId, "bob");
  const wa = await m._sessions.get(a.sessionId).handle.evaluate(async () => (await fetch('/whoami')).text());
  const wb = await m._sessions.get(b.sessionId).handle.evaluate(async () => (await fetch('/whoami')).text());
  assert.ok(wa.includes("who:alice") && wb.includes("who:bob"), "alternating nav mixed session state");
  await m.closeAll();
});

// S4 — authenticated requests resolve to the CORRECT session.
await t("S4 — authenticated request bound to the correct session", async () => {
  const m = mgr();
  const a = await m.create({ scope: SCOPE }); const b = await m.create({ scope: SCOPE });
  await login(m, a.sessionId, "alice"); await login(m, b.sessionId, "bob");
  const sa = await m.request(a.sessionId, { op: "navigate", url: APP + "/whoami" }).then(() => m.request(a.sessionId, { op: "snapshot" }));
  const sb = await m.request(b.sessionId, { op: "navigate", url: APP + "/whoami" }).then(() => m.request(b.sessionId, { op: "snapshot" }));
  assert.ok(sa.html.includes("who:alice") && sb.html.includes("who:bob"));
  await m.closeAll();
});

// S5 — noauth session carries no credentials.
await t("S5 — noauth session has no credentials", async () => {
  const m = mgr();
  const c = await m.create({ scope: SCOPE, kind: "noauth" });
  assert.equal(c.authenticated, false);
  await m.request(c.sessionId, { op: "navigate", url: APP + "/whoami" });
  const snap = await m.request(c.sessionId, { op: "snapshot" });
  assert.ok(snap.html.includes("who:anon"), "noauth session unexpectedly authenticated");
  await m.closeAll();
});

// S6 — closing one session leaves siblings working.
await t("S6 — individual close does not affect other sessions", async () => {
  const m = mgr();
  const a = await m.create({ scope: SCOPE }); const b = await m.create({ scope: SCOPE });
  await m.close(a.sessionId);
  await assert.rejects(() => m.request(a.sessionId, { op: "snapshot" }), /no such open session/);
  const r = await m.request(b.sessionId, { op: "navigate", url: APP }); // B still works
  assert.equal(r.status, 200);
  await m.closeAll();
});

// S7 — global close releases every session and the browser.
await t("S7 — closeAll closes all sessions and releases the browser", async () => {
  const m = mgr();
  await m.create({ scope: SCOPE }); await m.create({ scope: SCOPE });
  const r = await m.closeAll();
  assert.equal(r.closedSessions, 2);
  assert.ok(m.list().every((s) => s.closed));
});

// S8 — session creation limit.
await t("S8 — maxSessions creation limit enforced", async () => {
  const m = mgr({ maxSessions: 2 });
  await m.create({ scope: SCOPE }); await m.create({ scope: SCOPE });
  await assert.rejects(() => m.create({ scope: SCOPE }), /maxSessions/);
  await m.closeAll();
});

// S9 — timeouts / cancellation release resources.
await t("S9 — cancellation (AbortSignal) + maxActions limit per session", async () => {
  const m = mgr();
  const ac = new AbortController();
  const a = await m.create({ scope: SCOPE, signal: ac.signal });
  ac.abort();
  await assert.rejects(() => m.request(a.sessionId, { op: "snapshot" }), /cancelled|closed/i);
  const b = await m.create({ scope: SCOPE, limits: { maxActions: 1 } });
  await m.request(b.sessionId, { op: "navigate", url: APP }); // action #1
  await assert.rejects(() => m.request(b.sessionId, { op: "snapshot" }), /maxActions/);
  await m.closeAll();
});

// S10 — unexpected browser failure surfaces cleanly (not masked).
// NOTE: playwright-core 1.64.1's launch() Browser does not expose a process handle, so an
// external OS SIGKILL isn't available here. We induce genuine UNEXPECTED unavailability by
// force-closing the shared browser out-of-band (NOT via session.close) — the same clean-
// failure path an OS crash takes (Playwright "Target closed" -> our reject). If a future
// version exposes a pid, we SIGKILL for an even more faithful crash.
await t("S10 — unexpected browser termination fails cleanly (not masked)", async () => {
  const m = mgr();
  const a = await m.create({ scope: SCOPE });
  await m.request(a.sessionId, { op: "navigate", url: APP });
  const pid = m._pool && m._pool._pid;
  if (pid) { try { process.kill(pid, "SIGKILL"); } catch {} }
  else { try { await m._pool._browser.close(); } catch {} } // force-disconnect out-of-band
  await wait(400);
  await assert.rejects(() => m.request(a.sessionId, { op: "snapshot" })); // throws, not fake success
  try { await m.closeAll(); } catch {}
});

// S11 — Scope Guard applied per session.
await t("S11 — Scope Guard enforced on every session", async () => {
  const m = mgr();
  const a = await m.create({ scope: SCOPE });
  const before = evilHits;
  await assert.rejects(() => m.request(a.sessionId, { op: "navigate", url: EVIL }), ScopeError);
  assert.equal(evilHits, before, "evil contacted despite scope guard");
  // a second session with its own scope is independent and also guarded
  const b = await m.create({ scope: { allowHosts: ["127.0.0.1"], allowPrivate: true } });
  await assert.rejects(() => m.request(b.sessionId, { op: "navigate", url: EVIL }), ScopeError);
  await m.closeAll();
});

// S12 — evidence sanitized per identity (no cookies/tokens surfaced anywhere).
await t("S12 — evidence sanitized per identity; no secret in outputs", async () => {
  const m = mgr();
  const a = await m.create({ scope: SCOPE, kind: "owner", label: "A", evidenceDir: dir });
  await login(m, a.sessionId, "alice");
  const net = await m.request(a.sessionId, { op: "network" });
  const withCookie = net.entries.find((e) => e.headers && ("set-cookie" in e.headers));
  assert.ok(withCookie && withCookie.headers["set-cookie"] === "[REDACTED]", "set-cookie not redacted");
  assert.ok(!net.entries.some((e) => e.headers && e.headers["x-auth-token"] && e.headers["x-auth-token"] !== "[REDACTED]"), "auth token leaked");
  const snap = await m.request(a.sessionId, { op: "snapshot" });
  assert.ok(!snap.html.includes("abcdef1234567890"), "raw token leaked in snapshot");
  const shot = await m.request(a.sessionId, { op: "screenshot", dir });
  assert.ok(/^[a-f0-9]{64}$/.test(shot.sha256) && fs.existsSync(shot.path));
  // status/get expose NO secret fields
  const st = JSON.stringify(m.status(a.sessionId)) + JSON.stringify(m.get(a.sessionId)) + JSON.stringify(m.identities.describe(a.principalId));
  assert.ok(!/sek|supersecret|deadbeef|abcdef1234567890/i.test(st), "secret surfaced in session/identity metadata");
  await m.closeAll();
});

// S13 — backward compatibility with the single-session API (H1a-F2).
await t("S13 — single-session browser facade still works (backward compatible)", async () => {
  const nav = await B.open(APP, { scope: SCOPE });
  assert.equal(nav.status, 200);
  const snap = await B.snapshot(); assert.ok(snap.html.includes("Auth App"));
  const r = await B.close(); assert.equal(r.closed, true);
});

// S14 — HTTP fallback never falsely claims authentication.
await t("S14 — HTTP fallback reports visual:false + authenticated:false (no false auth)", async () => {
  const m = mgr();
  const fb = m.fallbackSession({ scope: SCOPE });
  assert.equal(fb.visual, false);
  assert.equal(fb.authenticated, false);
  assert.ok(/não reproduz sessão autenticada/i.test(fb.reason));
  const r = await fb.request({ url: APP + "/whoami" });
  assert.equal(r.authenticated, false);
  assert.equal(r.rendered, false);
  assert.equal(r.status, 200);
});

// cleanup any manager that a failing case left open
for (const m of openMgrs) { try { await m.closeAll(); } catch {} }
app.close(); evil.close(); fs.rmSync(dir, { recursive: true, force: true });
console.log(`\nevilHits (must be 0) = ${evilHits}`);
console.log(`${pass} passed, ${fail} failed, ${blocked} blocked`);
process.exit(fail || evilHits ? 1 : 0);
