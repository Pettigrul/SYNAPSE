// SecurityAuditor — minimal Resource Registry (H1b-F2).
// Registers the resources an Authorization Matrix probes, by OPAQUE resourceId, kept DISTINCT
// from principalId/sessionId/contextId. A resource carries the request template, its
// classification, and — when known — WHO legitimately owns it plus an OWNERSHIP MARKER.
//
// The ownership marker is a lab-fixture string that appears in the resource body when the
// response really is the owner's data. It is the "evidence of ownership" required to CONFIRM a
// horizontal/vertical violation (a 200 alone never confirms). It is a fixture label, not a
// secret, and it is NEVER echoed into results — only a boolean "ownership evidence present".
//
// NOT a database or ORM — an in-memory map, the smallest thing the executor needs.
import crypto from "node:crypto";

export const CLASSIFICATIONS = Object.freeze(["private", "public", "shared", "admin", "unknown"]);

function newResourceId() { return `res-${crypto.randomBytes(6).toString("hex")}`; }

export class ResourceRegistry {
  constructor() { this._resources = new Map(); }

  /**
   * @param {{label, request:{method?,url,body?,stateChanging?}, classification?,
   *          ownerPrincipalId?, ownershipMarker?, sharedWith?:string[], expectScopeBlock?}} spec
   */
  register(spec) {
    if (!spec || !spec.request || !spec.request.url) throw new Error("resource requires request.url");
    const classification = spec.classification || "unknown";
    if (!CLASSIFICATIONS.includes(classification)) throw new Error(`unknown classification: ${classification}`);
    const resourceId = newResourceId();
    this._resources.set(resourceId, {
      resourceId,
      label: String(spec.label || ""),
      request: {
        method: (spec.request.method || "GET").toUpperCase(),
        url: spec.request.url,
        body: spec.request.body ?? null,
        stateChanging: !!spec.request.stateChanging,
      },
      classification,
      ownerPrincipalId: spec.ownerPrincipalId || null, // evidence of legitimate ownership
      ownershipMarker: spec.ownershipMarker || null,   // lab-fixture proof string (never echoed)
      sharedWith: Array.isArray(spec.sharedWith) ? spec.sharedWith.slice() : [], // EXPLICIT sharing only
      expectScopeBlock: !!spec.expectScopeBlock,
    });
    return resourceId;
  }

  has(resourceId) { return this._resources.has(resourceId); }
  _get(resourceId) { const r = this._resources.get(resourceId); if (!r) throw new Error(`unknown resource: ${resourceId}`); return r; }

  /** Model-visible view: NO ownership marker (fixture proof) echoed. */
  describe(resourceId) {
    const r = this._resources.get(resourceId); if (!r) return null;
    return {
      resourceId: r.resourceId, label: r.label, classification: r.classification,
      method: r.request.method, url: r.request.url, stateChanging: r.request.stateChanging,
      ownerPrincipalId: r.ownerPrincipalId, sharedWith: r.sharedWith.slice(),
      hasOwnershipEvidence: !!r.ownershipMarker, expectScopeBlock: r.expectScopeBlock,
    };
  }
  list() { return [...this._resources.keys()].map((id) => this.describe(id)); }
}
