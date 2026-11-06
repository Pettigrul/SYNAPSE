// SecurityAuditor — Visual Browser Backend tests (H1a-F2).
// Unit + integration via an INJECTED MOCK DRIVER (no real browser). The real-browser
// integration test runs ONLY if the environment permits (playwright-core + installed
// browser); otherwise it is reported BLOCKED — never PASS.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import * as B from "./backends/browser.mjs";
import { ScopeError } from "./scope.mjs";
import { capability } from "./capability.mjs";

let pass = 0, fail = 0, blocked = 0;
async function t(name, fn) { try { await fn(); pass++; console.log(`  ok   ${name}`); } catch (e) { fail++; console.log(`FAIL   ${name}\n       ${e && e.message}`); } finally { await B.close().catch(() => {}); B.backend._reset(); } }
async function tb(name, fn) { const r = await fn(); if (r === "BLOCKED") { blocked++; console.log(`BLOCK  ${name}`); } else { pass++; console.log(`  ok   ${name}`); } }

const SCOPE = { allowHosts: ["app.example.com", ".example.com"] };
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108", "hex");

function mockDriver(scn = {}) {
  const state = { launched: false, ignoreHTTPSErrors: null, closed: false, lastClick: null, lastFill: null };
  const driver = {
    async launch({ scopeAllows, onRequest, onConsole, ignoreHTTPSErrors }) {
      state.launched = true; state.ignoreHTTPSErrors = ignoreHTTPSErrors;
      const handle = {
        url: "",
        async goto(url) {
          onRequest({ method: "GET", url, resourceType: "document", status: 200, headers: { "content-type": "text/html", "set-cookie": "sid=supersecret" } });
          for (const sub of scn.subrequests || []) { if (scopeAllows(sub)) onRequest({ method: "GET", url: sub, resourceType: "script", status: 200, headers: {} }); }
          onConsole({ type: "log", text: scn.consoleText || "debug token=abcdef123456" });
          handle.url = scn.finalUrl || url;
          return { status: scn.status || 200, finalUrl: handle.url, redirectChain: scn.redirectChain || [] };
        },
        async snapshot() { return { html: scn.html || "<html><body>sid=abcdef123456 <a href='/x'>x</a></body></html>", accessibilityText: "x" }; },
        async screenshot() { return scn.bigShot ? Buffer.alloc(scn.bigShot) : PNG; },
        async click(spec) { state.lastClick = spec; return { ok: true }; },
        async fill(spec, value) { state.lastFill = { spec, value }; return { ok: true }; },
        async close() { state.closed = true; },
      };
      return handle;
    },
  };
  return { driver, state };
}

console.log("web-runtime visual backend test suite\n");

await t("open() validates scope BEFORE navigation (driver not launched)", async () => {
  const { driver, state } = mockDriver();
  await assert.rejects(() => B.open("https://evil.test/", { scope: SCOPE, driver }), ScopeError);
  assert.equal(state.launched, false);
});

await t("open() in-scope returns nav result; TLS NOT bypassed", async () => {
  const { driver, state } = mockDriver({ finalUrl: "https://app.example.com/home", redirectChain: [{ from: "https://app.example.com/", to: "https://app.example.com/home", status: 302 }] });
  const r = await B.open("https://app.example.com/", { scope: SCOPE, driver });
  assert.equal(r.status, 200);
  assert.equal(r.finalUrl, "https://app.example.com/home");
  assert.equal(r.redirectChain.length, 1);
  assert.equal(state.ignoreHTTPSErrors, false); // never bypass TLS
});

await t("redirect to out-of-scope is rejected (post-redirect scope re-check)", async () => {
  const { driver } = mockDriver({ redirectChain: [{ from: "https://app.example.com/", to: "https://evil.test/x", status: 302 }], finalUrl: "https://app.example.com/" });
  await assert.rejects(() => B.open("https://app.example.com/", { scope: SCOPE, driver }), ScopeError);
});

await t("out-of-scope subresource blocked+recorded; set-cookie redacted in network", async () => {
  const { driver } = mockDriver({ subrequests: ["https://app.example.com/a.js", "https://evil.test/track.js"] });
  await B.open("https://app.example.com/", { scope: SCOPE, driver });
  const net = await B.network();
  assert.ok(net.entries.some(e => e.url === "https://app.example.com/a.js"));
  assert.ok(!net.entries.some(e => e.url === "https://evil.test/track.js"), "out-of-scope subresource must not appear");
  assert.ok(B.actionLog().some(a => a.action === "request-blocked" && a.target === "https://evil.test/track.js"));
  const doc = net.entries.find(e => e.resourceType === "document");
  assert.equal(doc.headers["set-cookie"], "[REDACTED]");
});

await t("snapshot sanitized (rendered DOM; no raw credential)", async () => {
  const { driver } = mockDriver({ html: "<html><body>password=hunter2secret Bearer AAAAbbbbCCCC</body></html>" });
  await B.open("https://app.example.com/", { scope: SCOPE, driver });
  const s = await B.snapshot();
  assert.equal(s.rendered, true);
  assert.ok(!s.html.includes("hunter2secret"));
  assert.ok(!s.html.includes("AAAAbbbbCCCC"));
  assert.ok(s.html.includes("[REDACTED"));
});

await t("screenshot -> sanitized artifact (path+sha256, portable name, no bytes to LLM)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "secaudit-br-"));
  const { driver } = mockDriver();
  await B.open("https://app.example.com/", { scope: SCOPE, driver });
  const r = await B.screenshot({ dir });
  assert.ok(/^[a-f0-9]{64}$/.test(r.sha256));
  assert.ok(fs.existsSync(r.path));
  assert.ok(!/[\\/:*?"<>|]/.test(path.basename(r.path)));
  assert.ok(!("buffer" in r) && !("image" in r));
  fs.rmSync(dir, { recursive: true, force: true });
});

await t("screenshot over maxScreenshotBytes -> LimitError", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "secaudit-br-"));
  const { driver } = mockDriver({ bigShot: 2000 });
  await B.open("https://app.example.com/", { scope: SCOPE, driver });
  await assert.rejects(() => B.screenshot({ dir, }), B.LimitError).catch(async () => {
    // if default limit is high, force a tiny limit
  });
  // force a small limit explicitly
  await B.close(); B.backend._reset();
  const { driver: d2 } = mockDriver({ bigShot: 2000 });
  await B.open("https://app.example.com/", { scope: SCOPE, driver: d2, limits: { maxScreenshotBytes: 1000 } });
  await assert.rejects(() => B.screenshot({ dir }), B.LimitError);
  fs.rmSync(dir, { recursive: true, force: true });
});

await t("click semantic locator recorded; fill masks the value (no secret in log)", async () => {
  const { driver } = mockDriver();
  await B.open("https://app.example.com/", { scope: SCOPE, driver });
  await B.click({ role: "button", name: "Entrar" });
  await B.fill({ label: "Senha" }, "hunter2secret");
  const log = B.actionLog();
  const fillEntry = log.find(a => a.action === "fill");
  assert.ok(fillEntry.detail.includes("value.len=13"));
  assert.ok(!JSON.stringify(log).includes("hunter2secret"), "typed secret must not be logged");
  assert.ok(log.find(a => a.action === "click").target.includes("role=button"));
});

await t("console redacted; action log has correlatable ids + timestamps + status", async () => {
  const { driver } = mockDriver({ consoleText: "api token=abcdef123456" });
  await B.open("https://app.example.com/", { scope: SCOPE, driver });
  const c = await B.consoleLogs();
  assert.ok(!c.messages.some(m => m.text.includes("abcdef123456")));
  const log = B.actionLog();
  assert.ok(log.every(a => /^br-.+-\d+$/.test(a.actionId) && a.ts && a.status));
});

await t("limits: maxActions exceeded -> LimitError", async () => {
  const { driver } = mockDriver();
  await B.open("https://app.example.com/", { scope: SCOPE, driver, limits: { maxActions: 1 } });
  await assert.rejects(() => B.snapshot(), B.LimitError);
});

await t("cancellation via aborted signal -> CancelledError", async () => {
  const ac = new AbortController();
  const { driver } = mockDriver();
  await B.open("https://app.example.com/", { scope: SCOPE, driver, signal: ac.signal });
  ac.abort();
  await assert.rejects(() => B.snapshot(), B.CancelledError);
});

await t("close() clears session; action afterwards errors", async () => {
  const { driver } = mockDriver();
  await B.open("https://app.example.com/", { scope: SCOPE, driver });
  const r = await B.close();
  assert.equal(r.closed, true);
  await assert.rejects(() => B.snapshot(), /no active browser session/);
});

await t("single session: second open while active is rejected", async () => {
  const { driver } = mockDriver();
  await B.open("https://app.example.com/", { scope: SCOPE, driver });
  const { driver: d2 } = mockDriver();
  await assert.rejects(() => B.open("https://app.example.com/2", { scope: SCOPE, driver: d2 }), /already open/);
});

await t("capability fallback: select() -> http-inspect + visual:false when browser unavailable", async () => {
  const sel = await capability.select();
  const mtx = await capability.matrix();
  const br = mtx.find(m => m.id === "browser");
  if (br.available) {
    // environment unexpectedly has a working visual backend
    assert.equal(sel.backend, "browser"); assert.equal(sel.visual, true);
  } else {
    assert.equal(sel.backend, "http-inspect");
    assert.equal(sel.visual, false);
    assert.ok(sel.reason.includes("visual indisponível"));
    assert.equal(br.capabilities.dom_rendered, false);
    assert.equal(br.capabilities.screenshot, false);
  }
  assert.equal(mtx[0].id, "http-inspect"); // F1 backend first & always available
});

await t("describeLocator prefers semantic; flags css fallback", async () => {
  assert.ok(B.describeLocator({ role: "link", name: "Sobre" }).startsWith("role=link"));
  assert.ok(B.describeLocator({ css: ".btn" }).includes("non-semantic fallback"));
});

// ---- Real browser integration: PASS only if runnable; else BLOCKED (never PASS) ----
await tb("REAL browser nav against loopback fixture (DOM+screenshot+network)", async () => {
  const probe = await B.probe();
  if (!probe.available) { console.log(`       reason: ${probe.reason}`); return "BLOCKED"; }
  // Only reachable when playwright-core + a browser channel exist. Synthetic loopback fixture only.
  const html = "<!doctype html><html><body><h1>fixture</h1><a href='/next'>n</a></body></html>";
  const srv = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html); });
  await new Promise(r => srv.listen(0, "127.0.0.1", r));
  const { port } = srv.address();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "secaudit-br-real-"));
  try {
    const scope = { allowHosts: ["127.0.0.1"], allowPrivate: true };
    const nav = await B.open(`http://127.0.0.1:${port}/`, { scope });
    assert.equal(nav.status, 200);
    const snap = await B.snapshot(); assert.ok(snap.html.includes("fixture"));
    const shot = await B.screenshot({ dir }); assert.ok(fs.existsSync(shot.path));
    const net = await B.network(); assert.ok(net.entries.length >= 1);
  } finally { srv.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  return "PASS";
});

console.log(`\n${pass} passed, ${fail} failed, ${blocked} blocked`);
process.exit(fail ? 1 : 0);
