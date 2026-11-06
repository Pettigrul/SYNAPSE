// SecurityAuditor — Web Runtime test suite (H1a-F1). Node stdlib only, no deps.
// Network is mocked via an injected transport. A single in-process loopback server
// (127.0.0.1) is used ONLY as a local fixture for timeout / size-limit / real-transport
// coverage — never an external target.
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { capability, http as httpCap, evidence } from "./capability.mjs";
import { open, inspect, extractReferences, CancelledError, TimeoutError, LimitError } from "./backends/http-inspect.mjs";
import { validateTarget, ScopeError } from "./scope.mjs";
import { portableName, redactCredentials } from "./evidence.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log(`  ok  ${name}`); } catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e && e.message}`); } }

function mock(routes) {
  return async (url, opts) => {
    const r = typeof routes === "function" ? routes(url, opts) : routes[url];
    if (!r) throw new Error(`no mock route: ${url}`);
    const body = r.body || "";
    return { status: r.status, headers: r.headers || {}, body, bytesRead: body.length, truncated: !!r.truncated };
  };
}
const SCOPE = { allowHosts: ["app.example.com", ".example.com"] };

console.log("web-runtime test suite\n");

await t("capability.probe reports http caps true and visual caps false", async () => {
  const [b] = capability.probe();
  assert.equal(b.id, "http-inspect");
  assert.equal(b.capabilities.http_request, true);
  assert.equal(b.capabilities.static_html, true);
  assert.equal(b.capabilities.dom_rendered, false);
  assert.equal(b.capabilities.screenshot, false);
  assert.equal(b.capabilities.javascript, false);
  assert.equal(b.capabilities.interaction, false);
});

await t("backend exposes no visual methods", async () => {
  const [b] = capability.probe();
  assert.ok(!("screenshot" in httpCap));
  assert.ok(!("render" in httpCap));
  assert.ok(b.capabilities.dom_rendered === false);
});

await t("http.inspect returns STATIC view (rendered:false, dom:null, screenshot:null)", async () => {
  const transport = mock({ "https://app.example.com/": { status: 200, headers: { "content-type": "text/html" }, body: "<html><a href='/x'>x</a></html>" } });
  const res = await inspect({ url: "https://app.example.com/" }, { scope: SCOPE, transport });
  assert.equal(res.rendered, false);
  assert.equal(res.dom, null);
  assert.equal(res.screenshot, null);
  assert.equal(res.kind, "static-http");
  assert.ok(typeof res.staticHtml === "string" && res.staticHtml.includes("<a"));
});

await t("references extracted from fixture (static, not executed)", async () => {
  const html = fs.readFileSync(path.join(HERE, "fixtures", "sample.html"), "utf8");
  const refs = extractReferences(html, "https://app.example.com/page");
  const byType = refs.reduce((a, r) => ((a[r.type] = (a[r.type] || 0) + 1), a), {});
  assert.ok(byType.script >= 1 && byType.stylesheet >= 1 && byType.image >= 1 && byType.form >= 1 && byType.iframe >= 1);
  assert.ok(refs.some(r => r.url === "https://app.example.com/login" && r.type === "form"));
  // fragment-only, javascript: and data: are skipped
  assert.ok(!refs.some(r => r.url.includes("#secao")));
  assert.ok(!refs.some(r => r.url.toLowerCase().startsWith("javascript:")));
});

await t("redirect followed within scope; chain recorded", async () => {
  const transport = mock({
    "https://app.example.com/a": { status: 302, headers: { location: "https://app.example.com/b" } },
    "https://app.example.com/b": { status: 200, headers: {}, body: "ok" },
  });
  const r = await open({ url: "https://app.example.com/a" }, { scope: SCOPE, transport });
  assert.equal(r.finalUrl, "https://app.example.com/b");
  assert.equal(r.status, 200);
  assert.equal(r.redirectChain.length, 1);
});

await t("redirect to OUT-OF-SCOPE host blocked (after redirect)", async () => {
  const transport = mock({
    "https://app.example.com/a": { status: 302, headers: { location: "https://evil.test/x" } },
  });
  await assert.rejects(() => open({ url: "https://app.example.com/a" }, { scope: SCOPE, transport }), ScopeError);
});

await t("redirect to INTERNAL IP blocked (SSRF guard)", async () => {
  const transport = mock({
    "https://app.example.com/a": { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } },
  });
  await assert.rejects(() => open({ url: "https://app.example.com/a" }, { scope: SCOPE, transport }), ScopeError);
});

await t("initial out-of-scope blocked BEFORE any request", async () => {
  let called = false;
  const transport = async () => { called = true; return { status: 200, headers: {}, body: "", bytesRead: 0, truncated: false }; };
  await assert.rejects(() => open({ url: "https://evil.test/" }, { scope: SCOPE, transport }), ScopeError);
  assert.equal(called, false);
});

await t("internal destinations blocked without allowPrivate", async () => {
  for (const u of ["http://127.0.0.1/", "http://10.0.0.5/", "http://192.168.1.1/", "http://localhost/", "http://[::1]/", "http://metadata/"]) {
    assert.throws(() => validateTarget(u, SCOPE), ScopeError, `should block ${u}`);
  }
});

await t("maxRedirects exceeded -> LimitError", async () => {
  let i = 0;
  const transport = mock(() => ({ status: 302, headers: { location: `https://app.example.com/step${i++}` } }));
  await assert.rejects(() => open({ url: "https://app.example.com/start" }, { scope: SCOPE, transport, limits: { maxRedirects: 3, maxRequests: 10 } }), LimitError);
});

await t("cancellation via aborted signal -> CancelledError", async () => {
  const ac = new AbortController(); ac.abort();
  const transport = mock({ "https://app.example.com/": { status: 200, headers: {}, body: "x" } });
  await assert.rejects(() => open({ url: "https://app.example.com/" }, { scope: SCOPE, transport, signal: ac.signal }), CancelledError);
});

await t("response Set-Cookie / auth headers redacted (Rule 6)", async () => {
  const transport = mock({ "https://app.example.com/": { status: 200, headers: { "set-cookie": "sid=supersecret; HttpOnly", "x-api-key": "AKIA123" }, body: "ok" } });
  const r = await open({ url: "https://app.example.com/", headers: { authorization: "Bearer zzz" } }, { scope: SCOPE, transport });
  assert.equal(r.headers["set-cookie"], "[REDACTED]");
  assert.equal(r.headers["x-api-key"], "[REDACTED]");
});

await t("evidence.record writes SANITIZED artifact with portable filename", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "secaudit-ev-"));
  const transport = mock({ "https://app.example.com/": { status: 200, headers: {}, body: "token=abcdef12345 and Bearer AAAAbbbbCCCC and eyJhbGci.eyJzdWIi.sigpart123" } });
  const insp = await inspect({ url: "https://app.example.com/" }, { scope: SCOPE, transport });
  const rec = await evidence.record(insp, { dir });
  assert.equal(rec.sanitized, true);
  assert.ok(/^[a-f0-9]{64}$/.test(rec.sha256));
  const base = path.basename(rec.path);
  assert.ok(!/[\\/:*?"<>|]/.test(base), `filename not portable: ${base}`);
  const written = fs.readFileSync(rec.path, "utf8");
  assert.ok(!written.includes("abcdef12345"), "raw credential leaked");
  assert.ok(!written.includes("AAAAbbbbCCCC"), "raw bearer leaked");
  assert.ok(written.includes("[REDACTED") , "redaction marker missing");
  fs.rmSync(dir, { recursive: true, force: true });
});

await t("portableName is Windows-safe", async () => {
  const n = portableName("https://App.Example.com/a/b?q=1&x=:*?", "json");
  assert.ok(!/[\\/:*?"<>|]/.test(n), n);
  assert.ok(n.endsWith(".json"));
});

await t("size limit truncates body (default transport, loopback fixture)", async () => {
  const big = "A".repeat(50000);
  const srv = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/plain" }); res.end(big); });
  await new Promise(r => srv.listen(0, "127.0.0.1", r));
  const { port } = srv.address();
  try {
    const scope = { allowHosts: ["127.0.0.1"], allowPrivate: true };
    const r = await open({ url: `http://127.0.0.1:${port}/` }, { scope, limits: { maxBytes: 1000 } });
    assert.equal(r.truncated, true);
    assert.ok(r.bytesRead <= 1000);
  } finally { srv.close(); }
});

await t("timeout -> TimeoutError (default transport, loopback fixture)", async () => {
  const srv = http.createServer((req, res) => { /* never responds */ });
  await new Promise(r => srv.listen(0, "127.0.0.1", r));
  const { port } = srv.address();
  try {
    const scope = { allowHosts: ["127.0.0.1"], allowPrivate: true };
    await assert.rejects(() => open({ url: `http://127.0.0.1:${port}/` }, { scope, limits: { timeoutMs: 150 } }), TimeoutError);
  } finally { srv.close(); }
});

await t("real-transport happy path (loopback fixture): status, headers, references", async () => {
  const html = "<html><head><link rel=stylesheet href='/a.css'></head><body><img src='/i.png'><a href='/next'>n</a></body></html>";
  const srv = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html", "set-cookie": "s=secret" }); res.end(html); });
  await new Promise(r => srv.listen(0, "127.0.0.1", r));
  const { port } = srv.address();
  try {
    const scope = { allowHosts: ["127.0.0.1"], allowPrivate: true };
    const insp = await inspect({ url: `http://127.0.0.1:${port}/` }, { scope });
    assert.equal(insp.status, 200);
    assert.equal(insp.rendered, false);
    assert.equal(insp.headers["set-cookie"], "[REDACTED]");
    assert.ok(insp.references.some(r => r.type === "image"));
  } finally { srv.close(); }
});

await t("http.headers returns headers/status without a body field", async () => {
  const transport = mock({ "https://app.example.com/": { status: 204, headers: { "x-test": "1" }, body: "" } });
  const r = await httpCap.headers({ url: "https://app.example.com/" }, { scope: SCOPE, transport });
  assert.equal(r.status, 204);
  assert.equal(r.headers["x-test"], "1");
  assert.ok(!("body" in r));
});

await t("redactCredentials masks jwt/bearer/password", async () => {
  const red = redactCredentials("auth Bearer ABC123xyz; password=hunter2; eyJabc12.eyJdef34.sigvalue9");
  assert.ok(!red.includes("hunter2"));
  assert.ok(!red.includes("ABC123xyz"));
  assert.ok(red.includes("[REDACTED"));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
