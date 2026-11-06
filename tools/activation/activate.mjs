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
// Resources linked into the project so it behaves like the central root (Claude Code + the operational CLIs).
// Order matters for creation; deactivation reverses it. `.claude/*` are the Claude Code discovery points.
export const LINKS = [
  "tools", "references", "workflows", "skills", "policies", "agents", "reports", "SKILL.md",
  ".claude/skills", ".claude/hooks", ".claude/settings.json",
];

// The central harness = where this code lives (tools/activation → repo root). No global lookup.
export function hackbotHome() { return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."); }

// Reject project dirs that are the operator's HOME or live under a runtime's GLOBAL config dir.
function assertSafeProject(projectDir, home) {
  const p = path.resolve(projectDir);
  const home_ = os.homedir();
  if (p === home_) throw new ActivationError("unsafe-target", `refusing to activate in \$HOME itself: ${p}`);
  const globals = [".claude", ".pi", ".gemini", ".config", ".codex"].map((d) => path.join(home_, d));
  for (const g of globals) if (p === g || p.startsWith(g + path.sep)) throw new ActivationError("unsafe-target", `refusing to write under a global runtime dir: ${p} (no global installation)`);
  const H = path.resolve(home);
  if (p === H) throw new ActivationError("inside-harness", "project IS the central harness — run HackBot directly from the repo root; no activation needed");
  if (p.startsWith(H + path.sep) || H.startsWith(p + path.sep)) throw new ActivationError("inside-harness", `project overlaps the central harness tree (${H}); use a separate external directory`);
  return p;
}

const isOurLink = (dest, src) => { try { return fs.lstatSync(dest).isSymbolicLink() && path.resolve(path.dirname(dest), fs.readlinkSync(dest)) === path.resolve(src); } catch { return false; } };

export function statusActivation({ projectDir }) {
  const p = path.resolve(projectDir);
  const markerPath = path.join(p, MARKER);
  if (!fs.existsSync(markerPath)) return { activated: false, projectDir: p };
  let m; try { m = JSON.parse(fs.readFileSync(markerPath, "utf8")); } catch { return { activated: false, projectDir: p, corrupt: true }; }
  const links = (m.links || []).map((rel) => {
    const dest = path.join(p, rel), src = path.join(m.hackbotHome, rel);
    return { rel, healthy: isOurLink(dest, src), src };
  });
  return { activated: true, projectDir: p, hackbotHome: m.hackbotHome, runtimes: m.runtimes || [], mcp: !!m.mcp, created: m.created || null, links, healthy: links.every((l) => l.healthy) };
}

export function activate({ projectDir, home = hackbotHome(), force = false, operator = null, runtimes = ["claude-code"], mcp = false } = {}) {
  const H = path.resolve(home);
  if (!fs.existsSync(path.join(H, "SKILL.md")) || !fs.existsSync(path.join(H, "tools", "workspace", "cli.mjs"))) {
    throw new ActivationError("bad-home", `central harness not found at ${H} (missing SKILL.md/tools) — pass a valid --home`);
  }
  const p = assertSafeProject(projectDir, H);
  if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) throw new ActivationError("no-project", `project directory does not exist: ${p}`);

  const existing = fs.existsSync(path.join(p, MARKER)) ? JSON.parse(fs.readFileSync(path.join(p, MARKER), "utf8")) : null;
  const backups = existing && existing.backups ? { ...existing.backups } : {};
  const createdDirs = existing && existing.createdDirs ? [...existing.createdDirs] : [];

  // Decide the link set (only resources that actually exist centrally).
  const wanted = LINKS.filter((rel) => fs.existsSync(path.join(H, rel)));
  if (mcp && fs.existsSync(path.join(H, ".mcp.json"))) wanted.push(".mcp.json");

  // First pass: detect conflicts (pre-existing NON-ours content at a target).
  const conflicts = [];
  for (const rel of wanted) {
    const dest = path.join(p, rel), src = path.join(H, rel);
    if (!fs.existsSync(dest) && !isSymlinkDangling(dest)) continue;        // free slot
    if (isOurLink(dest, src)) continue;                                     // already ours (idempotent)
    if (backups[rel]) continue;                                             // already backed up earlier
    conflicts.push(rel);
  }
  if (conflicts.length && !force) throw new ActivationError("conflict", `pre-existing content would be overwritten: ${conflicts.join(", ")} — re-run with --force to back them up (restored on deactivate)`);

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
  fs.writeFileSync(path.join(p, MARKER), JSON.stringify(marker, null, 2) + "\n");
  return { projectDir: p, hackbotHome: H, links, backedUp: Object.keys(backups), mcp: marker.mcp, runtimes };
}

export function deactivate({ projectDir } = {}) {
  const p = path.resolve(projectDir);
  const markerPath = path.join(p, MARKER);
  if (!fs.existsSync(markerPath)) throw new ActivationError("not-activated", `no activation marker in ${p} (nothing to deactivate)`);
  const m = JSON.parse(fs.readFileSync(markerPath, "utf8"));
  const removed = [], restored = [];
  // Remove ONLY symlinks we created that still point into the recorded home (never operator's real files).
  for (const rel of (m.links || [])) {
    const dest = path.join(p, rel), src = path.join(m.hackbotHome, rel);
    if (isOurLink(dest, src)) { fs.unlinkSync(dest); removed.push(rel); }
  }
  // Restore backups.
  for (const [rel, bakRel] of Object.entries(m.backups || {})) {
    const dest = path.join(p, rel), bak = path.join(p, bakRel);
    if (fs.existsSync(bak) || isSymlinkDangling(bak)) { if (fs.existsSync(dest) || isSymlinkDangling(dest)) fs.rmSync(dest, { recursive: true, force: true }); fs.renameSync(bak, dest); restored.push(rel); }
  }
  // Remove dirs we created, only if now empty (e.g. .claude/ we made).
  for (const relDir of [...(m.createdDirs || [])].sort((a, b) => b.length - a.length)) {
    const d = path.join(p, relDir);
    try { if (fs.existsSync(d) && fs.readdirSync(d).length === 0) fs.rmdirSync(d); } catch { /* keep non-empty */ }
  }
  fs.unlinkSync(markerPath);
  // Engagement/pentest data lives under SA_ENGAGEMENT_ROOT (or <project> buckets), NEVER in these links — untouched.
  return { projectDir: p, removed, restored, dataPreserved: true };
}

function isSymlinkDangling(p) { try { fs.lstatSync(p); return true; } catch { return false; } }
