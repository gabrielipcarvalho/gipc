// Typed contracts for the M5 Lab — mirrors the Go structs in services/core/internal/server/lab_*.go.

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
