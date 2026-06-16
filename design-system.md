# Design System — gipc.dev ("arcane" operator console)

> Locked 2026-06-16. Identity: **Arcane** palette (violet + cyan), **IBM Plex Mono**,
> **hex-sigil + prompt** mark. Visual north-star render: `.research/identity/hero.png`.
> Mark asset: `.research/identity/mark.svg`. Drop the tokens below straight into `:root`.

## Design principles
- **Operator console:** the site is a control plane for a real, living system.
- **Real > simulated:** every number/graph/agent is wired to something live.
- **Light arcane:** mystique in the *copy and accents*, professional in the *structure*.
- **Calm, premium, fast:** restraint over noise; motion with purpose; honor reduced-motion.

## Color tokens
```css
:root{
  /* surfaces */
  --bg:#0a0a12;                       /* page base (near-black, violet-tinted) */
  --bg-radial:radial-gradient(circle at 50% 0%,#15101f,#0a0a12 55%,#050409);
  --bg-elev:#100d1a;                  /* solid raised panel */
  --surface:rgba(20,16,32,.62);       /* glass panel */
  --surface-2:rgba(16,13,26,.86);     /* stronger glass */
  --hairline:rgba(255,255,255,.06);
  --border:rgba(177,140,255,.20);     /* violet-tinted border */
  --border-cyan:rgba(52,230,255,.22);

  /* accents */
  --violet:#b18cff;  --violet-bright:#c9b3ff;  --violet-deep:#8b5cf6;  /* primary */
  --cyan:#34e6ff;    --cyan-bright:#6ef0ff;                            /* secondary */

  /* text (one base, opacity ramp) */
  --text:#ece8ff;  --text-muted:#a99fce;  --text-faint:rgba(236,232,255,.50);
  /* ramp helpers: 100% / 70% / 50% / 35% of #ece8ff */

  /* signal / semantic */
  --ok:#57e6a8;  --warn:#ffce6b;  --err:#ff6f93;  --info:#34e6ff;

  /* gradients + glow */
  --grad-accent:linear-gradient(90deg,#b18cff,#34e6ff);
  --glow-violet:rgba(177,140,255,.45);
  --glow-cyan:rgba(52,230,255,.40);
}
```

## Typography
```css
:root{
  --font:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  /* weights in use: 400 body · 500 labels/emphasis · 600 headings · 700 display */
  --fs-display:clamp(2.6rem,7vw,4.8rem);  /* hero wordmark · w700 · ls -.02em · lh 1 */
  --fs-h1:clamp(1.5rem,3.5vw,2.2rem);     /* w700 */
  --fs-h2:clamp(1.1rem,2vw,1.4rem);       /* w600 */
  --fs-section:.78rem;                    /* UPPERCASE · ls .28em · w600 · muted (section marker) */
  --fs-body:1rem;                         /* lh 1.6 */
  --fs-sm:.8125rem;                       /* ls .02em */
  --fs-xs:.72rem;                         /* ls .06em */
}
```
- Base `line-height:1.6`, `-webkit-font-smoothing:antialiased`, `font-synthesis:none`.
- Section headers reuse the inspiration's pattern: small left `// marker` + large heading.

## Spacing, radius, layout
```css
:root{
  --sp-1:.25rem; --sp-2:.5rem; --sp-3:.75rem; --sp-4:1rem;
  --sp-6:1.5rem; --sp-8:2rem; --sp-12:3rem; --sp-16:4rem; --sp-24:6rem;
  --pad-section:clamp(2.5rem,4vw,3.5rem);
  --maxw:1100px;                 /* centered content column */
  --r-pill:999px; --r-card:16px; --r-input:10px; --r-sm:8px;
}
```

## Elevation & effects
```css
:root{
  --shadow-card:0 24px 60px rgba(0,0,0,.5);
  --shadow-pop:0 30px 80px rgba(0,0,0,.6),0 0 60px rgba(177,140,255,.10);
  --glow-soft:0 0 24px var(--glow-violet);
  --ring:0 0 0 2px rgba(52,230,255,.40);     /* keyboard focus */
  --text-glow:0 0 34px var(--glow-violet);   /* on display text */
  --glass:blur(14px);                         /* backdrop-filter */
}
```
**Ambient background layers** (compose on `--bg-radial`): violet dot-grid (30px, ~10% alpha,
radial mask), CRT scanlines (`repeating-linear-gradient` 1px/3px @ ~2.2% white), two large blurred
orbs (violet top-left, cyan bottom-right), center vignette.

## Motion language
```css
:root{
  --ease:cubic-bezier(.2,.8,.2,1);
  --ease-out:cubic-bezier(.16,1,.3,1);
  --dur-fast:140ms; --dur:200ms; --dur-slow:340ms;
}
@media (prefers-reduced-motion:reduce){ /* disable all non-essential motion */ }
```
**Signature motifs**
- **Boot / POST** on first load: typed lines + scanline sweep, skippable, ~1.2s.
- **Cursor blink** (1s steps) + **typewriter reveal** for terminal text.
- **Mana-pulse:** live status dots breathe (scale/opacity, ~2.4s) in violet/cyan.
- **Cast-ripple:** primary actions emit a soft violet radial ripple (~480ms).
- **Glint-sweep:** a sheen crosses glass panels on enter/hover.
- **Tilt:** subtle 3D card tilt (±6°, perspective ~800px) on hover.
- **Data-in:** status bars animate width; numbers count up.
- **Page transitions:** fade + `translateY(12px)`, ~180ms.

## Core components
- **Terminal window:** titlebar (traffic dots + hex-sigil mark + `arcane@prod : ~/path` + live
  meta) over a glass body; `--shadow-pop`, `--border`, corner violet glow.
- **Buttons:** primary = gradient pill (`--grad-accent`, dark text, `--glow-soft`); ghost = violet
  outline with 10% tint fill. Focus → `--ring`.
- **Chips:** pill, violet-tinted border, muted text, optional cyan annotation.
- **Status strip / metric row:** label · track bar (gradient fill + glow) · value.
- **Section header:** left `// marker` (muted, `--fs-section`) + large right-aligned title.

## Brand mark & wordmark
- **Mark:** hex sigil enclosing a `>` prompt + `_` cursor; violet→cyan gradient stroke, cyan
  chevron, violet underscore. Source: `mark.svg`. Use for favicon, nav, OG.
- **Wordmark:** `arcane` — IBM Plex Mono 700, lowercase. Clearspace ≥ 0.5× mark height.
- **Tagline:** *the operator — backend · cloud · AI arts.*
- Dark-surface only for now; add a light-bg variant if ever needed.

## Inherited-but-evolved from kaveenk.com
Terminal soul, opacity-ramp text hierarchy, pill/card radii, neon glow, glassmorphism, animated
timeline, prefers-reduced-motion discipline — all re-skinned to the arcane identity and wired to
**real** data instead of simulated.
