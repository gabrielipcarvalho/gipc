# Tech & Design Teardown — activetheory.net (v6) → replication guide

> Reverse-engineered 2026-07-11 from the **live running site**: probe of the `window` object
> (engine internals), full network capture, DOM/meta inspection, and console output — combined
> with Active Theory's own engineering write-ups where they explain the internals. The entire
> UI renders inside a single WebGL canvas, so there is no CSS bundle to rip (unlike the kaveenk
> teardown); the design lives in shaders and a scene graph. This document therefore focuses on
> **architecture, techniques, and how to replicate the concepts** for gipc.dev.
>
> **Role as a reference:** second reference alongside `kaveenk-design-analysis.md`. kaveenk
> defines the site-wide language (terminal console). Active Theory is the **architecture donor
> for the e-Résumé "Construct" sub-app** — see §10.

---

## 1. The concept in one line

The site is not a page — it is a **real-time 3D place** (worlds modelled on their LA/Amsterdam
offices) that you move through, with project cards floating in space, an AI concierge that
navigates for you, live multiplayer rooms, and sound design as a first-class layer. Everything
— text, buttons, layout — is drawn by the GPU.

---

## 2. Architecture overview (as observed live)

**The DOM is empty.** `document.body.innerText` is essentially just "Toggle Audio · Work ·
Contact". One `<canvas>` (2880×1359 at DPR 1.5 on a 1920×906 viewport), WebGL2 context
(WebGL1 fallback; `navigator.gpu` present for WebGPU-capable clients). Viewport is locked
(`user-scalable=no, minimal-ui`) — it behaves like an installed app, and ships a PWA
`manifest.json`.

**Two versioned bundles + a worker pool:**

| Asset | Purpose |
|---|---|
| `assets/js/app.<build>.js` | Engine + application boot |
| `assets/js/modules.<build>.js` | Feature modules (loaded after boot) |
| `assets/js/hydra/hydra-thread.js` — requested **8×** | Web-Worker pool (one script, eight workers) |
| `assets/shaders/compiled.vs` | **Precompiled shader bundle** — GLSL built at compile time, not runtime |
| `assets/data/uil.<build>.json` | **Declarative UI layout** consumed by the GL UI system |
| `assets/meta/manifest.json` | PWA install manifest |

**Content is CMS-hydrated JSON, decoupled from the build.** Runtime fetches from Google Cloud
Storage with cache-busting:
`storage.googleapis.com/activetheory-v6.appspot.com/cms/{metadata,projects,contact}-dev.json?v=CMS_DATA_<ts>`.
Geolocation comes from a GCP Cloud Function (`us-central1-at-services.cloudfunctions.net/geo`).
Analytics: GA4 (`page_view` + scroll-depth events). Fonts: **NB Architekt** 300/400/700 — the
"alien" grotesk — rasterised as GL text, not DOM text.

**The engine is global.** Probing `window` exposes the whole in-house engine ("Hydra") and its
subsystems:

```
Hydra, HydraObject, HydraCSS, Stage, World, App, Global, Utils, Device,
Render, Renderer, RenderCount, RenderMonitor, RenderStats, RenderTimeQuery, RenderTimer,
Shader, ShaderVariants, PBRShader, FBORendererWebGL, ShaderRendererWebGL,
FXScene, FXSceneCompositor, HydraBloom, FluidScene, ScrollRenderManager,
Thread/THREAD, DracoThread, GeomThread, GLTextThread,
GLUI, iGLUI, GLUIElement, GLUIUtils, GLUIBatch, GLUIBatchText, GLUITexture,
GLUICornerPin, GLUIStage, GLUIStage3D
```

Console also logged the session URL carrying **multiplayer state**:
`?roomqr=atv6qr…&workids=27,10,18,48,52,57,…` — a room id (QR-joinable) plus an ordered deck of
project ids. Their build was reportedly ~2 months total with ~80% of the time on polish.

---

## 3. Rendering pipeline

- **WebGL2-first** with WebGL1 fallback; WebGPU detection in place. (Observed running via ANGLE
  → Metal on Apple Silicon, `MAX_TEXTURE_SIZE` 16384.)
- **Post-processing chain**: `FXScene`/`FXSceneCompositor` composite render passes;
  `HydraBloom` (bloom/glow), FBO render targets (`FBORendererWebGL`), and a real-time **fluid
  simulation** (`FluidScene`) used as an ambient/interactive layer.
- **Materials**: `PBRShader` (physically-based) + `ShaderVariants` (compile-time permutations
  of one shader for different feature sets — a classic engine trick to avoid runtime branching).
- **Shaders precompiled** into one bundle (`compiled.vs`) — no runtime GLSL assembly cost.
- **Self-telemetry**: `RenderStats`, `RenderMonitor`, `RenderTimeQuery`, `RenderTimer` — the
  engine measures its own GPU/frame cost and (per their write-ups) adapts quality tiers
  per-device. Performance is treated as a *feature*.
- Per their engineering posts: they left Three.js because most of it was dead weight for them;
  Hydra minimises CPU with **dirty-flagged matrix updates** (only recompute transforms that
  changed) and a modular per-project feature system.

## 4. UI drawn by the GPU (GLUI) — and why we will NOT copy it

`GLUI*` renders every button/label/panel as batched GL geometry (`GLUIBatch`,
`GLUIBatchText` — near-certainly SDF/MSDF glyph atlases; `GLUIStage3D` places UI in world
space; `GLUICornerPin` warps quads). Layout is data-driven from `uil.json`. Benefits: UI and
3D world composite in one pipeline, animate on the GPU, never desync. Costs: **no DOM = no
SEO, degraded accessibility, no text selection, no native scrolling** — acceptable for an
awards-bait studio site, wrong for a résumé that recruiters and ATS parsers must read.
**gipc.dev rule: text lives in the DOM; the GPU draws atmosphere only.**

## 5. Threading model

One worker script, eight instances: mesh **Draco decompression** (`DracoThread`), geometry
processing (`GeomThread`), glyph rasterisation (`GLTextThread`), and (per their posts)
particles/physics — all message-passing off the main thread so the render loop never blocks.
The lesson is the *pattern*, not the count: anything that can stutter a frame gets a worker.

## 6. Content pipeline

Code and content are fully decoupled: the site is a static shell + engine; all portfolio
content (projects, metadata, contact) hydrates at runtime from versioned CMS JSON on GCS, with
media on the same bucket. Deploying content ≠ deploying code. (Our equivalent: `resume.json` /
`projects.json` in the repo — same decoupling, git as the CMS.)

## 7. Interaction model

- **Scroll = camera.** `ScrollRenderManager` maps scroll input to camera movement through the
  world (GA still logs scroll-depth %, so progression is normalised). There is no document to
  scroll — scroll is an *input device*.
- **Spatial navigation** through office-modelled worlds; work is presented as **card decks
  floating in space** (the `workids` deck), approached/focused as you travel.
- **AI concierge that drives the UI**: ask it "show me a fun project" and it *navigates the
  camera* to matching work — the chat is an interface to motion, not just answers.
- **Live multiplayer**: shareable rooms (`roomqr`), QR to pull a phone into the same session.
- **Audio-first**: a single "Toggle Audio" control; sound design (ambience, interaction SFX) is
  a core layer, on by default.
- **App-like chrome**: custom cursor, locked zoom, PWA install, black `theme-color`.

## 8. Visual language

Near-black base (`#000000` theme), neon accents, bloom/glow, PBR reflections, volumetric
atmosphere, particles + fluid sim, cinematic depth-of-field camera moves, NB Architekt
alien-grotesk type. Motion is heavy but *engineered* — 60fps is part of the aesthetic. Exact
colors/keyframes are not extractable (no stylesheet); the look is authored in shaders and the
scene graph.

---

## 9. Replication map — AT concept → gipc.dev implementation

| # | AT concept | Their implementation | Our cheap, correct equivalent |
|---|---|---|---|
| 1 | Site as a place | Full GL world, GLUI everything | Console metaphor (kaveenk-style DOM) + **one** GPU set-piece per moment that matters |
| 2 | Scroll = camera | `ScrollRenderManager` → 3D camera | Scroll-driven descent on the résumé route: rAF-lerped `scrollY` → CSS 3D transforms (or a minimal Three.js scene). Native CSS scroll-driven animations where enough |
| 3 | Work as card decks in space | GL planes in world space (`workids` deck) | Résumé entries as DOM cards positioned at depth "stations"; camera descends past them (§10) |
| 4 | GPU atmosphere | `FluidScene`, particles, `HydraBloom` | **Matrix glyph rain** on a 2D canvas (glyph atlas, ~1–2 ms/frame budget); CSS glow for DOM, bloom only inside the canvas |
| 5 | AI drives navigation | In-world concierge moves the camera | The **oracle** agent gets UI-navigation tools: "show me his k8s work" → scroll/jump to that card. Same pattern as its planned console powers |
| 6 | Workers for anything heavy | 8-worker pool (Draco/geom/text/physics) | Rain sim is cheap enough for main thread; if a sim ever spikes, move it to **one** worker. Pattern, not scale |
| 7 | Precompiled shaders | `compiled.vs` bundle | Inline GLSL strings / `vite-plugin-glsl`; trivial at our scope |
| 8 | CMS-hydrated content | GCS JSON + cache-bust | `resume.json` in the repo = single source for cards, print PDF, and JSON-LD |
| 9 | Self-telemetry | `RenderStats`/`RenderTimer`, quality tiers | `requestAnimationFrame` frame budget check → auto-degrade rain density; fits our "real telemetry" brand |
| 10 | Audio layer | Spatial sound, on by default | Subtle loop + interaction SFX, **off by default**, one toggle (recruiter-safe) |
| 11 | Multiplayer rooms | `roomqr` + QR join | Skip v1. (Fun future easter egg, zero priority) |
| 12 | PWA / app feel | manifest + locked viewport | Manifest yes; **never** lock zoom (a11y) |

**Deliberately NOT copied:** GLUI text-in-GPU (kills SEO/a11y — fatal for a résumé), the
full engine + 8-worker pool, Draco pipelines, native wrappers, fluid sim, multiplayer.

---

## 10. The e-Résumé **"Construct"** — unification blueprint (LOCKED concept)

**The unification:** the whole site speaks kaveenk (terminal console, DOM-first, arcane
violet/cyan). The résumé is a **sub-app** at `/resume` that borrows Active Theory's
**scroll-descend spatial card mechanic** and re-skins it **heavily Matrix** — glyph rain
instead of their sparks/fluid, decode-reveals instead of fades. Entering it is a *deliberate
world-shift*: the operator jacks into the construct to read the record.

### Palette decision
Default: **true Matrix green** (`#00ff41`-family) inside the construct — the shift from arcane
violet/cyan to green *is the feature* (you left the console, you're in the construct). Site
chrome (nav, exit, footer) stays arcane. Alternative if brand purity ever wins: violet-tinted
rain, same mechanics. Recorded; green is the working default.

### Mechanics spec
1. **Glyph rain (the atmosphere).** 2D canvas behind the cards. Column streams from a glyph
   atlas: half-width katakana + digits + latin + **our hex-sigil runes** mixed in (the
   arcane×Matrix fusion detail). Bright head glyph, trailing fade (draw with
   `destination-out` translucent black each frame — the classic technique), random glyph
   mutation in-place, variable column speeds, subtle depth layers (2–3 densities/parallax).
   Budget: ≤2 ms/frame; density auto-degrades if the frame budget check trips (§9.9).
2. **Scroll-descend camera.** The route is one tall scroll region; `scrollY` (rAF-lerped for
   inertia) drives a virtual camera descending a vertical shaft. Résumé cards sit at depth
   stations (CSS `translateZ`/scale/blur or a minimal Three.js scene if we want real DoF).
   Optional soft snap per station. Rain parallax follows the camera.
3. **Card materialise.** As a card approaches focus: border condenses out of the rain
   (nearby columns bend/attract for ~300 ms), content **decodes** — text starts as scrambled
   glyphs and settles character-by-character (per-char scramble→settle, staggered). Leaving
   focus, it re-dissolves upward.
4. **Content = cards.** One card per résumé unit: role, education, skill cluster, project,
   certification. Card face: title, org, dates, 2–4 evidence bullets, tech chips — DOM text,
   selectable, screen-reader-visible.
5. **Oracle hooks.** The site-wide agent can drive the construct: "show me the k8s experience"
   → camera descends to that card and decodes it. Same tool-calling pattern as the console.
6. **Audio (opt-in).** Low rain hiss + soft glyph ticks on decode; single toggle shared with
   the site; off by default.
7. **Exit.** `exit` command / ESC / top-of-shaft "wake up" link returns to the console —
   world-shifts back to arcane.

### Non-negotiables (a11y / SEO / recruiters)
- `prefers-reduced-motion` → **static mode**: no rain, no camera, cards stacked as a clean
  document. The same static mode serves as the `noscript` fallback, the print stylesheet, and
  the crawler view.
- All résumé text is real DOM. JSON-LD `Person`/`WorkExperience` from the same data.
- `resume.json` is the single source of truth → renders the construct, the static/print view,
  the signed PDF, and feeds the JD-tailoring feature (per concept doc).
- Perf: route-split chunk (construct JS + glyph atlas) target ≤ ~200 KB gz; 60fps on a
  mid-tier laptop; no layout thrash (transforms/opacity only).

### Build phases (post console-MVP)
1. `resume.json` schema + static/print/JSON-LD résumé page (recruiter-safe baseline ships first).
2. Rain canvas layer (atlas, streams, budget check, reduced-motion gate).
3. Scroll-camera descent + card stations.
4. Decode/materialise effects + polish (AT lesson: polish is 80% of the time).
5. Oracle navigation hooks + audio toggle.

---

## 11. Reference URLs

- Live site: https://activetheory.net (v6; also v6.activetheory.net)
- Engine history & internals: [The Story of Technology Built at Active Theory (Medium)](https://medium.com/active-theory/the-story-of-technology-built-at-active-theory-5d17ae0e3fb4)
- v6 write-ups: [webgpu.com showcase](https://www.webgpu.com/showcase/active-theory-portfolio/) · [Awwwards v6](https://www.awwwards.com/sites/active-theory-v6) · [FWA v6](https://thefwa.com/cases/active-theory-v6)
- Technique case studies: [Neon — a WebGL installation](https://medium.com/active-theory/neon-a-webgl-installation-fdf540c42152) · [Mira](https://medium.com/active-theory/mira-exploring-the-potential-of-the-future-web-e1f7f326d58e) · [AR Experiments](https://medium.com/active-theory/ar-experiments-66ba1b4ed931)
- Awards context: [Awwwards profile](https://www.awwwards.com/active_theory/) · [Webby "Crafted with Code"](https://www.webbyawards.com/crafted-with-code/active-theory/)
