import { ImageResponse } from "next/og";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/* Shared per-route OG-image generator (1200×630). Fonts read from disk with a cwd-fallback: at BUILD cwd is
   the Next project dir (apps/web) → "app/og/fonts"; in the standalone SERVER cwd is the bundle root (/app) →
   "apps/web/app/og/fonts". next.config `outputFileTracingIncludes` traces the .ttf into the standalone bundle
   so the runtime path exists (a bare process.cwd()-relative read is otherwise NOT traced → 500 in prod).
   satori cannot resolve CSS custom properties, so brand colours are literal hex here (a sanctioned raw-hex
   exception mirroring tokens.css: bg --bg #0a0a12, violet --violet #b18cff, cyan --cyan #34e6ff). */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

function fontBytes(file: string): Buffer {
  const candidates = [
    join(process.cwd(), "app/og/fonts", file), // build: cwd = apps/web
    join(process.cwd(), "apps/web/app/og/fonts", file), // standalone runtime: cwd = /app
  ];
  for (const p of candidates) if (existsSync(p)) return readFileSync(p);
  throw new Error(`OG font not found: ${file} (cwd=${process.cwd()})`);
}
const regular = fontBytes("IBMPlexMono-Regular.ttf");
const medium = fontBytes("IBMPlexMono-Medium.ttf");

const BG = "#0a0a12";
const VIOLET = "#b18cff";
const CYAN = "#34e6ff";
const TEXT = "#e8e8f0";
const MUTED = "#8a8aa0";

export function renderOg(title: string, kicker = "the operator") {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BG,
          backgroundImage: `radial-gradient(1000px 500px at 82% -8%, rgba(177,140,255,0.18), transparent), radial-gradient(900px 500px at 8% 108%, rgba(52,230,255,0.12), transparent)`,
          padding: "72px 80px",
          fontFamily: "IBM Plex Mono",
        }}
      >
        {/* top: hex-sigil + kicker (inline SVG — satori drops CSS clip-path, so draw the hexagon) */}
        <div style={{ display: "flex", alignItems: "center", gap: "22px" }}>
          <svg width="48" height="48" viewBox="0 0 100 100" fill="none">
            <polygon points="50,4 92,27 92,73 50,96 8,73 8,27" stroke={VIOLET} strokeWidth="6" />
          </svg>
          <div style={{ display: "flex", color: CYAN, fontSize: "26px", letterSpacing: "0.14em" }}>
            {kicker}
          </div>
        </div>

        {/* middle: the title */}
        <div
          style={{
            display: "flex",
            color: TEXT,
            fontSize: title.length > 26 ? "76px" : "92px",
            fontWeight: 500,
            lineHeight: 1.12,
            letterSpacing: "-0.01em",
            maxWidth: "1000px",
          }}
        >
          {title}
        </div>

        {/* bottom: accent rule + wordmark */}
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div
            style={{
              display: "flex",
              width: "220px",
              height: "5px",
              background: `linear-gradient(90deg, ${VIOLET}, ${CYAN})`,
              borderRadius: "3px",
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", color: TEXT, fontSize: "34px", fontWeight: 500 }}>gipc.dev</div>
            <div style={{ display: "flex", color: MUTED, fontSize: "24px", letterSpacing: "0.06em" }}>
              self-hosted · live
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "IBM Plex Mono", data: regular, weight: 400, style: "normal" },
        { name: "IBM Plex Mono", data: medium, weight: 500, style: "normal" },
      ],
    },
  );
}
