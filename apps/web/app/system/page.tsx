import { TerminalWindow } from "../components/TerminalWindow";
import { SectionHeader } from "../components/SectionHeader";
import { SystemDash } from "../components/SystemDash";
import { pageMeta } from "../og";
import { UNAVAILABLE_STATUS, type Status } from "../../data/status";
import type { DeployEvent } from "../../data/deploys";

export const metadata = pageMeta(
  "The System — live telemetry · gipc.dev",
  "The operator surface: service topology, live metrics and the deploy feed for the self-hosted gipc.dev platform.",
  "/system",
);

// Always render per-request so the SSR paint carries live numbers.
export const dynamic = "force-dynamic";

const CORE = process.env.CORE_URL ?? "http://core:8080";

// A hung/absent core must not stall TTFB → 1.5s timeout; any failure degrades gracefully.
async function getStatus(): Promise<Status> {
  try {
    const res = await fetch(`${CORE}/api/status`, { cache: "no-store", signal: AbortSignal.timeout(1500) });
    return res.ok ? ((await res.json()) as Status) : UNAVAILABLE_STATUS;
  } catch {
    return UNAVAILABLE_STATUS;
  }
}
async function getDeploys(): Promise<DeployEvent[]> {
  try {
    const res = await fetch(`${CORE}/api/deploys`, { cache: "no-store", signal: AbortSignal.timeout(1500) });
    return res.ok ? ((await res.json()) as DeployEvent[]) : [];
  } catch {
    return [];
  }
}

export default async function SystemPage() {
  // parallel — serial awaits would ~double TTFB when core is down
  const [status, deploys] = await Promise.all([getStatus(), getDeploys()]);
  return (
    <main className="wrap page" tabIndex={-1}>
      <TerminalWindow path="~/system">
        <SectionHeader marker="system" title="The System" />
        <p className="line type-line">
          <span className="prompt">arcane@prod:~$</span> systemctl status --all
        </p>
        <p className="page-lead">
          The operator surface. Metrics are live from Prometheus and the deploy feed is wired to the
          real CI pipeline — the actual request rate, latency, resource usage and releases of the
          self-hosted platform. Topology and the request trace remain placeholders, wired in later phases.
        </p>
        <SystemDash initial={status} initialDeploys={deploys} />
      </TerminalWindow>
    </main>
  );
}
