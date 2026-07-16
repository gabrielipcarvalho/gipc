// Map an oracle citation to a Construct station key (/resume?station=<key>). Résumé-derived citations
// map to a station; site-doc citations (urls /, /infra, /system) return null. Keys match the id="cst-<key>"
// anchors in StaticResume.tsx.

import type { OracleCitation } from "./oracle";

export function constructStation(c: OracleCitation): string | null {
  // code citations (self-aware corpus) link to GitHub blobs and are titled by repo path — never a
  // Construct station, regardless of what substrings a future path contains. NARROW guard on
  // purpose: the gipc.dev project citation (url https://gipc.dev) must keep its "projects" station.
  if (c.url.startsWith("https://github.com/")) return null;
  const t = c.title.toLowerCase();
  if (t.startsWith("skills")) return "skills";
  if (t.startsWith("experience")) return "experience";
  if (t.startsWith("project") || t.startsWith("work")) return "projects";
  if (t.startsWith("publication")) return "publications";
  if (t.startsWith("education")) return "education";
  if (t.startsWith("certification") || t.includes("award") || t.includes("leadership")) return "honours";
  if (t.includes("profile") || t.startsWith("gabriel")) return "profile";
  return null;
}

// First station referenced by a message's citations, or null.
export function firstStation(citations: OracleCitation[] | undefined): string | null {
  if (!citations) return null;
  for (const c of citations) {
    const s = constructStation(c);
    if (s) return s;
  }
  return null;
}
