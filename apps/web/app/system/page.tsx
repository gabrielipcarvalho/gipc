import { TerminalWindow } from "../components/TerminalWindow";
import { SectionHeader } from "../components/SectionHeader";
import { SystemDash } from "../components/SystemDash";
import type { DeepResponse, VolumeResponse } from "../../data/deep";
import { pageMeta } from "../og";
import { UNAVAILABLE_STATUS, type Status } from "../../data/status";
import type { DeployEvent } from "../../data/deploys";
import { EMPTY_HISTORY, type MetricsHistory } from "../../data/observability";

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
async function getDeep(): Promise<DeepResponse | null> {
  try {
    const res = await fetch(`${CORE}/api/metrics/deep`, { cache: "no-store", signal: AbortSignal.timeout(1500) });
    if (!res.ok) return null;
    const full = (await res.json()) as DeepResponse;
    // SLIM seed: keep the crawlable exhibit (titles + query text), strip the ~90KB of point data —
    // DeepPanels always pulls the full payload right after mount (QA: 4.5× page-weight regression).
    return { ...full, panels: full.panels.map((p) => ({ ...p, series: [] })) };
  } catch {
    return null;
  }
}
async function getVolume(): Promise<VolumeResponse | null> {
  try {
    const res = await fetch(`${CORE}/api/logs/volume`, { cache: "no-store", signal: AbortSignal.timeout(1500) });
    return res.ok ? ((await res.json()) as VolumeResponse) : null;
  } catch {
    return null;
  }
}
async function getHistory(): Promise<MetricsHistory> {
  try {
    const res = await fetch(`${CORE}/api/metrics/history`, { cache: "no-store", signal: AbortSignal.timeout(1500) });
    return res.ok ? ((await res.json()) as MetricsHistory) : EMPTY_HISTORY;
  } catch {
    return EMPTY_HISTORY;
  }
}

export default async function SystemPage() {
  // parallel — serial awaits would ~triple TTFB when core is down
  const [status, deploys, history, deep, volume] = await Promise.all([
    getStatus(), getDeploys(), getHistory(), getDeep(), getVolume(),
  ]);
  return (
    <main id="main" className="wrap page" tabIndex={-1}>
      <TerminalWindow path="~/system">
        <SectionHeader marker="system" title="The System" />
        <p className="line type-line">
          <span className="prompt">arcane@prod:~$</span> systemctl status --all
        </p>
        <p className="page-lead">
          Live telemetry from the machine that is serving you this page, right now. Left column:
          request rate and latency, the deploy feed straight from CI, and the network path your own
          request just took. Right column: 30-minute history, a redacted tail of the platform&rsquo;s
          logs, and live pod state from the Kubernetes API. Nothing is mocked or cached for show —
          these are the operator&rsquo;s own dashboards, made public; the deep-scry panels at the
          bottom even print the exact queries they run.
        </p>
        <SystemDash
          initial={status}
          initialDeploys={deploys}
          initialHistory={history}
          initialDeep={deep}
          initialVolume={volume}
        />
      </TerminalWindow>
    </main>
  );
}
