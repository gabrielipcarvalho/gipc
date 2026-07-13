import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "@gipc/tokens/tokens.css";
import "./globals.css";
import { Nav } from "./components/Nav";
import { CommandPalette } from "./components/CommandPalette";
import { RouteFocus } from "./components/RouteFocus";
import { EasterEggs } from "./components/EasterEggs";
import { THEME_IDS } from "../data/themes";

// non-default theme ids for the no-flash guard — derived so a new preset can't drift
const THEME_GUARD = JSON.stringify(THEME_IDS.filter((id) => id !== "arcane"));

const plex = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://gipc.dev"),
  title: "arcane — the operator · backend · cloud · AI arts",
  description:
    "gipc.dev — an operator's console for a real, self-hosted system. Every metric, deploy and agent here is live, not a mockup.",
  openGraph: {
    title: "gipc.dev — the arcane operator console",
    description: "A real, self-hosted operator console. It's all live.",
    type: "website",
    url: "https://gipc.dev",
    siteName: "gipc.dev",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "arcane — the gipc.dev operator console" }],
  },
};

export const viewport = {
  themeColor: "#0a0a12",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={plex.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/* no-flash theme: apply the saved preset before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('gipc-theme');if(t&&${THEME_GUARD}.indexOf(t)>-1)document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
        <div className="ambient" aria-hidden />
        {/* app-shell is the palette's inert target when the dialog is open */}
        <div id="app-shell">
          <Nav />
          {children}
        </div>
        <CommandPalette />
        <RouteFocus />
        <EasterEggs />
      </body>
    </html>
  );
}
