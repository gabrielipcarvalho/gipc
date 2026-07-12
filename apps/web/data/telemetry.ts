/* Shared telemetry contract — imported by BOTH the stub Route Handler and the
   /system client. Every payload is stub-flagged until the real backend sprint. */
export type ServiceStatus = "up" | "degraded" | "down";

export type TelemetryService = {
  name: string;
  status: ServiceStatus;
  latencyMs: number;
  rps: number;
};

export type TelemetryDeploy = {
  id: string;
  subject: string;
  when: string; // ISO — the client formats relative time at fetch time
};

export type TelemetryHop = { hop: string; detail: string; ms: number };

export type Telemetry = {
  stub: true;
  generatedAt: string; // ISO
  services: TelemetryService[];
  deploys: TelemetryDeploy[];
  trace: TelemetryHop[];
};
