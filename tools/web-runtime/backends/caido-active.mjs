// SecurityAuditor — Caido ACTIVE Testing Operations client (H2b-F4a).
//
// Supervised ACTIVE operations (Replay) + create (Findings) + read (Findings/Automate/Replay),
// built on the VERIFIED Caido GraphQL SDL (github.com/caido/schemas, proxy/schema.graphql).
// This client performs whitelisted MUTATIONS — it is NOT read-only — and is reachable ONLY
// through the bridge's `caido-active` capability, which gates each active op with an operator
// APPROVAL (never an LLM boolean) and a scope check. Reuses the F1 transport (postGraphql),
// the F1 error model (CaidoError) and the F1 redaction. Node stdlib only, ZERO new deps.
//
// IMPORTANT verified-schema facts (do NOT invent):
//   createReplaySession(input: CreateReplaySessionInput!): ... @cloud   // @cloud: may be unavailable on a non-cloud local instance
//   startReplayTask(sessionId: ID!): ... @cloud
//   CreateReplaySessionInput { collectionId, kind: ReplaySessionKind!, requestSource: RequestSourceInput, settings }
//   RequestSourceInput @oneOf { id: ID, raw: RequestRawInput{ connectionInfo: ConnectionInfoInput!, raw: Blob! } }
//   ConnectionInfoInput { SNI, host: String!, isTLS: Boolean!, port: Port! }   // <- the effective TARGET
//   replayEntry(id: ID!, sessionKind: ReplaySessionKind!): ReplayEntry   // ReplayEntryHttp { connection, raw, request{...response}, error }
//   createFinding(requestId: ID!, input: CreateFindingInput!): CreateFindingPayload!
//   CreateFindingInput { dedupeKey, description, reporter: String!, title: String! }
//   finding(id)/findings(filter:FilterClauseFindingInput{reporter}, order:FindingOrderInput)
//   automate*: READ ops only this round (automateSessions/automateSession); start/pause/etc OUT OF SCOPE.

import { postGraphql, CaidoError, DEFAULT_LIMITS } from "./caido.mjs";
import { redactCredentials } from "../evidence.mjs";

export const REPLAY_KINDS = Object.freeze(["HTTP", "HTTP_PIPELINE", "WS"]);

// Redact sensitive HTTP header lines (same policy as F1's redactRaw) + generic secret shapes.
const SENSITIVE_HEADER = /^(cookie|set-cookie|authorization|proxy-authorization|x-api-key|x-auth-token|api-key)\s*:/i;
function redactRaw(raw) {
  if (typeof raw !== "string") return raw;
  const out = raw.split(/\r?\n/).map((line) => (SENSITIVE_HEADER.test(line) ? line.replace(/:.*/s, ": [REDACTED]") : line)).join("\n");
  return redactCredentials(out);
}
function capRaw(blob, max) {
  if (typeof blob !== "string") return { raw: null, truncated: false, bytes: 0 };
  const bytes = blob.length;
  const red = redactRaw(blob);
  if (red.length > max) return { raw: red.slice(0, max), truncated: true, bytes };
  return { raw: red, truncated: false, bytes };
}

// --- GraphQL documents (verbatim operation/field names from the SDL) ---------
const M_CREATE_REPLAY = `mutation SA_CreateReplaySession($input: CreateReplaySessionInput!) {
  createReplaySession(input: $input) { error { __typename ... on PermissionDeniedUserError { __typename } } session { id __typename ... on ReplaySessionHttp { activeEntry { id } } } } }`;
const M_START_REPLAY = `mutation SA_StartReplayTask($sessionId: ID!) {
  startReplayTask(sessionId: $sessionId) { error { __typename } task { id createdAt sessionKind replayEntry { id } } } }`;
const Q_REPLAY_ENTRY = `query SA_ReplayEntry($id: ID!, $kind: ReplaySessionKind!) {
  replayEntry(id: $id, sessionKind: $kind) { __typename createdAt error id ... on ReplayEntryHttp { connection { host port isTLS } raw request { id host port path method isTls response { id statusCode roundtripTime length } } } } }`;
const Q_REPLAY_SESSIONS = `query SA_ReplaySessions($first: Int, $after: String) {
  replaySessions(first: $first, after: $after) { edges { cursor node { id name __typename } } pageInfo { endCursor hasNextPage } } }`;
const Q_FINDINGS = `query SA_Findings($first: Int, $after: String, $filter: FilterClauseFindingInput, $order: FindingOrderInput) {
  findings(first: $first, after: $after, filter: $filter, order: $order) { edges { cursor node { id title reporter host path dedupeKey hidden createdAt request { id host path method } } } pageInfo { endCursor hasNextPage } } }`;
const Q_FINDING = `query SA_Finding($id: ID!) {
  finding(id: $id) { id title reporter host path dedupeKey hidden description createdAt request { id host port path method isTls } } }`;
const M_CREATE_FINDING = `mutation SA_CreateFinding($requestId: ID!, $input: CreateFindingInput!) {
  createFinding(requestId: $requestId, input: $input) { error { __typename } finding { id title reporter host path dedupeKey createdAt } } }`;
const Q_AUTOMATE_SESSIONS = `query SA_AutomateSessions($first: Int, $after: String) {
  automateSessions(first: $first, after: $after) { edges { cursor node { id name connection { host port isTLS } createdAt } } pageInfo { endCursor hasNextPage } } }`;
const Q_AUTOMATE_SESSION = `query SA_AutomateSession($id: ID!) {
  automateSession(id: $id) { id name connection { host port isTLS } createdAt entries { id name createdAt } } }`;

export function createCaidoActiveClient({ baseUrl, token, fetchImpl, limits = {} } = {}) {
  if (!baseUrl) throw new CaidoError("bad-config", "caido baseUrl required");
  const L = { ...DEFAULT_LIMITS, ...limits };
  const endpoint = baseUrl.replace(/\/+$/, "") + "/graphql";
  const doFetch = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!doFetch) throw new CaidoError("bad-config", "no fetch implementation available");
  function sanitize(msg) { return redactCredentials(String(msg || "")).slice(0, 500); }
  const cfg = () => ({ endpoint, token, doFetch, limits: L, sanitize });
  const gql = (doc, vars, opts) => postGraphql(cfg(), doc, vars, opts);

  function replayEntryRecord(e) {
    if (!e) return null;
    const req = e.request || null;
    const resp = req && req.response ? req.response : null;
    const capped = capRaw(e.raw, L.maxRawBytes);
    return {
      replayEntryId: e.id, error: e.error || null, createdAt: e.createdAt || null,
      connection: e.connection ? { host: e.connection.host, port: e.connection.port, isTLS: !!e.connection.isTLS } : null,
      raw: capped.raw, rawTruncated: capped.truncated,
      request: req ? { id: req.id, host: req.host, port: req.port, path: req.path, method: req.method, isTls: !!req.isTls } : null,
      response: resp ? { id: resp.id, statusCode: resp.statusCode, roundtripTime: resp.roundtripTime, length: resp.length } : null,
      responseAvailable: !!resp,
    };
  }

  return {
    endpoint, limits: L,

    // ---- READ (findings / automate / replay) --------------------------------
    async listFindings({ reporter = null, first = 50, after = null, order = null } = {}, { signal } = {}) {
      const vars = { first: Math.min(first, L.maxPageSize), after, filter: reporter ? { reporter } : null, order };
      const data = await gql(Q_FINDINGS, vars, { signal });
      const conn = data && data.findings;
      const edges = (conn && conn.edges) || [];
      return { pageInfo: (conn && conn.pageInfo) || { endCursor: null, hasNextPage: false },
        findings: edges.map((e) => e.node).filter(Boolean).map((f) => ({ ...f, untrusted: true })) };
    },
    async getFinding(id, { signal } = {}) {
      if (!id) throw new CaidoError("bad-params", "finding id required");
      const data = await gql(Q_FINDING, { id }, { signal });
      const f = data && data.finding;
      return f ? { ...f, untrusted: true } : null;
    },
    async listReplaySessions({ first = 50, after = null } = {}, { signal } = {}) {
      const data = await gql(Q_REPLAY_SESSIONS, { first: Math.min(first, L.maxPageSize), after }, { signal });
      const conn = data && data.replaySessions;
      return { pageInfo: (conn && conn.pageInfo) || { endCursor: null, hasNextPage: false },
        sessions: ((conn && conn.edges) || []).map((e) => e.node).filter(Boolean) };
    },
    async getReplayEntry(id, kind = "HTTP", { signal } = {}) {
      if (!id) throw new CaidoError("bad-params", "replay entry id required");
      if (!REPLAY_KINDS.includes(kind)) throw new CaidoError("bad-params", `invalid replay kind: ${kind}`);
      const data = await gql(Q_REPLAY_ENTRY, { id, kind }, { signal });
      return replayEntryRecord(data && data.replayEntry);
    },
    async listAutomateSessions({ first = 50, after = null } = {}, { signal } = {}) {
      const data = await gql(Q_AUTOMATE_SESSIONS, { first: Math.min(first, L.maxPageSize), after }, { signal });
      const conn = data && data.automateSessions;
      return { pageInfo: (conn && conn.pageInfo) || { endCursor: null, hasNextPage: false },
        sessions: ((conn && conn.edges) || []).map((e) => e.node).filter(Boolean) };
    },
    async getAutomateSession(id, { signal } = {}) {
      if (!id) throw new CaidoError("bad-params", "automate session id required");
      const data = await gql(Q_AUTOMATE_SESSION, { id }, { signal });
      return data && data.automateSession;
    },

    // ---- ACTIVE: replay a request (by id, or modified raw+connection) --------
    // Returns the created session, started task and the resulting entry (with response).
    async replay({ requestId = null, kind = "HTTP", modifiedRaw = null, connection = null, settings = null } = {}, { signal } = {}) {
      if (!REPLAY_KINDS.includes(kind)) throw new CaidoError("bad-params", `invalid replay kind: ${kind}`);
      let requestSource;
      if (modifiedRaw != null) {
        if (!connection || !connection.host || typeof connection.isTLS !== "boolean" || connection.port == null) {
          throw new CaidoError("bad-params", "modified replay requires connection {host, isTLS, port}");
        }
        requestSource = { raw: { connectionInfo: { host: connection.host, isTLS: connection.isTLS, port: connection.port, ...(connection.SNI ? { SNI: connection.SNI } : {}) }, raw: modifiedRaw } };
      } else if (requestId) {
        requestSource = { id: requestId };
      } else {
        throw new CaidoError("bad-params", "replay requires requestId or (modifiedRaw + connection)");
      }
      const input = { kind, requestSource, ...(settings ? { settings } : {}) };
      const created = await gql(M_CREATE_REPLAY, { input }, { signal });
      const cr = created && created.createReplaySession;
      if (cr && cr.error) throw new CaidoError("replay-create-failed", `createReplaySession error: ${cr.error.__typename || "unknown"}`);
      const session = cr && cr.session;
      if (!session || !session.id) throw new CaidoError("replay-create-failed", "createReplaySession returned no session");

      const started = await gql(M_START_REPLAY, { sessionId: session.id }, { signal });
      const sr = started && started.startReplayTask;
      if (sr && sr.error) throw new CaidoError("replay-start-failed", `startReplayTask error: ${sr.error.__typename || "unknown"}`);
      const task = sr && sr.task;
      const entryId = task && task.replayEntry && task.replayEntry.id;
      let entry = null;
      if (entryId) entry = await this.getReplayEntry(entryId, kind, { signal });
      return {
        sessionId: session.id, taskId: task ? task.id : null, sessionKind: task ? task.sessionKind : kind,
        entry, responseAvailable: !!(entry && entry.responseAvailable),
      };
    },

    // ---- ACTIVE: create a finding (dedup-checked) ---------------------------
    async createFinding({ requestId, title, reporter, dedupeKey = null, description = null } = {}, { signal } = {}) {
      if (!requestId) throw new CaidoError("bad-params", "createFinding requires a requestId (identifiable evidence)");
      if (!title || !reporter) throw new CaidoError("bad-params", "createFinding requires title and reporter");
      // Dedup: if a finding with this dedupeKey already exists (same reporter), do not create a duplicate.
      if (dedupeKey) {
        const existing = await this.listFindings({ reporter, first: L.maxPageSize }, { signal });
        const hit = existing.findings.find((f) => f.dedupeKey === dedupeKey);
        if (hit) return { created: false, duplicate: true, finding: hit };
      }
      const input = { title, reporter, ...(dedupeKey ? { dedupeKey } : {}), ...(description ? { description } : {}) };
      const data = await gql(M_CREATE_FINDING, { requestId, input }, { signal });
      const payload = data && data.createFinding;
      if (payload && payload.error) throw new CaidoError("finding-create-failed", `createFinding error: ${payload.error.__typename || "unknown"}`);
      const finding = payload && payload.finding;
      if (!finding || !finding.id) throw new CaidoError("finding-create-failed", "createFinding returned no finding");
      return { created: true, duplicate: false, finding: { ...finding, untrusted: true } };
    },
  };
}
