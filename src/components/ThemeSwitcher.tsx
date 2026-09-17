import { useTheme } from "../context/ThemeContext";
import { THEMES } from "../theme";

/** Controle segmentado (pílula), um segmento por tema do catálogo (`src/theme.ts`)
 * — nunca hardcoda "claro/escuro"; um tema novo só precisa entrar em `THEMES`. */
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="inline-flex gap-0.5 rounded-full border border-theme-border bg-theme-hover p-1">
      {THEMES.map((t) => (
        <button
          key={t.id}
          onClick={() => setTheme(t.id)}
          aria-pressed={theme === t.id}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            theme === t.id ? "bg-theme-surface text-primary shadow-sm" : "text-theme-3 hover:text-theme-1"
          }`}
        >
          <span
            className="h-3 w-3 rounded-full border border-theme-border"
            style={{ background: t.swatch }}
            aria-hidden
          />
          {t.label}
        </button>
      ))}
    </div>
  );
}
