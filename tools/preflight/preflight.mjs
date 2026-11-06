// SecurityAuditor — Environment Preflight (H2d-F1).
//
// A DETERMINISTIC, OFFLINE environment check for Windows-corporate (and any) deployment. Runs WITHOUT
// an LLM and WITHOUT any offensive operation: every check reads local structure/config only — it never
// sends a request to a target, never launches a browser, never calls Caido. Produces a per-profile
// verdict READY / DEGRADED / BLOCKED. Optional dependencies (GitHub/Confluence/STRIDE and NATIVE
// WORKFLOW GENERATION — the latter is post-MVP/V2, PLANNED) NEVER cause BLOCKED; at worst DEGRADED.
// Node stdlib only, ZERO deps. The impure `collectEnv()` gathers a snapshot; the checks are pure over it,
// so tests inject fabricated snapshots.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEngagement, resolveProjectId, getActiveEngagement, resolveSessionId, validateScope, EVIDENCE_DIR } from "../workspace/engagement.mjs";

export const PREFLIGHT_SCHEMA = 1;
export const VERDICTS = Object.freeze(["READY", "DEGRADED", "BLOCKED"]);
// Per-check status vocabulary. ok = present/usable; degraded = usable with reduced capability;
// missing = absent; error = present-but-broken; planned = intentionally-not-implemented (optional only);
// skipped = not applicable to this profile.
export const STATUSES = Object.freeze(["ok", "degraded", "missing", "error", "planned", "skipped"]);

function repoRoot() { return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."); }
function exists(root, rel) { try { return fs.existsSync(path.join(root, rel)); } catch { return false; } }
function onPath(env, platform, ...names) {
  const exts = platform === "win32" ? String(env.PATHEXT || ".EXE;.CMD;.BAT").split(";") : [""];
  return String(env.PATH || env.Path || "").split(path.delimiter).filter(Boolean)
    .some((d) => names.some((n) => exts.some((x) => { try { return fs.statSync(path.join(d, n + x)).isFile(); } catch { return false; } })));
}
function countDirs(root, rel) { try { return fs.readdirSync(path.join(root, rel), { withFileTypes: true }).filter((d) => d.isDirectory()).length; } catch { return 0; } }

// ---- environment snapshot (the only impure part) ---------------------------
export function collectEnv({ root = repoRoot(), env = process.env, platform = os.platform(), node = process.version } = {}) {
  const pkg = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, "tools/web-runtime/package.json"), "utf8")); } catch { return null; } })();
  const engagement = resolveActiveEngagement(env);
  return {
    root, platform, node,
    windows: platform === "win32",
    files: {
      skill: exists(root, "SKILL.md"),
      validator: exists(root, "docs/architecture-review/validate_h0.mjs"),
      manifest: exists(root, "docs/architecture-review/baseline/manifest.json"),
      bridge: exists(root, "tools/web-runtime/bridge.mjs"),
      workspace: exists(root, "tools/workspace/engagement.mjs"),
      patternIndex: exists(root, "references/pattern-index.md"),
    },
    kb: { skillDirs: countDirs(root, "skills"), validator: exists(root, "docs/architecture-review/validate_h0.mjs"), manifest: exists(root, "docs/architecture-review/baseline/manifest.json") },
    policies: ["authorization-gate.md", "native-tooling-doctrine.md", "verification-contract.md"].filter((p) => exists(root, `policies/${p}`)),
    adapters: ["antigravity.md", "claude-code.md", "pi-agent.md"].filter((a) => exists(root, `adapters/${a}`)),
    // Runtime = a binary or home the host actually has. Harness files (.claude/settings.json) prove nothing: see `extensions`.
    runtimes: { claudeCode: !!env.CLAUDECODE || onPath(env, platform, "claude"), pi: !!(env.PI_AGENT_HOME || env.PI_CODING_AGENT_DIR) || onPath(env, platform, "pi"), antigravity: !!env.ANTIGRAVITY_HOME || onPath(env, platform, "agy", "antigravity") },
    extensions: { claudeHook: exists(root, ".claude/hooks") || exists(root, ".claude/settings.json") },
    browser: { playwright: !!(pkg && pkg.dependencies && pkg.dependencies["playwright-core"]), channel: env.SA_BROWSER_CHANNEL || null },
    // Caido INSTANCE config (baseUrl + token). projectId is NO LONGER a mandatory global — it is bound
    // per engagement (projectIdCompat = presence of the single-engagement CAIDO_PROJECT_ID compat fallback).
    caido: { baseUrl: !!env.CAIDO_BASE_URL, token: !!env.CAIDO_TOKEN, projectId: !!env.CAIDO_PROJECT_ID, projectIdCompat: !!env.CAIDO_PROJECT_ID },
    engagement,
    workspace: { tool: exists(root, "tools/workspace/engagement.mjs"), engagementRoot: env.SA_ENGAGEMENT_ROOT || null },
    scope: { present: !!(engagement && engagement.dir && fs.existsSync(path.join(engagement.dir, "scope.md")) && validateScope(path.join(engagement.dir, "scope.md")).ok) },
    // Persistent AUDIT evidence lives in the ACTIVE engagement (<engagement>/evidence). Legacy SA_EVIDENCE_DIR
    // is honored ONLY when NO engagement is active (safe, delimited) and NEVER overrides the active engagement.
    evidence: resolveEvidenceConfig(env, engagement),
    mcp: { github: !!env.GITHUB_MCP, confluence: !!env.CONFLUENCE_MCP },
    optional: { stride: !!env.SA_STRIDE_ENABLED, nativeWorkflows: false }, // nativeWorkflows: V2/PLANNED (F5b) — always optional
  };
}
function tryWritable(dir) { try { const t = path.join(dir, `.sa-preflight-${process.pid}`); fs.writeFileSync(t, "x"); fs.unlinkSync(t); return true; } catch { return false; } }

// Resolve the AUDIT evidence directory: the active engagement's <dir>/evidence (writable ⇔ the engagement
// dir accepts a probe; the evidence/ dir is created lazily on first real write, so we do NOT create it here).
// Legacy SA_EVIDENCE_DIR applies ONLY when no engagement is active; it never overrides an engagement.
function resolveEvidenceConfig(env, engagement) {
  if (engagement && engagement.dir) {
    return { dir: path.join(engagement.dir, EVIDENCE_DIR), source: "engagement", writable: tryWritable(engagement.dir) };
  }
  if (env.SA_EVIDENCE_DIR) return { dir: env.SA_EVIDENCE_DIR, source: "legacy-env", writable: tryWritable(env.SA_EVIDENCE_DIR) };
  return { dir: null, source: null, writable: false };
}

// Resolve the ACTIVE engagement offline, deriving the bound Caido project from its manifest. Selection
// precedence: SA_ENGAGEMENT override > per-session pointer (.sa-state) > none. Global CAIDO_PROJECT_ID is
// only a single-engagement compat fallback. Deterministic; never picks an engagement implicitly.
function resolveActiveEngagement(env) {
  const root = env.SA_ENGAGEMENT_ROOT || null;
  const active = getActiveEngagement({ root, env, sessionId: resolveSessionId({ env }) });
  const base = { selected: !!active.name, source: active.source, root, name: active.name || null, dir: active.dir || null, managed: false, caidoProjectId: null, caidoProjectSource: null };
  if (!active.name || !active.dir) return base; // none, or an unresolved override/stale pointer
  try {
    const eng = loadEngagement({ dir: active.dir });
    base.managed = eng.kind === "managed";
    const r = resolveProjectId(eng, { envProjectId: env.CAIDO_PROJECT_ID || null });
    base.caidoProjectId = r.projectId; base.caidoProjectSource = r.source;
  } catch { /* unresolved — surfaced as missing/degraded by the checks */ }
  return base;
}

// ---- checks (pure over the snapshot) ---------------------------------------
const C = (id, label, status, detail) => ({ id, label, status, detail });

export const CHECKS = Object.freeze({
  runtimes: (e) => {
    const n = ["claudeCode", "pi", "antigravity"].filter((r) => e.runtimes[r]);
    if (n.length) return C("runtimes", "Agent runtime detected", "ok", `detected: ${n.join(", ")}`);
    if (e.adapters.length) return C("runtimes", "Agent runtime", "degraded", `no runtime detected; adapter docs present (${e.adapters.length})`);
    return C("runtimes", "Agent runtime", "missing", "no runtime detected and no adapter docs");
  },
  extensions: (e) => e.extensions.claudeHook ? C("extensions", "Runtime extension/hook", "ok", "Claude Code hook/settings present")
    : C("extensions", "Runtime extension/hook", "degraded", "no reinforcing hook; KB-consult rule stands on its own"),
  kb: (e) => {
    if (!e.kb.manifest || !e.kb.validator) return C("kb", "Knowledge Base", "error", "validator/manifest missing");
    if (e.kb.skillDirs < 1) return C("kb", "Knowledge Base", "missing", "no skills/ categories");
    return C("kb", "Knowledge Base", "ok", `${e.kb.skillDirs} categories; run validate_h0.mjs for 127/127`);
  },
  policies: (e) => e.policies.length === 3 ? C("policies", "Policies", "ok", e.policies.join(", "))
    : C("policies", "Policies", e.policies.length ? "degraded" : "error", `found ${e.policies.length}/3`),
  executionContext: (e) => e.files.bridge ? C("executionContext", "Capability Bridge / Execution Context", "ok", "bridge.mjs present (operator provisions ctx at runtime)")
    : C("executionContext", "Capability Bridge / Execution Context", "error", "bridge.mjs missing"),
  scope: (e) => e.scope.present ? C("scope", "Engagement scope", "ok", "active engagement has a structurally valid scope.md")
    : C("scope", "Engagement scope", "missing", "no active engagement with a valid scope.md (scope.md per engagement)"),
  browser: (e) => e.browser.playwright ? C("browser", "Browser Runtime", "ok", `playwright-core present${e.browser.channel ? `; channel ${e.browser.channel}` : ""}`)
    : C("browser", "Browser Runtime", "degraded", "no playwright-core; HTTP fallback only (no false auth)"),
  // Caido INSTANCE config only (baseUrl + token). The project binding is a SEPARATE check.
  caido: (e) => {
    const n = ["baseUrl", "token"].filter((k) => e.caido[k]);
    if (n.length === 2) return C("caido", "Caido instance config", "ok", "baseUrl/token configured (values not read)");
    if (n.length) return C("caido", "Caido instance config", "degraded", `partial instance config: ${n.join(", ")}`);
    return C("caido", "Caido instance config", "missing", "no Caido instance config (env CAIDO_BASE_URL/CAIDO_TOKEN)");
  },
  // Project↔engagement binding: derived from the ACTIVE engagement's manifest (not a mandatory global).
  caidoProject: (e) => {
    const eng = e.engagement || {};
    if (eng.selected && eng.caidoProjectId && eng.caidoProjectSource === "engagement")
      return C("caidoProject", "Caido project binding", "ok", `engagement '${eng.name}' → project ${eng.caidoProjectId}`);
    if (eng.selected && eng.caidoProjectId && eng.caidoProjectSource === "env-compat")
      return C("caidoProject", "Caido project binding", "degraded", `engagement '${eng.name}' unbound; using CAIDO_PROJECT_ID compat (bind it: workspace associate)`);
    if (eng.selected && !eng.caidoProjectId)
      return C("caidoProject", "Caido project binding", "missing", `engagement '${eng.name}' has no associated Caido project — run: workspace associate --name ${eng.name} --project-id <id>`);
    if (e.caido && e.caido.projectIdCompat)
      return C("caidoProject", "Caido project binding", "degraded", "no active engagement; CAIDO_PROJECT_ID compat only (single-engagement)");
    return C("caidoProject", "Caido project binding", "missing", "no active engagement (set SA_ENGAGEMENT) and no project associated");
  },
  workspace: (e) => {
    if (!e.workspace.tool) return C("workspace", "Pentest Engagement Workspace", "error", "tools/workspace missing");
    if (!e.workspace.engagementRoot) return C("workspace", "Pentest Engagement Workspace", "missing", "no SA_ENGAGEMENT_ROOT (base dir for engagements)");
    const eng = e.engagement || {};
    if (!eng.selected) return C("workspace", "Pentest Engagement Workspace", "degraded", "engagement root set; no active engagement (set SA_ENGAGEMENT)");
    if (!eng.managed) return C("workspace", "Pentest Engagement Workspace", "degraded", `active engagement '${eng.name}' not found/managed under the root`);
    return C("workspace", "Pentest Engagement Workspace", "ok", `active engagement '${eng.name}'`);
  },
  // Persistent AUDIT evidence lives in the active engagement (<engagement>/evidence). No engagement ⇒ no
  // destination (persisting ops will be refused at write time). Legacy SA_EVIDENCE_DIR only when no engagement.
  evidence: (e) => {
    const ev = e.evidence || {};
    if (ev.source === "engagement") return ev.writable
      ? C("evidence", "Evidence directory", "ok", `engagement evidence dir (created on first write): ${ev.dir}`)
      : C("evidence", "Evidence directory", "error", `engagement dir NOT writable (cannot create evidence/): ${ev.dir}`);
    if (ev.source === "legacy-env") return ev.writable
      ? C("evidence", "Evidence directory", "degraded", `legacy SA_EVIDENCE_DIR (no active engagement): ${ev.dir} — prefer per-engagement evidence (select one)`)
      : C("evidence", "Evidence directory", "error", `legacy SA_EVIDENCE_DIR not writable: ${ev.dir}`);
    return C("evidence", "Evidence directory", "missing", "no active engagement — persistent evidence has no destination (select one: workspace cli use)");
  },
  // --- optional dependencies (never BLOCK) ---
  mcpGithub: (e) => e.mcp.github ? C("mcpGithub", "GitHub MCP (optional)", "ok", "configured") : C("mcpGithub", "GitHub MCP (optional)", "missing", "not configured (Black Box unaffected)"),
  mcpConfluence: (e) => e.mcp.confluence ? C("mcpConfluence", "Confluence MCP (optional)", "ok", "configured") : C("mcpConfluence", "Confluence MCP (optional)", "missing", "not configured"),
  stride: (e) => e.optional.stride ? C("stride", "STRIDE threat modeling (optional)", "ok", "enabled") : C("stride", "STRIDE threat modeling (optional)", "missing", "not enabled (H2c-F2+)"),
  nativeWorkflows: () => C("nativeWorkflows", "Native Caido workflow generation (optional)", "planned", "post-MVP/V2 (H2b-F5b); offline F5a generation/validation available; does NOT block caido-native"),
});

// ---- profiles: which checks are REQUIRED vs OPTIONAL ------------------------
export const PROFILES = Object.freeze({
  "core-lab": {
    // evidence is OPTIONAL here: core-lab may run read-only/discovery without an engagement; persistence is
    // refused at write time if none is selected (→ DEGRADED, actionable, never a silent /tmp dump).
    required: ["runtimes", "kb", "policies", "executionContext"],
    optional: ["extensions", "browser", "workspace", "evidence"],
  },
  "caido-native": {
    required: ["runtimes", "kb", "policies", "executionContext", "evidence", "caido", "workspace", "caidoProject"],
    optional: ["extensions", "browser", "mcpGithub", "mcpConfluence", "stride", "nativeWorkflows"],
  },
  "full-engagement": {
    required: ["runtimes", "kb", "policies", "executionContext", "evidence", "caido", "workspace", "caidoProject", "scope"],
    optional: ["extensions", "browser", "mcpGithub", "mcpConfluence", "stride", "nativeWorkflows"],
  },
});

// ---- verdict logic ---------------------------------------------------------
// BLOCKED: a REQUIRED check is missing/error. DEGRADED: a required check is degraded, OR any optional
// check is not ok (missing/degraded/planned). READY: all required ok and all optional ok.
export function runPreflight(env, { profile = "core-lab" } = {}) {
  const def = PROFILES[profile];
  if (!def) throw new Error(`unknown profile: ${profile} (valid: ${Object.keys(PROFILES).join(", ")})`);
  const results = [];
  const run = (ids, required) => ids.map((id) => { const r = CHECKS[id](env); r.required = required; results.push(r); return r; });
  const req = run(def.required, true);
  const opt = run(def.optional, false);

  const blockers = req.filter((r) => r.status === "missing" || r.status === "error");
  let verdict;
  if (blockers.length) verdict = "BLOCKED";
  else if (req.some((r) => r.status === "degraded") || opt.some((r) => r.status !== "ok")) verdict = "DEGRADED";
  else verdict = "READY";

  return {
    schema: PREFLIGHT_SCHEMA, profile, verdict,
    platform: env.platform, node: env.node, windows: !!env.windows,
    blockers: blockers.map((b) => b.id),
    degraded: results.filter((r) => r.status === "degraded" || (!r.required && r.status !== "ok")).map((r) => r.id),
    checks: results,
    summary: summarize(profile, verdict, results),
    llmUsed: false, offensiveOps: false, // invariants: Preflight is deterministic, no LLM, no attack
  };
}

function summarize(profile, verdict, results) {
  const ok = results.filter((r) => r.status === "ok").length;
  return `[${verdict}] profile=${profile} — ${ok}/${results.length} checks ok` +
    (verdict === "BLOCKED" ? `; blocked by: ${results.filter((r) => r.required && (r.status === "missing" || r.status === "error")).map((r) => r.id).join(", ")}` : "") +
    (verdict === "DEGRADED" ? "; optional/degraded capabilities reduced (not blocking)" : "");
}

export function preflight(opts = {}) { return runPreflight(collectEnv(opts.envOpts || {}), opts); }
