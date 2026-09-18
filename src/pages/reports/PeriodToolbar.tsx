import type { ReactNode } from "react";
import type { PeriodFilter, PeriodPreset } from "./usePeriodFilter";

interface PeriodToolbarProps {
  filter: PeriodFilter;
  /** Extra controls (variant switch, export buttons) rendered after a flex
   * spacer, same row as the period select. */
  children?: ReactNode;
}

const inputClass = "rounded-lg border border-theme-border bg-theme-surface px-2 py-2 text-sm text-theme-1 outline-none";

/** The period `<select>` + resolved-range label, plus (only for
 * "Personalizado") De/Até inputs — shared by every Vendas report, see
 * `usePeriodFilter`. The resolved range shows as plain text next to the
 * select for "Últimos 7 dias"/"Este mês" so picking a preset doesn't leave
 * the admin guessing which actual dates they're looking at; hidden for
 * "Personalizado" since the De/Até inputs already show the dates directly. */
export function PeriodToolbar({ filter, children }: PeriodToolbarProps) {
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, periodLabel } = filter;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <select
        value={preset}
        onChange={(e) => setPreset(e.target.value as PeriodPreset)}
        className="rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-1 outline-none"
      >
        <option value="7d">Últimos 7 dias</option>
        <option value="month">Este mês</option>
        <option value="custom">Personalizado...</option>
      </select>
      {preset !== "custom" && <span className="text-xs text-theme-3">{periodLabel}</span>}
      {preset === "custom" && (
        <>
          <label className="flex items-center gap-1.5 text-xs text-theme-3">
            De
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className={inputClass} />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-theme-3">
            Até
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className={inputClass} />
          </label>
        </>
      )}
      <div className="flex-1" />
      {children}
    </div>
  );
}
