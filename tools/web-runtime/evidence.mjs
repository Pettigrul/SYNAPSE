// SecurityAuditor — Web Runtime evidence recorder (evidence-hygiene + Rule 6).
// Persists a SANITIZED inspection artifact. Credentials are never written to disk.
// Portable filenames (Windows-safe): lowercase, no reserved chars, no case collisions.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** @typedef {import('./contracts.d.ts').Inspection} Inspection */
/** @typedef {import('./contracts.d.ts').EvidenceRecord} EvidenceRecord */

// Conservative credential redaction over the serialized artifact (defence in depth;
// headers are already redacted upstream by the backend).
const REDACTORS = [
  [/\b(bearer)\s+[A-Za-z0-9._~+/=-]{6,}/gi, "$1 [REDACTED]"],
  // key may carry a prefix joined by _/- (e.g. api_token, x-auth-token, csrf_token, access_token)
  [/\b([a-z0-9]+(?:[_-][a-z0-9]+)*[_-])?(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token)\s*[=:]\s*("?)[^"&\s]{3,}\3/gi, "$1$2=[REDACTED]"],
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, "[REDACTED-JWT]"], // JWT shape
];

export function redactCredentials(text) {
  let out = String(text);
  for (const [re, rep] of REDACTORS) out = out.replace(re, rep);
  return out;
}

/** Windows-safe, collision-resistant filename derived from a URL. */
export function portableName(urlStr, ext = "json") {
  let host = "target", pth = "";
  try { const u = new URL(urlStr); host = u.hostname; pth = u.pathname; } catch { /* keep defaults */ }
  const slug = `${host}${pth}`.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "target";
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const short = crypto.createHash("sha256").update(urlStr).digest("hex").slice(0, 8);
  return `${slug}.${ts}.${short}.${ext}`;
}

/**
 * Record a sanitized evidence artifact to disk.
 * @param {Inspection} inspection
 * @param {{ dir: string }} ctx  directory to write into (created if missing)
 * @returns {Promise<EvidenceRecord>}
 */
export async function record(inspection, ctx) {
  if (!ctx || !ctx.dir) throw new Error("evidence.record requires ctx.dir");
  const safe = {
    backend: inspection.backend,
    kind: inspection.kind,
    finalUrl: inspection.finalUrl,
    status: inspection.status,
    headers: inspection.headers,                 // already redacted upstream
    staticHtml: redactCredentials(inspection.staticHtml || ""),
    references: inspection.references || [],
    network: inspection.network,
    rendered: false,
    dom: null,
    screenshot: null,
    recordedAt: new Date().toISOString(),
  };
  const serialized = redactCredentials(JSON.stringify(safe, null, 2));
  fs.mkdirSync(ctx.dir, { recursive: true });
  const file = path.join(ctx.dir, portableName(inspection.finalUrl, "json"));
  fs.writeFileSync(file, serialized, "utf8");
  const sha256 = crypto.createHash("sha256").update(serialized).digest("hex");
  return {
    path: file,
    sha256,
    sanitized: true,
    summary: { finalUrl: safe.finalUrl, status: safe.status, bytesRead: safe.network ? safe.network.bytesRead : 0, references: safe.references.length },
  };
}
