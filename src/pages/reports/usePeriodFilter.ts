import { useMemo, useState } from "react";
import { fmtDate } from "../../lib/format";

export type PeriodPreset = "7d" | "month" | "custom";

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(dateKey: string, delta: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d + delta);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Shared "Últimos 7 dias / Este mês / Personalizado" period picker — every
 * Vendas report in `Plans/mockups-relatorios.html` uses the same toolbar
 * select, so the state/range logic is built once here (paired with
 * `PeriodToolbar` for the matching UI) instead of copy-pasted per report. */
export function usePeriodFilter() {
  const [preset, setPreset] = useState<PeriodPreset>("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const today = todayKey();
  const range = useMemo(() => {
    if (preset === "7d") return { from: addDays(today, -6), to: today };
    if (preset === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
    return { from: customFrom || today, to: customTo || today };
  }, [preset, today, customFrom, customTo]);

  const periodLabel = `${fmtDate(range.from)} a ${fmtDate(range.to)}`;

  return { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range, periodLabel };
}

export type PeriodFilter = ReturnType<typeof usePeriodFilter>;
