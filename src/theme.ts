export interface ThemeDefinition {
  id: string;
  label: string;
  /** Swatch color for the theme picker UI — the theme's `--theme-bg` value. */
  swatch: string;
}

/**
 * Single source of truth for which themes exist. Adding a theme is: one
 * entry here + a matching `[data-theme="id"]` block in index.css (and, if
 * it should be selectable in the DB, adding it to the CHECK constraint on
 * `users.theme` — see docs/database.md). Nothing that consumes `ThemeId`
 * needs to change.
 */
export const THEMES: ThemeDefinition[] = [
  { id: "light", label: "Claro", swatch: "#f4f5f7" },
  { id: "dark", label: "Escuro", swatch: "#0f1016" },
];

export type ThemeId = (typeof THEMES)[number]["id"];

const DEFAULT_THEME: ThemeId = "light";
const STORAGE_KEY = "theme";

export function isKnownTheme(value: string): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

/** Used before any user is logged in (first-run/login/lock screens). */
export function getStoredTheme(): ThemeId {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored && isKnownTheme(stored) ? stored : DEFAULT_THEME;
}

export function storeTheme(theme: ThemeId) {
  localStorage.setItem(STORAGE_KEY, theme);
}

export function applyTheme(theme: ThemeId) {
  document.documentElement.setAttribute("data-theme", theme);
}
