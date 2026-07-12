import { resume } from "./resume";

/* Unified career timeline — experience roles + education, derived VERBATIM from
   resume/resume.json (single source; no new facts). Newest first. */
export type TimelineNode = {
  kind: "experience" | "education";
  title: string;
  org: string;
  location?: string;
  period: string; // display, e.g. "Dec 2024 – Present"
  ongoing: boolean; // end matches present/expected
  sortYear: number;
  note?: string; // experience only
  bullets?: string[]; // experience only
  detail?: string; // education only
  tags?: string[]; // experience only — keywords aggregated from bullets, cap 6
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const yearOf = (s: string): number => {
  const m = s.match(/\d{4}/);
  return m ? parseInt(m[0], 10) : 0;
};

const fmt = (s: string): string => {
  if (/present/i.test(s)) return "Present";
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}`;
  return s; // "2024", "2028 (expected)"
};

const period = (start: string | undefined, end: string): string =>
  start ? `${fmt(start)} – ${fmt(end)}` : fmt(end);

const isOngoing = (end: string): boolean => /present|expected/i.test(end);

function build(): TimelineNode[] {
  const experience: TimelineNode[] = resume.experience.map((r) => {
    // round-robin across bullets (one per bullet, then a second pass, …) so the capped
    // tag set spans the whole role instead of draining the first bullet's keywords
    const tags: string[] = [];
    const lists = r.bullets.map((b) => b.keywords ?? []);
    const cols = Math.max(0, ...lists.map((l) => l.length));
    for (let col = 0; col < cols && tags.length < 6; col++) {
      for (const l of lists) {
        if (tags.length >= 6) break;
        const k = l[col];
        if (k && !tags.includes(k)) tags.push(k);
      }
    }
    return {
      kind: "experience",
      title: r.role,
      org: r.org,
      location: r.location,
      period: period(r.start, r.end),
      ongoing: isOngoing(r.end),
      sortYear: yearOf(r.start || r.end),
      note: r.note,
      bullets: r.bullets.map((b) => b.text),
      tags, // already capped at 6 by the round-robin loop
    };
  });
  const education: TimelineNode[] = resume.education.map((e) => ({
    kind: "education",
    title: e.degree,
    org: e.org,
    period: period(e.start, e.end),
    ongoing: isOngoing(e.end),
    sortYear: yearOf(e.start || e.end),
    detail: e.detail,
  }));
  // experience first, then a STABLE sort by year DESC, ongoing-first — the merge order
  // carries same-year/same-ongoing ties (e.g. WealthGoal before Casual)
  return [...experience, ...education].sort((a, b) => {
    if (b.sortYear !== a.sortYear) return b.sortYear - a.sortYear;
    if (a.ongoing !== b.ongoing) return a.ongoing ? -1 : 1;
    return 0;
  });
}

export const timeline: TimelineNode[] = build();
