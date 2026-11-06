#!/usr/bin/env node
// Loader de aceitação — Node.js stdlib puro (node:fs, node:crypto, node:path).
// NÃO instala nada, NÃO baixa binário, NÃO executa agente. Apenas simula o
// contrato de progressive disclosure do Agent Skills sobre o protótipo e
// confere perda-zero contra a baseline V1.
//
// Objetivo desta Fase 0.2: demonstrar que a VALIDAÇÃO da arquitetura de skills
// roda em Node (dependência disponível no Windows corporativo), sem Python.
//
// Uso:
//   node loader_node.mjs <skillDir> <tag> [manifest.json]
// Ex.:
//   node loader_node.mjs ./prototype-skill/security-auditor-proto sqli ../baseline/manifest.json

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const skillDir = resolve(args[0] ?? join(HERE, "prototype-skill/security-auditor-proto"));
const wantTag = (args[1] ?? "sqli").toLowerCase();
const manifestPath = resolve(args[2] ?? join(HERE, "../baseline/manifest.json"));

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const log = (...a) => console.log(...a);

// Replica Python str.splitlines(): divide em \r\n|\r|\n e descarta UM vazio
// terminal (o do \n final do arquivo). Sem isto, o hash da ÚLTIMA técnica
// difere entre Node e o validador Python (achado da Fase 0.2).
function splitlines(t) {
  const parts = t.split(/\r\n|\r|\n/);
  if (parts.length && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

function fail(msg) { console.error("FALHA:", msg); process.exit(2); }

// --- Passo 1: DESCOBERTA ----------------------------------------------------
// Agent Skills: uma skill é um diretório com SKILL.md + frontmatter YAML.
const skillFile = join(skillDir, "SKILL.md");
if (!existsSync(skillFile)) fail(`SKILL.md não encontrado em ${skillDir}`);
const skillRaw = readFileSync(skillFile, "utf8");

// --- Passo 2: PARSE DE FRONTMATTER (name/description — contrato Pi+Claude) ---
function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return { ok: false, fields: {} };
  const fields = {};
  let key = null;
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s?(.*)$/);
    if (kv && !/^\s/.test(line)) { key = kv[1]; fields[key] = kv[2]; }
    else if (key && /^\s+\S/.test(line)) { fields[key] += " " + line.trim(); } // continuação (>)
  }
  return { ok: true, fields, raw: m[1] };
}
const fm = parseFrontmatter(skillRaw);
if (!fm.ok) fail("frontmatter YAML ausente no SKILL.md");
const requiredFm = ["name", "description"];
const missingFm = requiredFm.filter((k) => !fm.fields[k]);

// --- Passo 3: ROTEAMENTO (description carrega os triggers, como no Agent Skills)
const desc = (fm.fields.description || "").toLowerCase();
const routeHit = desc.includes(wantTag);

// --- Passo 4: PROGRESSIVE DISCLOSURE — carregar SOMENTE o Index ---------------
// O Index pode estar no próprio SKILL.md e/ou nos arquivos de references/.
function extractIndexRows(text) {
  const lines = splitlines(text);
  const rows = [];
  let inIndex = false;
  for (const ln of lines) {
    const h2 = ln.match(/^##\s+(.*)$/);
    if (h2) { inIndex = h2[1].trim() === "Index"; continue; }
    if (inIndex) {
      const r = ln.match(/^\|\s*((?:T|B)\d+)\s*\|(.*)$/);
      if (r) {
        const cols = ln.split("|").map((c) => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
        rows.push({ id: r[1], cols });
      }
    }
  }
  return rows;
}

// resolver references/ (arquivo que contém ## Techniques)
const refDir = join(skillDir, "references");
let refFiles = [];
if (existsSync(refDir)) refFiles = readdirSync(refDir).filter((f) => f.endsWith(".md")).map((f) => join(refDir, f));

// Index consolidado (SKILL.md + references)
let indexRows = extractIndexRows(skillRaw);
const refTexts = {};
for (const rf of refFiles) {
  const t = readFileSync(rf, "utf8");
  refTexts[rf] = t;
  indexRows = indexRows.concat(extractIndexRows(t).map((r) => ({ ...r, file: rf })));
}

// bytes carregados até aqui (disclosure): frontmatter + Index, NÃO os corpos
const indexBytesApprox = Buffer.byteLength(skillRaw.slice(0, skillRaw.indexOf("## Techniques") >>> 0) || skillRaw);

// --- Passo 5: MATCH DE TAG e carga do corpo (só a técnica casada) ------------
function extractBody(text, id) {
  const lines = splitlines(text);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (new RegExp(`^### ${id}:`).test(lines[i])) { start = i; break; }
  }
  if (start < 0) return null;
  let end = lines.length;
  for (let j = start + 1; j < lines.length; j++) {
    if (/^### /.test(lines[j]) || /^## /.test(lines[j])) { end = j; break; }
  }
  return lines.slice(start, end).join("\n");
}

// quais técnicas casam a tag pedida? (coluna Tags do Index de references)
const matched = [];
for (const rf of refFiles) {
  for (const r of extractIndexRows(refTexts[rf])) {
    const tags = (r.cols[r.cols.length - 1] || "").toLowerCase();
    if (tags.includes(wantTag)) matched.push({ id: r.id, file: rf });
  }
}

// --- Passo 6: COMPARAR com a baseline V1 (perda-zero) ------------------------
let baseline = {};
if (existsSync(manifestPath)) {
  const m = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const t of m.techniques) baseline[`${t.id}@web-testing`] = t.body_sha256;
}
const loaded = [];
for (const mt of matched) {
  const body = extractBody(refTexts[mt.file], mt.id);
  if (body == null) continue;
  const h = sha256(body);
  const bkey = `${mt.id}@web-testing`;
  loaded.push({
    id: mt.id, bytes: Buffer.byteLength(body), sha256: h,
    baseline: baseline[bkey] || null,
    perdaZero: baseline[bkey] ? (baseline[bkey] === h) : null,
  });
}

// --- RELATÓRIO --------------------------------------------------------------
const fullRefBytes = refFiles.reduce((a, f) => a + Buffer.byteLength(refTexts[f]), 0);
const report = {
  runtime: `node ${process.version}`,
  skillDir,
  discovery: { skillFileFound: true, refFiles: refFiles.map((f) => f.replace(skillDir + "/", "")) },
  frontmatter: { present: fm.ok, name: fm.fields.name, missingRequired: missingFm },
  routing: { tag: wantTag, matchedInDescription: routeHit },
  progressiveDisclosure: {
    indexRows: [...new Set(indexRows.map((r) => r.id))],
    indexBytesApprox,
    fullReferencesBytes: fullRefBytes,
    loadedBodyBytes: loaded.reduce((a, x) => a + x.bytes, 0),
    savedVsFullPct: fullRefBytes ? Math.round(100 * (1 - loaded.reduce((a, x) => a + x.bytes, 0) / fullRefBytes)) : null,
  },
  tagMatch: matched.map((m) => m.id),
  perdaZero: loaded,
  verdict: {
    frontmatterOK: missingFm.length === 0,
    routingOK: routeHit,
    disclosureOK: loaded.length > 0 && loaded.length < indexRows.length + 1,
    perdaZeroOK: loaded.length > 0 && loaded.every((x) => x.perdaZero === true),
    nodeSufficient: true,
  },
};
log(JSON.stringify(report, null, 2));

const v = report.verdict;
const allOK = v.frontmatterOK && v.routingOK && v.disclosureOK && v.perdaZeroOK;
log("\n[loader_node] veredito:", allOK ? "OK — carga, disclosure, roteamento e perda-zero confirmados em Node" : "ATENÇÃO — ver verdict acima");
process.exit(allOK ? 0 : 1);
