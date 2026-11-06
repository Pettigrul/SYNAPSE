#!/usr/bin/env node
// SecurityAuditor — P2 activation CLI (thin wrapper over activate.mjs; pure fs, offline, no LLM, no offensive ops).
//
// Usage:
//   node tools/activation/cli.mjs activate   [--project <dir>] [--home <central>] [--runtime claude-code|pi|antigravity|all] [--mcp] [--caido|--no-caido] [--force]
//   node tools/activation/cli.mjs deactivate [--project <dir>] [--home <central>] [--repair]
//   node tools/activation/cli.mjs status     [--project <dir>] [--home <central>]
// --caido opts this project in to CAIDO_TOKEN from the central .env (only for the commands that need it); kept across re-activation.
// The decision lives beside that .env, keyed by real path, not in the project (activate.mjs, CAIDO_OPT_INS).
// --project defaults to the current working directory. No global config is created/changed. Activation does
// NOT select an engagement or authorize any target.

import { activate, deactivate, statusActivation, auditRuntimeConfig, caidoGuidance, hackbotHome, cleanForDisplay, ActivationError, CAIDO_OPT_INS, MARKER } from "./activate.mjs";

const HELP = `Usage: cli.mjs activate|deactivate|status [--project <dir>] [--home <central>] [--runtime claude-code|pi|antigravity|all] [--mcp] [--caido|--no-caido] [--force] [--repair]

  activate    links the central harness into the project. Selects no engagement, authorizes no target.
  deactivate  removes only what activation created; engagement data stays.
  status      shows the links and the Caido decision; exit 1 when not activated or not healthy.

  --caido     lets this project receive CAIDO_TOKEN from the central .env, in the commands that need it. An operator decision:
              it is kept in ${CAIDO_OPT_INS} beside that .env, per real path, never in the project. A moved, renamed or copied
              project needs a new one, and a caido field in an old marker counts for nothing.
  --no-caido  revokes it. deactivate revokes too; deactivate --project <old path> drops the opt-in a moved project left behind.
  --repair    with deactivate, for a marker that is invalid or missing: removes only this harness's links and keeps your files,
              any *.hackbot-bak and the old marker as ${MARKER}.invalid. Then run activate again.
  --force     backs up content in the way of a link (restored on deactivate).

Protects against project content, not against a shell of this user, which can read .env and that file directly.`;

function parse(argv) {
  const a = { cmd: argv[0] || "status" };
  for (let i = 1; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith("--")) { const k = t.slice(2); const v = (argv[i + 1] && !argv[i + 1].startsWith("--")) ? argv[++i] : true; a[k] = v; }
  }
  return a;
}
function die(msg, code = 2) { console.error(`error: ${cleanForDisplay(msg)}`); process.exit(code); }
// Marker fields and project paths are project content: each value is cleaned, so none can draw a line of its own.
const safe = (strs, ...vals) => strs.reduce((out, s, i) => out + cleanForDisplay(vals[i - 1]) + s);
const list = (xs) => xs.join(", ");
function printRuntimeConfig(found) {
  if (!found.length) return;
  console.log(`  ⚠ project-supplied runtime config, not from SYNAPSE: review before trusting this project in a runtime:`);
  for (const f of found) console.log(safe`      ${f.path}  [${f.kind}]`);
}

function main() {
  const a = parse(process.argv.slice(2));
  if (process.argv.slice(2).some((x) => x === "--help" || x === "-h")) { console.log(HELP); return 0; }
  const projectDir = (a.project && a.project !== true) ? a.project : process.cwd();
  const home = (a.home && a.home !== true) ? a.home : hackbotHome();
  const RUNTIMES = ["claude-code", "pi", "antigravity"];
  const raw = a.runtime ?? a.runtimes;
  if (raw === true) die("--runtime needs a value (claude-code|pi|antigravity|all, comma-separated allowed)");
  const runtimes = raw === undefined ? null : raw === "all" ? RUNTIMES : [...new Set(String(raw).split(",").map((s) => s.trim()))]; // null = keep what the marker has
  for (const x of runtimes || []) if (!RUNTIMES.includes(x)) die(`unknown runtime '${x}' (valid: ${RUNTIMES.join("|")}|all)`);

  if (a.cmd === "activate") {
    if (a.caido && a["no-caido"]) die("--caido and --no-caido contradict each other: choose one");
    const r = activate({ projectDir, home, force: !!a.force, operator: process.env.USER || null, runtimes, mcp: !!a.mcp, caido: a["no-caido"] ? false : a.caido ? true : null });
    console.log(safe`activated: ${r.projectDir}`);
    console.log(safe`  harness (central, linked): ${r.hackbotHome}`);
    console.log(safe`  links: ${list(r.links)}`);
    if (r.backedUp.length) console.log(safe`  backed up (restored on deactivate): ${list(r.backedUp)}`);
    console.log(`  mcp: ${r.mcp ? "project-scoped .mcp.json linked" : "not enabled"}  |  runtimes: ${cleanForDisplay(list(r.runtimes))}`);
    console.log(`  caido credential from central .env: ${r.caido ? `opted in (recorded in ${r.optInFile})` : "withheld (--caido to opt in)"}`);
    if (r.caidoError) console.log(`  ⚠ ${r.caidoError}`);
    if (r.legacyCaidoDropped) console.log(`  ⚠ this project's marker said caido:true. That field is no longer honored and was removed, because anyone who controls the project can write it. If you trust this project, re-run with --caido.`);
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
    const r = deactivate({ projectDir, home, repair: !!a.repair });
    if (r.notActivated) { console.log(`not activated: ${cleanForDisplay(r.projectDir)}\n  removed the Caido opt-in recorded for this path`); return 0; }
    console.log(`${r.repaired ? "repaired" : "deactivated"}: ${cleanForDisplay(r.projectDir)}`);
    console.log(`  removed links: ${cleanForDisplay(list(r.removed) || "(none)")}`);
    if (r.restored.length) console.log(safe`  restored pre-existing: ${list(r.restored)}`);
    if (r.repaired) {
      if (r.markerKept) console.log(`  old marker kept as: ${r.markerKept}`);
      if (r.markerLinkRemoved) console.log(`  the marker was a symbolic link: removed the link, its target was not touched`);
      if (r.keptBackups.length) console.log(safe`  your earlier files are still in: ${list(r.keptBackups)} (without a valid marker they aren't restored: rename them back if you want them)`);
      console.log(`  directories were left in place. To activate again: tools/activation/cli.mjs activate --project ${cleanForDisplay(r.projectDir)}`);
    } else if (r.keptBackups.length) console.log(safe`  kept (newer file at the original path, nothing overwritten): ${list(r.keptBackups)}`);
    if (r.skipped.length) console.log(safe`  ⚠ left alone, they lead outside the project: ${list(r.skipped)}`);
    if (r.caidoRevoked) console.log(`  caido opt-in: revoked`);
    if (r.caidoWarning) console.log(safe`  ⚠ caido opt-in may remain: ${r.caidoWarning}`);
    console.log(`  engagement/pentest data preserved: ${r.dataPreserved}`);
    return 0;
  }

  if (a.cmd === "status") {
    const s = statusActivation({ projectDir, home });
    if (!s.activated) {
      console.log(`not activated: ${cleanForDisplay(s.projectDir)}${s.corrupt ? ` (marker invalid: ${s.reason})` : ""}`);
      if (s.corrupt) console.log(safe`  ${s.help}`);
      return 1;
    }
    console.log(safe`activated: ${s.projectDir}  →  ${s.hackbotHome}`);
    console.log(`  runtimes: ${s.runtimes.map(cleanForDisplay).join(", ")}  |  mcp: ${s.mcp}  |  caido opt-in: ${s.caido}  |  healthy: ${s.healthy}`);
    if (!s.caido && (s.caidoError || s.caidoGranted || s.legacyCaido)) console.log(safe`  ⚠ ${caidoGuidance(s)}`);
    for (const l of s.links) console.log(`  ${l.healthy ? "ok  " : "BAD "} ${cleanForDisplay(l.rel)}`);
    printRuntimeConfig(auditRuntimeConfig({ projectDir }));
    return s.healthy ? 0 : 1;
  }

  die(`unknown command: ${a.cmd} (activate|deactivate|status)`, 3);
}

try { process.exit(main()); }
catch (e) {
  if (e instanceof ActivationError) die(`${e.code}: ${e.message}`, 2);
  if (["EACCES", "EPERM", "EROFS"].includes(e && e.code)) die(`permission denied (${e.code}) on ${e.path || "a project path"}: fix its owner or mode and re-run. If links were left behind: deactivate --repair`, 1);
  die(String(e && e.message || e), 1);
}
