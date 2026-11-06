// SecurityAuditor — Web Runtime capability contracts (H1a-F1).
// Stable, backend-agnostic types. The HTTP Inspection backend implements the
// static-HTTP subset; future backends (Playwright, CDP, Chrome DevTools MCP,
// Caido) implement the SAME contract and may light up the visual capabilities
// that are explicitly UNAVAILABLE here.

/** Capability descriptor for a backend. Visual caps are false in static-HTTP. */
export interface Capabilities {
  /** Issue HTTP/HTTPS requests. */
  http_request: boolean;
  /** Read status line + response headers. */
  headers: boolean;
  /** Follow redirects under scope re-validation. */
  redirects: boolean;
  /** Retrieve STATIC HTML (not executed, not a rendered DOM). */
  static_html: boolean;
  /** Record network metadata (timing, bytes, redirect chain). */
  network_metadata: boolean;
  /** Identify resources referenced by the static HTML (links/scripts/forms). */
  referenced_resources: boolean;
  /** Persist sanitized evidence artifacts. */
  evidence_record: boolean;
  /** Rendered DOM after JS execution. UNAVAILABLE in static-HTTP (always false). */
  dom_rendered: boolean;
  /** Screenshots. UNAVAILABLE in static-HTTP (always false). */
  screenshot: boolean;
  /** JavaScript execution. UNAVAILABLE in static-HTTP (always false). */
  javascript: boolean;
  /** User interaction (click/type/scroll). UNAVAILABLE in static-HTTP (always false). */
  interaction: boolean;
}

/** Operational limits enforced by a backend. */
export interface Limits {
  /** Max bytes read per response body before truncation. */
  maxBytes: number;
  /** Max redirect hops followed. */
  maxRedirects: number;
  /** Max total HTTP transactions per inspect() call (initial + redirects). */
  maxRequests: number;
  /** Per-request timeout in milliseconds. */
  timeoutMs: number;
}

/** Scope authorization (Rule 0). Allowlist-first; internal destinations blocked. */
export interface Scope {
  /** Allowed hosts. Exact, or leading-dot suffix (".example.com" matches sub.example.com). */
  allowHosts: string[];
  /** Allowed exact URLs (origin+path), in addition to allowHosts. */
  allowUrls?: string[];
  /** When true, permits private/internal destinations IF also allowlisted. Default false. */
  allowPrivate?: boolean;
}

export interface HttpRequest {
  url: string;
  method?: "GET" | "HEAD";
  /** Request headers. Sensitive values are redacted from all stored/returned evidence. */
  headers?: Record<string, string>;
}

/** Single-hop transport. Injectable for testing (mocks); default uses node:http(s). */
export type Transport = (
  url: string,
  opts: { method: string; headers: Record<string, string>; signal?: AbortSignal; maxBytes: number; timeoutMs: number }
) => Promise<TransportResponse>;

export interface TransportResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  bytesRead: number;
  truncated: boolean;
}

export interface RequestContext {
  scope: Scope;
  limits?: Partial<Limits>;
  signal?: AbortSignal;
  /** Injected transport (tests). Omit to use the default node transport. */
  transport?: Transport;
}

export interface RedirectHop {
  from: string;
  to: string;
  status: number;
}

export interface OpenResult {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  /** Header values with sensitive entries redacted. */
  headers: Record<string, string>;
  redirectChain: RedirectHop[];
  /** Raw STATIC body text (capped at maxBytes). Never a rendered DOM. */
  body: string;
  bytesRead: number;
  truncated: boolean;
  elapsedMs: number;
}

export interface ReferencedResource {
  type: "script" | "stylesheet" | "image" | "anchor" | "form" | "iframe";
  url: string;
  /** True if resolved to an absolute URL against finalUrl. */
  absolute: boolean;
}

export interface NetworkMeta {
  requests: number;
  redirectChain: RedirectHop[];
  bytesRead: number;
  truncated: boolean;
  elapsedMs: number;
  status: number;
}

/** Result of http.inspect — explicitly a STATIC view, never a rendered DOM. */
export interface Inspection {
  backend: string;
  kind: "static-http";
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  /** Static, unexecuted HTML. Labeled distinctly from any DOM. */
  staticHtml: string;
  references: ReferencedResource[];
  network: NetworkMeta;
  /** Always null here: no rendered DOM is available in static-HTTP. */
  dom: null;
  /** Always false: static HTML is not a rendered DOM. */
  rendered: false;
  /** Always null here: screenshots unavailable. */
  screenshot: null;
}

export interface EvidenceRecord {
  path: string;
  sha256: string;
  sanitized: true;
  summary: { finalUrl: string; status: number; bytesRead: number; references: number };
}

export interface Backend {
  id: string;
  kind: string;
  capabilities: Capabilities;
  limits: Limits;
  open(request: HttpRequest, ctx: RequestContext): Promise<OpenResult>;
  inspect(request: HttpRequest, ctx: RequestContext): Promise<Inspection>;
  headers(request: HttpRequest, ctx: RequestContext): Promise<{ finalUrl: string; status: number; headers: Record<string, string>; redirectChain: RedirectHop[] }>;
}

export interface ProbeResult {
  id: string;
  kind: string;
  available: boolean;
  capabilities: Capabilities;
  limits: Limits;
}

// ---- H1b-F1: Multi-Session Runtime ---------------------------------------
// Identifiers are DISTINCT and opaque. Credentials/tokens are NEVER returned.
export type IdentityKind = "owner" | "cross-user" | "noauth";

/** Model-visible identity view. Carries NO secret (no cookie/token/storageState). */
export interface IdentityView {
  principalId: string;   // opaque "pr-..."
  kind: IdentityKind;
  label: string;
  createdAt: string;
  hasAuthState: boolean; // whether sealed auth state exists — not the state itself
}

/** Per-session limits (extends navigation limits with a wall-clock budget). */
export interface SessionLimits {
  navTimeoutMs: number;
  actionTimeoutMs: number;
  maxActions: number;
  maxScreenshotBytes: number;
  maxNetworkEntries: number;
  maxDurationMs: number;
}

/** Result of session.create — opaque references only. */
export interface SessionRef {
  sessionId: string;   // opaque "br-..."
  principalId: string; // opaque "pr-..."
  contextId: string;   // opaque "ctx-..." (one isolated BrowserContext)
  kind: IdentityKind;
  visual: boolean;     // true for a real browser-backed session
  authenticated: boolean; // true only when created from sealed auth state
}

/** session.status — operational snapshot; NO secret fields. */
export interface SessionStatus {
  sessionId: string;
  principalId: string;
  contextId: string;
  kind: IdentityKind;
  authenticated: boolean;
  closed: boolean;
  actions: number;
  networkEntries: number;
  consoleMessages: number;
  ageMs: number;
  limits: SessionLimits;
  lastUrl: string | null;
}

/** A request routed to a specific session (session.request). */
export interface SessionRequest {
  op: "navigate" | "open" | "snapshot" | "screenshot" | "click" | "fill" | "network" | "console" | "actionLog";
  url?: string;
  locator?: Record<string, string>;
  value?: string;
  dir?: string;
}

/** The 8 capabilities of the Multi-Session Runtime. */
export interface SessionManagerContract {
  create(opts: { scope: Scope; principal?: string; kind?: IdentityKind; label?: string; limits?: Partial<SessionLimits>; evidenceDir?: string; signal?: AbortSignal }): Promise<SessionRef>;
  get(sessionId: string): (SessionRef & { closed: boolean; actions: number }) | null;
  list(): Array<SessionRef & { closed: boolean; actions: number }>;
  status(sessionId: string): SessionStatus;
  bindIdentity(sessionId: string, opts: { principal?: string; kind?: IdentityKind; label?: string; captureAuthState?: boolean }): Promise<{ sessionId: string; principalId: string; kind: IdentityKind; captured: boolean }>;
  request(sessionId: string, req: SessionRequest): Promise<unknown>;
  close(sessionId: string): Promise<{ closed: boolean; sessionId?: string; actions?: number }>;
  closeAll(): Promise<{ closedSessions: number }>;
}

// ---- H1b-F2: Authorization Matrix ----------------------------------------
export type ResourceClassification = "private" | "public" | "shared" | "admin" | "unknown";
export type ExpectOutcome = "allow" | "deny" | "unknown";
/** Where an authorization expectation comes from — never silently inferred. */
export type ExpectOrigin = "documented-policy" | "lab-fixture" | "approved-premise" | null;
export type AuthzClassification = "conforme" | "anomalia-de-autorizacao" | "violacao-confirmada" | "inconclusivo";

export interface ResourceSpec {
  label?: string;
  request: { method?: string; url: string; body?: string | null; stateChanging?: boolean };
  classification?: ResourceClassification;
  ownerPrincipalId?: string | null;   // evidence of legitimate ownership
  ownershipMarker?: string | null;     // lab-fixture proof string; NEVER echoed into results
  sharedWith?: string[];               // EXPLICIT legitimate sharing only (never inferred)
  expectScopeBlock?: boolean;
}

export interface AuthzExpectation { outcome: ExpectOutcome; origin: ExpectOrigin; }

export interface MatrixCase {
  caseId: string;
  resourceId: string;
  sessionId: string;
  methodOverride?: string;
  bodyOverride?: string | null;
  expected?: AuthzExpectation;
  authorizedStateChange?: boolean; // required to execute a state-changing resource
}

/** Normalized structure — KEYS only, never values (safe cross-principal diffing). */
export interface NormalizedShape { kind: "json" | "text" | "none"; keys?: string[]; hash?: string; bytes?: number; }

/** Sanitized matrix result — correlation ids + metadata + structure; NO raw body/secret. */
export interface MatrixResult {
  caseId: string;
  principalId: string | null;
  sessionId: string;
  contextId: string | null;
  resourceId: string;
  requestId: string | null;
  method?: string;
  status?: number | null;
  contentType?: string;
  expected: AuthzExpectation;
  classification: AuthzClassification;
  rationale: string;
  confirmedBy?: string[];
  evidence?: { shape: NormalizedShape; bytes: number; ownershipEvidence: boolean; scopeBlocked: boolean; error: string | null };
  executed?: boolean;
}

export interface AuthorizationMatrixContract {
  run(cases: MatrixCase[], opts?: { signal?: AbortSignal }): Promise<{ results: MatrixResult[]; summary: Record<AuthzClassification, number> }>;
  summary(): Record<AuthzClassification, number>;
  compareByResource(resourceId: string): Array<{ caseId: string; principalId: string | null; status?: number | null; shapeHash?: string; keys: string[]; classification: AuthzClassification }>;
}

// ---- H1c-F1: Concurrent Execution Foundation -----------------------------
export type OpState = "ok" | "failed" | "timeout" | "cancelled" | "blocked";
export type ExperimentState = "prepared" | "running" | "done" | "cancelled";

export interface ConcurrentLimits {
  maxConcurrency: number;  // conservative default: 2
  maxOps: number;          // per experiment
  opTimeoutMs: number;     // individual (in-page fetch abort)
  globalTimeoutMs: number; // whole experiment
}

/** A concurrent operation declaration. Uses the session's authenticated channel — cookies/
 *  tokens stay sealed in the BrowserContext (never extracted). */
export interface ConcurrentOp {
  operationId?: string;
  principalId?: string;    // bound at prepare from the session
  sessionId: string;
  method?: string;
  url: string;             // resource target (Scope Guard enforced)
  body?: string | null;
  policy?: { stateChanging?: boolean };
  authorizedStateChange?: boolean; // required for state-changing ops
  timeoutMs?: number;
}

export interface ConcurrentExperiment {
  experimentId?: string;
  operations: ConcurrentOp[];
  limits?: Partial<ConcurrentLimits>;
}

/** Prepared operation view — no body echoed; carries validity + block reason. */
export interface PreparedOp {
  operationId: string; sessionId: string; principalId: string | null;
  method: string; url: string; hasBody: boolean; timeoutMs: number | null;
  valid: boolean; blockReason: string | null;
}

/** Sanitized per-op result — timings + status; NO response body stored. */
export interface ConcurrentOpResult {
  operationId: string; principalId: string | null; sessionId: string;
  method: string; url: string; requestId: string | null;
  status: number | null; ok: boolean; latencyMs: number | null;
  startedAt: number | null; endedAt: number | null;
  error: string | null; blockReason: string | null; state: OpState;
}

export interface ConcurrentReport {
  experimentId: string; state: ExperimentState;
  results: ConcurrentOpResult[];
  summary: Record<OpState, number>;
  timings: { preparedAt: number; barrierReleasedAt: number | null; finishedAt: number | null };
}

/** The 4 capabilities. Deterministic in COORDINATION; does NOT promise simultaneous arrival. */
export interface ConcurrentExecutorContract {
  prepare(experiment: ConcurrentExperiment): { experimentId: string; state: ExperimentState; limits: ConcurrentLimits; operations: PreparedOp[] };
  run(prepared: string | { experimentId: string }, opts?: { signal?: AbortSignal }): Promise<ConcurrentReport>;
  cancel(experimentId: string | { experimentId: string }): { cancelled: boolean; experimentId?: string };
  status(experimentId: string | { experimentId: string }): { experimentId: string; state: ExperimentState; total: number; byState: Record<OpState, number>; preparedAt: number; barrierReleasedAt: number | null; finishedAt: number | null } | null;
}

// ---- H1c-F2: Stateful Race & TOCTOU Validation ---------------------------
export type RaceClass = "conforme" | "anomalia" | "violacao-observada" | "violacao-reproduzida" | "inconclusivo";
export type RuleSource = "documented-policy" | "lab-fixture" | "approved-premise";

/** A declared invariant (NEVER invented by the agent): a comparator over a state field, or a
 *  predicate supplied by the experiment author. Evaluated over AUTHORITATIVE state only. */
export interface Invariant {
  field?: string;
  op?: "<=" | "<" | "==" | ">=" | ">" | "!=";
  value?: number | string | boolean;
  assert?: (initialState: Record<string, unknown>, finalState: Record<string, unknown>) => boolean;
  description?: string;
}

export interface StatefulExperiment {
  experimentId?: string;
  observerSessionId: string;          // authoritative-oracle reader + reset driver
  hypothesis: string;                 // vulnerability hypothesis
  expectedRule: { description: string; source: RuleSource }; // ESTABLISHED rule + its origin
  requiredInitialState: Record<string, unknown>;             // must be PROVEN or no run
  operations: ConcurrentOp[];         // concurrent ops (ConcurrentExecutor format)
  invariant: Invariant;               // declared; evaluated, never invented
  observe: { stateUrl: string; fields: string[] };           // authoritative observation source
  reset: { url: string };             // reversible reset procedure (verified)
  attempts?: number;                  // repetition limit (reproducibility), capped
  limits?: Partial<ConcurrentLimits>;
}

export interface RaceAttemptResult {
  attempt: number;
  state: "conforme" | "anomalia" | "violacao" | "inconclusivo";
  executed: boolean;
  reason?: string;
  observed?: { initial?: Record<string, unknown>; final?: Record<string, unknown>; opsSummary?: Record<OpState, number> }; // DIRECTLY observed
  derived?: { invariantHeld: boolean; stateChanged: boolean; violation: boolean };                                         // agent-derived
  resetVerified?: boolean;
  resetFailed?: boolean;
}

export interface RaceReport {
  experimentId: string;
  hypothesis: string;
  rule: { description: string; source: RuleSource | null };
  classification: RaceClass;
  rationale: string;
  attempts: RaceAttemptResult[];
  summary: { attemptsTotal: number; validAttempts: number; violations: number; anomalies: number; reproduced: boolean; variability: number };
  contaminated: boolean;
  evidenceNote: string; // separates directly-observed evidence from agent inferences
}

export interface StatefulRaceValidatorContract {
  run(experiment: StatefulExperiment, opts?: { signal?: AbortSignal }): Promise<RaceReport>;
}

// ---- H1d-F1: Capability Bridge -------------------------------------------
export type BridgeCapability = "capabilities" | "http" | "sessions" | "browser" | "authorization" | "concurrent" | "race";

/** A single per-action approval, supplied by the ADAPTER (operator), never by the LLM. */
export interface BridgeApproval { op: string | null; url: string | null; }

/**
 * Trusted Execution Context. Produced by the adapter (operator/dispatcher), NOT the agent.
 * Carries the authorized scope, the capabilities the investigation may use, operational limits
 * and the per-action approvals for sensitive (state-changing) operations.
 */
export interface ExecutionContext {
  investigationId: string;
  scope: Scope;                          // Rule 0 allowlist (Scope Guard enforces)
  allowedCapabilities: BridgeCapability[];
  limits?: Partial<Limits>;
  approvals?: BridgeApproval[];
  operationalSessionId?: string | null;
}

/** The single typed entrypoint request. The agent supplies only these — never scope/approvals. */
export interface BridgeRequest {
  investigationId?: string;              // omitted only for capabilities.* discovery
  op: string;                            // a key of BRIDGE_OPS
  params?: Record<string, unknown>;
  operationId?: string;                  // for individual cancellation
}

/** Sanitized result envelope. `classification`, when present, is COPIED from the validator. */
export interface BridgeResult {
  ok: boolean;
  instanceId: string;                    // bridge process-instance id (stale ids are rejected)
  investigationId: string | null;
  op: string | null;
  capability?: BridgeCapability;
  result?: unknown;                      // sanitized (no bodies/cookies/tokens/storageState)
  classification?: string;               // verbatim from AuthZ/Race; bridge never writes one
  error?: { code: string; message: string };
}

export interface CapabilityBridgeContract {
  readonly instanceId: string;
  openInvestigation(ctx: ExecutionContext): { investigationId: string; instanceId: string; allowedCapabilities: BridgeCapability[] };
  invoke(request: BridgeRequest, opts?: { signal?: AbortSignal }): Promise<BridgeResult>;
  cancel(investigationId: string, operationId?: string): { cancelled: boolean; operationId?: string; aborted?: number; reason?: string };
  closeInvestigation(investigationId: string): Promise<{ closed: boolean; investigationId?: string; closedSessions?: number; reason?: string }>;
  shutdown(): Promise<{ closedInvestigations: number }>;
  visualAvailable(): Promise<boolean>;
}
