import { TerminalWindow } from "../components/TerminalWindow";
import { SectionHeader } from "../components/SectionHeader";
import { SystemDash } from "../components/SystemDash";
import { pageMeta } from "../og";
import { UNAVAILABLE_STATUS, type Status } from "../../data/status";

export const metadata = pageMeta(
  "The System — live telemetry · gipc.dev",
  "The operator surface: service topology, live metrics and the deploy feed for the self-hosted gipc.dev platform.",
  "/system",
);

// Always render per-request so the SSR paint carries live numbers.
export const dynamic = "force-dynamic";

/* SSR-fetch real metrics from core (in-cluster ClusterIP by default; no web-deployment env change).
   A hung/absent core must not stall TTFB → 1.5s timeout; any failure degrades to UNAVAILABLE_STATUS. */
async function getStatus(): Promise<Status> {
  try {
    const base = process.env.CORE_URL ?? "http://core:8080";
    const res = await fetch(`${base}/api/status`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return UNAVAILABLE_STATUS;
    return (await res.json()) as Status;
  } catch {
    return UNAVAILABLE_STATUS;
  }
}

export default async function SystemPage() {
  const status = await getStatus();
  return (
    <main className="wrap page" tabIndex={-1}>
      <TerminalWindow path="~/system">
        <SectionHeader marker="system" title="The System" />
        <p className="line type-line">
          <span className="prompt">arcane@prod:~$</span> systemctl status --all
        </p>
        <p className="page-lead">
          The operator surface. Metrics below are live from Prometheus — the real request rate,
          p99 latency, error rate and resource usage of the self-hosted platform. Topology, the
          deploy feed and the request trace remain placeholders, wired in later phases.
        </p>
        <SystemDash initial={status} />
      </TerminalWindow>
    </main>
  );
}
