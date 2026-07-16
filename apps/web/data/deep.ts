import type { Point } from "./observability";

/* /api/metrics/deep + /api/logs/volume contracts — the observability deep-dive (Sprint H P2).
   Every panel carries the REAL query it runs; the query is the exhibit even when data is absent. */

export type DeepSeries = { label: string; query?: string; points: Point[] };

export type DeepPanel = {
  key: string;
  title: string;
  unit: string;
  query: string;
  series: DeepSeries[];
  dropped?: number;
};

export type DeepResponse = {
  source: "prometheus" | "unavailable";
  ts: string;
  panels: DeepPanel[];
};

export type VolumeSeries = { label: string; points: Point[] };

export type VolumeResponse = {
  source: "loki" | "unavailable";
  ts: string;
  query: string;
  series: VolumeSeries[];
};

