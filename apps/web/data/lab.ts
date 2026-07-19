// Typed contracts for the M5 Lab — mirrors the Go structs in services/core/internal/server/lab_*.go.

// NOTE: the wire pod (core k8s.Pod) is additive-only and now also carries
// ready/restarts/image/requests/limits (Sprint H P1) — extend here as the UI needs them.
export type ChaosPod = { name: string; phase: string; ageSeconds: number };
export type ChaosStatus = { desired: number | null; ready: number | null; pods: ChaosPod[] };
export type ChaosKill = { killed: string; at: string };

export type LoadBucket = { ms: number; count: number };
export type LoadHistogram = {
  buckets: LoadBucket[];
  total: number;
  errors: number;
  p50: number;
  p95: number;
  p99: number;
  rps: number;
  elapsedMs: number;
};

export type LabEvent = { kind: string; ts: string; detail?: string }; // P6
export type RateLimitSnapshot = { rps: number; burst: number; activeBuckets: number; denied: number }; // P6

export type LabError = { error: string };

// DB explorer (Sprint H) — allowlisted queries against the disposable demo-ns toy postgres.
export type DbQuery = { id: string; title: string; sql: string; note: string };
export type DbRunResult = {
  id: string;
  columns: string[];
  rows: string[][];
  rowsCapped: boolean;
  plan: PlanRoot[] | null; // EXPLAIN (ANALYZE, FORMAT JSON) output — [{ Plan: {...} }]
  execMs: number;
  timedOut: boolean;
};
// The subset of postgres plan-node fields the tree renders (the JSON carries many more).
export type PlanNode = {
  "Node Type": string;
  "Actual Total Time"?: number; // per-loop (EXPLAIN semantics) — the UI shows ×N loops when > 1
  "Actual Rows"?: number;
  "Actual Loops"?: number;
  "Index Name"?: string;
  "Relation Name"?: string;
  Plans?: PlanNode[];
};
export type PlanRoot = { Plan: PlanNode; "Execution Time"?: number; "Planning Time"?: number };

// API-playground allowlist — fixed read-only GET paths (method is never a caller field → SSRF-safe).
export type ApiEndpoint = { label: string; path: string; note: string };
export const PLAYGROUND_ENDPOINTS: readonly ApiEndpoint[] = [
  { label: "version", path: "/api/version", note: "build sha + version" },
  { label: "status", path: "/api/status", note: "live platform metrics" },
  { label: "uptime", path: "/api/uptime", note: "probe / incident history" },
  { label: "deploys", path: "/api/deploys", note: "recent deploy events" },
];

// Safe sandbox shell (POST /api/lab/shell) — mirrors services/core/internal/shell.Result. Output is
// server-produced plain text (the client renders it as textContent, never HTML).
export type ShellResult = { output: string; cwd: string; cleared: boolean };

// API-playground demo-token + pagination (Sprint M P3) — mirrors services/core/internal/server/lab_demo.go.
// The token is an EPHEMERAL demo key (not real auth); the events are a clearly-labeled SYNTHETIC dataset.
export type DemoToken = { token: string; expiresAt: string; tokenType: string; note?: string };
export type DemoEvent = { id: number; ref: string; kind: string; note: string; ts: string };
// nextCursor is `string | null` — null (never "") means no further page (Load-more hides on it).
export type DemoEventsPage = { items: DemoEvent[]; nextCursor: string | null; total: number; limit: number };
