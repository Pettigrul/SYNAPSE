// Deterministic, offline tests for the Pentest Engagement Workspace (H2c-F1).
// No network, no LLM, no real targets. Uses a throwaway temp root.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert";
import {
  initEngagement, loadEngagement, detectWorkspace, validateScope,
  resolveWorkspacePath, ensureBucket, composeContextPaths, sourcesForModality,
  authorizeWhitebox, revokeWhitebox, WhiteboxAccessError, WorkspaceError,
  MODALITIES, DEFAULT_MODALITY, WHITEBOX_DIR, BUCKETS,
} from "./engagement.mjs";
import { decideWhiteboxAccess } from "./whitebox-guard.mjs";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "secaudit-ws-"));
let n = 0, fail = 0;
const ok = (name) => { n++; console.log(`  ok  ${name}`); };
const bad = (name, e) => { n++; fail++; console.log(`FAIL  ${name}: ${e && e.message || e}`); };
function t(name, fn) { try { fn(); ok(name); } catch (e) { bad(name, e); } }

const VALID_SCOPE = "# Scope — Demo\nSource: lab | Loaded: 2026-11-05\n\n## In Scope\n- 127.0.0.1\n\n## Out of Scope\n";
const INVALID_SCOPE = "# Notes\njust some text, no scope sections\n";

// 1 — New engagement
t("1 new engagement creates manifest; default modality blackbox", () => {
  const e = initEngagement({ root: TMP, name: "Acme Web", scope: VALID_SCOPE });
  assert.equal(e.kind, "managed");
  assert.equal(e.modality, "blackbox");
  assert.equal(path.basename(e.dir), "acme web"); // lowercased (recipe keeps spaces)
  assert.ok(fs.existsSync(path.join(e.dir, ".engagement.json")));
});

// 11 — Black Box default excludes code/whitebox sources
t("11 blackbox default: code & whitebox sources off", () => {
  const e = loadEngagement({ dir: path.join(TMP, "acme web") });
  const s = sourcesForModality(e);
  assert.equal(s.code, false);
  assert.equal(s.whitebox, false);
  assert.equal(s.web, true);
});

// 2 — Existing/managed workspace: idempotent, never overwrites
t("2 re-init existing managed engagement is idempotent (no overwrite)", () => {
  const first = initEngagement({ root: TMP, name: "Acme Web" });
  const created = first.created;
  const again = initEngagement({ root: TMP, name: "Acme Web", modality: "whitebox" });
  assert.equal(again.alreadyExisted, true);
  assert.equal(again.modality, "blackbox");   // modality NOT clobbered
  assert.equal(again.created, created);        // manifest untouched
});

// 2b — Legacy workspace adopted without migrating contents
t("2b legacy workspace adopted (manifest added, contents untouched)", () => {
  const legacy = path.join(TMP, "legacy_eng");
  fs.mkdirSync(path.join(legacy, "3-Recon"), { recursive: true });
  fs.writeFileSync(path.join(legacy, "scope.md"), VALID_SCOPE);
  fs.writeFileSync(path.join(legacy, "ccGadgets.md"), "# Gadgets\n");
  assert.equal(detectWorkspace(legacy), "legacy");
  const e = initEngagement({ root: TMP, name: "legacy_eng" });
  assert.equal(e.adopted, true);
  assert.equal(e.adoptedLegacy, true);
  assert.equal(fs.readFileSync(path.join(legacy, "ccGadgets.md"), "utf8"), "# Gadgets\n"); // untouched
});

// 2c — loadEngagement on pure-legacy (no manifest) returns legacy descriptor, no migration
t("2c load pure-legacy returns kind=legacy schema=0 (no migration)", () => {
  const legacy = path.join(TMP, "pure_legacy");
  fs.mkdirSync(path.join(legacy, "1-Reports"), { recursive: true });
  const e = loadEngagement({ dir: legacy });
  assert.equal(e.kind, "legacy");
  assert.equal(e.schema, 0);
  assert.ok(!fs.existsSync(path.join(legacy, ".engagement.json")));
});

// 3 — Valid scope.md
t("3 valid scope.md passes validation", () => {
  assert.equal(validateScope(VALID_SCOPE).ok, true);
});

// 4 — Invalid scope.md
t("4 invalid scope.md rejected; init throws bad-scope", () => {
  assert.equal(validateScope(INVALID_SCOPE).ok, false);
  assert.throws(() => initEngagement({ root: TMP, name: "bad", scope: INVALID_SCOPE }),
                (e) => e.code === "bad-scope");
});

// 5 — Isolation between engagements (paths confined to own root)
t("5 engagement isolation: resolver confined to own root", () => {
  const a = initEngagement({ root: TMP, name: "eng-a" });
  const b = initEngagement({ root: TMP, name: "eng-b" });
  const pa = resolveWorkspacePath(a, "3-Recon/host.md");
  assert.ok(pa.startsWith(a.dir));
  assert.ok(!pa.startsWith(b.dir));
});

// 6 — Correct artifact association (buckets map correctly, created lazily)
t("6 artifact association: buckets resolve + lazy create", () => {
  const e = initEngagement({ root: TMP, name: "buckets" });
  // no eager empty dirs at init
  assert.ok(!fs.existsSync(path.join(e.dir, BUCKETS.recon)));
  const recon = ensureBucket(e, "recon");
  assert.ok(fs.existsSync(recon));
  assert.equal(path.basename(recon), "3-Recon");
});

// 7 — Path integrity (traversal / absolute rejected) — REAL mechanism
t("7 path integrity: traversal + absolute rejected", () => {
  const e = initEngagement({ root: TMP, name: "integrity" });
  assert.throws(() => resolveWorkspacePath(e, "../../etc/passwd"), (x) => x.code === "path-escape");
  assert.throws(() => resolveWorkspacePath(e, "/etc/passwd"), (x) => x.code === "path-escape");
});

// 8 — Recon uses the new structure
t("8 recon path resolves under managed engagement", () => {
  const e = initEngagement({ root: TMP, name: "recon-eng" });
  const p = resolveWorkspacePath(e, "3-Recon/port-scan.md");
  assert.ok(p.endsWith(path.join("recon-eng", "3-Recon", "port-scan.md")));
});

// 9 — Investigation Record generation writes under a valid path
t("9 investigation record writes to a valid confined path", () => {
  const e = initEngagement({ root: TMP, name: "records" });
  ensureBucket(e, "findings");
  const rec = resolveWorkspacePath(e, "2-Findings/INV-001-record.md");
  fs.writeFileSync(rec, "# Investigation Record\nclassification: inconclusivo\n");
  assert.ok(fs.existsSync(rec) && rec.startsWith(e.dir));
});

// 10 — Report compatibility (1-Reports path preserved)
t("10 report path compatible with existing 1-Reports layout", () => {
  const e = initEngagement({ root: TMP, name: "reports-eng" });
  const p = resolveWorkspacePath(e, "1-Reports/001-title/report.md");
  assert.ok(p.includes(path.join("1-Reports", "001-title")));
});

// 12 — No automatic Whitebox read (REAL code gate, not prompt) + audit + elevation + revoke
t("12 whitebox default-deny; authorize→allow (audited); revoke→deny + clean-context signal", () => {
  const e = initEngagement({ root: TMP, name: "wb", modality: "blackbox" });
  // default: even if path exists, access denied (blackbox)
  assert.throws(() => resolveWorkspacePath(e, "Whitebox/src/app.js"),
                (x) => x instanceof WhiteboxAccessError);
  // composeContextPaths never includes Whitebox
  assert.ok(composeContextPaths(e).excluded.includes(WHITEBOX_DIR));
  // whitebox modality alone is NOT enough (needs explicit authorization)
  const ew = initEngagement({ root: TMP, name: "wb2", modality: "whitebox" });
  assert.throws(() => resolveWorkspacePath(ew, "Whitebox/src/app.js"),
                (x) => x instanceof WhiteboxAccessError);
  assert.equal(sourcesForModality(ew).whitebox, false);
  // authorize requires explicit operator
  assert.throws(() => authorizeWhitebox(ew, {}), (x) => x.code === "operator-required");
  const auth = authorizeWhitebox(ew, { operator: "op@lab", reason: "white box engagement" });
  assert.equal(auth.whitebox.authorized, true);
  const p = resolveWorkspacePath(auth, "Whitebox/src/app.js"); // now allowed
  assert.ok(p.includes(WHITEBOX_DIR));
  assert.equal(sourcesForModality(auth).whitebox, true);
  // audit log recorded the elevation + a denial
  const log = fs.readFileSync(path.join(ew.dir, ".whitebox-access.log"), "utf8");
  assert.ok(log.includes("whitebox-authorize"));
  assert.ok(log.includes("\"allow\":false"));
  // revoke → deny again + requiresCleanContext signal
  const rev = revokeWhitebox(auth, { operator: "op@lab" });
  assert.equal(rev.requiresCleanContext, true);
  assert.throws(() => resolveWorkspacePath(rev, "Whitebox/src/app.js"),
                (x) => x instanceof WhiteboxAccessError);
});

// 12b — guard decision function is pure and correct (the shared mechanism)
t("12b decideWhiteboxAccess pure decisions", () => {
  const engDir = path.join(TMP, "guard");
  assert.equal(decideWhiteboxAccess({ targetPath: "3-Recon/x", engDir, manifest: { modality: "blackbox" } }).allow, true);
  assert.equal(decideWhiteboxAccess({ targetPath: "Whitebox/x", engDir, manifest: { modality: "blackbox" } }).allow, false);
  assert.equal(decideWhiteboxAccess({ targetPath: "Whitebox/x", engDir, manifest: { modality: "whitebox", whitebox: { authorized: true } } }).allow, true);
  assert.equal(decideWhiteboxAccess({ targetPath: "../x", engDir, manifest: {} }).reason, "path-escapes-engagement-root");
});

// 13 — Modalities enumerated; bad modality rejected
t("13 modality enum enforced", () => {
  assert.deepEqual(MODALITIES, ["blackbox", "graybox", "whitebox"]);
  assert.equal(DEFAULT_MODALITY, "blackbox");
  assert.throws(() => initEngagement({ root: TMP, name: "m", modality: "pinkbox" }),
                (x) => x.code === "bad-modality");
});

// Cleanup
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}

console.log(`\n${n - fail}/${n} passed` + (fail ? ` (${fail} FAILED)` : ""));
process.exit(fail ? 1 : 0);
