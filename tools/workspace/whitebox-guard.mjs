// Whitebox access decision — the single, pure, testable enforcement point.
//
// This function is the REAL mechanism (not a prompt instruction): both the
// engagement module's path resolver and any tool-layer wrapper (e.g. a Claude
// Code PreToolUse hook) call it to decide whether a path under the segregated
// Whitebox/ area may be touched. It makes no I/O and no exceptions — callers
// turn a `deny` into refusal + audit.
//
// HONEST SCOPE: this decision governs access that FLOWS THROUGH a caller which
// consults it. It cannot, by itself, stop a raw `bash cat Whitebox/...` issued
// by an agent that never calls it. Effective tool-layer isolation requires a
// per-runtime enforcement wrapper (documented limitation — see the handbook).

import path from "node:path";

export const WHITEBOX_DIR = "Whitebox";

// Returns { allow, isWhitebox, reason } — deterministic, no side effects.
export function decideWhiteboxAccess({ targetPath, engDir, manifest }) {
  const root = path.resolve(engDir || ".");
  const abs = path.resolve(root, targetPath || "");
  const rel = path.relative(root, abs);

  // Path integrity: never allow escaping the engagement root.
  if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) {
    return { allow: false, isWhitebox: false, reason: "path-escapes-engagement-root" };
  }

  const first = rel.split(path.sep)[0];
  const isWhitebox = first === WHITEBOX_DIR;
  if (!isWhitebox) return { allow: true, isWhitebox: false, reason: "non-whitebox-path" };

  const wb = (manifest && manifest.whitebox) || {};
  const modality = manifest && manifest.modality;
  if (modality !== "whitebox") {
    return { allow: false, isWhitebox: true, reason: `whitebox access requires modality=whitebox (current: ${modality || "unset"})` };
  }
  if (wb.authorized !== true) {
    return { allow: false, isWhitebox: true, reason: "whitebox access requires explicit operator authorization (authorizeWhitebox)" };
  }
  return { allow: true, isWhitebox: true, reason: "whitebox authorized" };
}
