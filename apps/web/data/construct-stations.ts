import raw from "./camera-stations.json";

/* Hand-authored Construct camera stations (loaded by the immersive scroll-descend). Each résumé chapter
   gets an optional lead-in gap + descent easing; the code-derived uniform grid is the exact fallback —
   an empty/malformed config (or a key with no entry) collapses to gap 1 + the global lerp, i.e. today's
   behaviour. Mirrors the projects.json → projects.ts loader pattern. */

export type StationCfg = { key: string; gapBefore?: number; lerp?: number; ease?: string };

const DEFAULT_GAP = 1;

// key → cfg; any malformed/absent data collapses to {} → pure code-derived fallback.
const CFG: Record<string, StationCfg> = (() => {
  try {
    const list = (raw as { stations?: StationCfg[] }).stations;
    if (!Array.isArray(list)) return {};
    const m: Record<string, StationCfg> = {};
    for (const s of list) if (s && typeof s.key === "string") m[s.key] = s;
    return m;
  } catch {
    return {};
  }
})();

/* Station key per [data-station] card: the nearest ancestor (or self) with id="cst-<key>". Client-only
   (reads the DOM), pure over its argument. The profile header IS the id-bearing card; section cards
   resolve to their <section id="cst-…">. Unknown → "" (→ default gap/lerp). */
export function stationKeysOf(cards: HTMLElement[]): string[] {
  return cards.map((c) => c.closest<HTMLElement>("[id^='cst-']")?.id.replace(/^cst-/, "") ?? "");
}

/* Cumulative vh offset per card. offset[0] = 0 (first station pinned to top); each later card adds its
   gap — a section-ENTRY card (key changes) uses that key's gapBefore (default 1), within-section cards
   use 1. All-default → [0,1,2,…] == the code-derived uniform grid. */
export function stationOffsets(keys: string[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < keys.length; i++) {
    if (i === 0) {
      out.push(0);
      continue;
    }
    const entry = keys[i] !== keys[i - 1];
    const gap = entry ? (CFG[keys[i]]?.gapBefore ?? DEFAULT_GAP) : DEFAULT_GAP;
    acc += gap > 0 ? gap : DEFAULT_GAP; // guard non-positive → default (never collapse two stations)
    out.push(acc);
  }
  return out;
}

/* Per-target-station descent lerp (fine pointers only — callers keep LERP_COARSE on touch), else the
   global fallback. */
export function stationLerp(key: string | undefined, fallback: number): number {
  const l = key ? CFG[key]?.lerp : undefined;
  return typeof l === "number" && l > 0 && l <= 1 ? l : fallback;
}

/* Nearest station index to a position in vh units (small linear scan; offsets is ≤~25 long). */
export function nearestStation(offsets: number[], posVh: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < offsets.length; i++) {
    const d = Math.abs(offsets[i] - posVh);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
