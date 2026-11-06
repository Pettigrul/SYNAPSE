#!/usr/bin/env node
// SecurityAuditor — Engagement/Caido operator CLI (pre-pilot).
//
// Thin wrapper over EXISTING capabilities (engagement.mjs helpers + the Bridge's caido.projects op).
// No new API/framework. Offline except `projects` (discovery, talks to Caido via the Bridge).
// Config auto-loads from <repo>/.env (native, environment wins); CAIDO_TOKEN loads only for `projects`, where the
// context allows it (env-loader.mjs). Values never printed.
//
// Usage:
//   node tools/workspace/cli.mjs init     --name <n> [--modality blackbox|graybox|whitebox] [--project-id <id>]
//   node tools/workspace/cli.mjs scope    --name <n> --file <scope.md>        # install & validate scope.md
//   node tools/workspace/cli.mjs associate --name <n> --project-id <id> [--project-name <pn>] [--force]
//   node tools/workspace/cli.mjs use      --name <n>                           # SELECT active engagement (session)
//   node tools/workspace/cli.mjs bootstrap [--name <n>] [--runtime claude|claude-code|agents|antigravity|pi|both]  # restore 9 dirs + operational docs (idempotent)
//   node tools/workspace/cli.mjs next      [--name <n>]                          # next eligible runtime task (Flow 11 rule; read-only)
//   node tools/workspace/cli.mjs active                                        # show the current active selection
//   node tools/workspace/cli.mjs clear                                         # clear the session selection
//   node tools/workspace/cli.mjs select   [--name <n>]                         # resolve + show (ctx fragment)
//   node tools/workspace/cli.mjs show     [--name <n>]
//   node tools/workspace/cli.mjs list
//   node tools/workspace/cli.mjs projects                                      # discover Caido projects
// Engagement base dir = SA_ENGAGEMENT_ROOT (or --root). Active engagement resolves as:
//   --name (this command) > pointer (`use`), which SA_ENGAGEMENT must match > SA_ENGAGEMENT alone, only in a plain directory or at the harness root > NONE.
//   In an activated project SA_ENGAGEMENT never selects by itself: nothing tells it from one left over from another client.
// The session is bound to the activated project (or the central harness); elsewhere there is NO selection unless
// SA_SESSION_ID is explicit, and `use`/`clear` refuse. SA_SESSION_ID isolates concurrent sessions, per project.

import fs from "node:fs";
import path from "node:path";
import {
  initEngagement, loadEngagement, associateCaidoProject, selectEngagement,
  validateScope, resolveProjectId, sanitizeName, WorkspaceError,
  setActiveEngagement, getActiveEngagement, clearActiveEngagement, listEngagements,
  bootstrapEngagement, parseTasks, resolveSessionId, findActivatedProject, assertRootOutsideHarness, noContextHelp, engagementConflictHelp, engagementOverrideNote, cleanForDisplay,
} from "./engagement.mjs";
import { loadScopedEnv } from "../preflight/env-loader.mjs";
import { createBridge } from "../web-runtime/bridge.mjs";
import { statusActivation } from "../activation/activate.mjs";
import { clearMode } from "../modes/mode.mjs";

loadScopedEnv(); // populate process.env from <repo>/.env (environment wins; SA_SKIP_ENV_FILE=1 skips it, for hermetic automation/tests)

function parse(argv) {
  const a = { cmd: argv[0] || "show", _: [] };
  for (let i = 1; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith("--")) { const k = t.slice(2); const v = (argv[i + 1] && !argv[i + 1].startsWith("--")) ? argv[++i] : true; a[k] = v; }
    else a._.push(t);
  }
  return a;
}
const rootOf = (a) => a.root || process.env.SA_ENGAGEMENT_ROOT || null;
const sessionOf = () => resolveSessionId();
function die(msg, code = 2) { console.error(`error: ${cleanForDisplay(msg)}`); process.exit(code); }
const c = cleanForDisplay; // manifest and state fields are data: each is cleaned where it prints
function needRoot(a) { const r = rootOf(a); if (!r) die("SA_ENGAGEMENT_ROOT not set (or pass --root) — base dir for engagements, OUTSIDE this repo"); return assertRootOutsideHarness(r); }
// Resolve the engagement name for a read/show command: explicit --name, else the ACTIVE selection
// (session pointer, which SA_ENGAGEMENT must match > SA_ENGAGEMENT alone outside a project). NEVER guesses — dies with an actionable message if none.
function resolveName(a, root) {
  if (a.name && a.name !== true) return a.name;
  const active = getActiveEngagement({ root, sessionId: sessionOf() });
  if (active.conflict) die(engagementConflictHelp(active.conflict));
  if (active.source === "env" && !active.confirmed && !active.unresolved) console.error(engagementOverrideNote(active.name));
  if (active.name) return active.name;
  if (active.noContext) die(noContextHelp());
  const cands = listEngagements(root).map((e) => e.name);
  die(`no active engagement selected — run: node tools/workspace/cli.mjs use --name <n>` + (cands.length ? ` (available: ${cands.join(", ")})` : " (none exist yet; create with: init --name <n>)"));
}

const USAGE = fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").filter((l) => /^\/\/\s+node tools\/workspace\/cli\.mjs /.test(l)).map((l) => l.slice(3)).join("\n");

async function main() {
  const a = parse(process.argv.slice(2));
  if (process.argv.slice(2).some((x) => x === "--help" || x === "-h")) { console.log(USAGE); return; } // never run a subcommand for --help

  if (a.cmd === "init") {
    const root = needRoot(a); if (!a.name || a.name === true) die("--name required");
    const r = initEngagement({ root, name: a.name, modality: a.modality || undefined, caidoProjectId: a["project-id"] || null });
    console.log(`${r.alreadyExisted ? "exists" : "created"}: ${r.dir}  [modality=${c(r.modality)}${r.caido && r.caido.projectId ? `, project=${c(r.caido.projectId)}` : ""}]`);
    if (!r.caido || !r.caido.projectId) console.log("next: add scope.md (scope --file ...) and associate a Caido project (associate --project-id ...)");
    return;
  }

  if (a.cmd === "scope") {
    const root = needRoot(a); if (!a.name || a.name === true) die("--name required");
    const eng = loadEngagement({ dir: path.join(root, sanitizeName(a.name)) });
    const dest = path.join(eng.dir, "scope.md");
    if (a.file && a.file !== true) {
      const v = validateScope(a.file); if (!v.ok) die(`invalid scope.md: ${v.errors.join("; ")}`);
      fs.copyFileSync(a.file, dest); console.log(`installed scope.md → ${dest} (valid)`);
    } else {
      const present = fs.existsSync(dest); const v = present ? validateScope(dest) : { ok: false, errors: ["absent"] };
      console.log(`scope.md: ${present ? (v.ok ? "present & valid" : `present but INVALID (${v.errors.join("; ")})`) : "ABSENT — pass --file <scope.md>"}`);
    }
    return;
  }

  if (a.cmd === "associate") {
    const root = needRoot(a); if (!a.name || a.name === true) die("--name required");
    if (!a["project-id"] || a["project-id"] === true) die("--project-id required (discover with: cli.mjs projects)");
    const eng = loadEngagement({ dir: path.join(root, sanitizeName(a.name)) });
    const r = associateCaidoProject(eng, { projectId: a["project-id"], projectName: a["project-name"] || null, operator: process.env.USER || null, force: !!a.force });
    console.log(`associated engagement '${a.name}' → Caido project ${c(r.caido.projectId)}${r.caido.projectName ? ` (${c(r.caido.projectName)})` : ""}`);
    return;
  }

  // Persist the active engagement for THIS session (dynamic selection, no .env edit needed).
  if (a.cmd === "use") {
    const root = needRoot(a);
    if (!sessionOf()) die(noContextHelp());
    if (!a.name || a.name === true) {
      const cands = listEngagements(root).map((e) => e.name);
      die(`--name required (exact engagement name; never guessed)` + (cands.length ? ` — available: ${cands.join(", ")}` : ""));
    }
    let r;
    try { r = setActiveEngagement({ root, name: a.name, sessionId: sessionOf(), operator: process.env.USER || null }); }
    catch (e) {
      if (e.code === "not-found") { const cands = listEngagements(root).map((c) => c.name); die(`no engagement named '${a.name}' (exact match required; not guessing)` + (cands.length ? ` — available: ${cands.join(", ")}` : "")); }
      throw e;
    }
    console.log(`active engagement set: ${r.name}  [${r.dir}]  (project: ${r.caidoProjectId ? `${c(r.caidoProjectId)} (${r.caidoProjectSource})` : "NONE — associate one"})`);
    const after = getActiveEngagement({ root, sessionId: sessionOf() });
    if (after.conflict) console.error(`⚠ SA_ENGAGEMENT=${cleanForDisplay(after.conflict.override)} is set here and conflicts with this selection, so commands will refuse until you unset it.`);
    if (r.switched) {
      clearMode({ engagement: { dir: r.dir, name: r.name }, sessionId: sessionOf() }); // documented in /modo: a switch returns to Copilot
      console.log(`\n⚠ switched from '${c(r.previous)}'. The previous engagement's operational context is now invalidated for NEW operations.`);
      console.log(`  This command does NOT purge any history already loaded in the current LLM session. To truly drop the`);
      console.log(`  prior engagement's context, start a CLEAN session (or restart the agent) before continuing.`);
    }
    return;
  }

  if (a.cmd === "active") {
    const root = rootOf(a);
    const active = getActiveEngagement({ root, sessionId: sessionOf() });
    if (active.conflict) { console.log(`no active engagement: ${engagementConflictHelp(active.conflict)}`); return; } // reports; the commands that act refuse
    if (active.noContext) die(noContextHelp());
    if (!active.name) { console.log("no active engagement (select one: use --name <n>; SA_ENGAGEMENT selects only outside an activated project)"); return; }
    console.log(`active: ${active.name}  (via ${active.source})${active.unresolved ? "  [UNRESOLVED — not found under root]" : ""}`);
    if (active.source === "env" && !active.confirmed && !active.unresolved) console.error(engagementOverrideNote(active.name));
    return;
  }

  if (a.cmd === "clear") {
    const root = needRoot(a);
    if (!sessionOf()) die(noContextHelp());
    clearActiveEngagement({ root, sessionId: sessionOf() });
    console.log("active engagement cleared (session). SA_ENGAGEMENT, if set, applies only outside an activated project.");
    return;
  }

  // Deterministic operational bootstrap/resume (S1). Resolves the active engagement
  // (or --name), validates scope, then creates ONLY the missing nine dirs + operational
  // documents (never overwrites, never invents tasks/findings, never touches the manifest/
  // evidence). This is what /iniciar-pentest runs BEFORE any recon so the operator never
  // prepares documents by hand. Controlled failure (exit 2) on an existing-but-invalid scope.
  if (a.cmd === "bootstrap") {
    const root = needRoot(a);
    const name = resolveName(a, root);
    const sel = selectEngagement({ root, name, envProjectId: process.env.CAIDO_PROJECT_ID || null });
    // No flag: follow the activation marker of the cwd project (skills call plain `bootstrap`).
    const declared = statusActivation({ projectDir: findActivatedProject() || process.cwd() }).runtimes || [];
    const runtime = (a.runtime && a.runtime !== true) ? a.runtime : declared.length > 1 ? "both" : (declared[0] || "claude");
    const rep = bootstrapEngagement({ dir: sel.dir, name: sel.name }, { runtime, operator: process.env.USER || null });
    const isNew = rep.created.length > 0 || rep.dirsCreated.length > 0;
    console.log(`bootstrap ${isNew ? "prepared" : "verified (already complete)"}: ${sel.name}  [${sel.dir}]`);
    if (rep.dirsCreated.length) console.log(`  dirs created   ${rep.dirsCreated.join(", ")}`);
    if (rep.created.length)     console.log(`  files created  ${rep.created.join(", ")}`);
    if (rep.selfHealed.length)  console.log(`  self-healed    ${rep.selfHealed.join(", ")} (prepended NATIVE-TOOLING preamble; content preserved)`);
    if (!isNew && !rep.selfHealed.length) console.log(`  (all ${rep.present.length} files + 9 dirs already present — nothing overwritten)`);
    // Resume orientation (Flow 8 Step 4): light read of persisted state — no new mechanism.
    // Strip HTML comments first so the template's commented-out EXAMPLES are not counted as real state.
    const count = (f, re) => { try { return ((fs.readFileSync(path.join(sel.dir, f), "utf8").replace(/<!--[\s\S]*?-->/g, "")).match(re) || []).length; } catch { return 0; } };
    const openTasks = count("toDoList.md", /^- \[ \] /gm);
    const userTasks = count("toDoList.md", /@user:/gm);
    const activeGadgets = count("ccGadgets.md", /^### GAD-\d/gm);
    const queuedLeads = count("ccLeads.md", /^### LEAD-\d/gm);
    console.log(`  scope.md       ${sel.scopePresent ? (sel.scopeValid ? "present & valid" : "present") : (rep.scope.created ? "created (template — fill ## In Scope)" : "ABSENT")}`);
    console.log(`  caido project  ${sel.caidoProjectId ? `${c(sel.caidoProjectId)} (${sel.caidoProjectSource})` : "none"}  (preserved; not modified)`);
    console.log(`  state (resume) open tasks=${openTasks}, @user tasks=${userTasks}, active gadgets=${activeGadgets}, queued leads=${queuedLeads}`);
    console.log(`\nReady for the full pentest. Route to the dispatcher (load scope / status / resume / what next) — do NOT start recon before this bootstrap.`);
    return;
  }

  // Deterministic "next task" selector over the EXISTING toDoList.md (Flow 11 rule). Read-only; selects,
  // does NOT execute. Supports skills-first "what next" (Copilot) and the supervised Autopilot loop's step
  // selection. @user tasks are surfaced but are NOT eligible runtime objectives.
  if (a.cmd === "next") {
    const root = needRoot(a);
    const sel = selectEngagement({ root, name: resolveName(a, root) });
    const tk = parseTasks({ dir: sel.dir });
    if (tk.nextRuntime) console.log(`next runtime task: ${c(tk.nextRuntime.id)} [${c(tk.nextRuntime.priority)}] — ${c(tk.nextRuntime.text)}`);
    else console.log(`next runtime task: (none) — stop criterion: no permitted executable runtime work queued`);
    console.log(`  tasks: open runtime=${tk.counts.openRuntime}, open @user=${tk.counts.openUser}, done=${tk.counts.doneRuntime}, ruled-out=${tk.counts.ruledOut}`);
    if (tk.counts.openUser) console.log(`  (@user tasks are NOT eligible runtime objectives — surface to the operator)`);
    return;
  }

  if (a.cmd === "select") {
    const root = needRoot(a);
    const sel = selectEngagement({ root, name: resolveName(a, root), envProjectId: process.env.CAIDO_PROJECT_ID || null });
    console.log(`active engagement: ${sel.name}  [${sel.dir}]`);
    console.log(`  modality      ${c(sel.modality)}`);
    console.log(`  scope.md      ${sel.scopePresent ? (sel.scopeValid ? "present & valid" : "present but INVALID") : "ABSENT"}`);
    console.log(`  caido project ${sel.caidoProjectId ? `${c(sel.caidoProjectId)} (${sel.caidoProjectSource})` : "NONE — associate one before Caido ops"}`);
    console.log(`  state dir     ${sel.statePaths.dir}`);
    console.log(`  evidence dir  ${sel.evidenceDir}  (persistent audit evidence; created on first write)`);
    console.log(`\nExecution Context fragment (operator builds the ctx; projectId comes from the engagement):`);
    console.log("  " + JSON.stringify({ [`eng:${sel.name}`]: { scope: { allowHosts: ["<hosts from ## In Scope of scope.md>"] }, allowedCapabilities: ["caido", "copilot", "investigation"], approvals: [], caido: { baseUrl: "<CAIDO_BASE_URL value>", token: "<CAIDO_TOKEN value: env refs are NOT expanded>", projectId: sel.caidoProjectId || null }, evidenceDir: sel.evidenceDir } }));
    console.log(`\nMake it active for this session:  node tools/workspace/cli.mjs use --name ${sel.name}`);
    console.log(`(automation outside an activated project: export SA_ENGAGEMENT=${sel.name})`);
    return;
  }

  if (a.cmd === "show") {
    const root = needRoot(a);
    const sel = selectEngagement({ root, name: resolveName(a, root), envProjectId: process.env.CAIDO_PROJECT_ID || null });
    console.log(JSON.stringify({ name: sel.name, dir: sel.dir, modality: sel.modality, kind: sel.kind, scopePresent: sel.scopePresent, scopeValid: sel.scopeValid, caidoProjectId: sel.caidoProjectId, caidoProjectSource: sel.caidoProjectSource, statePaths: sel.statePaths, evidenceDir: sel.evidenceDir }, null, 2));
    return;
  }

  if (a.cmd === "list") {
    const root = needRoot(a);
    const engs = listEngagements(root);
    if (!engs.length) { console.log(`(no engagements under ${root})`); return; }
    const active = getActiveEngagement({ root, sessionId: sessionOf() });
    for (const e of engs) {
      const mark = active.name === e.name ? "*" : " ";
      console.log(` ${mark} ${cleanForDisplay(e.name).padEnd(24)} modality=${c(e.modality || "?")}  project=${e.caidoProjectId ? `${c(e.caidoProjectId)}(${e.caidoProjectSource})` : "none"}  kind=${e.kind}`);
    }
    if (active.conflict) console.log(`\n(${engagementConflictHelp(active.conflict)})`);
    else if (active.name) console.log(`\n(* = active, via ${active.source})`); else console.log(active.noContext ? `\n(${noContextHelp()})` : `\n(no active engagement — select: use --name <n>)`);
    return;
  }

  if (a.cmd === "projects") {
    const envLoad = loadScopedEnv({ need: ["caido"] });
    const baseUrl = process.env.CAIDO_BASE_URL, token = process.env.CAIDO_TOKEN;
    if (!token && envLoad.withheld.includes("CAIDO_TOKEN")) die(`CAIDO_TOKEN withheld: ${envLoad.caidoDenied} (or export it for this command)`);
    if (!baseUrl || !token) die("CAIDO_BASE_URL and CAIDO_TOKEN required (instance config) — set them in .env");
    const bridge = createBridge();
    try {
      const investigationId = `discover-${Date.now()}`;
      // Discovery only: caido.projects is NOT association-gated and does not expose project data.
      bridge.openInvestigation({ investigationId, scope: { discovery: true }, allowedCapabilities: ["caido"], caido: { baseUrl, token, projectId: null } });
      const env = await bridge.invoke({ investigationId, op: "caido.projects" });
      if (!env.ok) die(`caido.projects failed: ${env.error.code} — ${env.error.message}`, 1);
      const r = env.result;
      if (!r.available) { console.log(`projects listing unavailable (${c(r.reason || "cloud-only")}); current project only:`); }
      for (const p of (r.projects || [])) console.log(`  ${c(p.id).padEnd(38)} ${c(p.name || "")}${p.readOnly ? " [read-only]" : ""}`);
      if (!(r.projects || []).length) console.log("  (none)");
      console.log(`\nAssociate one:  node tools/workspace/cli.mjs associate --name <engagement> --project-id <id>`);
    } finally { try { await bridge.shutdown(); } catch { /* ignore */ } }
    return;
  }

  die(`unknown command: ${a.cmd} (init|scope|associate|use|active|clear|bootstrap|next|select|show|list|projects)`);
}

main().catch((e) => {
  if (e instanceof WorkspaceError) die(`${e.code}: ${e.message}`, 2);
  die(String(e && e.message || e), 1);
});
