import { NextResponse } from "next/server";
import type { Telemetry } from "../../../data/telemetry";

/* Stub telemetry — plausible placeholder values with per-request jitter so the
   /system poll visibly ticks. All services report "up" (faking a degraded node
   would misrepresent the platform; the status→colour map stays contract-complete
   over ServiceStatus by type). Real Prometheus/GitHub feeds land in a later sprint. */
export const dynamic = "force-dynamic";

const jitter = (base: number, spread: number) =>
  Math.round((base + (Math.random() - 0.5) * spread) * 10) / 10;

export function GET() {
  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  const payload: Telemetry = {
    stub: true,
    generatedAt: new Date(now).toISOString(),
    services: [
      { name: "web", status: "up", latencyMs: jitter(12, 4), rps: jitter(82, 10) },
      { name: "api", status: "up", latencyMs: jitter(38, 8), rps: jitter(141, 18) },
      { name: "ai", status: "up", latencyMs: jitter(210, 40), rps: jitter(3.2, 1) },
      { name: "db", status: "up", latencyMs: jitter(3.4, 1.2), rps: jitter(96, 12) },
    ],
    deploys: [
      { id: "d-483", subject: "deploy(web): 0d36488 → gipc.dev", when: iso(3 * 3600e3) },
      { id: "d-482", subject: "deploy(web): 7c6a774 → gipc.dev", when: iso(9 * 3600e3) },
      { id: "d-481", subject: "deploy(web): 2a49302 → gipc.dev", when: iso(26 * 3600e3) },
    ],
    trace: [
      { hop: "edge", detail: "Cloudflare PoP (bne) — TLS terminate + WAF", ms: 3 },
      { hop: "tunnel", detail: "cloudflared QUIC — zero inbound ports", ms: 11 },
      { hop: "k3s", detail: "Service → pod (ns gipc)", ms: 2 },
      { hop: "web", detail: "Next.js standalone render", ms: 9 },
    ],
  };
  return NextResponse.json(payload);
}
