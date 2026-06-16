# gipc.dev — the arcane operator console

Personal portfolio + live-demo platform for **"arcane"** — a DevOps · Backend · AI engineer.
The concept: an **Operator's Console for a real, living system**. Everything on the site is live,
self-hosted, and real — not a mockup.

> **Status:** 🚧 Foundation / build-up. Private during development.

## Decisions locked so far
- **Concept** — operator-console blend: DevOps-real spine · light "arcane" persona · touchable live
  demos. Going *maximal-real* (real telemetry, real AI agent, real shell/chaos).
- **Identity** — Arcane palette: violet `#b18cff` + cyan `#34e6ff` on near-black `#0a0a12`;
  **IBM Plex Mono**; hex-sigil + prompt mark.
- **Stack** — Next.js · Go (core service) · Python/FastAPI (AI service) · Postgres + pgvector ·
  Redis · Prometheus/Grafana/Loki · k3s · Cloudflare (+ Tunnel) · Terraform/Ansible · Claude + Ollama.
- **Hosting** — self-hosted on a dedicated home server (HP EliteBook, Garuda headless) behind a
  **Cloudflare Tunnel**. Mail on a tiny VPS (Stalwart). Total ~$0–5/mo.

## Planning docs
- [Concept & features](concept-and-feature-design.md)
- [Design system / tokens](design-system.md)
- [Tech stack & architecture](tech-stack.md)
- [VPS / hosting research](vps-hosting-research.md)
- [kaveenk.com teardown (inspiration)](kaveenk-design-analysis.md)

## Planned layout (monorepo — to be scaffolded)
```
apps/web/          # Next.js — the operator console UI
services/core/     # Go — API, websockets, metrics, deploy webhooks, sandbox orchestrator
services/ai/       # Python FastAPI — agent, RAG, JD-tailoring
infra/             # terraform · ansible · k8s (k3s) · compose
packages/          # shared design tokens
```

## License
Private — all rights reserved (for now).
