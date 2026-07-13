// Types for the P6 observability surfaces (mirror services/core JSON EXACTLY).
// metrics-history = Grafana-on-display; logs = redacted Loki-on-display; trace = per-visitor real path.

export type Point = { t: number; v: number }; // t = unix seconds, v = value

export type MetricsHistory = {
  source: "prometheus" | "unavailable";
  ts: string;
  series: { reqPerSec: Point[]; cpuCores: Point[]; memMiB: Point[] };
};

export const EMPTY_HISTORY: MetricsHistory = {
  source: "unavailable",
  ts: "",
  series: { reqPerSec: [], cpuCores: [], memMiB: [] },
};

// Which series to draw, in order, with display metadata. `digits`/`unit` format the latest value.
export const HISTORY_PANELS: { key: keyof MetricsHistory["series"]; label: string; unit: string; digits: number }[] = [
  { key: "reqPerSec", label: "req/s", unit: "", digits: 2 },
  { key: "cpuCores", label: "web cpu", unit: "cores", digits: 3 },
  { key: "memMiB", label: "web mem", unit: "MiB", digits: 0 },
];

export type LogLine = { ts: string; ns: string; pod: string; container: string; level: string; msg: string };
export type LogsResponse = { lines: LogLine[]; source: "loki" | "unavailable" };

export type TraceHop = { name: string; detail: string; ms: number | null; measured: boolean };
export type RequestTrace = { hops: TraceHop[]; edge: { colo: string; country: string }; requestId: string };
