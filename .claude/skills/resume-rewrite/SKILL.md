---
name: resume-rewrite
description: Rewrite the master resume (and emit resume.json) from the career evidence base using Google's XYZ formula, with a hard zero-fabrication rule — every metric traceable to evidence. Use when asked to "rewrite", "update", "tailor", or "improve" the resume, AFTER resume-diagnose (baseline) and resume-keywords (market profile) have run.
---

# Resume Rewrite — evidence-first, XYZ, ATS-safe

Rewrite from evidence, never from imagination. Inputs: `career/career-mcd.md` (evidence base),
`career/keywords-<role>.md` (market profile), latest diagnostic report.

## THE HARD RULE — zero fabrication
- Every metric, scale, date, and claim must trace to an evidence entry in `career-mcd.md`.
  Each rewritten bullet carries its evidence id (kept in `resume.json`, stripped from the
  rendered PDF/page).
- Metric missing? Three legal moves only: (1) quantify the *input* ("across 30+ services"),
  (2) use a sourced approximation from the MCD (`~`), (3) drop the number. Inventing = never.
- Anything uncertain → emit as `[NEEDS-EVIDENCE: question]` and ask Gabriel; do not ship it.

## Bullet formula
Default **XYZ**: *Accomplished [X] as measured by [Y] by doing [Z]* — reshaped naturally
(CAR/STAR when the story fits better). Constraints:
- Start with a power verb (Led / Built / Cut / Automated / Shipped / Scaled / Designed /
  Migrated / Hardened). Ban: "responsible for", "helped with", "worked on", "involved in".
- ≥ 1 metric per bullet where evidence allows; 1–2 lines hard cap; en-AU spelling.
- **Anti-puff lexicon (banned)**: spearheaded, leveraged, passionate, dynamic, synergy,
  cutting-edge, seasoned, results-driven, detail-oriented, utilize, best-in-class, world-class.
  Plain verbs, concrete nouns — the resume must not read AI-written.

## Keyword weaving (from the market profile)
- Placement priority: Profile summary (5–8 naturally) → Skills matrix (explicit) →
  bullets (achievement-integrated).
- Density: critical terms 2–4×, others 1–2×. HAVE-BURIED terms must surface;
  GAP-REAL terms are forbidden.

## Structure (ATS-safe master)
1. Header: name · target title · suburb + state · phone · email · gipc.dev · LinkedIn · GitHub
2. Profile: 3–4 lines, role + seniority + 2 evidence-backed differentiators (PhD/publication,
   production AI systems, self-hosted platform engineering).
3. **Skills matrix** (categories: Languages / Cloud & Infra / DevOps & Platform / AI & ML /
   Data / Practices) — terms ordered by market-profile priority.
4. Experience: role — org — `Mon YYYY – Mon YYYY` — XYZ bullets (max 6 for current role,
   3–4 older).
5. Projects (selected, runnable/linkable — gipc.dev platform included).
6. Publications (IEEE Access 2026 w/ DOI) · Education (PhD → MIT → LLB) · Awards ·
   Certifications (ACS skills assessments: Developer Programmer 261312, Software Engineer
   261313, DevOps Engineer 261316 — 2026) · Extras (ICPC, Coding Club, Xidian fellowship).
7. No tables/columns/graphics in the rendered output; single column.

## Outputs
1. `resume/resume-master.md` — the canonical human-readable master.
2. `resume/resume.json` — structured single source (feeds the site, PDF, JD-tailoring):
   `basics` (public-safe; street-level data never enters this file), `skills[]`,
   `experience[].bullets[{text, evidence, keywords[]}]`, `projects[]`, `education[]`,
   `publications[]`, `awards[]`, `certifications[]`.
3. Per-application variants: reorder/re-emphasize ONLY — facts never change between variants.

## Loop
Rewrite → run `resume-diagnose` → report score delta → iterate until ≥ 85/100 or
blocked on `[NEEDS-EVIDENCE]` answers.
