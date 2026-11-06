#!/usr/bin/env node
// SecurityAuditor — least privilege for the central .env (deterministic, offline, no LLM, no offensive ops).
// CAIDO_TOKEN and project-bound selectors stay withheld unless the context allows them, and nothing in a project authorizes
// the token: the decision lives beside the fixture .env. This protects against project content, not against a same-user shell. Runs against a disposable copy
// of tools/ with a fixture .env and a generated fake token: never reads the real .env, never prints the token. The only
// network use is a loopback fixture that records whether the Authorization header arrived.

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { loadProjectEnv, envAccess, isRestrictedKey } from "./env-loader.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "sa-cred-"));
const TOKEN = `fake-${randomBytes(12).toString("hex")}`;
let n = 0; const fresh = (l) => { const d = path.join(TMP, `${l}-${++n}`); fs.mkdirSync(d, { recursive: true }); return d; };

// Disposable harness: its tools resolve <copy>/.env, so the fixture is what they load.
const H = path.join(TMP, "harness"); fs.mkdirSync(H);
fs.copyFileSync(path.join(REPO, "SKILL.md"), path.join(H, "SKILL.md"));
fs.cpSync(path.join(REPO, "tools"), path.join(H, "tools"), { recursive: true, filter: (s) => !s.includes(`${path.sep}node_modules`) });
const ROOT = fresh("root");

let hits = [], fixtureData = {};
const server = http.createServer((req, res) => { hits.push(req.headers.authorization || null); req.resume(); res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ data: fixtureData })); });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;
fs.writeFileSync(path.join(H, ".env"), `CAIDO_BASE_URL=${BASE}\nCAIDO_TOKEN=${TOKEN}\nSA_ENGAGEMENT_ROOT=${ROOT}\nSA_ENGAGEMENT=from-central-env\nSA_SESSION_ID=from-central-env\nCAIDO_PROJECT_ID=from-central-env\nOTHER_API_KEY=${TOKEN}\nGITHUB_PAT=${TOKEN}\nSOME_NEW_KEY=${TOKEN}\n`);

const run = (rel, args, cwd, env = {}) => new Promise((resolve) => {
  execFile(process.execPath, [path.join(H, rel), ...args], { cwd, encoding: "utf8", env: { PATH: process.env.PATH, HOME: TMP, ...env } }, (e, stdout, stderr) => resolve({ code: e ? e.code : 0, out: stdout || "", err: stderr || "", all: `${stdout}${stderr}` }));
});
const runAt = (h, rel, args, cwd, env = {}) => new Promise((resolve) => {
  execFile(process.execPath, [path.join(h, rel), ...args], { cwd, encoding: "utf8", env: { PATH: process.env.PATH, HOME: TMP, ...env } }, (e, stdout, stderr) => resolve({ code: e ? e.code : 0, out: stdout || "", err: stderr || "", all: `${stdout}${stderr}` }));
});
const OPT_INS = ".env.caido-opt-ins.json", MARKER_NAME = ".hackbot-activation.json";
// What the review reproduced: a repository that knows the harness path prepares everything a marker can say.
const forged = (extra = {}) => {
  const p = fresh("forged"), links = ["tools", "references", "SKILL.md"].filter((l) => fs.existsSync(path.join(H, l)));
  for (const l of links) fs.symlinkSync(path.join(H, l), path.join(p, l));
  fs.writeFileSync(path.join(p, MARKER_NAME), JSON.stringify({ hackbotHome: H, links, caido: true, ...extra }));
  return p;
};
// Runs fn with the opt-in file altered, then puts the decisions back.
const withStore = async (alter, fn, undo = () => {}) => {
  const f = path.join(H, OPT_INS); const saved = fs.existsSync(f) ? fs.readFileSync(f) : null;
  if (saved === null) fs.writeFileSync(f, JSON.stringify({ version: 1, projects: {} }));
  alter();
  try { await fn(); } finally { undo(); if (saved === null) fs.rmSync(f, { force: true }); else fs.writeFileSync(f, saved); }
};
const WCLI = "tools/workspace/cli.mjs", ACLI = "tools/activation/cli.mjs", PCLI = "tools/preflight/cli.mjs";
const project = async (...flags) => { const p = fresh("prj"); const r = await run(ACLI, ["activate", "--project", p, "--runtime", "pi", ...flags], TMP); assert.equal(r.code, 0, r.err); return p; };
// What a CLI's process.env holds after the same load the CLIs do, for a child cwd: names only, never values.
const probe = (cwd, need = "[]", env = {}) => new Promise((resolve) => {
  const code = `const {loadScopedEnv}=await import(${JSON.stringify(path.join(H, "tools/preflight/env-loader.mjs"))});const r=loadScopedEnv({need:${need}});console.log(JSON.stringify({has:Object.fromEntries(["CAIDO_BASE_URL","CAIDO_TOKEN","SA_ENGAGEMENT_ROOT","SA_ENGAGEMENT","SA_SESSION_ID","CAIDO_PROJECT_ID","OTHER_API_KEY"].map(k=>[k,!!process.env[k]])),withheld:r.withheld}))`;
  execFile(process.execPath, ["--input-type=module", "-e", code], { cwd, encoding: "utf8", env: { PATH: process.env.PATH, HOME: TMP, ...env } }, (e, stdout) => resolve(JSON.parse(stdout)));
});

let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log(`  ok  ${name}`); } catch (e) { fail++; console.log(`  FAIL ${name}\n       ${String(e.message).split(TOKEN).join("<token>")}`); } };
const noLeak = (r) => { assert.ok(!r.all.includes(TOKEN), "token value printed"); };

console.log("Credential scope\n");

await t("classification: secrets and project-bound selectors are restricted; plain config is not", () => {
  for (const k of ["CAIDO_TOKEN", "OTHER_API_KEY", "MY_SECRET", "DB_PASSWORD", "SA_ENGAGEMENT", "SA_SESSION_ID", "CAIDO_PROJECT_ID", "GITHUB_PAT", "SSH_KEY", "DATABASE_URL", "HTTP_PROXY", "SOME_UNKNOWN_NAME", "SECAUDIT_BRIDGE_CONTEXTS"]) assert.ok(isRestrictedKey(k), k);
  for (const k of ["CAIDO_BASE_URL", "SA_ENGAGEMENT_ROOT", "SA_BROWSER_CHANNEL"]) assert.ok(!isRestrictedKey(k), k);
});
await t("loader: restricted keys withheld by default, allowed by name, environment still wins", () => {
  const target = {}; const r = loadProjectEnv({ root: H, target });
  assert.equal(target.CAIDO_TOKEN, undefined); assert.ok(r.withheld.includes("CAIDO_TOKEN")); assert.equal(target.SA_ENGAGEMENT_ROOT, ROOT);
  const t2 = {}; const r2 = loadProjectEnv({ root: H, target: t2, allow: ["CAIDO_TOKEN"] });
  assert.equal(t2.CAIDO_TOKEN, TOKEN); assert.ok(!r2.withheld.includes("CAIDO_TOKEN")); assert.ok(r2.withheld.includes("OTHER_API_KEY"));
  const t3 = { CAIDO_TOKEN: "from-env" }; const r3 = loadProjectEnv({ root: H, target: t3 });
  assert.equal(t3.CAIDO_TOKEN, "from-env"); assert.ok(r3.skipped.includes("CAIDO_TOKEN")); assert.ok(!r3.withheld.includes("CAIDO_TOKEN"));
  const t4 = { CAIDO_TOKEN: "from-env" }; loadProjectEnv({ root: H, target: t4, override: true });
  assert.equal(t4.CAIDO_TOKEN, "from-env", "override must not bypass the restriction");
});
await t("non-opted project: ordinary commands never hold the token, and selectors don't come from central .env", async () => {
  const p = await project();
  const r = await probe(p);
  assert.equal(r.has.CAIDO_TOKEN, false); assert.equal(r.has.SA_ENGAGEMENT, false); assert.equal(r.has.SA_SESSION_ID, false); assert.equal(r.has.CAIDO_PROJECT_ID, false); assert.equal(r.has.OTHER_API_KEY, false);
  assert.equal(r.has.SA_ENGAGEMENT_ROOT, true); assert.equal(r.has.CAIDO_BASE_URL, true);
  const a = await probe(p, '["caido"]'); assert.equal(a.has.CAIDO_TOKEN, false, "even when the command asks");
});
await t("opted-in project: only the command that needs it gets the token", async () => {
  const p = await project("--caido");
  assert.equal((await probe(p)).has.CAIDO_TOKEN, false, "ordinary commands stay without it");
  const a = await probe(p, '["caido"]'); assert.equal(a.has.CAIDO_TOKEN, true); assert.equal(a.has.OTHER_API_KEY, false);
});
await t("outside any project: never, even when asked", async () => {
  assert.equal((await probe(fresh("plain"), '["caido"]')).has.CAIDO_TOKEN, false);
});
await t("central harness: the selector in its own .env selects there, and bootstrap follows it; the same .env selects nothing in a project", async () => {
  const root = fresh("root-central"), env = { SA_ENGAGEMENT_ROOT: root }, W = "tools/workspace/cli.mjs";
  assert.equal((await run(W, ["init", "--name", "from-central-env"], TMP, env)).code, 0);
  const a = await run(W, ["active"], H, env); assert.match(a.out, /active: from-central-env/); assert.match(a.err, /central \.env|SA_ENGAGEMENT/);
  assert.equal((await run(W, ["bootstrap", "--runtime", "agents"], H, env)).code, 0);
  assert.ok(fs.existsSync(path.join(root, "from-central-env", "toDoList.md")));
  const p = fresh("prj-central"); assert.equal((await run("tools/activation/cli.mjs", ["activate", "--project", p], TMP)).code, 0);
  assert.match((await run(W, ["active"], p, env)).out, /no active engagement/);
});
await t("central harness: selectors from its own .env keep working, token only on demand", async () => {
  const r = await probe(H); assert.equal(r.has.CAIDO_TOKEN, false); assert.equal(r.has.SA_ENGAGEMENT, true); assert.equal(r.has.CAIDO_PROJECT_ID, true);
  assert.equal((await probe(H, '["caido"]')).has.CAIDO_TOKEN, true);
});
await t("SA_SKIP_ENV_FILE: nothing loads, whatever the context", async () => {
  const r = await probe(H, '["caido"]', { SA_SKIP_ENV_FILE: "1" });
  for (const k of Object.keys(r.has)) assert.equal(r.has[k], false, k);
});
// The real CLIs, not the loader: a preload reports what their process.env held at exit (names only).
const preload = path.join(TMP, "report-env.mjs");
fs.writeFileSync(preload, `import fs from "node:fs";\nprocess.on("exit", () => fs.writeFileSync(process.env.REPORT_TO, JSON.stringify({ token: !!process.env.CAIDO_TOKEN, pat: !!process.env.GITHUB_PAT })));\n`);
const held = async (rel, args, cwd, env = {}) => {
  const REPORT_TO = path.join(TMP, `held-${++n}.json`);
  await run(rel, args, cwd, { NODE_OPTIONS: `--import ${preload}`, REPORT_TO, ...env });
  return JSON.parse(fs.readFileSync(REPORT_TO, "utf8"));
};
const ORDINARY = [[WCLI, ["list"]], [WCLI, ["active"]], ["tools/modes/cli.mjs", ["status"]], ["tools/web-runtime/adapters/cli.mjs", ['{"op":"capabilities.list"}']]];
await t("real CLIs: ordinary commands hold no token, in any context, even opted in", async () => {
  for (const cwd of [await project(), await project("--caido"), H, fresh("plain")]) {
    for (const [rel, args] of ORDINARY) {
      const h = await held(rel, args, cwd);
      assert.equal(h.token, false, `${rel} ${args[0]}`); assert.equal(h.pat, false, `${rel} ${args[0]}`);
    }
  }
});
await t("real CLIs: preflight holds the token only where the context allows it", async () => {
  assert.equal((await held(PCLI, ["preflight"], await project())).token, false);
  assert.equal((await held(PCLI, ["preflight"], fresh("plain"))).token, false);
  assert.equal((await held(PCLI, ["preflight"], await project("--caido"))).token, true);
  assert.equal((await held(PCLI, ["preflight"], H)).token, true);
});
await t("preflight at the harness root keeps seeing the Caido instance config", async () => {
  assert.match((await run(PCLI, ["preflight", "--profile", "caido-native"], H)).out, /baseUrl\/token configured/);
});
await t("a harness subdirectory is not the harness: a project's linked dir gets nothing", async () => {
  const p = await project("--caido");
  for (const cwd of [path.join(H, "tools"), path.join(p, "tools")]) {
    const r = await probe(cwd, '["caido"]');
    assert.equal(r.has.CAIDO_TOKEN, false, cwd); assert.equal(r.has.SA_ENGAGEMENT, false, cwd);
  }
  hits = []; const r = await run(WCLI, ["projects"], path.join(p, "tools")); noLeak(r);
  assert.equal(r.code, 2); assert.deepEqual(hits, []);
});
await t("a marker planted in a repository grants no token, alone or under a project", async () => {
  const planted = JSON.stringify({ hackbotHome: "/nonexistent", links: [], caido: true });
  const alone = fresh("clone"); fs.writeFileSync(path.join(alone, ".hackbot-activation.json"), planted);
  assert.equal((await probe(alone, '["caido"]')).has.CAIDO_TOKEN, false, "alone");
  const under = path.join(await project(), "vendor", "evil"); fs.mkdirSync(under, { recursive: true }); fs.writeFileSync(path.join(under, ".hackbot-activation.json"), planted);
  assert.equal((await probe(under, '["caido"]')).has.CAIDO_TOKEN, false, "under a project");
  hits = []; const r = await run(WCLI, ["projects"], alone); noLeak(r); assert.equal(r.code, 2); assert.deepEqual(hits, []);
  const s = await run(ACLI, ["status", "--project", alone], TMP); assert.match(s.out, /healthy: false/);
});
await t("a marker naming this harness grants no token when its links aren't intact", async () => {
  const p = await project("--caido"); fs.unlinkSync(path.join(p, "tools"));
  assert.equal((await probe(p, '["caido"]')).has.CAIDO_TOKEN, false);
});
await t("a project opted in through another harness copy gets no token from this one: each copy has its own decisions", async () => {
  const H2 = path.join(TMP, "harness-2"); fs.cpSync(H, H2, { recursive: true });
  const p = fresh("other-harness");
  const r = await runAt(H2, ACLI, ["activate", "--project", p, "--runtime", "pi", "--caido"], TMP); assert.equal(r.code, 0, r.err);
  assert.ok(fs.existsSync(path.join(H2, OPT_INS)));
  assert.match((await runAt(H2, ACLI, ["status", "--project", p], TMP)).out, /caido opt-in: true/);
  assert.match((await run(ACLI, ["status", "--project", p], TMP)).out, /caido opt-in: false/);
  assert.equal((await probe(p, '["caido"]')).has.CAIDO_TOKEN, false);
});
await t("a marker can't point at a friendlier harness: only this harness's own opt-in file counts", async () => {
  // A forged marker naming another home, whose own opt-in file grants this project: this harness reads only its own file.
  const evil = fresh("evil-home"), p = forged({ hackbotHome: evil }); fs.writeFileSync(path.join(evil, OPT_INS), JSON.stringify({ version: 1, projects: { [fs.realpathSync(p)]: { granted: true } } }));
  assert.equal((await probe(p, '["caido"]')).has.CAIDO_TOKEN, false);
  assert.match((await run(ACLI, ["status", "--project", p], TMP)).out, /caido opt-in: false/);
});
await t("forged marker: absolute harness path, real links and caido:true grant nothing", async () => {
  const p = forged(); hits = [];
  assert.equal((await probe(p, '["caido"]')).has.CAIDO_TOKEN, false);
  const r = await run(WCLI, ["projects"], p); noLeak(r);
  assert.equal(r.code, 2); assert.match(r.err, /no Caido opt-in/); assert.deepEqual(hits, []);
  const s = await run(ACLI, ["status", "--project", p], TMP);
  assert.match(s.out, /healthy: true/); assert.match(s.out, /caido opt-in: false/); assert.match(s.out, /no longer honored/); assert.match(s.out, /If you trust this project/);
});
await t("transition: re-activating over caido:true doesn't launder it, removes the field and says how to re-grant", async () => {
  const p = forged();
  const r = await run(ACLI, ["activate", "--project", p, "--runtime", "pi"], TMP);
  assert.equal(r.code, 0, r.err); assert.match(r.out, /no longer honored/); assert.match(r.out, /re-run with --caido/);
  assert.equal((await probe(p, '["caido"]')).has.CAIDO_TOKEN, false);
  assert.ok(!("caido" in JSON.parse(fs.readFileSync(path.join(p, MARKER_NAME), "utf8"))), "the field is gone");
  assert.equal((await run(ACLI, ["activate", "--project", p, "--caido"], TMP)).code, 0);
  assert.equal((await probe(p, '["caido"]')).has.CAIDO_TOKEN, true, "the operator's grant is what counts");
});
await t("the decision never lands in the project: no caido field, nothing beside the marker", async () => {
  const p = await project("--caido");
  assert.ok(!("caido" in JSON.parse(fs.readFileSync(path.join(p, MARKER_NAME), "utf8"))));
  assert.ok(!fs.existsSync(path.join(p, OPT_INS)));
  const m = JSON.parse(fs.readFileSync(path.join(H, OPT_INS), "utf8"));
  assert.equal(m.projects[fs.realpathSync(p)].granted, true);
  if (process.platform !== "win32") assert.equal(fs.statSync(path.join(H, OPT_INS)).mode & 0o077, 0, "owner only");
  assert.match(fs.readFileSync(path.join(REPO, ".gitignore"), "utf8"), /^\.env\*$/m, "kept out of the repo by the .env* rule"); assert.ok(OPT_INS.startsWith(".env"));
});
await t("absent marker: nothing, even with a recorded opt-in for that path", async () => {
  const p = await project("--caido"); fs.unlinkSync(path.join(p, MARKER_NAME));
  assert.equal((await probe(p, '["caido"]')).has.CAIDO_TOKEN, false);
});
await t("copied project: the marker and links come along, the opt-in doesn't", async () => {
  const p = await project("--caido"), c = path.join(TMP, `copy-${++n}`); fs.cpSync(p, c, { recursive: true, verbatimSymlinks: true });
  const s = await run(ACLI, ["status", "--project", c], TMP); assert.match(s.out, /healthy: true/);
  assert.equal((await probe(c, '["caido"]')).has.CAIDO_TOKEN, false);
  assert.equal((await probe(p, '["caido"]')).has.CAIDO_TOKEN, true, "the original keeps it");
  const r = await run(WCLI, ["projects"], c); assert.match(r.err, /moved, renamed or copied/); assert.match(r.err, /--caido/); noLeak(r);
});
await t("renamed project: loses the opt-in, is told how to re-grant, and the old path can be cleaned up", async () => {
  const p = await project("--caido"), moved = `${p}-renamed`; fs.renameSync(p, moved);
  assert.equal((await probe(moved, '["caido"]')).has.CAIDO_TOKEN, false);
  assert.match((await run(WCLI, ["projects"], moved)).err, /moved, renamed or copied/);
  const old = await run(ACLI, ["deactivate", "--project", p], TMP);
  assert.equal(old.code, 0, old.err); assert.match(old.out, /removed the Caido opt-in/);
  assert.ok(!(p in JSON.parse(fs.readFileSync(path.join(H, OPT_INS), "utf8")).projects));
  assert.equal((await run(ACLI, ["deactivate", "--project", p], TMP)).code, 2, "nothing left to do there");
  assert.equal((await run(ACLI, ["activate", "--project", moved, "--caido"], TMP)).code, 0);
  assert.equal((await probe(moved, '["caido"]')).has.CAIDO_TOKEN, true);
});
await t("a project reached through a symlink is the approved one, by real path; a link named like it elsewhere grants the hostile repo nothing", async () => {
  const p = await project("--caido"), hostile = fresh("hostile"), via = path.join(hostile, path.basename(p)); fs.symlinkSync(p, via);
  assert.equal((await probe(via, '["caido"]', { PWD: via })).has.CAIDO_TOKEN, true, "physically the approved project");
  assert.equal((await probe(hostile, '["caido"]')).has.CAIDO_TOKEN, false, "the repo that planted the link");
  const lookalike = forged(), dir = path.join(path.dirname(lookalike), `${path.basename(p)}-lookalike`); fs.renameSync(lookalike, dir);
  assert.equal((await probe(dir, '["caido"]')).has.CAIDO_TOKEN, false);
});
await t("granting through a symlink records the real path: revoking by the real path works", async () => {
  const p = fresh("real"), via = path.join(fresh("alias"), "proj"); fs.symlinkSync(p, via);
  assert.equal((await run(ACLI, ["activate", "--project", via, "--runtime", "pi", "--caido"], TMP)).code, 0);
  assert.equal((await probe(p, '["caido"]')).has.CAIDO_TOKEN, true);
  assert.equal((await run(ACLI, ["activate", "--project", p, "--no-caido"], TMP)).code, 0);
  assert.equal((await probe(via, '["caido"]', { PWD: via })).has.CAIDO_TOKEN, false);
});
await t("revocation: deactivate drops the opt-in, and a later plain activate doesn't bring it back", async () => {
  const p = await project("--caido");
  const d = await run(ACLI, ["deactivate", "--project", p], TMP); assert.match(d.out, /caido opt-in: revoked/);
  assert.equal((await run(ACLI, ["activate", "--project", p, "--runtime", "pi"], TMP)).code, 0);
  assert.equal((await probe(p, '["caido"]')).has.CAIDO_TOKEN, false);
});
await t("--caido with --no-caido contradict: refused, nothing changes", async () => {
  const p = fresh("both");
  const r = await run(ACLI, ["activate", "--project", p, "--caido", "--no-caido"], TMP);
  assert.equal(r.code, 2); assert.match(r.err, /contradict/); assert.deepEqual(fs.readdirSync(p), []);
});
const STORE_BAD = [["not JSON", "{ nope"], ["a list", "[]"], ["null", "null"], ["wrong version", '{"version":2,"projects":{}}'], ["projects of the wrong type", '{"version":1,"projects":[]}']];
await t("opt-in file corrupt or of the wrong type: fails closed with a safe message, no crash, and the file is left as it was", async () => {
  const p = await project("--caido");
  for (const [label, text] of STORE_BAD) await withStore(() => fs.writeFileSync(path.join(H, OPT_INS), text), async () => {
    assert.equal((await probe(p, '["caido"]')).has.CAIDO_TOKEN, false, label);
    hits = []; const r = await run(WCLI, ["projects"], p); noLeak(r);
    assert.equal(r.code, 2, label); assert.match(r.err, /Caido opt-in file .* so no project gets CAIDO_TOKEN/, label); assert.doesNotMatch(r.err, /at file:|SyntaxError|Unexpected token/, label); assert.deepEqual(hits, [], label);
    const s = await run(ACLI, ["status", "--project", p], TMP); assert.match(s.out, /caido opt-in: false/, label); assert.match(s.out, /Fix it, or move it away/, label);
    assert.equal(fs.readFileSync(path.join(H, OPT_INS), "utf8"), text, label);
  });
});
await t("opt-in file: an entry that isn't a grant grants nothing", async () => {
  const p = await project(), key = fs.realpathSync(p);
  for (const entry of [true, "yes", 1, null, [], {}, { granted: "true" }, { granted: 1 }]) await withStore(() => fs.writeFileSync(path.join(H, OPT_INS), JSON.stringify({ version: 1, projects: { [key]: entry } })), async () => {
    assert.equal((await probe(p, '["caido"]')).has.CAIDO_TOKEN, false, JSON.stringify(entry));
  });
});
await t("opt-in file unreadable (permission, or a directory in its place): fails closed, and the harness root is unaffected", async () => {
  const p = await project("--caido"), f = path.join(H, OPT_INS);
  const check = async (label) => {
    assert.equal((await probe(p, '["caido"]')).has.CAIDO_TOKEN, false, label);
    const r = await run(WCLI, ["projects"], p); noLeak(r); assert.equal(r.code, 2, label); assert.match(r.err, /can't be read \(E[A-Z]+\)/, label);
    assert.equal((await probe(H, '["caido"]')).has.CAIDO_TOKEN, true, "harness root keeps working");
  };
  await withStore(() => { fs.unlinkSync(f); fs.mkdirSync(f); }, () => check("directory"), () => fs.rmdirSync(f));
  if (process.platform !== "win32" && process.getuid() !== 0) await withStore(() => fs.chmodSync(f, 0o000), () => check("mode 000"), () => fs.chmodSync(f, 0o600));
});
await t("opt-in file unusable: grant and revocation refuse before touching anything; plain activate, status and deactivate still work", async () => {
  const f = path.join(H, OPT_INS), kept = await project();
  await withStore(() => fs.writeFileSync(f, "{ nope"), async () => {
    const p = fresh("refused");
    const g = await run(ACLI, ["activate", "--project", p, "--runtime", "pi", "--caido"], TMP);
    assert.equal(g.code, 2); assert.match(g.err, /caido-config-invalid/); assert.deepEqual(fs.readdirSync(p), [], "nothing created");
    assert.equal((await run(ACLI, ["activate", "--project", kept, "--no-caido"], TMP)).code, 2, "a revocation that can't be recorded must not look done");
    const plain = await run(ACLI, ["activate", "--project", kept], TMP);
    assert.equal(plain.code, 0, plain.err); assert.match(plain.out, /Fix it, or move it away/);
    const d = await run(ACLI, ["deactivate", "--project", kept], TMP);
    assert.equal(d.code, 0, d.err); assert.match(d.out, /opt-in may remain/); assert.ok(!fs.existsSync(path.join(kept, MARKER_NAME)));
    assert.equal(fs.readFileSync(f, "utf8"), "{ nope", "the operator's file is not overwritten");
  });
});
await t("plain activate and an unneeded revocation don't create the opt-in file", async () => {
  await withStore(() => fs.rmSync(path.join(H, OPT_INS), { force: true }), async () => {
    const p = await project();
    assert.equal((await run(ACLI, ["activate", "--project", p, "--no-caido"], TMP)).code, 0);
    assert.equal((await run(ACLI, ["deactivate", "--project", p], TMP)).code, 0);
    assert.ok(!fs.existsSync(path.join(H, OPT_INS)));
  });
});
await t("an invalid marker's denial points at the repair, not at --caido", async () => {
  const d = fresh("bad"); fs.writeFileSync(path.join(d, MARKER_NAME), JSON.stringify({ hackbotHome: H, links: ["../x"], caido: true }));
  const a = envAccess({ need: ["caido"], cwd: d, env: {} });
  assert.deepEqual(a.allow, []); assert.match(a.caidoDenied, /--repair/);
});
await t("a relative hackbotHome grants no token, even if it resolves to this harness", async () => {
  const p = await project("--caido"), f = path.join(p, ".hackbot-activation.json");
  const m = JSON.parse(fs.readFileSync(f, "utf8")); m.hackbotHome = path.relative(p, H); fs.writeFileSync(f, JSON.stringify(m));
  assert.equal((await probe(p, '["caido"]')).has.CAIDO_TOKEN, false, "from the project");
  assert.equal((await probe(H, '["caido"]')).has.CAIDO_TOKEN, true, "the harness itself is unaffected");
});
await t("the adapter's http path holds no token, and a central contexts file withheld in a project fails closed", async () => {
  const adapter = "tools/web-runtime/adapters/cli.mjs", req = '{"op":"http.inspect","params":{"url":"http://127.0.0.1:1/"},"scope":{"allowHosts":["127.0.0.1"],"allowPrivate":true}}';
  const envFile = path.join(H, ".env"), saved = fs.readFileSync(envFile);
  const p = await project("--caido");
  assert.equal((await held(adapter, ['{"op":"http.inspect"}'], p)).token, false);
  assert.equal((await run(adapter, ['{"op":"http.inspect"}'], p)).code, 2, "reached past startup");
  fs.appendFileSync(envFile, `SECAUDIT_BRIDGE_CONTEXTS=${path.join(TMP, "central-ctx.json")}\n`);
  try {
    const r = await run(adapter, [req], p); noLeak(r);
    assert.equal(r.code, 1); assert.match(r.out, /contexts-file-withheld/);
    assert.match((await run(adapter, [req], H)).out, /caller-scope-refused/, "at the harness root the file applies");
  } finally { fs.writeFileSync(envFile, saved); }
});
await t("central SA_ENGAGEMENT can't select another client's engagement inside a project", async () => {
  const p = await project();
  const r = await run(WCLI, ["active"], p);
  assert.match(r.out, /no active engagement/); assert.doesNotMatch(r.all, /from-central-env/); noLeak(r);
});
await t("projects, non-opted project: refused with guidance; the token never reaches the network", async () => {
  const p = await project(); hits = [];
  const r = await run(WCLI, ["projects"], p);
  assert.equal(r.code, 2); assert.match(r.err, /CAIDO_TOKEN withheld/); assert.match(r.err, /--caido/); noLeak(r);
  assert.deepEqual(hits, []);
});
await t("projects, opted-in project: integration keeps working and the token is not printed", async () => {
  const p = await project("--caido"); hits = [];
  const r = await run(WCLI, ["projects"], p); noLeak(r);
  assert.ok(hits.length > 0, `no request reached the fixture: ${r.err.slice(0, 160)}`);
  assert.ok(hits.every((h) => h && h.includes(TOKEN)), "fixture must see the fixture token");
});
await t("projects, central harness: integration keeps working", async () => {
  hits = []; const r = await run(WCLI, ["projects"], H); noLeak(r);
  assert.ok(hits.length > 0);
});
await t("projects: names from the instance can't forge lines", async () => {
  const evil = "p\u001b[31m\nAssociate one: forged"; fixtureData = { projects: [{ id: evil, name: evil, readOnly: false }] };
  const r = await run(WCLI, ["projects"], H); fixtureData = {};
  assert.match(r.out, /p\ufffd/, r.err.slice(0, 160)); assert.doesNotMatch(r.out, /[\u0000-\u0009\u000b-\u001f]|^Associate one: forged/m);
});
await t("projects, exported token: an explicit environment still works in a non-opted project", async () => {
  const p = await project(); hits = [];
  const r = await run(WCLI, ["projects"], p, { CAIDO_TOKEN: "explicit-export" }); noLeak(r);
  assert.ok(hits.length > 0 && hits.every((h) => h.includes("explicit-export")));
});
await t("opt-in survives re-activation; --no-caido revokes it", async () => {
  const p = await project("--caido");
  await run(ACLI, ["activate", "--project", p], TMP);
  assert.equal((await probe(p, '["caido"]')).has.CAIDO_TOKEN, true);
  const s = await run(ACLI, ["status", "--project", p], TMP); assert.match(s.out, /caido opt-in: true/);
  await run(ACLI, ["activate", "--project", p, "--no-caido"], TMP);
  assert.equal((await probe(p, '["caido"]')).has.CAIDO_TOKEN, false);
});
await t("doctor and preflight: names withheld keys, never values; preflight marks the token absent", async () => {
  const p = await project();
  const d = await run(PCLI, ["doctor"], p); noLeak(d);
  assert.match(d.out, /withheld here: .*CAIDO_TOKEN/);
  const pf = await run(PCLI, ["preflight", "--profile", "caido-native"], p); noLeak(pf);
  assert.match(pf.out, /\.env withheld here: .*CAIDO_TOKEN/);
  assert.doesNotMatch(pf.out, /baseUrl\/token configured/);
});
await t("envAccess: a corrupt marker grants nothing", async () => {
  const d = fresh("bad"); fs.writeFileSync(path.join(d, ".hackbot-activation.json"), "{ nope");
  const a = envAccess({ need: ["caido"], cwd: d, env: {} });
  assert.deepEqual(a.allow, []); assert.ok(a.caidoDenied);
});

server.close();
console.log(`\ncredential scope: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
