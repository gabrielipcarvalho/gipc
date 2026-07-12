/* Metric strip — label · track bar · value rows, extracted from the Console so /system
   can reuse it. Values are placeholders until real telemetry lands (data-placeholder). */
export type Metric = { k: string; pct: number; v: string };

export function MetricPanel({
  metrics,
  revealed = true,
}: {
  metrics: Metric[];
  revealed?: boolean;
}) {
  return (
    <div
      className="panel"
      role="group"
      aria-label="Live service metrics (placeholder)"
      data-placeholder="true"
    >
      {metrics.map((m) => (
        <div className="metric" key={m.k}>
          <span className="k">{m.k}</span>
          <span className="track">
            <span className="fill" style={{ width: revealed ? `${m.pct}%` : "0%" }} />
          </span>
          <span className="v">{m.v}</span>
        </div>
      ))}
    </div>
  );
}
