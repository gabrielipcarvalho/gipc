# Tech Stack & Architecture — gipc.dev

> Locked 2026-06-16. Polyglot, containerized, observable, GitOps'd — the stack is itself
> portfolio content for a DevOps · Backend · AI · full-stack engineer.

## Locked choices
| Concern | Choice |
|---|---|
| Frontend | **Next.js** (React, App Router) · Tailwind CSS · Framer Motion |
| Core backend | **Go** — systems/realtime/orchestration |
| AI backend | **Python** (FastAPI) — agent, RAG, JD-tailoring |
| Datastores | **Postgres** (+ **pgvector**), **Redis** |
| Observability | **Prometheus** + **Grafana** + **Loki** (on display) |
| Orchestration | **k3s** (lightweight Kubernetes) |
| Edge / proxy | **Cloudflare** + **Caddy** (auto-TLS) |
| Sandbox | **gVisor/Firecracker** microVMs + **ttyd**, driven by Go |
| IaC / CI-CD | **Terraform** + **Ansible** + **GitHub Actions** (→ GitOps) |
| LLM | **Claude** (latest) + optional self-hosted **Ollama** |

## Why this stack
- **Go core** = the DevOps/systems signal (k8s, docker, prometheus are Go); ideal for the realtime,
  metrics, webhook, and sandbox-orchestration work.
- **Python AI** = best agent/RAG ecosystem + the Anthropic SDK.
- **Next.js** = SEO (SSG/SSR) for content pages + streaming for the AI chat + huge hireability.
- **k3s** = lets the "control plane" concept and the self-healing/chaos demos be *real*.

## Proposed monorepo layout
```
gipc/
  apps/
    web/                 # Next.js — the operator console UI (design system, hero, pages)
  services/
    core/                # Go — REST/WS API, metrics aggregation, deploy webhooks,
                         #      rate-limit, API playground, sandbox + chaos orchestrator
    ai/                  # Python FastAPI — operator agent, tools, RAG, JD-tailoring, streaming
  packages/
    tokens/              # shared design tokens (from design-system.md)
  infra/
    terraform/           # VPS + DNS + Cloudflare provisioning
    ansible/             # host hardening + base config
    k8s/                 # k3s manifests / Helm / kustomize
    compose/             # local-dev docker-compose (web, core, ai, pg, redis, prom, grafana)
  .github/workflows/     # CI: build/test/scan → push images → deploy (GitOps)
```

## Key data flows (all real)
- **Live status strip:** Prometheus scrapes services → Go `core` aggregates → `GET /api/status`
  (SSR initial paint) + SSE/WebSocket stream for live updates → Next.js renders the bars.
- **AI operator:** Next.js chat → stream to Python `ai` → agent calls tools: `core` (live metrics),
  pgvector (RAG over work/résumé), GitHub API (deploys) → streams tokens **+ trace events** back →
  UI shows the answer and a live tool-call trace panel.
- **Deploy feed:** GitHub Actions deploy step → webhook → `core` stores event → `GET /api/deploys`
  → UI feed (commit → stages → live).
- **Sandbox shell:** UI requests session → `core` launches an ephemeral gVisor/Firecracker microVM
  running ttyd → proxies the WS → hard caps + auto-destroy on idle/timeout.
- **Chaos demo:** UI → `core` → k3s API deletes a pod **in the `demo` namespace only** →
  Prometheus shows recovery → UI visualizes self-healing. Blast radius contained by namespace.

## Local dev vs prod
- **Local:** `docker compose up` brings up web + core + ai + postgres + redis + prometheus + grafana.
- **Prod:** images built in CI → deployed to **k3s** on the VPS; Caddy terminates TLS behind Cloudflare.

## Build phasing (only a slice is needed early)
- **P0 — Foundation:** `infra/` (Terraform VPS+DNS, Ansible hardening, Caddy, k3s install), CI/CD
  skeleton, mail server. Deploy a static `web` shell.
- **P1 — The Console:** full `apps/web` (design system, hero, timeline, work, résumé) + minimal Go
  `core` (status API from host metrics, deploy feed) + Postgres + Prometheus/Grafana + Caddy + CF.
- **P2 — The Operator:** Python `ai` (agent + RAG + JD-tailor) + pgvector + Turnstile + trace panel.
- **P3 — The Lab:** sandbox shell (gVisor), load + chaos demos (k3s), API playground. *Hardened.*
- **P4 — Flair:** AI Theme Studio, CTF flag, signature animations, more demos.

## Still to decide (Phase 0 planning)
VPS provider + size + budget; domain-migration path for `gipc.dev` off the company server; mail
server choice (e.g., Stalwart / Mailcow / Maddy); registrar/DNS specifics; backup strategy.
