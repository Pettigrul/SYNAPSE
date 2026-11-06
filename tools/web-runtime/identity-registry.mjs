// SecurityAuditor — minimal Identity Registry (H1b-F1).
// Separates LOGICAL IDENTITY (opaque principalId + kind + label) from the CREDENTIAL STORE
// (the browser storageState blob: cookies/origins). The credential store is kept in-memory
// and is NEVER returned to the LLM and NEVER written to disk in plaintext. Callers receive
// only opaque references and redacted metadata.
//
// This is NOT an authentication framework, database or vault — it is the smallest registry
// needed to bind principals to isolated browser contexts and to reuse auth state in a
// controlled way (Rule 6: secrets live by reference, never in model-visible context).
import crypto from "node:crypto";

export const KINDS = Object.freeze(["owner", "cross-user", "noauth"]);

function newPrincipalId() { return `pr-${crypto.randomBytes(8).toString("hex")}`; }

export class IdentityRegistry {
  constructor() {
    this._identities = new Map(); // principalId -> { principalId, kind, label, createdAt }
    this._creds = new Map();      // principalId -> storageState (SECRET; internal only)
  }

  /** Register a logical identity. storageState (if any) goes to the SEALED credential store. */
  register({ kind = "noauth", label = "", storageState = null } = {}) {
    if (!KINDS.includes(kind)) throw new Error(`unknown identity kind: ${kind} (valid kinds: ${KINDS.join(", ")})`);
    const principalId = newPrincipalId();
    this._identities.set(principalId, { principalId, kind, label: String(label || ""), createdAt: new Date().toISOString() });
    if (storageState) this._creds.set(principalId, storageState);
    return principalId;
  }

  has(principalId) { return this._identities.has(principalId); }

  /** Model-visible view: opaque id + kind + label + whether auth state exists. NO secrets. */
  describe(principalId) {
    const id = this._identities.get(principalId);
    if (!id) return null;
    return { principalId: id.principalId, kind: id.kind, label: id.label, createdAt: id.createdAt, hasAuthState: this._creds.has(principalId) };
  }
  list() { return [...this._identities.keys()].map((p) => this.describe(p)); }

  /** INTERNAL: the sealed storageState for a principal (used only to create a context). */
  _authStateFor(principalId) { return this._creds.get(principalId) || null; }

  /** Store/replace a principal's auth state (controlled capture). Returns only a boolean. */
  _setAuthState(principalId, storageState) {
    if (!this._identities.has(principalId)) throw new Error(`unknown principal: ${principalId}`);
    if (storageState) { this._creds.set(principalId, storageState); return true; }
    return false;
  }

  /** Forget a principal and wipe its sealed credentials. */
  forget(principalId) {
    this._creds.delete(principalId);
    return this._identities.delete(principalId);
  }
  forgetAll() { this._creds.clear(); this._identities.clear(); }
}
