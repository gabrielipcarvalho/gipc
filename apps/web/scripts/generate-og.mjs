#!/usr/bin/env node
/**
 * Generates the committed brand images from the hex-sigil mark:
 *   - apps/web/public/og.png      (1200×630 Open Graph card)
 *   - apps/web/app/apple-icon.png (180×180 touch icon)
 *
 * Requires SYSTEM Google Chrome (uses `--headless=new --screenshot`); no
 * puppeteer dependency — this is a run-on-change tool, outputs are committed.
 *   node apps/web/scripts/generate-og.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, copyFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const CHROME =
  process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const SIGIL = (size) => `
  <svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#b18cff"/><stop offset="1" stop-color="#34e6ff"/>
    </linearGradient></defs>
    <polygon points="50,6 88,28 88,72 50,94 12,72 12,28" stroke="url(#g)" stroke-width="4" stroke-linejoin="round"/>
    <path d="M38 38 L56 50 L38 62" stroke="#34e6ff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M60 64 H70" stroke="#b18cff" stroke-width="6" stroke-linecap="round"/>
  </svg>`;

const page = (w, h, body) => `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${w}px;height:${h}px;overflow:hidden;
    font-family:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
    background:#0a0a12;
    background-image:radial-gradient(circle at 50% 0%,#15101f,#0a0a12 55%,#050409);
    display:flex;align-items:center;justify-content:center}
  .dots{position:absolute;inset:0;
    background-image:radial-gradient(rgba(177,140,255,.10) 1px, transparent 1px);
    background-size:30px 30px}
</style></head><body><div class="dots"></div>${body}</body></html>`;

const OG_BODY = `
  <div style="display:flex;align-items:center;gap:56px;z-index:1">
    ${SIGIL(240)}
    <div>
      <div style="font-size:96px;font-weight:700;color:#fff;letter-spacing:-2px;
                  text-shadow:0 0 34px rgba(177,140,255,.45)">arcane</div>
      <div style="font-size:30px;font-weight:600;color:#b18cff;margin-top:14px">
        the operator — backend · cloud · <span style="color:#34e6ff">AI arts</span></div>
      <div style="font-size:22px;color:#a99fce;margin-top:22px">
        gipc.dev — a real, self-hosted operator console. it's all live.</div>
    </div>
  </div>`;

const ICON_BODY = `<div style="z-index:1;display:flex">${SIGIL(132)}</div>`;

function shoot(w, h, body, out) {
  const dir = mkdtempSync(join(tmpdir(), "gipc-og-"));
  const html = join(dir, "in.html");
  writeFileSync(html, page(w, h, body));
  execFileSync(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--force-device-scale-factor=1",
    `--window-size=${w},${h}`,
    `--screenshot=${join(dir, "out.png")}`,
    `file://${html}`,
  ]);
  copyFileSync(join(dir, "out.png"), out);
  rmSync(dir, { recursive: true, force: true });
  console.log(`${out} — ${(statSync(out).size / 1024).toFixed(0)}KB`);
}

shoot(1200, 630, OG_BODY, join(webRoot, "public", "og.png"));
shoot(180, 180, ICON_BODY, join(webRoot, "app", "apple-icon.png"));

// palette-quantize the OG card (~290KB → ~44KB, imperceptible on this artwork);
// requires ImageMagick — skip gracefully if absent
try {
  const og = join(webRoot, "public", "og.png");
  execFileSync("magick", [og, "-colors", "255", `png8:${og}`]);
  console.log(`quantized og.png — ${(statSync(og).size / 1024).toFixed(0)}KB`);
} catch {
  console.warn("ImageMagick not found — og.png left unquantized");
}
