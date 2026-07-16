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

// API-playground allowlist — fixed read-only GET paths (method is never a caller field → SSRF-safe).
export type ApiEndpoint = { label: string; path: string; note: string };
export const PLAYGROUND_ENDPOINTS: readonly ApiEndpoint[] = [
  { label: "version", path: "/api/version", note: "build sha + version" },
  { label: "status", path: "/api/status", note: "live platform metrics" },
  { label: "uptime", path: "/api/uptime", note: "probe / incident history" },
  { label: "deploys", path: "/api/deploys", note: "recent deploy events" },
];
