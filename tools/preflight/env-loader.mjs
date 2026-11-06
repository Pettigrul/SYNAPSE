// SecurityAuditor — local .env loader (config convenience, não é H2d-F2).
//
// Carrega configurações locais persistentes de `<repo>/.env` usando APENAS o suporte NATIVO do Node 22
// (`node:util` parseEnv) — SEM `dotenv`, SEM nova dependência. Objetivo: não exportar variáveis a cada
// sessão. Invariantes:
//   - PRECEDÊNCIA DO AMBIENTE: variáveis já definidas em `process.env` NUNCA são sobrescritas (env vence).
//   - RAIZ REAL DO PROJETO: o arquivo é localizado a partir da posição deste módulo, independente do cwd.
//   - SANITIZAÇÃO: as funções NUNCA imprimem/retornam VALORES — apenas NOMES de variáveis.
//   - MENOR PRIVILÉGIO: o .env é central e alcança qualquer projeto. Só a config comum conhecida é aplicada; todo o resto
//     (CAIDO_TOKEN, seletores ligados a um projeto, chaves desconhecidas) fica RETIDO, salvo liberação explícita. Lista de
//     permissão, não de bloqueio: um segredo com nome inesperado falha fechado.
//     Isso reduz exposição ambiente; NÃO é fronteira contra um agente com shell, que pode ler o arquivo.
//   - Não é gerenciador de segredos, não é nova arquitetura de config, e a presença do arquivo NÃO
//     autoriza operação alguma (autorização segue no Execution Context / policies — intocadas).
// Reutilizável por qualquer entry point: `import { loadProjectEnv } from ".../env-loader.mjs"`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { resolveProjectContext } from "../workspace/engagement.mjs";
import { statusActivation, caidoGuidance } from "../activation/activate.mjs";

export const ENV_FILE = ".env";
const COMMON_KEYS = new Set(["CAIDO_BASE_URL", "SA_ENGAGEMENT_ROOT", "SA_BROWSER_CHANNEL", "SA_STRIDE_ENABLED", "PI_AGENT_HOME", "PI_CODING_AGENT_DIR", "ANTIGRAVITY_HOME"]);
// Valem só para o harness central: apontam para um cliente, ou são integrações opcionais dele.
export const PROJECT_BOUND_KEYS = Object.freeze(["SA_ENGAGEMENT", "SA_SESSION_ID", "CAIDO_PROJECT_ID", "SA_EVIDENCE_DIR", "SECAUDIT_BRIDGE_CONTEXTS", "SECAUDIT_ENGAGEMENT_DIR", "GITHUB_MCP", "CONFLUENCE_MCP"]);
export const isRestrictedKey = (k) => !COMMON_KEYS.has(k);

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
// Chaves restritas fora de `allow` não são aplicadas e aparecem em `withheld`; já definidas no ambiente, seguem em `skipped`.
export function loadProjectEnv({ root = projectRoot(), file = ENV_FILE, target = process.env, override = false, allow = [] } = {}) {
  const full = path.join(root, file);
  let content = null;
  try { content = fs.readFileSync(full, "utf8"); } catch { /* arquivo ausente é aceitável */ }
  if (content === null) return { loaded: false, path: full, applied: [], skipped: [], keys: [], withheld: [] };
  const parsed = parseEnvContent(content);
  const withheld = [], usable = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (!isRestrictedKey(k) || allow.includes(k)) usable[k] = v;
    else if (target[k] && !override) usable[k] = v; // o ambiente vence: applyEnv registra em skipped, sem alterar
    else withheld.push(k);
  }
  const { applied, skipped } = applyEnv(usable, target, { override });
  return { loaded: true, path: full, applied, skipped, keys: Object.keys(parsed), withheld }; // keys = NOMES apenas
}

// O que este contexto pode receber do .env central. `need: ["caido"]` é declarado só pelo comando que usa o token: raiz do harness
// sempre; projeto ativado somente com a decisão do operador em CAIDO_OPT_INS (fora do projeto, por caminho real), marcador apontando
// para ESTE harness e links íntegros; fora disso, nunca. Nada no marcador autoriza. Protege contra o CONTEÚDO do projeto: um
// processo com shell deste usuário lê o .env e o arquivo de opt-in diretamente.
export function envAccess({ need = [], env = process.env, cwd = process.cwd() } = {}) {
  const ctx = resolveProjectContext({ env, cwd });
  const allow = ctx.kind === "harness" ? [...PROJECT_BOUND_KEYS] : [];
  let caidoDenied = null;
  if (need.includes("caido")) {
    if (ctx.kind === "harness") allow.push("CAIDO_TOKEN");
    else if (ctx.kind === "project") {
      const s = statusActivation({ projectDir: ctx.dir, home: projectRoot() });
      if (s.activated && s.caido && s.healthy) allow.push("CAIDO_TOKEN"); else caidoDenied = s.activated ? caidoGuidance(s) : s.help || "its activation marker is gone";
    } else caidoDenied = ctx.kind === "invalid-marker" ? statusActivation({ projectDir: ctx.dir, home: projectRoot() }).help : "this directory is neither the harness root nor an opted-in activated project";
  }
  return { allow, caidoDenied };
}

// Entrada das CLIs: respeita SA_SKIP_ENV_FILE e aplica a política de envAccess.
export function loadScopedEnv({ need = [], root = projectRoot(), target = process.env, env = process.env, cwd = process.cwd() } = {}) {
  const { allow, caidoDenied } = envAccess({ need, env, cwd });
  if (env.SA_SKIP_ENV_FILE) return { loaded: false, applied: [], skipped: [], keys: [], withheld: [], caidoDenied };
  return { ...loadProjectEnv({ root, target, allow }), caidoDenied };
}
