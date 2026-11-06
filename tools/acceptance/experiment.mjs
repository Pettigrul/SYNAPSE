#!/usr/bin/env node
// SecurityAuditor — N paired repetitions of a scenario against exported trees, under a total cost cap. Spends model budget.
//
//   node tools/acceptance/experiment.mjs --runtime pi --tree base=<export> [--tree cand=<export>] --reps N --scenario 4,12 \
//        --out <dir> --accept-model-cost [--dry-run] [--ledger <file>] [--max-runs 120] [--max-cost-usd 1.00] \
//        [--revision base=<id>] [--model <id>] [--provider <id>] [--timeout-s N]
//
// --dry-run prints the plan and the cap arithmetic and starts nothing (no --accept-model-cost needed).
//
// Each cell (tree, repetition) runs runtime-acceptance.mjs FROM THIS FILE'S DIRECTORY in its own --out, so both trees are
// judged by the same checks and share no state. With two trees the order alternates per repetition.
//
// Every attempt counts: failures, crashes and timeouts stay in the ledger and in the counts. There is no retry and no
// best-run selection. A cell already in the ledger is never run again; only one recorded "not-run" can still start.
//
// Cap: --max-runs and --max-cost-usd are totals over --ledger (default <out>/experiment.jsonl). Pass the same --ledger to
// every experiment to enforce a mission-wide ceiling. The whole plan is refused up front if it can't fit the run cap.
// Before each cell, the next cell is reserved at the dearest run seen (at least US$0.01), and a run that died without
// reporting usage is charged at that price. A US$ cap can't bind on antigravity: its log has tokens, not prices.
//
// Setup costs no model run. Scenarios 4 and 12 prepare the engagement through the CLI (init, scope, bootstrap, use), so
// `--scenario 4,12` in a fresh --out is one model run per cell. That state matches what a model-run S3+S5 leaves, except
// timestamps, paths and the audit lines of its extra bootstraps. Adding S3 saves nothing: it was about 57% of an S3+S4 repetition's cost.
//
// Provider unreachable: 2 consecutive cells with a model run and 0 tokens abort the experiment. That's not the cap: the
// rest is recorded "not-run" with that reason and the summary says "aborted". A cell whose run measured nothing is
// "unmeasured": its scenarios are NOT RUN, it isn't retried, its pair is incomplete, and it still counts against the run cap.
//
// Writes: --out, --ledger. Exit 0 if every planned cell ran (whatever its verdict), 1 if a cell crashed, measured nothing or didn't run,
// 3 if the plan was refused. Read the results with rejudge.mjs, or the table printed at the end.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ZERO_TOKEN_ABORT, budgetDecision, chargedCost, planCells, summarizeCells, zeroTokenStreak } from "./checks.mjs";

const argv = process.argv.slice(2);
const flag = (name, dflt = null) => { const i = argv.indexOf(`--${name}`); return i < 0 ? dflt : (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true); };
const many = (name) => argv.flatMap((a, i) => (a === `--${name}` && argv[i + 1] ? [argv[i + 1]] : []));
const die = (msg, code = 2) => { console.error(`error: ${msg}`); process.exit(code); };
const pairsOf = (name) => Object.fromEntries(many(name).map((t) => { const i = t.indexOf("="); if (i < 1) die(`--${name} needs label=value: ${t}`); return [t.slice(0, i), t.slice(i + 1)]; }));

const DRY = !!flag("dry-run");
const RT = flag("runtime"); if (!["pi", "antigravity"].includes(RT)) die("--runtime pi|antigravity required");
const TREES = pairsOf("tree"), LABELS = Object.keys(TREES), REVS = pairsOf("revision");
if (LABELS.length < 1 || LABELS.length > 2) die("--tree label=<export>: one tree, or two to pair");
const REPS = Number(flag("reps")); if (!Number.isInteger(REPS) || REPS < 1) die("--reps N required");
const SCEN = String(flag("scenario") || ""); const scenarios = SCEN.split(",").map(Number).filter(Boolean); if (!scenarios.length) die("--scenario N[,N] required");
const OUT = flag("out") && path.resolve(flag("out")); if (!OUT) die("--out <dir> required");
if (!DRY && !flag("accept-model-cost")) die("this runs real models and costs money: re-run with --accept-model-cost, or --dry-run for the plan");
for (const [l, t] of Object.entries(TREES)) {
  if (!fs.existsSync(path.join(t, "tools", "workspace", "cli.mjs"))) die(`${l}: not a harness: ${t}`);
  for (const f of [".env", "engagements"]) if (fs.existsSync(path.join(t, f))) die(`${l}: must be an export without ${f}: ${t}`);
}
const MAX_RUNS = Number(flag("max-runs", 120)), MAX_COST = Number(flag("max-cost-usd", 1));
const LEDGER = path.resolve(flag("ledger", path.join(OUT, "experiment.jsonl")));

// Model runs one cell can spend. On agy a refused shell adds a follow-up run in these units.
const UNITS = [[1, 2], [3, 5], [4, 12], [6], [7, 8], [9], [10], [11], [13], [14]];
const EXTRA_ON_AGY = new Set(["1,2", "4,12", "7,8"]);
const units = UNITS.filter((u) => u.some((s) => scenarios.includes(s)));
const RUNS_PER_CELL = units.reduce((a, u) => a + 1 + (RT === "antigravity" && EXTRA_ON_AGY.has(u.join(",")) ? 1 : 0), 0);

const readLedger = () => { try { return fs.readFileSync(LEDGER, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const keyOf = (c) => `${path.join(OUT, c.label)}#${c.rep}#${SCEN}`;
const FIRST_RESERVE = 0.01;
function spent(rows) {
  const costRows = rows.flatMap((r) => (r.runCosts || []).map((cost) => ({ cost })));
  return { runs: costRows.length, cost: chargedCost(costRows, FIRST_RESERVE), worst: Math.max(FIRST_RESERVE, ...costRows.map((r) => r.cost)) };
}

const done = new Set(readLedger().filter((r) => r.state !== "not-run").map((r) => r.key));
const cells = planCells(LABELS, REPS).map((c) => ({ ...c, key: keyOf(c) })).filter((c) => !done.has(c.key));
const before = spent(readLedger());
const plannedRuns = cells.length * RUNS_PER_CELL;
console.log(`plan: ${LABELS.join(" vs ")}, ${REPS} repetition(s), scenario ${SCEN}, ${cells.length} cell(s) left, up to ${RUNS_PER_CELL} model run(s) per cell`);
console.log(`cap: ${before.runs}+${plannedRuns} of ${MAX_RUNS} runs; US$${before.cost.toFixed(4)} spent of US$${MAX_COST}; ledger ${LEDGER}`);
if (RT === "antigravity") console.log("note: agy logs report no price, so only the run cap can bind");
if (before.runs + plannedRuns > MAX_RUNS) die(`plan refused: ${before.runs} spent + ${plannedRuns} planned > --max-runs ${MAX_RUNS}`, 3);

const SELF = path.dirname(fileURLToPath(import.meta.url)), RUNNER = path.join(SELF, "runtime-acceptance.mjs");
const childArgs = (c, cellOut) => [RUNNER, "--runtime", RT, "--harness", path.resolve(TREES[c.label]), "--out", cellOut, "--accept-model-cost", "--scenario", SCEN, "--max-runs", String(RUNS_PER_CELL),
  ...(REVS[c.label] ? ["--revision", REVS[c.label]] : []), ...["model", "provider", "timeout-s"].flatMap((f) => (flag(f) ? [`--${f}`, String(flag(f))] : []))];

if (DRY) { for (const c of cells) console.log(`  would run rep ${c.rep} ${c.label}: node ${childArgs(c, path.join(OUT, c.label, `rep-${c.rep}`)).join(" ")}`); process.exit(0); }

fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
const append = (row) => fs.appendFileSync(LEDGER, JSON.stringify(row) + "\n");
const readJsonl = (f) => { try { return fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };

let stopWhy = null, abortWhy = null, streak = 0, crashed = 0, notRun = 0, zeroCells = 0;
for (const c of cells) {
  const rows = readLedger(), s = spent(rows);
  const base = { key: c.key, rep: c.rep, label: c.label, scenario: SCEN, runtime: RT, revision: REVS[c.label] || null, at: new Date().toISOString() };
  const d = stopWhy ? { go: false, why: stopWhy } : budgetDecision({ runsSpent: s.runs, costSpent: s.cost, worstRunCost: s.worst, runsPerCell: RUNS_PER_CELL, maxRuns: MAX_RUNS, maxCostUsd: MAX_COST });
  if (!d.go) { stopWhy = d.why; notRun++; append({ ...base, state: "not-run", why: d.why, ...(abortWhy ? { abort: "provider-unreachable" } : {}), runCosts: [] }); console.log(`rep ${c.rep} ${c.label}: NOT RUN (${d.why})`); continue; }

  const cellOut = path.join(OUT, c.label, `rep-${c.rep}`);
  fs.mkdirSync(cellOut, { recursive: true });
  const r = spawnSync(process.execPath, childArgs(c, cellOut), { encoding: "utf8", env: process.env, maxBuffer: 1 << 26 });
  fs.writeFileSync(path.join(cellOut, "acceptance.log"), `${r.stdout || ""}\n${r.stderr || ""}`);
  const runs = readJsonl(path.join(cellOut, RT, "runs.jsonl"));
  let results = {}; try { results = JSON.parse(fs.readFileSync(path.join(cellOut, `results-${RT}.json`), "utf8")); } catch { /* crash: stays empty */ }
  const statuses = Object.fromEntries(scenarios.map((n) => [n, results[n]?.status ?? "NO RESULT"]));
  const tokens = runs.reduce((a, x) => a + (x.tokens || 0), 0);
  const state = !Object.keys(results).length ? "crashed" : runs.length && tokens === 0 && scenarios.every((n) => statuses[n] === "NOT RUN") ? "unmeasured" : "ran";
  if (state === "crashed") crashed++; if (state === "unmeasured") zeroCells++;
  // A crash may have burned a run that never reached its ledger: count one, priced by chargedCost at the dearest seen.
  const runCosts = runs.length ? runs.map((x) => x.cost || 0) : state === "crashed" ? [0] : [];
  append({ ...base, state, exitCode: r.status, statuses, runCosts, tokens, treeHash: runs[0]?.treeHash ?? null });
  console.log(`rep ${c.rep} ${c.label}: ${state} ${scenarios.map((n) => `S${n}=${statuses[n]}`).join(" ")} runs=${runCosts.length} cost=$${runCosts.reduce((a, x) => a + x, 0).toFixed(5)}`);
  const stop = /^stopped: (provider stop|anomalous)[^\n]*/m.exec(r.stdout || ""); if (stop) stopWhy = stop[0];
  streak = zeroTokenStreak(streak, { runs: runs.length, tokens });
  if (streak >= ZERO_TOKEN_ABORT && !stopWhy) stopWhy = abortWhy = `provider unreachable: ${streak} consecutive cells with 0 tokens`;
}

const all = readLedger().filter((r) => r.key.startsWith(OUT + path.sep) && r.scenario === SCEN);
const latest = [...new Map(all.map((r) => [r.key, r])).values()];
console.log("\nAll attempts, failures included:");
for (const n of scenarios) {
  const sum = summarizeCells(latest, String(n), LABELS);
  console.log(`S${n}: ${LABELS.map((l) => `${l} ${JSON.stringify(sum.byTree[l])}`).join("  ")}${sum.pairs ? `  pairs ${JSON.stringify(sum.pairs)}` : ""}`);
}
const end = spent(readLedger());
console.log(`total: ${end.runs} runs, US$${end.cost.toFixed(4)} charged, of ${MAX_RUNS} and US$${MAX_COST}${stopWhy && !abortWhy ? `; stopped: ${stopWhy}` : ""}`);
if (abortWhy) console.log(`aborted, not the cap: ${abortWhy}`);
process.exit(crashed || notRun || zeroCells ? 1 : 0);
