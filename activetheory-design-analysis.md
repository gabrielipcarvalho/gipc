# Tech & Design Teardown — activetheory.net (v6) → replication guide

> Reverse-engineered 2026-07-11 from the **live site and its actual source assets**: the full
> JS bundle (`app.js`, 1.8 MB), the worker kernel (`hydra-thread.js`), the compiled shader
> bundle (`compiled.vs`, 267 KB of readable GLSL), the scene/camera data (`uil.json`, 223 KB),
> the CMS payloads, boot `index.html`, plus a live engine probe (`window` globals), network
> capture, DOM inspection, interactive session, and their public GitHub org. **All raw assets
> archived in `.research/activetheory/`** (same convention as `.research/kaveenk/`; both are
> **gitignored by repo policy** — ripped third-party code never enters git history — and live
> as local copies on the Mac and the box).
>
> **Role as a reference:** second reference alongside `kaveenk-design-analysis.md`. kaveenk
> defines the site-wide language (terminal console). Active Theory is the **architecture donor
> for the e-Résumé "Construct" sub-app** (§12) and a **toolbox source** (§10).

---

## 1. The concept in one line

Not a page — a **real-time 3D place** (worlds modelled on their LA/Amsterdam offices) you move
through: project cards float in space, an AI concierge with voice navigates for you, visitors
share live multiplayer rooms, sound is a first-class layer, and **everything visible is drawn
by the GPU** in a single canvas.

## 2. Boot sequence (`index.html` — 5.9 KB total)

Their entire HTML is a bootloader; worth copying almost verbatim as a *pattern*:

1. **Inline critical CSS only**: `#Stage,body,html{margin:0;height:100%;overflow:hidden;background:#000}`,
   the three `@font-face` declarations (woff2→woff→otf), `touch-action:none`, `user-select:none`
   on the stage (inputs re-enabled), custom scrollbar with an opacity CSS var (`--baropacity`),
   iOS-specific overflow classes, and `.feature-detects` reading `env(safe-area-inset-*)` into
   CSS vars.
2. **Hard capability gate**: `try{eval("let obj={}; obj?.prop")}catch(e){location.replace("unsupported.html")}`
   — one cheap ES2020 syntax probe decides modern-or-redirect. No polyfill soup.
3. **Build stamp**: `window._CACHE_="1780406240914"` versions every asset
   (`app.<stamp>.js`, `uil.<stamp>.json`) — cache-bust by filename, CDN-friendly.
4. `<link rel=preload as=script>` + async script injection; `window._ENV_`, `window._CMS_="%CMS%"`
   (build-time template var); GA4 the only third-party tag.
5. `.GLA11y` class: an **absolutely-positioned, clipped, hidden DOM layer** — they mirror
   content into real DOM for screen readers even though pixels come from WebGL.

## 3. Runtime architecture (from `app.js`, 1.8 MB / 4 lines, readable identifiers)

- **A complete in-house engine ("Hydra")** — the bundle declares ~71 top-level classes: full 3D
  math (`Matrix3/4, Quaternion, Euler, Ray, Frustum, Box2/3, Spherical/Cylindrical`), geometry
  suite (`Plane/Box/Sphere/Cylinder/Cone/Ring/Circle/Icosahedron/Octahedron/PolyhedronGeometry`,
  `InterleavedBuffer`), scene graph (`Base3D, Group, Mesh, Points, Line, Scene`), cameras
  (`PerspectiveCamera, OrthographicCamera, CubeCamera`), rendering (`RenderTarget,
  MultiRenderTarget, CubeRenderTarget, MirrorRenderer, Shadow, ShadowDepth`), animation
  (`Skin, SkinAnimation`), color science (`Color, ColorHSL, ColorLAB`). Three.js-shaped API,
  zero Three.js dependency.
- **Custom OOP kernel, pre-ESM**: global `Class(fn, 'static'|'singleton')`, `Inherit(child,parent)`
  (with method-override chaining `_method`), `Namespace`, and their own module registry
  (`window.Module`, `require→req()`). The whole app is function-classes composed with
  `Inherit(this, Component)`.
- **`AppState`** — a reactive global store (`AppState.set/get`, `AppState.createLocal({...})`),
  used for everything from AI "isThinking" flags to multiplayer session config.
- **DOM template layer exists too**: `TemplateHTML, TemplateCSS, TemplateRoot, DOMAttribute,
  StateBinding` + `HydraCSS` — used for the 5 DOM chrome elements, the a11y mirror, and dev UI.
- **`modules.js` is a 24-byte stub** (`window._MODULES_=true`) — a load-order flag, not code.
- **Dev tooling ships in prod**: KTX2 compression helpers (`compressKtx2`, cubemap support),
  editor warnings with a Notion "upgrade instructions" link — their Hydra GUI editor runs
  against the live site behind query flags.

## 4. The worker kernel (`hydra-thread.js` — read in full, 13 KB)

One generic worker script, spawned **8×** as a pool. It is an **eval server**:

- Main thread posts `{es6|es5, name, proto[]}` — *class source code as strings* — and the worker
  `eval`s them into its own scope. Code is **injected at runtime**, so one worker file serves
  every specialized thread (`DracoThread`, `GeomThread`, `GLTextThread`, particles/physics).
- RPC protocol: `{fn, id, ...args}` → worker runs `self[fn]`, replies `resolve(data, id, transferables)`
  (zero-copy `ArrayBuffer` transfer); events via `emit(evt,msg)`; `console.log` proxied back.
- The worker re-creates the same OOP kernel (`Class/Inherit/Namespace/Module`) + shims
  (`requestAnimationFrame`, `performance`, `requestIdleCallback`) so **engine code runs
  identically on main thread or worker**.

*Replication note:* the pattern (pool + RPC + transferables + same-code-both-sides) is the
lesson. The `eval` mechanism itself is a CSP nightmare by modern standards — today you'd use
module workers. See §11.

## 5. Rendering pipeline (from the live probe + `compiled.vs`)

- **WebGL2** (WebGL1 fallback), `navigator.gpu` detected. Observed via ANGLE→Metal.
- **Shader bundle format** — GLSL compiled AOT into one file with directives:
  `#!SHADER: Name.vs / Name.fs`, `#!ATTRIBUTES`, `#!UNIFORMS`, `#!VARYINGS`. Shaders reference
  shared chunks by module name (`require('range.glsl')`-style).
- **Post stack (all readable in the archive):** `UnrealBloom` (+`getHydraBloom`,
  `lerpBloomFactor`), `FXAA`, **three-pass lens flare** (`LensFlarePrefilter/Up/Down`),
  `LightVolume` (volumetric light), `ShadowDepth`, `radialBlur`, `gaussianblur/blur5/9/13`,
  `rgbshift` (chromatic aberration), `luma`, `contrast`, `vignette-style` grading via
  `blendmodes` (22 refs).
- **Materials:** `PBRShader` (+`pbr`/`fbr` chunks, `normalmap`, `fresnel`, `matcap`,
  `lighting`, `shadows`, `refl`), `ColorMaterial`, `BasicMirror`, `DefaultText` (MSDF),
  `GLUIColor/GLUIObject`, `ScreenQuad`, `DebugCamera`.
- **Procedural library (215 GLSL functions):** `cnoise/snoiseVec3/scnoise/splinenoise`
  (simplex/curl family), `curlNoise`, `fbm`, `getWaterNoise`, `getFluidVelocityMask` (the fluid
  sim), `rainbowColor`, easing functions in GLSL (`eases`), `transformUV`, `rgb2hsv`,
  `conditionals` (branchless helpers), `range` (map/remap — 51 uses, their workhorse).
- **`ShaderVariants`** — compile-time permutations instead of runtime branching.
- **Self-telemetry:** `RenderCount/RenderStats/RenderMonitor/RenderTimeQuery/RenderTimer`
  (GPU timer queries) feed adaptive quality.
- **Device tier system:** `Device.TIER` (desktop `T0–T3`) and `Device.M_TIER` (mobile `MT0–…`)
  booleans resolved once at boot; helpers `tierEq/LT/GT`; **`?gpu=` query override** (e.g.
  `?gpu=m2` forces mobile tier 2) for testing. Features/effects gate on tier.

## 6. Text & asset pipeline

- **GL text is MSDF**: font atlas JSONs fetched at runtime (`NBArchitektStd-{Light,Regular,Bold}.json`)
  + `msdf` shader chunks + `GLUIBatchText` batching. Their open-source **`svg2msdf`** tool
  generates MSDF from arbitrary SVG — i.e. *any vector shape can become a crisp GL glyph*.
- **Geometry**: GLB/GLTF (24 refs) + **Draco** compression (150 refs) decoded in a worker via
  `draco_decoder.wasm`.
- **Textures**: **KTX2/Basis** universal GPU compression (175/36 refs), transcoded via
  `basis_transcoder.wasm`.
- **Video**: their open-source **`activeframe`** format (.af) — WebCodecs-based frame-accurate
  video, replacing `<video>` where scrub-sync matters.
- **Audio**: WebAudio throughout (`AudioContext` ×30); DOM music player (`MusicPlayerDOM`,
  prev/next song controls); open-source `ios-silent-bypass` to play audio despite the iPhone
  mute switch.

## 7. Scene & camera authoring (`uil.json` — the Hydra GUI editor's output)

`uil.json` (223 KB) is **serialized designer tuning** from their visual editor. Keys are
per-scene, per-element parameter blobs, e.g.
`CAMERA_Element_1_Home{position, lookAt, fov, lerpSpeed, moveXY, wobbleStrength, deltaRotate, groupPos}`.

- **Scene inventory (their actual worlds):** `Home/home_scene`, `About`, `Work`, `WorkDetail`,
  `WorkDetailParticles`, `Contact/ContactUs`, `Footer`, `CleanRoom`, `TreeScene`,
  `JellyfishDemo`, `ParticleTest`.
- The camera rig per scene is *data*: position/lookAt stations, fov, lerp speed, mouse-parallax
  strength (`moveXY`), idle wobble (`wobbleStrength`). Designers tune in-editor; the site loads
  the JSON. **Code defines behaviors; JSON defines feel.**
- This is the exact architecture to miniaturize for the Construct: hand-authored
  `camera-stations.json` instead of a GUI editor.

## 8. Interaction systems (from bundle source)

**Scroll = camera.** `ScrollRenderManager(object, transitionShader, {container, keyboard,
smoothScroll, pingPong, virtualScroll})` wraps a `ScrollController` with:
- lerped virtual scroll — `ScrollController.LERP = 0.1` desktop / `0.5` mobile (less smoothing
  on touch);
- `VIEW_CHANGE` events as you cross view boundaries;
- **keyboard nav built in**: `ArrowUp/ArrowDown` move scroll by ±25% of viewport height;
- a `scrollTo` API (this is what the AI concierge calls);
- **views are composited through a transition *shader*** — moving between sections is a GPU
  crossfade/warp, not a DOM transition.

**Multiplayer (Dreamwave — their platform).** `AppState.createLocal({server:
"wss://s.dreamwave.network/ws", roomKey:"atv6", playerClass:"ScrollPlayer"|"TubePlayer",
maxInRoom:2–3, data:{camera, proton particles}})`. Presence is scroll-position-synced
(`ScrollPlayer`). Rooms are shareable via QR (bundled `qrious.js`); joining with
`?roomqr=<id>&workids=27,10,18,…` filters the work deck to an ordered list
(`workids → _workData[index] → _workPages.refresh(newList)`) — i.e. **a curated deck can be
encoded in a URL**. WebRTC present for peer media.

**AI concierge.** Thread-based assistant against **their own backend**
(`backend-dot-activetheory-v6.uc.r.appspot.com/api/assistant`, `createThread → thread_id`,
`sendMessage`), OpenAI-style; UI state via `AppState("InteractAIAssistant/isThinking")`;
**context injection** — if you're viewing a project it prepends *"I'm looking at <project>…"*
to your message. Voice out: **ElevenLabs streaming TTS** (voice id + latency param — and
notably an `xi-api-key` sits client-side: an anti-pattern, see §11). Voice in: **Vosk
in-browser offline STT** (16 kHz `getUserMedia`, WASM model tarball from GCS, `MessageChannel`
to a recognizer worker). The assistant *navigates* (calls `scrollTo`/scene jumps), which is the
validated pattern for our oracle.

**DOM chrome is exactly five elements**: `Toggle Audio`, `Work`, `Contact` links + music
player prev/next. Everything else is canvas.

## 9. Content pipeline (CMS)

Payload-CMS-shaped JSON on GCS, fetched at runtime with cache-bust
(`cms/{projects,metadata,contact}-<env>.json?v=CMS_DATA_<ts>` → `window.CMS_DATA[key]` after a
cleanup pass):
- `projects` — **65 entries**: `id, name, slug, description, clientName, completionDate`,
  media objects with a **responsive size ladder** (`i200px/i400px/i600px/i1024px` pre-rendered
  variants, absolute GCS URLs).
- `metadata` — site title/description/OG image (same size-ladder object).
- `contact` — links list (email, newsletter, socials, Notion-hosted privacy page).
Content deploys never touch code; code deploys never touch content.

## 10. Their open-source toolbox (github.com/activetheory) — directly usable by us

| Repo | ★ | What it is | Use for gipc.dev |
|---|---|---|---|
| `activeframe` | 381 | Custom `.af` WebCodecs video format, frame-accurate | Only if we need scrub-synced video |
| `Paper-Planes-Android-Experiment` | 277 | Their famous multi-device paper-plane experiment | Reference reading |
| `split-text` | 68 | Split HTML text into lines/words/chars | **Console + Construct text FX** (decode reveal staggering) |
| `Finding-Love-Shaders` | 51 | Production GLSL from a real project | **GLSL learning corpus** next to `compiled.vs` |
| `fit-text` | 36 | Fit text to container | Terminal hero sizing |
| `svg2msdf` | 28 | SVG → MSDF atlas | **Hex-sigil runes as crisp GL glyphs for the Matrix rain** |
| `ios-silent-bypass` | 26 | Audio despite iOS mute switch | Audio toggle robustness |
| `balance-text` | 19 | Even line distribution | Typography polish |
| `GaussianSplats3D` (fork) | 3 | 3D gaussian splatting in Three.js | Future lab toy |
| `modern-screenshot` / `at-html2canvas` | 5/2 | DOM→canvas screenshots | OG-image generation |

## 11. Anti-patterns — what we deliberately do NOT copy

1. **UI text drawn in GL** (`GLUIBatchText`) — kills SEO/a11y/selection; they compensate with a
   hidden `.GLA11y` mirror. A résumé must be DOM-first; we only draw *atmosphere* in canvas.
2. **Third-party API key in the client bundle** (ElevenLabs `xi-api-key`). Even they proxy
   OpenAI through their GAE backend — that's the correct pattern: **all AI keys live server-side**
   (our Go/FastAPI services), never in JS.
3. **`eval`-based worker kernel** — brilliant for 2015, incompatible with a strict CSP. Use
   ES module workers.
4. **1.8 MB blocking JS before first pixel** + `user-scalable=no` — acceptable for an
   awards-jury audience, wrong for recruiters on hotel Wi-Fi. We ship a fast DOM console and
   lazy-load any canvas experience per-route.
5. Full engine scope: 8-worker pool, Draco/KTX2 pipelines, fluid sim, multiplayer platform —
   architecture lessons, not v1 features.

## 12. The e-Résumé **"Construct"** — unification blueprint (LOCKED)

**The unification:** kaveenk console is the site-wide language (DOM terminal, arcane
violet/cyan). `/resume` is a sub-app borrowing Active Theory's **scroll-descend spatial card
mechanic**, re-skinned **heavily Matrix** — glyph rain instead of sparks/fluid, decode reveals
instead of fades. Entering it is a deliberate world-shift: the operator jacks into the
construct to read the record.

**Palette:** construct defaults to **true Matrix green** (`#00ff41` family) as the
world-shift signal; site chrome (nav/exit) stays arcane. Violet-tinted rain recorded as the
brand-purity alternative.

### Mechanics spec (now grounded in AT's actual architecture)
1. **Glyph rain.** 2D canvas layer. Column streams from a glyph atlas: half-width katakana +
   digits + latin + **hex-sigil runes generated with AT's own `svg2msdf`** (or plain
   sprite-sheet at 2D-canvas scale). Bright head glyph, trailing fade (translucent-black
   `destination-out` each frame), in-place glyph mutation, 2–3 parallax densities.
   Budget ≤2 ms/frame; density auto-degrades via a frame-budget monitor (AT's RenderStats
   lesson, miniaturized).
2. **Scroll-descend camera.** One tall route; rAF-**lerped** virtual scroll
   (`LERP ≈ 0.1` desktop / `0.5` touch — AT's exact constants), camera descends a vertical
   shaft; cards at depth stations. **Keyboard nav: ArrowUp/Down = ±25% viewport** (their
   convention). Stations defined in a hand-authored `camera-stations.json` — the uil.json
   pattern without the GUI editor.
3. **Card materialise.** Approaching focus: border condenses from the rain (~300 ms), text
   **decodes** per-char (scramble→settle, staggered via `split-text`-style splitting). Leaving:
   re-dissolve upward.
4. **Content = cards** (role, education, skill cluster, project, certification): title, org,
   dates, 2–4 evidence bullets, tech chips — real DOM, selectable, screen-readable (AT's
   `.GLA11y` proves even they concede this; we make DOM primary, not a mirror).
5. **Oracle hooks.** The agent calls the construct's `scrollTo(station)` — literally AT's
   concierge pattern. "Show me the k8s experience" → descend + decode that card.
6. **Optional flourish (post-v1):** view-transition as a *shader* moment — a green
   rain-wipe when entering the construct (AT's transition-shader idea, one-shot scale).
7. **Audio (opt-in, off by default):** rain hiss + decode ticks; one toggle shared with the
   console; `ios-silent-bypass` if iOS matters.
8. **Exit:** `exit` command / ESC / "wake up" link → back to console, world-shifts to arcane.

### Non-negotiables (a11y / SEO / recruiters)
- `prefers-reduced-motion` → **static mode**: no rain, no camera; clean stacked document. Same
  static mode = `noscript` fallback = print stylesheet = crawler view.
- All résumé text in the DOM; JSON-LD `Person`/`WorkExperience` emitted from the same data.
- **`resume.json` is the single source** → construct cards + static/print view + signed PDF +
  JD-tailoring input (concept doc feature).
- Perf: route-split chunk ≤ ~200 KB gz incl. glyph assets; 60 fps mid-tier laptop; transforms/
  opacity only (no layout thrash).

### Build phases (post console-MVP)
1. `resume.json` schema + static/print/JSON-LD page (recruiter-safe baseline ships first).
2. Rain canvas layer (atlas, streams, frame-budget check, reduced-motion gate).
3. Scroll-camera descent + card stations (`camera-stations.json`).
4. Decode/materialise effects + polish (AT lesson: polish was ~80% of their two-month build).
5. Oracle navigation hooks + audio toggle (+ optional shader rain-wipe).

## 13. Archive manifest (`.research/activetheory/` — local-only, gitignored by policy)

| File | Size | What |
|---|---|---|
| `index.html` | 5.9 KB | Boot loader (read §2) |
| `app.js` | 1.82 MB | Full engine + app bundle (readable identifiers) |
| `modules.js` | 24 B | Load-order stub |
| `hydra-thread.js` | 13 KB | Worker kernel (read §4) |
| `compiled.vs` | 267 KB | **Entire shader library, readable GLSL** |
| `uil.json` | 223 KB | Designer camera/scene tuning (read §7) |
| `cms-projects.json` | 216 KB | 65-project content payload |
| `cms-metadata.json` / `cms-contact.json` | 4.3 KB / 0.8 KB | Site meta / links |
| `manifest.json` | 465 B | PWA manifest |
| `social.jpg` | 210 KB | OG image |

(kaveenk archive gap-filled the same day: `sitemap.xml`, `robots.txt`, `resume.pdf` added to
`.research/kaveenk/`.)

## 14. Reference URLs

- Live: https://activetheory.net · GitHub org: https://github.com/activetheory
- Engine history: [The Story of Technology Built at Active Theory (Medium)](https://medium.com/active-theory/the-story-of-technology-built-at-active-theory-5d17ae0e3fb4)
- v6 write-ups: [webgpu.com showcase](https://www.webgpu.com/showcase/active-theory-portfolio/) · [Awwwards v6](https://www.awwwards.com/sites/active-theory-v6) · [FWA v6](https://thefwa.com/cases/active-theory-v6)
- Technique case studies: [Neon](https://medium.com/active-theory/neon-a-webgl-installation-fdf540c42152) · [Mira](https://medium.com/active-theory/mira-exploring-the-potential-of-the-future-web-e1f7f326d58e) · [AR Experiments](https://medium.com/active-theory/ar-experiments-66ba1b4ed931)
- Awards context: [Awwwards profile](https://www.awwwards.com/active_theory/) · [Webby "Crafted with Code"](https://www.webbyawards.com/crafted-with-code/active-theory/)
