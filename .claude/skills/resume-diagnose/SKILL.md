---
name: resume-diagnose
description: Audit a resume like an ATS parser AND a 6-second human recruiter — produce a scored diagnostic report with prioritized fixes. Use when asked to "diagnose", "audit", "score", or "review" a resume/CV, or before and after any rewrite (baseline → delta). Diagnosis only — never rewrites.
---

# Resume Diagnose

Audit the given resume through two lenses — machine (ATS) and human (recruiter) — and emit a
scored report. **This skill never edits the resume.** Output feeds `resume-rewrite`.

## Inputs
- Resume file (PDF/MD/DOCX/JSON). If PDF, read fully first.
- Optional: target-role keyword profile at `career/keywords-<role>.md` (produced by
  `resume-keywords`). Without it, skip keyword scoring and say so — do not improvise a keyword list.

## Pass 1 — ATS mechanical check
Check and report each:
1. **Parseable structure**: no tables/columns/text-boxes/headers-footers carrying content; no
   graphics-embedded text; single-column flow.
2. **Standard section headers**: Professional Experience / Education / Skills / Publications /
   Certifications (non-standard names confuse parsers).
3. **Fonts & characters**: standard families, 10–12pt body; no exotic glyphs/ligatures.
4. **Dates**: consistent `Mon YYYY – Mon YYYY`; no bare years mixed with month-years; no
   ambiguity ("Present" only for the current role).
5. **Contact block**: name, suburb + state (never full street address), phone, email, LinkedIn,
   GitHub — as plain text.
6. **File hygiene**: text-based (not scanned), sensible filename (`Name_Role_Resume.pdf`),
   ≤ 3 pages (2 preferred for industry roles).
7. **AU conventions**: no photo, no DOB, no marital status, en-AU spelling, referees "available
   on request" or omitted.

## Pass 2 — keyword match (only with a keyword profile)
- Match resume text against the profile's must-have / differentiator lists (exact + synonym).
- Score: `matched_must_haves / total_must_haves × 100`. Target ≥ 80%.
- Note placement quality: summary (best) → skills matrix → bullets. Flag stuffing
  (critical terms > 4×).

## Pass 3 — recruiter 6-second read
Simulate the first skim, then the deep read:
- **First impression**: what a recruiter sees in 6 seconds (top third of page 1). Does the
  headline/profile state role + seniority + evidence immediately?
- **Bullet quality**: flag every duty-phrased bullet ("responsible for", "helped with"),
  every bullet with zero metrics, every bullet > 2 lines.
- **Red flags**: unexplained gaps, stale claims (old model/tool names), buzzword soup,
  claims without evidence, inconsistent tense, career-story confusion.
- **Strengths**: what genuinely lands — name them so the rewrite protects them.

## Output — Diagnostic Report (markdown)
```
# Resume Diagnostic — <file> — <date>
## Scores
- ATS mechanical: n/10  (list of failures)
- Keyword match: n%     (matched / missing lists)  [or "no profile provided"]
- Impact density: n/10  (bullets with metrics ÷ total bullets)
- Recruiter read: n/10
- OVERALL: n/100
## Critical fixes (ordered by impact)
1. <issue> → <specific fix> (before/after example)
## Keep — do not lose in rewrite
- <strengths>
```

## Rules
- Diagnosis only. Never modify the source document.
- Every issue must carry a concrete fix with a before/after example.
- Re-run after `resume-rewrite` and report the score delta.
