// SecurityAuditor — HackBot Doctor (H2d-F1).
//
// INFORMATIONAL environment diagnosis — facts only, NO verdict and NO gating (that is Preflight's job).
// Deterministic, offline, no LLM, no offensive ops. Helps an operator troubleshoot a Windows-corporate
// install by reporting what is detected and where. Node stdlib only.

import fs from "node:fs";
import path from "node:path";
import { collectEnv } from "./preflight.mjs";
import { statusActivation } from "../activation/activate.mjs";

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
    activation: (() => { const s = statusActivation({ projectDir: process.cwd() }); return s.activated ? `${s.projectDir} (declared: ${s.runtimes.join(", ")}; healthy: ${s.healthy})` : "(cwd is not an activated project)"; })(),
    claudeSkills: skills.length ? `${skills.length}: ${skills.join(", ")}` : "(none under .claude/skills)",
    kb: { categories: env.kb.skillDirs, validator: env.kb.validator, manifest: env.kb.manifest },
    policies: env.policies,
    bridge: env.files.bridge,
    workspaceTool: env.workspace.tool,
    engagementRoot: env.workspace.engagementRoot || "(none selected)",
    activeEngagement: env.engagement && env.engagement.selected ? `${env.engagement.name} (via ${env.engagement.source || "?"})${env.engagement.managed ? "" : " — NOT managed/found"}` : "(none — select with: workspace cli use --name <n>)",
    caidoProjectBinding: env.engagement && env.engagement.caidoProjectId ? `${env.engagement.caidoProjectId} (via ${env.engagement.caidoProjectSource})` : "(none — associate a project)",
    browser: env.browser.playwright ? `playwright-core${env.browser.channel ? ` + channel ${env.browser.channel}` : " (channel auto-detect at runtime)"}` : "none (HTTP fallback)",
    caidoInstanceConfig: ["baseUrl", "token"].filter((k) => env.caido[k]),
    evidenceDir: env.evidence.dir
      ? `${env.evidence.dir} [${env.evidence.source}] (${env.evidence.writable ? "writable" : "NOT writable"})`
      : "(none — select an engagement; persistent evidence lives in <engagement>/evidence)",
    optionalMcp: Object.entries(env.mcp).filter(([, v]) => v).map(([k]) => k),
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
  if (env.workspace.engagementRoot && !(env.engagement && env.engagement.selected)) h.push("No active engagement — select one for this session: node tools/workspace/cli.mjs use --name <name> (list: cli.mjs list). SA_ENGAGEMENT still works as an explicit override for automation.");
  if (env.engagement && env.engagement.selected && !env.engagement.caidoProjectId) h.push(`Active engagement '${env.engagement.name}' has no Caido project — associate one: node tools/workspace/cli.mjs associate --name ${env.engagement.name} --project-id <id> (discover with: cli.mjs projects).`);
  if (env.evidence.source === "engagement" && !env.evidence.writable) h.push(`Engagement dir not writable — cannot create ${env.evidence.dir}; fix permissions on the engagement directory.`);
  if (!env.evidence.dir) h.push("No evidence destination — persistent evidence (screenshots, captures) requires an active engagement; select one: node tools/workspace/cli.mjs use --name <name>.");
  if (env.evidence.source === "legacy-env") h.push("Using legacy SA_EVIDENCE_DIR (no active engagement) — prefer per-engagement evidence by selecting an engagement; SA_EVIDENCE_DIR never overrides an active engagement.");
  if (env.runtimes.pi) h.push("Pi: skills run as /skill:<name> (e.g. /skill:modo). Project .pi/settings.json is trust-gated: use `pi -a` or /trust; print/json/rpc modes skip it otherwise.");
  if (env.runtimes.antigravity) h.push("Antigravity: run `agy` from an activated project; AGENTS.md and .agents/skills load from there, and /skills lists them.");
  if (env.runtimes.claudeCode) h.push("Slash commands use each skill's EXACT name (e.g. /modo, /iniciar-pentest). Claude Code discovers .claude/skills/ at SESSION START — if a skill is missing, start a fresh session to refresh discovery (the 'claudeSkills' fact lists what is installed).");
  return h;
}

export function doctor(opts = {}) { return runDoctor(collectEnv(opts.envOpts || {})); }
