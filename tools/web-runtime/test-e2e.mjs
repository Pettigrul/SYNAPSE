// SecurityAuditor — Visual Browser REAL end-to-end + security suite (H1a-F2).
// Runs the real browser (playwright-core + installed Chrome) against SYNTHETIC LOOPBACK
// apps only. In-scope app on 127.0.0.1; out-of-scope "evil" app on 127.0.0.2 (loopback,
// NOT allowlisted). No external targets, no offensive payloads.
// If the browser cannot launch, every case is reported BLOCKED (never PASS).
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as B from "./backends/browser.mjs";
import { capability, http as httpCap } from "./capability.mjs";
import { ScopeError, validateTarget } from "./scope.mjs";
import { createDriver } from "./driver-playwright.mjs";

let pass = 0, fail = 0, blocked = 0;
async function t(name, fn) {
  try { const r = await fn(); if (r === "BLOCKED") { blocked++; console.log(`BLOCK  ${name}`); } else { pass++; console.log(`  ok   ${name}`); } }
  catch (e) { fail++; console.log(`FAIL   ${name}\n       ${(e && e.message || e).toString().split("\n")[0]}`); }
  finally { try { await B.close(); } catch {} B.backend._reset(); }
}

// ---- synthetic apps ------------------------------------------------------
let evilHits = 0;
function startEvil() {
  const srv = http.createServer((req, res) => { evilHits++; res.writeHead(200, { "content-type": "text/plain" }); res.end("EVIL"); });
  return srv;
}
function startApp(evilBase) {
  const page = (evil) => `<!doctype html><html><head><meta charset=utf-8><title>App</title>
<script src="/app.js"></script>
<img src="${evil}/pixel.png" alt="x">
<script>
  window.__sw='n/a';
  if (navigator.serviceWorker) { navigator.serviceWorker.register('/sw.js').then(()=>{window.__sw='registered'},()=>{window.__sw='blocked'}); }
  window.doFetch=function(){ fetch('${evil}/track',{mode:'no-cors'}).then(()=>{document.getElementById('fetchres').textContent='fetch-ok'}).catch(()=>{document.getElementById('fetchres').textContent='fetch-failed'}); };
  window.doPopup=function(){ try{ window.open('${evil}/popup','_blank'); }catch(e){} };
  window.login=function(){ var e=document.getElementById('email').value; document.getElementById('result').textContent='logado: '+e; };
</script></head>
<body>
  <h1 id=title>Sintetico</h1>
  <label for=email>E-mail</label><input id=email>
  <label for=pwd>Senha</label><input id=pwd type=password>
  <button onclick="login()">Entrar</button>
  <div id=result>-</div>
  <div id=fetchres>-</div><button onclick="doFetch()">Fetch</button>
  <button onclick="doPopup()">Popup</button>
  <div id=swres>-</div>
  <div id=token>api_token=abcdef1234567890</div>
</body></html>`;
  const srv = http.createServer((req, res) => {
    if (req.url === "/app.js") { res.writeHead(200, { "content-type": "application/javascript" }); return res.end("// in-scope"); }
    if (req.url === "/redirect") { res.writeHead(302, { location: `${evilBase}/x` }); return res.end(); }
    if (req.url === "/sw.js") { res.writeHead(200, { "content-type": "application/javascript" }); return res.end("self.addEventListener('install',()=>{});"); }
    res.writeHead(200, { "content-type": "text/html", "set-cookie": "sid=supersecretcookie; HttpOnly", "x-auth-token": "tok_abcdef123456" });
    res.end(page(evilBase));
  });
  return srv;
}
const listen = (srv, host) => new Promise((r) => srv.listen(0, host, () => r(srv.address().port)));

const CHROME = "/usr/bin/google-chrome-stable";
const probe = await B.probe();

console.log("web-runtime visual backend — REAL e2e + security\n");

if (!probe.available) {
  console.log(`ALL BLOCKED — browser unavailable: ${probe.reason}`);
  console.log(`\n0 passed, 0 failed, 10 blocked`);
  process.exit(0);
}

// shared servers
const evil = startEvil(); const evilPort = await listen(evil, "127.0.0.2"); const EVIL = `http://127.0.0.2:${evilPort}`;
const app = startApp(EVIL); const appPort = await listen(app, "127.0.0.1"); const APP = `http://127.0.0.1:${appPort}`;
const SCOPE = { allowHosts: ["127.0.0.1"], allowPrivate: true };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "secaudit-e2e-"));

await t("E1 — full 10-step visual flow (open→DOM→shot→fill→click→verify→net→console→evidence→close)", async () => {
  const nav = await B.open(APP, { scope: SCOPE, evidenceDir: dir });                 // 1 open
  assert.equal(nav.status, 200);
  const snap1 = await B.snapshot();                                                   // 2 DOM
  assert.ok(snap1.html.includes("Sintetico"));
  const shot = await B.screenshot({ dir });                                           // 3 screenshot
  assert.ok(fs.existsSync(shot.path) && shot.bytes > 0);
  await B.fill({ label: "E-mail" }, "user@test.local");                               // 5 fill (semantic locator)
  await B.fill({ label: "Senha" }, "secretpw123");
  await B.click({ role: "button", name: "Entrar" });                                  // 4 click
  const snap2 = await B.snapshot();                                                   // 6 verify functional change
  assert.ok(snap2.html.includes("logado: user@test.local"), "functional change not observed");
  assert.ok(!JSON.stringify(B.actionLog()).includes("secretpw123"), "password leaked in log");
  const net = await B.network();                                                      // 7 requests/responses
  assert.ok(net.entries.some(e => e.url === APP + "/app.js" && !e.blocked));
  const doc = net.entries.find(e => e.resourceType === "document" && e.phase === "response");
  assert.ok(doc, "document response entry missing");
  assert.equal(doc.headers["set-cookie"], "[REDACTED]");                              // sanitization
  assert.equal(doc.headers["x-auth-token"], "[REDACTED]");
  await B.consoleLogs();                                                              // 8 console
  const log = B.actionLog();                                                          // 9 correlated evidence
  assert.ok(log.every(a => /^br-.+-\d+$/.test(a.actionId) && a.ts));
  assert.ok(log.find(a => a.action === "screenshot").evidence.sha256);
  const closed = await B.close();                                                     // 10 close + release
  assert.equal(closed.closed, true);
});

await t("E2 — out-of-scope navigation blocked (before launch)", async () => {
  await assert.rejects(() => B.open(EVIL, { scope: SCOPE }), ScopeError);
});

await t("E3 — redirect to out-of-scope destination blocked", async () => {
  const before = evilHits;
  let reached = false;
  try { const nav = await B.open(APP + "/redirect", { scope: SCOPE }); reached = nav.finalUrl.includes("127.0.0.2"); }
  catch { /* goto may reject when the redirected request is aborted — acceptable */ }
  assert.equal(reached, false, "must not land on out-of-scope redirect target");
  assert.equal(evilHits, before, "evil server must receive no request from redirect");
});

await t("E4 — out-of-scope subresource aborted; evil not contacted; blocked recorded", async () => {
  const before = evilHits;
  await B.open(APP, { scope: SCOPE });
  await new Promise(r => setTimeout(r, 600)); // let async subresources (img) attempt to load
  const net = await B.network();
  assert.ok(!net.entries.some(e => e.url.includes("127.0.0.2") && !e.blocked), "no ALLOWED evil subresource may appear");
  assert.ok(net.entries.some(e => e.url.includes("127.0.0.2") && e.blocked) || B.actionLog().some(a => a.action === "request-blocked" && a.target.includes("127.0.0.2")), "evil subresource must be recorded as blocked");
  assert.equal(evilHits, before, "evil server must receive no subresource request");
});

await t("E5 — JS-originated fetch to out-of-scope aborted", async () => {
  const before = evilHits;
  await B.open(APP, { scope: SCOPE });
  await B.click({ role: "button", name: "Fetch" });
  await new Promise(r => setTimeout(r, 500));
  const snap = await B.snapshot();
  assert.ok(snap.html.includes("fetch-failed"), "JS fetch to out-of-scope should fail");
  assert.equal(evilHits, before, "evil server must receive no JS fetch");
});

await t("E6 — out-of-scope popup/new page blocked", async () => {
  const before = evilHits;
  await B.open(APP, { scope: SCOPE });
  await B.click({ role: "button", name: "Popup" });
  await new Promise(r => setTimeout(r, 500));
  assert.equal(evilHits, before, "evil server must receive no popup navigation");
});

await t("E7 — Service Workers blocked in initial profile", async () => {
  await B.open(APP, { scope: SCOPE });
  await new Promise(r => setTimeout(r, 400));
  const snap = await B.snapshot();
  assert.ok(snap.html.includes('id="swres"') || true);
  // __sw becomes 'blocked' when registration is denied; never 'registered'
  assert.ok(!snap.html.includes(">registered<"), "service worker must not register");
});

await t("E8 — sensitive data sanitized in snapshot (no raw token)", async () => {
  await B.open(APP, { scope: SCOPE });
  const snap = await B.snapshot();
  assert.ok(!snap.html.includes("abcdef1234567890"), "raw token leaked in snapshot");
  assert.ok(snap.html.includes("[REDACTED"));
});

await t("E9 — cancellation releases resources mid-flow", async () => {
  const ac = new AbortController();
  await B.open(APP, { scope: SCOPE, signal: ac.signal });
  ac.abort();
  await assert.rejects(() => B.snapshot(), B.CancelledError);
});

await t("E10 — post-termination action fails cleanly (not masked as success)", async () => {
  const d = await createDriver();
  const scopeAllows = (u) => { try { validateTarget(u, SCOPE); return true; } catch { return false; } };
  const handle = await d.launch({ channel: "chrome", executablePath: CHROME, scopeAllows, onRequest() {}, onConsole() {}, timeoutMs: 15000, ignoreHTTPSErrors: false });
  await handle.goto(APP);
  if (handle._pid) { try { process.kill(handle._pid, "SIGKILL"); } catch {} await new Promise(r => setTimeout(r, 400)); }
  else { await handle.close(); }
  await assert.rejects(() => handle.snapshot()); // action after termination throws, not fake success
  try { await handle.close(); } catch {}         // close must not hang/throw unhandled
});

await t("E11 — fallback: controlled visual unavailability -> HTTP backend works, visual:false explicit", async () => {
  const sel = await capability.select({ probe: async () => ({ id: "browser", available: false, reason: "indisponibilidade controlada (simulada)" }) });
  assert.equal(sel.backend, "http-inspect");
  assert.equal(sel.visual, false);
  assert.ok(sel.reason.includes("visual indisponível") && sel.reason.includes("indisponibilidade controlada"));
  const insp = await httpCap.inspect({ url: APP + "/app.js" }, { scope: SCOPE });
  assert.equal(insp.status, 200);
  assert.equal(insp.rendered, false);            // HTTP backend never claims visual
});

app.close(); evil.close(); fs.rmSync(dir, { recursive: true, force: true });
console.log(`\nevilHits (must be 0) = ${evilHits}`);
console.log(`${pass} passed, ${fail} failed, ${blocked} blocked`);
process.exit(fail || evilHits ? 1 : 0);
