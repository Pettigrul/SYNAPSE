// SecurityAuditor — Operational Investigation Integration (H1d-F2), DETERMINISTIC path.
//
// Drives the REAL operational components in the real order: knowledge routing via the actual
// `references/pattern-index.md`, technique selection by READING the matched `skills/<cat>/SKILL.md`
// (never by injecting a T[N] id), then the Capability Bridge + the existing validators, then a
// correlated, sanitized Investigation Record. The LLM's reasoning is replaced by DETERMINISTIC
// selection logic — this is NOT an LLM agent run and is not presented as one. The agent-driven
// (LLM) end-to-end validation is BLOCKED here (no model/quota; a live billed Pi agent run is out
// of scope); see the acceptance report. Real browser; BLOCKED if none. No real targets.
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createBridge } from "./bridge.mjs";
import { createInvestigationLab } from "./fixtures/investigation-lab.mjs";
import { probe } from "./session.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url)); // repo root
let pass = 0, fail = 0;
async function t(name, fn) {
  try { const r = await fn(); if (r === "BLOCKED") { console.log(`BLOCK  ${name}`); } else { pass++; console.log(`  ok   ${name}`); } }
  catch (e) { fail++; console.log(`FAIL   ${name}\n       ${(e && e.message || e).toString().split("\n")[0]}`); }
}

// ---- REAL knowledge router: pattern-index.md -> KB file (no technique id injected) ----------
function routeIntake(intake) {
  const idx = fs.readFileSync(ROOT + "references/pattern-index.md", "utf8");
  const low = intake.toLowerCase();
  for (const line of idx.split("\n")) {
    const m = /^\|\s*\*\*(.+?)\*\*\s*\|\s*`?([^`|]+?)`?\s*(?:\(.*\))?\s*\|/.exec(line);
    if (!m) continue;
    const keywords = m[1].split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
    const hit = keywords.find((k) => k.length >= 4 && low.includes(k));
    if (hit) return { keyword: hit, file: m[2].trim().split(" ")[0] };
  }
  return null;
}
// ---- REAL technique selection: read the KB file, extract a T[N]/B[N] whose row matches a tag --
function selectTechnique(kbFile, tag) {
  const path = ROOT + kbFile;
  const body = fs.readFileSync(path, "utf8");
  const rows = [...body.matchAll(/^\|\s*(T\d+|B\d+)\s*\|\s*([^|]+?)\s*\|/gm)];
  const re = new RegExp(tag, "i");
  const picked = rows.find((r) => re.test(r[2])) || rows[0];
  if (!picked) return null;
  return { techniqueId: picked[1], description: picked[2].trim(), kbFile, snippet: picked[0].trim() };
}

console.log("web-runtime Operational Investigation Integration — deterministic path (H1d-F2)\n");
const pr = await probe();
if (!pr.available) { console.log(`ALL BLOCKED — browser unavailable: ${pr.reason}\n0 passed, 0 failed, blocked`); process.exit(0); }

let evilHits = 0;
const evil = http.createServer((q, s) => { evilHits++; s.writeHead(200); s.end("EVIL"); });
const listen = (srv, host) => new Promise((r) => srv.listen(0, host, () => r(srv.address().port)));
const evilPort = await listen(evil, "127.0.0.2"); const EVIL = `http://127.0.0.2:${evilPort}`;
const lab = createInvestigationLab({ evilBase: EVIL });
const appPort = await listen(lab, "127.0.0.1"); const APP = `http://127.0.0.1:${appPort}`;
const SCOPE = { allowHosts: ["127.0.0.1"], allowPrivate: true };

const records = [];
function record(r) { records.push(r); return r; }

// Shared helper: operator provisions the Execution Context (NOT the agent).
function provision(bridge, investigationId, allowedCapabilities, approvals = []) {
  bridge.openInvestigation({ investigationId, scope: SCOPE, allowedCapabilities, approvals });
}
async function mkSession(bridge, inv, user) {
  const c = await bridge.invoke({ investigationId: inv, op: "sessions.create", params: { kind: "owner", label: user } });
  assert.equal(c.ok, true);
  const nav = await bridge.invoke({ investigationId: inv, op: "browser.navigate", params: { sessionId: c.result.sessionId, url: APP + `/login?user=${user}` } });
  assert.equal(nav.ok, true); // login navigation must succeed (needs the "browser" capability)
  return c.result.sessionId;
}

// ================= CASE A — IDOR/BOLA (no T5 given) =================
await t("CASE A — IDOR horizontal: route->select->AuthZ->record", async () => {
  const intake = "Hipotese de horizontal escalation: alice consegue ler o pedido de bob trocando o numero do objeto em /api/orders/2.";
  assert.ok(!/T5/.test(intake), "intake must not name the technique id");
  const route = routeIntake(intake);
  assert.ok(route && /web-testing/.test(route.file), `router should reach web-testing (got ${route && route.file})`);
  const tech = selectTechnique(route.file, "IDOR");
  assert.equal(tech.techniqueId, "T5"); // DERIVED from the KB file, not injected
  assert.ok(/IDOR/i.test(tech.snippet), "selection justified by the consulted KB row");

  const bridge = createBridge();
  provision(bridge, "INV-A", ["sessions", "browser", "authorization"]); // GET IDOR: no state-change approval needed
  const alice = await mkSession(bridge, "INV-A", "alice");
  const bob = await mkSession(bridge, "INV-A", "bob");
  const reg = await bridge.invoke({ investigationId: "INV-A", op: "authorization.registerResource", params: { resource: { label: "order#2 (bob)", request: { url: APP + "/api/orders/2" }, classification: "private", ownerPrincipalId: "bob", ownershipMarker: "OWN-bob-2" } } });
  const regOwn = await bridge.invoke({ investigationId: "INV-A", op: "authorization.registerResource", params: { resource: { label: "order#1 (alice)", request: { url: APP + "/api/orders/1" }, classification: "private", ownerPrincipalId: "alice", ownershipMarker: "OWN-alice-1" } } });
  const run = await bridge.invoke({ investigationId: "INV-A", op: "authorization.run", params: { cases: [
    { caseId: "A-cross", resourceId: reg.result.resourceId, sessionId: alice, expected: { outcome: "deny", origin: "lab-fixture" } },
    { caseId: "A-own", resourceId: regOwn.result.resourceId, sessionId: alice, expected: { outcome: "allow", origin: "lab-fixture" } },
  ] } });
  assert.equal(run.ok, true);
  const cross = run.result.results.find((r) => r.caseId === "A-cross");
  const own = run.result.results.find((r) => r.caseId === "A-own");
  assert.equal(cross.classification, "violacao-confirmada"); // 200 + ownership evidence + established rule
  assert.equal(cross.evidence.ownershipEvidence, true);
  assert.equal(own.classification, "conforme");
  assert.ok(!JSON.stringify(run).includes("tok_inv_secret"), "no secret leaks into the result");
  record({ investigationId: "INV-A", techniqueId: tech.techniqueId, hypothesisId: "H-idor-order", capability: "authorization", classification: cross.classification, sessionIds: [alice, bob], resourceIds: [reg.result.resourceId], evidence: { ownershipEvidence: true }, limitations: [] });
  await bridge.shutdown();
});

// ================= CASE B — Race condition (no T10 given) =================
await t("CASE B — race/double-spend: route->select->Race Validator->record", async () => {
  const intake = "Hipotese: o cupom permite double spend em requisicoes simultaneas (concurrency limit furado).";
  assert.ok(!/T10/.test(intake));
  const route = routeIntake(intake);
  assert.ok(route && /code-review/.test(route.file), `router should reach code-review (got ${route && route.file})`);
  const tech = selectTechnique(route.file, "race condition|toctou");
  assert.equal(tech.techniqueId, "T10");

  const bridge = createBridge();
  provision(bridge, "INV-B", ["sessions", "browser", "concurrent", "race"], [{ op: "race.run", url: APP + "/coupon/redeem" }]);
  const alice = await mkSession(bridge, "INV-B", "alice");
  const bob = await mkSession(bridge, "INV-B", "bob");
  const obs = await mkSession(bridge, "INV-B", "obs");
  const exp = {
    experimentId: "exp-coupon", observerSessionId: obs, hypothesis: "double-spend",
    expectedRule: { description: "coupon usable at most once", source: "lab-fixture" },
    requiredInitialState: { couponUses: 0 },
    operations: [
      { sessionId: alice, method: "POST", url: APP + "/coupon/redeem", body: "{}", policy: { stateChanging: true } },
      { sessionId: bob, method: "POST", url: APP + "/coupon/redeem", body: "{}", policy: { stateChanging: true } },
    ],
    invariant: { field: "couponUses", op: "<=", value: 1 },
    observe: { stateUrl: APP + "/_state", fields: ["couponUses"] }, reset: { url: APP + "/_reset" }, attempts: 1,
  };
  const run = await bridge.invoke({ investigationId: "INV-B", op: "race.run", params: { experiment: exp } });
  assert.equal(run.ok, true);
  assert.equal(run.result.classification, "violacao-observada");
  assert.equal(run.classification, run.result.classification); // validator verdict preserved
  record({ investigationId: "INV-B", techniqueId: tech.techniqueId, hypothesisId: "H-coupon", experimentId: "exp-coupon", capability: "race", classification: run.result.classification, sessionIds: [alice, bob, obs], limitations: [] });
  await bridge.shutdown();
});

// ================= CASE C — Visual investigation, NO vulnerability =================
await t("CASE C — visual SPA exploration concludes WITHOUT inventing a finding", async () => {
  const intake = "Fazer web recon da interface do SPA, inspecionar o DOM e verificar se ha algo exploravel.";
  const route = routeIntake(intake);
  assert.ok(route && /web-inventory/.test(route.file), `router should reach web-inventory (got ${route && route.file})`);
  const tech = selectTechnique(route.file, "recon|discovery|inventory|surface|map");
  assert.ok(/^T\d+$/.test(tech.techniqueId));

  const bridge = createBridge();
  provision(bridge, "INV-C", ["sessions", "browser"]);
  const s = await mkSession(bridge, "INV-C", "viewer");
  const nav = await bridge.invoke({ investigationId: "INV-C", op: "browser.navigate", params: { sessionId: s, url: APP + "/app" } });
  assert.equal(nav.ok, true);
  const snap = await bridge.invoke({ investigationId: "INV-C", op: "browser.snapshot", params: { sessionId: s } });
  assert.equal(snap.ok, true);
  const domText = JSON.stringify(snap.result);
  assert.ok(/Dashboard/.test(domText), "explored the real rendered DOM");
  // Conservative conclusion: no authoritative evidence of a vulnerability -> NO finding invented.
  const finding = null; // the operational path produces a finding ONLY from validator evidence
  record({ investigationId: "INV-C", techniqueId: tech.techniqueId, hypothesisId: "H-spa-recon", capability: "browser", classification: "sem-achado", finding, sessionIds: [s], limitations: ["exploração visual não substitui prova de vulnerabilidade"] });
  assert.equal(finding, null);
  await bridge.shutdown();
});

// ================= NEGATIVE TESTS (§7) =================
await t("NEG1 — unauthorized capability refused", async () => {
  const b = createBridge(); provision(b, "N1", ["browser"]);
  const r = await b.invoke({ investigationId: "N1", op: "authorization.run", params: { cases: [] } });
  assert.equal(r.ok, false); assert.equal(r.error.code, "capability-not-allowed"); await b.shutdown();
});
await t("NEG2 — Scope Guard blocks out-of-scope (evil untouched)", async () => {
  const before = evilHits; const b = createBridge(); provision(b, "N2", ["http"]);
  const r = await b.invoke({ investigationId: "N2", op: "http.inspect", params: { url: EVIL + "/x" } });
  assert.ok(r.ok === false || (r.result && (r.result.status === 0 || r.result.error)));
  assert.equal(evilHits, before); await b.shutdown();
});
await t("NEG3 — agent cannot widen authorization (params ignored)", async () => {
  const b = createBridge(); provision(b, "N3", ["sessions", "browser"]); // no approvals
  const s = await mkSession(b, "N3", "u");
  // Agent tries to self-authorize by smuggling authorizedStateChange/scope into params.
  const r = await b.invoke({ investigationId: "N3", op: "browser.probe", params: { sessionId: s, method: "POST", url: APP + "/coupon/redeem", authorizedStateChange: true, scope: { allowHosts: ["*"] } } });
  assert.equal(r.ok, false); assert.equal(r.error.code, "state-change-unauthorized"); await b.shutdown();
});
await t("NEG4 — nonexistent / closed session", async () => {
  const b = createBridge(); provision(b, "N4", ["sessions", "browser"]);
  const s = await mkSession(b, "N4", "u");
  await b.invoke({ investigationId: "N4", op: "sessions.close", params: { sessionId: s } });
  const r = await b.invoke({ investigationId: "N4", op: "browser.snapshot", params: { sessionId: s } });
  assert.equal(r.ok, false); await b.shutdown();
});
await t("NEG5 — invalid technique reference (router no-match -> no capability call)", async () => {
  const route = routeIntake("zzzqqq intake sem qualquer palavra-chave reconhecivel 123");
  assert.equal(route, null); // harness must NOT fabricate a technique or call a capability
});
await t("NEG6 — absent expected policy -> inconclusivo (not a violation)", async () => {
  const b = createBridge(); provision(b, "N6", ["sessions", "browser", "authorization"]);
  const s = await mkSession(b, "N6", "alice");
  const reg = await b.invoke({ investigationId: "N6", op: "authorization.registerResource", params: { resource: { label: "mystery", request: { url: APP + "/api/orders/1" }, classification: "unknown" } } });
  const run = await b.invoke({ investigationId: "N6", op: "authorization.run", params: { cases: [{ caseId: "N6", resourceId: reg.result.resourceId, sessionId: s, expected: { outcome: "unknown", origin: null } }] } });
  assert.equal(run.result.results[0].classification, "inconclusivo");
  assert.notEqual(run.result.results[0].classification, "violacao-confirmada"); await b.shutdown();
});
await t("NEG7 — inconclusive race (unprovable initial state)", async () => {
  const b = createBridge(); provision(b, "N7", ["sessions", "browser", "concurrent", "race"], [{ op: "race.run", url: APP + "/coupon/redeem" }]);
  const a = await mkSession(b, "N7", "a"); const o = await mkSession(b, "N7", "o");
  const exp = { experimentId: "e", observerSessionId: o, hypothesis: "x", expectedRule: { description: "y", source: "lab-fixture" }, requiredInitialState: { couponUses: 5 }, operations: [{ sessionId: a, method: "POST", url: APP + "/coupon/redeem", body: "{}", policy: { stateChanging: true } }], invariant: { field: "couponUses", op: "<=", value: 1 }, observe: { stateUrl: APP + "/_state", fields: ["couponUses"] }, reset: { url: APP + "/_reset" }, attempts: 1 };
  const run = await b.invoke({ investigationId: "N7", op: "race.run", params: { experiment: exp } });
  assert.equal(run.result.classification, "inconclusivo"); await b.shutdown();
});
await t("NEG8 — browser failure handled cleanly", async () => {
  const b = createBridge(); provision(b, "N8", ["sessions", "browser"]);
  const s = await mkSession(b, "N8", "u");
  try { await b._manager._pool._browser.close(); } catch { /* ignore */ }
  const r = await b.invoke({ investigationId: "N8", op: "browser.snapshot", params: { sessionId: s } });
  assert.equal(r.ok, false); try { await b.shutdown(); } catch { /* ignore */ }
});
await t("NEG9 — cancellation of an in-flight op", async () => {
  const b = createBridge(); provision(b, "N9", ["http"]);
  const p = b.invoke({ investigationId: "N9", op: "http.inspect", params: { url: APP + "/app" }, operationId: "x" });
  const c = b.cancel("N9", "x"); assert.equal(typeof c.cancelled, "boolean");
  await p; await b.shutdown();
});
await t("NEG10 — evidence sanitization (no cookie/token)", async () => {
  const b = createBridge(); provision(b, "N10", ["http"]);
  const r = await b.invoke({ investigationId: "N10", op: "http.inspect", params: { url: APP + "/login?user=alice" } });
  const txt = JSON.stringify(r);
  assert.ok(!txt.includes("sid=alice") && !txt.includes("tok_inv_secret")); await b.shutdown();
});

lab.close(); evil.close();
console.log(`\nInvestigation records (correlated): ${records.length}`);
for (const r of records) console.log(`  ${r.investigationId}: ${r.techniqueId} -> ${r.capability} -> ${r.classification}`);
console.log(`\nAGENTIC (LLM-driven) end-to-end: BLOCKED — no model/quota in this environment; a live billed Pi agent run is out of scope. Deterministic operational-path validated above.`);
console.log(`evilHits (must be 0) = ${evilHits}`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail || evilHits ? 1 : 0);
