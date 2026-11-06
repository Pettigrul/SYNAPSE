// SecurityAuditor — HTTP Inspection Backend (H1a-F1).
// Static HTTP/HTML inspection. NODE STDLIB ONLY. No child processes, no shell,
// no external binaries. This is NOT a visual browser: it never executes JavaScript,
// never renders a DOM, never takes screenshots. Static HTML is returned as-is and
// labeled distinctly from any rendered DOM.
import http from "node:http";
import https from "node:https";
import { validateTarget } from "../scope.mjs";

/** @typedef {import('../contracts.d.ts').OpenResult} OpenResult */
/** @typedef {import('../contracts.d.ts').Inspection} Inspection */
/** @typedef {import('../contracts.d.ts').RequestContext} RequestContext */
/** @typedef {import('../contracts.d.ts').HttpRequest} HttpRequest */

export class CancelledError extends Error { constructor(m = "cancelled") { super(m); this.name = "CancelledError"; } }
export class LimitError extends Error { constructor(m) { super(m); this.name = "LimitError"; } }
export class TimeoutError extends Error { constructor(m = "request timed out") { super(m); this.name = "TimeoutError"; } }

export const DEFAULT_LIMITS = Object.freeze({
  maxBytes: 2 * 1024 * 1024, // 2 MiB
  maxRedirects: 5,
  maxRequests: 6,            // initial + up to 5 redirects
  timeoutMs: 15000,
});

export const CAPABILITIES = Object.freeze({
  http_request: true,
  headers: true,
  redirects: true,
  static_html: true,
  network_metadata: true,
  referenced_resources: true,
  evidence_record: true,
  // Visual capabilities are explicitly UNAVAILABLE in this backend:
  dom_rendered: false,
  screenshot: false,
  javascript: false,
  interaction: false,
});

const SENSITIVE_HEADERS = new Set([
  "authorization", "proxy-authorization", "cookie", "set-cookie",
  "x-api-key", "api-key", "x-auth-token", "x-amz-security-token", "authentication",
]);

/** Redact sensitive header VALUES (Rule 6). Names are kept for visibility. */
export function sanitizeHeaders(headers = {}) {
  /** @type {Record<string,string>} */
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? "[REDACTED]" : String(v);
  }
  return out;
}

function mergeLimits(partial) { return { ...DEFAULT_LIMITS, ...(partial || {}) }; }

function throwIfAborted(signal) { if (signal && signal.aborted) throw new CancelledError(); }

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

// --- Default single-hop transport (node stdlib). NOT used in F1 tests (mocks only),
//     and not pointed at real targets this round. ---
/** @type {import('../contracts.d.ts').Transport} */
export function defaultTransport(url, { method, headers, signal, maxBytes, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? https : http;
    const ac = new AbortController();
    const onAbort = () => ac.abort();
    if (signal) { if (signal.aborted) return reject(new CancelledError()); signal.addEventListener("abort", onAbort, { once: true }); }
    const timer = setTimeout(() => { ac.abort(); reject(new TimeoutError()); }, timeoutMs);
    const req = lib.request(url, { method, headers, signal: ac.signal }, (res) => {
      const chunks = []; let bytes = 0; let truncated = false;
      res.on("data", (d) => {
        if (truncated) return;
        if (bytes + d.length > maxBytes) { truncated = true; chunks.push(d.subarray(0, maxBytes - bytes)); bytes = maxBytes; res.destroy(); return; }
        bytes += d.length; chunks.push(d);
      });
      const done = () => {
        clearTimeout(timer); if (signal) signal.removeEventListener("abort", onAbort);
        resolve({ status: res.statusCode || 0, headers: flattenHeaders(res.headers), body: Buffer.concat(chunks).toString("utf8"), bytesRead: bytes, truncated });
      };
      res.on("end", done); res.on("close", done);
    });
    req.on("error", (e) => { clearTimeout(timer); if (signal) signal.removeEventListener("abort", onAbort); reject(ac.signal.aborted && signal && signal.aborted ? new CancelledError() : e); });
    req.end();
  });
}

function flattenHeaders(h) {
  const out = {};
  for (const [k, v] of Object.entries(h || {})) out[k] = Array.isArray(v) ? v.join(", ") : String(v);
  return out;
}

/**
 * Perform an HTTP transaction with controlled redirects, scope re-validation,
 * limits, timeout and cancellation.
 * @param {HttpRequest} request
 * @param {RequestContext} ctx
 * @returns {Promise<OpenResult>}
 */
export async function open(request, ctx) {
  const limits = mergeLimits(ctx.limits);
  const transport = ctx.transport || defaultTransport;
  const signal = ctx.signal;
  const method = request.method === "HEAD" ? "HEAD" : "GET";
  const reqHeaders = request.headers || {};
  const started = Date.now();

  throwIfAborted(signal);
  let current = validateTarget(request.url, ctx.scope);          // scope check BEFORE first request
  /** @type {import('../contracts.d.ts').RedirectHop[]} */
  const chain = [];
  let requests = 0;
  let last = null;

  for (;;) {
    if (requests >= limits.maxRequests) throw new LimitError(`maxRequests exceeded (${limits.maxRequests})`);
    throwIfAborted(signal);
    last = await transport(current.href, { method, headers: reqHeaders, signal, maxBytes: limits.maxBytes, timeoutMs: limits.timeoutMs });
    requests++;

    const loc = last.headers && (last.headers.location || last.headers.Location);
    if (REDIRECT_STATUS.has(last.status) && loc) {
      if (chain.length >= limits.maxRedirects) throw new LimitError(`maxRedirects exceeded (${limits.maxRedirects})`);
      let next;
      try { next = new URL(loc, current); } catch { throw new Error(`invalid redirect Location: ${loc}`); }
      validateTarget(next.href, ctx.scope);                       // scope re-check AFTER each redirect
      chain.push({ from: current.href, to: next.href, status: last.status });
      current = next;
      continue;
    }
    break;
  }

  return {
    requestedUrl: request.url,
    finalUrl: current.href,
    status: last.status,
    headers: sanitizeHeaders(last.headers),
    redirectChain: chain,
    body: last.body || "",
    bytesRead: last.bytesRead || 0,
    truncated: !!last.truncated,
    elapsedMs: Date.now() - started,
  };
}

const RES_PATTERNS = [
  ["script", /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi],
  ["stylesheet", /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi],
  ["image", /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi],
  ["anchor", /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi],
  ["form", /<form\b[^>]*\baction\s*=\s*["']([^"']+)["']/gi],
  ["iframe", /<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi],
];

/** Extract referenced resources from STATIC html (regex, not a DOM parse / not executed). */
export function extractReferences(html, baseUrl) {
  /** @type {import('../contracts.d.ts').ReferencedResource[]} */
  const out = [];
  for (const [type, re] of RES_PATTERNS) {
    re.lastIndex = 0; let m;
    while ((m = re.exec(html)) !== null) {
      const raw = m[1].trim();
      if (!raw || raw.startsWith("#") || raw.toLowerCase().startsWith("javascript:") || raw.startsWith("data:")) continue;
      let url = raw, absolute = false;
      try { url = new URL(raw, baseUrl).href; absolute = true; } catch { /* keep raw */ }
      out.push({ type, url, absolute });
    }
  }
  return out;
}

/**
 * Full static inspection. Returns an explicitly STATIC view: rendered:false, dom:null.
 * @param {HttpRequest} request
 * @param {RequestContext} ctx
 * @returns {Promise<Inspection>}
 */
export async function inspect(request, ctx) {
  const r = await open(request, ctx);
  return {
    backend: "http-inspect",
    kind: "static-http",
    finalUrl: r.finalUrl,
    status: r.status,
    headers: r.headers,
    staticHtml: r.body,            // STATIC, unexecuted — not a DOM
    references: extractReferences(r.body, r.finalUrl),
    network: {
      requests: r.redirectChain.length + 1,
      redirectChain: r.redirectChain,
      bytesRead: r.bytesRead,
      truncated: r.truncated,
      elapsedMs: r.elapsedMs,
      status: r.status,
    },
    dom: null,                     // no rendered DOM in static-HTTP
    rendered: false,               // static HTML is NOT a rendered DOM
    screenshot: null,              // screenshots unavailable
  };
}

/**
 * Headers/status only (no body).
 * @param {HttpRequest} request
 * @param {RequestContext} ctx
 */
export async function headers(request, ctx) {
  const r = await open({ ...request, method: "HEAD" }, ctx);
  return { finalUrl: r.finalUrl, status: r.status, headers: r.headers, redirectChain: r.redirectChain };
}

export const backend = Object.freeze({
  id: "http-inspect",
  kind: "static-http",
  capabilities: CAPABILITIES,
  limits: DEFAULT_LIMITS,
  open, inspect, headers,
});
