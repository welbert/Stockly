import { useFontScale } from "../context/FontScaleContext";
import { FONT_SCALES } from "../fontScale";

/** Controle segmentado (pílula), um segmento por tamanho do catálogo
 * (`src/fontScale.ts`) — nunca hardcoda os tamanhos; um novo passo só
 * precisa entrar em `FONT_SCALES`. O "Aa" de cada opção é renderizado no
 * tamanho relativo real, funcionando como preview em vez de um swatch de cor
 * (que não faz sentido aqui). */
export function FontScaleSwitcher() {
  const { fontScale, setFontScale } = useFontScale();

  return (
    <div className="inline-flex gap-0.5 rounded-full border border-theme-border bg-theme-hover p-1">
      {FONT_SCALES.map((s) => (
        <button
          key={s.id}
          onClick={() => setFontScale(s.id)}
          aria-pressed={fontScale === s.id}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            fontScale === s.id ? "bg-theme-surface text-primary shadow-sm" : "text-theme-3 hover:text-theme-1"
          }`}
        >
          <span style={{ fontSize: `${s.percent}%` }} aria-hidden>
            Aa
          </span>
          {s.label}
        </button>
      ))}
    </div>
  );
}
