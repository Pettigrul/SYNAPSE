// Deterministic tests for the native .env loader (config convenience).
// Covers: parsing, loading, absence, PRECEDENCE (env wins), SANITIZATION (never emits values),
// cross-platform (CRLF), root-independence, and the .env.example / .gitignore artifacts.

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseEnvContent, applyEnv, loadProjectEnv, projectRoot, ENV_FILE } from "./env-loader.mjs";

let n = 0, fail = 0;
const okT = (s) => { n++; console.log(`  ok  ${s}`); };
const badT = (s, e) => { n++; fail++; console.log(`FAIL  ${s}: ${e && e.stack || e}`); };
function t(s, fn) { try { fn(); okT(s); } catch (e) { badT(s, e); } }

const SECRET = "supersecret-token-value-DO-NOT-LEAK";

// temp dir in the scratchpad/OS temp; cleaned at the end.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sa-envtest-"));
function writeEnv(name, content) { const p = path.join(tmp, name); fs.writeFileSync(p, content); return p; }

// 1 — parse basic KEY=VALUE, ignore comments/blank lines
t("1 parse basic + comments", () => {
  const o = parseEnvContent("# c\nA=1\n\nB=two\n");
  assert.equal(o.A, "1"); assert.equal(o.B, "two");
});

// 2 — apply to empty target → all applied
t("2 apply to empty target", () => {
  const target = {}; const r = applyEnv({ A: "1", B: "2" }, target);
  assert.deepEqual(r.applied.sort(), ["A", "B"]); assert.equal(r.skipped.length, 0);
  assert.equal(target.A, "1"); assert.equal(target.B, "2");
});

// 3 — PRECEDENCE: existing env var is NOT overridden (env wins)
t("3 precedence: env wins", () => {
  const target = { A: "from-env" }; const r = applyEnv({ A: "from-file", B: "2" }, target);
  assert.deepEqual(r.skipped, ["A"]); assert.deepEqual(r.applied, ["B"]);
  assert.equal(target.A, "from-env"); // preserved
});

// 4 — override:true forces overwrite (explicit opt-in only)
t("4 override:true overwrites", () => {
  const target = { A: "from-env" }; const r = applyEnv({ A: "from-file" }, target, { override: true });
  assert.deepEqual(r.applied, ["A"]); assert.equal(target.A, "from-file");
});

// 5 — empty/undefined existing value is treated as not-present → applied
t("5 empty existing value → applied", () => {
  const target = { A: "", B: undefined }; const r = applyEnv({ A: "1", B: "2" }, target);
  assert.deepEqual(r.applied.sort(), ["A", "B"]);
});

// 6 — ABSENT file → loaded:false, no throw, no keys
t("6 absent file → loaded:false", () => {
  const r = loadProjectEnv({ root: tmp, file: "nope.env", target: {} });
  assert.equal(r.loaded, false); assert.equal(r.keys.length, 0); assert.equal(r.applied.length, 0);
});

// 7 — load from a written file into a fresh target
t("7 load from file", () => {
  writeEnv(".env", `CAIDO_PROJECT_ID=proj-123\nCAIDO_TOKEN=${SECRET}\n`);
  const target = {}; const r = loadProjectEnv({ root: tmp, target, allow: ["CAIDO_PROJECT_ID", "CAIDO_TOKEN"] });
  assert.equal(r.loaded, true);
  assert.deepEqual(r.applied.sort(), ["CAIDO_PROJECT_ID", "CAIDO_TOKEN"]);
  assert.equal(target.CAIDO_TOKEN, SECRET); assert.equal(target.CAIDO_PROJECT_ID, "proj-123");
});

// 8 — load precedence with a preset target key (env wins over file)
t("8 load precedence", () => {
  writeEnv(".env", `CAIDO_PROJECT_ID=from-file\n`);
  const target = { CAIDO_PROJECT_ID: "from-env" };
  const r = loadProjectEnv({ root: tmp, target });
  assert.deepEqual(r.skipped, ["CAIDO_PROJECT_ID"]); assert.equal(target.CAIDO_PROJECT_ID, "from-env");
});

// 9 — SANITIZATION: summary never contains a VALUE (only names)
t("9 sanitization: no values in summary", () => {
  writeEnv(".env", `CAIDO_TOKEN=${SECRET}\n`);
  const r = loadProjectEnv({ root: tmp, target: {}, allow: ["CAIDO_TOKEN"] });
  const s = JSON.stringify(r);
  assert.ok(!s.includes(SECRET), "summary leaked a value!");
  assert.ok(r.keys.includes("CAIDO_TOKEN") && r.applied.includes("CAIDO_TOKEN")); // names ok
});

// 10 — root-independence: projectRoot points to the real repo (module-relative, not cwd)
t("10 root-independence", () => {
  const root = projectRoot();
  assert.ok(fs.existsSync(path.join(root, "SKILL.md")), "projectRoot must resolve to the repo root");
  assert.equal(ENV_FILE, ".env");
});

// 11 — parseEnvContent on non-string / empty → {}
t("11 parse non-string/empty", () => {
  assert.deepEqual(parseEnvContent(null), {});
  assert.deepEqual(parseEnvContent(""), {});
  assert.deepEqual(parseEnvContent(123), {});
});

// 12 — cross-platform: CRLF (Windows) line endings parse correctly
t("12 CRLF line endings", () => {
  const o = parseEnvContent("A=1\r\nB=2\r\n");
  assert.equal(o.A, "1"); assert.equal(o.B, "2");
});

// 13 — functions emit nothing to console (no value printing). Structural: no console.* in module.
t("13 loader does not print", () => {
  const src = fs.readFileSync(path.join(projectRoot(), "tools/preflight/env-loader.mjs"), "utf8");
  assert.ok(!/console\./.test(src), "env-loader must not print anything");
});

// 14 — .env.example exists and declares the four required variables
t("14 .env.example has required vars", () => {
  const ex = fs.readFileSync(path.join(projectRoot(), ".env.example"), "utf8");
  for (const k of ["CAIDO_BASE_URL", "CAIDO_TOKEN", "CAIDO_PROJECT_ID", "SA_ENGAGEMENT_ROOT"]) assert.ok(ex.includes(k), `missing ${k}`);
});

// 15 — .gitignore protects .env variants but keeps .env.example tracked
t("15 .gitignore protects secrets", () => {
  const gi = fs.readFileSync(path.join(projectRoot(), ".gitignore"), "utf8");
  assert.ok(/^\.env$/m.test(gi), ".env must be ignored");
  assert.ok(/^!\.env\.example$/m.test(gi), ".env.example must stay tracked");
});

// cleanup
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }

console.log(`\n${n - fail}/${n} passed` + (fail ? ` (${fail} FAILED)` : ""));
process.exit(fail ? 1 : 0);
