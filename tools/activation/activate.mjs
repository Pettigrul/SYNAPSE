// SecurityAuditor — P2: Project-Scoped Runtime Activation (core, pure fs; no LLM, no offensive ops).
//
// Activates the CENTRAL harness inside an external project by creating PROJECT-SCOPED SYMLINKS to the
// single central implementation — nothing is duplicated (the 127 KB bodies, the dispatcher, tools and
// policies are LINKED, never copied) and NOTHING global is touched. Deactivation removes only what the
// activation created (tracked in a marker) and never deletes engagement/pentest data.
//
// Mechanism is the one sanctioned by adapters/claude-code.md (`.claude/skills/` of an activated project).
// Runtime recognition by the live app is NOT asserted here — only the file/contract layer (see tests).

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

export class ActivationError extends Error { constructor(code, msg) { super(msg); this.code = code; this.name = "ActivationError"; } }

export const MARKER = ".hackbot-activation.json";
// The Caido decision lives beside the central .env, never in the project: whoever controls a project controls its marker,
// so nothing in it (a caido field included) can authorize a credential. Harness-local on purpose: this harness's .env holds
// the token this file releases, so each harness copy has its own decisions. The engagement root was rejected because it can be
// set per shell or sit inside the analyzed project; a hash or signature was rejected because there is no trusted key to check it.
// The name matches the .env* rule of .gitignore. Keys are real paths, so a moved or copied project starts without an opt-in.
// LIMIT: this protects against project CONTENT. A process with this user's shell reads .env and edits this file directly.
// A directory replaced after the grant by another one at the same path inherits the grant: undetectable without more.
export const CAIDO_OPT_INS = ".env.caido-opt-ins.json";
// Resources linked into the project so it behaves like the central root (Claude Code + the operational CLIs).
// Order matters for creation; deactivation reverses it. `.claude/*` are the Claude Code discovery points.
export const LINKS = [
  "tools", "references", "workflows", "skills", "policies", "agents", "reports", "SKILL.md",
  ".claude/skills", ".claude/hooks", ".claude/settings.json",
];
// Extra discovery points per declared runtime, verified against real Pi 1.4 and agy 1.5 runs. Both load AGENTS.md
// (a thin pointer to SKILL.md). Pi resolves .pi/settings.json from the PROJECT's .pi/, so it wires the project's own
// links; agy reads .agents/skills (a tracked dir of links: the 13 skills plus security-auditor -> SKILL.md, no copy).
// Nothing global.
export const RUNTIME_LINKS = { pi: ["AGENTS.md", ".pi/settings.json"], antigravity: ["AGENTS.md", ".agents/skills"] };

// The central harness = where this code lives (tools/activation → repo root). No global lookup.
export function hackbotHome() { return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."); }

// Real path that tolerates a missing tail: a moved project's old path still names its opt-in.
function realKey(p) {
  try { return fs.realpathSync(p); }
  catch { const parent = path.dirname(p); return parent === p ? p : path.join(realKey(parent), path.basename(p)); }
}

// Reject project dirs that are the operator's HOME or live under a runtime's GLOBAL config dir. Both the given and the real
// path count: --force through a link to the harness would otherwise move its tools/ aside.
function assertSafeProject(projectDir, home) {
  const given = path.resolve(projectDir);
  const home_ = os.homedir();
  const globals = [".claude", ".pi", ".gemini", ".config", ".codex"].map((d) => path.join(home_, d));
  const Hs = [path.resolve(home), realKey(path.resolve(home))];
  for (const p of [given, realKey(given)]) {
    if (p === home_) throw new ActivationError("unsafe-target", `refusing to activate in \$HOME itself: ${p}`);
    for (const g of globals) if (p === g || p.startsWith(g + path.sep)) throw new ActivationError("unsafe-target", `refusing to write under a global runtime dir: ${p} (no global installation)`);
    for (const H of Hs) {
      if (p === H) throw new ActivationError("inside-harness", "project IS the central harness — run HackBot directly from the repo root; no activation needed");
      if (p.startsWith(H + path.sep) || H.startsWith(p + path.sep)) throw new ActivationError("inside-harness", `project overlaps the central harness tree (${H}); use a separate external directory`);
    }
  }
  return given;
}

// ---- marker: project-editable data, so it is validated before anything acts on it, and it authorizes nothing ----

const safeRel = (r) => typeof r === "string" && r !== "" && !path.isAbsolute(r) && !path.win32.isAbsolute(r) && !r.split(/[\\/]/).includes("..");
const isMap = (v) => !!v && typeof v === "object" && !Array.isArray(v);
function markerProblem(m) {
  if (!isMap(m)) return "it is not a JSON object";
  if (typeof m.hackbotHome !== "string" || !m.hackbotHome) return "hackbotHome must be a path";
  if (!Array.isArray(m.links) || !m.links.every(safeRel)) return "links must be a list of paths inside the project";
  if (m.backups !== undefined && !(isMap(m.backups) && Object.entries(m.backups).every(([k, v]) => safeRel(k) && safeRel(v)))) return "backups must map paths inside the project";
  if (m.createdDirs !== undefined && !(Array.isArray(m.createdDirs) && m.createdDirs.every(safeRel))) return "createdDirs must be a list of paths inside the project";
  return null;
}
// Project and engagement data reach a terminal or a model: control and bidi characters must not forge output. U+FFFD, not "_": sanitizeName
// maps "_"-like characters together, so a cleaned name must never be able to name another engagement.
export function cleanForDisplay(s) {
  return String(s).replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "\ufffd");
}

// { state: "absent" } | { state: "invalid", reason, link? } | { state: "ok", marker }. The reason never quotes the file.
// lstat first: a marker that is a link is project content pointing elsewhere. Following it would read another file as this
// project's marker, and a later write would land outside the project. Anything but a regular file is refused too (a FIFO would hang the read).
export function readMarker(projectDir) {
  const f = path.join(projectDir, MARKER);
  let text;
  try {
    const st = fs.lstatSync(f);
    if (st.isSymbolicLink()) return { state: "invalid", reason: "it is a symbolic link", link: true };
    if (!st.isFile()) return { state: "invalid", reason: "it is not a regular file" };
    text = fs.readFileSync(f, "utf8");
  }
  catch (e) { return e.code === "ENOENT" || e.code === "ENOTDIR" ? { state: "absent" } : { state: "invalid", reason: `it can't be read (${e.code})` }; }
  let m; try { m = JSON.parse(text); } catch { return { state: "invalid", reason: "it is not valid JSON" }; }
  const reason = markerProblem(m);
  return reason ? { state: "invalid", reason } : { state: "ok", marker: m };
}
const markerHelp = (p, reason) => `the activation marker in ${p} is invalid: ${reason}. Nothing was changed. To repair: tools/activation/cli.mjs deactivate --project ${p} --repair (removes only this harness's links without following any, keeps your files and the old marker as ${MARKER}.invalid; a marker that is a link is just removed), then activate again`;
// Lexical checks can't see a symlinked parent: sub/x with sub -> elsewhere must not reach outside the project.
function staysInside(p, rel) {
  try { const base = fs.realpathSync(p), parent = fs.realpathSync(path.dirname(path.join(p, rel))); return parent === base || parent.startsWith(base + path.sep); }
  catch { return false; }
}

// ---- Caido opt-in (see CAIDO_OPT_INS) ----

const optInsPath = (home) => path.join(path.resolve(home), CAIDO_OPT_INS);
// { projects } | { error }. Absent is normal (no decisions); anything else unusable fails closed.
function readOptIns(home) {
  let text;
  try { text = fs.readFileSync(optInsPath(home), "utf8"); }
  catch (e) { return e.code === "ENOENT" ? { projects: {} } : { error: `can't be read (${e.code})` }; }
  let m; try { m = JSON.parse(text); } catch { return { error: "is not valid JSON" }; }
  if (!isMap(m) || m.version !== 1 || !isMap(m.projects)) return { error: "has an unexpected format" };
  return { projects: m.projects };
}
const optInsHelp = (home, why) => `the Caido opt-in file ${optInsPath(home)} ${why}, so no project gets CAIDO_TOKEN from the central .env. Fix it, or move it away and re-run activate --caido per project (without the file there are no opt-ins)`;
export function caidoOptIn({ home = hackbotHome(), projectDir }) {
  const r = readOptIns(home);
  if (r.error) return { granted: false, error: optInsHelp(home, r.error) };
  const key = realKey(path.resolve(projectDir));
  return { granted: Object.hasOwn(r.projects, key) && isMap(r.projects[key]) && r.projects[key].granted === true };
}
// Returns whether the file changed. Never creates the file just to record that nothing is granted.
function recordOptIn(home, projectDir, grant, operator) {
  const r = readOptIns(home);
  if (r.error) throw new ActivationError("caido-config-invalid", optInsHelp(home, r.error));
  const key = realKey(path.resolve(projectDir));
  if (!grant && !Object.hasOwn(r.projects, key)) return false;
  if (grant) r.projects[key] = { granted: true, at: new Date().toISOString(), by: operator || null }; else delete r.projects[key];
  const f = optInsPath(home), tmp = `${f}.tmp-${process.pid}`;
  try { fs.writeFileSync(tmp, JSON.stringify({ version: 1, projects: r.projects }, null, 2) + "\n", { mode: 0o600 }); fs.renameSync(tmp, f); }
  catch (e) { try { fs.unlinkSync(tmp); } catch { /* nothing to clean */ } throw new ActivationError("caido-config-write", `the Caido opt-in decision was NOT recorded in ${f} (${e.code || "write failed"}): fix its permissions and re-run`); }
  return true;
}
// Why this project gets no token, for a denial or `status`. A forged marker can trigger this text and nothing else, so it asks for trust.
export function caidoGuidance(s) {
  const grant = `If you trust this project, the operator runs: tools/activation/cli.mjs activate --project ${s.projectDir} --caido`;
  if (s.caidoError) return s.caidoError;
  if (s.caidoGranted && !s.healthy) return `project ${s.projectDir} has a Caido opt-in, but its links aren't intact or don't point at this harness (check tools/activation/cli.mjs status); re-run activate there`;
  if (s.caidoGranted && !s.caido) return `project ${s.projectDir} has a Caido opt-in, but its marker points at another harness; re-run activate there with this harness`;
  const legacy = s.legacyCaido ? " The caido field in its marker is no longer honored: the decision moved out of the project." : "";
  return `project ${s.projectDir} has no Caido opt-in for this harness.${legacy} Opt-ins follow the real path, so a moved, renamed or copied project needs a new one. ${grant}`;
}

// Project-supplied resources that a runtime loads once the project is trusted (Pi security docs; agy changelog), or
// that load regardless (context files). Code can run from them, so the operator reviews them before trusting: this
// reports, it does not judge or block. Our own links are excluded. Pi also takes .agents/skills and context files from ancestors.
const RUNTIME_CONFIG = [
  [".pi/settings.json", "gated"], [".pi/mcp.json", "gated"], [".pi/extensions", "executable"], [".pi/skills", "gated"],
  [".pi/prompts", "gated"], [".pi/themes", "gated"], [".pi/SYSTEM.md", "gated"], [".pi/APPEND_SYSTEM.md", "gated"],
  [".agents/skills", "gated"], [".agents/skills.json", "gated"], [".agents/plugins.json", "executable"], [".agents/hooks.json", "executable"],
  [".agents/rules", "gated"], [".agents/rules.json", "gated"], [".agents/agents", "gated"], [".agents/agents.json", "gated"],
  ["AGENTS.override.md", "context"], ["CLAUDE.md", "context"], ["AGENTS.md", "context"],
];
export function auditRuntimeConfig({ projectDir }) {
  const p = path.resolve(projectDir);
  const lexists = (f) => { try { fs.lstatSync(f); return true; } catch { return false; } };
  const r = readMarker(p); const links = r.state === "ok" ? r.marker.links : [];
  const found = RUNTIME_CONFIG.filter(([rel]) => !links.includes(rel) && lexists(path.join(p, rel))).map(([rel, kind]) => ({ path: rel, kind }));
  for (let d = path.dirname(p); d !== path.dirname(d) && d !== os.homedir(); d = path.dirname(d)) {
    if (lexists(path.join(d, ".agents", "skills"))) found.push({ path: path.join(d, ".agents", "skills"), kind: "gated" });
    for (const f of ["AGENTS.override.md", "AGENTS.md", "CLAUDE.md"]) if (lexists(path.join(d, f))) found.push({ path: path.join(d, f), kind: "context" });
  }
  return found;
}

const isOurLink = (dest, src) => { try { return fs.lstatSync(dest).isSymbolicLink() && path.resolve(path.dirname(dest), fs.readlinkSync(dest)) === path.resolve(src); } catch { return false; } };

export function statusActivation({ projectDir, home = hackbotHome() }) {
  const p = path.resolve(projectDir);
  const read = readMarker(p);
  if (read.state === "absent") return { activated: false, projectDir: p };
  if (read.state === "invalid") return { activated: false, projectDir: p, corrupt: true, reason: read.reason, help: markerHelp(p, read.reason).replace(" Nothing was changed.", "") };
  const m = read.marker;
  const links = m.links.map((rel) => {
    const dest = path.join(p, rel), src = path.join(m.hackbotHome, rel);
    return { rel, healthy: isOurLink(dest, src), src };
  });
  const opt = caidoOptIn({ home, projectDir: p });
  const sameHarness = path.isAbsolute(m.hackbotHome) && realKey(m.hackbotHome) === realKey(path.resolve(home));
  return { activated: true, projectDir: p, hackbotHome: m.hackbotHome, runtimes: Array.isArray(m.runtimes) ? m.runtimes.filter((r) => typeof r === "string") : [], mcp: !!m.mcp, caido: opt.granted && sameHarness, caidoGranted: opt.granted, caidoError: opt.error || null, legacyCaido: m.caido === true, created: m.created || null, links, healthy: links.length > 0 && links.every((l) => l.healthy) };
}

export function activate({ projectDir, home = hackbotHome(), force = false, operator = null, runtimes: runtimesArg = null, mcp = false, caido = null } = {}) {
  const H = path.resolve(home);
  if (!fs.existsSync(path.join(H, "SKILL.md")) || !fs.existsSync(path.join(H, "tools", "workspace", "cli.mjs"))) {
    throw new ActivationError("bad-home", `central harness not found at ${H} (missing SKILL.md/tools) — pass a valid --home`);
  }
  const p = assertSafeProject(projectDir, H);
  if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) throw new ActivationError("no-project", `project directory does not exist: ${p}`);

  const read = readMarker(p);
  if (read.state === "invalid") throw new ActivationError("invalid-marker", markerHelp(p, read.reason));
  const existing = read.state === "ok" ? read.marker : null;
  // Refused now, before any link changes: a decision that can't be recorded must not half-apply.
  if (caido !== null) { const o = readOptIns(H); if (o.error) throw new ActivationError("caido-config-invalid", optInsHelp(H, o.error)); }
  const runtimes = runtimesArg || (existing && Array.isArray(existing.runtimes) && existing.runtimes.filter((r) => typeof r === "string")) || ["claude-code"];
  const backups = existing && existing.backups ? { ...existing.backups } : {};
  const createdDirs = existing && existing.createdDirs ? [...existing.createdDirs] : [];

  // Decide the link set (only resources that actually exist centrally).
  const wanted = [...new Set([...LINKS, ...runtimes.flatMap((r) => (Object.hasOwn(RUNTIME_LINKS, r) ? RUNTIME_LINKS[r] : []))])].filter((rel) => fs.existsSync(path.join(H, rel)));
  if (mcp && fs.existsSync(path.join(H, ".mcp.json"))) wanted.push(".mcp.json");

  // A repository's own .claude -> ~/.claude would otherwise turn this into a global install.
  for (const rel of wanted) {
    const parent = path.dirname(rel);
    if (parent !== "." && isSymlinkDangling(path.join(p, parent)) && !staysInside(p, path.join(parent, "x"))) throw new ActivationError("unsafe-target", `${parent} in ${p} leads outside the project; refusing to write through it. Replace that link with a directory, or run from the harness root`);
  }

  // First pass: detect conflicts (pre-existing NON-ours content at a target).
  const conflicts = [];
  for (const rel of wanted) {
    const dest = path.join(p, rel), src = path.join(H, rel);
    if (!fs.existsSync(dest) && !isSymlinkDangling(dest)) continue;        // free slot
    if (isOurLink(dest, src)) continue;                                     // already ours (idempotent)
    // A backup already holds the operator's earlier file, so this is newer content: never overwrite or delete it.
    if (backups[rel] && fs.existsSync(dest)) throw new ActivationError("conflict", `${rel} has new content and a backup already exists at ${backups[rel]} — move one of them first`);
    // A .hackbot-bak not in the marker (kept by a deactivate) is the operator's only copy: --force must not overwrite it.
    if (!backups[rel] && isSymlinkDangling(dest + ".hackbot-bak")) throw new ActivationError("conflict", `${rel}.hackbot-bak already exists — move it first`);
    conflicts.push(rel);
  }
  if (conflicts.length && !force) throw new ActivationError("conflict", `pre-existing content would be overwritten: ${conflicts.join(", ")} — re-run with --force to back them up (restored on deactivate)`);

  // Re-activation with another runtime set: drop our links no longer wanted, or deactivate would lose track of them.
  // After the conflict check, so a refused activation changes nothing.
  for (const rel of (existing && existing.links) || []) {
    if (wanted.includes(rel) || !staysInside(p, rel) || !isOurLink(path.join(p, rel), path.join(H, rel))) continue;
    fs.unlinkSync(path.join(p, rel));
    if (backups[rel] && staysInside(p, backups[rel]) && fs.existsSync(path.join(p, backups[rel]))) { fs.renameSync(path.join(p, backups[rel]), path.join(p, rel)); delete backups[rel]; } // the operator's file returns with the link gone
  }
  for (const relDir of [...createdDirs].sort((a, b) => b.length - a.length)) {
    const d = path.join(p, relDir);
    if (!staysInside(p, relDir)) continue;
    try { if (fs.existsSync(d) && fs.readdirSync(d).length === 0) fs.rmdirSync(d); } catch { /* keep non-empty */ }
  }

  // Ensure parent dirs for .claude/* links; track dirs we create so deactivate can clean empties.
  for (const rel of wanted) {
    const parent = path.dirname(path.join(p, rel));
    if (parent !== p && !fs.existsSync(parent)) { fs.mkdirSync(parent, { recursive: true }); const relParent = path.relative(p, parent); if (!createdDirs.includes(relParent)) createdDirs.push(relParent); }
  }

  // Second pass: create links, backing up conflicts under --force.
  const links = [];
  for (const rel of wanted) {
    const dest = path.join(p, rel), src = path.join(H, rel);
    if (isOurLink(dest, src)) { links.push(rel); continue; }
    if ((fs.existsSync(dest) || isSymlinkDangling(dest))) {
      if (!force) throw new ActivationError("conflict", `unexpected content at ${rel}`);
      if (!backups[rel]) { const bak = dest + ".hackbot-bak"; fs.renameSync(dest, bak); backups[rel] = rel + ".hackbot-bak"; }
      else { fs.rmSync(dest, { recursive: true, force: true }); }
    }
    fs.symlinkSync(src, dest);     // absolute symlink into the central harness (no duplication)
    links.push(rel);
  }

  const marker = {
    version: 1, hackbotHome: H, created: existing?.created || new Date().toISOString(), updated: new Date().toISOString(),
    operator: operator || existing?.operator || null, runtimes, mcp: !!(mcp && fs.existsSync(path.join(H, ".mcp.json"))),
    links, backups, createdDirs,
    note: "Activation LINKS the central harness (no copy, no global install). Does NOT select an engagement or authorize any target. Remove with: deactivate.",
  };
  // Never through whatever sits at that path: a fresh file (wx doesn't follow links) renamed over it replaces the entry itself, so
  // a link or hard link swapped in after the check above still can't redirect this write outside the project.
  const markerTmp = path.join(p, `${MARKER}.tmp-${process.pid}`);
  try { fs.writeFileSync(markerTmp, JSON.stringify(marker, null, 2) + "\n", { flag: "wx" }); fs.renameSync(markerTmp, path.join(p, MARKER)); }
  catch (e) { if (["EACCES", "EPERM", "EROFS"].includes(e.code)) throw e; throw new ActivationError("marker-write", `the marker in ${p} could not be written (${e.code}); if ${MARKER}.tmp-${process.pid} is there, move it away, then deactivate --repair and activate again`); }
  if (caido !== null) recordOptIn(H, p, caido === true, operator); // null keeps the operator's earlier decision; a caido field in the old marker is NOT migrated
  const opt = caidoOptIn({ home: H, projectDir: p });
  return { projectDir: p, hackbotHome: H, links, backedUp: Object.keys(backups), mcp: marker.mcp, caido: opt.granted, caidoError: opt.error || null, legacyCaidoDropped: existing?.caido === true && !opt.granted, optInFile: optInsPath(H), runtimes, runtimeConfig: auditRuntimeConfig({ projectDir: p }) };
}

// Best effort: leaving the project must not depend on the opt-in file, and the caller says when it couldn't revoke.
function revokeForDeactivate(home, p) {
  try { return { caidoRevoked: recordOptIn(home, p, false) }; }
  catch (e) { return { caidoRevoked: false, caidoWarning: e.message }; }
}

// Way out of a marker that can't be trusted, or of links left without one. It ignores the marker's content: only this harness's
// links at the known positions go. Backups and directories stay, since nothing says they are ours; the bad marker stays too, renamed.
function repair(p, home, read) {
  const H = path.resolve(home), removed = [], keptBackups = [];
  for (const rel of new Set([...LINKS, ...Object.values(RUNTIME_LINKS).flat(), ".mcp.json"])) {
    if (!staysInside(p, rel)) continue;
    if (isOurLink(path.join(p, rel), path.join(H, rel))) { fs.unlinkSync(path.join(p, rel)); removed.push(rel); }
    if (isSymlinkDangling(path.join(p, `${rel}.hackbot-bak`))) keptBackups.push(`${rel}.hackbot-bak`);
  }
  const revoked = revokeForDeactivate(H, p);
  let markerKept = null, markerLinkRemoved = false;
  if (read.link) { fs.unlinkSync(path.join(p, MARKER)); markerLinkRemoved = true; } // the link itself; its target is never opened
  else if (read.state === "invalid") {
    markerKept = `${MARKER}.invalid`;
    for (let i = 1; isSymlinkDangling(path.join(p, markerKept)); i++) markerKept = `${MARKER}.invalid.${i}`;
    fs.renameSync(path.join(p, MARKER), path.join(p, markerKept));
  } else if (!removed.length && !revoked.caidoRevoked) throw new ActivationError("not-activated", `no activation marker and no links of this harness in ${p} (nothing to repair)`);
  return { projectDir: p, repaired: true, removed, restored: [], keptBackups, skipped: [], markerKept, markerLinkRemoved, dataPreserved: true, ...revoked };
}

export function deactivate({ projectDir, home = hackbotHome(), repair: wantRepair = false } = {}) {
  const p = path.resolve(projectDir);
  const markerPath = path.join(p, MARKER);
  const read = readMarker(p);
  if (wantRepair && read.state !== "ok") return repair(p, home, read);
  if (read.state === "invalid") throw new ActivationError("invalid-marker", markerHelp(p, read.reason));
  if (read.state === "absent") {
    // A project moved away leaves its opt-in under the old path: this is the way to drop it.
    const revoked = revokeForDeactivate(home, p);
    if (revoked.caidoRevoked) return { projectDir: p, removed: [], restored: [], keptBackups: [], skipped: [], dataPreserved: true, notActivated: true, caidoRevoked: true };
    throw new ActivationError("not-activated", `no activation marker in ${p} (nothing to deactivate)`);
  }
  const m = read.marker;
  const removed = [], restored = [], keptBackups = [], skipped = [];
  // Remove ONLY symlinks we created that still point into the recorded home (never operator's real files).
  for (const rel of m.links) {
    const dest = path.join(p, rel), src = path.join(m.hackbotHome, rel);
    if (!staysInside(p, rel)) { if (isSymlinkDangling(dest)) skipped.push(rel); continue; }
    if (isOurLink(dest, src)) { fs.unlinkSync(dest); removed.push(rel); }
  }
  // Restore backups.
  for (const [rel, bakRel] of Object.entries(m.backups || {})) {
    const dest = path.join(p, rel), bak = path.join(p, bakRel);
    if (!staysInside(p, rel) || !staysInside(p, bakRel)) { skipped.push(rel); continue; }
    if (!fs.existsSync(bak) && !isSymlinkDangling(bak)) continue;
    if (fs.existsSync(dest)) { keptBackups.push(bakRel); continue; }                 // our link is gone, so this is the operator's newer file: keep both
    if (isSymlinkDangling(dest)) fs.unlinkSync(dest);
    fs.renameSync(bak, dest); restored.push(rel);
  }
  // Remove dirs we created, only if now empty (e.g. .claude/ we made).
  for (const relDir of [...(m.createdDirs || [])].sort((a, b) => b.length - a.length)) {
    const d = path.join(p, relDir);
    if (!staysInside(p, relDir)) continue;
    try { if (fs.existsSync(d) && fs.readdirSync(d).length === 0) fs.rmdirSync(d); } catch { /* keep non-empty */ }
  }
  fs.unlinkSync(markerPath);
  // Engagement/pentest data lives under SA_ENGAGEMENT_ROOT (or <project> buckets), NEVER in these links — untouched.
  return { projectDir: p, removed, restored, keptBackups, skipped, dataPreserved: true, ...revokeForDeactivate(home, p) };
}

function isSymlinkDangling(p) { try { fs.lstatSync(p); return true; } catch { return false; } }
