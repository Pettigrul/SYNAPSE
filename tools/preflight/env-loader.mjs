// SecurityAuditor — local .env loader (config convenience, não é H2d-F2).
//
// Carrega configurações locais persistentes de `<repo>/.env` usando APENAS o suporte NATIVO do Node 22
// (`node:util` parseEnv) — SEM `dotenv`, SEM nova dependência. Objetivo: não exportar variáveis a cada
// sessão. Invariantes:
//   - PRECEDÊNCIA DO AMBIENTE: variáveis já definidas em `process.env` NUNCA são sobrescritas (env vence).
//   - RAIZ REAL DO PROJETO: o arquivo é localizado a partir da posição deste módulo, independente do cwd.
//   - SANITIZAÇÃO: as funções NUNCA imprimem/retornam VALORES — apenas NOMES de variáveis.
//   - Não é gerenciador de segredos, não é nova arquitetura de config, e a presença do arquivo NÃO
//     autoriza operação alguma (autorização segue no Execution Context / policies — intocadas).
// Reutilizável por qualquer entry point: `import { loadProjectEnv } from ".../env-loader.mjs"`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const ENV_FILE = ".env";

// Raiz real do projeto (este módulo vive em tools/preflight/ → sobe dois níveis). Independe do cwd.
export function projectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

// Puro: parseia o conteúdo de um .env com o parser NATIVO do Node (zero deps). Tolerante a erro.
export function parseEnvContent(content) {
  if (typeof content !== "string" || content.length === 0) return {};
  try { return parseEnv(content) || {}; } catch { return {}; }
}

// Puro: aplica as variáveis a um mapa-alvo PRESERVANDO precedência (o que já existe no ambiente vence).
// Retorna SOMENTE nomes (applied/skipped) — nunca valores.
export function applyEnv(parsed, target = process.env, { override = false } = {}) {
  const applied = [], skipped = [];
  for (const [k, v] of Object.entries(parsed || {})) {
    const present = Object.prototype.hasOwnProperty.call(target, k) && target[k] !== undefined && target[k] !== "";
    if (present && !override) { skipped.push(k); continue; } // env vence
    target[k] = String(v);
    applied.push(k);
  }
  return { applied, skipped };
}

// Entry helper: localiza <root>/.env (independente do cwd) e carrega com precedência do ambiente.
// Retorna um resumo SANITIZADO (apenas NOMES; nunca valores). Ausência do arquivo é normal (loaded:false).
export function loadProjectEnv({ root = projectRoot(), file = ENV_FILE, target = process.env, override = false } = {}) {
  const full = path.join(root, file);
  let content = null;
  try { content = fs.readFileSync(full, "utf8"); } catch { /* arquivo ausente é aceitável */ }
  if (content === null) return { loaded: false, path: full, applied: [], skipped: [], keys: [] };
  const parsed = parseEnvContent(content);
  const { applied, skipped } = applyEnv(parsed, target, { override });
  return { loaded: true, path: full, applied, skipped, keys: Object.keys(parsed) }; // keys = NOMES apenas
}
