# ADR 0001 — Vanilla CSS + design tokens + hand-rolled motion (not Tailwind + Framer Motion)

- **Status:** Accepted (2026-07-15)
- **Supersedes:** the "Tailwind CSS · Framer Motion" entry in the old `tech-stack.md` locked-stack table.

## Context

An early planning table (`tech-stack.md`) named **Tailwind CSS** and **Framer Motion** for the frontend.
The site as actually built (v1 → M5) uses neither: styling is **vanilla CSS driven by `@gipc/tokens`
design tokens**, and animation is a small **hand-rolled motion layer** (`apps/web/app/components/motion.ts`
+ CSS `@keyframes`). This ADR ratifies the shipped reality (ratify-as-changed) and records why.

Verification: `apps/web/package.json` (and the root `package.json`) contain **no `tailwindcss` and no
`framer-motion`** dependency; there is no `tailwind.config`/`postcss` Tailwind pipeline; the only frontend
styling dependency is `@gipc/tokens`. The "Tailwind/Framer" line was aspirational, never adopted.

## Decision

Standardise on **vanilla CSS + `@gipc/tokens` CSS custom properties + a hand-rolled, reduced-motion-correct
motion layer**. Do NOT adopt Tailwind CSS or Framer Motion.

- **Colour/spacing/type:** design tokens (`packages/tokens/tokens.css`) — `var(--…)`, `color-mix()`, the
  `data-theme` preset system (arcane/matrix/amber/mono). No utility-class framework.
- **Motion:** `apps/web/app/components/motion.ts` + CSS keyframes; every JS-driven animation guards on
  `matchMedia("(prefers-reduced-motion: reduce)")`, and a global reset (`globals.css:62`,
  `*{animation:none!important;transition:none!important}`) covers CSS under reduced-motion.

## Consequences

- **Pro:** zero CSS-framework runtime + no Tailwind build toolchain; full control via tokens (theme presets,
  `color-mix`, `data-theme` overrides); a tiny motion layer that is reduced-motion-correct by construction;
  SSR-safe with no extra client bundle (Framer Motion would add one for marginal benefit on a content-first
  site).
- **Con (accepted):** more hand-written CSS and no utility-class ergonomics. Acceptable — the codebase is
  small, token-consistent, and the team is one engineer.
- Future contributors: use tokens + `motion.ts`, not utility classes or a motion library. New colour goes in
  `@gipc/tokens`, not raw hex.

## Appendix — raw-hex + motion consistency audit (2026-07-15)

Codebase-wide grep for raw hex outside `packages/tokens/tokens.css`, reconciled with `scripts/verify.sh`'s
own sanctioned-exception list. Result: **2 spot-fixes applied (rendering-identical), the rest documented as
accepted.**

**Fixed (token-for-identical-hex — no colour shift; theme-invariant since none of these tokens is
overridden by the matrix/amber/mono presets):**
- `globals.css` `.btn-primary` `color:#0a0a12` → `var(--bg)` (`--bg:#0a0a12`).
- `globals.css` `.dot.r/.y/.g` `#ff6f93`/`#ffce6b`/`#57e6a8` → `var(--err)`/`var(--warn)`/`var(--ok)` (exact
  token hues). Note: these are decorative macOS-window-chrome dots — the swap is a hue-identity de-hex, not a
  semantic claim.

**Accepted as-is (documented — NOT changed, to avoid theme/brand regression in a polish sprint):**
- **Sanctioned brand/construct exceptions (already excluded by `verify.sh:119`):**
  `app/sigil.tsx` (`#b18cff`/`#34e6ff` brand-mark SVG gradient/strokes) and `app/icon.svg` (favicon), and
  `app/resume/Immersive.tsx` (`#c8ffc8`/`#9fdf9f`/… construct canvas-rain glyph colours). **The sigil hex
  must NOT be swapped to `var(--violet)`/`var(--cyan)`** — that would re-skin the brand mark under the
  non-arcane themes (a rendering change), exactly the unsafe move this audit forbids.
- **`--mx-*` Matrix-construct vars** (`globals.css` ~536–541: `--mx-green #00ff41`, `--mx-bg #020802`,
  `--mx-head #c8ffc8`, …) — the sanctioned construct exception.
- **Neutral pure b/w** (`#fff`/`#000` in a few borders/shadows/overlays) — theme-invariant; low value to
  tokenise; kept to avoid regression risk.
- **`layout.tsx:56` `themeColor: "#0a0a12"`** — a Next.js metadata literal; metadata cannot take a CSS var,
  so it stays (matches `--bg`).
- **`@media print` construct grays** in `globals.css` (`#bbb`/`#333`/`#111`/`#555`) — print-only; accepted.
- **Inline `style=` colour usages:** grep found **none** in `apps/web/app`.

**Motion:** the global reduced-motion reset (`globals.css:62`) covers all CSS animation/transition; every
JS-driven motion path (`motion.ts`, the console boot, `ConstructShell`, `Immersive`, `EasterEggs`,
`MatrixText`, `CountUpText`) guards on `matchMedia("(prefers-reduced-motion: reduce)")`. No unguarded JS
motion found.

**Post-state:** `verify.sh` hex-WARN goes from 7 matching lines to 5 (the `themeColor` literal + the 4 `--mx-*`
construct vars remain by design — the target is *reduced*, not zero). No visual change.

## Reaffirmed (Sprint K — ux-polish, 2026-07-18)

Sprint K's UI work — per-project architecture diagrams (reusing the existing `ArchDiagram` engine over
honest per-project data), the experience-timeline scanning-spine rail + a real links-out row, and the
console typewriter caret cursor + spark — added **zero dependencies** (`git diff main…HEAD -- **/package.json`
is empty) and extended the SAME vanilla-CSS + `@gipc/tokens` + hand-rolled-motion system. The decision
holds; the shipped commits are `a5e8369` · `17a601c` · `1bb8662` · `b8b2b0b`.

**Correction to the reduced-motion claim above (§Decision "Motion" and Appendix "Motion"):** the global
reset `*{animation:none!important}` (globals.css:62) does NOT match pseudo-elements — the universal
selector `*` never selects `::before`/`::after`, so the canonical reset is `*, *::before, *::after`.
Sprint K found the pre-existing `.tl::before` rail pulse was consequently leaking under reduced-motion,
and added a scoped `@media(prefers-reduced-motion){.tl::before,.tl::after{animation:none}}` fix
(globals.css). The **site-wide** broadening of line 62 to cover all pseudo-elements remains an OPEN
deferred finding (it changes RM behaviour on every page → needs a cross-page regression sweep first).
