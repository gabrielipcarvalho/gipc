/* Theme Studio presets. The colours live in packages/tokens/tokens.css as
   :root[data-theme=…] overrides; this module just names them + flips the attribute.
   applyTheme/currentTheme touch document/localStorage only in their bodies (never at
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

export function applyTheme(id: string): void {
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
