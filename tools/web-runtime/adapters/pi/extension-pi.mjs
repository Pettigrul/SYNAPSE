// SecurityAuditor — Pi Adapter DISCOVERY ENTRY (H1d-F1).
//
// The file an operator installs into Pi (`pi install` / ~/.pi/agent/extensions/). It is loaded
// by Pi's extension runtime, where Pi-provided modules resolve by bare specifier. It wires the
// real `defineTool`/`Type` + a real CapabilityBridge + an operator-controlled context source,
// then delegates to the dependency-injected core in `extension.mjs`.
//
// Verified against @earendil-works/pi-coding-agent 1.4.0:
//   - default export is an ExtensionFactory `(pi) => void | Promise<void>` (async supported);
//   - `pi.registerTool(ToolDefinition)` registers a native tool;
//   - `defineTool` is exported from the package; `Type` comes from the bundled `typebox`.
//
// TRUST: the Execution Context is read from an operator-written JSON file named by
// SECAUDIT_BRIDGE_CONTEXTS — never from the LLM. Absent/invalid => tools refuse (no context), and a
// context of another engagement than the selected one is refused too (extension.mjs).
// This binds the tools, not the agent: Pi's bash can still edit that file or reach hosts, so real
// containment needs OS-level isolation (documented limitation).
import { createSecurityAuditorExtension, makeFileContextSource } from "./extension.mjs";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default async function securityAuditorPiEntry(pi) {
  const { createBridge } = await import("../../bridge.mjs");

  const bridge = createBridge(); // real, lazy Playwright driver (never downloads a browser)
  const { resolveContext, guardContext } = makeFileContextSource();

  const factory = createSecurityAuditorExtension({ defineTool, Type, bridge, resolveContext, guardContext });
  await factory(pi);
}
