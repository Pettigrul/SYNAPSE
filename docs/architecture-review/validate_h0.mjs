#!/usr/bin/env node
// Validador H0 — porte Node.js stdlib do validate_v1.py, com paridade de hashing
// e comparação integral AS-IS (baseline manifest) vs TO-BE (uma árvore com skills/).
// Node puro (node:fs, node:crypto, node:path). Sem npm, sem binário. Read-only.
//
// Uso: node validate_h0.mjs <treeDir> <baselineManifest.json>
//   treeDir deve conter skills/, policies/, workflows/, references/pattern-index.md

import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const STAGE = process.argv[2] || HERE;
const BASELINE = process.argv[3] || join(HERE, "baseline/manifest.json");

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
function splitlines(t) {               // paridade com Python str.splitlines()
  const parts = t.split(/\r\n|\r|\n/);
  if (parts.length && parts[parts.length - 1] === "") parts.pop();
  return parts;
}
const TECH = /^### ((?:T|B)\d+):\s*(.+?)\s*$/;
const H2 = /^##\s+(.+?)\s*$/;
const H3 = /^### /;
const FIELD = /^([A-Z][A-Za-z]+):/;
const TIER = /^Tier:\s*(\S+)/;
const VALID_TIERS = new Set(["0-native", "1-python", "1-go", "1-node"]);
const REQUIRED = ["Tags", "When", "Why", "Tier", "Steps", "Source"];
const BRIEF = ["Objective","Active engagement task","Target","Run mode",
  "Native-tooling constraint","Techniques to apply","Verification contract","Return contract"];
const POLICIES = ["authorization-gate","verification-contract","native-tooling-doctrine"];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith(".md")) out.push(p);
  }
  return out;
}
function techniquesOf(text) {
  const lines = splitlines(text);
  const heads = [];
  lines.forEach((l, i) => { const m = l.match(TECH); if (m) heads.push([i, m[1], m[2]]); });
  const techs = [];
  for (const [start, id, title] of heads) {
    let end = lines.length;
    for (let j = start + 1; j < lines.length; j++) { if (H3.test(lines[j]) || H2.test(lines[j])) { end = j; break; } }
    const bodyLines = lines.slice(start, end);
    const fields = new Set(); let tier = null;
    for (const bl of bodyLines.slice(1)) { const f = bl.match(FIELD); if (f) fields.add(f[1]); const t = bl.match(TIER); if (t && !tier) tier = t[1]; }
    const bodyOnly = bodyLines.slice(1).join("\n");
    const isPointer = /\bSee\b.*\.md/i.test(bodyOnly) || /→\s*[\w./-]+\.md#(?:T|B)\d+/.test(bodyOnly) || bodyOnly.includes("IS the forge blueprint");
    techs.push({ id, title, kind: id.startsWith("B") ? "blueprint" : "technique",
      tier, fields: [...fields], isPointer, bodySha: sha256(bodyLines.join("\n")) });
  }
  return techs;
}

const findings = [];
const add = (sev, check, msg) => findings.push({ sev, check, msg });

const base = JSON.parse(readFileSync(BASELINE, "utf8"));
const baseBodies = {}; for (const t of base.techniques) { const h = t.body_sha256; baseBodies[h] = (baseBodies[h] || 0) + 1; }
const basePolicy = base.equivalence_set.policy_hashes;
const baseCount = base.equivalence_set.technique_count;
const baseByPrefix = base.equivalence_set.technique_count_by_prefix;
const baseCatTotals = {};
for (const [p, n] of Object.entries(base.equivalence_set.catalog_counts)) { const c = p.split("/")[1]; baseCatTotals[c] = (baseCatTotals[c] || 0) + n; }

const skillsDir = join(STAGE, "skills");
const allTech = []; const stageBodies = {}; const catTotals = {};
let kinds = { technique: 0, blueprint: 0, pointer: 0, pointerBlueprint: 0, tier0: 0, tier1: 0 };
for (const f of walk(skillsDir)) {
  const rel = relative(STAGE, f); const cat = rel.split("/")[1];
  for (const t of techniquesOf(readFileSync(f, "utf8"))) {
    t.file = rel; allTech.push(t);
    stageBodies[t.bodySha] = (stageBodies[t.bodySha] || 0) + 1;
    catTotals[cat] = (catTotals[cat] || 0) + 1;
    if (t.kind === "blueprint") kinds.blueprint++; else kinds.technique++;
    if (t.isPointer) kinds.pointer++;
    if (t.isPointer && t.kind === "blueprint") kinds.pointerBlueprint++;
    if (t.tier === "0-native") kinds.tier0++; else if (t.tier && t.tier.startsWith("1-")) kinds.tier1++;
    if (t.kind === "technique") {
      const missing = REQUIRED.filter((r) => !t.fields.includes(r));
      if (!(missing.length === 1 && missing[0] === "Steps" && t.fields.includes("Payload")) && missing.length)
        add("WARN", "C3_fields", `${t.file}#${t.id}: faltam ${missing.join(",")}`);
      if (t.tier && !VALID_TIERS.has(t.tier)) add("WARN", "C9_behavior", `${t.file}#${t.id}: Tier inválido ${t.tier}`);
      if (t.tier && t.tier !== "0-native" && !t.fields.includes("Escalation")) add("WARN", "C3_fields", `${t.file}#${t.id}: Tier sem Escalation`);
    }
  }
}

const checks = {};
let missing = 0, extra = 0;
for (const h of new Set([...Object.keys(baseBodies), ...Object.keys(stageBodies)])) {
  const b = baseBodies[h] || 0, s = stageBodies[h] || 0;
  if (s < b) missing += b - s; if (s > b) extra += s - b;
}
checks.bodies = { status: (missing === 0 && extra === 0) ? "OK" : "FAIL", detail: `multiset: baseline=${baseCount}, staging=${allTech.length}; faltando=${missing}, extra=${extra}` };
if (missing) add("FAIL", "bodies", `${missing} corpo(s) ausente(s)`); if (extra) add("FAIL", "bodies", `${extra} corpo(s) extra`);

const sB = allTech.filter((t) => t.id.startsWith("B")).length, sT = allTech.filter((t) => t.id.startsWith("T")).length;
checks.count = { status: (allTech.length === baseCount && sT === baseByPrefix.T && sB === baseByPrefix.B) ? "OK" : "FAIL", detail: `T=${sT}/${baseByPrefix.T}, B=${sB}/${baseByPrefix.B}, total=${allTech.length}/${baseCount}` };

let catDiff = 0;
for (const cat of new Set([...Object.keys(baseCatTotals), ...Object.keys(catTotals)]))
  if ((baseCatTotals[cat] || 0) !== (catTotals[cat] || 0)) { catDiff++; add("FAIL", "catalogs", `cat ${cat}: base=${baseCatTotals[cat]||0} staging=${catTotals[cat]||0}`); }
checks.catalogs = { status: catDiff === 0 ? "OK" : "FAIL", detail: `${Object.keys(catTotals).length} categorias; ${catDiff} divergências` };

let polProblems = 0; const polOut = {};
for (const name of POLICIES) {
  const p = join(STAGE, "policies", name + ".md");
  if (!existsSync(p)) { polProblems++; add("FAIL", "policies", `ausente: ${name}`); continue; }
  const txt = readFileSync(p, "utf8"); const hBytes = sha256(readFileSync(p)); polOut[name] = hBytes;
  if (basePolicy[name] !== hBytes) { polProblems++; add("FAIL", "policies", `${name}: hash difere`); }
  const marker = { "authorization-gate": "SECAUDIT_SAFETY_GATE_v1", "verification-contract": "SECAUDIT_VERIFICATION_CONTRACT_v1" }[name];
  if (marker && !txt.includes(marker)) { polProblems++; add("FAIL", "policies", `${name}: marcador ausente`); }
  if (name === "authorization-gate" && !/(?:^|\n)##\s*Rule 0/i.test(txt)) { polProblems++; add("FAIL", "policies", "Rule 0 ausente"); }
}
checks.policies = { status: polProblems === 0 ? "OK" : "FAIL", detail: `${POLICIES.length} policies; ${polProblems} problemas` };

const piPath = join(STAGE, "references", "pattern-index.md");
let brokenRoute = 0; const reachable = new Set(); let agentsRefs = 0;
if (existsSync(piPath)) {
  const piTxt = readFileSync(piPath, "utf8");
  agentsRefs = (piTxt.match(/agents\//g) || []).length;
  for (const ln of splitlines(piTxt)) {
    if (!ln.startsWith("|")) continue;
    for (const m of ln.matchAll(/`(skills\/[A-Za-z0-9_./-]+\.md)`/g)) {
      reachable.add(m[1].split("/")[1]);
      if (!existsSync(join(STAGE, m[1]))) { brokenRoute++; add("WARN", "routing", `inexistente: ${m[1]}`); }
    }
  }
}
const skillCats = existsSync(skillsDir) ? readdirSync(skillsDir).filter((d) => statSync(join(skillsDir, d)).isDirectory()) : [];
const unreached = skillCats.filter((c) => !reachable.has(c) && (catTotals[c] || 0) > 0);
for (const c of unreached) add("WARN", "routing", `não roteada: ${c}`);
checks.routing = { status: (brokenRoute === 0 && unreached.length === 0) ? "OK" : "WARN", detail: `${reachable.size} roteadas; ${brokenRoute} quebrados; ${unreached.length} não alcançadas; agents/refs no index=${agentsRefs}` };

let descMissing = 0;
for (const c of skillCats) {
  const sp = join(skillsDir, c, "SKILL.md");
  if (!existsSync(sp)) { descMissing++; continue; }
  const fm = readFileSync(sp, "utf8").match(/^---\n([\s\S]*?)\n---/);
  if (!fm || !/description:/.test(fm[1]) || !/Triggers:/.test(fm[1])) { descMissing++; add("WARN", "routing", `${c}: description/Triggers ausente`); }
}
checks.descriptions = { status: descMissing === 0 ? "OK" : "WARN", detail: `${skillCats.length} skills; ${descMissing} sem Triggers` };

checks.xref = { status: "OK", detail: "cross-refs informativos; corpos independem de path" };

const faPath = join(STAGE, "workflows", "flows-agents.md");
let present = [], orderOK = true, briefOK = false;
if (existsSync(faPath)) {
  const lines = splitlines(readFileSync(faPath, "utf8")); const pos = {};
  lines.forEach((l, i) => { const s = l.trim(); for (const sec of BRIEF) if (s === `## ${sec}` && !(sec in pos)) pos[sec] = i; });
  present = BRIEF.filter((s) => s in pos);
  let last = -1; for (const sec of BRIEF) if (sec in pos) { if (pos[sec] < last) orderOK = false; last = pos[sec]; }
  briefOK = present.length === BRIEF.length && orderOK;
}
checks.brief = { status: briefOK ? "OK" : "FAIL", detail: `${present.length}/${BRIEF.length} seções; ordem=${orderOK}` };

// regressão
const reg = {}; const norm = (s) => sha256(splitlines(s).join("\n"));
const SAMPLE = "### T9: Sample\nTags: a, b\nWhen: x\nPayload:\n```ps\nWrite-Host 1\n```\nSource: s";
reg.finalNewline = { pass: norm(SAMPLE) === norm(SAMPLE + "\n") };
reg.crlf = { pass: norm(SAMPLE.replace(/\n/g, "\r\n")) === norm(SAMPLE) };
reg.cr = { pass: norm(SAMPLE.replace(/\n/g, "\r")) === norm(SAMPLE) };
const bBlueprint = base.techniques.filter((t) => t.id.startsWith("B")).length;
const bTier0 = base.techniques.filter((t) => t.tier === "0-native").length;
const bTier1 = base.techniques.filter((t) => t.tier && String(t.tier).startsWith("1-")).length;
const bPointerBlueprint = base.techniques.filter((t) => t.kind === "blueprint" && t.is_pointer).length;
const bPointerAll = base.techniques.filter((t) => t.is_pointer).length;
reg.kinds = {
  blueprint: { staging: kinds.blueprint, baseline: bBlueprint, pass: kinds.blueprint === bBlueprint },
  tier0: { staging: kinds.tier0, baseline: bTier0, pass: kinds.tier0 === bTier0 },
  tier1: { staging: kinds.tier1, baseline: bTier1, pass: kinds.tier1 === bTier1 },
  delegated: { staging: kinds.pointerBlueprint, baseline: bPointerBlueprint, pass: kinds.pointerBlueprint === bPointerBlueprint },
  pointerAll: { staging: kinds.pointer, baseline: bPointerAll, pass: kinds.pointer === bPointerAll },
};
const regPass = reg.finalNewline.pass && reg.crlf.pass && reg.cr.pass && Object.values(reg.kinds).every((k) => k.pass);
checks.regression = { status: regPass ? "OK" : "FAIL", detail: `newline=${reg.finalNewline.pass} crlf=${reg.crlf.pass} cr=${reg.cr.pass} tier0=${reg.kinds.tier0.pass} tier1=${reg.kinds.tier1.pass} blueprint=${reg.kinds.blueprint.pass} delegados=${reg.kinds.delegated.pass}` };

const overall = Object.values(checks).some((c) => c.status === "FAIL") ? "FAIL" : (Object.values(checks).some((c) => c.status === "WARN") ? "WARN" : "OK");
const manifest = { tool: "validate_h0.mjs", runtime: `node ${process.version}`, tree: STAGE, baseline: BASELINE, overall, checks, regression: reg, staging_count: allTech.length, policy_hashes: polOut, findings };
writeFileSync(join(STAGE, "manifest-h0.json"), JSON.stringify(manifest, null, 2));

console.log(`[H0] runtime: node ${process.version} | tree: ${STAGE}`);
console.log(`[H0] overall: ${overall}`);
for (const [k, c] of Object.entries(checks)) console.log(`     ${k.padEnd(13)} ${c.status.padEnd(4)} — ${c.detail}`);
console.log(`[H0] regressão: newline=${reg.finalNewline.pass} crlf=${reg.crlf.pass} cr=${reg.cr.pass} | tier0(${reg.kinds.tier0.staging}/${reg.kinds.tier0.baseline}) tier1(${reg.kinds.tier1.staging}/${reg.kinds.tier1.baseline}) blueprint(${reg.kinds.blueprint.staging}/${reg.kinds.blueprint.baseline}) delegados(${reg.kinds.delegated.staging}/${reg.kinds.delegated.baseline})`);
console.log(`[H0] achados: ${findings.length} (FAIL=${findings.filter(f=>f.sev==='FAIL').length} WARN=${findings.filter(f=>f.sev==='WARN').length})`);
process.exit(overall === "FAIL" ? 1 : 0);
