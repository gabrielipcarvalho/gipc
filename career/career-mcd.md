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

## 4. Experience — JDL Strategies → WealthGoal Software (Gold Coast) — Software & DevOps Engineer — Dec 2024 → present

> **Corporate split (end of 2025):** JDL Strategies and WealthGoal split into separate
> companies; Gabriel is now **Software Engineer at WealthGoal Software** (confirmed
> 2026-07-11). Resume presents one continuous engagement: "JDL Strategies / WealthGoal
> Software" with the split noted — he engineered the infrastructure separation itself
> [JDL-06/07/47].
> **Evidence model per period (important):**
> - **Dec 2024 → Oct 2025:** NO Gabriel-authored git commits exist anywhere (mined 2026-07-11).
>   Work in this period was done directly on servers, un-versioned (confirmed by the
>   2025-11-10 "server snapshot import" commit bringing +8,919 LOC of pre-existing ai-agent/
>   Retell/webhook work into git). Evidence = documentary: the ACS assessment validated
>   employment 02-Dec-2024→09-May-2025 + 12-May-2025→22-Feb-2026 [CERT-1], the CV's Voice AI
>   narrative, the voice-ai-client GitHub repo, and Gabriel's testimony (scope: development,
>   maintenance, security, infra & network engineering incl. VPN tunneling, AWS, backups,
>   DevOps, front/back-end, scripting, Linux, AI).
> - **Nov 2025 → Feb 2026:** git-evidenced ([GIT-##] below; 145+ commits).
> - **Mar → Jul 2026:** session-log evidenced ([JDL-##] above).
> Attribution: **Oliver** (owner-dev, ~2,100 commits since 2020) co-develops the CRM; items
> flagged (?) unconfirmed.

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
  **Post-alpha: superseded by the managed Retell-based production callers [JDL-35], which
  Gabriel now operates/migrates** (confirmed 2026-07-11). Resume framing: designed + shipped
  the in-house alpha; production moved to a managed platform he owns.
- [GH/PRJ: Olivia] **"Olivia AI"** production WhatsApp Financial-Wealth-Check chatbot
  (whatsapp.jdl.software): FastAPI + GPT-4o-mini structured extraction, 25-step FSM, atomic
  Postgres RPCs (opt-out, concurrency claim), Twilio HMAC + idempotency, PII-safe logging;
  ~50% latency cut via single-call ack+question architecture. 2026-02→03.

### Chat-evidenced workstreams, ~May → Oct 2025 (un-versioned era; WhatsApp mined 2026-07-11)
> Exports can't show Dec 2024→mid-Aug 2025 directly (device lost pre-re-add group history);
> earliest demonstrable work via retrospective references ≈ May/Jun 2025. Dec 2024→Apr 2025
> remains testimony/ACS-only pending the ChatGPT/Gemini export mining.
- [CHAT-01] Built the in-house **voice-AI alpha on a custom LLM + own training + custom
  server** (~May/Jun 2025, the CV's "5-week alpha") — then [CHAT-02] migrated the stack
  custom-LLM → **AWS Nova Sonic (Bedrock, Tokyo)** → **Retell** by Aug 2025.
- [CHAT-04] Demo **FWC voice-agent call already impressing the team pre-21/8/2025** (Oliver:
  "fucking crazy good!").
- [CHAT-08] **Replaced Retell's flaky native variable-extraction with own PHP endpoints
  calling GPT-4o-mini + confidence scoring — in production Sep 2025.** [CHAT-06/07/09/12]
  Retell function contracts, PHP↔OpenAI mini-server, FWC prompt, web services.
- [CHAT-05/14/15/16] **Mail/DNS backbone:** Twilio + SendGrid SMTP + event-webhook
  bounce-tracking; SES/Exim system filter (solved blind-forward rejections); IMAP wiring;
  DocuSign MX/DNS.
- [CHAT-10/11/13] **AWS account hygiene:** migrated root account off personal emails, created
  system email, IAM role for the AWS-partner team, EC2 bastion to private-subnet RDS.
- [CHAT-17] **Live production firefight** (Oct 2025): /tmp full on the box running
  MySQL/Elastic/cPanel/mail/NFS/WireGuard — bind-mount fix, zero reboot.
- [CHAT-18] Instituted **GitHub branch-per-server** workflow + own dev server (Oct 2025) —
  ended the "edit live on prod" era; precursor to [GIT-04/05].
- [CHAT-20] Delivered the FWC agent while travelling in **China (Oct–Dec 2025)** — the Xidian
  fellowship window; kept shipping remotely.
- Third-party validation: Oliver — *"Gabriel is a pretty good **security expert** when it
  comes to server and webserver."* Also evidenced: Gabriel **teaches penetration-testing /
  ethical hacking at university** (→ §6 casual academic).
- Structure confirmed: dev team = **two freelancers (Oliver = head dev/CTO-role, Gabriel)**;
  Gabriel contractor (matches ACS self-name assessment); AWS partner contacts Gabriel
  directly.

### Gemini + server-shell evidence, Jun → Nov 2025 (full-coverage mined 2026-07-11)
> Gemini export: 2,160 prompts, every title classified (983 work + ~138 work-like
> continuations ≈ 63% work); intensity 21.6 prompts/active-day, peak 97/day (2025-07-30).
> Plus `history_zsh`: **2,367 timestamped commands on the production cPanel box,
> Jun 2025→Jan 2026** [ZSH-01] — imunify360 ×92, exim ×97, backup ×183, cpanel ×204, aws ×32.
- [GEM-01/02] Voice-AI v1 build: **Twilio + AWS Bedrock Nova Sonic, Lambda + WebSocket
  streaming** (Jun 24→Aug 8) + Python outbound-dialer prototype — the "custom stack" phase.
- [GEM-03] **Retell pivot dated:** `retell_call_events.php` created **Sep 15, 2025**; FWC =
  **Financial Wealth Check** agent ("Preliminary_FWC"); **the voice agent is named "Sandra
  AI"**, matured Dec 25→Feb 26 into a Python app (state_machine.py etc.) where git resumes.
- [GEM-05] Exim/SES mail engineering: custom SES transport w/ hardcoded envelope sender,
  `jdl_aws_forwarder_router`, DKIM/SPF/DMARC work (Jul→Nov).
- [GEM-06] AWS IAM/root hygiene + **Identity Center** on account 891377206841
  (ap-southeast-2).
- [GEM-07] cPanel/WHM/CloudLinux ops + **Imunify360 security configuration** (347 security-
  keyword prompts) — corroborates the "security expert" rep.
- [GEM-08/11] PHP + GPT-4o-mini extraction pipeline + `_inc/tools/api_tests.php` key-based
  test harness covering **docusign / corelogic / stripe** endpoints (his DocuSign role =
  testing/integration-support, consistent with the conservative wording).
- [GEM-09/12] Git branch-per-server across prod (`jdluser`@jdl.software, CloudLinux) + new
  **AlmaLinux dev box** (`gabriel@`); EC2/EBS volume resize ops.
- [GEM-04] Archon agent-OS + EmbeddingGemma local-RAG experimentation (Sep→Nov) — genuine
  RAG *experimentation* evidence (still not prod RAG; keyword rules stand).
- [GEM-13] Personal stream (**NOT resume material**): V2Ray/Xray proxy on syd.gipc.dev
  (Nginx+Certbot, Sydney VPS) — personal infra during the China trip; keep off all documents.
- Workload signal: full-time delivery + PhD SLR (48 prompts) + **graded Java OOP course**
  (85 prompts) ran concurrently through the window — interview color for time-management.

### Git-evidenced workstreams, Nov 2025 → Feb 2026 (mined 2026-07-11)
- [GIT-01] **FWC Retell voice-agent (flagship):** ~35 commits (2025-12-11→2026-01-06) — Retell
  AI phone integration, dynamic-variable mapping, agent-selector UI, calendar-booking
  endpoints, brand-specific managers, automation toggles; "ready for internal testing"
  2025-12-18. NOTE: Retell first added by Oliver 2025-08 — Gabriel **inherited and evolved**
  it (resume wording must reflect this; his in-house Voice AI alpha [CV] preceded it).
- [GIT-02] Property-qualification calc backend (~10 commits) feeding the voice agent.
- [GIT-03] Email Module: milestone-gated build — schema+indexes+verification (M1.1), PHP
  backend (GM1.2), **React scaffold, 11k LOC (M1.3)** in-window; Graph sync/tracking/snooze
  landed Mar 2026 → continuous with [JDL-01/02].
- [GIT-04] Deploy tooling: custom Node git-ftp deployer — progress, gitignore-aware deletion
  protection, safe-push (~20 commits).
- [GIT-05] Repo security hygiene: secrets untracked, config templating (2025-11-26).
- [GIT-06] 2025-11-10 first commit: **imported un-versioned server work into git** (+8,919
  LOC, 40 files) + server_setup.sh — evidence that pre-git server work existed.
- [GIT-07] Ticket_System: solo-architected from 2025-11-15 — hexagonal/functional-core domain
  model, Gunicorn+Apache infra, SendGrid, AI-triage proposal (→ [JDL-03]).
- [GIT-08] **WhatsApp "Olivia" chatbot MVP in 3 days** (2026-02-25→27, 29 commits): FastAPI
  FSM, STOP-compliance/blocklist/concurrency guards, typing indicator, Olivia persona (→ Olivia entry above).
- Working style evidenced: milestone/QA-gated commits, doc-first, AI-paired (11 Claude
  co-commits) — [JDL-51] pattern visible in git.

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
  incl. agent + SIP number export/import. Attribution resolved via git: integration
  scaffolding originated with Oliver (2025-08); **Gabriel evolved it to production
  ([GIT-01]) and owns its operation/migration.**
- [JDL-36..38, 40..42] Config-driven white-labelling (videos, support link), /apidocs client-key
  onboarding portal, Ticket System client workspaces + triage alerts shipped to prod.
- [JDL-39] **CONFIRMED Gabriel's** (2026-07-11): DocuSign signature-impersonation JWT
  integration + Synthesia AI-video status integration. He also confirms sole/lead ownership of
  the **entire Email sub-app** (Gmail + MS 365 integrations, flagged addresses, email history
  & threads) [JDL-01/02], the entire support/ticket system [JDL-03], plus the security-fix,
  infra-management and server-management workstreams.

### Org & leadership signals
- [JDL-46/47] Drove JDL cost-review + access handover; owns WG/JDL account-separation
  workstream (15-card board), delegating to two staff.
- [JDL-49..52] De-facto lead/sole infra engineer (servers, AWS, DNS, backups, security,
  deploys/rollbacks ×3 prod); coordinates second dev (Oliver) + non-technical staff; leads
  client onboarding directly; "Senior PM" pattern directing AI engineering agents with
  ship/no-ship authority; reports to founder (Natan).

## 5. Projects (personal / freelance / research-adjacent)

- [PRJ-NINA] **Nina Nails booking platform** (client product — public reference approved
  2026-07-11, 2026-05→07): Next.js 15 /
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
  2026-04-29 — PASSED** (confirmed 2026-07-11; panel of 4).
- SLR (Chapter 1): 82 papers screened, original evaluation framework → basis of PUB-1;
  IEEE Access revision workflow evidenced.
- Research themes on CV: hierarchical self-reconfiguring agents (<300ms reconfig, >94% accuracy
  in stress tests); applied tracks: aquatic safety, SAT-based data-centre scheduling, multi-agent
  traffic control, fusion-reactor control sim.
- **Xidian University (Guangzhou Institute) research fellowship — completed** (6 weeks, late
  2025; AI/Big Data/Embedded). Confirmed by Gabriel 2026-07-11.
- XAI comparative study (SHAP/LIME/Grad-CAM) — active (GitHub profile). 
- RA to Dr Larry Wen, Feb–Nov 2024 (WIL: ML, cloud, data projects; supported PhD researchers).
- **Casual Academic, Griffith University — ongoing**: teaching across Object-Oriented Software
  Development (OOSD), Mobile App Development (MAD), and other courses (confirmed 2026-07-11);
  WhatsApp evidence adds **penetration-testing / ethical-hacking teaching** to the set.

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
- **IELTS Academic — Overall 8.0** (L 9.0 / R 8.0 / W 7.5 / S 8.0), CEFR C1 — 28-Dec-2025,
  TRF 25AU535481PADG900A (2-year recommended validity → Dec-2027).

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

*(2026-07-11 answers folded in above. Remaining:)*
1. IEEE paper author list/order — pull from the DOI landing page at rewrite time.
2. [JDL-48] "new era" seismic-modelling WG feature — what is it (public-safe)?
3. **DocuSign/Synthesia — EVIDENCE-BASED RESOLUTION (2026-07-11, supersedes "co-built"):**
   two independent sources (git + WhatsApp) show the core integration code is **Oliver's**
   ("he's done this flow many times"; Synthesia TEMPLATE_ID commit = Oliver 2026-01).
   Gabriel's demonstrable DocuSign work = **DNS/MX (Oct 2025), the `dochook.php` webhook, and
   full production-account provisioning + handover doc (2026)**; Synthesia = operational
   ownership of video production (later delegated). **Resume wording locked:** "supported the
   DocuSign rollout (DNS, webhooks, production provisioning)" — never "built the DocuSign/
   Synthesia integrations". Gabriel's recollection differs; the conservative wording is what
   survives an interview with Oliver as a possible reference.
4. [CHAT-##] mining DONE. Remaining dark window: **Dec 2024 → Apr 2025** (testimony/ACS only)
   — awaiting ChatGPT + Gemini history exports for mining.
