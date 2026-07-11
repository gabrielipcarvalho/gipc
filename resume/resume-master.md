# Gabriel Isaias Padua Carvalho
**Software · DevOps · AI Engineer**

Gold Coast, QLD · gabriel@gipc.dev · linkedin.com/in/gabriel-ipcarvalho · github.com/gabrielipcarvalho · gipc.dev
*(Full phone/address supplied on application forms — kept out of the shared document.)*

---

## Profile

Software, DevOps and AI Engineer who ships production systems end to end — from AWS
infrastructure and CI/CD to LLM-powered products. Sole or lead engineer on a financial-services
CRM estate: two production server migrations, estate-wide security hardening and incident
response, and multiple production AI systems (voice, WhatsApp, ticket triage). PhD candidate in
adaptive multi-agent AI and first-named IEEE Access author, ACS-assessed for Software Engineer,
Developer Programmer and DevOps Engineer. Australian permanent-residency pathway in progress;
open to Melbourne relocation.

---

## Skills

- **Languages:** Python · PHP · TypeScript / JavaScript · SQL · Bash · C · C++
- **Cloud & Infrastructure:** AWS (EC2, S3, Lambda, DynamoDB, API Gateway, CloudFront, WAF, ACM,
  Route 53, IAM/Identity Center, SES, Bedrock, EBS/DLM, GuardDuty, CloudTrail) · Azure (AKS,
  Bicep) · Cloudflare (Tunnel, WAF, DNS) · Linux (Ubuntu, AlmaLinux, Arch; cPanel/WHM/CloudLinux)
- **DevOps & Platform:** Docker · Kubernetes (k3s, AKS) · Terraform · Bicep · CI/CD & git-driven
  deploy pipelines · Prometheus / Grafana / Loki · observability & monitoring · WireGuard ·
  Tailscale · systemd
- **AI & ML:** LLM production systems (AWS Bedrock/Claude, GPT-4o-mini, Deepgram, Retell) ·
  prompt & conversation-flow engineering · PyTorch · TensorFlow · Hugging Face · CNN / U-Net ·
  Transformers · multi-agent systems · RAG (pgvector) · model evaluation & XAI (SHAP/LIME/Grad-CAM)
- **Data:** PostgreSQL / Supabase · MySQL · DynamoDB · ETL pipelines · pandas / NumPy
- **Practices:** TDD (pytest, Vitest, Playwright, axe) · IaC · DevSecOps & security hardening ·
  incident response & RCA · functional-core architecture · technical writing

---

## Experience

### Software & DevOps Engineer — JDL Strategies / WealthGoal Software, Gold Coast
**Dec 2024 – Present** *(companies split late 2025; now Software Engineer at WealthGoal Software)*

Primary infrastructure, backend and AI engineer for a financial-services CRM estate serving
multiple client businesses (two-person engineering team).

- Designed and shipped a production **voice-AI qualification agent**, evolving it from a
  self-built AWS Bedrock (Nova Sonic) + Twilio streaming prototype to a managed Retell platform,
  and **replaced the vendor's native data-extraction with a PHP + GPT-4o-mini pipeline (with
  confidence scoring) that went live in September 2025**.
- Built and deployed a standalone multi-tenant **Django support portal** (Python 3.12, Supabase,
  AI-assisted ticket triage) as sole engineer — **604 automated tests** and live client
  workspaces on a functional-core architecture.
- Delivered a production **WhatsApp financial-qualification chatbot** (FastAPI + GPT-4o-mini,
  25-step conversation engine) in **three days**, with idempotent HMAC-validated webhooks,
  atomic opt-out compliance, and a single-call prompt design that **cut response latency ~50%**.
- Migrated two production servers to new AWS accounts (Ubuntu) with row-parity-verified database
  cutovers, and executed the corporate infrastructure separation of the two companies —
  vhosts, three Cloudflare zones (49 records) and registrar EPP domain transfers.
- Owned the AWS estate: WAF, three CloudFront distributions, ACM, GuardDuty and IAM across
  account 891377206841; **decommissioned a legacy stack saving ~US$1,538/month** and rebuilt
  backups on EBS/DLM snapshots after finding the prior policy silently capturing none.
- Led estate-wide security hardening and incident response — a CSRF/SSRF/security-headers sprint
  (18 commits, five adversarial QA rounds, deployed to three servers), a same-day SQL-injection
  scanner response, and an auth-gate content-leak fix across **163 files / 422 sites** — with
  ongoing cPanel/WHM/Imunify360 and Exim/SES mail-infrastructure operations.

### Casual Academic — Griffith University, Gold Coast
**2024 – Present**

- Teach across Object-Oriented Software Development, Mobile App Development and
  penetration-testing / ethical-hacking courses; lead tutorials and lab sessions.

---

## Selected Projects

- **gipc.dev — self-hosted operator platform (2026):** Personal live-demo platform on bare-metal
  **k3s** behind a **Cloudflare Tunnel** (zero inbound ports), infrastructure-as-code in-repo,
  live at https://gipc.dev; migrated the full domain + mail estate solo (Cloudflare DNS, Migadu).
- **Nina Nails — booking platform (2026, client):** Full-stack **Next.js 15 / React 19 /
  Supabase** product on Vercel (~15k LOC) with a three-tier test suite (Vitest, Playwright e2e,
  axe accessibility) and Google Calendar + transactional-email integration.
- **Seismic inversion (2026):** Reproducible **PyTorch U-Net (12.5M parameters)** inverting 2,000
  synthetic seismograms via a differentiable wave simulation; functional-core design, 27
  deterministic tests.
- **Transformer financial-prediction platform (2023–2024, Griffith):** Node.js + Python
  orchestration deploying models to Azure Kubernetes; ETL over **3M+ records/day at <200 ms**,
  **~12% MAE reduction**, IaC (Bicep/Terraform), >90% test coverage.
- **Real-time drowning detection (2024–2026, Griffith × Huizhou):** Edge computer-vision on
  Raspberry Pi/ARM at **≥20 fps and 95%+ accuracy**, sub-100 ms multi-sensor fusion, containerised
  with cloud fallback — published in IEEE Access (below).

---

## Publications

- G. I. P. Carvalho *et al.*, **"Artificial Intelligence for Drowning Detection: Technical
  Feasibility Established, Operational Viability Unproven,"** *IEEE Access*, vol. 14,
  pp. 97,604–97,628, Jan. 2026. DOI: 10.1109/ACCESS.2026.3701060.

---

## Education

- **PhD, Computer Science** — Griffith University — 2025–2028 (expected). Adaptive, self-
  reconfiguring **multi-agent AI** for real-time decision-making; confirmation milestone passed
  April 2026. Supervisors: Dr Larry Wen, Dr Qinyi Li.
- **Master of Information Technology** — Griffith University — 2024 — **High Distinction, GPA
  6.63/7.0**; Griffith Award for Academic Excellence (2023 & 2024).
- **Bachelor of Laws (LLB)** — Universidade Federal do Paraná, Brazil — 2018 — High Distinction.

---

## Certifications & Recognition

- **ACS Skills Assessment (2026):** assessed suitable for ANZSCO **Software Engineer (261313)**,
  **Developer Programmer (261312)** and **DevOps Engineer (261316)**.
- **IELTS Academic — Overall 8.0** (Listening 9.0), CEFR C1 (Dec 2025).
- **ICPC 2024 — 3rd place**, South Pacific regional, Level B division.
- **Six-week research fellowship**, Xidian University (Guangzhou), 2025 — AI, Big Data & Embedded
  Systems.
- Griffith Coding Club — led weekly data-structures/algorithms workshops (ICPC preparation).
