#!/usr/bin/env node
// REFERENCE PreToolUse hook (Claude Code) — effective tool-layer Whitebox denial.
//
// STATUS: reference implementation, NOT auto-installed. This file demonstrates
// the only place a real control can live for raw read/bash tool calls: the
// harness tool boundary. The engagement module's resolver gates MODULE-mediated
// access; this hook extends enforcement to raw `read`/`bash`/`grep` under Claude
// Code. It is runtime-specific — Pi / Antigravity need equivalents, and
// until those exist the control is NOT universal (documented limitation).
//
// To ARM it (operator action, not done here), add to .claude/settings.json:
//   { "hooks": { "PreToolUse": [ { "matcher": "Read|Bash|Grep|Glob",
//       "hooks": [ { "type": "command",
//         "command": "node tools/workspace/whitebox-guard-hook.mjs" } ] } ] } }
// and point SECAUDIT_ENGAGEMENT_DIR at the active engagement root.
//
// Protocol: reads a PreToolUse event JSON on stdin; prints a decision on stdout;
// exit 2 + {"decision":"deny"} blocks the call. Fail-closed on Whitebox paths.

import fs from "node:fs";
import path from "node:path";
import { decideWhiteboxAccess, WHITEBOX_DIR } from "./whitebox-guard.mjs";

function readStdin() {
  try { return fs.readFileSync(0, "utf8"); } catch { return ""; }
}

function extractPaths(event) {
  const ti = (event && event.tool_input) || {};
  const out = [];
  if (typeof ti.file_path === "string") out.push(ti.file_path);
  if (typeof ti.path === "string") out.push(ti.path);
  if (typeof ti.command === "string") {
    // crude: flag any command string that references the Whitebox dir
    if (ti.command.includes(WHITEBOX_DIR + "/") || ti.command.includes(WHITEBOX_DIR + path.sep)) {
      out.push(WHITEBOX_DIR + "/<referenced-in-command>");
    }
  }
  return out;
}

function main() {
  const engDir = process.env.SECAUDIT_ENGAGEMENT_DIR;
  if (!engDir) { console.log(JSON.stringify({ decision: "allow", reason: "no engagement dir set" })); return; }
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(path.join(engDir, ".engagement.json"), "utf8")); } catch {}
  let event = {};
  try { event = JSON.parse(readStdin() || "{}"); } catch {}

  for (const p of extractPaths(event)) {
    const target = p.includes("<referenced-in-command>") ? WHITEBOX_DIR + "/x" : p;
    const d = decideWhiteboxAccess({ targetPath: path.isAbsolute(target) ? path.relative(engDir, target) : target, engDir, manifest });
    if (d.isWhitebox && !d.allow) {
      console.log(JSON.stringify({ decision: "deny", reason: `Whitebox segregated: ${d.reason}` }));
      process.exit(2);
    }
  }
  console.log(JSON.stringify({ decision: "allow" }));
}

main();
