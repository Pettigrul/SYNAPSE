// SecurityAuditor — Pi Adapter CORE (H1d-F1).
//
// Registers SecurityAuditor Web Runtime capabilities as NATIVE Pi tools. This core imports
// NOTHING from Pi: `defineTool`, `Type` (TypeBox) and the `bridge` are INJECTED, so it is
// unit-testable from this project AND loadable under Pi's real extension runtime (the test
// harness injects Pi's genuine `defineTool`/`Type`; the discovery entry `extension-pi.mjs`
// wires the real ones at install time).
//
// Tool surface is deliberately SMALL (2 tools, not dozens): one discovery tool and one typed
// entrypoint. This keeps context cost and validation centralized in the bridge.
//
// TRUST: the Execution Context (scope, allowed capabilities, approvals) is produced by
// `resolveContext` — an ADAPTER-provided, operator-controlled source — never by the LLM. The
// agent only names an opaque investigationId; it cannot invent scope or authorization.
//
// BINDING: the agent names the id, so a contexts file with several clients would let it pick any of them. `makeFileContextSource`
// refuses a context with any sign of an engagement unless the selection here matches it, on every call, so a later `use` counts. Signs: eng: id,
// engagement field, evidenceDir under the root, Caido block with baseUrl, token or project (a project must be the selected engagement's own binding). A context with none of them
// stays usable: nothing ties it to a client, and the operator who wrote it answers for it. Refuses mismatches; it is not a sandbox.

import fs from "node:fs";
import path from "node:path";
import { getActiveEngagement, resolveSessionId, selectEngagement, sanitizeName, confineWithin, cleanForDisplay, engagementConflictHelp, noContextHelp } from "../../../workspace/engagement.mjs";
import { loadScopedEnv } from "../../../preflight/env-loader.mjs";

export const TOOL_NAMES = Object.freeze({
  capabilities: "securityauditor_capabilities",
  invoke: "securityauditor_invoke",
});

// Every engagement this context claims, as directories: the same sanitizing that selects them. All must match, so one sign can't vouch for another.
function claimedEngagements(investigationId, ctx, root) {
  const claims = [];
  if (ctx.engagement != null) claims.push(sanitizeName(ctx.engagement));
  if (String(investigationId).startsWith("eng:")) claims.push(sanitizeName(String(investigationId).slice(4)));
  if (root && typeof ctx.evidenceDir === "string") {
    try { const rel = path.relative(confineWithin(root), confineWithin(root, ctx.evidenceDir)); if (rel) claims.push(rel.split(path.sep)[0]); }
    catch { /* outside the root: says nothing about an engagement */ }
  }
  return claims;
}

/**
 * Execution Context source. SECAUDIT_BRIDGE_CONTEXTS, fixed when Pi starts, points at a JSON file:
 *   { "<investigationId>": { "scope": {...}, "allowedCapabilities": [...], "limits": {...}, "approvals": [...], "engagement": "<optional name>" } }
 * The operator writes it. The Bridge tools can't change it, but the agent's shell can unless the OS keeps it out of reach. Absent file => null => tools refuse.
 */
export function makeFileContextSource() {
  const readContext = (investigationId) => {
    const file = process.env.SECAUDIT_BRIDGE_CONTEXTS;
    if (!file) return null;
    try {
      const all = JSON.parse(fs.readFileSync(file, "utf8"));
      return all && typeof all === "object" && Object.hasOwn(all, investigationId) && all[investigationId] ? all[investigationId] : null;
    } catch { return null; }
  };
  async function resolveContext(investigationId) {
    const ctx = readContext(investigationId);
    if (!ctx) return null;
    const { engagement: _bound, ...execution } = ctx;
    return execution;
  }
  async function guardContext(investigationId) {
    const ctx = readContext(investigationId);
    if (!ctx) return null; // resolveContext refuses what isn't provisioned
    const seen = { ...process.env }; loadScopedEnv({ target: seen }); // the root may live only in .env; a scratch target keeps Pi's env, which its bash inherits, as it was
    const root = seen.SA_ENGAGEMENT_ROOT || null;
    let sessionId = null; try { sessionId = resolveSessionId({ env: seen }); } catch { /* unusable SA_SESSION_ID: no selection */ }
    const active = getActiveEngagement({ root, env: seen, sessionId });
    if (active.conflict) return { code: "engagement-conflict", message: engagementConflictHelp(active.conflict) };
    const id = cleanForDisplay(investigationId), selectedDir = active.dir ? path.basename(active.dir) : null;
    let claims;
    try { claims = claimedEngagements(investigationId, ctx, root); } catch { return { code: "engagement-mismatch", message: `context ${id} names an unusable engagement` }; }
    const ctxProject = ctx.caido && ctx.caido.projectId ? String(ctx.caido.projectId) : null;
    const ctxCaido = !!(ctx.caido && (ctx.caido.baseUrl || ctx.caido.token || ctxProject)); // baseUrl or token alone still reach the instance (caido.health, caido.projects)
    if ((claims.length || ctxCaido) && !selectedDir) return { code: "no-active-engagement", message: `context ${id} belongs to ${claims.length ? `engagement '${cleanForDisplay(claims[0])}'` : ctxProject ? `Caido project ${cleanForDisplay(ctxProject)}` : "a Caido instance"}, and no engagement is selected here (${sessionId ? "tools/workspace/cli.mjs use --name <n>" : noContextHelp()})` };
    const other = claims.find((c) => c !== selectedDir);
    if (other) return { code: "engagement-mismatch", message: `context ${id} belongs to engagement '${cleanForDisplay(other)}', not to the selected '${selectedDir}'` };
    if (ctxProject) {
      // The agent picks the id, so a Caido project is reachable only as the selected engagement's own binding. No binding means no match.
      const bound = selectEngagement({ root, name: selectedDir }).caidoProjectId;
      if (bound !== ctxProject) return { code: "engagement-mismatch", message: `context ${id} uses Caido project ${cleanForDisplay(ctxProject)}, but the selected '${selectedDir}' is ${bound ? `bound to ${cleanForDisplay(bound)}` : "not bound to any (tools/workspace/cli.mjs associate)"}` };
    }
    return null;
  }
  return { resolveContext, guardContext };
}

/**
 * @param {{ defineTool:Function, Type:any, bridge:any, resolveContext?:Function, guardContext?:Function }} deps
 * @returns {(pi:any)=>void} a Pi ExtensionFactory
 */
export function createSecurityAuditorExtension({ defineTool, Type, bridge, resolveContext, guardContext } = {}) {
  if (typeof defineTool !== "function" || !Type || typeof Type.Object !== "function") {
    throw new Error("createSecurityAuditorExtension requires { defineTool, Type } from the Pi runtime");
  }
  if (!bridge || typeof bridge.invoke !== "function") throw new Error("createSecurityAuditorExtension requires a CapabilityBridge");

  // One initialization per investigationId, even under concurrent tool calls (H1e-F1/P1).
  // `opened` holds ids whose openInvestigation has SUCCEEDED; `opening` holds the in-flight
  // init promise so concurrent callers await the SAME initialization instead of each racing
  // openInvestigation across the `await resolveContext` gap — the TOCTOU that produced spurious
  // `duplicate-investigation` errors when an agent fired several sessions.create in parallel.
  const opened = new Set();
  const opening = new Map(); // investigationId -> Promise<{ok:true}|{ok:false,error}>

  async function ensureOpen(investigationId, toolCtx) {
    if (!investigationId) return { ok: false, error: { code: "bad-params", message: "investigationId required" } };
    if (opened.has(investigationId)) return { ok: true };
    let init = opening.get(investigationId);
    if (!init) {
      init = (async () => {
        const ctx = resolveContext ? await resolveContext(investigationId, toolCtx) : null;
        if (!ctx) return { ok: false, error: { code: "no-trusted-context", message: `no adapter-provided Execution Context for ${investigationId} (operator must provision it; the agent cannot)` } };
        bridge.openInvestigation({ ...ctx, investigationId }); // single-flight: runs at most once per id
        opened.add(investigationId);
        return { ok: true };
      })().catch((e) => ({ ok: false, error: { code: (e && e.code) || "context-error", message: String(e && e.message || e) } }));
      opening.set(investigationId, init);
      // Release the in-flight slot once settled. Success is remembered in `opened`; a FAILURE
      // leaves no state, so a later call retries cleanly (no inconsistent half-open investigation).
      init.finally(() => { if (opening.get(investigationId) === init) opening.delete(investigationId); });
    }
    return init;
  }

  function toToolResult(envelope) {
    return {
      content: [{ type: "text", text: JSON.stringify(envelope) }],
      details: envelope,
      structuredContent: envelope,
      isError: envelope && envelope.ok === false,
    };
  }

  const capabilitiesTool = defineTool({
    name: TOOL_NAMES.capabilities,
    label: "SecurityAuditor capabilities",
    description: "Discover SecurityAuditor Web Runtime capabilities and probe backend availability. Use before invoking. op: \"list\" (operations by domain) or \"probe\" (visual-browser availability).",
    promptSnippet: "securityauditor_capabilities — list/probe the SecurityAuditor Web Runtime capabilities.",
    parameters: Type.Object({ op: Type.Union([Type.Literal("list"), Type.Literal("probe")]) }),
    async execute(toolCallId, params, signal) {
      const env = await bridge.invoke({ op: `capabilities.${params.op}` }, { signal });
      return toToolResult(env);
    },
  });

  const invokeTool = defineTool({
    name: TOOL_NAMES.invoke,
    label: "SecurityAuditor invoke",
    description: "Run ONE authorized SecurityAuditor Web Runtime operation inside an open investigation. The investigation's scope, allowed capabilities and per-action approvals are set by the operator — not by you. `op` is a bridge operation id (see securityauditor_capabilities); `params` are that operation's parameters. Results carry the validators' own classification; you must not re-interpret it.",
    promptSnippet: "securityauditor_invoke — run one authorized Web Runtime operation (http/sessions/browser/authorization/concurrent/race) in an investigation.",
    parameters: Type.Object({
      investigationId: Type.String({ description: "Opaque id of an investigation the operator has provisioned." }),
      op: Type.String({ description: "Bridge operation id, e.g. http.inspect, sessions.create, authorization.run, race.run." }),
      params: Type.Optional(Type.Any()),
      operationId: Type.Optional(Type.String({ description: "Optional id so this call can be cancelled individually." })),
    }),
    async execute(toolCallId, params, signal, _onUpdate, toolCtx) {
      // Before ensureOpen and on every call: an investigation already open must not outlive a change of engagement.
      const denied = guardContext ? await guardContext(params.investigationId) : null;
      if (denied) return toToolResult({ ok: false, op: params.op, investigationId: params.investigationId, error: denied });
      const open = await ensureOpen(params.investigationId, toolCtx);
      if (!open.ok) return toToolResult({ ok: false, op: params.op, investigationId: params.investigationId, error: open.error });
      const env = await bridge.invoke(
        { investigationId: params.investigationId, op: params.op, params: params.params || {}, operationId: params.operationId || toolCallId },
        { signal },
      );
      return toToolResult(env);
    },
  });

  return function securityAuditorExtension(pi) {
    pi.registerTool(capabilitiesTool);
    pi.registerTool(invokeTool);
    // Clean shutdown on session end / reload: release browser contexts, invalidate sessions.
    if (typeof pi.on === "function") {
      try { pi.on("session_shutdown", async () => { try { await bridge.shutdown(); } catch { /* ignore */ } }); } catch { /* event unsupported: ignore */ }
    }
  };
}
