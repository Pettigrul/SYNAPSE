// H2d-F1 — deterministic tests for Environment Preflight & Doctor.
// Fabricated env snapshots (no fs/network/LLM). Validates per-profile verdict logic, the "optional never
// blocks" rule (incl. native workflows = PLANNED/V2), and the no-LLM/no-offensive invariants.

import assert from "node:assert";
import { runPreflight, collectEnv, PROFILES, CHECKS, STATUSES } from "./preflight.mjs";
import { runDoctor } from "./doctor.mjs";

let n = 0, fail = 0;
const okT = (s) => { n++; console.log(`  ok  ${s}`); };
const badT = (s, e) => { n++; fail++; console.log(`FAIL  ${s}: ${e && e.stack || e}`); };
function t(s, fn) { try { fn(); okT(s); } catch (e) { badT(s, e); } }

// A fully-healthy env snapshot; override per test.
function fullEnv(over = {}) {
  return {
    root: "/repo", platform: "win32", node: "v20.0.0", windows: true,
    files: { skill: true, validator: true, manifest: true, bridge: true, workspace: true, patternIndex: true },
    kb: { skillDirs: 15, validator: true, manifest: true },
    policies: ["authorization-gate.md", "native-tooling-doctrine.md", "verification-contract.md"],
    adapters: ["antigravity.md", "claude-code.md", "pi-agent.md"],
    runtimes: { claudeCode: true, pi: false, antigravity: false },
    extensions: { claudeHook: true },
    browser: { playwright: true, channel: "chrome" },
    caido: { baseUrl: true, token: true, projectId: true, projectIdCompat: true },
    engagement: { selected: true, root: "C:/eng", name: "acme", dir: "C:/eng/acme", managed: true, caidoProjectId: "proj-1", caidoProjectSource: "engagement" },
    workspace: { tool: true, engagementRoot: "C:/eng" },
    scope: { present: true },
    evidence: { dir: "C:/eng/acme/evidence", source: "engagement", writable: true },
    mcp: { github: true, confluence: true },
    optional: { stride: true, nativeWorkflows: false },
    ...over,
  };
}

// 1 — healthy env + full-engagement (minus nativeWorkflows) → not BLOCKED
t("1 healthy env never BLOCKED", () => {
  const r = runPreflight(fullEnv(), { profile: "full-engagement" });
  assert.notEqual(r.verdict, "BLOCKED");
});

// 2 — core-lab READY with minimal (no caido/browser/workspace needed)
t("2 core-lab READY minimal", () => {
  const e = fullEnv({ caido: { baseUrl: false, token: false, projectId: false }, browser: { playwright: true, channel: null }, workspace: { tool: true, engagementRoot: "C:/eng" } });
  const r = runPreflight(e, { profile: "core-lab" });
  // core-lab required = runtimes,kb,policies,executionContext,evidence; optionals all ok here → READY
  assert.equal(r.verdict, "READY");
});

// 3 — missing REQUIRED (kb) → BLOCKED
t("3 missing required kb → BLOCKED", () => {
  const r = runPreflight(fullEnv({ kb: { skillDirs: 0, validator: false, manifest: false } }), { profile: "core-lab" });
  assert.equal(r.verdict, "BLOCKED"); assert.ok(r.blockers.includes("kb"));
});

// 4 — missing policies → BLOCKED (error on required)
t("4 missing policies → BLOCKED", () => {
  const r = runPreflight(fullEnv({ policies: [] }), { profile: "core-lab" });
  assert.equal(r.verdict, "BLOCKED"); assert.ok(r.blockers.includes("policies"));
});

// 5 — caido-native: missing caido config → BLOCKED (required for this profile)
t("5 caido-native missing caido → BLOCKED", () => {
  const r = runPreflight(fullEnv({ caido: { baseUrl: false, token: false, projectId: false } }), { profile: "caido-native" });
  assert.equal(r.verdict, "BLOCKED"); assert.ok(r.blockers.includes("caido"));
});

// 6 — caido-native: native workflows PLANNED does NOT block (DEGRADED at worst)
t("6 native workflows never block caido-native", () => {
  const r = runPreflight(fullEnv(), { profile: "caido-native" });
  const wf = r.checks.find((c) => c.id === "nativeWorkflows");
  assert.equal(wf.status, "planned"); assert.equal(wf.required, false);
  assert.notEqual(r.verdict, "BLOCKED"); // planned optional -> DEGRADED, never BLOCKED
  assert.equal(r.verdict, "DEGRADED");
});

// 7 — optional MCP missing → DEGRADED, not BLOCKED
t("7 optional missing → DEGRADED", () => {
  const r = runPreflight(fullEnv({ mcp: { github: false, confluence: false } }), { profile: "caido-native" });
  assert.equal(r.verdict, "DEGRADED"); assert.ok(!r.blockers.length);
});

// 8 — browser absent → DEGRADED (optional; HTTP fallback), never BLOCKED
t("8 browser absent → DEGRADED", () => {
  const r = runPreflight(fullEnv({ browser: { playwright: false, channel: null } }), { profile: "core-lab" });
  assert.equal(r.verdict, "DEGRADED");
  assert.equal(r.checks.find((c) => c.id === "browser").status, "degraded");
});

// 9 — engagement evidence dir not writable → BLOCKED (required in caido-native)
t("9 evidence not writable → BLOCKED", () => {
  const r = runPreflight(fullEnv({ evidence: { dir: "C:/eng/acme/evidence", source: "engagement", writable: false } }), { profile: "caido-native" });
  assert.equal(r.verdict, "BLOCKED"); assert.ok(r.blockers.includes("evidence"));
});

// 10 — full-engagement requires scope; missing → BLOCKED
t("10 full-engagement missing scope → BLOCKED", () => {
  const r = runPreflight(fullEnv({ scope: { present: false } }), { profile: "full-engagement" });
  assert.equal(r.verdict, "BLOCKED"); assert.ok(r.blockers.includes("scope"));
});

// 11 — no runtime but adapter docs → runtimes degraded → DEGRADED (not BLOCKED)
t("11 no runtime, adapter docs → DEGRADED", () => {
  const r = runPreflight(fullEnv({ runtimes: { claudeCode: false, pi: false, antigravity: false } }), { profile: "core-lab" });
  assert.equal(r.checks.find((c) => c.id === "runtimes").status, "degraded");
  assert.equal(r.verdict, "DEGRADED");
});

// 12 — no runtime AND no adapter docs → runtimes missing → BLOCKED
t("12 no runtime, no docs → BLOCKED", () => {
  const r = runPreflight(fullEnv({ runtimes: { claudeCode: false, pi: false, antigravity: false }, adapters: [] }), { profile: "core-lab" });
  assert.equal(r.verdict, "BLOCKED"); assert.ok(r.blockers.includes("runtimes"));
});

// 13 — unknown profile throws
t("13 unknown profile throws", () => {
  assert.throws(() => runPreflight(fullEnv(), { profile: "nope" }), /unknown profile/);
});

// 14 — verdict vocabulary + statuses valid
t("14 verdict + status vocab", () => {
  const r = runPreflight(fullEnv(), { profile: "caido-native" });
  assert.ok(["READY", "DEGRADED", "BLOCKED"].includes(r.verdict));
  for (const c of r.checks) assert.ok(STATUSES.includes(c.status), `bad status ${c.status}`);
});

// 15 — invariants: no LLM, no offensive ops flags present and false-by-design
t("15 no LLM / no offensive invariants", () => {
  const r = runPreflight(fullEnv(), { profile: "caido-native" });
  assert.equal(r.llmUsed, false); assert.equal(r.offensiveOps, false);
});

// 16 — partial caido config → degraded (caido-native: required degraded → DEGRADED not BLOCKED)
t("16 partial caido config → DEGRADED", () => {
  const r = runPreflight(fullEnv({ caido: { baseUrl: true, token: false, projectId: true } }), { profile: "caido-native" });
  assert.equal(r.checks.find((c) => c.id === "caido").status, "degraded");
  assert.equal(r.verdict, "DEGRADED"); assert.ok(!r.blockers.length);
});

// 17 — Doctor is informational: facts + hints, no verdict, no LLM/offense
t("17 doctor informational", () => {
  const d = runDoctor(fullEnv({ caido: { baseUrl: false, token: false, projectId: false } }));
  assert.equal(d.kind, "doctor"); assert.equal(d.verdict, undefined);
  assert.ok(Array.isArray(d.hints) && d.hints.some((h) => /Caido instance not fully configured/.test(h)));
  assert.equal(d.llmUsed, false); assert.equal(d.offensiveOps, false);
});

// 18 — real collectEnv runs on this repo without throwing and yields a sane snapshot
t("18 collectEnv on real repo", () => {
  const e = collectEnv();
  assert.ok(typeof e.node === "string");
  assert.equal(e.policies.length, 3);       // the 3 real policy files
  assert.ok(e.kb.skillDirs >= 10);          // 15 KB categories
  assert.equal(e.files.bridge, true);       // bridge.mjs present
  const r = runPreflight(e, { profile: "core-lab" });
  assert.ok(["READY", "DEGRADED", "BLOCKED"].includes(r.verdict)); // deterministic, structural
});

// 19 — profiles well-formed (every referenced check exists)
t("19 profiles reference real checks", () => {
  for (const [name, def] of Object.entries(PROFILES)) for (const id of [...def.required, ...def.optional]) assert.ok(CHECKS[id], `${name} references missing check ${id}`);
});

// --- multi-engagement project binding (pre-pilot) ---

// 20 — caido-native: engagement selected but NO project bound → caidoProject missing → BLOCKED
t("20 unbound engagement → BLOCKED", () => {
  const e = fullEnv({ engagement: { selected: true, name: "acme", dir: "C:/eng/acme", managed: true, caidoProjectId: null, caidoProjectSource: null } });
  const r = runPreflight(e, { profile: "caido-native" });
  assert.equal(r.verdict, "BLOCKED"); assert.ok(r.blockers.includes("caidoProject"));
  const cp = r.checks.find((c) => c.id === "caidoProject");
  assert.ok(/workspace associate/.test(cp.detail)); // actionable
});

// 21 — binding comes from the engagement: no global CAIDO_PROJECT_ID needed
t("21 engagement binding independent of global projectId", () => {
  const e = fullEnv({ caido: { baseUrl: true, token: true, projectId: false, projectIdCompat: false } }); // no global
  const r = runPreflight(e, { profile: "caido-native" });
  assert.notEqual(r.verdict, "BLOCKED"); // engagement proj-1 binds it
  assert.equal(r.checks.find((c) => c.id === "caidoProject").status, "ok");
  assert.equal(r.checks.find((c) => c.id === "caido").status, "ok"); // instance config independent of project
});

// 22 — compat: no active engagement but CAIDO_PROJECT_ID set → DEGRADED, not BLOCKED
t("22 global projectId compat → DEGRADED", () => {
  const e = fullEnv({ engagement: { selected: false, name: null, dir: null, managed: false, caidoProjectId: null, caidoProjectSource: null } });
  const r = runPreflight(e, { profile: "caido-native" });
  // workspace degraded (no active engagement) + caidoProject degraded (compat) → DEGRADED, no blockers
  assert.equal(r.verdict, "DEGRADED"); assert.ok(!r.blockers.length);
  assert.equal(r.checks.find((c) => c.id === "caidoProject").status, "degraded");
});

// 23 — no active engagement AND no compat → caidoProject missing → BLOCKED
t("23 no engagement, no compat → BLOCKED", () => {
  const e = fullEnv({
    caido: { baseUrl: true, token: true, projectId: false, projectIdCompat: false },
    engagement: { selected: false, name: null, dir: null, managed: false, caidoProjectId: null, caidoProjectSource: null },
  });
  const r = runPreflight(e, { profile: "caido-native" });
  assert.equal(r.verdict, "BLOCKED"); assert.ok(r.blockers.includes("caidoProject"));
});

// 24 — engagement root set but no active engagement → workspace degraded (not error/blocker)
t("24 root set, no active engagement → workspace degraded", () => {
  const e = fullEnv({ engagement: { selected: false, name: null, dir: null, managed: false, caidoProjectId: null, caidoProjectSource: null } });
  assert.equal(CHECKS.workspace(e).status, "degraded");
});

// 25 — env-compat binding on a selected engagement is honored but flagged degraded (bind it properly)
t("25 env-compat source flagged degraded", () => {
  const e = fullEnv({ engagement: { selected: true, name: "acme", dir: "C:/eng/acme", managed: true, caidoProjectId: "proj-env", caidoProjectSource: "env-compat" } });
  assert.equal(CHECKS.caidoProject(e).status, "degraded");
});

// --- per-engagement evidence directory ---

// 26 — evidence resolves to the active engagement (source=engagement), not /tmp
t("26 evidence source = engagement", () => {
  const cp = CHECKS.evidence(fullEnv());
  assert.equal(cp.status, "ok"); assert.ok(/engagement evidence dir/.test(cp.detail) && /acme\/evidence/.test(cp.detail));
});

// 27 — no active engagement: evidence has no destination → missing; optional in core-lab (DEGRADED, not BLOCKED)
t("27 no engagement → evidence missing, core-lab DEGRADED", () => {
  const e = fullEnv({ engagement: { selected: false, name: null, dir: null, managed: false, caidoProjectId: null, caidoProjectSource: null }, evidence: { dir: null, source: null, writable: false } });
  assert.equal(CHECKS.evidence(e).status, "missing");
  const r = runPreflight(e, { profile: "core-lab" });
  assert.equal(r.verdict, "DEGRADED"); assert.ok(!r.blockers.includes("evidence")); // optional in core-lab
});

// 28 — legacy SA_EVIDENCE_DIR honored ONLY without an engagement → degraded (never overrides engagement)
t("28 legacy evidence compat → degraded", () => {
  const e = fullEnv({ engagement: { selected: false, name: null, dir: null, managed: false, caidoProjectId: null, caidoProjectSource: null }, evidence: { dir: "/legacy/ev", source: "legacy-env", writable: true } });
  assert.equal(CHECKS.evidence(e).status, "degraded");
});

console.log(`\n${n - fail}/${n} passed` + (fail ? ` (${fail} FAILED)` : ""));
process.exit(fail ? 1 : 0);
