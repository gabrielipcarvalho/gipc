# gipc.dev — the site
url: /

gipc.dev is Gabriel Carvalho's self-hosted operator console — a portfolio that IS the product. Instead of
static screenshots, every metric, deploy and log on the site is live from real infrastructure he runs.
The interface is styled as an arcane terminal ("the Console"): violet/cyan on black, IBM Plex Mono, a
command palette (⌘K), and an interactive shell on the home page with commands like `whoami`, `ls`,
`oracle`, and a hidden CTF flag. The résumé exists both as a recruiter-friendly document and as "the
Construct" — a Matrix-styled immersive mode at /resume.

# The platform — how it runs
url: /infra

The whole site is self-hosted on a single-node k3s (Kubernetes) cluster on a home server called garuda.
Requests arrive through a Cloudflare Tunnel (no inbound ports), hit a Caddy reverse proxy inside the
cluster, and route to a Next.js 15 frontend, a Go backend (services/core), and a Python AI service
(services/ai). Deploys are GitOps: push to main → GitHub Actions builds container images → GHCR →
the image tag is pinned into kustomize manifests → the cluster reconciles to it (ArgoCD syncs the web app;
the core and AI services are applied from the same pinned manifests). The /infra page renders the REAL
manifests, workflow and tunnel config straight from the repo.

# Live telemetry — /system and /status
url: /system

The /system page is real observability, not a mockup: Prometheus scrapes the cluster (request rate, p99
latency, error rate, CPU, memory), metrics stream to the browser over Server-Sent Events, a deploy feed is
wired to the actual CI pipeline via HMAC-signed webhooks, logs surface from Loki (redacted server-side),
and a per-visitor trace shows the real path a request took (Cloudflare edge PoP → tunnel → Caddy → pod).
/status shows uptime and incident history from probes the Go core runs against its own dependencies every
30 seconds. Grafana, Loki and Prometheus run in an isolated observability namespace.

# The AI Operator — this service
url: /system

The oracle is the site's AI layer (M4), being built now. Its foundation is live: a Python FastAPI service
(services/ai) with retrieval-augmented search over a curated public corpus (this résumé, the projects,
these explainers), embedded locally with an ONNX model (bge-small-en-v1.5) into Postgres + pgvector —
so the vectors never leave the box. The retrieval endpoint returns cited results from that corpus today.
The conversational oracle layer on top — an operator persona that cites its sources and calls a fixed set
of read-only tools against the site's own public APIs, Cloudflare Turnstile bot-gating, per-IP rate limits,
and a hard daily cost budget — is in progress; generation there uses the Anthropic API. The search service
is already rate-limited per IP.
