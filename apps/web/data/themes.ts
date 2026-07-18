/* Theme Studio presets. The preset colours live in packages/tokens/tokens.css as
   :root[data-theme=…] overrides; this module names them + flips the attribute. The AI Theme Studio
   (Sprint L P5) additionally sets a CUSTOM palette as inline CSS vars over an allowlist.
   applyTheme/currentTheme/applyCustomPalette touch document/localStorage only in their bodies (never at
   module scope), so importing this file is SSR-safe. */
export type ThemeId = "arcane" | "matrix" | "amber" | "mono";

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: "arcane", label: "arcane — violet + cyan (default)" },
  { id: "matrix", label: "matrix — terminal green" },
  { id: "amber", label: "amber — gold" },
  { id: "mono", label: "mono — grayscale" },
];

export const THEME_IDS: readonly string[] = THEMES.map((t) => t.id);
const KEY = "gipc-theme";

// AI Theme Studio: the 11 palette tokens a generated mood may set — the client-side allowlist.
// MUST stay in lockstep with PALETTE_TOKENS in services/ai/app/theme.py.
export const THEME_TOKENS = [
  "--violet", "--violet-bright", "--violet-deep", "--cyan", "--cyan-bright",
  "--glow-violet", "--glow-cyan", "--border", "--border-cyan", "--grad-accent", "--bg-radial",
] as const;
export const CUSTOM_KEY = "gipc-theme-custom";
// Only server-shaped colour values may reach a CSS var — defense-in-depth vs a tampered localStorage blob:
// #rrggbb | rgba(...) | linear|radial-gradient(...). The gradient class excludes '()' too, so no nested
// url()/image-set() — the 11 server values have no inner parens. No ';' '{' '}' either → no CSS breakout.
export const VALUE_RE = /^(#[0-9a-fA-F]{6}|rgba?\([\d.,\s]+\)|(?:linear|radial)-gradient\([^;{}()]*\))$/;

export function applyCustomPalette(map: Record<string, string>): void {
  const clean: Record<string, string> = {};
  for (const name of THEME_TOKENS) {
    const val = map[name];
    if (typeof val === "string" && VALUE_RE.test(val)) {
      document.documentElement.style.setProperty(name, val);
      clean[name] = val;
    }
  }
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(clean));
  } catch {
    /* private mode — applies for the session, just not persisted */
  }
}

export function resetCustomPalette(): void {
  for (const name of THEME_TOKENS) document.documentElement.style.removeProperty(name);
  try {
    localStorage.removeItem(CUSTOM_KEY);
  } catch {
    /* ignore */
  }
}

export function applyTheme(id: string): void {
  // a preset + a custom palette are mutually exclusive (inline vars outrank :root[data-theme]) → clear first
  resetCustomPalette();
  const valid: ThemeId = THEME_IDS.includes(id) ? (id as ThemeId) : "arcane";
  if (valid === "arcane") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = valid;
  try {
    localStorage.setItem(KEY, valid);
  } catch {
    /* private mode — applies for the session, just not persisted */
  }
}

export function currentTheme(): ThemeId {
  const t = document.documentElement.dataset.theme ?? "arcane";
  return THEME_IDS.includes(t) ? (t as ThemeId) : "arcane";
}
