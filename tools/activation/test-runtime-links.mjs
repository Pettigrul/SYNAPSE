#!/usr/bin/env node
// SecurityAuditor — per-runtime activation contract (deterministic, offline, no LLM, no offensive ops).
// Covers RUNTIME_LINKS (Pi / Antigravity discovery points), deactivate symmetry, runtime switches, CLI validation,
// --help never mutating, the repo-level files runtimes load (AGENTS.md, .pi/settings.json, .agents/skills), and
// the guard on tools/acceptance/runtime-acceptance.mjs. Whether a real runtime honors these files is proven by
// that script, not here.

import { isDispatcherRead, reportsMissingEngagement } from "../acceptance/checks.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { activate, deactivate, statusActivation, hackbotHome, LINKS, RUNTIME_LINKS, MARKER } from "./activate.mjs";

const H = hackbotHome();
const CLI = path.join(H, "tools", "activation", "cli.mjs");
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sa-rtlinks-")));
const FAKE_HOME = path.join(TMP, "_home"); fs.mkdirSync(FAKE_HOME);
let n = 0, fail = 0, seq = 0;
function t(name, fn) { n++; try { fn(); console.log(`  ok   ${name}`); } catch (e) { fail++; console.log(`  FAIL ${name}: ${e.message}`); } }
const mk = () => { const p = path.join(TMP, `p${++seq}`); fs.mkdirSync(p); return p; };
const isLink = (p) => { try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; } };
const present = (p) => { try { fs.lstatSync(p); return true; } catch { return false; } };
const marker = (p) => JSON.parse(fs.readFileSync(path.join(p, MARKER), "utf8"));
function cli(args, cwd = TMP) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", env: { PATH: process.env.PATH, HOME: FAKE_HOME, SA_SKIP_ENV_FILE: "1" } });
  return { code: r.status, out: r.stdout || "", err: r.stderr || "" };
}
// name → file hash / link target / "dir", without following links. Proves "nothing changed", byte for byte.
function tree(dir, base = dir, acc = {}) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name), rel = path.relative(base, abs);
    if (e.isSymbolicLink()) acc[rel] = `-> ${fs.readlinkSync(abs)}`;
    else if (e.isDirectory()) { acc[rel] = "dir"; tree(abs, base, acc); }
    else acc[rel] = createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
  }
  return acc;
}
const assertLinksCentral = (p, rels) => { for (const rel of rels) {
  assert.ok(isLink(path.join(p, rel)), `${rel} must be a symlink`);
  assert.equal(fs.realpathSync(path.join(p, rel)), fs.realpathSync(path.join(H, rel)), `${rel} must resolve to central`);
} };

// ---- per-runtime link sets ----

const PI_ONLY = [".pi/settings.json"], AGY_ONLY = [".agents/skills"];

t("no runtime declared: Claude Code links only, none of the Pi/Antigravity discovery points", () => {
  const p = mk(); activate({ projectDir: p, home: H });
  assert.deepEqual(marker(p).runtimes, ["claude-code"]);
  assertLinksCentral(p, LINKS);
  for (const rel of ["AGENTS.md", ...PI_ONLY, ...AGY_ONLY]) assert.ok(!present(path.join(p, rel)), `${rel} must not exist`);
});

t("pi: AGENTS.md and .pi/settings.json linked; .agents absent", () => {
  const p = mk(); activate({ projectDir: p, home: H, runtimes: ["pi"] });
  assertLinksCentral(p, [...LINKS, "AGENTS.md", ...PI_ONLY]);
  assert.ok(!present(path.join(p, ".agents")));
});

t("antigravity: AGENTS.md and .agents/skills linked; .pi absent", () => {
  const p = mk(); activate({ projectDir: p, home: H, runtimes: ["antigravity"] });
  assertLinksCentral(p, [...LINKS, "AGENTS.md", ...AGY_ONLY]);
  assert.ok(!present(path.join(p, ".pi")));
});

t("all runtimes: union, and the shared AGENTS.md is tracked once", () => {
  const p = mk(); activate({ projectDir: p, home: H, runtimes: ["claude-code", "pi", "antigravity"] });
  assertLinksCentral(p, [...LINKS, "AGENTS.md", ...PI_ONLY, ...AGY_ONLY]);
  assert.equal(marker(p).links.filter((l) => l === "AGENTS.md").length, 1);
  assert.equal(statusActivation({ projectDir: p }).healthy, true);
});

t("RUNTIME_LINKS covers exactly the discovery points real runs rely on", () => {
  assert.deepEqual(Object.keys(RUNTIME_LINKS).sort(), ["antigravity", "pi"]);
  assert.deepEqual([...RUNTIME_LINKS.pi].sort(), [".pi/settings.json", "AGENTS.md"]);
  assert.deepEqual([...RUNTIME_LINKS.antigravity].sort(), [".agents/skills", "AGENTS.md"]);
});

// ---- deactivate symmetry ----

for (const runtimes of [["claude-code"], ["pi"], ["antigravity"], ["claude-code", "pi", "antigravity"]]) {
  t(`deactivate restores the exact pre-activation tree: ${runtimes.join("+")}`, () => {
    const p = mk(); fs.writeFileSync(path.join(p, "app.txt"), "operator data\n"); const before = tree(p);
    activate({ projectDir: p, home: H, runtimes });
    deactivate({ projectDir: p });
    assert.deepEqual(tree(p), before);
  });
}

t("deactivate keeps operator content next to our links (.agents/other survives, with its parent)", () => {
  const p = mk(); fs.mkdirSync(path.join(p, ".agents", "other"), { recursive: true }); fs.writeFileSync(path.join(p, ".agents", "other", "x"), "mine");
  const before = tree(p);
  activate({ projectDir: p, home: H, runtimes: ["antigravity"] });
  assert.ok(isLink(path.join(p, ".agents", "skills")));
  deactivate({ projectDir: p });
  assert.deepEqual(tree(p), before);
});

// ---- runtime switch ----

t("switch pi → antigravity: Pi link dropped, AGENTS.md kept, status healthy, deactivate leaves nothing", () => {
  const p = mk(); activate({ projectDir: p, home: H, runtimes: ["pi"] });
  activate({ projectDir: p, home: H, runtimes: ["antigravity"] });
  assert.ok(!present(path.join(p, ".pi", "settings.json")), ".pi/settings.json must be dropped");
  assertLinksCentral(p, ["AGENTS.md", ...AGY_ONLY]);
  assert.ok(!marker(p).links.includes(".pi/settings.json"), "marker must stop tracking the dropped link");
  assert.equal(statusActivation({ projectDir: p }).healthy, true);
  deactivate({ projectDir: p });
  assert.deepEqual(tree(p), {});
});

t("switch to claude-code drops AGENTS.md too", () => {
  const p = mk(); activate({ projectDir: p, home: H, runtimes: ["antigravity"] });
  activate({ projectDir: p, home: H, runtimes: ["claude-code"] });
  for (const rel of ["AGENTS.md", ...AGY_ONLY]) assert.ok(!present(path.join(p, rel)), `${rel} must be dropped`);
  deactivate({ projectDir: p }); assert.deepEqual(tree(p), {});
});

t("re-activation with no flag keeps the marker's runtimes and links", () => {
  const p = mk(); assert.equal(cli(["activate", "--project", p, "--runtime", "pi"]).code, 0);
  const snap = tree(p); const r = cli(["activate", "--project", p]);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(marker(p).runtimes, ["pi"]);
  assert.deepEqual(Object.keys(tree(p)).sort(), Object.keys(snap).sort());
  assert.ok(isLink(path.join(p, ".pi", "settings.json")));
});

t("a switch never deletes an operator's file sitting where our link used to be", () => {
  const p = mk(); activate({ projectDir: p, home: H, runtimes: ["pi"] });
  const f = path.join(p, ".pi", "settings.json"); fs.unlinkSync(f); fs.writeFileSync(f, "{\"mine\":true}\n");
  activate({ projectDir: p, home: H, runtimes: ["antigravity"] });
  assert.equal(fs.readFileSync(f, "utf8"), "{\"mine\":true}\n");
});

t("pre-existing AGENTS.md: refused without --force, nothing created", () => {
  const p = mk(); fs.writeFileSync(path.join(p, "AGENTS.md"), "my rules\n"); const before = tree(p);
  const r = cli(["activate", "--project", p, "--runtime", "antigravity"]);
  assert.equal(r.code, 2); assert.match(r.err, /conflict/);
  assert.deepEqual(tree(p), before);
});

t("pre-existing AGENTS.md: --force backs it up, deactivate restores it byte for byte", () => {
  const p = mk(); fs.writeFileSync(path.join(p, "AGENTS.md"), "my rules\n"); const before = tree(p);
  activate({ projectDir: p, home: H, runtimes: ["pi"], force: true });
  assertLinksCentral(p, ["AGENTS.md"]);
  assert.equal(fs.readFileSync(path.join(p, "AGENTS.md.hackbot-bak"), "utf8"), "my rules\n");
  deactivate({ projectDir: p });
  assert.deepEqual(tree(p), before);
});

t("--force backup returns when a runtime switch drops the link", () => {
  const p = mk(); fs.writeFileSync(path.join(p, "AGENTS.md"), "my rules\n");
  activate({ projectDir: p, home: H, runtimes: ["pi"], force: true });
  activate({ projectDir: p, home: H, runtimes: ["claude-code"] });
  assert.equal(fs.lstatSync(path.join(p, "AGENTS.md")).isSymbolicLink(), false);
  assert.equal(fs.readFileSync(path.join(p, "AGENTS.md"), "utf8"), "my rules\n");
  assert.equal(fs.existsSync(path.join(p, "AGENTS.md.hackbot-bak")), false);
  deactivate({ projectDir: p });
  assert.equal(fs.readFileSync(path.join(p, "AGENTS.md"), "utf8"), "my rules\n");
});

t("new content next to an existing backup: refused, even with --force, and nothing changes", () => {
  const p = mk(); fs.writeFileSync(path.join(p, "AGENTS.md"), "my rules\n");
  activate({ projectDir: p, home: H, runtimes: ["pi"], force: true });
  fs.unlinkSync(path.join(p, "AGENTS.md")); fs.writeFileSync(path.join(p, "AGENTS.md"), "newer rules\n");
  const before = tree(p);
  for (const extra of [[], ["--force"]]) {
    const r = cli(["activate", "--project", p, "--runtime", "antigravity", ...extra]);
    assert.equal(r.code, 2); assert.match(r.err, /backup already exists/);
    assert.deepEqual(tree(p), before);
  }
});

t("deactivate keeps the operator's newer file and the backup", () => {
  const p = mk(); fs.writeFileSync(path.join(p, "AGENTS.md"), "my rules\n");
  activate({ projectDir: p, home: H, runtimes: ["pi"], force: true });
  fs.unlinkSync(path.join(p, "AGENTS.md")); fs.writeFileSync(path.join(p, "AGENTS.md"), "newer rules\n");
  const r = deactivate({ projectDir: p });
  assert.equal(fs.readFileSync(path.join(p, "AGENTS.md"), "utf8"), "newer rules\n");
  assert.equal(fs.readFileSync(path.join(p, "AGENTS.md.hackbot-bak"), "utf8"), "my rules\n");
  assert.deepEqual(r.keptBackups, ["AGENTS.md.hackbot-bak"]);
});

t("--force never overwrites a backup kept by an earlier deactivate", () => {
  const p = mk(); fs.writeFileSync(path.join(p, "AGENTS.md"), "my rules\n");
  activate({ projectDir: p, home: H, runtimes: ["pi"], force: true });
  fs.unlinkSync(path.join(p, "AGENTS.md")); fs.writeFileSync(path.join(p, "AGENTS.md"), "newer rules\n");
  deactivate({ projectDir: p }); const before = tree(p);
  const r = cli(["activate", "--project", p, "--runtime", "pi", "--force"]);
  assert.equal(r.code, 2); assert.match(r.err, /hackbot-bak already exists/);
  assert.deepEqual(tree(p), before);
});

t("a refused runtime switch changes nothing (conflict leaves the old links in place)", () => {
  const p = mk(); activate({ projectDir: p, home: H, runtimes: ["antigravity"] });
  fs.mkdirSync(path.join(p, ".pi")); fs.writeFileSync(path.join(p, ".pi", "settings.json"), "{}\n"); const before = tree(p);
  const r = cli(["activate", "--project", p, "--runtime", "pi"]);
  assert.equal(r.code, 2); assert.match(r.err, /conflict/);
  assert.deepEqual(tree(p), before);
  assert.equal(statusActivation({ projectDir: p }).healthy, true);
});

// ---- CLI: validation and --help ----

t("--runtime unknown: exit 2, nothing created", () => {
  const p = mk(); const r = cli(["activate", "--project", p, "--runtime", "gemini"]);
  assert.equal(r.code, 2); assert.match(r.err, /unknown runtime 'gemini'/);
  assert.deepEqual(tree(p), {});
});

t("--runtime with one bad item in a list: exit 2, nothing created", () => {
  const p = mk(); const r = cli(["activate", "--project", p, "--runtime", "pi,bogus"]);
  assert.equal(r.code, 2); assert.match(r.err, /unknown runtime 'bogus'/);
  assert.deepEqual(tree(p), {});
});

t("--runtime with no value: exit 2, nothing created", () => {
  const p = mk(); const r = cli(["activate", "--project", p, "--runtime"]);
  assert.equal(r.code, 2); assert.match(r.err, /needs a value/);
  assert.deepEqual(tree(p), {});
});

t("--runtimes alias, comma list with spaces and repeats", () => {
  const p = mk(); const r = cli(["activate", "--project", p, "--runtimes", "pi, antigravity,pi"]);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(marker(p).runtimes, ["pi", "antigravity"]);
  assertLinksCentral(p, ["AGENTS.md", ...PI_ONLY, ...AGY_ONLY]);
});

t("--runtime all expands to the three runtimes", () => {
  const p = mk(); assert.equal(cli(["activate", "--project", p, "--runtime", "all"]).code, 0);
  assert.deepEqual(marker(p).runtimes, ["claude-code", "pi", "antigravity"]);
});

t("activation output tells each runtime how to start, from the marker's runtimes", () => {
  const p = mk(); const r = cli(["activate", "--project", p, "--runtime", "pi"]);
  assert.match(r.out, /pi -a/); assert.match(r.out, /\/skill:/); assert.doesNotMatch(r.out, /agy/);
  const q = cli(["activate", "--project", p]); assert.match(q.out, /pi -a/, "no-flag reactivation keeps the hint");
});

for (const args of [["--help"], ["-h"], ["activate", "--help"], ["activate", "-h"], ["activate", "--project", "__P__", "--help"], ["activate", "--project", "__P__", "-h"]]) {
  t(`help never activates: ${args.join(" ").replace("__P__", "<p>")}`, () => {
    const p = mk(); const r = cli(args.map((a) => a === "__P__" ? p : a), p);
    assert.equal(r.code, 0, r.err); assert.match(r.out, /Usage:/);
    assert.deepEqual(tree(p), {});
  });
}

for (const args of [["deactivate", "--help"], ["deactivate", "-h"], ["status", "--help"]]) {
  t(`help never deactivates: ${args.join(" ")}`, () => {
    const p = mk(); activate({ projectDir: p, home: H, runtimes: ["pi"] }); const before = tree(p);
    const r = cli(args, p);
    assert.match(r.out, /Usage:/);
    assert.deepEqual(tree(p), before);
  });
}

// ---- the files runtimes actually load ----

const skillDirs = (d) => fs.readdirSync(d, { withFileTypes: true }).filter((e) => (e.isDirectory() || e.isSymbolicLink()) && fs.existsSync(path.join(d, e.name, "SKILL.md"))).map((e) => e.name).sort();

for (const [label, base] of [["central", () => H], ["activated project", () => { const p = mk(); activate({ projectDir: p, home: H, runtimes: ["pi"] }); return p; }]]) {
  t(`.pi/settings.json resolves from <project>/.pi/ with no global or absolute path: ${label}`, () => {
    const b = base(); const s = JSON.parse(fs.readFileSync(path.join(b, ".pi", "settings.json"), "utf8"));
    const paths = [...s.skills, ...s.extensions];
    assert.ok(paths.length >= 3, "skills + extension expected");
    for (const rel of paths) {
      assert.ok(!path.isAbsolute(rel) && !rel.startsWith("~"), `${rel} must be project-relative`);
      assert.ok(fs.existsSync(path.resolve(b, ".pi", rel)), `${rel} must resolve`);
    }
    assert.ok(s.extensions.some((e) => e.endsWith("extension-pi.mjs")), "Bridge extension wired");
    assert.ok(s.skills.includes("../SKILL.md") && s.skills.includes("../.claude/skills"), "dispatcher and skills wired");
  });
}

t(".agents/skills: tracked relative links only, the 13 skills plus the dispatcher, no copy", () => {
  const link = path.join(H, ".agents", "skills");
  const names = skillDirs(link).filter((n) => n !== "security-auditor");
  assert.equal(names.length, 13, names.join(","));
  assert.deepEqual(names, skillDirs(path.join(H, ".claude", "skills")), "a skill added to .claude/skills must be linked here too");
  for (const name of names) {
    assert.ok(isLink(path.join(link, name)), `${name} must be a symlink`);
    assert.equal(fs.readlinkSync(path.join(link, name)), `../../.claude/skills/${name}`);
  }
  for (const name of [...names, "security-auditor"]) {
    const fm = fs.readFileSync(path.join(link, name, "SKILL.md"), "utf8").match(/^---\n[\s\S]*?^name:\s*(\S+)/m);
    assert.equal(fm && fm[1], name, `frontmatter name of ${name}`);
  }
});

t("dispatcher in .agents/skills is THE dispatcher: a link to SKILL.md, not a second copy", () => {
  const d = path.join(H, ".agents", "skills", "security-auditor", "SKILL.md");
  assert.ok(isLink(d)); assert.equal(fs.readlinkSync(d), "../../../SKILL.md");
  assert.equal(fs.realpathSync(d), fs.realpathSync(path.join(H, "SKILL.md")));
  assert.deepEqual(fs.readdirSync(path.dirname(d)), ["SKILL.md"]);
  assert.ok(!fs.existsSync(path.join(H, ".claude", "skills", "security-auditor")), "Claude Code and Pi discovery stay unchanged");
});

t("activated project: .agents/skills exposes the 13 skills and the dispatcher, through the central harness", () => {
  const p = mk(); activate({ projectDir: p, home: H, runtimes: ["antigravity"] });
  assert.equal(skillDirs(path.join(p, ".agents", "skills")).length, 14);
  const d = path.join(p, ".agents", "skills", "security-auditor", "SKILL.md");
  assert.equal(fs.realpathSync(d), fs.realpathSync(path.join(H, "SKILL.md")));
  assert.equal(fs.realpathSync(path.join(p, "SKILL.md")), fs.realpathSync(d), "same file as the project's SKILL.md");
});

t("runtime config audit: lists what the project supplies, not our links, and blocks nothing", () => {
  const p = mk();
  fs.mkdirSync(path.join(p, ".pi", "extensions"), { recursive: true }); fs.writeFileSync(path.join(p, "AGENTS.override.md"), "x");
  fs.mkdirSync(path.join(p, ".agents")); fs.writeFileSync(path.join(p, ".agents", "hooks.json"), "{}");
  const r = activate({ projectDir: p, home: H, runtimes: ["pi", "antigravity"] });
  assert.deepEqual(r.runtimeConfig.map((f) => f.path).sort(), [".agents/hooks.json", ".pi/extensions", "AGENTS.override.md"]);
  assert.equal(r.runtimeConfig.find((f) => f.path === ".agents/hooks.json").kind, "executable");
  const out = cli(["status", "--project", p]);
  assert.match(out.out, /review before trusting/); assert.match(out.out, /\.pi\/extensions\s+\[executable\]/);
  const clean = mk(); assert.deepEqual(activate({ projectDir: clean, home: H, runtimes: ["pi", "antigravity"] }).runtimeConfig, []);
});

t("runtime config audit: an ancestor's .agents/skills and context files are reported too", () => {
  const parent = mk(); fs.mkdirSync(path.join(parent, ".agents", "skills"), { recursive: true }); fs.writeFileSync(path.join(parent, "CLAUDE.md"), "x");
  const child = path.join(parent, "child"); fs.mkdirSync(child);
  const found = activate({ projectDir: child, home: H, runtimes: ["pi"] }).runtimeConfig.map((f) => f.path);
  assert.ok(found.includes(path.join(parent, ".agents", "skills"))); assert.ok(found.includes(path.join(parent, "CLAUDE.md")));
});

t("acceptance S12 check: the answer must name the engagement and say it is missing", () => {
  for (const ok of ["Não selecionei **nao-existe**: o CLI informou que não há um engagement com esse nome.", "nao-existe não existe.", "Engagement nao-existe not found.", "não há engagement nao-existe", "Para nao-existe, o CLI retornou `not-found`.", "nao-existe não foi localizado.", "nao-existe não localizado."]) assert.ok(reportsMissingEngagement(ok, "nao-existe"), ok);
  for (const bad of ["O engagement nao-existe foi selecionado.", "O escopo de nao-existe é 127.0.0.1.", "Não há um engagement com esse nome.", "Selecionei nao-existe; não há problema."]) assert.ok(!reportsMissingEngagement(bad, "nao-existe"), bad);
});

t("acceptance S2 check: only the dispatcher's own file counts, by resolved path", () => {
  const p = mk(); activate({ projectDir: p, home: H, runtimes: ["antigravity"] });
  const is = (arg) => isDispatcherRead(arg, p, H);
  assert.ok(is("SKILL.md")); assert.ok(is(path.join(p, ".agents", "skills", "security-auditor", "SKILL.md")));
  assert.ok(is(`50 ${path.join(p, "SKILL.md")}`), "other parameters beside the path");
  assert.ok(!is(path.join(p, ".agents", "skills", "investigar", "SKILL.md")), "another skill");
  fs.writeFileSync(path.join(p, "copy.md"), fs.readFileSync(path.join(H, "SKILL.md"))); fs.mkdirSync(path.join(p, "x")); fs.writeFileSync(path.join(p, "x", "SKILL.md"), fs.readFileSync(path.join(H, "SKILL.md")));
  assert.ok(!is(path.join(p, "x", "SKILL.md")), "a copy is not the dispatcher");
  assert.ok(!is("no-such-dir/SKILL.md")); assert.ok(!is("AGENTS.md"));
});

t("AGENTS.md is a short pointer: under 1 KiB, names files that exist, claims no authority", () => {
  const f = path.join(H, "AGENTS.md"); const text = fs.readFileSync(f, "utf8");
  assert.ok(Buffer.byteLength(text) < 1024, `${Buffer.byteLength(text)} bytes`);
  const named = [...text.matchAll(/`([^`\s]+)`/g)].map((m) => m[1]).filter((s) => !s.includes("<") && !s.startsWith("/") && s !== "node");
  assert.ok(named.includes("SKILL.md"), "must point at the dispatcher");
  for (const rel of ["SKILL.md", ".claude/skills"]) assert.ok(fs.existsSync(path.join(H, rel)), rel);
  for (const m of text.matchAll(/`(\.[^`<]*?)\/?<name>/g)) assert.ok(fs.existsSync(path.join(H, m[1])), m[1]);
  assert.match(text, /authorizes nothing|grants no permissions/);
  assert.doesNotMatch(text, /^##\s/m, "pointer, not a second dispatcher");
});

t("KB not duplicated: runtime discovery points carry no real files, activated KB is a link", () => {
  const realFiles = (d) => { const out = []; for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isSymbolicLink()) continue; const a = path.join(d, e.name); if (e.isDirectory()) out.push(...realFiles(a)); else out.push(a); } return out; };
  assert.deepEqual(realFiles(path.join(H, ".agents")), []);
  assert.deepEqual(fs.readdirSync(path.join(H, ".pi")), ["settings.json"]);
  const p = mk(); activate({ projectDir: p, home: H, runtimes: ["pi", "antigravity"] });
  assert.ok(isLink(path.join(p, "skills")));
  assert.deepEqual(realFiles(p).map((f) => path.relative(p, f)), [MARKER]);
});

// ---- real-acceptance script guard (never runs a model from an offline suite) ----

const ACC = path.join(H, "tools", "acceptance", "runtime-acceptance.mjs");
t("runtime-acceptance refuses to run without --accept-model-cost, creating nothing", () => {
  const out = path.join(TMP, "acc-out");
  const r = spawnSync(process.execPath, [ACC, "--runtime", "pi", "--harness", H, "--out", out], { encoding: "utf8", env: { PATH: "", HOME: FAKE_HOME } });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /accept-model-cost/);
  assert.ok(!fs.existsSync(out), "must not create --out");
});

t("runtime-acceptance has no permission-bypass flag and no local absolute path", () => {
  const src = fs.readFileSync(ACC, "utf8");
  assert.doesNotMatch(src, /dangerously|skip-permissions|yolo/i);
  assert.doesNotMatch(src, /\/home\/|\/tmp\/claude/);
  assert.match(src, /"auto"/, "agy runs under --mode auto");
});

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }
console.log(`\n${n - fail}/${n} passed` + (fail ? ` (${fail} FAILED)` : ""));
process.exit(fail ? 1 : 0);
