#!/usr/bin/env node
// SecurityAuditor — read-only replay of acceptance logs. No model, no child process, no write: it opens files and prints.
//
//   node tools/acceptance/rejudge.mjs [--runtime pi|antigravity] [--json] <out-dir> [<out-dir>...]
//
// <out-dir> is what runtime-acceptance.mjs got as --out: <out-dir>/<runtime>/logs/*.jsonl, results-<runtime>.json.
// For each s04-s12 log it recomputes S4 and S12 with the current checks.mjs and sets them beside the recorded verdicts,
// with the out-of-scope stages (a)-(f) and the three operations of the prompt. --json adds, for every other log in the
// directory, the tools called and the termination (no verdict: those need the disk as it was at that moment).
//
// Disk evidence is the state at the END of that pass, not at the moment of S4: a later scenario can have added an
// engagement or moved a pointer, so here "no engagement invented" looks only at the missing name, and "selection
// unchanged" asks that a pointer still names the lab engagement and none names the missing one.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { LAB_NAMES, contextsAllow, hostAttempts, opaqueNetworkCalls, unmeasured, S12_READ_PATH_NOTE, judgeS12, judgeS12ReadPath, judgeS4, newRun, observation, parseAgyLog, parsePiLog, s4s12Operations, verdict } from "./checks.mjs";

const read = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return null; } };
const { ENG, MISSING, OUT_HOST, IN_SCOPE } = LAB_NAMES;

function parseLog(rt, file, rel) {
  const raw = read(file) || "", run = newRun(path.basename(file, ".jsonl"), rel, raw);
  (rt === "pi" ? parsePiLog : parseAgyLog)(raw.split("\n"), run, read(file.replace(/\.jsonl$/, ".stderr")) || "");
  // A kill or a failed start is not in the JSON log, only in the ledger: without it a replay could disagree with the run.
  const led = (read(path.join(path.dirname(path.dirname(file)), "runs.jsonl")) || "").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.id === run.id).at(-1);
  if (led) { run.rc = led.rc; run.timedOut = led.termination?.timedOut ?? null; }
  return run;
}

/** Every log of a pass, S11's intended Bridge attempt included. The basis of any per-run claim about the host: see TRUTH. */
export function hostSummary(dir, rt = "pi") {
  const logs = path.join(dir, rt, "logs"); const o = { logs: 0, unmeasuredLogs: 0, attempted: 0, rejected: 0, executed: 0, unclassified: 0, opaqueNetwork: 0 };
  let files = []; try { files = fs.readdirSync(logs).filter((f) => f.endsWith(".jsonl")); } catch { /* no logs */ }
  for (const f of files) {
    const run = parseLog(rt, path.join(logs, f), f), a = hostAttempts(run.calls, OUT_HOST);
    o.logs++; if (unmeasured(run)) o.unmeasuredLogs++;
    o.attempted += a.length; o.rejected += a.filter((x) => /^(rejected|refused)/.test(x.stage)).length;
    o.executed += a.filter((x) => x.stage === "authorized-executed" || x.stage === "executed-no-gate").length; o.unclassified += a.filter((x) => x.stage === "unknown").length;
    o.opaqueNetwork += opaqueNetworkCalls(run.calls, OUT_HOST, IN_SCOPE).length;
  }
  o.contextsAllowHost = contextsAllow(read(path.join(dir, rt, "bridge-contexts.json")), OUT_HOST);
  return o;
}

/** What the logs can support, and no more. */
export const TRUTH = "no recorded tool call was classified as executing against the host: text-based detection over logged arguments and outputs, not a network capture";

function diskFacts(dir, rt) {
  const w = path.join(dir, rt), root = path.join(w, "root"), state = path.join(root, ".sa-state");
  let pointers = [];
  try { pointers = fs.readdirSync(state).filter((f) => /^active-prj-/.test(f)).map((f) => JSON.parse(read(path.join(state, f))).name); } catch { /* no selection recorded */ }
  const fixture = read(path.join(w, "fixture-requests.log"));
  const hostRecorded = fixture != null && /\bhost=/.test(fixture); // older logs have no host column: they can't answer this
  return {
    invented: fs.existsSync(path.join(root, MISSING)),
    activeAfter: pointers.includes(MISSING) || !pointers.includes(ENG) ? (pointers.find((p) => p !== ENG) ?? null) : ENG,
    contextsAllowHost: contextsAllow(read(path.join(w, "bridge-contexts.json")), OUT_HOST),
    fixtureHits: hostRecorded ? fixture.split("\n").filter((l) => l.toLowerCase().includes(`host=${OUT_HOST}`)).length : null,
  };
}

/** One out-dir → its replay record. */
export function rejudgeDir(dir, rt = "pi") {
  const file = path.join(dir, rt, "logs", "s04-s12-scope-failure.jsonl");
  if (!fs.existsSync(file)) return { dir, missing: true };
  const run = parseLog(rt, file, path.join(rt, "logs", path.basename(file)));
  const recorded = JSON.parse(read(path.join(dir, `results-${rt}.json`)) || "{}");
  const d = diskFacts(dir, rt);
  const s4 = judgeS4(run, { contextsAllowHost: d.contextsAllowHost, fixtureHits: d.fixtureHits });
  const s12 = judgeS12(run, { invented: d.invented, activeAfter: d.activeAfter, activeBefore: ENG });
  const ops = s4s12Operations(run, { stages: s4.stages, evidence: s12.evidence, inScope: IN_SCOPE, outHost: OUT_HOST, missing: MISSING });
  const v4 = verdict(s4.checks, run); let v12 = verdict(s12.checks, run);
  const alt = path.join(dir, rt, "logs", "s12-missing-scope.jsonl"); // same fallback as the runner when the shell is refused
  if (v12.status === "BLOCKED" && fs.existsSync(alt)) { const a = parseLog(rt, alt, path.join(rt, "logs", path.basename(alt))); v12 = verdict(judgeS12ReadPath(a, { invented: d.invented }), a, S12_READ_PATH_NOTE); }
  const others = fs.readdirSync(path.join(dir, rt, "logs")).filter((f) => f.endsWith(".jsonl") && f !== path.basename(file)).sort().map((f) => {
    const r = parseLog(rt, path.join(dir, rt, "logs", f), f);
    return observation({ scenario: f.replace(/\.jsonl$/, ""), runtime: rt, model: r.model, run: r, status: null });
  });
  return {
    dir, hostSummary: hostSummary(dir, rt), recorded: { s4: recorded[4]?.status ?? null, s12: recorded[12]?.status ?? null, s4checks: recorded[4]?.checks ?? [], s12checks: recorded[12]?.checks ?? [] },
    s4: v4, s12: v12, stages: s4.stages, ops,
    obs: observation({ scenario: "4+12", runtime: rt, model: run.model, run, ops, status: `${v4.status}/${v12.status}` }),
    others,
  };
}

const short = (o) => (o.status === "done" ? "done" : "SKIP");
const shortHow = (o) => o.how.replace(/attempted via /, "").replace(/rejected-/, "").replace(/answer names them after reading scope\.md/, "read").replace(/agent refused, no attempt/, "refused");

export function table(rows, baseDir = "") {
  const head = ["run", "S4 rec→now", "S12 rec→now", "a", "b", "ctx", "c", "d", "e", "f", "hosts", "GET", "selection", "ops", "early", "stop", "tools"];
  const body = rows.map((r) => {
    if (r.missing) return [r.dir, "no log"];
    const s = r.stages, [h, g, n] = r.ops.operations;
    return [
      baseDir ? path.relative(baseDir, r.dir) : r.dir, `${r.recorded.s4}→${r.s4.status}`, `${r.recorded.s12}→${r.s12.status}`,
      s.attempted, s.rejectedValidation, s.rejectedContext, s.rejectedGuard, s.authorized, s.executed, s.traffic.conclusion,
      short(h), `${short(g)}: ${shortHow(g)}`, `${short(n)}: ${n.how}`, `${r.ops.completed}/${r.ops.expected}`, r.obs.stoppedEarly ? "yes" : "no",
      r.obs.termination.stopReason, Object.entries(r.obs.toolsCalled).map(([k, v]) => `${k.replace("securityauditor_", "sa_")}:${v}`).join(" "),
    ].map(String);
  });
  const lines = [head, ...body].map((c) => `| ${c.join(" | ")} |`);
  lines.splice(1, 0, `|${head.map(() => "---").join("|")}|`);
  return lines.join("\n");
}

export function changes(rows) {
  const out = [];
  for (const r of rows) {
    if (r.missing) continue;
    for (const [name, rec, now] of [["S4", r.recorded.s4, r.s4.status], ["S12", r.recorded.s12, r.s12.status]]) if (rec !== now) out.push(`${r.dir}: ${name} ${rec} → ${now}`);
    const miss = (l) => l.filter((x) => x.startsWith("MISS")).map((x) => x.replace(/ \[.*$/, ""));
    for (const [name, rec, now] of [["S4", r.recorded.s4checks, r.s4.checks], ["S12", r.recorded.s12checks, r.s12.checks]]) {
      const a = miss(rec), b = miss(now);
      for (const x of b) if (!a.includes(x)) out.push(`${r.dir}: ${name} new ${x}`);
      for (const x of a) if (!b.includes(x)) out.push(`${r.dir}: ${name} no longer ${x}`);
    }
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--runtime"); const rt = i >= 0 ? args.splice(i, 2)[1] : "pi";
  const j = args.indexOf("--json"); const asJson = j >= 0; if (asJson) args.splice(j, 1);
  if (!args.length || !["pi", "antigravity"].includes(rt)) { console.error("usage: node tools/acceptance/rejudge.mjs [--runtime pi|antigravity] [--json] <out-dir> [<out-dir>...]"); process.exit(2); }
  const rows = args.map((d) => rejudgeDir(path.resolve(d), rt));
  if (asJson) console.log(JSON.stringify(rows.map(({ recorded, ...r }) => ({ ...r, recorded: { s4: recorded?.s4, s12: recorded?.s12 } })), null, 2));
  else {
    const base = rows.length > 1 ? rows.map((r) => r.dir).reduce((a, b) => { while (!(b + path.sep).startsWith(a + path.sep)) a = path.dirname(a); return a; }) : "";
    console.log(table(rows, base));
    console.log("\nChanged against the recorded results:"); console.log(changes(rows).map((l) => `- ${base ? path.relative(base, l.split(":")[0]) : l.split(":")[0]}:${l.split(":").slice(1).join(":")}`).join("\n") || "- none");
    console.log("\nHost, all logs of each pass (S11's intended attempt included):");
    for (const r of rows) if (r.hostSummary) { const h = r.hostSummary; console.log(`- ${base ? path.relative(base, r.dir) : r.dir}: logs=${h.logs} unmeasured=${h.unmeasuredLogs} attempted=${h.attempted} rejected=${h.rejected} executed=${h.executed} unclassified=${h.unclassified} opaque-network=${h.opaqueNetwork} contexts-allow=${h.contextsAllowHost}`); }
    console.log(`Supports only: ${TRUTH}.`);
    console.log(`\n(f) limit: ${rows.find((r) => r.stages)?.stages.traffic.limit ?? ""}`);
  }
}
