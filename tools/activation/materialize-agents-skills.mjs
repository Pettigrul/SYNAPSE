// SYNAPSE — materialize .agents/skills on a no-symlink checkout (Windows-corporate fix).
//
// The repo tracks .agents/skills/ as symlinks (the Antigravity load path: the 13 operational skills →
// ../../.claude/skills/<name>, plus security-auditor/SKILL.md → ../../../SKILL.md). On a Windows checkout with
// core.symlinks=false, Git materializes each symlink as a 1-line TEXT FILE whose content is the link target.
// The Pi/Antigravity loader then reads "../../../SKILL.md" instead of the skill and reports "description is
// required". This tool resolves those un-materialized links in place — a real junction (dir) or a copy (file) —
// so the skills load without Developer Mode. Idempotent; deterministic; offline; no LLM; Node stdlib only.
//
// It derives each target from the link's OWN content (the relative path Git wrote), so it hardcodes no skill
// names. A proper symlink (POSIX) is left untouched; a file that is not a resolvable single-line relative path
// is left untouched. On POSIX with intact symlinks there is nothing to do.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function repoRoot() { return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."); }

// Is `file` an un-materialized symlink (a 1-line relative path whose target exists)? Returns its resolution or null.
export function unmaterializedLink(file) {
  try {
    const st = fs.lstatSync(file);
    if (st.isSymbolicLink() || !st.isFile() || st.size === 0 || st.size > 400) return null;
    const raw = fs.readFileSync(file, "utf8");
    const rel = raw.trim();
    if (!rel || /[\r\n]/.test(rel) || /\s/.test(rel)) return null;      // must be a single token
    if (!(rel.includes("/") || rel.includes("\\"))) return null;        // must look like a path
    const target = path.resolve(path.dirname(file), rel);
    if (!fs.existsSync(target)) return null;                            // target must exist to materialize
    return { rel, target, targetIsDir: fs.statSync(target).isDirectory() };
  } catch { return null; }
}

// All regular files under a dir, skipping proper symlinks (already fine) and descending real dirs.
function walkFiles(dir, acc = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const d of entries) {
    const p = path.join(dir, d.name);
    let st; try { st = fs.lstatSync(p); } catch { continue; }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walkFiles(p, acc);
    else if (st.isFile()) acc.push(p);
  }
  return acc;
}

// Plan: every un-materialized link under <root>/.agents/skills, labelled by its top-level skill name.
export function plan(root = repoRoot()) {
  const base = path.join(root, ".agents", "skills");
  const items = [];
  for (const file of walkFiles(base)) {
    const info = unmaterializedLink(file);
    if (info) items.push({ file, name: path.relative(base, file).split(path.sep)[0], ...info });
  }
  return { base, present: fs.existsSync(base), items };
}

// Materialize one entry: dir target → junction (win32) / symlink (posix); file target → copy (portable).
function materializeOne(file, info, platform) {
  fs.rmSync(file, { force: true });
  if (info.targetIsDir) {
    try { fs.symlinkSync(info.target, file, platform === "win32" ? "junction" : "dir"); return "link"; }
    catch { fs.cpSync(info.target, file, { recursive: true }); return "copy-dir"; } // last resort if even junctions are denied
  }
  fs.copyFileSync(info.target, file);
  return "copy-file";
}

export function materialize({ root = repoRoot(), platform = os.platform() } = {}) {
  const p = plan(root);
  const done = [];
  for (const it of p.items) done.push({ name: it.name, file: path.relative(root, it.file), action: materializeOne(it.file, it, platform) });
  return { base: p.base, present: p.present, materialized: done };
}

function brokenNames(p) { return [...new Set(p.items.map((i) => i.name))]; }

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log("usage: node materialize-agents-skills.mjs [--check] [--json]\n  (default) materialize un-materialized .agents/skills links; --check only reports (exit 1 if any)");
    return 0;
  }
  const json = argv.includes("--json");
  const root = repoRoot();
  if (argv.includes("--check")) {
    const p = plan(root);
    const names = brokenNames(p);
    if (json) console.log(JSON.stringify({ present: p.present, broken: names, count: names.length }, null, 2));
    else console.log(names.length ? `.agents/skills: ${names.length} unresolved — ${names.join(", ")} (run without --check to materialize)` : ".agents/skills: all resolve (nothing to do)");
    return names.length ? 1 : 0;
  }
  const r = materialize({ root });
  if (json) console.log(JSON.stringify(r, null, 2));
  else console.log(r.materialized.length ? `materialized ${r.materialized.length}:\n` + r.materialized.map((m) => `  ${m.action.padEnd(9)} ${m.file}`).join("\n") : ".agents/skills: nothing to materialize (already resolved or intact symlinks)");
  return 0;
}

// Entrypoint guard that is correct on Windows too: process.argv[1] is an OS path (backslashes on win32),
// so compare via pathToFileURL, never a hand-built `file://` + raw path (that never matches on win32).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
