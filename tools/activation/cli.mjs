#!/usr/bin/env node
// SecurityAuditor — P2 activation CLI (thin wrapper over activate.mjs; pure fs, offline, no LLM, no offensive ops).
//
// Usage:
//   node tools/activation/cli.mjs activate   [--project <dir>] [--home <central>] [--runtime claude-code|pi|antigravity|all] [--mcp] [--force]
//   node tools/activation/cli.mjs deactivate [--project <dir>]
//   node tools/activation/cli.mjs status     [--project <dir>]
// --project defaults to the current working directory. No global config is created/changed. Activation does
// NOT select an engagement or authorize any target.

import { activate, deactivate, statusActivation, hackbotHome, ActivationError } from "./activate.mjs";

function parse(argv) {
  const a = { cmd: argv[0] || "status" };
  for (let i = 1; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith("--")) { const k = t.slice(2); const v = (argv[i + 1] && !argv[i + 1].startsWith("--")) ? argv[++i] : true; a[k] = v; }
  }
  return a;
}
function die(msg, code = 2) { console.error(`error: ${msg}`); process.exit(code); }

function main() {
  const a = parse(process.argv.slice(2));
  const projectDir = (a.project && a.project !== true) ? a.project : process.cwd();
  const runtimes = a.runtime === "all" ? ["claude-code", "pi", "antigravity"] : (a.runtime && a.runtime !== true) ? [a.runtime] : ["claude-code"];

  if (a.cmd === "activate") {
    const r = activate({ projectDir, home: (a.home && a.home !== true) ? a.home : hackbotHome(), force: !!a.force, operator: process.env.USER || null, runtimes, mcp: !!a.mcp });
    console.log(`activated: ${r.projectDir}`);
    console.log(`  harness (central, linked): ${r.hackbotHome}`);
    console.log(`  links: ${r.links.join(", ")}`);
    if (r.backedUp.length) console.log(`  backed up (restored on deactivate): ${r.backedUp.join(", ")}`);
    console.log(`  mcp: ${r.mcp ? "project-scoped .mcp.json linked" : "not enabled"}  |  runtimes: ${r.runtimes.join(", ")}`);
    console.log(`\nActivation provides the harness here; it does NOT select an engagement or authorize any target.`);
    console.log(`Next: node tools/workspace/cli.mjs use --name <engagement>  then  /verificar-ambiente  →  /iniciar-pentest`);
    if (runtimes.some((x) => x === "pi" || x === "antigravity")) {
      console.log(`\nNote: Pi registers skills GLOBALLY (~/.pi) — not done here (no global install). Pi/Antigravity can`);
      console.log(`read this project's linked SKILL.md/skills; see handbook ch.18 §18.6 (per-runtime matrix).`);
    }
    return 0;
  }

  if (a.cmd === "deactivate") {
    const r = deactivate({ projectDir });
    console.log(`deactivated: ${r.projectDir}`);
    console.log(`  removed links: ${r.removed.join(", ") || "(none)"}`);
    if (r.restored.length) console.log(`  restored pre-existing: ${r.restored.join(", ")}`);
    console.log(`  engagement/pentest data preserved: ${r.dataPreserved}`);
    return 0;
  }

  if (a.cmd === "status") {
    const s = statusActivation({ projectDir });
    if (!s.activated) { console.log(`not activated: ${s.projectDir}${s.corrupt ? " (marker corrupt)" : ""}`); return 1; }
    console.log(`activated: ${s.projectDir}  →  ${s.hackbotHome}`);
    console.log(`  runtimes: ${s.runtimes.join(", ")}  |  mcp: ${s.mcp}  |  healthy: ${s.healthy}`);
    for (const l of s.links) console.log(`  ${l.healthy ? "ok  " : "BAD "} ${l.rel}`);
    return s.healthy ? 0 : 1;
  }

  die(`unknown command: ${a.cmd} (activate|deactivate|status)`, 3);
}

try { process.exit(main()); }
catch (e) { if (e instanceof ActivationError) die(`${e.code}: ${e.message}`, 2); die(String(e && e.message || e), 1); }
