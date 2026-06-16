# Design Teardown — kaveenk.com (Kaveen Kumarasinghe portfolio)

> Reverse-engineered from the live site on 2026-06-16: raw HTML, the production CSS
> bundle (`index-ruJZcVy6.css`, 253 KB), the JS bundle (`index-CGACDnhZ.js`, 1.67 MB),
> the favicon/OG assets, and headless-Chrome renders at desktop (1440px) and mobile (390px).
> Reference assets saved under `.research/kaveenk/`.

---

## 1. The core concept

It is a **portfolio styled as an interactive terminal / developer OS**. The entire site
is framed as windows in a dark terminal: traffic-light dots, a `kaveenk:~/portfolio`
title bar, shell prompts (`kaveenk:~$ whoami`), and command-styled links
(`sudo ./netintel & authenticity`). It is dark-only, monospace-first, neon-mint, with a
faint CRT scanline texture and a heavy dose of tasteful motion.

It is **not** a static résumé page. It is a *showcase of live, interactive engineering
demos* — many explicitly captioned as "mostly written autonomously by agents during my
various AI agency experiments." The site itself is the biggest portfolio piece.

**One-line positioning (his own words):** *"All-hands engineer building performant,
scalable systems."* Hero tagline: *"Crafting performant, scalable systems."*

---

## 2. How it's built (front-end tech stack)

| Layer | Choice |
|---|---|
| Framework | **React** (SPA, single `<div id="root">`, client-rendered) |
| Build tool | **Vite** (hashed `assets/index-*.js` + `assets/index-*.css`) |
| Hosting / CDN | **Cloudflare** (Rocket Loader, Turnstile, speculation-rules prefetch) |
| Routing | Client-side router; 14 routes all served from one `index.html` |
| Realtime | **Socket.IO / engine.io** (live telemetry on status & tools) |
| PDF | **PDF.js + react-pdf** (inline résumé rendering) |
| Markdown | **react-markdown** (writeups, assistant output) |
| Bot protection | **Cloudflare Turnstile** (gates the AI chat + tools) |
| Scheduling | **Calendly** embed (`/meet`) |
| Backend (implied) | A "Core API" + LLM cluster on `*.llm.kaveenk.com` subdomains |

SEO is thorough: canonical URL, full Open Graph + Twitter card, **JSON-LD schema.org
`Person` / `WebSite` / `WebPage`** graph, keyword meta, `sitemap.xml`, permissive
`robots.txt`, `theme-color: #0b0f16`.

---

## 3. Site map (all paths)

| Path | What it is |
|---|---|
| `/` | Home — terminal hero, AI assistant, experience timeline, selected work |
| `/resume` | Cryptographically **signed** résumé, inline PDF.js preview + download |
| `/resume.pdf` | Raw signed PDF |
| `/authenticity` | **Crypto site-integrity**: live build verification + Ed25519 file-signature checks |
| `/netintelligence` | **Network OSINT tool**: DNS/TLS/HTTP/WHOIS/CT-logs/geo/latency/tracker scan |
| `/status` | **Live service-topology dashboard**: real-time health graph + telemetry |
| `/algorithmdesigner` | **Algorithm visualizer**: sorting + pathfinding, plain-English→DSL via LLM |
| `/ruinwalk/` | **Survival sandbox game**: program drones in a DSL or natural language |
| `/termodoro` | **Pomodoro timer** that runs a cinematic "breach simulation" as it ticks |
| `/memorylane` | **Floating terminal diary** — `/save` a thought, it drifts in a glowing cloud (local-only) |
| `/openclaw` | Public hub for his **agentic AI instances** (one is wired to a 3D printer) |
| `/coolthings` | Index/shelf of the interactive demos above |
| `/meet` | Calendly scheduler |
| `/writeups/writeup-1` | Security/CTF-style writeups (markdown) |

There is also a `coolthings` "featured llm hub" gateway that docks with `llm.kaveenk.com`
and subdomains: `ctf.`, `code.`, `dsa.`, `challenge.`, `sotw.`, `status.llm.kaveenk.com`.

---

## 4. Visual design system

### 4.1 Color palette (exact values)

**Base / surfaces (near-black blue):**
- `#0b0f14` — page background base (`theme-color #0b0f16`)
- Body background = radial gradient: `radial-gradient(circle at top, #0f1722, #0b0f14 45%, #06080b)`
- `#070c12`, `#060a0f` — panel/surface darks (often at 70–90% alpha)

**The signature trio (used everywhere):**
- **`#7cf7c0` — mint/spring green** → PRIMARY ACCENT (98 uses). Buttons, prompts, glows, links.
- **`#d6ffe9` — pale mint** → PRIMARY TEXT (used with a full opacity ramp, see below).
- **`#8bd3ff` — sky blue** → SECONDARY ACCENT (49 uses). Alt highlights, focus rings, nodes.

**Status / semantic:**
- `#ff9b9b` / `#ff8989` / `#ff6f8b` — coral/red → errors, offline, "close" dot
- `#ffd176` / `#ffe29c` / `#f9be7e` / `#ffca91` — amber/gold → warnings, the `auth`/`termodoro` themes
- `#9b8bff` — violet (one of the per-section accents)
- Logo gradient: **`#38f9d7` → `#43e97b`** (teal→green, in the favicon "K" mark)

**Opacity ramp for text hierarchy** (alpha-hex on `#d6ffe9`): `f2, e6, d9, cc, bf, b3, a6, 99, 8c` →
i.e. primary text ~90%, secondary ~70%, muted ~60%, faint ~40%. This single-color-at-many-alphas
approach is how they get a clean grayscale-of-mint hierarchy without extra colors.

### 4.2 Typography

- **Primary font: `JetBrains Mono`** (fallbacks `Fira Code, SF Mono, Menlo, monospace`).
  Everything is monospace — body, headings, the hero name. `line-height: 1.6`, weight 400,
  `text-rendering: optimizeLegibility`, antialiased, `font-synthesis: none`.
- Secondary stacks used per-component: `IBM Plex Mono`, `Space Mono`, `IBM Plex Sans`,
  and display sans **`Syne` / `Space Grotesk`** for a few non-terminal headings.
- Per-theme override hook: `--theme-font` (so the AI Theme Studio can swap the typeface).

### 4.3 Spacing, radius, layout

- Fluid spacing with `clamp()` everywhere (e.g. page padding `clamp(2.5rem, 4vw, 3.5rem)`).
- Layout: a centered single-column max-width container; the app is a flex column with `gap: 2rem`.
- **Border-radius:** `999px` (113×) for pills/chips/buttons; `10–18px` for cards/panels;
  `50%` for node dots. Themeable via `--theme-radius` (default 16px).
- Section pattern: a small left-aligned lowercase marker/comment (e.g. `// experience`) paired
  with a large **right-aligned heading** ("Selected work", "Experience", "Start a session").

### 4.4 Depth, glow & glass

- **Elevation shadows (soft, large):** `0 24px 60px rgba(0,0,0,.45)` (themeable `--theme-shadow`),
  plus `0 30px 60px`, `0 20px 40px`, `0 18px 30px` for stacked cards.
- **Neon glow (the "terminal" feel):** `0 0 24px rgba(124,247,192,.3)` (themeable `--theme-glow`),
  and many `0 0 12px #7cf7c0xx` halos on accents.
- **Text glow:** `text-shadow: 0 0 10px rgba(124,247,192,.4)` on key terminal text.
- **Focus rings:** `0 0 0 2px #8bd3ff26` (blue, accessible).
- **Glassmorphism:** `backdrop-filter: blur(6–16px)` on ~24 panels; translucent dark surfaces.
- **Image theming filters:** `grayscale/saturate/brightness` and even `sepia(1) hue-rotate(110deg)`
  to tint imagery into the green palette.
- **Gradients:** layered `linear-gradient` + `radial-gradient` accent washes per project card
  (each card type has its own colored corner glow: auth=gold, ctf/algorithm=cyan, ruinwalk=teal/pink,
  termodoro=amber, topography=green, netintel=blue).

### 4.5 Responsive & accessibility

- Mobile-first; breakpoints at **520 / 540 / 560 / 600 / 640 / 720 / 860 / 900 / 960 / 980 / 1100 / 1200 px**
  (primary: 640 mobile, 720, 980 desktop). Desktop = single centered column; mobile = full stack.
- **`@media (prefers-reduced-motion: reduce)` honored in 10 places** — the heavy animation
  gracefully degrades. This is a deliberate a11y choice.
- Semantic focus states, ARIA-style labels in the markup, keyboard handling (Arrow/Enter/Escape).

---

## 5. Motion & animation (~70 bespoke `@keyframes`)

Animation is a core part of the brand. Grouped by purpose:

- **Terminal life:** `blink`, `sparkCursorBlink`, `resumeCursorBlink` (cursors); `sparkTypeReveal`
  / `sparkTypeRevealMobile` (typewriter reveal); `terminalSparkFlight` (sparks fly off the prompt,
  count set by `--terminal-spark-count: 18`); `heroTerminalPulse`, `terminal-attention`.
- **Signature:** `signatureReveal` / `signatureCollapse` (an animated handwritten-style signature).
- **Ambient background:** `ambientCircuit`, `ambientDrift`, `ambientScan`, `glintSweep` (a sheen
  that sweeps across surfaces), `ecoFloat` (a floating "ecosystem" grid, `--eco-cols: 20`).
- **Cards:** `card-scan`, `card-sweep` + 3D **tilt on hover** (`--tilt-x/--tilt-y`, perspective).
- **Experience timeline:** `timeline-rail-pulse`, `timeline-rail-scroll`, `timeline-node-flicker`,
  `timeline-spine-scan` — an animated vertical spine with glowing, flickering nodes.
- **Per-project signatures:** `netintel-*` (grid shift, orbs, scan, signal, spin),
  `status-*` (node glow/ring, junction pulse/spin, edge-flow, LLM shimmer/sweep, grid drift),
  `openclaw-*` (hub rotate, lineage pulse, glow), `coolthings-hub-*` (ring spin, beam, packet, aura),
  `meet-float-*`, `memorylaneFloat`/`memorylaneSpawn`, `auth-key-cascade`/`auth-key-sweep`,
  `turnstile-spin`.
- **Timing:** snappy and short — transitions mostly `.16s–.2s ease`; `transform + border-color +
  box-shadow` combined on hover for a tactile, responsive feel.

---

## 6. Signature features & functionality

This is what sets the site apart — it's a set of working products, not mockups:

1. **Interactive terminal hero** — type/click commands: `ls`, `projects`, `resume`, `contact`,
   `social`, `email`, `theme`, `history`, `clear`, `exit`, `whoami`. Panes can be closed
   (close one and it scolds you: *"Aw, you got rid of the main pane about me! Refresh to get it back ://"*).
2. **Embedded AI assistant** — the "about me" is a chatbot, not prose. Greets with *"hello hello!
   Ask me about Kaveen's work, projects, or availability."* Gated by Turnstile
   (*"Verifying you before we send your message…"*). Backed by the Core API / LLM cluster.
3. **AI Theme Studio** (`theme` command) — *"Describe a theme"* → an LLM generates a full palette
   that's applied site-wide live via the `--theme-*` CSS variable system. (*"Custom theme applied."*)
4. **Algorithm Designer** — sorting + pathfinding (BFS/DFS/A*/Dijkstra/greedy/hill-climb; bubble/
   insertion/selection/heap/quick/merge/shell/cocktail). **Describe an algorithm in plain English →
   LLM translates to a custom DSL → live-validated → animated visualizer.** Full IDE available.
5. **Ruinwalk** — a survival sandbox game where you program drones/swarms in a DSL (`walk up`,
   `strike`, `mem[i]`, `threat_dir()`, `resource_dir()`…) or describe behavior in English and the
   LLM compiles a strategy. Simulated each tick on a tile grid.
6. **Net Intelligence** — a real OSINT/recon tool: DNS (A/AAAA/MX/CNAME/NS), TLS cert + issuer +
   Certificate-Transparency logs, HTTP headers/redirects/status, WHOIS/RDAP dates, GeoIP, ICMP
   latency + global heatmap, subdomain enumeration, and a headless tracker/fingerprint surface scan.
   Self-described as "educational, lawful internet intelligence tooling."
7. **Status dashboard** — real-time service-topology graph (Socket.IO), incident signals, rolling
   ~60s request telemetry (Prometheus-backed), links to the wider LLM-fleet status board.
8. **Termodoro** — terminal pomodoro timer that runs a cinematic live "intrusion/breach simulation"
   alongside the countdown.
9. **Memory Lane** — `/save` a thought; it floats as a glowing node in a drifting "brain cloud"
   (stays local to the browser).
10. **Authenticity / cryptographic proof** — live build verification (asset hashes vs manifest
    digests), and a drop-a-file Ed25519 **signature verifier** to prove content came from the site.
11. **OpenClaw** — public hub for his autonomous agent instances (one drives a 3D printer).
12. **Signed résumé** — `/resume` renders the PDF inline via PDF.js with signature metadata; downloadable.
13. **Easter egg** — a Konami-style pattern unlock that *permanently* updates a "last login" stamp
    on the site (*"Access granted. Login stamp updated."*).
14. **Footer sign-off** — *"Looks like you've reached the end of my website."*

---

## 7. How it presents the owner

- **Persona:** a hands-on, security-literate, AI-agent-obsessed systems engineer. The terminal
  framing says "I live in the shell"; the live demos say "I ship, and I ship a lot."
- **Pedigree, shown as a timeline (not a list):** Software Engineer @ **Stripe** (2024–Present,
  *"Working on moving money at insane volumes"* / "ML for compliance & integrity"); Software
  Engineering Contractor @ **OpenAI** (2023–2024, large-scale server orchestration); plus a stack
  of **internships at brand-name companies (incl. Meta, BlackBerry, Intel/RBC)** rendered as
  glowing timeline nodes with tilt-cards.
- **Proof over claims:** instead of "I know distributed systems," there's a live status graph;
  instead of "I do security," there's a working recon tool + crypto verification. The AI agency
  angle is front-and-center (demos "written autonomously by agents").
- **Open source:** GitHub `Kav-K` — GPTDiscord, Described (image-describing for the visually
  impaired), FixedWorld (Minecraft plugin), UWHelperBot, and a contribution to `openai/dallify-discord-bot`.
- **Contact:** email button, GitHub, LinkedIn, Discord (`kaveen`), and "Book a meeting with me" (Calendly).

---

## 8. Voice & copy

Confident, playful, terse, developer-native. Lowercase shell prompts, `//` comment markers,
self-aware jokes ("Aw, you got rid of the main pane…"), and crisp product one-liners
("A real-time cockpit view of services, incidents, and rolling telemetry across the stack").
Security/CTF flavor throughout ("Hint: where's the first place you look in a CTF?").

---

## 9. Takeaways for *your* build (gipc.dev)

What makes this site land — worth stealing in spirit:
- **One strong concept executed everywhere** (terminal/OS). Pick a metaphor and commit.
- **A tight palette**: one base dark + one signature accent + one alt accent + opacity-ramp for
  text. Easy to look cohesive.
- **Monospace + glow + dark = instant "engineer" signal.** Cheap to achieve, high impact.
- **Show, don't tell**: even one small live interactive demo beats paragraphs of skills.
- **Motion with restraint + `prefers-reduced-motion`.** Animate, but degrade gracefully.
- **SPA + Vite + Cloudflare static hosting** is a lightweight, cheap, fast stack — though note the
  JS bundle here is 1.67 MB; budget for that or split it.
- **SEO done right**: JSON-LD Person schema, OG/Twitter cards, sitemap, signed/canonical URLs.

Reality check on scope: kaveenk.com is an *enormous* amount of bespoke work (an AI backend, a DSL
interpreter, a game engine, a recon service, realtime telemetry). For a v1 we should clone the
*aesthetic and structure*, not the full feature zoo — then add interactive pieces incrementally.
