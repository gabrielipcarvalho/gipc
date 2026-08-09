# Construct Parity Audit — /resume vs activetheory.net(/work)

> Sprint N phase N4 deliverable (2026-08-10). Reference confirmed by owner: **activetheory.net**
> and **activetheory.net/work** (the "cylindrical spinning spine"), to be realized *matrix-themed*.
> Sources: engine teardown of the fetched bundle (`.research/activetheory/` — app.js 1.8MB,
> compiled.vs shaders, uil.json tuning data, cms-projects.json), with byte-offset-cited evidence;
> formatted extracts in the session scratchpad. Current-state from `apps/web/app/resume/*`.
> **Pending addendum**: live motion capture (Chrome extension unresponsive) — feel-check only;
> the mechanics below are complete without it.

## 1. What the reference actually is (the surprise)

AT's /work is **not a flat rotating cylinder — it's a descending HELIX** ("spiral staircase"):

- 14 project panes at **radius 3.8**, **50° per item** (35° portrait), each dropped **0.84 units**
  below the last (1.12 mobile). Panes stay vertical and face radially outward; the helix "tilt" is
  faked with a vertex shear (**−4.6° desktop / −8° mobile**).
- The camera rides **outside** at radius 7.6, always facing the focused pane from 3.8 units,
  FOV 35 (55 phones) — the focused pane just overfills the frame.
- **Input is NATIVE scroll** — a 1050vh proxy (525vh phones), never a hijacked wheel. Progress is
  remapped `smoothstep(0.06, 0.94)`, then the camera pose lerps between adjacent item poses.
  **There is NO snap** — the settle feel is a damping stack: rendered scroll chases scrollTop at
  **0.1**/frame (0.5 touch), camera chases target at **0.2**, hover uniforms at **0.08** — all
  framerate-normalized `α' = 1−(1−α)^(dt·60)`.
- Entrance/exit: camera drifts +1 unit above the helix over progress 0→0.15 and −1 below over
  0.85→1. Cards intro at scale 0→1, 1200ms easeOutQuint, 200ms stagger.
- **Focus lifecycle**: only the nearest pane shows its label (fades over camera-distance 5→6) and
  plays video (one shared video element, 500ms crossfade after 300ms; others show stills).
- **Label smear/glitch** (signature): label sheared 0.42·width along the diagonal; at oblique
  angles it shreds into ~15 vertical strips with chromatic offset — text glitch-resolves as its
  pane rotates toward you. (This is *literally our decode effect's spatial cousin*.)
- **Click → detail**: scroll locks, camera flies to the pane (700ms easeOutCubic), a center-out
  circular wipe with FBM-noisy edge opens over **1500ms cubic-bezier(.29,.05,.06,.92)**; close =
  Escape or >10px accumulated scroll (20px touch), 800ms.
- **Background reacts**: a 524k-particle "flower" driven directly by scroll progress (2 turns per
  traverse) + a velocity kick `clamp(1500·Δprogress, −3, 3)` into the backdrop shader.
- Degrades: GPU-tiered particle counts (16k→524k), portrait remaps — but **zero
  `prefers-reduced-motion` handling anywhere in their bundle.**
- A11y: panes are real focusable links; keyboard focus auto-scrolls the helix via the exact
  smoothstep inverse `invSmooth(x)=2x−x²(3−2x)` (also the deep-link formula).

## 2. What the Construct is today

A **vertical elevator**: camera = lerped scrollY (their exact 0.1/0.5 constants — already
borrowed), stations at hand-authored cumulative vh offsets, cards `translate3d(Y)` only. Nearest
station within 0.5vh focuses and runs the per-element **decode cascade** (60ms stagger). Rain:
1–3 canvas layers, sigil runes, device tiers T0–T3 (AT-style budgets), adaptive density under a
2ms/frame budget, violet-default. Strong CLS engineering (pre-paint positioning + veil),
labeled-region a11y, full reduced-motion correctness (immersive never mounts; static document is
the deliverable). No third dimension, no angle-based lifecycle, no momentum feel beyond the single
lerp, no detail transition, no background↔scroll coupling.

## 3. Adopted / Missing / Rejected

| Reference element | Status | Notes |
|---|---|---|
| Damping constants 0.1/0.5 | ✅ adopted | `LERP_FINE/COARSE` — "AT's constants" verbatim |
| Device-tier budgets | ✅ adopted (improved) | ours adds RM→T0 + adaptive density guardrail |
| Focus-triggers-reveal | ✅ adopted (different medium) | their label-fade ≈ our decode cascade |
| A11y as real focusables | ✅ adopted | our cards are labeled regions, theirs are links |
| Reduced-motion correctness | ✅ **we exceed the reference** | they have none; ours is total |
| **Helix geometry** (R3.8 · 50°/item · 0.84 drop) | ❌ missing | the defining element |
| Camera-on-helix + pose lerp, no snap | ❌ missing | we lerp Y only |
| smoothstep progress remap + entrance/exit drift | ❌ missing | |
| Framerate-normalized lerps | ❌ missing (minor) | ours are raw per-frame |
| Angle-based item lifecycle (only-focused-speaks) | ❌ missing | decode fires, but no spatial fade |
| Label shear/strip-glitch by view angle | ❌ missing | natural matrix re-skin: glyph-shred |
| Card intro scale/stagger | ❌ missing | |
| Click→detail wipe + scroll-to-close | ❌ missing | stations scroll internally instead |
| Background↔scroll coupling (velocity kick) | ❌ missing | rain ignores scroll entirely |
| invSmooth deep-link/focus formula | ❌ missing | needed the moment the helix exists |
| Glass refraction (second drawbuffer, 5-tap blur) | 🚫 rejected | real WebGL pipeline; against vanilla/no-deps + perf budget |
| 524k particle flower | 🚫 rejected | the rain IS our particle system |
| Shuffle-on-load item order | 🚫 rejected | a résumé's order is semantic, not a portfolio grab-bag |
| Shared-video focus media | 🚫 rejected (n/a) | résumé stations have no video; matrix equivalent below |
| No-RM-support | 🚫 rejected | we keep our standard |

## 4. Sprint O recommendations (ranked; all tier-gated, RM/T0 fallback = today's elevator)

1. **O1 — The Helix (core, M-L).** CSS 3D, no libraries: a `perspective` viewport, one world
   container counter-transformed by the existing lerped camera, stations placed at
   `rotateY(−i·50°) translateZ(R) translateY(−0.84·i·u)` with the −4.6° skew tilt; scroll proxy
   ≈ stations×0.75vh… (recipe constants in §5); smoothstep remap + entrance/exit drift; pose lerp
   at 0.2 over the camera lerp at 0.1 (framerate-normalized). Touch keeps 0.5. T0/T1 or RM →
   current flat descent unchanged.
2. **O2 — Focus lifecycle (M).** Off-axis cards dim + their text pre-decode "shreds" (clip-path
   strip displacement — the matrix re-skin of AT's label glitch); only the focused card runs the
   decode cascade (already true) and full opacity. Distance-based, not station-index-based.
3. **O3 — Detail bloom (M).** Click/Enter on focused card: scroll lock + circular `mask-image`
   wipe (noise-edged via pre-rendered turbulence PNG) expanding 1500ms with their bezier; the card
   becomes the full-viewport reading surface; Escape or >10px scroll closes (800ms).
4. **O4 — Rain feels the scroll (S, do first — instant payoff).** Feed `Δcam` into the rain:
   speed multiplier `1 + clamp(k·|Δ|, 0, 2)` and a subtle column-lean by scroll direction — their
   velocity-kick, in our medium.
5. **O5 — Hover/focus physics (S).** Focused-card lift toward viewer ~5% + violet glow chased at
   0.08; brief flash peaking mid-transition.
6. **O6 — invSmooth deep links (S, ships with O1).** `#station-key` → scrollTop via
   `invSmooth(i/(N−1))`; keyboard focus auto-navigates the helix.

## 5. Constants appendix (the numbers that make the feel)

radius 3.8 · camera radius 7.6 · 50°/35° per item · drop 0.84/1.12 · start y +4 (mobile) ·
FOV 35/55 · pane 4×2.6 / 2.9×2.7 · shear 0.08/0.14 (≈4.6°/8°) · scroll 1050vh/525vh ·
deadzone 0.06/0.10 · lerps: scroll 0.1/0.5, camera 0.2, hover 0.08 (all ^(dt·60)) ·
entrance drift ±1 over 0→0.15 / 0.85→1 · intro 1200ms easeOutQuint stagger 200ms ·
label fade over camera-distance 5→6 · video crossfade 500ms +300ms delay ·
detail open 1500ms cubic-bezier(.29,.05,.06,.92), camera 700ms easeOutCubic, close 800ms,
scroll-to-close 10px/20px · bg velocity kick clamp(1500·Δp, −3, 3) · strips ×15, shear 0.42 ·
invSmooth(x) = 2x − x²(3−2x)

## 6. Matrix animation flavours (owner-requested, 2026-08-10 — Sprint O garnish menu)

Principle stolen from the reference: motion is REACTIVE (scroll/focus/angle), never idle
decoration. All immersive-layer (never mounts under RM), tier-gated, inside the ≤2ms rain budget.

| # | Effect | What | Tier | Size |
|---|---|---|---|---|
| A1 | Rain feels the scroll (=O4) | velocity kicks speed + column lean; settle ripple on stop | T1+ | S |
| A2 | The code makes way | columns crossing the focused card thin/dim — focus = clarity | T1+ | S-M |
| A3 | Rune surge | station change → runeRate ×4 for ~500ms | T1+ | XS |
| A4 | Operator lock-on | bracket corners snap onto focused card | all | S |
| A5 | Glyph-shred (=O2) | unfocused/off-axis text shreds to live glyphs, resolves on focus | T2+ | M |
| A6 | Digitize bloom (=O3 skin) | detail-open wipe edged with a ring of falling glyphs | T2+ | M |
| A7 | CRT slam | detail close → bright line → dot | all | S |
| A8 | Bullet-time trails | fast scroll leaves 2-3 decaying card afterimages | T2+ | S |
| A9 | Digital dissolve | exiting card crumbles bottom-up into glyph burst | T3 | M |
| A10 | Déjà vu | rare idle: one column repeats itself; fires deliberately on tint toggle | T2+ | XS |

Recommended core: A1+A2+A3+A4 (all reactive, all small). With helix: A5+A6+A7. Garnish: A8+A9.
Secret: A10.
