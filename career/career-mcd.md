# Master Career Document — Gabriel Isaias Padua Carvalho

> Single source of truth for every resume/portfolio claim. Assembled 2026-07-11 from four
> evidence streams: (A) projects crawl of `~/Projects`, (B) JDL work mining across Claude
> session logs + project memories (Mar–Jul 2026 window), (C) GitHub audit (authed, incl.
> private repos), (D) documents (ACS letters, IEEE paper, current CV, Visa-189 dossier).
> **Zero-fabrication rule:** `resume-rewrite` may only emit claims traceable to an id below.
> Items marked **(?)** need Gabriel's confirmation before use.

## 1. Basics

- **Name:** Gabriel Isaias Padua Carvalho (public professional name: Gabriel Carvalho / Gabriel I. P. Carvalho)
- **Titles held/target:** Software Engineer · DevOps Engineer · AI Engineer
- **Location:** Ashmore, Gold Coast, QLD, Australia *(resume: "Gold Coast, QLD" — never street address)*
- **Contact:** gabriel@gipc.dev · +61 490 831 997 *(private doc only until site launch)* ·
  linkedin.com/in/gabriel-ipcarvalho · github.com/gabrielipcarvalho · gipc.dev (site WIP)
- **Academic email:** g.paduacarvalho@griffith.edu.au
- **Languages:** English (IELTS 8.0), Portuguese (native)
- **Work rights:** AU (189 skilled-independent visa in progress; ACS assessments done — §9)

## 2. Positioning (summary angles)

1. **DevOps/Platform:** production infra owner — AWS estate, migrations at TB scale, security
   hardening, incident response, self-hosted k3s platform.
2. **Backend/Software:** ships whole systems solo — Django SaaS portal (604 tests), FastAPI
   LLM services, 6-year PHP production platform maintenance.
3. **AI Engineering:** PhD candidate; published IEEE author; production LLM systems (voice,
   WhatsApp, triage) and applied deep learning (U-Net seismic inversion).
- **The arc (differentiator):** Brazilian lawyer (LLB, High Distinction) → retrained in AU →
  High-Distinction Master's → published PhD researcher + production engineer in <4 years.

## 3. Skills inventory (evidence-backed only)

- **Languages:** Python (primary; 13 repos, prod systems) · PHP 7.4/8.1 (6-yr prod CRM) ·
  JavaScript/TypeScript (React 18/19, Next.js 15, RN coursework) · C (CS50, firmware — CV) ·
  C++ (PhD prototyping — CV) · SQL · Bash (ops tooling) · Java (coursework only — do not lead)
- **Cloud/AWS:** EC2, S3, Lambda, DynamoDB, API Gateway, CloudFront, WAF, ACM, Route53,
  GuardDuty, CloudTrail, DLM/EBS snapshots, SES, Secrets Manager, Bedrock, IAM, budgets
  [JDL-10..14, 19, CV] · **Azure** (AKS, Bicep — research projects) · GCP (research) ·
  Cloudflare (zones, Tunnel, WAF) [JDL-07, PRJ-GIPC]
- **DevOps/Platform:** Docker, Kubernetes (k3s bare-metal + AKS), Terraform/Bicep, Ansible
  (planned/gipc), CI/CD (GitHub Actions, git-aware deploy pipelines), systemd/launchd, Apache/
  Nginx/Gunicorn/Uvicorn, cPanel/CloudLinux estate, PowerDNS/BIND, WireGuard, Tailscale,
  UptimeRobot, logrotate, fail2ban, ufw
- **AI/ML:** PyTorch, TensorFlow, OpenCV, scikit-learn, Hugging Face, U-Net/CNN, Transformers,
  LLM integration (Claude/Bedrock, GPT-4o-mini, Deepgram, PlayHT, Retell, ElevenLabs-class
  stacks), prompt/FSM conversation engineering, RAG (planned gipc), XAI (SHAP/LIME/Grad-CAM —
  PhD study), edge deployment (ARM/RPi ≥20fps)
- **Data:** PostgreSQL/Supabase (RPCs, migrations, RLS-era), MySQL (204-table prod schema),
  Redis (planned gipc), pgvector (planned), ETL (3M+ rec/day — CV), pandas/NumPy
- **Practices:** TDD/pytest/Vitest/Playwright/axe (604-test portal; 3-tier suites), functional
  core/imperative shell, IaC, adversarial QA rounds, incident response, systematic review
  methodology (82-paper SLR), technical writing (IEEE-published)

## 4. Experience — JDL Strategies / WealthGoal Software (Gold Coast) — Software & DevOps Engineer — Dec 2024 → present

> Coverage note: session evidence spans Mar–Jul 2026. Dec 2024–Feb 2026 evidenced by the CV
> (Voice AI system) + GitHub timestamps. **[NEEDS-EVIDENCE: Gabriel to list months 1–14 wins.]**
> Attribution: second developer **Oliver** co-commits on the CRM; items flagged (?) unconfirmed.

### Systems built & migrated
- [JDL-01] Multi-provider OAuth email system in the CRM — MS 365/Graph sync+send (~1.5k-line
  provider), 5-min delta-sync cron w/ 8000-call budget, AES-256 token store, React 18/TS inbox;
  ~12 DB tables. Live by 2026-06-15.
- [JDL-02] Gmail provider added via 8-phase sprint + 4 adversarial hardening rounds; deployed
  to all 3 prod servers, dormant behind go-live gate; test harness 42→93 tests. 2026-06.
- [JDL-03] Sole builder: multi-tenant SaaS support portal (support.wealthgoal.com.au) —
  Django 5.2/Supabase, AI triage (GPT-4o-mini), SLA engine, reporting; **604 tests**;
  M0–M11 shipped; launched 2026-03-16; client workspaces live [JDL-41].
- [JDL-04/05] Migrated Demo (2026-05) and JDL (2026-07-01) production servers to new AWS
  Ubuntu boxes incl. DB migration w/ row-parity verification + DNS cutover.
- [JDL-06/07] Executed WG↔JDL corporate infrastructure separation: vhosts/apps off shared
  box; new WG Cloudflare (3 zones, 49 records), nameserver flips, EPP transfer of 3 domains.
  2026-07-07→09.
- [JDL-08] Zero-downtime Supabase org transfer (Ticket System), rows + 185 storage blobs
  verified. 2026-06-23.
- [JDL-09] gipc.dev estate migration off JDL infra (DNS 28 records → Cloudflare, imapsync 341
  msgs → Migadu, 0 errors). 2026-07-07. *(also personal-project evidence)*
- [CV/GH: voice-ai-client] **Voice AI Client Qualification System** (first-year flagship):
  serverless AWS (Lambda/S3/DynamoDB/API GW), Twilio + Deepgram STT + PlayHT TTS + Claude 3
  Haiku (Bedrock), WebSocket orchestration, CloudWatch; validated alpha in 5 weeks (CV claim).
  **[NEEDS-EVIDENCE: post-alpha fate — superseded by Retell-based caller [JDL-35]?]**
- [GH/PRJ: Olivia] **"Olivia AI"** production WhatsApp Financial-Wealth-Check chatbot
  (whatsapp.jdl.software): FastAPI + GPT-4o-mini structured extraction, 25-step FSM, atomic
  Postgres RPCs (opt-out, concurrency claim), Twilio HMAC + idempotency, PII-safe logging;
  ~50% latency cut via single-call ack+question architecture. 2026-02→03.

### Infrastructure owned
- [JDL-10] 3 production CRM servers + legacy cPanel box (~50 vhosts, t3.2xlarge, ~11 TiB EBS).
- [JDL-11/12] WealthGoal AWS account owner: WAF, 3 CloudFront distributions, ACM, GuardDuty,
  CloudTrail; replaced Sucuri with AWS-native edge; closed last unprotected box (2026-07-06).
- [JDL-13] Live-verified infra documentation: 10 Slite pages, ~95 AWS JSON evidences, 510-line
  risk report (via 7 parallel audit agents). 2026-06.
- [JDL-14] Decommissioned legacy AWS stack (~$1,538/mo): Aurora, 6 Lambdas, VPC/NAT, 8 CFN
  stacks — verified zero residue. 2026-06-17.
- [JDL-15] Estate DNS owner: PowerDNS ~21–27 zones + Cloudflare + registrar (Synergy).
- [JDL-16..18] UptimeRobot prod monitoring; prod-mirror local dev env (204-table DB); multi-org
  Supabase MCP tooling.

### Backups & automation
- [JDL-19] Rebuilt estate backups on AWS DLM after discovering silent 0-snapshot policy;
  daily×7 + weekly×4 across all prod volumes (~$6–8/mo). 2026-07-11.
- [JDL-20] Nightly Zoom→NAS archiver (systemd, S2S OAuth), account-wide since ~Nov 2025.
- [JDL-21] Cron/log hygiene estate-wide (root-caused 105,436 junk files; logrotate rollout).
- [JDL-22] 2.59 TB / 282k-file offboarding migration (rclone→MEGA, size-verified); reclaimed
  ~5 TB (92%→28%, 90%→42%) + ~190k-row FileRun DB cleanup.

### Security & incidents
- [JDL-23] Web-layer hardening sprint: SSRF filter (IPv6/CGNAT), HttpOnly auth cookie,
  per-user signed CSRF, CloudFront security headers ×12 behaviors ×3 dists — 18 commits,
  5 adversarial QA rounds, deployed all 3. 2026-07-10.
- [JDL-24] JWT-rotation incident: 46 uncaught 500s → decode guard + config write-failure fix;
  5,573 bcrypt hashes, 0 MD5 left. Same-day. 2026-07-10.
- [JDL-25] Estate-wide auth-gate content leak (missing `exit;` after 302) fixed across 163
  files / 422 sites, deployed all 3. 2026-07-06.
- [JDL-26] Live SQLi-scanner incident (326 malicious POSTs, second-order payloads): purge +
  read-side escape + validation hotfix, all 3 servers, same-day. 2026-07-06/07.
- [JDL-27..29] VPTech security-review remediation (2 WP compromises cleaned, HSTS estate-wide);
  public API-key leak closed; CloudFront/phpMyAdmin auth-loop root-caused.
- [JDL-30] WAF COUNT→BLOCK + origin lockdown (X-Origin-Verify, prefix-list SGs) program.
- [JDL-43] Demo source-code-leak (PHP 8.1-FPM short-tag break across 195 files): surgical fix,
  zero collateral. 2026-07-08.
- [JDL-44/45] Disk-full prod incident (116G at 100%): freed, retired rsync layer, EBS snapshots;
  latent cross-tenant config bug fixed. 2026-07-11.

### Client delivery & product
- [JDL-31/32] Full comms-stack onboarding for new client Clearline: Twilio (AU regulatory
  bundle, SMS live), SendGrid (domain auth, inbound parse), Gmail OAuth, Stripe LIVE —
  end-to-end verified; same-day fix of a stale-token 401 incident blocking all registrations.
- [JDL-33/34] Live Twilio/SendGrid estate audit (reference doc); Connect SMS/WhatsApp
  delivery-status pipeline fix shipped to all 3.
- [JDL-35] Production Voice-AI phone callers (Retell): migrating to company-owned workspaces
  incl. agent + SIP number export/import. (?) CRM Retell integration build attribution.
- [JDL-36..38, 40..42] Config-driven white-labelling (videos, support link), /apidocs client-key
  onboarding portal, Ticket System client workspaces + triage alerts shipped to prod.
- [JDL-39] (?) DocuSign signature-impersonation JWT + Synthesia AI-video status integration —
  confirm attribution/date.

### Org & leadership signals
- [JDL-46/47] Drove JDL cost-review + access handover; owns WG/JDL account-separation
  workstream (15-card board), delegating to two staff.
- [JDL-49..52] De-facto lead/sole infra engineer (servers, AWS, DNS, backups, security,
  deploys/rollbacks ×3 prod); coordinates second dev (Oliver) + non-technical staff; leads
  client onboarding directly; "Senior PM" pattern directing AI engineering agents with
  ship/no-ship authority; reports to founder (Natan).

## 5. Projects (personal / freelance / research-adjacent)

- [PRJ-NINA] **Nina Nails booking platform** (client product, 2026-05→07): Next.js 15 /
  React 19 / TS / Supabase / Vercel; ~15.1k LOC, 86 commits; Google Calendar + transactional
  email (Resend); 3-tier tests (Vitest + Playwright e2e + axe a11y). Live for a real salon.
- [PRJ-GIPC] **gipc.dev platform** (2026-06→): self-hosted portfolio/ops platform — bare-metal
  k3s on repurposed hardware, Cloudflare Tunnel (zero inbound ports), IaC in repo, holding page
  live at https://gipc.dev; planned monorepo Next.js + Go + FastAPI + Postgres/pgvector +
  Prometheus/Grafana/Loki. DNS/mail estate migration done solo [JDL-09].
- [PRJ-MARM] **Marmousi-2 seismic inversion POC** (2026-01→02): PyTorch U-Net (12.5M params)
  inverting synthetic seismograms (2,000 shot gathers via Deepwave differentiable wave sim);
  L1+SSIM loss; functional-core design; 27 deterministic unit tests; CUDA/MPS/CPU.
- [PRJ-SYNC] **Mac-Gar_Sync** (2026-06): cross-OS (Arch⇄macOS) zero-loss dev-state sync —
  3 transport lanes (git/Syncthing/path-translating rsync), systemd+launchd backstop timers,
  credential-exclusion guards, e2e handoff test.
- [PRJ-AGTM] agent-manager (2026-02→03): Node/Express config-sync engine, 6 pluggable
  adapters for coding-agent configs, timestamped backups.
- [CV-PROJ-POOL] Real-time drowning-detection R&D (2024→2026, Griffith×Huizhou): edge CV on
  RPi/ARM ≥20fps at 95%+ accuracy, sub-100ms multi-sensor fusion, Docker/K8s + Azure fallback,
  MySQL telemetry; 6-person cross-site team; → **published, see PUB-1**.
- [CV-PROJ-FIN] Transformer financial-prediction platform (2023–2024, Griffith): Node.js+Python
  orchestration, AKS deploys, 3M+ records/day ETL <200ms, ~12% MAE reduction, Bicep/Terraform
  IaC, >90% test coverage; docs adopted by two subsequent research groups.

## 6. Research & PhD

- PhD Computer Science, Griffith (2025→2028 exp.). Supervisors: Dr Larry Wen, Dr Qinyi Li.
- Thesis: **"Generalisation and Operational Readiness of AI-Based Drowning Detection Systems:
  Characterisation, Mitigation, and Low-Cost Deployment"** — 5-chapter, 36-month program;
  cross-environment benchmark + domain adaptation + edge deployment. **Confirmation seminar
  2026-04-29** (panel of 4). [NEEDS-EVIDENCE: confirmed outcome — passed?]
- SLR (Chapter 1): 82 papers screened, original evaluation framework → basis of PUB-1;
  IEEE Access revision workflow evidenced.
- Research themes on CV: hierarchical self-reconfiguring agents (<300ms reconfig, >94% accuracy
  in stress tests); applied tracks: aquatic safety, SAT-based data-centre scheduling, multi-agent
  traffic control, fusion-reactor control sim.
- **Xidian University (Guangzhou Institute) research fellowship — completed** (6 weeks, late
  2025; AI/Big Data/Embedded). Confirmed by Gabriel 2026-07-11.
- XAI comparative study (SHAP/LIME/Grad-CAM) — active (GitHub profile). 
- RA to Dr Larry Wen, Feb–Nov 2024 (WIL: ML, cloud, data projects; supported PhD researchers).
- Griffith casual academic role (Visa-189 dossier). [NEEDS-EVIDENCE: role details — tutoring?]

## 7. Publications

- [PUB-1] **"Artificial Intelligence for Drowning Detection: Technical Feasibility Established,
  Operational Viability Unproven."** *IEEE Access*, vol. 14, pp. 97604–97628, Jan 2026.
  DOI: 10.1109/ACCESS.2026.3701060. CC BY 4.0. (First-author status — [NEEDS-EVIDENCE: confirm
  author list/order for citation.])

## 8. Education

- PhD Computer Science — Griffith University — 2025→2028 (expected) — §6.
- **Master of Information Technology** — Griffith — Dec 2024 — **High Distinction, GPA 6.63/7**;
  Griffith Award for Academic Excellence **2023 & 2024**; thesis: Scalable Transformer-Based
  Financial Predictive Analytics (Dr L. Wen). ACS-assessed = AQF Master, ICT major [CERT-1].
- **Bachelor of Laws (LLB)** — Universidade Federal do Paraná, Brazil — 2018 — High Distinction
  (GPA 0.8592/1.0); honours: Social Relations Law.

## 9. Certifications & assessments

- [CERT-1] **ACS Migration Skills Assessments** (ref ACS-0044338, 15-Apr-2026, valid 24 mo):
  suitable for ANZSCO **261312 Developer Programmer**, **261313 Software Engineer**,
  **261316 DevOps Engineer** (skilled date 16-Dec-2024). Work experience assessed under own
  name (contractor structure).
- IELTS 8.0 (Visa-189 dossier). [NEEDS-EVIDENCE: test date for validity window]

## 10. Awards & extras

- ICPC 2024 — **3rd place, South Pacific regional, Level B division** (team).
- Griffith Award for Academic Excellence — 2023 and 2024.
- Griffith Coding Club — led weekly DS&A workshops + team labs (ICPC prep curriculum:
  recursion → DP), under Dr L. Wen.
- Research seed-funding application contribution (Games Impact/IEE GEP Catapult 2026 —
  partner-engagement workstream).

## 11. Earlier career (pre-tech, keep to one line on resume)

- 4 legal roles in Brazil post-LLB (Visa-189 dossier) — frame as: professional background in
  law before retraining into software engineering. [NEEDS-EVIDENCE: exact roles/years if ever needed]

## 12. Agent notes (binding)

1. Zero-fabrication: cite ids; **(?)**/[NEEDS-EVIDENCE] items are unusable until confirmed.
2. JDL is a two-dev shop (Gabriel + Oliver): claim ownership only where evidenced
   ("sole builder" only for Ticket System, Olivia, migrations, infra ownership per ids).
3. GitHub social proof is weak (0 stars) — never cite stars/followers; cite substance
   (commits, LOC, deployments, tests).
4. Street address, phone: private exports only. resume.json public build = suburb + email + links.
5. "Company: PADUA CARVALHO, GABRIEL ISAIAS" in ACS letters = contracting structure; resume
   presents the JDL/WealthGoal engagement — do not misrepresent employment form if asked.
6. En-AU spelling everywhere.

## 13. Open questions for Gabriel ([NEEDS-EVIDENCE] queue)

1. JDL months 1–14 (Dec 2024→Feb 2026): main shipped work beyond the Voice AI alpha?
2. Voice AI system post-alpha: evolved, shelved, or superseded by Retell callers?
3. [JDL-39] DocuSign + Synthesia integrations — yours? when?
4. [JDL-48] "new era" seismic-modelling WG feature — what is it (public-safe)?
5. PhD confirmation outcome (passed?) + IEEE paper author order.
6. IELTS test date; Griffith casual-academic role details.
7. Nina Nails: paid client? public reference OK?
