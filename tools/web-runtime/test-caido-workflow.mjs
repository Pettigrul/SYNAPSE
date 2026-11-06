// H2b-F5a — deterministic tests for offline Workflow generation & validation.
// NO network, NO Caido, NO LLM, NO publish, NO execution. Native generation is BLOCKED (opaque
// definition) → we validate the INTERMEDIATE SPEC (IR) contract only. Contract validation is
// distinct from simulation (testWorkflow*, BLOCKED) and real execution (BLOCKED).

import assert from "node:assert";
import { createBridge } from "./bridge.mjs";
import { createCaidoCopilot } from "./caido-copilot.mjs";
import {
  createWorkflowPlanner, planWorkflow, validateWorkflowProposal, assessConvertibility,
  WORKFLOW_IR_VERSION, NATIVE_WORKFLOW_GATE, KIND_TO_CAIDO, EXAMPLE_DISCOVERIES,
} from "./caido-workflow.mjs";

let n = 0, fail = 0;
const okT = (s) => { n++; console.log(`  ok  ${s}`); };
const badT = (s, e) => { n++; fail++; console.log(`FAIL  ${s}: ${e && e.stack || e}`); };
async function t(s, fn) { try { await fn(); okT(s); } catch (e) { badT(s, e); } }

const ctx = { engagementId: "ENG-1", caidoProjectId: "proj-1" };
const SCOPE = { allowHosts: ["app.lab"], allowPrivate: true };

// 1 — generate the three canonical examples (A passive, B active, C convert)
await t("1 three examples generated", () => {
  const a = planWorkflow(EXAMPLE_DISCOVERIES.A_passive, ctx);
  const b = planWorkflow(EXAMPLE_DISCOVERIES.B_active, ctx);
  const c = planWorkflow(EXAMPLE_DISCOVERIES.C_convert, ctx);
  assert.equal(a.caidoKind, "PASSIVE"); assert.equal(b.caidoKind, "ACTIVE"); assert.equal(c.caidoKind, "CONVERT");
});

// 2 — structural compatibility with PROVEN contracts (WorkflowKind enum values)
await t("2 kinds map to proven WorkflowKind enum", () => {
  assert.deepEqual(Object.values(KIND_TO_CAIDO).sort(), ["ACTIVE", "CONVERT", "PASSIVE"]);
  const a = planWorkflow(EXAMPLE_DISCOVERIES.A_passive, ctx);
  assert.equal(a.native.importable, false); assert.equal(a.native.status, "BLOCKED"); // honest gate
});

// 3 — required fields present
await t("3 required fields present", () => {
  const a = planWorkflow(EXAMPLE_DISCOVERIES.A_passive, ctx);
  for (const f of ["id", "kind", "objective", "provenance", "activation", "inputs", "outputs", "classification", "authorization", "validationCriteria", "limitations", "falsePositiveRisk"]) assert.ok(a[f] != null, `missing ${f}`);
  assert.equal(validateWorkflowProposal(a, { engagementId: "ENG-1" }).valid, true);
});

// 4 — provenance references preserved (evidence Caido id + KB technique)
await t("4 provenance preserved", () => {
  const a = planWorkflow(EXAMPLE_DISCOVERIES.A_passive, ctx);
  assert.equal(a.provenance.evidence[0].caidoRequestId, "rq-1");
  assert.equal(a.provenance.kbTechnique.route, "skills/web-testing/SKILL.md");
});

// 5 — separation hypothesis vs finding (default indicator; no auto-promotion)
await t("5 no auto-promotion to confirmed", () => {
  const a = planWorkflow(EXAMPLE_DISCOVERIES.A_passive, ctx);
  assert.equal(a.classification.level, "investigation-indicator");
  const promoted = { ...a, classification: { level: "confirmed-vulnerability" } };
  const v = validateWorkflowProposal(promoted, { engagementId: "ENG-1" });
  assert.equal(v.valid, false); assert.ok(v.errors.some((e) => e.code === "unsupported-promotion"));
});

// 6 — absence of secrets (clean passes; injected secret rejected)
await t("6 secrets rejected", () => {
  const a = planWorkflow(EXAMPLE_DISCOVERIES.A_passive, ctx);
  assert.equal(validateWorkflowProposal(a, { engagementId: "ENG-1" }).valid, true);
  const leaked = { ...a, objective: a.objective + " Authorization: Bearer abc.def.ghi" };
  const v = validateWorkflowProposal(leaked, { engagementId: "ENG-1" });
  assert.equal(v.valid, false); assert.ok(v.errors.some((e) => e.code === "secret-detected"));
});

// 7 — invalid inputs rejected
await t("7 invalid inputs rejected", () => {
  assert.throws(() => planWorkflow({ kind: "passive" }, ctx), (e) => e.code === "not-convertible" || e.code === "bad-params"); // no signal
  assert.throws(() => planWorkflow({ kind: "convert", objective: "x", transforms: ["evil-exec"] }, ctx), (e) => e.code === "not-convertible");
});

// 8 — unsupported workflow type detected
await t("8 unsupported kind detected", () => {
  assert.equal(assessConvertibility({ kind: "telepathy", objective: "x" }).convertible, false);
  const v = validateWorkflowProposal({ ir: WORKFLOW_IR_VERSION, kind: "telepathy", provenance: { engagementId: "ENG-1" }, objective: "x", activation: {}, inputs: [], outputs: [], classification: { level: "investigation-indicator" }, authorization: {}, validationCriteria: [] });
  assert.ok(v.errors.some((e) => e.code === "unsupported-kind"));
});

// 9 — incompatible IR version flagged
await t("9 incompatible version flagged", () => {
  const a = planWorkflow(EXAMPLE_DISCOVERIES.A_passive, ctx);
  const v = validateWorkflowProposal({ ...a, ir: "sa-workflow-ir/999" }, { engagementId: "ENG-1" });
  assert.ok(v.errors.some((e) => e.code === "incompatible-version"));
});

// 10 — scope & authorization
await t("10 scope + authorization", () => {
  const a = planWorkflow({ ...EXAMPLE_DISCOVERIES.A_passive, match: { host: "evil.example", pathHasIdLike: true } }, ctx);
  const v = validateWorkflowProposal(a, { scope: SCOPE, engagementId: "ENG-1" });
  assert.equal(v.valid, false); assert.ok(v.errors.some((e) => e.code === "out-of-scope"));
  const b = planWorkflow(EXAMPLE_DISCOVERIES.B_active, ctx);
  assert.equal(b.authorization.required, true); // active needs operator approval
});

// 11 — deduplication
await t("11 dedup", () => {
  const p = createWorkflowPlanner(ctx);
  const r1 = p.propose(EXAMPLE_DISCOVERIES.A_passive);
  const r2 = p.propose(EXAMPLE_DISCOVERIES.A_passive);
  assert.equal(r1.duplicate, false); assert.equal(r2.duplicate, true);
  assert.equal(p.list().length, 1);
});

// 12 — absence of side effects (no fetch/network during planning+validation)
await t("12 no side effects / no network", () => {
  const prev = globalThis.fetch; globalThis.fetch = () => { throw new Error("no network"); };
  try { const p = createWorkflowPlanner(ctx); const r = p.propose(EXAMPLE_DISCOVERIES.C_convert); p.validate(r.proposal.id); p.generate(r.proposal.id); }
  finally { globalThis.fetch = prev; }
});

// 13 — absence of publish (no publish op / no importWorkflow surface)
await t("13 no publish surface", () => {
  const p = createWorkflowPlanner(ctx);
  for (const f of ["publish", "import", "export", "createWorkflow", "push"]) assert.equal(typeof p[f], "undefined");
  assert.equal(NATIVE_WORKFLOW_GATE.notProvable.some((x) => /import|export/.test(x)), true);
});

// 14 — absence of execution (no run op; generate yields intermediate spec, not execution)
await t("14 no execution; intermediate only", () => {
  const p = createWorkflowPlanner(ctx);
  const r = p.propose(EXAMPLE_DISCOVERIES.B_active);
  const g = p.generate(r.proposal.id);
  assert.equal(g.artifactKind, "intermediate-spec"); assert.equal(g.nativeImportable, false);
  assert.equal(g.validation.simulated, false); assert.equal(g.validation.executed, false);
});

// 15 — compatibility with Copilot and Investigation Record (via Bridge, operator-initiated)
await t("15 bridge: propose from investigation + copilot compat", async () => {
  const b = createBridge();
  b.openInvestigation({ investigationId: "ENG-1", scope: SCOPE, allowedCapabilities: ["workflow", "investigation", "copilot"], caido: { baseUrl: "https://caido.lab", token: "T", projectId: "proj-1" } });
  // seed an investigation record
  await b.invoke({ investigationId: "ENG-1", op: "investigation.start", params: { hypothesis: "IDOR on /users/{id}", route: "skills/web-testing/SKILL.md" } });
  await b.invoke({ investigationId: "ENG-1", op: "investigation.evidence", params: { evidence: [{ caidoRequestId: "rq-1" }] } });
  const prop = await b.invoke({ investigationId: "ENG-1", op: "workflow.propose", params: { discovery: { from: "investigation", kind: "passive", structuralSignal: "id-like", match: { pathHasIdLike: true } } } });
  assert.equal(prop.ok, true);
  assert.equal(prop.result.proposal.objective, "IDOR on /users/{id}");
  assert.equal(prop.result.proposal.provenance.evidence[0].caidoRequestId, "rq-1");
  // copilot recommendation alone must NOT force a rule
  const cop = createCaidoCopilot({ engagementId: "ENG-1", caidoProjectId: "proj-1" });
  cop.ingest([{ type: "new", caidoRequestId: "rq-9", responseAvailable: true, ts: "t", host: "app.lab", method: "GET", url: "https://app.lab/x", statusCode: 200 }]);
  const bad = await b.invoke({ investigationId: "ENG-1", op: "workflow.propose", params: { discovery: { kind: "passive", objective: "vague", copilotRecommendationId: "REC-x" } } });
  assert.equal(bad.ok, false); assert.equal(bad.error.code, "not-convertible");
  const v = await b.invoke({ investigationId: "ENG-1", op: "workflow.validate", params: { id: prop.result.proposal.id } });
  assert.equal(v.ok, true); assert.equal(v.result.valid, true); assert.equal(v.result.nativeImportable, false);
});

// 16 — absence of Whitebox access
await t("16 no whitebox surface", () => {
  const p = createWorkflowPlanner(ctx);
  for (const f of ["readWhitebox", "readSource", "codeReview"]) assert.equal(typeof p[f], "undefined");
  const a = planWorkflow(EXAMPLE_DISCOVERIES.A_passive, ctx);
  assert.ok(!JSON.stringify(a).toLowerCase().includes("whitebox"));
});

// 17 — KB preservation (only references ids/routes; no KB body embedded/modified)
await t("17 KB preserved (reference only)", () => {
  const a = planWorkflow(EXAMPLE_DISCOVERIES.A_passive, ctx);
  assert.equal(a.provenance.kbTechnique.route, "skills/web-testing/SKILL.md"); // a pointer, not content
  assert.ok(Array.isArray(a.provenance.kbTechnique.keywords));
});

console.log(`\n${n - fail}/${n} passed` + (fail ? ` (${fail} FAILED)` : ""));
process.exit(fail ? 1 : 0);
