/* Mirrors services/core's GET /api/status JSON EXACTLY. Metric.value is null when ok=false —
   the UI shows "—"/"unavailable" then, never a fake number. */
export type StatusMetric = { value: number | null; unit: string; ok: boolean };

export type StatusMetrics = {
  reqPerSec: StatusMetric;
  p99Ms: StatusMetric;
  errorRate: StatusMetric;
  cpuCores: StatusMetric;
  memMiB: StatusMetric;
};

export type Status = {
  source: "prometheus" | "unavailable";
  ts: string;
  metrics: StatusMetrics;
};

const na = (unit: string): StatusMetric => ({ value: null, unit, ok: false });

/* Fallback when core/Prometheus is unreachable — the page degrades honestly, never hard-fails. */
export const UNAVAILABLE_STATUS: Status = {
  source: "unavailable",
  ts: "",
  metrics: {
    reqPerSec: na("req/s"),
    p99Ms: na("ms"),
    errorRate: na("ratio"),
    cpuCores: na("cores"),
    memMiB: na("MiB"),
  },
};
