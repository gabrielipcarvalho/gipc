---
name: resume-keywords
description: Mine LIVE job postings (Indeed MCP when connected, else Seek/Indeed via web) for a target role and produce a frequency-ranked keyword/skill profile plus a gap analysis against the career evidence base. Use when asked to "mine keywords", "analyze the market", "what skills are employers asking", or before any resume rewrite/tailoring.
---

# Resume Keywords — live market miner

Build the keyword profile for a target role from **real, current postings** — never from
memory or generic lists. This is the evidence base `resume-diagnose` scores against and
`resume-rewrite` weaves from.

## Inputs
- Target role (e.g. "DevOps Engineer", "Backend Engineer", "AI/ML Engineer") + location
  scope (default: Gold Coast / Brisbane / Remote AU).
- Career evidence base `career/career-mcd.md` (for the gap analysis; skip gap section if absent).

## Step 1 — collect postings
- Preferred: Indeed MCP tools (`search_jobs`, `get_job_details`) — pull **15–30 postings**
  per role, mixed seniority (mid + senior), AU market.
- Fallback: WebSearch/WebFetch on seek.com.au and au.indeed.com listings.
- Record: title, company, seniority, salary band (when shown), posting URL, date.

## Step 2 — extract & rank
From each posting extract: hard skills (languages, clouds, tools, frameworks), platform
specifics (e.g. EKS vs AKS), certifications, methodologies (CI/CD, IaC, GitOps, SRE, agile),
soft skills, domain terms. Then frequency-rank across the corpus:
- **MUST-HAVE**: appears in > 50% of postings
- **DIFFERENTIATOR**: 20–50%
- **LONG-TAIL**: < 20% (note only if they match existing evidence)

## Step 3 — gap analysis vs evidence base
Three buckets, each item citing MCD evidence ids where applicable:
- **HAVE-SURFACED**: in market profile AND already prominent in the resume.
- **HAVE-BURIED**: real evidence exists in `career-mcd.md` but the resume doesn't surface the
  term → rewrite must surface it.
- **GAP-REAL**: market wants it, no evidence exists. **Never** enters the resume — it feeds a
  learning plan instead.

## Output — `career/keywords-<role-slug>.md`
```
# Market keyword profile — <role> — mined <date>
Corpus: N postings (list URLs at bottom)
## Must-have (>50%)
| term | freq | in resume? | evidence (MCD id) |
## Differentiators (20–50%)
...
## Salary observations
## Gap analysis
HAVE-BURIED: ...   GAP-REAL (learning plan, NOT resume): ...
## Top-10 terms to weave (ordered)
## Sources
```

## Rules
- Live data only; stamp the mining date; corpus < 10 postings → say the profile is weak.
- Keyword ≠ permission to claim. GAP-REAL items are radioactive for the resume.
- Refresh profiles older than ~45 days before a rewrite.
