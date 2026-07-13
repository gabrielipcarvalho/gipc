import { CountUpText } from "./CountUpText";

/* Metric strip — label · track bar · value rows, extracted from the Console so /system
   can reuse it. Values are placeholders until real telemetry lands (data-placeholder).
   `countUp` opts the value numbers into a 0→target count-up on reveal. */
export type Metric = { k: string; pct: number; v: string };

export function MetricPanel({
  metrics,
  revealed = true,
  countUp = false,
  placeholder = true,
}: {
  metrics: Metric[];
  revealed?: boolean;
  countUp?: boolean;
  placeholder?: boolean;
}) {
  const active = countUp && revealed;
  return (
    <div
      className="panel"
      role="group"
      aria-label={placeholder ? "Live service metrics (placeholder)" : "Live service metrics"}
      data-placeholder={placeholder || undefined}
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
