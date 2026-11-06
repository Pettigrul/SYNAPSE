#!/usr/bin/env node
// SecurityAuditor — Operational Skills contract + end-to-end CLI tests (pre-pilot UX).
// Validates: skill discovery/frontmatter/thin-interface contract (no business-logic/enforcement duplication),
// and the underlying CLI flow the skills drive, run as child PROCESSES against an EXTERNAL engagement root
// (outside this repo) with hermetic env (SA_SKIP_ENV_FILE=1, so the operator's local .env never leaks in).
// Deterministic, offline, no LLM, no offensive ops. (Caido `projects`/Bridge cross-access are covered by
// test-multi-engagement.mjs and test-caido-active.mjs — invoked by the sweep, not re-run here.)

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const CLI = path.join(REPO, "tools", "workspace", "cli.mjs");
const PRECLI = path.join(REPO, "tools", "preflight", "cli.mjs");
const SKILLS_DIR = path.join(REPO, ".claude", "skills");
const KB_DIR = path.join(REPO, "skills");

const MGMT = ["listar-engagements", "criar-engagement", "usar-engagement", "engagement-atual", "associar-caido", "verificar-ambiente"]; // 6 management skills (preserved)
const ENTRY = ["investigar", "iniciar-pentest"];        // P1 consolidated execution entry points
const ACT = ["ativar-projeto", "desativar-projeto"];    // P2 project-scoped activation
const MODE = ["modo"];                                  // P3 operational mode (copilot / supervised autopilot)
const ALIAS = ["iniciar-investigacao", "mode"];         // non-divergent aliases: iniciar-investigacao→/investigar (deprecated), mode→/modo (EN)
const ALIAS_TARGET = { "iniciar-investigacao": "/investigar", "mode": "/modo" };
const EXPECTED = [...MGMT, ...ENTRY, ...ACT, ...MODE, ...ALIAS];
const REFERENCES = path.join(REPO, "references");

let n = 0, fail = 0;
function t(name, fn) { n++; try { fn(); console.log(`  ok   ${name}`); } catch (e) { fail++; console.log(`  FAIL ${name}: ${e.message}`); } }

// Run a CLI as a child process with a hermetic env (no inherited .env).
function run(bin, args, env = {}) {
  const r = spawnSync(process.execPath, [bin, ...args], {
    cwd: REPO, encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: process.env.HOME, SA_SKIP_ENV_FILE: "1", ...env },
  });
  return { code: r.status, out: r.stdout || "", err: r.stderr || "" };
}

// --- parse a SKILL.md frontmatter (name + description) ---
function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const body = md.slice(m[0].length);
  const name = (m[1].match(/^name:\s*(.+)$/m) || [])[1]?.trim();
  const hasDesc = /^description:\s*/m.test(m[1]);
  const desc = m[1].replace(/^[\s\S]*?^description:\s*>?\s*/m, "").trim();
  return { name, hasDesc, desc, body };
}

// ========== Part A: skill contract (discovery / frontmatter / thin interface) ==========

const kbCategories = fs.existsSync(KB_DIR) ? fs.readdirSync(KB_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
const seen = new Set();

for (const name of EXPECTED) {
  const file = path.join(SKILLS_DIR, name, "SKILL.md");
  t(`skill present: ${name}`, () => assert.ok(fs.existsSync(file), `missing ${file}`));

  if (!fs.existsSync(file)) continue;
  const md = fs.readFileSync(file, "utf8");
  const fm = frontmatter(md);

  t(`frontmatter valid: ${name}`, () => {
    assert.ok(fm, "no YAML frontmatter");
    assert.equal(fm.name, name, `name '${fm.name}' must match dir '${name}'`);
    assert.ok(fm.hasDesc && fm.desc.length > 20, "description missing/too short (trigger quality)");
    assert.ok(!seen.has(fm.name), `duplicate skill name '${fm.name}'`); seen.add(fm.name);
    assert.ok(!kbCategories.includes(fm.name), `collides with KB category '${fm.name}'`);
    assert.notEqual(fm.name, "security-auditor", "collides with main dispatcher skill");
  });

  t(`thin interface: ${name}`, () => {
    const b = fm.body;
    if (ALIAS.includes(name)) {
      const target = ALIAS_TARGET[name];
      assert.ok(b.includes(target), `alias must point to ${target}`);
      return;                                   // a pure alias need not invoke a CLI
    }
    const usesCli = /tools\/(workspace|preflight|activation|modes)\/cli\.mjs/.test(b);
    assert.ok(usesCli, "body must invoke an existing Node CLI (no re-implemented logic)");
  });
}

const readSkill = (name) => fs.readFileSync(path.join(SKILLS_DIR, name, "SKILL.md"), "utf8");

// /investigar = pointed technical investigation → Investigation Record; reuses the supervised flow; no full pentest; gated.
t("investigar: pontual, Investigation Record, gated (not a full pentest)", () => {
  const md = readSkill("investigar"); const plain = md.replace(/[*`]/g, "");
  assert.ok(/Investigation Record/i.test(md), "must produce an Investigation Record");
  assert.ok(/flows-caido-investigation\.md/.test(md), "must reuse the canonical supervised flow");
  assert.ok(/flows-agents\.md/.test(md), "must reference the Investigation Record contract (flows-agents)");
  assert.ok(/\/iniciar-pentest/.test(md), "must delegate the FULL pentest to /iniciar-pentest");
  assert.ok(/\bn[ãa]o\s+(inicie|execute)/i.test(plain), "must not start a full pentest / active ops spontaneously");
  assert.ok(/aprova|approval|Approval Gate/i.test(md), "must defer to the Approval Gate");
});

// /iniciar-pentest = start/resume FULL pentest by routing to the dispatcher + existing flows; no new orchestrator; no autonomy.
t("iniciar-pentest: routes to dispatcher+flows, no new orchestrator, not autonomous", () => {
  const md = readSkill("iniciar-pentest"); const plain = md.replace(/[*`]/g, "");
  assert.ok(/security-auditor|SKILL\.md|dispatcher principal/i.test(md), "must route to the main dispatcher");
  assert.ok(/\bn[ãa]o\s+(h[áa]|cria)[^.]*orquestrador/i.test(plain), "must state it does NOT create a new orchestrator");
  assert.ok(/\bn[ãa]o\s+presuma[^.]*aut[ôóo]noma/i.test(plain), "must not presume continuous autonomous execution");
  assert.ok(/por a[çc][ãa]o|Class A|Approval Gate|aprova/i.test(md), "active ops stay under per-action authorization");
});

// Dispatcher/flows compatibility: every referenced flow file must actually exist.
t("referenced flows exist (dispatcher/flows compatibility)", () => {
  const refs = new Set();
  for (const name of [...ENTRY]) for (const m of readSkill(name).matchAll(/flows-[a-z-]+\.md/g)) refs.add(m[0]);
  assert.ok(refs.size >= 2, "entry skills should cite canonical flows");
  for (const f of refs) assert.ok(fs.existsSync(path.join(REFERENCES, f)), `referenced flow missing: ${f}`);
});

// Semantic consolidation: the alias is NON-divergent, and exactly ONE skill owns the full-pentest responsibility.
t("no two divergent skills (alias is non-divergent; single pentest owner)", () => {
  const alias = readSkill("iniciar-investigacao");
  assert.ok(/alias/i.test(alias) && /\/investigar/.test(alias), "iniciar-investigacao must be an explicit alias of /investigar");
  assert.ok(/deprecad|tempor[áa]ri/i.test(alias), "alias must be marked deprecated/temporary");
  assert.ok(!/tools\/(workspace|preflight)\/cli\.mjs/.test(alias), "alias must not re-implement behavior");
  // Only /iniciar-pentest claims the full-pentest entry; /investigar explicitly defers it.
  assert.ok(/pentest completo|full pentest|in[íi]cio.*retomada/i.test(readSkill("iniciar-pentest")), "iniciar-pentest owns the full pentest");
  assert.ok(/N[ÃA]O inicia(r)? (um )?pentest|n[ãa]o inicie.*pentest/i.test(readSkill("investigar")), "/investigar must NOT own the full pentest");
});

// R5: /mode is a non-divergent English alias of /modo (points to it, thin, no re-implemented logic).
t("mode: non-divergent EN alias of /modo", () => {
  const md = readSkill("mode");
  assert.ok(/\/modo/.test(md), "mode must forward to /modo");
  assert.ok(/alias/i.test(md), "must declare itself an alias");
  assert.ok(!/tools\/(workspace|preflight|modes|activation)\/cli\.mjs/.test(md), "alias must not re-implement behavior");
});

// P3: /modo is honest (copilot default, autopilot grants nothing, NOT RUN) and is APPLIED at the entry points.
t("modo: both modes, grants nothing, honest NOT RUN; entry skills honor the mode", () => {
  const modo = readSkill("modo");
  assert.ok(/copilot/i.test(modo) && /autopilot/i.test(modo), "must define both modes");
  assert.ok(/padr[ãa]o seguro|safe default/i.test(modo), "copilot must be the safe default");
  assert.ok(/N[ÃA]O concede|grants? (no|nothing)/i.test(modo), "must state no capabilities are granted");
  assert.ok(/NOT RUN/.test(modo), "must honestly flag Autopilot as not validated end-to-end");
  for (const entry of ENTRY) {   // readiness B: mode applied at existing entry points
    const s = readSkill(entry);
    assert.ok(/tools\/modes\/cli\.mjs status/.test(s) && /\/modo|modo/.test(s), `${entry} must consult the mode`);
    assert.ok(/copilot/i.test(s) && /autopilot/i.test(s), `${entry} must branch on the mode`);
  }
});

// No MGMT/ENTRY skill may instruct an unauthorized active operation (no spontaneous active ops).
t("no skill carries spontaneous active-op instructions", () => {
  for (const name of [...MGMT, ...ENTRY, ...ACT, ...MODE]) {
    const plain = readSkill(name).replace(/[*`]/g, "");
    // active-op tokens may appear ONLY inside a negative/gated context, never as an imperative to run them.
    for (const tok of ["caido.replay.run", "findings.create"]) {
      let i = plain.indexOf(tok);
      while (i !== -1) {
        const win = plain.slice(Math.max(0, i - 120), i + tok.length + 120);
        assert.ok(/\bn[ãa]o\b|\bsem\b|\bs[óo]\b|aprova|approval|gate|sob aprova/i.test(win), `${name}: '${tok}' must be gated/negated, not an imperative`);
        i = plain.indexOf(tok, i + tok.length);
      }
    }
    assert.ok(!/browser\.(click|type|navigate)/.test(plain), `${name} must not drive active browser ops`);
  }
});

// ========== Part B: end-to-end CLI flow the skills drive (EXTERNAL root, hermetic, multi-process) ==========

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "sa-skills-"));            // engagement root OUTSIDE the repo
assert.ok(!ROOT.startsWith(REPO), "test root must be external to the repo");
const S1 = { SA_ENGAGEMENT_ROOT: ROOT, SA_SESSION_ID: "sess-1" };
const S2 = { SA_ENGAGEMENT_ROOT: ROOT, SA_SESSION_ID: "sess-2" };
const S3 = { SA_ENGAGEMENT_ROOT: ROOT, SA_SESSION_ID: "sess-3" };

t("list: empty external root", () => {
  const r = run(CLI, ["list"], S1);
  assert.equal(r.code, 0); assert.match(r.out, /no engagements under/);
});

t("create (init) two engagements", () => {
  const a = run(CLI, ["init", "--name", "acme", "--modality", "graybox"], S1);
  const b = run(CLI, ["init", "--name", "globex"], S1);
  assert.equal(a.code, 0); assert.match(a.out, /created:.*acme/);
  assert.equal(b.code, 0); assert.match(b.out, /created:.*globex/);
  assert.ok(fs.existsSync(path.join(ROOT, "acme", ".engagement.json")));
});

t("use (select) is explicit + persists a session pointer", () => {
  const r = run(CLI, ["use", "--name", "acme"], S1);
  assert.equal(r.code, 0); assert.match(r.out, /active engagement set: acme/);
});

t("SA_SESSION_ID propagates across processes (active sees the selection)", () => {
  const r = run(CLI, ["active"], S1);
  assert.equal(r.code, 0); assert.match(r.out, /active: acme\s+\(via session\)/);
});

t("SA_SESSION_ID isolates concurrent sessions (sess-2 has no selection)", () => {
  const r = run(CLI, ["active"], S2);
  assert.equal(r.code, 0); assert.match(r.out, /no active engagement/);
});

t("switch warns + requires clean context (never claims history purged)", () => {
  const r = run(CLI, ["use", "--name", "globex"], S1);
  assert.equal(r.code, 0);
  assert.match(r.out, /switched from 'acme'/);
  assert.match(r.out, /does NOT purge any history/);
  assert.match(r.out, /CLEAN session/);
});

t("nonexistent engagement → actionable error, no silent guess", () => {
  const r = run(CLI, ["use", "--name", "zzz-nope"], S1);
  assert.notEqual(r.code, 0);
  assert.match(r.err, /no engagement named 'zzz-nope'/);
  assert.match(r.err, /available: .*(acme|globex)/);
});

t("associate Caido project (binding in the manifest)", () => {
  const r = run(CLI, ["associate", "--name", "acme", "--project-id", "proj-ACME-123"], S1);
  assert.equal(r.code, 0); assert.match(r.out, /associated engagement 'acme' → Caido project proj-ACME-123/);
});

t("list marks the active engagement (no silent switch)", () => {
  const r = run(CLI, ["list"], S1);
  assert.equal(r.code, 0);
  assert.match(r.out, /\*\s+globex/);           // active in sess-1 is globex
  assert.match(r.out, /acme\s+.*project=proj-ACME-123/);
});

t("no selection → engagement-dependent op blocked (sess-3, read of active ctx)", () => {
  const r = run(CLI, ["show"], S3);             // no --name, no active in sess-3
  assert.notEqual(r.code, 0);
  assert.match(r.err, /no active engagement selected/);
});

t("engagement-atual works without selection (read-only, not blocked)", () => {
  const r = run(CLI, ["active"], S3);
  assert.equal(r.code, 0); assert.match(r.out, /no active engagement/);
});

t("evidence dir resolves inside the ACTIVE engagement (confined)", () => {
  const r = run(CLI, ["show", "--name", "acme"], S1);
  assert.equal(r.code, 0);
  const j = JSON.parse(r.out);
  assert.equal(j.evidenceDir, path.join(fs.realpathSync(path.join(ROOT, "acme")), "evidence"));
  assert.ok(j.evidenceDir.startsWith(fs.realpathSync(ROOT)));
});

t("pentest entry: NO engagement → active reports none (entry must stop)", () => {
  const r = run(CLI, ["active"], S2);          // sess-2 has no selection
  assert.equal(r.code, 0); assert.match(r.out, /no active engagement/);
});

t("pentest entry: valid engagement + correct Caido project preserved", () => {
  run(CLI, ["use", "--name", "acme"], S2);
  assert.match(run(CLI, ["active"], S2).out, /active: acme/);
  const s = JSON.parse(run(CLI, ["show", "--name", "acme"], S2).out);
  assert.equal(s.caidoProjectId, "proj-ACME-123");  // project comes from the SELECTED engagement's manifest
});

// ========== Part C: preflight skill target runs (deterministic, offline) ==========

t("verificar-ambiente: preflight runs with a verdict + exit mapping", () => {
  const r = run(PRECLI, ["preflight", "--profile", "core-lab"], S1);
  assert.ok([0, 1, 2].includes(r.code), `verdict exit ${r.code}`);
  assert.match(r.out, /verdict: (READY|DEGRADED|BLOCKED)/);
});

t("verificar-ambiente: doctor always exits 0, prints no secret values", () => {
  const r = run(PRECLI, ["doctor"], { ...S1, CAIDO_TOKEN: "super-secret-token-xyz" });
  assert.equal(r.code, 0);
  assert.ok(!/super-secret-token-xyz/.test(r.out + r.err), "doctor must never print secret values");
});

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
console.log(`\n${n - fail}/${n} passed` + (fail ? ` (${fail} FAILED)` : ""));
process.exit(fail ? 1 : 0);
