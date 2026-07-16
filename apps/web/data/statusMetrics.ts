import type { Status, StatusMetric } from "./status";
import type { Metric } from "../app/components/MetricPanel";

/* Shared /api/status → MetricPanel mapping — extracted from SystemDash (Sprint H P1) so the home
   console renders the SAME real numbers instead of its old hardcoded placeholders. Honest "—" on
   any metric the backend marks not-ok. */

export function clampPct(v: number | null, max: number): number {
  if (v == null || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, (v / max) * 100));
}

function fixed(m: StatusMetric, digits: number): string {
  return m.ok && m.value != null ? m.value.toFixed(digits) : "—";
}

export function statusToMetrics(s: Status): Metric[] {
  const m = s.metrics;
  const errPct = m.errorRate.ok && m.errorRate.value != null ? m.errorRate.value * 100 : null;
  return [
    { k: "req/s", v: fixed(m.reqPerSec, 2), pct: clampPct(m.reqPerSec.value, 20) },
    { k: "p99 latency", v: m.p99Ms.ok ? `${fixed(m.p99Ms, 1)} ms` : "—", pct: clampPct(m.p99Ms.value, 200) },
    { k: "error rate", v: errPct != null ? `${errPct.toFixed(2)}%` : "—", pct: clampPct(errPct, 5) },
    { k: "web cpu", v: m.cpuCores.ok ? `${fixed(m.cpuCores, 3)} cores` : "—", pct: clampPct(m.cpuCores.value, 1) },
    { k: "web mem", v: m.memMiB.ok ? `${fixed(m.memMiB, 0)} MiB` : "—", pct: clampPct(m.memMiB.value, 384) },
  ];
}
