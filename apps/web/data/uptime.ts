// Types for the P7 uptime/incident surface (mirror services/core internal/server/uptime.go EXACTLY).

export type Incident = {
  target: string;
  start: string;
  end: string | null; // null = ongoing
  durationS: number | null;
};

export type TargetStatus = {
  name: string;
  status: "up" | "down" | "collecting";
  uptimePct: number;
  latencyMs: number | null;
  sampleCount: number;
  windowStart: string;
  strip: boolean[]; // last ~40 up/down samples for the bar view
};

export type Uptime = { targets: TargetStatus[]; incidents: Incident[]; ts: string };

export const EMPTY_UPTIME: Uptime = { targets: [], incidents: [], ts: "" };
