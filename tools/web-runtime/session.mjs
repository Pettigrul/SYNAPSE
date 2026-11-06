// SecurityAuditor — reusable browser Session (H1b-F1 core).
// One Session owns ONE isolated BrowserContext+page (via an injected handle) and all the
// per-session state: scope guard (Rule 0 + SSRF), evidence sanitization (Rule 6), limits,
// action log, network/console capture. The LEGACY single-session facade (browser.mjs) and
// the Multi-Session Manager (session-manager.mjs) both drive Session instances, so the
// sanitization/limit/evidence behavior is identical in single- and multi-session modes.
//
// Session does NOT launch the browser — it receives a handle (goto/snapshot/screenshot/
// click/fill/close/storageState, same shape for the mock and real drivers). Launching lives
// in the facade (one browser) and the manager (one browser, many contexts via a pool).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { validateTarget } from "./scope.mjs";
import { sanitizeHeaders } from "./backends/http-inspect.mjs";
import { redactCredentials, portableName } from "./evidence.mjs";

export class BrowserUnavailableError extends Error { constructor(m) { super(m); this.name = "BrowserUnavailableError"; } }
export class CancelledError extends Error { constructor(m = "cancelled") { super(m); this.name = "CancelledError"; } }
export class LimitError extends Error { constructor(m) { super(m); this.name = "LimitError"; } }

export const DEFAULT_LIMITS = Object.freeze({
  navTimeoutMs: 20000,
  actionTimeoutMs: 10000,
  maxActions: 200,
  maxScreenshotBytes: 8 * 1024 * 1024,
  maxNetworkEntries: 1000,
  maxDurationMs: 5 * 60 * 1000, // per-session wall-clock budget
});

export const VISUAL_CAPS = Object.freeze({
  http_request: true, headers: true, redirects: true, static_html: true,
  dom_rendered: true, screenshot: true, javascript: true, interaction: true,
  network_metadata: true, referenced_resources: true, console: true, evidence_record: true,
});
export const CAPS_OFF = Object.freeze({
  http_request: false, headers: false, redirects: false, static_html: false,
  dom_rendered: false, screenshot: false, javascript: false, interaction: false,
  network_metadata: false, referenced_resources: false, console: false, evidence_record: false,
});

// Known channel executables, checked WITHOUT launching or spawning a process.
export const CHANNEL_CANDIDATES = [
  ["chrome", ["/usr/bin/google-chrome-stable", "/usr/bin/google-chrome",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"]],
  ["msedge", ["/usr/bin/microsoft-edge", "/usr/bin/microsoft-edge-stable",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe"]],
  ["chromium", ["/usr/bin/chromium", "/usr/bin/chromium-browser"]],
];

export function detectChannel() {
  for (const [channel, paths] of CHANNEL_CANDIDATES) {
    for (const p of paths) { try { if (fs.existsSync(p)) return { channel, executablePath: p }; } catch { /* ignore */ } }
  }
  return null;
}

/**
 * Report visual-backend availability WITHOUT launching or downloading anything.
 * Visual capabilities are reported true ONLY when both playwright-core and an installed
 * browser channel are present.
 */
export async function probe() {
  let pw = false, pwReason = "";
  try { await import("playwright-core"); pw = true; }
  catch { pwReason = "playwright-core não instalado"; }
  const ch = detectChannel();
  const available = pw && !!ch;
  const reasons = [];
  if (!pw) reasons.push(pwReason);
  if (!ch) reasons.push("nenhum navegador homologado encontrado (chrome/msedge/chromium)");
  return {
    id: "browser", kind: "visual", available,
    channel: ch ? ch.channel : null,
    reason: available ? "" : reasons.join("; "),
    capabilities: available ? VISUAL_CAPS : CAPS_OFF,
  };
}

export function mergeLimits(p) { return { ...DEFAULT_LIMITS, ...(p || {}) }; }
export function throwIfAborted(signal) { if (signal && signal.aborted) throw new CancelledError(); }

export function describeLocator(spec) {
  if (!spec || typeof spec !== "object") return String(spec);
  if (spec.role) return `role=${spec.role}${spec.name ? ` name=${JSON.stringify(spec.name)}` : ""}`;
  if (spec.label) return `label=${JSON.stringify(spec.label)}`;
  if (spec.text) return `text=${JSON.stringify(spec.text)}`;
  if (spec.placeholder) return `placeholder=${JSON.stringify(spec.placeholder)}`;
  if (spec.testId) return `testId=${JSON.stringify(spec.testId)}`;
  if (spec.css) return `css=${spec.css} (non-semantic fallback)`;
  return JSON.stringify(spec);
}

export async function loadDefaultDriver() {
  const m = await import("./driver-playwright.mjs"); // throws only if playwright-core absent at launch
  return m.createDriver();
}

function newSessionId() {
  return `br-${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(3).toString("hex")}`;
}

/**
 * One isolated browser session. Construct with a ctx (scope/limits/signal/evidenceDir and,
 * in multi-session mode, principalId/contextId), then attach a launched handle, then drive.
 * `scopeAllows`/`onRequest`/`onConsole` are the callbacks the driver wires at launch.
 */
export class Session {
  constructor(ctx = {}) {
    this.id = ctx.sessionId || newSessionId();
    this.ctx = ctx;
    this.scope = ctx.scope;
    this.limits = mergeLimits(ctx.limits);
    this.signal = ctx.signal;
    this.evidenceDir = ctx.evidenceDir || null;
    this.principalId = ctx.principalId || null; // opaque identity ref (never a credential)
    this.contextId = ctx.contextId || null;     // opaque BrowserContext ref
    this.n = 0;
    this.log = [];
    this.network = [];
    this.console = [];
    this.handle = null;
    this.createdAt = Date.now();
    this.closed = false;
  }

  // ---- driver callbacks (bound per session) -------------------------------
  scopeAllows(url) {
    const ok = this._inScope(url);
    if (!ok) this.record("request-blocked", url, "blocked", "out-of-scope (scope guard)");
    return ok;
  }
  _inScope(url) { try { validateTarget(url, this.scope); return true; } catch { return false; } }
  onRequest(r) {
    if (this.network.length < this.limits.maxNetworkEntries) {
      this.network.push({
        method: r.method, url: r.url, resourceType: r.resourceType, status: r.status,
        phase: r.phase, blocked: !!r.blocked, ...(r.to ? { to: r.to } : {}),
        headers: sanitizeHeaders(r.headers || {}),
      });
    }
  }
  onConsole(c) { this.console.push({ type: c.type, text: redactCredentials(String(c.text || "")) }); }

  record(action, target, status, detail, evidence) {
    const entry = { actionId: `${this.id}-${++this.n}`, ts: new Date().toISOString(), action, target, status, ...(detail ? { detail } : {}), ...(evidence ? { evidence } : {}) };
    this.log.push(entry);
    return entry;
  }
  guard() {
    throwIfAborted(this.signal);
    if (this.closed) throw new Error("session closed");
    if (this.n >= this.limits.maxActions) throw new LimitError(`maxActions exceeded (${this.limits.maxActions})`);
    if (this.limits.maxDurationMs && (Date.now() - this.createdAt) > this.limits.maxDurationMs) throw new LimitError(`maxDurationMs exceeded (${this.limits.maxDurationMs})`);
  }
  attach(handle) { this.handle = handle; return this; }
  _requireHandle() { if (!this.handle) throw new Error("session has no browser handle — not opened"); return this.handle; }

  // ---- operations ---------------------------------------------------------
  async navigate(url) {
    validateTarget(url, this.scope);         // Rule 0 — before navigation
    this.guard();
    const nav = await this._requireHandle().goto(url);
    for (const hop of nav.redirectChain || []) validateTarget(hop.to, this.scope); // re-check each hop
    validateTarget(nav.finalUrl, this.scope);
    const action = this.record("open", url, "ok", `status=${nav.status} final=${nav.finalUrl}`);
    return { sessionId: this.id, finalUrl: nav.finalUrl, status: nav.status, redirectChain: nav.redirectChain || [], action };
  }
  async snapshot() {
    this.guard();
    const snap = await this._requireHandle().snapshot();
    const html = redactCredentials(String(snap.html || ""));
    const text = redactCredentials(String(snap.accessibilityText || ""));
    const action = this.record("snapshot", this.handle.url || "", "ok", `bytes=${html.length}`);
    return { sessionId: this.id, rendered: true, html, accessibilityText: text, action };
  }
  async screenshot(opts = {}) {
    this.guard();
    const buf = await this._requireHandle().screenshot();
    if (!Buffer.isBuffer(buf)) throw new Error("driver screenshot must return a Buffer");
    if (buf.length > this.limits.maxScreenshotBytes) throw new LimitError(`screenshot exceeds maxScreenshotBytes (${buf.length})`);
    const dir = opts.dir || this.evidenceDir;
    if (!dir) throw new Error("screenshot requires a dir (opts.dir or ctx.evidenceDir)");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, portableName(this.handle.url || "screenshot", "png"));
    fs.writeFileSync(file, buf);
    const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
    const action = this.record("screenshot", this.handle.url || "", "ok", `bytes=${buf.length}`, { path: file, sha256, bytes: buf.length });
    return { sessionId: this.id, path: file, sha256, bytes: buf.length, action };
  }
  async click(spec) {
    this.guard();
    const target = describeLocator(spec);
    try { const r = await this._requireHandle().click(spec); const action = this.record("click", target, "ok"); return { sessionId: this.id, ok: !!(r && r.ok !== false), action }; }
    catch (e) { this.record("click", target, "error", String(e && e.message)); throw e; }
  }
  async fill(spec, value) {
    this.guard();
    const target = describeLocator(spec);
    try {
      const r = await this._requireHandle().fill(spec, value);
      // never log the typed value (may be a credential) — only its length
      const action = this.record("fill", target, "ok", `value.len=${String(value == null ? 0 : String(value).length)}`);
      return { sessionId: this.id, ok: !!(r && r.ok !== false), action };
    } catch (e) { this.record("fill", target, "error", String(e && e.message)); throw e; }
  }
  /**
   * Authenticated authorization probe (H1b-F2). Issues a same-origin fetch FROM the session's
   * own BrowserContext, so the principal's sealed cookies are applied by the browser (never
   * extracted). The request is page-originated → it passes the context route guard (scope +
   * sanitized capture). The returned body is credential-sanitized and meant to be normalized
   * by the caller transiently — raw bodies must NOT be persisted in cross-principal results.
   */
  async apiProbe({ method = "GET", url, body = null, timeoutMs = null } = {}) {
    validateTarget(url, this.scope); // Rule 0 before probing (route guard re-checks each hop)
    this.guard();
    const h = this._requireHandle();
    if (typeof h.evaluate !== "function") throw new Error("session handle cannot probe (no evaluate)");
    const res = await h.evaluate(async (a) => {
      try {
        const opt = { method: a.method, headers: {} };
        if (a.body != null) { opt.headers["content-type"] = "application/json"; opt.body = a.body; }
        let to = null, ac = null;
        if (a.timeoutMs) { ac = new AbortController(); opt.signal = ac.signal; to = setTimeout(() => ac.abort(), a.timeoutMs); }
        try {
          const r = await fetch(a.url, opt);
          let t = ""; try { t = await r.text(); } catch { /* opaque/no body */ }
          return { status: r.status, body: t, ctype: r.headers.get("content-type") || "" };
        } finally { if (to) clearTimeout(to); }
      } catch (e) { return { status: 0, error: (e && e.name === "AbortError") ? "timeout" : String(e && e.message || e) }; }
    }, { method, url, body, timeoutMs });
    const action = this.record("probe", url, res.error ? "error" : `status=${res.status}`, `method=${method} status=${res.status || 0}`);
    return {
      sessionId: this.id, requestId: action.actionId, method, url,
      status: res.status || 0, contentType: res.ctype || "", error: res.error || null,
      body: res.error ? null : redactCredentials(String(res.body || "")),
    };
  }
  networkSnapshot() {
    return { sessionId: this.id, entries: this.network.map((e) => ({ ...e, headers: sanitizeHeaders(e.headers || {}) })) };
  }
  consoleSnapshot() { return { sessionId: this.id, messages: this.console.slice() }; }
  async close() {
    if (this.closed) return { closed: false, sessionId: this.id };
    try { if (this.handle && this.handle.close) await this.handle.close(); } finally { this.closed = true; }
    return { closed: true, sessionId: this.id, actions: this.log.length };
  }
  actionLog() { return this.log.slice(); }
}
