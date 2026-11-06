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

export const TOOL_NAMES = Object.freeze({
  capabilities: "securityauditor_capabilities",
  invoke: "securityauditor_invoke",
});

/**
 * @param {{ defineTool:Function, Type:any, bridge:any, resolveContext?:Function }} deps
 * @returns {(pi:any)=>void} a Pi ExtensionFactory
 */
export function createSecurityAuditorExtension({ defineTool, Type, bridge, resolveContext } = {}) {
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
