import { CountUpText } from "./CountUpText";

/* Metric strip — label · track bar · value rows, shared by the Console + /system. Values are
   ALWAYS real /api/status numbers (the placeholder era ended in Sprint H P1).
   `countUp` opts the value numbers into a 0→target count-up on reveal. */
export type Metric = { k: string; pct: number; v: string };

export function MetricPanel({
  metrics,
  revealed = true,
  countUp = false,
}: {
  metrics: Metric[];
  revealed?: boolean;
  countUp?: boolean;
}) {
  const active = countUp && revealed;
  return (
    <div
      className="panel"
      role="group"
      aria-label="Live service metrics"
    >
      {metrics.map((m) => (
        <div className="metric" key={m.k}>
          <span className="k">{m.k}</span>
          <span className="track">
            <span className="fill" style={{ width: revealed ? `${m.pct}%` : "0%" }} />
          </span>
          <span className="v">{countUp ? <CountUpText text={m.v} active={active} /> : m.v}</span>
        </div>
      ))}
    </div>
  );
}
