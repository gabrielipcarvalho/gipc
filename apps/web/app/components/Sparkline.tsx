import type { Point } from "../../data/observability";

/* Inline SVG sparkline — pure geometry from the samples (SSR-safe, no time/random). Shared by
   /system's history rows and the deep panels. Multi-series: one <path> per series, all normalized
   to the SAME min/max so relative magnitudes are honest. Decorative (aria-hidden) — the text
   legend beside it carries the numbers for screen readers. */

export type SparkSeries = { label: string; points: Point[] };

export function Sparkline({ points }: { points: Point[] }) {
  return <MultiSparkline series={[{ label: "", points }]} />;
}

export function MultiSparkline({ series }: { series: SparkSeries[] }) {
  const drawable = series.filter((s) => s.points.length >= 2);
  if (!drawable.length) return <span className="spark-empty">no data</span>;
  const W = 140;
  const H = 30;
  const vs = drawable.flatMap((s) => s.points.map((p) => p.v));
  const min = Math.min(...vs, 0);
  const max = Math.max(...vs);
  const span = max - min || 1;
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      {drawable.map((s) => {
        const step = W / (s.points.length - 1);
        const d = s.points
          .map(
            (p, i) =>
              `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(H - ((p.v - min) / span) * H).toFixed(1)}`,
          )
          .join(" ");
        return <path key={s.label} d={d} />;
      })}
    </svg>
  );
}
