#!/usr/bin/env node
// SecurityAuditor — Preflight/Doctor CLI (H2d-F1). Deterministic, offline, no LLM, no offensive ops.
// Usage:
//   node cli.mjs preflight [--profile core-lab|caido-native|full-engagement] [--json]
//   node cli.mjs doctor [--json]
// Exit codes (preflight): 0 READY, 1 DEGRADED, 2 BLOCKED, 3 usage error. Doctor always exits 0.

import { collectEnv, runPreflight, PROFILES } from "./preflight.mjs";
import { runDoctor } from "./doctor.mjs";
import { loadProjectEnv } from "./env-loader.mjs";

function parse(argv) {
  const a = { cmd: argv[0] || "preflight", profile: "core-lab", json: false };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--profile") a.profile = argv[++i];
    else if (argv[i] === "--json") a.json = true;
  }
  return a;
}

function main() {
  const a = parse(process.argv.slice(2));
  // Load local persistent config (<repo>/.env) BEFORE snapshotting the environment. Env vars already
  // set take precedence; only variable NAMES are ever shown — never values.
  const envLoad = process.env.SA_SKIP_ENV_FILE ? { loaded: false, applied: [], skipped: [], keys: [] } : loadProjectEnv();
  const env = collectEnv();

  if (a.cmd === "doctor") {
    const r = runDoctor(env);
    if (a.json) { console.log(JSON.stringify({ ...r, envFile: envLoadSummary(envLoad) }, null, 2)); return 0; }
    console.log("SYNAPSE Doctor — environment facts\n");
    for (const [k, v] of Object.entries(r.facts)) {
      const s = Array.isArray(v) ? (v.length ? v.join(", ") : "(none)") : (v && typeof v === "object" ? JSON.stringify(v) : String(v));
      console.log(`  ${k.padEnd(16)} ${s}`);
    }
    console.log(`  ${".env".padEnd(16)} ${envFileLine(envLoad)}`);
    if (r.hints.length) { console.log("\nHints:"); for (const h of r.hints) console.log(`  - ${h}`); }
    return 0;
  }

  if (a.cmd === "preflight") {
    if (!PROFILES[a.profile]) { console.error(`unknown profile: ${a.profile} (valid: ${Object.keys(PROFILES).join(", ")})`); return 3; }
    const r = runPreflight(env, { profile: a.profile });
    if (a.json) { console.log(JSON.stringify(r, null, 2)); }
    else {
      console.log(`${r.summary}\n`);
      for (const c of r.checks) console.log(`  [${c.status.toUpperCase().padEnd(8)}] ${c.required ? "req " : "opt "} ${c.id.padEnd(18)} ${c.detail}`);
      console.log(`\nverdict: ${r.verdict}  (no LLM, no offensive operations)`);
    }
    return r.verdict === "READY" ? 0 : r.verdict === "DEGRADED" ? 1 : 2;
  }

  console.error(`usage: node cli.mjs preflight|doctor [--profile <p>] [--json]`);
  return 3;
}

// Names-only, sanitized views of the .env load (never emits values).
function envLoadSummary(l) { return { loaded: l.loaded, applied: l.applied, keptFromEnvironment: l.skipped }; }
function envFileLine(l) {
  if (!l.loaded) return "not present (using process environment only)";
  const parts = [`loaded ${l.applied.length} var(s)` + (l.applied.length ? ` [${l.applied.join(", ")}]` : "")];
  if (l.skipped.length) parts.push(`kept from environment: ${l.skipped.join(", ")}`);
  return parts.join("; ");
}

process.exit(main());
