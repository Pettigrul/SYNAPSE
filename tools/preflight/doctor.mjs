// SecurityAuditor — HackBot Doctor (H2d-F1).
//
// INFORMATIONAL environment diagnosis — facts only, NO verdict and NO gating (that is Preflight's job).
// Deterministic, offline, no LLM, no offensive ops. Helps an operator troubleshoot a Windows-corporate
// install by reporting what is detected and where. Node stdlib only.

import fs from "node:fs";
import path from "node:path";
import { collectEnv } from "./preflight.mjs";
import { statusActivation, auditRuntimeConfig, cleanForDisplay } from "../activation/activate.mjs";
import { resolveProjectContext, resolveSessionId, noContextHelp, engagementConflictHelp } from "../workspace/engagement.mjs";

// Discoverable operational skills = dirs under <root>/.claude/skills that carry a SKILL.md. INFORMATIONAL only
// (a troubleshooting aid for R5 — it does NOT prove Claude Code's live slash-command discovery, which happens
// at session start). Lets the operator confirm the skill exists and see the EXACT name (e.g. /modo, not /mode).
function claudeSkills(root) {
  try {
    const dir = path.join(root, ".claude", "skills");
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, "SKILL.md")))
      .map((d) => d.name).sort();
  } catch { return []; }
}

export function runDoctor(env) {
  const skills = claudeSkills(env.root);
  const facts = {
    node: env.node, platform: env.platform, windows: !!env.windows, root: env.root,
    runtimes: Object.entries(env.runtimes).filter(([, v]) => v).map(([k]) => k),
    adapterDocs: env.adapters,
    activation: (() => { const s = statusActivation({ projectDir: process.cwd() }); return s.activated ? `${cleanForDisplay(s.projectDir)} (declared: ${cleanForDisplay(s.runtimes.join(", "))}; healthy: ${s.healthy}; caido opt-in: ${s.caido})` : s.corrupt ? s.help : "(cwd is not an activated project)"; })(),
    sessionContext: (() => { const c = resolveProjectContext(); let s = null; try { s = resolveSessionId(); } catch { /* unusable SA_SESSION_ID: no session */ } return `${c.kind}${c.dir ? ` ${c.dir}` : ""}; session ${s || "(none)"}`; })(),
    runtimeConfigReview: (() => { const f = auditRuntimeConfig({ projectDir: resolveProjectContext().dir || process.cwd() }); return f.length ? f.map((x) => x.path).join(", ") : "(no project-supplied runtime config found)"; })(),
    bridgeByRuntime: "pi: native tools (extension, operator contexts); antigravity: no stateful adapter, adapters/cli.mjs http.* only; claude-code: no native tool path (see adapters/)",
    claudeSkills: skills.length ? `${skills.length}: ${skills.join(", ")}` : "(none under .claude/skills)",
    kb: { categories: env.kb.skillDirs, validator: env.kb.validator, manifest: env.kb.manifest },
    policies: env.policies,
    bridge: env.files.bridge,
    workspaceTool: env.workspace.tool,
    engagementRoot: env.workspace.engagementRoot || "(none selected)",
    activeEngagement: env.engagement && env.engagement.selected ? `${env.engagement.name} (via ${env.engagement.source || "?"})${env.engagement.managed ? "" : " — NOT managed/found"}` : "(none — select with: workspace cli use --name <n>)",
    caidoProjectBinding: env.engagement && env.engagement.caidoProjectId ? `${cleanForDisplay(env.engagement.caidoProjectId)} (via ${env.engagement.caidoProjectSource})` : "(none — associate a project)",
    browser: env.browser.playwright ? `playwright-core${env.browser.channel ? ` + channel ${env.browser.channel}` : " (channel auto-detect at runtime)"}` : "none (HTTP fallback)",
    caidoInstanceConfig: ["baseUrl", "token"].filter((k) => env.caido[k]),
    evidenceDir: env.evidence.dir
      ? `${env.evidence.dir} [${env.evidence.source}] (${env.evidence.writable ? "writable" : "NOT writable"})`
      : "(none — select an engagement; persistent evidence lives in <engagement>/evidence)",
    optionalMcp: ["github", "confluence", "atlassian", "stride"].filter((k) => env.mcp[k]),
    mcpServers: (env.mcp.servers || []), // NAMES only (from mcp-adapter.json); never any value. (Operators: a server NAME is surfaced here/in logs — do not embed a secret in a server's name.)
    orchestration: (() => {
      const o = env.orchestration || {};
      const parts = [];
      if (env.runtimes.claudeCode) parts.push(`claude-code:${o.claudeCode ? "native" : "none"}`);
      if (env.runtimes.pi) parts.push(`pi:${o.pi ? "pi-subagents" : "absent"}`);
      if (env.runtimes.antigravity) parts.push("antigravity:own-mechanism");
      return parts.length ? parts.join(", ") : "(no runtime)";
    })(),
    agentsSkills: (() => { const a = env.agentsSkills || {}; return !a.present ? "(none)" : a.broken && a.broken.length ? `${a.broken.length}/${a.total} UNRESOLVED (run materialize-agents-skills.mjs): ${a.broken.join(", ")}` : `${a.total} resolve`; })(),
    nativeWorkflows: "post-MVP/V2 (optional); offline F5a available",
  };
  return { schema: 1, kind: "doctor", facts, hints: hints(env), llmUsed: false, offensiveOps: false };
}

function hints(env) {
  const h = [];
  if (!env.runtimes.claudeCode && !env.runtimes.pi && !env.runtimes.antigravity) h.push("No agent runtime detected — install/point one of Pi, Claude Code or Antigravity (see adapters/).");
  if (!env.browser.playwright) h.push("No playwright-core — visual Browser Runtime unavailable; HTTP fallback only. Chrome/Edge must be installed; the runtime never downloads a browser.");
  if (!env.caido.baseUrl || !env.caido.token) h.push("Caido instance not fully configured — set CAIDO_BASE_URL / CAIDO_TOKEN (store the PAT in an env var or an ACL-restricted user file, never in the repo).");
  if (!env.workspace.engagementRoot) h.push("No engagement base dir — set SA_ENGAGEMENT_ROOT to a directory OUTSIDE this repo.");
  if (env.engagement && env.engagement.conflict) h.push(engagementConflictHelp(env.engagement.conflict));
  else if (env.workspace.engagementRoot && env.engagement && env.engagement.noContext) h.push(`No project context here: ${noContextHelp()}. A selection never carries over between projects.`);
  else if (env.workspace.engagementRoot && !(env.engagement && env.engagement.selected)) h.push("No active engagement — select one for this session: node tools/workspace/cli.mjs use --name <name> (list: cli.mjs list). SA_ENGAGEMENT selects only outside an activated project.");
  if (env.engagement && env.engagement.selected && !env.engagement.caidoProjectId) h.push(`Active engagement '${env.engagement.name}' has no Caido project — associate one: node tools/workspace/cli.mjs associate --name ${env.engagement.name} --project-id <id> (discover with: cli.mjs projects).`);
  if (env.evidence.source === "engagement" && !env.evidence.writable) h.push(`Engagement dir not writable — cannot create ${env.evidence.dir}; fix permissions on the engagement directory.`);
  if (!env.evidence.dir) h.push("No evidence destination — persistent evidence (screenshots, captures) requires an active engagement; select one: node tools/workspace/cli.mjs use --name <name>.");
  if (env.evidence.source === "legacy-env") h.push("Using legacy SA_EVIDENCE_DIR (no active engagement) — prefer per-engagement evidence by selecting an engagement; SA_EVIDENCE_DIR never overrides an active engagement.");
  if (env.agentsSkills && env.agentsSkills.present && env.agentsSkills.broken && env.agentsSkills.broken.length) h.push(".agents/skills has unresolved entries (typical on a Windows checkout with core.symlinks=false — Git materializes the tracked symlinks as 1-line text files). Materialize them: node tools/activation/materialize-agents-skills.mjs (idempotent; --check to just report).");
  if (env.runtimes.pi && env.orchestration && !env.orchestration.pi) h.push("Pi present but the pi-subagents extension was not detected — subagent orchestration degrades to single-agent. Install/enable pi-subagents to let flows delegate (contract: references/subagent-orchestration.md).");
  if (env.runtimes.pi) h.push("Pi: skills run as /skill:<name> (e.g. /skill:modo). Project .pi/settings.json is trust-gated: `pi -a` or /trust load ALL project-local resources, including executable extensions, so review them first (see runtimeConfigReview) or use the explicit `-na` launch in the Pi guide.");
  if (env.runtimes.antigravity) h.push("Antigravity: run `agy` from an activated project; AGENTS.md and .agents/skills load from there, /skills lists them, and /security-auditor loads the dispatcher.");
  if (env.runtimes.claudeCode) h.push("Slash commands use each skill's EXACT name (e.g. /modo, /iniciar-pentest). Claude Code discovers .claude/skills/ at SESSION START — if a skill is missing, start a fresh session to refresh discovery (the 'claudeSkills' fact lists what is installed).");
  return h;
}

export function doctor(opts = {}) { return runDoctor(collectEnv(opts.envOpts || {})); }
