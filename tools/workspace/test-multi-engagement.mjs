// Pre-pilot — deterministic tests for MULTI-ENGAGEMENT isolation & Caido project binding.
// Part A: workspace/selection helpers over a real temp ENGAGEMENT_ROOT (offline).
// Part B: Bridge cross-project / cross-engagement refusal via mocked Caido GraphQL (no network, no LLM).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert";
import {
  initEngagement, loadEngagement, associateCaidoProject, selectEngagement, resolveProjectId,
  assertInsideEngagement, engagementStatePaths, WorkspaceError,
  setActiveEngagement, getActiveEngagement, clearActiveEngagement, listEngagements,
  engagementEvidenceDir, resolveEvidenceDir, EVIDENCE_DIR,
} from "./engagement.mjs";
import { createBridge } from "../web-runtime/bridge.mjs";

let n = 0, fail = 0;
const okT = (s) => { n++; console.log(`  ok  ${s}`); };
const badT = (s, e) => { n++; fail++; console.log(`FAIL  ${s}: ${e && e.stack || e}`); };
async function t(s, fn) { try { await fn(); okT(s); } catch (e) { badT(s, e); } }

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "sa-multi-"));
const SCOPE = "# Scope\n\n## In Scope\n\n- app.lab\n";

// ---------- Part A: workspace / selection (offline) ----------

// 1 — two engagements with different Caido projects
await t("1 two engagements, different projects", () => {
  const a = initEngagement({ root: ROOT, name: "acme", scope: SCOPE });
  const b = initEngagement({ root: ROOT, name: "globex", scope: SCOPE });
  associateCaidoProject(a, { projectId: "proj-A" });
  associateCaidoProject(b, { projectId: "proj-B" });
  assert.equal(loadEngagement({ dir: a.dir }).caido.projectId, "proj-A");
  assert.equal(loadEngagement({ dir: b.dir }).caido.projectId, "proj-B");
  assert.notEqual(a.dir, b.dir);
});

// 2 — switch engagement: selection resolves the correct dir/project per name
await t("2 switch engagement", () => {
  const selA = selectEngagement({ root: ROOT, name: "acme" });
  const selB = selectEngagement({ root: ROOT, name: "globex" });
  assert.equal(selA.caidoProjectId, "proj-A"); assert.equal(selB.caidoProjectId, "proj-B");
  assert.ok(selA.dir !== selB.dir);
});

// 3 — project absent → selection reports none (no silent fallback)
await t("3 project absent", () => {
  initEngagement({ root: ROOT, name: "nobind", scope: SCOPE });
  const sel = selectEngagement({ root: ROOT, name: "nobind" });
  assert.equal(sel.caidoProjectId, null); assert.equal(sel.caidoProjectSource, null);
});

// 4 — rebind to a different project requires force (no silent cross-project rebind)
await t("4 rebind requires force", () => {
  const a = loadEngagement({ dir: path.join(ROOT, "acme") });
  assert.throws(() => associateCaidoProject(a, { projectId: "proj-OTHER" }), (e) => e.code === "project-already-associated");
  const r = associateCaidoProject(a, { projectId: "proj-OTHER", force: true });
  assert.equal(r.caido.projectId, "proj-OTHER");
  associateCaidoProject(a, { projectId: "proj-A", force: true }); // restore for later tests
});

// 5 — invalid associations rejected
await t("5 invalid associations", () => {
  const a = loadEngagement({ dir: path.join(ROOT, "acme") });
  assert.throws(() => associateCaidoProject(a, { projectId: "" }), (e) => e.code === "bad-params");
  assert.throws(() => associateCaidoProject({ dir: path.join(ROOT, "does-not-exist") }, { projectId: "x" }), (e) => e.code === "not-managed");
});

// 6 — persistence paths are isolated per engagement AND confined inside it
await t("6 isolated + confined state paths", () => {
  const pa = engagementStatePaths({ dir: path.join(ROOT, "acme") });
  const pb = engagementStatePaths({ dir: path.join(ROOT, "globex") });
  assert.notEqual(pa.record, pb.record);
  assert.ok(pa.record.startsWith(path.join(ROOT, "acme")));
  assert.ok(pb.monitor.startsWith(path.join(ROOT, "globex")));
});

// 7 — path traversal refused
await t("7 path traversal refused", () => {
  assert.throws(() => assertInsideEngagement(path.join(ROOT, "acme"), "../globex/.engagement.json"), (e) => e.code === "path-escape");
  assert.throws(() => assertInsideEngagement(path.join(ROOT, "acme"), "/etc/passwd"), (e) => e.code === "path-escape");
});

// 8 — SYMLINK escape refused (realpath-resolved, stronger than lexical guard)
await t("8 symlink escape refused", () => {
  const engDir = path.join(ROOT, "acme");
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "sa-outside-"));
  fs.writeFileSync(path.join(outside, "secret.txt"), "x");
  const link = path.join(engDir, "evil-link");
  try { fs.symlinkSync(outside, link); } catch { return; } // skip if symlinks unsupported
  assert.throws(() => assertInsideEngagement(engDir, "evil-link/secret.txt"), (e) => e.code === "path-escape");
  fs.unlinkSync(link);
});

// 9 — no carry-over of prior engagement state: a fresh selection reflects only its own manifest
await t("9 no prior-state carry-over", () => {
  const selA = selectEngagement({ root: ROOT, name: "acme" });
  const selB = selectEngagement({ root: ROOT, name: "globex" });
  // selecting B must not inherit A's project
  assert.equal(selB.caidoProjectId, "proj-B");
  assert.notEqual(selA.caidoProjectId, selB.caidoProjectId);
});

// 10 — global vs specific config: engagement wins; env-compat only when unbound; env never overrides
await t("10 config precedence (global vs specific)", () => {
  const bound = loadEngagement({ dir: path.join(ROOT, "acme") });   // proj-A
  const unbound = loadEngagement({ dir: path.join(ROOT, "nobind") }); // none
  assert.deepEqual(resolveProjectId(bound, { envProjectId: "proj-GLOBAL" }), { projectId: "proj-A", source: "engagement" });
  assert.deepEqual(resolveProjectId(unbound, { envProjectId: "proj-GLOBAL" }), { projectId: "proj-GLOBAL", source: "env-compat" });
  assert.deepEqual(resolveProjectId(unbound, {}), { projectId: null, source: null });
});

// 11 — compatibility with an EXISTING legacy workspace (no manifest) → unbound + env-compat applies
await t("11 legacy workspace compat", () => {
  const legacy = path.join(ROOT, "legacy-eng");
  fs.mkdirSync(legacy, { recursive: true });
  fs.writeFileSync(path.join(legacy, "scope.md"), SCOPE); // legacy marker, no manifest
  const eng = loadEngagement({ dir: legacy });
  assert.equal(eng.kind, "legacy");
  assert.deepEqual(resolveProjectId(eng, { envProjectId: "proj-GLOBAL" }), { projectId: "proj-GLOBAL", source: "env-compat" });
});

// ---------- Part B: Bridge cross-project / cross-engagement refusal (mock Caido) ----------

function reqNode(over = {}) {
  return { id: "rq-1", host: "app.lab", port: 443, path: "/users/1", query: "", method: "GET", isTls: true, length: 100, createdAt: "t", fileExtension: "",
    raw: "GET /users/1 HTTP/1.1\r\n\r\n", response: { id: "rs-1", statusCode: 200, roundtripTime: 5, length: 120, createdAt: "t", raw: "HTTP/1.1 200 OK\r\n\r\n" }, ...over };
}
function handlers(instanceProject) {
  return {
    Health: () => ({ currentProject: { project: { id: instanceProject, name: "lab", version: "1.0", readOnly: false }, readOnly: false }, runtime: { __typename: "Runtime" } }),
    Current: () => ({ currentProject: { project: { id: instanceProject, name: "lab", version: "1.0", readOnly: false }, readOnly: false } }),
    History: () => ({ requests: { edges: [{ cursor: "c1", node: reqNode() }], pageInfo: { endCursor: "c1", hasNextPage: false }, count: { value: 1 } } }),
    Request: () => ({ request: reqNode() }),
    CreateReplaySession: () => ({ createReplaySession: { error: null, session: { id: "sess-1", __typename: "ReplaySessionHttp", activeEntry: { id: "entry-1" } } } }),
    StartReplayTask: () => ({ startReplayTask: { error: null, task: { id: "task-1", createdAt: "t", sessionKind: "HTTP", replayEntry: { id: "entry-1" } } } }),
    ReplayEntry: (v) => ({ replayEntry: { __typename: "ReplayEntryHttp", id: v.id, createdAt: "t", error: null, connection: { host: "app.lab", port: 443, isTLS: true }, raw: "GET / HTTP/1.1\r\n\r\n", request: { id: "rq-r", host: "app.lab", port: 443, path: "/", method: "GET", isTls: true, response: { id: "rs-r", statusCode: 200, roundtripTime: 7, length: 90 } } } }),
  };
}
function mkFetch(h) {
  return (url, init = {}) => { const body = JSON.parse(init.body || "{}"); const name = (/SA_(\w+)/.exec(body.query) || [])[1] || "?";
    return Promise.resolve({ status: 200, text: async () => JSON.stringify({ data: h[name] ? h[name](body.variables || {}) : {} }) }); };
}
function withFetch(fn, body) { const prev = globalThis.fetch; globalThis.fetch = fn; return Promise.resolve(body()).finally(() => { globalThis.fetch = prev; }); }
function open(b, { projectId, approvals = [] } = {}) {
  b.openInvestigation({ investigationId: "ENG", scope: { allowHosts: ["app.lab"], allowPrivate: true }, allowedCapabilities: ["caido", "caido-active"], caido: { baseUrl: "https://caido.lab", token: "PAT", projectId }, approvals });
  return b;
}

// 12 — cross-project READ refused: ctx wants proj-A, instance is proj-B → caido-project-mismatch
await t("12 cross-project read refused", () => withFetch(mkFetch(handlers("proj-B")), async () => {
  const b = open(createBridge(), { projectId: "proj-A" });
  const r = await b.invoke({ investigationId: "ENG", op: "caido.history", params: {} });
  assert.equal(r.ok, false); assert.equal(r.error.code, "caido-project-mismatch");
}));

// 13 — REPLAY of a request while on another project refused (mismatch at association)
await t("13 cross-project replay refused", () => withFetch(mkFetch(handlers("proj-B")), async () => {
  const b = open(createBridge(), { projectId: "proj-A", approvals: [{ op: "caido.replay.run", url: null }] });
  const r = await b.invoke({ investigationId: "ENG", op: "caido.replay.run", params: { requestId: "rq-1", kind: "HTTP" } });
  assert.equal(r.ok, false); assert.equal(r.error.code, "caido-project-mismatch");
}));

// 14 — matching project READ allowed (in-scope record returned, bound to the right project)
await t("14 matching project read allowed", () => withFetch(mkFetch(handlers("proj-A")), async () => {
  const b = open(createBridge(), { projectId: "proj-A" });
  const r = await b.invoke({ investigationId: "ENG", op: "caido.history", params: {} });
  assert.equal(r.ok, true); assert.equal(r.result.caidoProjectId, "proj-A"); assert.equal(r.result.engagementId, "ENG");
}));

// 15 — operations without a valid context are refused
await t("15 invalid context refused", () => withFetch(mkFetch(handlers("proj-A")), async () => {
  const b = createBridge();
  const unknown = await b.invoke({ investigationId: "NOPE", op: "caido.history", params: {} });
  assert.equal(unknown.ok, false); assert.equal(unknown.error.code, "unknown-investigation");
  // caido op without any Caido config in the context
  b.openInvestigation({ investigationId: "NOCFG", scope: { allowHosts: ["app.lab"] }, allowedCapabilities: ["caido"] });
  const nocfg = await b.invoke({ investigationId: "NOCFG", op: "caido.health", params: {} });
  assert.equal(nocfg.ok, false); assert.ok(/caido-not-configured|caido-/.test(nocfg.error.code));
}));

// ---------- Part C: dynamic active-engagement selection (UX) ----------
// Explicit session: without one there is no selection at all (test-engagement-isolation.mjs).
const SESSION = "test-session";


// 16 — explicit session selection via pointer (no .env)
await t("16 explicit session selection", () => {
  clearActiveEngagement({ sessionId: SESSION, root: ROOT });
  const r = setActiveEngagement({ sessionId: SESSION, root: ROOT, name: "acme" });
  assert.equal(r.active, true); assert.equal(r.source, "session");
  const a = getActiveEngagement({ sessionId: SESSION, root: ROOT, env: {} });
  assert.equal(a.name, "acme"); assert.equal(a.source, "session");
});

// 17 — absence of selection → none (operations must be blocked by the caller)
await t("17 no selection → none", () => {
  clearActiveEngagement({ sessionId: SESSION, root: ROOT });
  const a = getActiveEngagement({ sessionId: SESSION, root: ROOT, env: {} });
  assert.equal(a.name, null); assert.equal(a.source, null);
  assert.throws(() => selectEngagement({ root: ROOT }), (e) => e.code === "no-active-engagement");
});

// 18 — nonexistent/ambiguous name → not-found; NEVER picks the nearest/first/last
await t("18 no fuzzy / nearest pick", () => {
  clearActiveEngagement({ sessionId: SESSION, root: ROOT });
  assert.throws(() => setActiveEngagement({ sessionId: SESSION, root: ROOT, name: "acm" }), (e) => e.code === "not-found"); // prefix of 'acme'
  assert.equal(getActiveEngagement({ sessionId: SESSION, root: ROOT, env: {} }).name, null); // nothing was selected
});

// 19 — switch invalidates the previous context (honest: requires a clean session)
await t("19 switch invalidates previous", () => {
  setActiveEngagement({ sessionId: SESSION, root: ROOT, name: "acme" });
  const r = setActiveEngagement({ sessionId: SESSION, root: ROOT, name: "globex" });
  assert.equal(r.switched, true); assert.equal(r.previous, "acme"); assert.equal(r.requiresCleanContext, true);
  assert.equal(getActiveEngagement({ sessionId: SESSION, root: ROOT, env: {} }).name, "globex");
});

// 20 — SA_ENGAGEMENT decides alone without a pointer, and can't outvote a pointer that names another engagement
await t("20 SA_ENGAGEMENT override: alone it decides; against the pointer nothing is selected", () => {
  setActiveEngagement({ sessionId: SESSION, root: ROOT, name: "globex" }); // pointer = globex
  const a = getActiveEngagement({ sessionId: SESSION, root: ROOT, cwd: ROOT, env: { SA_ENGAGEMENT: "acme" } });
  assert.equal(a.name, null); assert.equal(a.dir, null); assert.deepEqual(a.conflict, { kind: "mismatch", override: "acme", selected: "globex" });
  const same = getActiveEngagement({ sessionId: SESSION, root: ROOT, cwd: ROOT, env: { SA_ENGAGEMENT: "globex" } });
  assert.equal(same.name, "globex"); assert.equal(same.source, "env"); assert.equal(same.confirmed, true);
  const alone = getActiveEngagement({ sessionId: "no-pointer-here", root: ROOT, cwd: ROOT, env: { SA_ENGAGEMENT: "acme" } }); // ROOT: a plain directory
  assert.equal(alone.name, "acme"); assert.equal(alone.source, "env"); assert.equal(alone.confirmed, false);
});

// 21 — stale pointer (engagement removed) → NO fallback to another engagement
await t("21 stale pointer → no fallback", () => {
  initEngagement({ root: ROOT, name: "ephemeral", scope: SCOPE });
  setActiveEngagement({ sessionId: SESSION, root: ROOT, name: "ephemeral" });
  fs.rmSync(path.join(ROOT, "ephemeral"), { recursive: true, force: true });
  const a = getActiveEngagement({ sessionId: SESSION, root: ROOT, env: {} });
  assert.equal(a.name, null); assert.equal(a.source, null); // not acme/globex
});

// 22 — selection does NOT alter isolation: project binding + confinement unchanged
await t("22 isolation preserved under selection", () => {
  setActiveEngagement({ sessionId: SESSION, root: ROOT, name: "globex" });
  assert.equal(selectEngagement({ root: ROOT, name: "globex" }).caidoProjectId, "proj-B"); // unchanged
  assert.throws(() => assertInsideEngagement(path.join(ROOT, "globex"), "../acme/.engagement.json"), (e) => e.code === "path-escape");
});

// 23 — unresolved SA_ENGAGEMENT override is surfaced, not silently replaced
await t("23 unresolved override surfaced", () => {
  const a = getActiveEngagement({ sessionId: "no-pointer-here", root: ROOT, cwd: ROOT, env: { SA_ENGAGEMENT: "ghost" } });
  assert.equal(a.name, "ghost"); assert.equal(a.source, "env"); assert.equal(a.unresolved, true); assert.equal(a.dir, null);
  const against = getActiveEngagement({ sessionId: SESSION, root: ROOT, cwd: ROOT, env: { SA_ENGAGEMENT: "ghost" } });
  assert.equal(against.dir, null); assert.equal(against.conflict.kind, "mismatch", "a selection exists, and the variable disagrees with it");
});

// 24 — listing is available without any selection (discovery), excludes the state dir
await t("24 listing without selection", () => {
  clearActiveEngagement({ sessionId: SESSION, root: ROOT });
  const names = listEngagements(ROOT).map((e) => e.name);
  assert.ok(names.includes("acme") && names.includes("globex"));
  assert.ok(!names.includes(".sa-state")); // pointer dir is not an engagement
});

// ---------- Part D: per-engagement evidence directory ----------

// 25 — two engagements → distinct evidence dirs, each inside its own engagement
await t("25 distinct evidence dirs", () => {
  const ea = engagementEvidenceDir({ dir: path.join(ROOT, "acme") });
  const eb = engagementEvidenceDir({ dir: path.join(ROOT, "globex") });
  assert.notEqual(ea, eb);
  assert.ok(ea.startsWith(fs.realpathSync(path.join(ROOT, "acme"))) && ea.endsWith(EVIDENCE_DIR));
  assert.ok(eb.startsWith(fs.realpathSync(path.join(ROOT, "globex"))));
});

// 26 — selection drives the evidence dir; switching follows the active engagement
await t("26 evidence follows selection", () => {
  assert.equal(selectEngagement({ root: ROOT, name: "acme" }).evidenceDir, engagementEvidenceDir({ dir: path.join(ROOT, "acme") }));
  assert.equal(selectEngagement({ root: ROOT, name: "globex" }).evidenceDir, engagementEvidenceDir({ dir: path.join(ROOT, "globex") }));
});

// 27 — cross-engagement evidence write refused (confinement)
await t("27 cross-engagement evidence write refused", () => {
  const acme = { dir: path.join(ROOT, "acme") };
  assert.throws(() => resolveEvidenceDir(acme, "../../globex/evidence/x.png"), (e) => e.code === "path-escape");
  assert.throws(() => resolveEvidenceDir(acme, path.join(ROOT, "globex", "evidence")), (e) => e.code === "path-escape");
});

// 28 — symlink escape from the evidence dir refused
await t("28 evidence symlink escape refused", () => {
  const engDir = path.join(ROOT, "acme");
  const evDir = engagementEvidenceDir({ dir: engDir }, { ensure: true });
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "sa-ev-out-"));
  const link = path.join(evDir, "exfil");
  try { fs.symlinkSync(outside, link); } catch { return; }
  assert.throws(() => resolveEvidenceDir({ dir: engDir }, "exfil/leak.png"), (e) => e.code === "path-escape");
  fs.unlinkSync(link);
});

// 29 — persistence after "restart": evidence written under the engagement survives a fresh resolve
await t("29 evidence persists across restart", () => {
  const engDir = path.join(ROOT, "globex");
  const evDir = resolveEvidenceDir({ dir: engDir }, null, { ensure: true });
  fs.writeFileSync(path.join(evDir, "finding.json"), JSON.stringify({ ok: true }));
  // simulate a new process: re-resolve from scratch via a fresh selection
  const reDir = selectEngagement({ root: ROOT, name: "globex" }).evidenceDir;
  assert.ok(fs.existsSync(path.join(reDir, "finding.json"))); // same dir, evidence intact
});

// 30 — Bridge gate: evidence-persisting op WITHOUT an active engagement is refused (before any session)
await t("30 bridge refuses evidence without engagement", () => withFetch(mkFetch(handlers("proj-A")), async () => {
  const b = createBridge();
  b.openInvestigation({ investigationId: "NOEV", scope: { allowHosts: ["app.lab"] }, allowedCapabilities: ["browser"] }); // no evidenceDir
  const r = await b.invoke({ investigationId: "NOEV", op: "browser.screenshot", params: { sessionId: "s1" } });
  assert.equal(r.ok, false); assert.equal(r.error.code, "evidence-no-engagement");
}));

// 31 — Bridge gate: evidence dir present → screenshot passes the evidence gate (then hits session check)
await t("31 bridge confines + passes gate with engagement", () => withFetch(mkFetch(handlers("proj-A")), async () => {
  const evDir = engagementEvidenceDir({ dir: path.join(ROOT, "acme") }, { ensure: true });
  const b = createBridge();
  b.openInvestigation({ investigationId: "EV", scope: { allowHosts: ["app.lab"] }, allowedCapabilities: ["browser"], evidenceDir: evDir });
  // path traversal in params.dir is refused by the evidence gate
  const esc = await b.invoke({ investigationId: "EV", op: "browser.screenshot", params: { sessionId: "s1", dir: "../../etc" } });
  assert.equal(esc.ok, false); assert.equal(esc.error.code, "evidence-path-escape");
  // a valid (default) dir passes the evidence gate and only then fails on the missing session
  const ok = await b.invoke({ investigationId: "EV", op: "browser.screenshot", params: { sessionId: "s1" } });
  assert.equal(ok.ok, false); assert.equal(ok.error.code, "session-not-in-investigation");
}));

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
console.log(`\n${n - fail}/${n} passed` + (fail ? ` (${fail} FAILED)` : ""));
process.exit(fail ? 1 : 0);
