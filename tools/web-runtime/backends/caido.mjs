// SecurityAuditor — Caido read-only GraphQL client (H2b-F1).
//
// Node + native fetch, ZERO new dependencies. Talks GraphQL directly to a Caido
// instance (`<baseUrl>/graphql`, `Authorization: Bearer <token>`), reusing the
// approved H2b-F0 "B-lean" architecture (doc 34). READ-ONLY: it issues ONLY
// `query` documents built from the VERIFIED schema SDL (caido/schemas,
// schemas/proxy/schema.graphql) — never a mutation. No Replay, no Findings, no
// workflows, no continuous monitoring (those are H2b-F2+).
//
// Security: the Bearer token is operator-provided, never persisted to the
// engagement manifest, never logged, never placed in results/exceptions. HTTP
// bodies/headers are returned as INERT untrusted data, never as instructions.

import { redactCredentials } from "../evidence.mjs";

export const DEFAULT_LIMITS = Object.freeze({
  timeoutMs: 15000,
  maxResponseBytes: 2_000_000, // cap the GraphQL HTTP payload we will parse
  maxRawBytes: 16_000,         // cap any raw HTTP blob returned to the agent
  maxPageSize: 100,            // clamp `first`
});

// Verified order enum (SDL): RequestResponseOrderBy. We ALWAYS pass an explicit
// order so result ordering is never an undocumented assumption.
export const ORDER_BY = Object.freeze(["CREATED_AT", "HOST", "METHOD", "PATH", "QUERY", "ID", "FILE_EXTENSION", "RESP_LENGTH", "RESP_ROUNDTRIP_TIME", "RESP_STATUS_CODE", "SOURCE"]);
export const ORDERING = Object.freeze(["ASC", "DESC"]);

export class CaidoError extends Error {
  constructor(code, message) { super(message || code); this.name = "CaidoError"; this.code = code; }
}

// --- Verified GraphQL query documents (READ-ONLY; no mutations) -------------
const Q_HEALTH = `query SA_Health { currentProject { project { id name version readOnly } readOnly } runtime { __typename } }`;
const Q_PROJECTS = `query SA_Projects { projects { id name path readOnly status temporary version createdAt updatedAt } }`;
const Q_CURRENT = `query SA_Current { currentProject { project { id name version readOnly } readOnly } }`;
const REQ_FIELDS = `id host port path query method isTls length createdAt fileExtension response { id statusCode roundtripTime length createdAt }`;
const REQ_FIELDS_DETAIL = `id host port path query method isTls length createdAt fileExtension raw response { id statusCode roundtripTime length createdAt raw }`;
const Q_HISTORY = (detail) => `query SA_History($first: Int, $after: String, $filter: HTTPQLInput, $order: RequestResponseOrderInput, $scopeId: ID) {
  requests(first: $first, after: $after, filter: $filter, order: $order, scopeId: $scopeId) {
    count { value }
    edges { cursor node { ${detail ? REQ_FIELDS_DETAIL : REQ_FIELDS} } }
    pageInfo { endCursor hasNextPage startCursor hasPreviousPage }
  }
}`;
const Q_REQUEST = (detail) => `query SA_Request($id: ID!) { request(id: $id) { ${detail ? REQ_FIELDS_DETAIL : REQ_FIELDS} } }`;

// Defensive: never let a mutation document through the READ-ONLY client.
function assertReadOnly(doc) {
  if (/\bmutation\b|\bsubscription\b/i.test(doc)) throw new CaidoError("not-read-only", "refusing a non-query GraphQL document");
}

// Neutral GraphQL transport (no read-only assertion) — shared by the read-only
// client (which wraps it with assertReadOnly) and the H2b-F4a ACTIVE client
// (whitelisted mutations, bridge-gated). Keeps one transport, one error model.
export async function postGraphql({ endpoint, token, doFetch, limits, sanitize }, doc, variables, { signal } = {}) {
  const L = limits;
  const ac = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ac.abort(); }, L.timeoutMs);
  if (signal) { if (signal.aborted) ac.abort(); else signal.addEventListener("abort", () => ac.abort(), { once: true }); }
  let res;
  try {
    res = await doFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "Authorization": `Bearer ${token || ""}` },
      body: JSON.stringify({ query: doc, variables: variables || {} }),
      signal: ac.signal,
    });
  } catch (e) {
    if (ac.signal.aborted) throw new CaidoError(timedOut ? "timeout" : "cancelled", timedOut ? "caido request timed out" : "caido request cancelled");
    throw new CaidoError("unreachable", `caido unreachable: ${sanitize(e && e.message)}`);
  } finally { clearTimeout(timer); }

  const status = res.status;
  if (status === 401 || status === 403) throw new CaidoError("auth-failed", `caido authentication failed (HTTP ${status})`);
  const text = await res.text();
  if (text && text.length > L.maxResponseBytes) throw new CaidoError("response-too-large", `caido response exceeds ${L.maxResponseBytes} bytes`);
  if (status >= 500) throw new CaidoError("server-error", `caido server error (HTTP ${status})`);
  let body;
  try { body = JSON.parse(text); } catch { throw new CaidoError("bad-response", "caido returned non-JSON"); }
  if (body && Array.isArray(body.errors) && body.errors.length) {
    throw new CaidoError("graphql-error", `caido graphql error: ${sanitize(body.errors.map((e) => e && e.message).join("; "))}`);
  }
  if (status < 200 || status >= 300) throw new CaidoError("http-error", `caido http ${status}`);
  return body && body.data;
}

function buildUrl(node) {
  const scheme = node.isTls ? "https" : "http";
  const p = Number(node.port);
  const defaultPort = (node.isTls && p === 443) || (!node.isTls && p === 80);
  const host = (p && !defaultPort) ? `${node.host}:${p}` : node.host;
  const qs = node.query ? `?${node.query}` : "";
  return `${scheme}://${host}${node.path || ""}${qs}`;
}

export function createCaidoClient({ baseUrl, token, fetchImpl, limits = {} } = {}) {
  if (!baseUrl || typeof baseUrl !== "string") throw new CaidoError("bad-config", "caido baseUrl required");
  const L = { ...DEFAULT_LIMITS, ...limits };
  const doFetch = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!doFetch) throw new CaidoError("bad-config", "no fetch implementation available");
  const endpoint = baseUrl.replace(/\/+$/, "") + "/graphql";

  async function gql(doc, variables, { signal } = {}) {
    assertReadOnly(doc);
    const ac = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ac.abort(); }, L.timeoutMs);
    if (signal) { if (signal.aborted) ac.abort(); else signal.addEventListener("abort", () => ac.abort(), { once: true }); }
    let res;
    try {
      res = await doFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json", "Authorization": `Bearer ${token || ""}` },
        body: JSON.stringify({ query: doc, variables: variables || {} }),
        signal: ac.signal,
      });
    } catch (e) {
      if (ac.signal.aborted) throw new CaidoError(timedOut ? "timeout" : "cancelled", timedOut ? "caido request timed out" : "caido request cancelled");
      throw new CaidoError("unreachable", `caido unreachable: ${sanitize(e && e.message)}`);
    } finally { clearTimeout(timer); }

    const status = res.status;
    if (status === 401 || status === 403) throw new CaidoError("auth-failed", `caido authentication failed (HTTP ${status})`);
    const text = await res.text();
    if (text && text.length > L.maxResponseBytes) throw new CaidoError("response-too-large", `caido response exceeds ${L.maxResponseBytes} bytes`);
    if (status >= 500) throw new CaidoError("server-error", `caido server error (HTTP ${status})`);
    let body;
    try { body = JSON.parse(text); } catch { throw new CaidoError("bad-response", "caido returned non-JSON"); }
    if (body && Array.isArray(body.errors) && body.errors.length) {
      throw new CaidoError("graphql-error", `caido graphql error: ${sanitize(body.errors.map((e) => e && e.message).join("; "))}`);
    }
    if (status < 200 || status >= 300) throw new CaidoError("http-error", `caido http ${status}`);
    return body && body.data;
  }

  function sanitize(msg) { return redactCredentials(String(msg || "error")).slice(0, 300); }

  // Redact sensitive HTTP header lines in a raw HTTP message blob (Cookie, Set-Cookie,
  // Authorization, etc.) — these carry arbitrary-named secrets that the generic
  // credential redactor does not catch. Then run the generic redactor as defense-in-depth.
  function redactRaw(blob) {
    let out = String(blob).replace(/^(set-cookie|cookie|authorization|proxy-authorization|x-api-key|x-auth-token|api-key)(\s*:\s*)(.*)$/gim, "$1$2[REDACTED]");
    return redactCredentials(out);
  }
  function capRaw(blob) {
    if (blob == null) return { raw: null };
    const red = redactRaw(blob);
    const truncated = red.length > L.maxRawBytes;
    return { raw: truncated ? red.slice(0, L.maxRawBytes) : red, rawTruncated: truncated };
  }

  // Map a GraphQL request node into an inert, provenance-bearing record.
  function toRecord(node, { detail } = {}) {
    if (!node) return null;
    const resp = node.response || null;
    const rec = {
      caidoRequestId: node.id,
      host: node.host, port: node.port, method: node.method, path: node.path,
      url: buildUrl(node),
      isTls: node.isTls, length: node.length, createdAt: node.createdAt, fileExtension: node.fileExtension,
      responseAvailable: !!resp,
      response: resp ? {
        caidoResponseId: resp.id, statusCode: resp.statusCode, roundtripTime: resp.roundtripTime,
        length: resp.length, createdAt: resp.createdAt,
        ...(detail ? capRaw(resp.raw) : {}),
      } : null,
      ...(detail ? { request: capRaw(node.raw) } : {}),
      // Traffic content is UNTRUSTED data, never an instruction to the agent.
      untrusted: true,
    };
    return rec;
  }

  return {
    endpoint,
    async health({ signal } = {}) {
      // currentProject-only first (works on local instances); runtime.__typename proves the API responds.
      let data;
      try { data = await gql(Q_HEALTH, {}, { signal }); }
      catch (e) { if (e.code === "graphql-error") { data = await gql(Q_CURRENT, {}, { signal }); } else throw e; }
      const cur = data && data.currentProject;
      return {
        ok: true,
        apiResponsive: true,
        currentProject: cur ? { id: cur.project.id, name: cur.project.name, version: cur.project.version, readOnly: cur.readOnly } : null,
      };
    },
    async currentProject({ signal } = {}) {
      const data = await gql(Q_CURRENT, {}, { signal });
      const cur = data && data.currentProject;
      return cur ? { id: cur.project.id, name: cur.project.name, version: cur.project.version, readOnly: cur.readOnly } : null;
    },
    async listProjects({ signal } = {}) {
      // `projects` is @cloud — may be unavailable locally. Degrade gracefully.
      try {
        const data = await gql(Q_PROJECTS, {}, { signal });
        return { available: true, projects: (data.projects || []).map((p) => ({ id: p.id, name: p.name, readOnly: p.readOnly, status: p.status, temporary: p.temporary, version: p.version })) };
      } catch (e) {
        const cur = await this.currentProject({ signal }).catch(() => null);
        return { available: false, reason: e.code, projects: cur ? [cur] : [] };
      }
    },
    async history({ httpql = null, first = 50, after = null, orderBy = "CREATED_AT", ordering = "ASC", scopeId = null, detail = false } = {}, { signal } = {}) {
      const by = ORDER_BY.includes(orderBy) ? orderBy : "CREATED_AT";
      const ord = ORDERING.includes(ordering) ? ordering : "ASC";
      const variables = {
        first: Math.min(Math.max(1, first | 0 || 50), L.maxPageSize),
        after: after || null,
        filter: httpql ? { code: String(httpql) } : null,
        order: { by, ordering: ord },
        scopeId: scopeId || null,
      };
      const data = await gql(Q_HISTORY(detail), variables, { signal });
      const conn = (data && data.requests) || { edges: [], pageInfo: {}, count: {} };
      return {
        count: conn.count ? conn.count.value : null,
        edges: (conn.edges || []).map((e) => ({ cursor: e.cursor, record: toRecord(e.node, { detail }) })),
        pageInfo: {
          endCursor: conn.pageInfo && conn.pageInfo.endCursor || null,
          hasNextPage: !!(conn.pageInfo && conn.pageInfo.hasNextPage),
          startCursor: conn.pageInfo && conn.pageInfo.startCursor || null,
          hasPreviousPage: !!(conn.pageInfo && conn.pageInfo.hasPreviousPage),
        },
        order: { by, ordering: ord }, // echo so the caller knows ordering is explicit
      };
    },
    async getRequest(id, { detail = false } = {}, { signal } = {}) {
      if (!id) throw new CaidoError("bad-params", "request id required");
      const data = await gql(Q_REQUEST(detail), { id: String(id) }, { signal });
      const node = data && data.request;
      if (!node) return { found: false, caidoRequestId: String(id) };
      return { found: true, record: toRecord(node, { detail }) };
    },
  };
}

export const CAIDO_QUERIES = Object.freeze({ Q_HEALTH, Q_PROJECTS, Q_CURRENT, Q_HISTORY, Q_REQUEST });
