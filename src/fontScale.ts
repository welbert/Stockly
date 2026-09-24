export interface FontScaleDefinition {
  id: string;
  label: string;
  /** Applied as the `<html>` element's `font-size` (percentage of the
   * browser/webview default, 16px = 100%) — every Tailwind `text-*` utility
   * is `rem`-based, so this scales the whole app's text proportionally
   * without touching any component. Capped at 125%: the sidebar is a fixed
   * 220px column (`AppShell.tsx`), so a much larger scale starts truncating
   * nav labels more aggressively than is worth trading for extra size. */
  percent: number;
}

/**
 * Single source of truth for which font sizes exist — same pattern as
 * `THEMES` in `theme.ts`. Adding a step is one entry here + adding it to the
 * `CHECK` constraint on `users.font_scale` (see docs/database.md). Nothing
 * that consumes `FontScaleId` needs to change.
 */
export const FONT_SCALES: FontScaleDefinition[] = [
  { id: "small", label: "Pequena", percent: 90 },
  { id: "normal", label: "Padrão", percent: 100 },
  { id: "large", label: "Grande", percent: 112.5 },
  { id: "xlarge", label: "Extra grande", percent: 125 },
];

export type FontScaleId = (typeof FONT_SCALES)[number]["id"];

const DEFAULT_FONT_SCALE: FontScaleId = "normal";
const STORAGE_KEY = "fontScale";

export function isKnownFontScale(value: string): value is FontScaleId {
  return FONT_SCALES.some((s) => s.id === value);
}

/** Used before any user is logged in (first-run/login/lock screens) — same
 * reasoning as `getStoredTheme`: someone who needs larger text needs it
 * already at the login screen, not just after signing in. */
export function getStoredFontScale(): FontScaleId {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored && isKnownFontScale(stored) ? stored : DEFAULT_FONT_SCALE;
}

export function storeFontScale(scale: FontScaleId) {
  localStorage.setItem(STORAGE_KEY, scale);
}

export function applyFontScale(scale: FontScaleId) {
  const definition = FONT_SCALES.find((s) => s.id === scale) ?? FONT_SCALES.find((s) => s.id === DEFAULT_FONT_SCALE)!;
  document.documentElement.style.fontSize = `${definition.percent}%`;
}
