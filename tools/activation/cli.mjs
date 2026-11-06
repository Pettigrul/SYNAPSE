#!/usr/bin/env node
// SecurityAuditor — P2 activation CLI (thin wrapper over activate.mjs; pure fs, offline, no LLM, no offensive ops).
//
// Usage:
//   node tools/activation/cli.mjs activate   [--project <dir>] [--home <central>] [--runtime claude-code|pi|antigravity|all] [--mcp] [--caido|--no-caido] [--force]
//   node tools/activation/cli.mjs deactivate [--project <dir>]
//   node tools/activation/cli.mjs status     [--project <dir>]
// --caido opts this project in to CAIDO_TOKEN from the central .env (only for the commands that need it); kept across re-activation.
// --project defaults to the current working directory. No global config is created/changed. Activation does
// NOT select an engagement or authorize any target.

import { activate, deactivate, statusActivation, auditRuntimeConfig, hackbotHome, ActivationError } from "./activate.mjs";

function parse(argv) {
  const a = { cmd: argv[0] || "status" };
  for (let i = 1; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith("--")) { const k = t.slice(2); const v = (argv[i + 1] && !argv[i + 1].startsWith("--")) ? argv[++i] : true; a[k] = v; }
  }
  return a;
}
function die(msg, code = 2) { console.error(`error: ${msg}`); process.exit(code); }
function printRuntimeConfig(found) {
  if (!found.length) return;
  console.log(`  ⚠ project-supplied runtime config, not from SYNAPSE: review before trusting this project in a runtime:`);
  for (const f of found) console.log(`      ${f.path}  [${f.kind}]`);
}

function main() {
  const a = parse(process.argv.slice(2));
  if (process.argv.slice(2).some((x) => x === "--help" || x === "-h")) { console.log("Usage: cli.mjs activate|deactivate|status [--project <dir>] [--home <central>] [--runtime claude-code|pi|antigravity|all] [--mcp] [--force]"); return 0; }
  const projectDir = (a.project && a.project !== true) ? a.project : process.cwd();
  const RUNTIMES = ["claude-code", "pi", "antigravity"];
  const raw = a.runtime ?? a.runtimes;
  if (raw === true) die("--runtime needs a value (claude-code|pi|antigravity|all, comma-separated allowed)");
  const runtimes = raw === undefined ? null : raw === "all" ? RUNTIMES : [...new Set(String(raw).split(",").map((s) => s.trim()))]; // null = keep what the marker has
  for (const x of runtimes || []) if (!RUNTIMES.includes(x)) die(`unknown runtime '${x}' (valid: ${RUNTIMES.join("|")}|all)`);

  if (a.cmd === "activate") {
    const r = activate({ projectDir, home: (a.home && a.home !== true) ? a.home : hackbotHome(), force: !!a.force, operator: process.env.USER || null, runtimes, mcp: !!a.mcp, caido: a["no-caido"] ? false : a.caido ? true : null });
    console.log(`activated: ${r.projectDir}`);
    console.log(`  harness (central, linked): ${r.hackbotHome}`);
    console.log(`  links: ${r.links.join(", ")}`);
    if (r.backedUp.length) console.log(`  backed up (restored on deactivate): ${r.backedUp.join(", ")}`);
    console.log(`  mcp: ${r.mcp ? "project-scoped .mcp.json linked" : "not enabled"}  |  runtimes: ${r.runtimes.join(", ")}`);
    console.log(`  caido credential from central .env: ${r.caido ? "opted in (--caido)" : "withheld (--caido to opt in)"}`);
    printRuntimeConfig(r.runtimeConfig);
    console.log(`\nActivation provides the harness here; it does NOT select an engagement or authorize any target.`);
    console.log(`Next: node tools/workspace/cli.mjs use --name <engagement>  then  /verificar-ambiente  →  /iniciar-pentest (Pi: /skill:<name>)`);
    if (r.runtimes.some((x) => x === "pi" || x === "antigravity")) {
      if (r.runtimes.includes("pi")) console.log(`\nPi: project .pi/settings.json linked (no global install). \`pi -a\` (or /trust) trusts ALL project-local resources, so review them first, or use the explicit -na launch in the Pi guide; skills run as /skill:<name>.`);
      if (r.runtimes.includes("antigravity")) console.log(`\nAntigravity: AGENTS.md and .agents/skills linked (no global install). Run \`agy\` from this project; /skills lists them and /security-auditor loads the dispatcher.`);
      console.log(`See handbook ch.18 §18.6 (per-runtime matrix).`);
    }
    return 0;
  }

  if (a.cmd === "deactivate") {
    const r = deactivate({ projectDir });
    console.log(`deactivated: ${r.projectDir}`);
    console.log(`  removed links: ${r.removed.join(", ") || "(none)"}`);
    if (r.restored.length) console.log(`  restored pre-existing: ${r.restored.join(", ")}`);
    if (r.keptBackups.length) console.log(`  kept (newer file at the original path, nothing overwritten): ${r.keptBackups.join(", ")}`);
    console.log(`  engagement/pentest data preserved: ${r.dataPreserved}`);
    return 0;
  }

  if (a.cmd === "status") {
    const s = statusActivation({ projectDir });
    if (!s.activated) { console.log(`not activated: ${s.projectDir}${s.corrupt ? " (marker corrupt)" : ""}`); return 1; }
    console.log(`activated: ${s.projectDir}  →  ${s.hackbotHome}`);
    console.log(`  runtimes: ${s.runtimes.join(", ")}  |  mcp: ${s.mcp}  |  caido opt-in: ${s.caido}  |  healthy: ${s.healthy}`);
    for (const l of s.links) console.log(`  ${l.healthy ? "ok  " : "BAD "} ${l.rel}`);
    printRuntimeConfig(auditRuntimeConfig({ projectDir }));
    return s.healthy ? 0 : 1;
  }

  die(`unknown command: ${a.cmd} (activate|deactivate|status)`, 3);
}

try { process.exit(main()); }
catch (e) { if (e instanceof ActivationError) die(`${e.code}: ${e.message}`, 2); die(String(e && e.message || e), 1); }
