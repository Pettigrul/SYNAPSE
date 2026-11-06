// Pentest Engagement Workspace — deterministic, offline, zero-dependency.
//
// Adds, on top of the existing scope.md/Flow-8 workspace convention, a thin
// engagement manifest that makes modality, Caido association and Whitebox
// segregation first-class and CODE-ENFORCED at the module boundary.
//
// Design constraints honored here:
//  - Backward compatible: never overwrites existing files; adopts legacy
//    workspaces by adding a manifest without migrating their contents.
//  - No eager empty directories: buckets are created lazily on first write.
//  - Engagement lives under an operator ENGAGEMENT_ROOT, NOT inside this repo.
//  - Whitebox access is gated by code (whitebox-guard.mjs) + audited, NOT by
//    prompt text. See the handbook for the residual tool-layer limitation.

import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { decideWhiteboxAccess, WHITEBOX_DIR } from "./whitebox-guard.mjs";

export { WHITEBOX_DIR } from "./whitebox-guard.mjs";
export const WORKSPACE_SCHEMA = 1;
export const MANIFEST_NAME = ".engagement.json";
export const AUDIT_LOG = ".whitebox-access.log";
export const MODALITIES = Object.freeze(["blackbox", "graybox", "whitebox"]);
export const DEFAULT_MODALITY = "blackbox";

// Standard numbered buckets — preserved verbatim from the current contract
// (references/template-files.md ## Numbered directories).
export const BUCKETS = Object.freeze({
  reports: "1-Reports", findings: "2-Findings", recon: "3-Recon",
  analysis: "4-Analysis", scripts: "5-Scripts", lists: "6-Lists",
  random: "7-Random", archive: "8-Archive", trash: "9-Trashcan",
});

export class WorkspaceError extends Error {
  constructor(code, message) { super(message); this.name = "WorkspaceError"; this.code = code; }
}
export class WhiteboxAccessError extends WorkspaceError {
  constructor(message) { super("whitebox-access-denied", message); this.name = "WhiteboxAccessError"; }
}

// Mirror the portable-filename sanitizer (template-files.md safe_name).
export function sanitizeName(name) {
  let n = String(name == null ? "" : name).replace(/[?*:"<>|\\/]/g, "_").replace(/[&=]/g, "-");
  n = n.replace(/_+/g, "_").replace(/^[_.]+|[_.]+$/g, "").toLowerCase();
  if (!n) throw new WorkspaceError("bad-name", "engagement name sanitizes to empty");
  return n;
}

function readManifest(engDir) {
  const p = path.join(engDir, MANIFEST_NAME);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { throw new WorkspaceError("bad-manifest", `corrupt manifest at ${p}: ${e.message}`); }
}

function writeManifest(engDir, manifest) {
  fs.writeFileSync(path.join(engDir, MANIFEST_NAME), JSON.stringify(manifest, null, 2) + "\n");
}

function appendAudit(engDir, entry) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n";
  try { fs.appendFileSync(path.join(engDir, AUDIT_LOG), line); } catch { /* audit best-effort */ }
}

const LEGACY_MARKERS = ["scope.md", "ccGadgets.md", "ccLeads.md", "1-Reports", "3-Recon"];

// "managed" (has manifest) | "legacy" (old workspace, no manifest) | "empty".
export function detectWorkspace(engDir) {
  if (!fs.existsSync(engDir)) return "empty";
  if (fs.existsSync(path.join(engDir, MANIFEST_NAME))) return "managed";
  if (LEGACY_MARKERS.some((m) => fs.existsSync(path.join(engDir, m)))) return "legacy";
  return "empty";
}

// Minimal structural validation of a scope.md (text or path). No network.
export function validateScope(scope) {
  let text = scope;
  if (typeof scope === "string" && !scope.includes("\n") && fs.existsSync(scope)) {
    text = fs.readFileSync(scope, "utf8");
  }
  const errors = [];
  if (!text || typeof text !== "string" || !text.trim()) {
    return { ok: false, errors: ["empty scope"] };
  }
  if (!/^#\s+Scope\b/m.test(text)) errors.push("missing '# Scope' title");
  if (!/^##\s+In Scope\b/m.test(text)) errors.push("missing '## In Scope' section");
  return { ok: errors.length === 0, errors };
}

function baseManifest({ name, modality, caidoProjectId }) {
  return {
    schema: WORKSPACE_SCHEMA,
    name,
    modality,
    created: new Date().toISOString(),
    caido: { projectId: caidoProjectId == null ? null : String(caidoProjectId) },
    whitebox: { reserved: true, authorized: false, grants: [] },
  };
}

// Create a new engagement, or adopt/return an existing one. Never overwrites.
export function initEngagement({ root, name, modality = DEFAULT_MODALITY, caidoProjectId = null, scope = null }) {
  if (!root) throw new WorkspaceError("bad-params", "root (ENGAGEMENT_ROOT) required");
  if (!MODALITIES.includes(modality)) {
    throw new WorkspaceError("bad-modality", `unknown modality: ${modality} (valid: ${MODALITIES.join(", ")})`);
  }
  if (scope != null) {
    const v = validateScope(scope);
    if (!v.ok) throw new WorkspaceError("bad-scope", `invalid scope.md: ${v.errors.join("; ")}`);
  }
  const engDir = path.join(root, sanitizeName(name));
  const state = detectWorkspace(engDir);

  if (state === "managed") {
    return { ...loadEngagement({ dir: engDir }), adopted: false, alreadyExisted: true };
  }
  fs.mkdirSync(engDir, { recursive: true });
  const manifest = baseManifest({ name, modality, caidoProjectId });
  if (state === "legacy") manifest.adoptedLegacy = true; // record, do NOT migrate contents
  writeManifest(engDir, manifest);
  appendAudit(engDir, { event: "engagement-init", modality, adoptedLegacy: state === "legacy" });
  return { dir: engDir, kind: "managed", adopted: state === "legacy", alreadyExisted: false, ...manifest };
}

export function loadEngagement({ dir }) {
  const state = detectWorkspace(dir);
  if (state === "empty") throw new WorkspaceError("not-found", `no engagement at ${dir}`);
  if (state === "legacy") {
    return { dir, kind: "legacy", schema: 0, modality: DEFAULT_MODALITY,
             whitebox: { reserved: false, authorized: false, grants: [] }, caido: { projectId: null } };
  }
  const m = readManifest(dir);
  if (m.schema > WORKSPACE_SCHEMA) {
    throw new WorkspaceError("schema-too-new", `manifest schema ${m.schema} newer than supported ${WORKSPACE_SCHEMA}`);
  }
  return { dir, kind: "managed", ...m };
}

// Resolve a path inside the engagement, enforcing confinement + Whitebox gate.
// Throws WhiteboxAccessError / WorkspaceError on denial. Does NOT create dirs.
export function resolveWorkspacePath(engagement, relPath, { reason = "" } = {}) {
  const engDir = engagement.dir;
  const manifest = readManifest(engDir) || engagement;
  const decision = decideWhiteboxAccess({ targetPath: relPath, engDir, manifest });
  if (decision.isWhitebox || !decision.allow) {
    appendAudit(engDir, { event: "path-access", path: relPath, allow: decision.allow,
                          whitebox: decision.isWhitebox, reason: decision.reason, by: reason });
  }
  if (!decision.allow) {
    if (decision.reason === "path-escapes-engagement-root") {
      throw new WorkspaceError("path-escape", `path escapes engagement root: ${relPath}`);
    }
    throw new WhiteboxAccessError(`Whitebox access denied: ${decision.reason}`);
  }
  return path.resolve(engDir, relPath);
}

// Lazily create a standard bucket directory (no eager empty dirs at init).
export function ensureBucket(engagement, bucketKey) {
  const name = BUCKETS[bucketKey];
  if (!name) throw new WorkspaceError("bad-bucket", `unknown bucket: ${bucketKey}`);
  const full = resolveWorkspacePath(engagement, name, { reason: "ensureBucket" });
  fs.mkdirSync(full, { recursive: true });
  return full;
}

// The "normal context composition": standard surfaces, ALWAYS excluding Whitebox.
export function composeContextPaths(engagement) {
  return {
    root: engagement.dir,
    files: ["scope.md", "session.md", "toDoList.md",
            "ccLeads.md", "ccFailed.md", "ccGadgets.md", "ccNotes.md", "ccLog.md", "ccSurface.md"],
    dirs: Object.values(BUCKETS),
    excluded: [WHITEBOX_DIR], // never part of normal composition
  };
}

// Which source classes a modality may use. Whitebox sources need BOTH
// modality=whitebox AND an explicit authorization (double gate).
export function sourcesForModality(engagement) {
  const modality = engagement.modality || DEFAULT_MODALITY;
  const authorized = !!(engagement.whitebox && engagement.whitebox.authorized);
  return {
    modality,
    web: true,                                   // http/browser runtime available in all modalities
    credentials: modality !== "blackbox",        // gray/white may use provided auth context
    code: modality === "whitebox" && authorized, // code/Whitebox only when whitebox + authorized
    whitebox: modality === "whitebox" && authorized,
  };
}

// Explicit operator action required — never inferred from a repo being present.
export function authorizeWhitebox(engagement, { operator, reason } = {}) {
  if (!operator) throw new WorkspaceError("operator-required", "whitebox authorization requires an explicit operator identity");
  const engDir = engagement.dir;
  const m = readManifest(engDir);
  if (!m) throw new WorkspaceError("not-managed", "cannot authorize whitebox on a non-managed engagement");
  if (m.modality !== "whitebox") throw new WorkspaceError("modality-mismatch", "set modality=whitebox before authorizing");
  fs.mkdirSync(path.join(engDir, WHITEBOX_DIR), { recursive: true });
  m.whitebox.authorized = true;
  m.whitebox.grants.push({ operator, reason: reason || "", at: new Date().toISOString(), action: "authorize" });
  writeManifest(engDir, m);
  appendAudit(engDir, { event: "whitebox-authorize", operator, reason: reason || "" });
  return { dir: engDir, kind: "managed", ...m };
}

// Revoke. The module cannot purge already-loaded LLM context — it SIGNALS that
// a clean context is required to truly return to Black Box.
export function revokeWhitebox(engagement, { operator } = {}) {
  const engDir = engagement.dir;
  const m = readManifest(engDir);
  if (!m) throw new WorkspaceError("not-managed", "cannot revoke on a non-managed engagement");
  m.whitebox.authorized = false;
  m.whitebox.grants.push({ operator: operator || "unknown", at: new Date().toISOString(), action: "revoke" });
  writeManifest(engDir, m);
  appendAudit(engDir, { event: "whitebox-revoke", operator: operator || "unknown" });
  return { dir: engDir, kind: "managed", ...m, requiresCleanContext: true };
}

// ===========================================================================
// Multi-engagement: Caido project binding + active-engagement selection.
// (Pre-pilot adjustment. No new authorization mechanism — the Bridge still
// enforces project↔engagement via the operator-provided Execution Context;
// these helpers only let the operator DERIVE that context from the SELECTED
// engagement's manifest instead of a mandatory global CAIDO_PROJECT_ID.)
// ===========================================================================

export const STATE_DIR = ".hackbot";   // per-engagement runtime state (monitor/copilot/record)
export const EVIDENCE_DIR = "evidence"; // per-engagement AUDIT evidence (matches .gitignore 'evidence/')

// Symlink-SAFE confinement: resolve real paths (following symlinks of existing ancestors) and refuse
// anything that escapes `baseDir`. Handles a not-yet-created leaf by realpath-ing the nearest existing
// ancestor. Stronger than the lexical decideWhiteboxAccess() guard (which cannot see a symlink pointing
// outside). Throws WorkspaceError("path-escape") on escape. This is the ONE confinement mechanism reused
// for engagement roots AND evidence directories (no second path-safety pattern).
// realpath that tolerates a not-yet-created leaf: resolves symlinks of the nearest EXISTING ancestor,
// then re-appends the missing tail lexically. A SYMLINK leaf (even a dangling one) is resolved to its
// target — NOT treated as a missing file — so a link that escapes the base is caught by confineWithin
// instead of being silently written through (fs.existsSync follows links, so it cannot see a dangling
// escape; lstat-based resolution here can).
function realpathLenient(p) {
  let probe = path.resolve(p); const tail = []; let hops = 0;
  while (hops++ < 64) {
    let st = null; try { st = fs.lstatSync(probe); } catch { /* absent */ }
    if (st) {
      if (st.isSymbolicLink()) { probe = path.resolve(path.dirname(probe), fs.readlinkSync(probe)); continue; } // follow the link target
      break; // real existing file/dir
    }
    tail.unshift(path.basename(probe)); const parent = path.dirname(probe); if (parent === probe) break; probe = parent;
  }
  let real; try { real = fs.realpathSync(probe); } catch { real = probe; }
  return tail.length ? path.join(real, ...tail) : real;
}
export function confineWithin(baseDir, candidate = null, { ensureBase = false, ensure = false } = {}) {
  if (ensureBase) fs.mkdirSync(baseDir, { recursive: true });
  const baseReal = realpathLenient(baseDir); // base need not exist yet (e.g. <engagement>/evidence)
  if (candidate == null || candidate === "") { if (ensure) fs.mkdirSync(baseReal, { recursive: true }); return baseReal; }
  const abs = path.isAbsolute(candidate) ? candidate : path.resolve(baseReal, candidate);
  const finalReal = realpathLenient(abs);
  const rel = path.relative(baseReal, finalReal);
  if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) {
    throw new WorkspaceError("path-escape", `path escapes base dir (symlink-resolved): ${candidate}`);
  }
  if (ensure) fs.mkdirSync(finalReal, { recursive: true });
  return finalReal;
}

// Confine `candidate` within the engagement root (symlink-safe). engDir must exist.
export function assertInsideEngagement(engDir, candidate) { return confineWithin(engDir, candidate); }

// Engagement-scoped, confined persistence paths. Keeps monitor/copilot/record
// state from ever mixing between engagements.
export function engagementStatePaths(engagement) {
  const engDir = engagement.dir;
  const p = (f) => assertInsideEngagement(engDir, path.join(STATE_DIR, f));
  return {
    dir: path.join(engDir, STATE_DIR),
    monitor: p("monitor-state.json"),
    copilot: p("copilot-state.json"),
    record: p("investigation-record.json"),
  };
}

// The per-engagement AUDIT evidence directory (<engagement>/evidence), confined. Lazily created only
// when `ensure` is set (no eager empty dirs). This is the single home for persistent evidence — there is
// NO global evidence dir and NO /tmp fallback once an engagement is active.
export function engagementEvidenceDir(engagement, { ensure = false } = {}) {
  return confineWithin(engagement.dir, EVIDENCE_DIR, { ensure });
}

// Resolve an evidence write TARGET (dir or file, relative or absolute) and CONFINE it inside
// <engagement>/evidence. Rejects path traversal / symlink escapes. `ensure` creates the target dir.
export function resolveEvidenceDir(engagement, candidate = null, { ensure = false } = {}) {
  const base = engagementEvidenceDir(engagement, { ensure });
  if (candidate == null || candidate === "") return base;
  return confineWithin(base, candidate, { ensure });
}

// Resolve the Caido projectId for this engagement. The engagement manifest ALWAYS
// wins; the global CAIDO_PROJECT_ID is honored ONLY as a single-engagement COMPAT
// fallback and NEVER overrides a bound engagement (no silent cross-project).
export function resolveProjectId(engagement, { envProjectId = null } = {}) {
  const mid = engagement && engagement.caido && engagement.caido.projectId ? String(engagement.caido.projectId) : null;
  if (mid) return { projectId: mid, source: "engagement" };
  if (envProjectId) return { projectId: String(envProjectId), source: "env-compat" };
  return { projectId: null, source: null };
}

// Bind a Caido project to an EXISTING engagement. Refuses a silent rebind to a
// different project (requires force), refuses empty id / non-managed engagement.
export function associateCaidoProject(engagement, { projectId, projectName = null, operator = null, force = false } = {}) {
  const engDir = engagement.dir;
  const m = readManifest(engDir);
  if (!m) throw new WorkspaceError("not-managed", "cannot associate a Caido project on a non-managed engagement (run init first)");
  const id = projectId == null ? "" : String(projectId).trim();
  if (!id) throw new WorkspaceError("bad-params", "projectId is required to associate a Caido project");
  const cur = m.caido && m.caido.projectId ? String(m.caido.projectId) : null;
  if (cur && cur !== id && !force) {
    throw new WorkspaceError("project-already-associated",
      `engagement already bound to project ${cur}; pass force to rebind to ${id} (refusing silent cross-project rebind)`);
  }
  m.caido = { ...(m.caido || {}), projectId: id, projectName: projectName || (m.caido && m.caido.projectName) || null };
  writeManifest(engDir, m);
  appendAudit(engDir, { event: "caido-associate", projectId: id, projectName: projectName || null, operator: operator || null, rebindFrom: (cur && cur !== id) ? cur : undefined });
  return { dir: engDir, kind: "managed", ...m };
}

// ---------------------------------------------------------------------------
// Dynamic active-engagement selection (UX). A per-session POINTER persisted OUTSIDE
// the .env lets the operator/agent switch engagements at runtime. Precedence when
// resolving the active engagement: explicit SA_ENGAGEMENT override > session pointer
// > NONE. It NEVER picks a nearest/first/last engagement — selection is always exact
// and explicit, and a pointer exists only for an unambiguous session (no shared default). The pointer only names the engagement; every scope/project/confinement/
// authorization control stays exactly where it was (manifest + Bridge).
// ---------------------------------------------------------------------------
export const STATE_ROOT_DIR = ".sa-state"; // under SA_ENGAGEMENT_ROOT; holds the active pointer (no secrets)

// A session is always bound to where it runs, so a selection can never cross projects or clients:
//  - activated project: stable prj-<hash> from its marker path; an explicit SA_SESSION_ID becomes <id>--prj-<hash>;
//  - central harness (no marker, cwd exactly its root): its own prj-<hash>. A subdirectory doesn't count: a process in a
//    project's linked dir (cwd=<project>/tools) is physically inside the harness and must not get the harness's selection;
//  - anywhere else: only an explicit SA_SESSION_ID, bound to the enclosing repository or harness if any (<id>--repo-<hash>);
//    otherwise null => NO selection and writes refuse. There is no
//    shared default pointer (a legacy active.json is ignored, never read or deleted).
const HARNESS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export function findActivatedProject(cwd = process.cwd(), env = process.env) {
  // The cwd is physical: inside a linked dir (cd tools) only the shell's PWD still shows the project.
  // The physical path comes second: a link from elsewhere into the project must still find its marker.
  const starts = env.PWD && realpathLenient(env.PWD) === realpathLenient(cwd) ? [env.PWD, cwd] : [cwd];
  for (const start of starts) {
    for (let d = path.resolve(start); ; d = path.dirname(d)) {
      if (fs.existsSync(path.join(d, ".hackbot-activation.json"))) return d;
      if (fs.existsSync(path.join(d, ".git")) || path.dirname(d) === d) break; // a nested repository is someone else's: never inherit its parent's selection
    }
  }
  return null;
}
const shortHash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);
const projectKey = (d) => `prj-${shortHash(realpathLenient(d))}`;
function markerValid(d) {
  try { const m = JSON.parse(fs.readFileSync(path.join(d, ".hackbot-activation.json"), "utf8")); return !!m && typeof m.hackbotHome === "string" && Array.isArray(m.links) && m.links.every((l) => typeof l === "string"); }
  catch { return false; }
}
// kind: "project" | "invalid-marker" (nearest marker unreadable: never walk past it to a parent project) | "harness" | "none".
export function resolveProjectContext({ env = process.env, cwd = process.cwd() } = {}) {
  const found = findActivatedProject(cwd, env);
  if (found) return { kind: markerValid(found) ? "project" : "invalid-marker", dir: found };
  const H = realpathLenient(HARNESS_ROOT);
  return realpathLenient(cwd) === H ? { kind: "harness", dir: H } : { kind: "none", dir: null };
}
function enclosingRepo(cwd) {
  for (let d = realpathLenient(cwd); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, ".git")) || d === realpathLenient(HARNESS_ROOT)) return d; // a harness subdir counts too: a project's linked dir lands there
    if (path.dirname(d) === d) return null;
  }
}
export function resolveSessionId({ env = process.env, cwd = process.cwd() } = {}) {
  const ctx = resolveProjectContext({ env, cwd });
  if (env.SA_SESSION_ID) {
    const raw = String(env.SA_SESSION_ID), safe = sanitizeName(raw).slice(0, 64); // bounded: it names a file
    // Distinct ids must stay distinct after sanitizing, and an id can't take the form of a derived session (prj-<hash>).
    const id = safe === raw && !/(^|--)(prj|repo)-/.test(raw) ? safe : `${safe}-${shortHash(raw)}`;
    if (ctx.kind === "project" || ctx.kind === "invalid-marker") return `${id}--${projectKey(ctx.dir)}`;
    const repo = ctx.kind === "none" ? enclosingRepo(cwd) : null;
    return repo ? `${id}--repo-${shortHash(repo)}` : id;
  }
  return ctx.kind === "project" || ctx.kind === "harness" ? projectKey(ctx.dir) : null;
}
// Actionable refusal for a null session. Names no engagement: without context we cannot tell whose they are.
export function noContextHelp({ env = process.env, cwd = process.cwd() } = {}) {
  const ctx = resolveProjectContext({ env, cwd });
  const why = ctx.kind === "invalid-marker" ? `the activation marker in ${ctx.dir} is unreadable (re-run activate there)` : `${cwd} is not an activated project`;
  return `no unambiguous project context: ${why}. Run from the activated project's root or the harness root, activate this one (tools/activation/cli.mjs activate --project <dir> --runtime <r>), or set SA_SESSION_ID for automation; commands that read an engagement also take --name <n>`;
}

function activePointerPath(root, sessionId) {
  if (!sessionId) throw new WorkspaceError("no-session-context", "no session: a selection needs an activated project, the central harness or SA_SESSION_ID");
  return path.join(root, STATE_ROOT_DIR, `active-${sanitizeName(String(sessionId))}.json`);
}
function readActivePointer(root, sessionId) {
  if (!sessionId) return null;
  try { return JSON.parse(fs.readFileSync(activePointerPath(root, sessionId), "utf8")); } catch { return null; }
}

// The documented contract: engagement data lives OUTSIDE the harness, or in its git-ignored engagements/ (Layout A).
// Symlink-resolved, so a root reached through an activated project's links is caught too.
export function assertRootOutsideHarness(root) {
  const H = realpathLenient(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."));
  const r = realpathLenient(path.resolve(root));
  if ((r === H || r.startsWith(H + path.sep)) && !(r === path.join(H, "engagements") || r.startsWith(path.join(H, "engagements") + path.sep))) throw new WorkspaceError("root-inside-harness", `SA_ENGAGEMENT_ROOT resolves inside the central harness: ${r}`);
  return root;
}

// Candidate engagements under a root (for listing + actionable "not found" messages).
export function listEngagements(root) {
  if (!root || !fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== STATE_ROOT_DIR)
    .map((d) => { try { const e = loadEngagement({ dir: path.join(root, d.name) }); const { projectId, source } = resolveProjectId(e, {}); return { name: d.name, dir: e.dir, modality: e.modality, kind: e.kind, caidoProjectId: projectId, caidoProjectSource: source }; } catch { return null; } })
    .filter(Boolean);
}

// Persist the active engagement for this session. EXACT name only (selectEngagement
// throws not-found if absent — never fuzzy). Reports whether this was a SWITCH, so the
// caller can require a clean session (it does NOT purge any already-loaded LLM history).
export function setActiveEngagement({ root, name, sessionId = null, operator = null } = {}) {
  if (!root) throw new WorkspaceError("bad-params", "root (SA_ENGAGEMENT_ROOT) required");
  if (!name) throw new WorkspaceError("bad-params", "name required to select an engagement");
  const p = activePointerPath(root, sessionId); // refuses before touching anything when there is no session
  const sel = selectEngagement({ root, name }); // validates EXACT existence
  const prev = readActivePointer(root, sessionId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const ptr = { name: sel.name, dir: sel.dir, sessionId: sessionId || null, setAt: new Date().toISOString(), setBy: operator || null };
  const tmp = `${p}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(ptr, null, 2) + "\n"); fs.renameSync(tmp, p);
  const switched = !!(prev && prev.name && prev.name !== sel.name);
  return { ...sel, active: true, source: "session", switched, previous: (prev && prev.name) || null, requiresCleanContext: switched };
}

export function clearActiveEngagement({ root, sessionId = null } = {}) {
  const p = activePointerPath(root, sessionId);
  try { fs.rmSync(p, { force: true }); } catch { /* ignore */ }
  return { cleared: true };
}

// Resolve the active engagement NAME: SA_ENGAGEMENT override > session pointer > none.
// Returns { name, source: "env"|"session"|null, dir }. A missing/stale target yields NO
// selection (never a fallback to another engagement); no session adds noContext: true.
export function getActiveEngagement({ root = null, env = process.env, sessionId = null } = {}) {
  const override = env && env.SA_ENGAGEMENT ? String(env.SA_ENGAGEMENT) : null;
  if (override) {
    try { const sel = selectEngagement({ root, name: override }); return { name: sel.name, source: "env", dir: sel.dir }; }
    catch { return { name: override, source: "env", dir: null, unresolved: true }; }
  }
  if (!root) return { name: null, source: null, dir: null };
  if (!sessionId) return { name: null, source: null, dir: null, noContext: true };
  const ptr = readActivePointer(root, sessionId);
  if (ptr && ptr.name) {
    try { const sel = selectEngagement({ root, name: ptr.name }); return { name: sel.name, source: "session", dir: sel.dir }; }
    catch { return { name: null, source: null, dir: null }; } // stale pointer → no selection
  }
  return { name: null, source: null, dir: null };
}

// Select the single active engagement for an investigation context. Validates the
// directory exists, loads its manifest, resolves scope.md and the bound projectId,
// and returns everything the operator/adapter needs to build the Execution Context.
export function selectEngagement({ root = null, name = null, dir = null, envProjectId = null } = {}) {
  let engDir = dir;
  if (!engDir) {
    if (!root) throw new WorkspaceError("bad-params", "selectEngagement needs (root + name) or dir");
    if (!name) throw new WorkspaceError("no-active-engagement", "no engagement selected (set SA_ENGAGEMENT or pass a name)");
    engDir = path.join(root, sanitizeName(name));
  }
  if (detectWorkspace(engDir) === "empty") throw new WorkspaceError("not-found", `no engagement at ${engDir}`);
  const eng = loadEngagement({ dir: engDir });
  const scopePath = path.join(engDir, "scope.md");
  const scopePresent = fs.existsSync(scopePath);
  const scopeValid = scopePresent ? validateScope(scopePath).ok : false;
  const { projectId, source } = resolveProjectId(eng, { envProjectId });
  return {
    dir: engDir, name: eng.name || path.basename(engDir), modality: eng.modality || DEFAULT_MODALITY,
    kind: eng.kind, caidoProjectId: projectId, caidoProjectSource: source,
    scopePath, scopePresent, scopeValid, statePaths: engagementStatePaths({ dir: engDir }),
    evidenceDir: engagementEvidenceDir({ dir: engDir }), // persistent AUDIT evidence home (created on first write)
  };
}

// ===========================================================================
// S1 — Deterministic operational bootstrap.
//
// Restores the original HackBot Flow-8 Step-2 structure (the nine numbered
// directories + the operational documents defined by references/template-files.md)
// as a CODE-BACKED, idempotent, self-healing operation — instead of relying on the
// LLM to hand-create them from prose. This is what makes "bootstrap completes before
// recon" verifiable and what frees the operator from running manual Node commands.
//
// Hard rules (match the b720 S1 contract):
//  - Create ONLY what is missing; never overwrite existing content.
//  - Never invent findings/leads/gadgets/tasks (skeletons only; task seeding stays
//    with the dispatcher/LLM, which knows the scope).
//  - Never touch the manifest (.engagement.json), evidence/, or .hackbot/ — Caido
//    association, modality and Whitebox authorization are preserved untouched, and
//    no authorization is ever granted implicitly.
//  - Every write target is confined inside the engagement (symlink-safe) via the ONE
//    existing confinement mechanism (confineWithin) — no second path-safety pattern.
//  - checkpoint.md is intentionally NOT pre-created (it is written on context-limit
//    save and read on resume; an empty one would be misleading).
// ===========================================================================

// The operational documents restored by bootstrap (the six cc*.md + the three user
// files). Order mirrors references/template-files.md ## Engagement root cleanliness.
export const OPERATIONAL_DOCS = Object.freeze([
  "scope.md", "session.md", "toDoList.md",
  "ccSurface.md", "ccLeads.md", "ccGadgets.md", "ccNotes.md", "ccLog.md", "ccFailed.md",
]);

// The load-bearing NATIVE-TOOLING preamble (self-heal detector = this marker string).
const NATIVE_TOOLING_MARKER = "NATIVE-TOOLING CONSTRAINT";
function runtimePreamble(name) {
  return [
    `# ${name} — Engagement Bootstrap`, "",
    "> 🔧 **NATIVE-TOOLING CONSTRAINT** — this engagement forbids dropping installed tools. Tier-0 native (PowerShell/cmd/.NET/LOLBins) first, every time; escalate to Tier-1 (Python/Go/Node) only with a one-sentence justification; NEVER reach for a tool the user would have to install (a port scanner, an in-memory credential-dumping tool, an AD attack-path mapping tool, an automated SQL-injection tool, an intercepting web proxy, etc.). Full doctrine: `references/native-tooling-doctrine.md`.",
    ">",
    "> 📋 **WORKING NORM** — this engagement is governed by `toDoList.md` in this directory. Work through the open `- [ ]` runtime tasks, then report back. When you hit something only the user can do, write a `@user` task and pivot to other open work instead of stopping inline to ask.",
    ">",
    "> **Multi-agentic, runtime-agnostic.** Binds Claude Code, Claude Agent SDK, Antigravity, and every dispatched subagent.",
    ">",
    "> Full rule: `SKILL.md ## Engagement task discipline`. Verification contract: `references/verification-contract.md`.",
  ].join("\n");
}
function runtimeInstructions(name) {
  return runtimePreamble(name) + "\n\n" + [
    "---", "",
    "## Engagement Context", "",
    `**Engagement:** ${name}`,
    "**Type:** [internal pentest / web bug bounty / red team / audit]",
    "**Started:** YYYY-MM-DD",
    "**Primary objective:** [one line — kept in sync with `session.md ## Current Objective`]", "",
    "## Active toDoList summary",
    "<!-- Optional: mirror top 3-5 open tasks. Authoritative list is toDoList.md. -->", "",
    "## Engagement-specific guidance",
    "<!-- User-authored notes for this engagement only: special rules, host quirks, allowed Tier-1 runtimes. -->", "",
  ].join("\n");
}

// Document skeletons — faithful to references/template-files.md, headers/placeholders
// ONLY (no fabricated content). scope.md is structurally valid (passes validateScope).
function engTemplates(name) {
  const H = `[${name}]`;
  return {
    "scope.md": [
      `# Scope — ${name}`,
      "Source: [client / platform / internal] | Loaded: YYYY-MM-DD", "",
      "## Tech Stack", "<!-- web stack AND/OR Windows host/domain details -->", "",
      "## Host Inventory",
      "| Host | IP | Role | OS / Build | Domain | Access level |",
      "|------|----|----- |-----------|--------|--------------|", "",
      "## Runtime Availability",
      "| Host | PowerShell | Python | Go | Node | RSAT | Notes |",
      "|------|-----------|--------|----|----- |------|-------|", "",
      "## In Scope", "",
      "## Out of Scope", "",
      "## Special Rules",
      "<!-- e.g. \"no installing anything\", \"EDR present — engagement is visible to blue team\" -->", "",
    ].join("\n"),
    "session.md": [
      `# Session Log — ${name}`, "Last updated: YYYY-MM-DD HH:MM",
      "## Credentials", "<!-- agents read this — paste creds/cookies/tokens/hashes here -->",
      "## Current Objective", "## Confirmed Findings", "## In Progress", "## Next Steps", "## Notes", "",
    ].join("\n"),
    "toDoList.md": [
      "# To-Do List", "",
      "Bidirectional comms channel: runtime↔user. `## For the user (@user)` is at the TOP. The runtime auto-adds `@user` tasks when it needs you and keeps working on `## Tasks`. See `SKILL.md ## Engagement task discipline`.", "",
      "## For the user (@user)", "",
      "<!-- User-only tasks. The runtime AUTO-ADDS entries here when it hits a roadblock that needs you. You flip the box when done. The runtime NEVER flips a `@user` task itself.",
      "Format:",
      "- [ ] **TASK-NNN** @user: <task — ≤15 words, imperative>",
      "  - Why: <≤25 words — what the runtime will do with the result / what it unblocks> -->", "",
      "## Tasks", "",
      "<!-- Runtime tasks (default — runtime executes and validates):",
      "- [ ] **TASK-NNN**: <imperative description>",
      "  - Done-when: <observable completion criterion with a live-probe oracle — positive path AND negative ruled-out-with-evidence path>",
      "  - Priority: <high|med|low> -->", "",
      "## Validation log", "",
      "<!-- Runtime appends one line per task state-flip + per @user task creation, citing the evidence. Append-only. -->", "",
    ].join("\n"),
    "ccSurface.md": [
      `# Surface — ${name}`, "Last updated: YYYY-MM-DD", "",
      "## Hosts", "| Host | Role | Stack/OS | CDN/WAF/EDR | Domain | Notes |", "|------|------|----------|-------------|--------|-------|", "",
      "## Windows / AD Inventory", "| Item | Type | Value | Source command | Notes |", "|------|------|-------|----------------|-------|", "",
      "## Endpoints", "| Host | Path | Method | Auth | Params | Notes |", "|------|------|--------|------|--------|-------|", "",
      "## Params", "| Param | Seen At | Type | Reflected | Notes |", "|-------|---------|------|-----------|-------|", "",
      "## Cookies", "| Name | Domain | Path | Flags | Set By | Purpose |", "|------|--------|------|-------|--------|---------|", "",
      "## Headers", "| Host | CSP | X-Frame-Options | CORS | HSTS | Other |", "|------|-----|-----------------|------|------|-------|", "",
      "## CORS", "| Host | Origin Tested | Allowed | Credentials | Methods | Notes |", "|------|---------------|---------|-------------|---------|-------|", "",
      "## Client-Side", "| Type | Host | Location | Target/Source | Details |", "|------|------|----------|---------------|---------|", "",
      "## JavaScript", "| Host | File/URL | Source Map | Size | Interesting | Analysis |", "|------|----------|-----------|------|-------------|----------|", "",
      "## Auth", "| Flow | Type | Endpoint | Token/Cookie | Notes |", "|------|------|----------|--------------|-------|", "",
      "## Infrastructure", "| Component | Details | Notes |", "|-----------|---------|-------|", "",
    ].join("\n"),
    "ccLeads.md": [
      `# Leads — ${name}`, "",
      "<!-- ### LEAD-001 — [one-line]",
      "**Observed:** date | **Signal:** [what] | **Location:** [host/endpoint] | **Hypothesis:** [why] | **Status:** queued",
      "**Coordinator re-verified:** [method + log path or quote + date] — REQUIRED when the lead came from a subagent. Without it the lead is UNVERIFIED and excluded from dispatch.",
      "Dead → ccFailed.md. Promoted → → GAD-00N. Numbering: highest NNN + 1, zero-pad 3, never fill gaps. -->", "",
    ].join("\n"),
    "ccGadgets.md": [
      `# Gadgets — ${name}`, "", "## Active Gadgets", "",
      "<!-- ### GAD-001 — [one-line]",
      "**Confirmed:** date | **What works:** [concrete] | **Location:** [host/endpoint]",
      "**Tier used:** [0-native | 1-python | 1-go | 1-node] | **From:** LEAD-NNN | **Missing:** [what] | **Chains with:** [GAD-NNN or none] | **Status:** active",
      "**Reportability:** [report-ready / chain-first — [reason] / gadget-only — [reason]]",
      "**Coordinator re-verified:** [method + log path or quote + date] — REQUIRED. Re-run the probe yourself. Gadgets without this are UNVERIFIED and excluded from chain checks. -->", "",
      "## Archived Gadgets", "",
    ].join("\n"),
    "ccNotes.md": [
      `# Notes — ${name}`, "Last updated: YYYY-MM-DD", "",
      "## What Works Here", "<!-- Runtime availability per host, native techniques the box allows, EDR/logging observations. -->", "",
      "## App / Host Mental Model", "### Behavioral Quirks", "",
      "## Technique History", "<!-- - [date] Tried [technique] (Tier N) → [outcome]. -->", "",
      "## Attempted Chains", "<!-- - GAD-X + GAD-Y: [confirmed/partial/failed] [date] — [result]. -->", "",
    ].join("\n"),
    "ccLog.md": [
      `# Log — ${name}`, "",
      "## Recon Sessions", "<!-- Per-session entries, most recent first. -->", "",
      "## Session Summaries", "<!-- End-of-session summaries. -->", "",
    ].join("\n"),
    "ccFailed.md": [
      `# Failed — ${name}`, "",
      "## Dead Leads", "<!-- ### LEAD-001 — [reason] — YYYY-MM-DD / **Original signal:** ... | **Why killed:** ... -->", "",
      "## Dead Ends", "<!-- - [what was tested] — [why it's a dead end] — YYYY-MM-DD -->", "",
    ].join("\n"),
    ".config": [
      `# Per-engagement config overrides — ${name}`,
      "# Resolution (flows-scope.md ## Config Resolution): Engagement .config → Global .config → defaults.",
      "# V2 note: the LIVE runtime config is .env + the engagement manifest (.engagement.json).",
      "# This file is a legacy override stub — uncomment only the keys you need. NO secrets here.", "",
      "# DEFAULT_SEVERITY_THRESHOLD=low",
      "# ALLOW_TIER1=true",
      "# PREFERRED_TIER1_RUNTIME=python",
      "# PROXY_URL=",
      "# REPORT_FORMAT=markdown", "",
    ].join("\n"),
  };
}

// Bootstrap (or self-heal) the operational structure of an EXISTING engagement.
// `engagement` is any object carrying `.dir` (from selectEngagement/loadEngagement or {dir}).
// Returns a report of what was created / already present / self-healed. Throws
// WorkspaceError("bad-scope") on an existing-but-invalid scope.md (controlled failure).
export function bootstrapEngagement(engagement, { runtime = "claude", operator = null } = {}) {
  if (!["claude", "claude-code", "agents", "antigravity", "pi", "both"].includes(runtime)) throw new WorkspaceError("bad-runtime", `unknown runtime '${runtime}' (valid: claude|claude-code|agents|antigravity|pi|both)`);
  const engDir = engagement && engagement.dir;
  if (!engDir || detectWorkspace(engDir) === "empty") {
    throw new WorkspaceError("not-found", "bootstrap requires an existing engagement (run init first)");
  }
  const m = readManifest(engDir);
  const name = (m && m.name) || engagement.name || path.basename(engDir);

  // Flow order Step 2: validate scope BEFORE preparing the structure. An existing but
  // malformed scope.md is a CONTROLLED failure (do not silently repair target intent).
  const scopePath = path.join(engDir, "scope.md");
  const scopePresent = fs.existsSync(scopePath);
  if (scopePresent) {
    const v = validateScope(scopePath);
    if (!v.ok) throw new WorkspaceError("bad-scope", `invalid scope.md: ${v.errors.join("; ")} (fix it or remove it, then re-run bootstrap)`);
  }

  const report = { dir: engDir, name, dirsCreated: [], created: [], present: [], selfHealed: [],
                   scope: { present: scopePresent, created: false } };
  const tpl = engTemplates(name);

  const writeIfMissing = (rel, content) => {
    const abs = confineWithin(engDir, rel); // symlink-safe confinement (throws path-escape on unsafe link)
    if (fs.existsSync(abs)) { report.present.push(rel); return false; }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    report.created.push(rel); return true;
  };

  // 1) The nine numbered directories (verbatim BUCKETS names), idempotent.
  for (const key of Object.keys(BUCKETS)) {
    const dirName = BUCKETS[key];
    const abs = confineWithin(engDir, dirName);
    const existed = fs.existsSync(abs);
    fs.mkdirSync(abs, { recursive: true });
    if (!existed) report.dirsCreated.push(dirName);
  }

  // 2) Operational documents (specific templates — never generic empty files).
  for (const f of OPERATIONAL_DOCS) {
    if (f === "scope.md") { if (scopePresent) { report.present.push("scope.md"); continue; } report.scope.created = writeIfMissing("scope.md", tpl["scope.md"]); continue; }
    writeIfMissing(f, tpl[f]);
  }

  // 3) Per-engagement .config override stub (no secrets).
  writeIfMissing(".config", tpl[".config"]);

  // 4) Runtime project-instructions file(s) + load-bearing NATIVE-TOOLING self-heal.
  const rtFiles = runtime === "both" ? ["CLAUDE.md", "AGENTS.md"]
    : ["agents", "antigravity", "pi"].includes(runtime) ? ["AGENTS.md"] : ["CLAUDE.md"];
  for (const rf of rtFiles) {
    const abs = confineWithin(engDir, rf);
    if (!fs.existsSync(abs)) { fs.writeFileSync(abs, runtimeInstructions(name)); report.created.push(rf); }
    else {
      const cur = fs.readFileSync(abs, "utf8");
      if (!cur.includes(NATIVE_TOOLING_MARKER)) { fs.writeFileSync(abs, runtimePreamble(name) + "\n\n---\n\n" + cur); report.selfHealed.push(rf); }
      else report.present.push(rf);
    }
  }

  appendAudit(engDir, { event: "bootstrap", created: report.created.length, dirsCreated: report.dirsCreated.length, selfHealed: report.selfHealed.length, by: operator || null });
  return report;
}

// ===========================================================================
// S3 — Deterministic task selection over the EXISTING toDoList.md (no new task DB,
// no scheduler, no execution). A pure READ-ONLY parser that encodes the Flow 11
// recommendation rule ("next open RUNTIME task by priority; @user tasks are not
// eligible objectives"). Used by `cli.mjs next` (skills-first) and by the supervised
// Autopilot loop to pick the next permitted step — the agent still executes it through
// the dispatcher/flows under the unchanged gates. Commented template examples are ignored.
// ===========================================================================
const PRIORITY_RANK = { high: 0, med: 1, medium: 1, low: 2 };

export function parseTasks(engagement) {
  const p = path.join(engagement.dir, "toDoList.md");
  let text = "";
  try { text = fs.readFileSync(p, "utf8"); } catch { return { runtime: [], user: [], nextRuntime: null, counts: { openRuntime: 0, openUser: 0, doneRuntime: 0, ruledOut: 0 } }; }
  text = text.replace(/<!--[\s\S]*?-->/g, ""); // ignore commented-out template examples
  const lines = text.split(/\r?\n/);
  const runtime = [], user = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*-\s*\[([ x~])\]\s*\*\*TASK-(\d+)\*\*(\s*@user)?\s*:?\s*(.*)$/i);
    if (!m) continue;
    const status = m[1] === "x" ? "done" : m[1] === "~" ? "ruled-out" : "open";
    const isUser = !!m[3]; // m[3] = the optional "@user" group (m[2] is the task number)
    let priority = "med";
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      const pm = lines[j].match(/Priority:\s*(high|med|medium|low)/i);
      if (pm) { priority = pm[1].toLowerCase() === "medium" ? "med" : pm[1].toLowerCase(); break; }
      if (/^\s*-\s*\[[ x~]\]\s*\*\*TASK-/i.test(lines[j])) break; // reached the next task
    }
    (isUser ? user : runtime).push({ id: `TASK-${m[2]}`, status, text: m[4].trim(), priority });
  }
  const openRuntime = runtime.filter((t) => t.status === "open");
  const next = [...openRuntime].sort((a, b) => (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1))[0] || null;
  return {
    runtime, user, nextRuntime: next,
    counts: {
      openRuntime: openRuntime.length,
      openUser: user.filter((t) => t.status === "open").length,
      doneRuntime: runtime.filter((t) => t.status === "done").length,
      ruledOut: runtime.filter((t) => t.status === "ruled-out").length,
    },
  };
}
