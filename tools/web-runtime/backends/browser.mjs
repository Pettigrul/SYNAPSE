// SecurityAuditor — Visual Browser Backend (single-session facade; H1a-F2 contract).
// Drives a PRE-INSTALLED Chrome/Edge via playwright-core. NEVER downloads a browser.
// This is the BACKWARD-COMPATIBLE single-session surface: one active session at a time.
// The reusable per-session logic lives in ../session.mjs (shared with the Multi-Session
// Manager in ../session-manager.mjs); this file only owns the single-ACTIVE lifecycle so
// the H1a-F2 API and tests keep working unchanged.
import { validateTarget } from "../scope.mjs";
import {
  Session, BrowserUnavailableError, CancelledError, LimitError,
  DEFAULT_LIMITS, VISUAL_CAPS, CAPS_OFF, detectChannel, probe, describeLocator, loadDefaultDriver,
} from "../session.mjs";

export { BrowserUnavailableError, CancelledError, LimitError, DEFAULT_LIMITS, VISUAL_CAPS, CAPS_OFF, detectChannel, probe, describeLocator };

// --- Single active session -------------------------------------------------
let ACTIVE = null;
function requireActive() { if (!ACTIVE) throw new Error("no active browser session — call browser.open first"); return ACTIVE; }

/** Open a page (validates scope BEFORE navigation; single session). */
export async function open(url, ctx) {
  if (ACTIVE) throw new Error("a browser session is already open (single-session backend) — call browser.close first");
  validateTarget(url, ctx.scope); // Rule 0 — before any launch/navigation
  const sess = new Session(ctx);

  const driver = ctx.driver || (await (async () => {
    const pr = await probe();
    if (!pr.available) throw new BrowserUnavailableError(pr.reason || "visual backend unavailable");
    return loadDefaultDriver();
  })());

  const ch = ctx.driver ? { channel: ctx.channel || "mock", executablePath: null } : detectChannel();
  const handle = await driver.launch({
    channel: ch && ch.channel, executablePath: ch && ch.executablePath,
    scopeAllows: (u) => sess.scopeAllows(u),
    onRequest: (r) => sess.onRequest(r),
    onConsole: (c) => sess.onConsole(c),
    signal: ctx.signal,
    timeoutMs: sess.limits.navTimeoutMs,
    ignoreHTTPSErrors: false, // never bypass TLS
  });
  sess.attach(handle);
  const nav = await sess.navigate(url);
  ACTIVE = sess;
  return nav;
}

export async function snapshot() { return requireActive().snapshot(); }
export async function screenshot(opts = {}) { return requireActive().screenshot(opts); }
export async function click(spec) { return requireActive().click(spec); }
export async function fill(spec, value) { return requireActive().fill(spec, value); }
export async function network() { return requireActive().networkSnapshot(); }
export async function consoleLogs() { return requireActive().consoleSnapshot(); }

export async function close() {
  const s = ACTIVE;
  if (!s) return { closed: false };
  try { await s.close(); } finally { ACTIVE = null; }
  return { closed: true, sessionId: s.id, actions: s.log.length };
}

/** Full action log of the active session (empty once closed). */
export function actionLog() { return ACTIVE ? ACTIVE.actionLog() : []; }

export const backend = Object.freeze({
  id: "browser", kind: "visual",
  probe, open, snapshot, screenshot, click, fill, network, console: consoleLogs, close,
  _reset() { ACTIVE = null; }, // test aid
});
