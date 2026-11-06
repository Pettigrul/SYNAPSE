// SecurityAuditor — Multi-Session Runtime / Session Manager (H1b-F1).
// Evolves the single-session Browser Runtime into MULTIPLE independent principals and
// authenticated sessions, each in its OWN isolated BrowserContext (cookies/localStorage/
// sessionStorage isolated by Playwright). ONE shared browser process hosts N contexts.
//
// IN SCOPE (H1b-F1): session lifecycle, minimal Identity Registry, principal<->context
// association, per-session isolation/limits/scope/cancel, controlled auth-state reuse,
// HTTP fallback that NEVER falsely claims authentication.
// OUT OF SCOPE (not here): Authorization Matrix / IDOR-BOLA execution (H1b-F2), race
// conditions (H1c), external integrations. No DB, no vault, no scheduler, no auth framework.
//
// Identifiers are kept DISTINCT and opaque: principalId (identity) / sessionId (session) /
// contextId (BrowserContext) / resourceId (a thing acted upon, assigned by callers at F2).
import crypto from "node:crypto";
import { Session, BrowserUnavailableError, probe as browserProbe, detectChannel, loadDefaultDriver, mergeLimits } from "./session.mjs";
import { IdentityRegistry } from "./identity-registry.mjs";
import { inspect as httpInspect } from "./backends/http-inspect.mjs";

function newContextId() { return `ctx-${crypto.randomBytes(6).toString("hex")}`; }

export class SessionManager {
  /** @param {{driver?, maxSessions?, limits?}} opts  driver injected in tests; else real/lazy. */
  constructor({ driver = null, maxSessions = 8, limits = {} } = {}) {
    this._driver = driver;          // injected (mock) OR null => lazy real driver
    this._pool = null;              // shared browser (one process, many contexts)
    this._maxSessions = maxSessions;
    this._defaultLimits = limits;
    this.identities = new IdentityRegistry();
    this._sessions = new Map();     // sessionId -> Session
    this._meta = new Map();         // sessionId -> { principalId, kind, contextId, authenticated }
  }

  // ---- shared browser pool (lazy) -----------------------------------------
  async _ensurePool() {
    if (this._pool) return this._pool;
    if (this._driver) { this._pool = await this._driver.launchPool({ ignoreHTTPSErrors: false }); return this._pool; }
    const pr = await browserProbe();
    if (!pr.available) throw new BrowserUnavailableError(pr.reason || "visual backend unavailable");
    const driver = await loadDefaultDriver();
    const ch = detectChannel();
    this._driver = driver;
    this._pool = await driver.launchPool({ channel: ch && ch.channel, executablePath: ch && ch.executablePath, ignoreHTTPSErrors: false });
    return this._pool;
  }

  _activeCount() { let n = 0; for (const s of this._sessions.values()) if (!s.closed) n++; return n; }
  _require(sessionId) { const s = this._sessions.get(sessionId); if (!s || s.closed) throw new Error(`no such open session: ${sessionId}`); return s; }

  // ---- capability: session.create -----------------------------------------
  /**
   * Create an isolated session bound to a principal (owner|cross-user|noauth).
   * `principal` may be an existing opaque principalId, or omitted to register a new
   * identity from {kind,label}. If that principal has sealed auth state, the context is
   * created authenticated (controlled reuse) WITHOUT exposing any credential.
   */
  async create({ scope, principal = null, kind = "noauth", label = "", limits = {}, evidenceDir = null, signal = null } = {}) {
    if (!scope) throw new Error("session.create requires a scope (Rule 0)");
    if (this._activeCount() >= this._maxSessions) throw new Error(`maxSessions reached (${this._maxSessions})`);

    let principalId;
    if (principal) { if (!this.identities.has(principal)) throw new Error(`unknown principal: ${principal}`); principalId = principal; }
    else { principalId = this.identities.register({ kind, label }); }
    const idv = this.identities.describe(principalId);
    const storageState = this.identities._authStateFor(principalId); // SECRET, stays internal

    const pool = await this._ensurePool();
    const contextId = newContextId();
    const sess = new Session({ scope, limits: mergeLimits({ ...this._defaultLimits, ...limits }), signal, evidenceDir, principalId, contextId });
    const handle = await pool.newSession({
      scopeAllows: (u) => sess.scopeAllows(u),
      onRequest: (r) => sess.onRequest(r),
      onConsole: (c) => sess.onConsole(c),
      signal, storageState, timeoutMs: sess.limits.navTimeoutMs, ignoreHTTPSErrors: false,
    });
    sess.attach(handle);
    this._sessions.set(sess.id, sess);
    this._meta.set(sess.id, { principalId, kind: idv.kind, contextId, authenticated: !!storageState });
    return { sessionId: sess.id, principalId, contextId, kind: idv.kind, visual: true, authenticated: !!storageState };
  }

  // ---- capability: session.get / list / status ----------------------------
  get(sessionId) {
    const s = this._sessions.get(sessionId); if (!s) return null;
    const m = this._meta.get(sessionId) || {};
    return { sessionId, principalId: m.principalId, contextId: m.contextId, kind: m.kind, authenticated: !!m.authenticated, closed: s.closed, actions: s.n };
  }
  list() { return [...this._sessions.keys()].map((id) => this.get(id)); }
  status(sessionId) {
    const s = this._require(sessionId);
    const m = this._meta.get(sessionId) || {};
    return {
      sessionId, principalId: m.principalId, contextId: m.contextId, kind: m.kind,
      authenticated: !!m.authenticated, closed: s.closed,
      actions: s.n, networkEntries: s.network.length, consoleMessages: s.console.length,
      ageMs: Date.now() - s.createdAt, limits: s.limits, lastUrl: s.handle ? s.handle.url : null,
    };
  }

  // ---- capability: session.bindIdentity -----------------------------------
  /**
   * Associate an identity with a session, optionally CAPTURING the session's current auth
   * state into the principal's sealed store for later controlled reuse. Returns opaque refs
   * only — never a cookie, token or storageState.
   */
  async bindIdentity(sessionId, { principal = null, kind = "owner", label = "", captureAuthState = false } = {}) {
    const s = this._require(sessionId);
    let principalId;
    if (principal) { if (!this.identities.has(principal)) throw new Error(`unknown principal: ${principal}`); principalId = principal; }
    else { principalId = this.identities.register({ kind, label }); }
    let captured = false;
    if (captureAuthState) {
      if (!s.handle || !s.handle.storageState) throw new Error("session handle cannot capture storageState");
      const st = await s.handle.storageState();      // SECRET
      captured = this.identities._setAuthState(principalId, st);
    }
    s.principalId = principalId;
    const idv = this.identities.describe(principalId);
    this._meta.set(sessionId, { ...(this._meta.get(sessionId) || {}), principalId, kind: idv.kind });
    return { sessionId, principalId, kind: idv.kind, captured };
  }

  // ---- capability: session.request ----------------------------------------
  /** Route a browser operation to a specific session. op decides the method. */
  /** The allowlist scope bound to a session (config, not a secret) — for pre-validation. */
  scopeOf(sessionId) { const s = this._sessions.get(sessionId); return s ? s.scope : null; }

  async request(sessionId, { op, url, locator, value, dir, method, body, timeoutMs } = {}) {
    const s = this._require(sessionId);
    switch (op) {
      case "navigate": case "open": return s.navigate(url);
      case "snapshot": return s.snapshot();
      case "screenshot": return s.screenshot({ dir });
      case "click": return s.click(locator);
      case "fill": return s.fill(locator, value);
      case "probe": case "fetch": return s.apiProbe({ method, url, body, timeoutMs });
      case "network": return s.networkSnapshot();
      case "console": return s.consoleSnapshot();
      case "actionLog": return { sessionId, log: s.actionLog() };
      default: throw new Error(`unsupported session.request op: ${op}`);
    }
  }

  // ---- capability: session.close / closeAll --------------------------------
  /** Close one session's context; sibling sessions are unaffected. */
  async close(sessionId) {
    const s = this._sessions.get(sessionId);
    if (!s) return { closed: false };
    const r = await s.close();
    return { closed: true, sessionId, actions: r.actions };
  }
  /** Close every session AND release the shared browser. */
  async closeAll() {
    let n = 0;
    for (const s of this._sessions.values()) { if (!s.closed) { try { await s.close(); n++; } catch { /* ignore */ } } }
    if (this._pool) { try { await this._pool.close(); } catch { /* ignore */ } this._pool = null; }
    return { closedSessions: n };
  }

  // ---- HTTP fallback (no false authentication claim) -----------------------
  /** True when a real visual browser is available (never a static claim). */
  async visualAvailable() { if (this._driver) return true; return (await browserProbe()).available; }

  /**
   * HTTP-only fallback session. It CANNOT reproduce an authenticated browser session, and
   * says so explicitly: authenticated:false, visual:false. Requests return static HTTP
   * (rendered:false) — never a rendered DOM, never a claim of carried auth/cookies.
   */
  fallbackSession({ scope } = {}) {
    if (!scope) throw new Error("fallbackSession requires a scope");
    const sessionId = `http-${crypto.randomBytes(6).toString("hex")}`;
    return {
      sessionId, kind: "http-fallback", visual: false, authenticated: false,
      reason: "fallback HTTP — não reproduz sessão autenticada de navegador (sem cookies/estado de sessão)",
      async request({ url }) {
        const insp = await httpInspect({ url }, { scope });
        return { sessionId, authenticated: false, rendered: false, status: insp.status, finalUrl: insp.finalUrl, note: "static HTTP; no browser auth" };
      },
    };
  }
}

export function createSessionManager(opts) { return new SessionManager(opts); }
