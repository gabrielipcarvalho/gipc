# gipc.dev — Feature Backlog

> Everything recorded across the planning corpus (`concept-and-feature-design.md`,
> `design-system.md`, `tech-stack.md`, `kaveenk-design-analysis.md`,
> `activetheory-design-analysis.md`, spec/CLAUDE NOT-lists) that is **not yet built**.
> Complete as of the site **v1** sprint (6 phases shipped on `sprint/site-v1`:
> shell/⌘K · Console polish · /work · Construct résumé · /system stub · connect+SEO).
>
> Grouped by theme below; sequenced into **sprints** by service + risk boundary at the top.
> The list is exhaustive against written docs; ideas raised only verbally in chat are not
> guaranteed captured.

## Sprint map (how this backlog gets built)

The 12 themes are **not** 12 phases — they differ wildly in scope and, critically, in
autonomy-safety. Frontend/`apps/web` work is reversible and was run hands-off in v1; the
backend milestones touch `infra/`, secrets, the deploy pipeline, and stand up a public
shell + an AI agent with real infra tools — those need human-in-the-loop, not a blind loop.

| Sprint | Scope | Autonomy | Draws from |
|--------|-------|----------|------------|
| **A — site-v1.1: promises & polish** | `apps/web` + data only, reversible | **Full-autonomy-safe** (like v1) | §4 §5 §6 §7 §8 §9 |
| **B — M3 core + telemetry** | Go `services/core`, Prometheus/Grafana/Loki, SSE, webhooks, Caddy, Terraform/Ansible | Human-supervised (touches infra) | §1 |
| **C — M4 Operator** | Python `services/ai`, pgvector, Turnstile, keys, RAG, JD-paste | Supervised (secrets, depends on B) | §2 |
| **D — M5 Lab** | sandbox shell, chaos, load — security-critical | Most-supervised, last, gated on hardening | §3 |
| off-site | companion dashboard | separate project | §11 |

§10 is out-of-scope-recorded; §12 is accepted deferrals (not work).

---

## 1. Real telemetry backend (M3 SHIPPED; Sprint H killed the LAST stubs — annotations inline)

- **Real Prometheus metrics off the box** (req/s, p99 latency, error rate, CPU/mem of the very
  machine serving the page). ✅ SHIPPED M3; the LAST placeholders (web /api/telemetry topology
  stub + the fabricated console/titlebar numbers) killed Sprint H P1 — real /api/topology +
  honest chrome.
- **Grafana + Loki "on display"** — tech-stack locks observability as *portfolio content*:
  public, arcane-themed Grafana-style panels + a log surface, not just internal tooling.
  ✅ SHIPPED Sprint H P2 — native deep-dive panels + log volume through core, queries on display
  (/system "deep scry"). Public Grafana embedding = documented cut (CSP-safe native panels
  instead; Grafana stays private).
- **Real deploy/CI feed** — GitHub Actions deploy step → webhook → Go core stores event →
  `GET /api/deploys`; UI animates commit → build → test → deploy → live. Stub list today (real
  commit-subject format already matched).
- **Live streaming, not polling** — tech-stack locks *SSR initial paint* (`GET /api/status`
  server-side) **+ SSE/WebSocket push** for updates; SystemDash currently client-polls every 5s
  with no SSR data.
- **Real per-visitor request trace** — "trace YOUR request": the actual path this visitor's
  request took (edge PoP → tunnel → k3s → pod) with real timings; today one static sample.
- **Incident/status history page** backed by real uptime monitoring (Uptime-Kuma-class).
- **"How this page is provisioned"** — annotated real IaC on display: k8s manifests, Actions
  workflow, tunnel config, kustomize.
- **Go `services/core`** to serve all of it (REST/WS API, metrics aggregation, deploy webhooks,
  rate-limiting) — dir doesn't exist.
- **Missing infra the locked stack names:** Caddy (auto-TLS reverse proxy — tunnel currently hits
  NodePort directly), Terraform + Ansible under `infra/` (provisioning is hand-built),
  `infra/compose/` local-dev stack (web+core+ai+pg+redis+prom+grafana via one `docker compose up`).
  ✅ compose SHIPPED Sprint H P5 — **sans redis** (user-approved cut: in-process limiter, Redis
  never deployed); slim + obs + ollama profiles behind a local Caddy at :8088. Caddy shipped M3.
  Terraform/Ansible skeleton shipped Sprint C — k8s namespaces + host playbook (check-only;
  deferred depth: k3s version-pin, cloudflared config/unit templates, sshd assertions); the Cloudflare
  provider half (tunnel + DNS as import-ready resources) shipped Sprint I P4; applying/importing
  = deliberate future step. (The Sprint H "remains open" annotation was wrong — corrected I P4.)

## 2. The AI Operator (M4 — flagship #2; CORE SHIPPED M4, DEPTH SHIPPED Sprint G — annotations inline)

- **Tool-using agent over real infra**: "what's the load?" → queries Prometheus; "when did you
  last ship?" → reads CI; allowlisted read-only tools, scoped tokens, full audit log (guardrails).
- **RAG over repos/docs/résumé with inline citations** (Postgres + pgvector — neither deployed). ✅ SHIPPED: pgvector + doc RAG in M4; repo/code RAG in Sprint G P1.
- **Live trace panel** streaming the agent's reasoning + tool calls beside the chat.
- **"Paste a JD"** — the recruiter killer: (a) maps experience to their requirements *with
  evidence*, (b) generates a tailored 60-second pitch, (c) honestly flags gaps.
- **Self-aware site**: agent explains any component by reading its own source. ✅ SHIPPED (Sprint G P1 — build-time code corpus, GitHub-linked citations).
- **Live inference demo** on a small self-hosted model — streaming tokens + latency + cost
  readout (Ollama optional-local is in the locked stack). ✅ SHIPPED (Sprint G P3 — in-cluster
  Ollama qwen2.5:0.5b-instruct, /api/ai/infer + the oracle "local" tab).
- **LLM eval/benchmark dashboard** — real eval results, rigor not just demos. ✅ SHIPPED (Sprint G P4 — committed harness + published scores on /oracle). Follow-up: judge-model == answer-model (self-judging flatters) — future cross-model judge.
- **Oracle→Construct hook**: agent calls the Construct's `scrollTo(station)` — "show me the k8s
  experience" descends + decodes that card (blueprint §12.5).
- **Context injection** (AT §8): viewing a project prepends "I'm looking at <project>…". ✅ SHIPPED (Sprint G P2 — ?ctx= typed slugs, server-resolved allowlist).
- **Voice in/out** (AT-recorded): Vosk in-browser STT + streaming TTS — keys server-side only. → DEFERRED to Sprint I (user-approved cut at Sprint G planning).
- **Cloudflare Turnstile** bot-gating on the chat (locked, tech-stack P2). NOTE: the deployed secret is still the always-pass TEST key — swap the real secret (user credential wall) and the gate arms itself, zero code change.
- Python `services/ai` (FastAPI) — dir doesn't exist; Redis also required and absent. ✅ services/ai SHIPPED (M4; 149 tests as of Sprint G). Redis never needed (in-process limiter).
- Console `oracle`/`operator` commands currently redirect to /system saying "wiring up (M4)". ✅ WIRED (M4 → /oracle; Sprint G adds slugs + infer/evals commands).

## 3. The Lab (M5 SHIPPED /lab + 5 demos; Sprint H added depth — annotations inline)

- **Real sandbox shell in the browser** — ephemeral gVisor/Firecracker microVM + ttyd, WS-proxied
  by Go core; non-root, read-only rootfs + tmpfs, CPU/mem/PID/time caps, network-isolated,
  per-session teardown, never on the site-serving host.
- **API playground** for a real API — auth, rate limits, pagination, live.
- **Load-test demo** — hammer an isolated endpoint → live latency histogram + tail; hard
  concurrency/rate caps so it can't be weaponised.
- **Chaos button** — kill a replica in a disposable `demo` namespace → watch Prometheus show
  self-healing; blast radius contained by namespace.
- **Live event stream** (WebSocket/SSE) — event-driven architecture on display.
- **Read-only DB explorer** — safe queries against a demo DB + the query plan. ✅ SHIPPED
  Sprint H P3 — disposable demo-ns postgres (150k synthetic rows), 6-query allowlist, real
  EXPLAIN (ANALYZE) plan trees, SELECT-only role. Free-form SQL = documented cut (allowlist v1).
- **Cache/rate-limit visualizer** — Redis hits/misses live. NOT shipped — Redis is a documented
  cut (in-process limiter by design); the M5 rate-limit panel is a different, shipped thing.
- **Architecture decision records** as interactive sequence/ER diagrams from real projects.
  ✅ PARTIALLY SHIPPED Sprint H P4, worded honestly: living diagrams of the REAL request path +
  RAG pipeline on /infra (hand-rolled SVG, fact cards sourced from manifests/code) — not
  per-project ADR sequence/ER diagrams (those remain open).
- WAF + rate-limit + abuse monitoring — the security-hardening workstream gating the milestone.
- `GaussianSplats3D` (AT toolbox) — a future lab toy.

## 4. Résumé / authenticity — recorded promises the site already makes ⚠️

- **The PDF is not actually signed** — /connect says "signed"; the concept + kaveenk reference
  mean *cryptographically* signed (Ed25519 + signature metadata). Options: signed PDF,
  `/authenticity`-style live build verification (asset hashes vs manifest) + drop-a-file verifier.
- **Inline PDF preview** — kaveenk renders the résumé in-page via PDF.js before download; ours is
  download-only.
- **One-click signed-PDF regeneration from resume.json** (today regenerated manually).
- **JD-tailored résumé variants** — reorder/re-emphasise per application, facts never change
  (feeds M4's JD feature).

## 5. Experience timeline (missing page — was in P1 scope)

- **Animated timeline** — concept IA lists it, design-system "inherited-but-evolved" lists it,
  the P1 roadmap includes it. kaveenk's signature: vertical glowing rail (`timeline-rail-pulse`,
  `rail-scroll`, `spine-scan`), flickering nodes, tilt-cards per role, real links out. No route,
  no component. Data exists (resume.json experience/education).

## 6. Construct post-v1 (blueprint §12 deliberately deferred)

- **Audio**: rain hiss + decode ticks, opt-in, off by default, one toggle shared with the
  console; `ios-silent-bypass` for the iPhone mute switch.
- **Shader rain-wipe** — a green rain-wipe view-transition entering the construct.
- **Violet-tinted rain** brand-purity variant (recorded alternative palette).
- **Per-char decode on skills-card bodies** — skipped by the never-wipe-markup guard
  (`<strong>` children); needs the two-node / text-node-targeted approach.
- **True MSDF sigil runes** via AT's `svg2msdf` — current runes are canvas-stroked approximations.
- **Hand-authored `camera-stations.json`** — deviated to code-derived stations (logged).
- **Full device-tier system** (AT: T0–T3 + `?gpu=` override) — only mini frame-budget shipped.

## 7. Work/projects enhancements (recorded patterns, unadopted)

- **Curated deck via URL** (AT §8): `?workids=…`-style links encoding an ordered, filtered
  project deck — a personalised recruiter lineup in one URL.
- **Per-project coloured corner glows** (kaveenk §4.4: each card its own accent); ours are all
  violet.
- **Inline expand / project detail** views (spec offered links OR expand; links chosen for v1).
- **Projects as runnable artifacts** — "each project = a runnable/inspectable artifact"
  (ties into Lab demos + repo links).
- **CMS-style content pipeline** (AT §9) — projects.json/resume.json are committed code.

## 8. Site-layer polish gaps (v1.1 candidates)

- **Page transitions** — fade + `translateY(12px)`, ~180ms (design-system motif, never built).
- **Typewriter reveal** for terminal text + spark/cursor-flight FX (AT `split-text` staggers it).
- **Data-in count-up** — bars animate but numbers don't count up (motif says both).
- **Cast-ripple** only on the one primary button — extend to ghost buttons/CTAs.
- **`fit-text` / `balance-text`** (AT toolbox) — hero sizing + typography polish.
- **Book-a-call**: placeholder row, no real scheduling (kaveenk uses Calendly at `/meet`).
- **Tailwind CSS + Framer Motion** — in the locked stack table; build is vanilla CSS + hand-rolled
  motion. Ratify-as-changed or adopt.
- OG image: no per-route variants; no `twitter:*` tags (X falls back to OG — acceptable).
- Closable terminal panes + scold joke; footer sign-off line — kaveenk flavor.

## 9. Identity / fun / easter eggs (concept "Phase 4 Flair")

- **Hidden CTF flag** + the hint-placement trick (robots.txt / source).
- **`.hidden`** appears in `ls` but leads nowhere — no route/egg behind it.
- **Vim-key easter eggs**; **Konami-style unlock** that *persistently* stamps "last login".
- **AI Theme Studio** — describe a mood → LLM regenerates palette applied live via the token
  system (console `theme` says "later"; kaveenk's `--theme-*` var architecture is the model).
- **"You're visitor #N from [geo] — here's your request trace"** privacy-respecting greeter.
- **Crypto-signed / GitHub-auth guestbook.**
- **Animated signature reveal** (kaveenk `signatureReveal` — candidate for the identity card).
- **Writeups/blog** — kaveenk `/writeups`; implied by "RAG over your work/résumé/**blog**".

## 10. Explicitly out-of-scope but recorded (decide-later)

- **Multiplayer presence** — AT Dreamwave: scroll-synced visitors, QR-shared rooms.
- **Site-wide music player** (AT chrome); our audio decision is construct-only opt-in.
- **`activeframe`** WebCodecs video — only if scrub-synced video is ever needed.
- **auth** (login/sessions/accounts) — no auth anywhere; prerequisite the guestbook /
  GitHub-auth / companion-dashboard items assume.

## 11. Job-hunt tooling (off-site, same stack)

- **Private companion dashboard**: application tracker, JD scraping/mining, cover-letter drafting.
- ChatGPT export still pending → mine into `career/career-mcd.md` when it arrives.

## 12. Accepted deferrals & operational notes (QA-logged — don't re-litigate blindly)

- **kube-router same-ns NetworkPolicy ingress is broken on this k3s** (Sprint G P3): a policy with
  same-namespace podSelector/namespaceSelector from-rules REJECTS all pod traffic regardless of the
  allow rules; cross-ns policies (postgres) work. Ollama runs without a netpol + compensating
  controls (ClusterIP-only, no SA token, non-root/ro-fs/seccomp; the demo ns is egress-locked).
  Revisit if the CNI changes.

- Jack-in veil can flash the mode-snap if first paint lags >~37ms on low-end devices.
- Back/forward into /resume lands the camera slightly off-station once (self-corrects on scroll).
- Immersive mode registers as CLS in Lighthouse (veil hides it visually — intentional).
- Non-mouse (pen) pointers don't tilt-hover (deliberate touch-jitter guard).
