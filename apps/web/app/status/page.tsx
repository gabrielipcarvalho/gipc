import { TerminalWindow } from "../components/TerminalWindow";
import { SectionHeader } from "../components/SectionHeader";
import { StatusBoard } from "../components/StatusBoard";
import { pageMeta } from "../og";
import { EMPTY_UPTIME, type Uptime } from "../../data/uptime";

export const metadata = pageMeta(
  "Status — uptime & incidents · gipc.dev",
  "Live uptime and incident history for the self-hosted gipc.dev platform: core, Prometheus, Loki and the web app.",
  "/status",
);

// Render per-request so the SSR paint carries live uptime.
export const dynamic = "force-dynamic";

const CORE = process.env.CORE_URL ?? "http://core:8080";

async function getUptime(): Promise<Uptime> {
  try {
    const res = await fetch(`${CORE}/api/uptime`, { cache: "no-store", signal: AbortSignal.timeout(1500) });
    return res.ok ? ((await res.json()) as Uptime) : EMPTY_UPTIME;
  } catch {
    return EMPTY_UPTIME;
  }
}

export default async function StatusPage() {
  const uptime = await getUptime();
  return (
    <main className="wrap page" tabIndex={-1}>
      <TerminalWindow path="~/status">
        <SectionHeader marker="status" title="Status" />
        <p className="line type-line">
          <span className="prompt">arcane@prod:~$</span> uptime --history
        </p>
        <p className="page-lead">
          Real uptime and incident history for the self-hosted platform — core probes itself and its
          dependencies every 30 seconds. Degraded and down states are shown honestly; the history is
          in-memory and resets when core redeploys, so a fresh window reads &ldquo;collecting&rdquo;.
        </p>
        <StatusBoard initial={uptime} />
      </TerminalWindow>
    </main>
  );
}
