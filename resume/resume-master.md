# Gabriel Isaias Padua Carvalho
**Software · DevOps · AI Engineer**

Gold Coast, QLD · gabriel@gipc.dev · gipc.dev · linkedin.com/in/gabriel-ipcarvalho · github.com/gabrielipcarvalho

---

## Profile

Software, DevOps and AI Engineer who ships production systems end to end — from AWS
infrastructure and CI/CD to LLM-powered products. Sole engineer on a multi-server
financial-services CRM estate: two production server migrations, estate-wide security hardening
and incident response, and multiple production AI systems (voice, WhatsApp, ticket triage). PhD
candidate in adaptive, agentic multi-agent AI and first-author IEEE Access publication,
ACS-assessed for Software Engineer, Developer Programmer and DevOps Engineer. Full Australian
working rights (HDR student visa to 2029); open to Melbourne relocation.

---

## Skills

- **Languages:** Python · PHP · TypeScript / JavaScript · SQL · Bash · C / C++
- **Cloud & Infrastructure:** AWS (EC2, S3, Lambda, DynamoDB, API Gateway, CloudFront, WAF, ACM,
  Route 53, IAM, SES, Bedrock, EBS/DLM, GuardDuty) · Azure (AKS, Bicep) · Cloudflare (Tunnel,
  WAF, DNS) · Linux (Ubuntu, AlmaLinux, cPanel/WHM)
- **DevOps & Platform:** Docker · Kubernetes (k3s, AKS) · Terraform · Bicep · CI/CD & git-driven
  deploys · observability & monitoring (CloudWatch, UptimeRobot) · WireGuard · Tailscale · systemd
- **AI & ML:** LLM production systems (Bedrock/Claude, GPT-4o-mini, Deepgram, Retell) · prompt &
  conversation-flow engineering · agentic & multi-agent systems · RAG · MLOps · model evaluation,
  guardrails & XAI · PyTorch · TensorFlow · Hugging Face · CNN / U-Net · Transformers
- **Data:** PostgreSQL / Supabase · MySQL · DynamoDB · REST APIs · ETL pipelines · pandas / NumPy
- **Practices:** TDD (pytest, Vitest, Playwright, axe) · IaC · DevSecOps & security hardening ·
  incident response & RCA · functional-core architecture · technical writing

---

## Experience

### WealthGoal Software (formerly part of JDL Strategies) — Software & DevOps Engineer
**Dec 2024 – Present** · Gold Coast, QLD

- Shipped a production **voice-AI qualification agent** — from a self-built AWS Bedrock (Nova
  Sonic) + Twilio prototype to a managed Retell platform — replacing the vendor's extraction with
  a **PHP + GPT-4o-mini pipeline, live September 2025**.
- Built and deployed a standalone multi-tenant **Django support portal** (Python 3.12, Supabase,
  AI-assisted ticket triage) as sole engineer — **604 automated tests** and live client
  workspaces on a functional-core architecture.
- Delivered a production **WhatsApp financial-qualification chatbot** (FastAPI + GPT-4o-mini,
  25-step conversation engine) in **three days**, with idempotent HMAC-validated webhooks, atomic
  opt-out compliance and a single-call prompt design that **cut response latency ~50%**.
- Migrated two production servers to new AWS accounts with row-parity-verified database cutovers,
  and executed the corporate infrastructure separation of the two companies — vhosts, three
  Cloudflare zones and registrar EPP domain transfers.
- Owned the AWS environment — WAF, three CloudFront distributions, ACM, GuardDuty and IAM —
  **decommissioned a legacy stack saving ~US$18k/year**, and rebuilt backups on EBS/DLM snapshots
  after finding the prior policy silently capturing none.
- Designed and built a **WireGuard site-to-cloud VPN** linking an office QNAP NAS to AWS with an
  **NFSv4.1 / FileRun** private-cloud share for the marketing team; after an outage broke it,
  **root-caused the failure to CloudLinux CageFS/LVE namespace isolation** and restored service.
- Led estate-wide security hardening and incident response — a CSRF/SSRF/security-headers sprint
  across three servers (five adversarial QA rounds), a same-day SQL-injection scanner response,
  and an authorisation-gate content leak fixed across **163 files / 422 sites** — alongside
  cPanel/WHM/Imunify360 and Exim/SES mail operations.

### Griffith University — Casual Academic
**2024 – Present** · Gold Coast, QLD

- Teach across Object-Oriented Software Development, Mobile App Development and penetration-testing
  / ethical-hacking courses; lead tutorials and lab sessions.

---

## Selected Projects

- **gipc.dev — self-hosted operator platform** (2026) — Live-demo platform on bare-metal k3s
  behind a Cloudflare Tunnel (zero inbound ports), infrastructure-as-code in-repo; migrated the
  full domain + mail estate solo.
- **Nina Nails — booking platform (client)** (2026) — Full-stack Next.js 15 / React 19 / Supabase
  product on Vercel (~15k LOC) with a three-tier test suite (Vitest, Playwright e2e, axe) and
  Google Calendar + email integration.
- **Seismic inversion (PyTorch U-Net)** (2026) — Reproducible U-Net (12.5M parameters) inverting
  2,000 synthetic seismograms via a differentiable wave simulation; functional-core design, 27
  deterministic tests.
- **Transformer financial-prediction platform (Master's dissertation)** (2023–2024) — Node.js
  orchestration of four fine-tuned OpenAI GPT adaptors (news-sentiment, sentiment+price, price-only
  and a fusion model) predicting daily S&P 500 (SPY) direction across 14 iterative fine-tuning
  cycles; lifted the sentiment+price adaptor from 48% to a peak 60% directional accuracy, evaluated
  with a purpose-built risk-aware confusion matrix; Python data pipeline and LaTeX manuscript.
- **AI drowning-detection research (Griffith × Huizhou)** (2024–2026) — First-author IEEE Access
  paper establishing the technical feasibility of AI drowning detection; now developing the on-device
  (Raspberry Pi/ARM) edge computer-vision system as the core of my PhD — targeting real-time
  inference — informed by a funded cross-site systematic review (~82 papers across six databases).

---

## Publications

- G. I. P. Carvalho *et al.*, **"Artificial Intelligence for Drowning Detection: Technical
  Feasibility Established, Operational Viability Unproven,"** *IEEE Access*, vol. 14,
  pp. 97,604–97,628, Jan. 2026. DOI: 10.1109/ACCESS.2026.3701060. *(First author.)*

---

## Education

- **PhD, Computer Science** — Griffith University — 2025–2028 (expected). Adaptive,
  self-reconfiguring multi-agent AI for real-time decision-making; confirmation milestone passed
  April 2026. Supervisors: Dr Larry Wen, Dr Qinyi Li.
- **Master of Information Technology** — Griffith University — 2024 — High Distinction, GPA
  6.63/7.0; Griffith Award for Academic Excellence (2023 & 2024).
- **Bachelor of Laws (LLB)** — Universidade Federal do Paraná, Brazil — 2018 — High Distinction.

---

## Certifications & Recognition

- **ACS Skills Assessment (2026)** — assessed suitable for Software Engineer (261313), Developer
  Programmer (261312) and DevOps Engineer (261316).
- **IELTS Academic — Overall 8.0** (Listening 9.0), CEFR C1 (2025).
- **ICPC 2024** — 3rd place, South Pacific regional, Level B division.
- **Research fellowship**, Xidian University (Guangzhou), 2025 — AI, Big Data & Embedded Systems.

---

## Leadership & Community

- **Griffith Coding Club** — led weekly data-structures & algorithms workshops and team labs
  preparing peers for the ICPC.
- **Griffith AI Research Colloquium (2026)** — presented early PhD findings on adaptive
  multi-agent systems.
- **Research seed-funding** — contributed the partner-engagement workstream to a 2026 Griffith
  research funding application.

---

*Rendered PDF: `resume/Gabriel_Carvalho_Resume.pdf` (built from `resume/resume.html` via headless
Chrome; single-column, ATS-verified selectable text). Source of truth: `resume/resume.json`.*
