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
          Live telemetry from the machine that is serving you this page, right now. Nothing here is
          mocked or cached for show — these are the operator&rsquo;s own dashboards, simply made
          public. A quick map of what each panel tells you:
        </p>
        <ul className="lead-guide">
          <li><b>metrics</b> — how busy the platform is at this moment: requests per second, latency, error rate, memory</li>
          <li><b>history · 30m</b> — the same numbers as sparklines, so you can read the last half hour at a glance</li>
          <li><b>deploy feed</b> — real events from the CI pipeline; a push to main lights it up, stage by stage</li>
          <li><b>logs</b> — a live, redacted tail of the platform&rsquo;s own logs</li>
          <li><b>trace your request</b> — the actual network path <em>your</em> request just took: edge → tunnel → proxy → backend</li>
          <li><b>topology</b> — every pod and its state, straight from the Kubernetes API</li>
          <li><b>deep scry</b> — heavier diagnostics that print the exact queries they run, so you can verify them yourself</li>
        </ul>
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
