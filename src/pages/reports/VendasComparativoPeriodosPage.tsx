import { useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import type { SaleListItem } from "../../lib/api";
import { exportReportCsv, exportReportPdf, listSales } from "../../lib/api";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { fmt, localDateKey } from "../../lib/format";
import { logger } from "../../logger";

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** "2026-09" -> "Setembro/2026" — hand-rolled instead of
 * `toLocaleDateString` (which gives "setembro de 2026" in pt-BR) to match
 * the mockup's exact format. */
function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]}/${y}`;
}

interface MonthStats {
  total: number;
  count: number;
  ticketMedio: number;
}

function statsForMonth(sales: SaleListItem[], yearMonth: string): MonthStats {
  let total = 0;
  let count = 0;
  for (const s of sales) {
    if (s.status !== "completed") continue;
    if (localDateKey(s.createdAt).slice(0, 7) !== yearMonth) continue;
    total += s.total;
    count += 1;
  }
  return { total, count, ticketMedio: count > 0 ? total / count : 0 };
}

/** `null` when `previous` is 0 — an "infinite%" change from zero isn't a
 * meaningful number to show, so the UI falls back to "—" instead. */
function variance(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function fmtPercent(value: number): string {
  return `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(1).replace(".", ",")}%`;
}

function varianceLabel(current: number, previous: number): string {
  const v = variance(current, previous);
  return v !== null ? fmtPercent(v) : "—";
}

const REPORT_COLUMN_WEIGHTS = [3, 3, 3, 3];

/** Not in the original 11-report scope — added afterward on request, since
 * comparing one month against any other (not just "vs. mês anterior") is
 * useful enough to stand on its own (e.g. "vendi mais em janeiro desse ano
 * ou do ano passado?"). Doesn't use the shared `usePeriodFilter`/
 * `PeriodToolbar` (7d/mês/personalizado) — the comparison unit here is a
 * whole calendar month, picked from two dropdowns, not an arbitrary date
 * range. Both dropdowns only ever list months that actually had a completed
 * sale (`availableMonths`, derived from `listSales()` — no new backend
 * command), so there's never an empty month to pick and get a division-by-
 * zero-shaped result from. */
export function VendasComparativoPeriodosPage() {
  const { user } = useAuth();
  const [sales, setSales] = useState<SaleListItem[]>([]);
  const [monthA, setMonthA] = useState("");
  const [monthB, setMonthB] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    listSales()
      .then(setSales)
      .catch((err) => logger.error("falha ao listar vendas", err));
  }, []);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const s of sales) {
      if (s.status !== "completed") continue;
      set.add(localDateKey(s.createdAt).slice(0, 7));
    }
    return [...set].sort().reverse();
  }, [sales]);

  useEffect(() => {
    if (availableMonths.length === 0) return;
    setMonthA((prev) => (prev && availableMonths.includes(prev) ? prev : availableMonths[0]));
    setMonthB((prev) => (prev && availableMonths.includes(prev) ? prev : (availableMonths[1] ?? availableMonths[0])));
  }, [availableMonths]);

  const statsA = useMemo(() => statsForMonth(sales, monthA), [sales, monthA]);
  const statsB = useMemo(() => statsForMonth(sales, monthB), [sales, monthB]);
  const totalVariance = variance(statsA.total, statsB.total);

  const reportHeaders = ["Métrica", monthLabel(monthA), monthLabel(monthB), "Variação"];

  function reportRows(): string[][] {
    return [
      ["Total vendido", fmt(statsA.total), fmt(statsB.total), varianceLabel(statsA.total, statsB.total)],
      ["Nº de vendas", String(statsA.count), String(statsB.count), varianceLabel(statsA.count, statsB.count)],
      ["Ticket médio", fmt(statsA.ticketMedio), fmt(statsB.ticketMedio), varianceLabel(statsA.ticketMedio, statsB.ticketMedio)],
    ];
  }

  async function handleExportCsv() {
    setExportError(null);
    let path: string | null;
    try {
      path = await save({ defaultPath: `comparativo-${monthA}-vs-${monthB}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }] });
    } catch (err) {
      logger.error("falha ao abrir seletor de destino do CSV", err);
      setExportError("Não foi possível abrir o seletor de arquivo.");
      return;
    }
    if (!path) return;
    try {
      await exportReportCsv(path, reportHeaders, reportRows());
    } catch (err) {
      logger.error("falha ao exportar CSV de comparativo de períodos", path, err);
      setExportError(String(err));
    }
  }

  async function handleExportPdf() {
    setExportError(null);
    let path: string | null;
    try {
      path = await save({ defaultPath: `comparativo-${monthA}-vs-${monthB}.pdf`, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    } catch (err) {
      logger.error("falha ao abrir seletor de destino do PDF", err);
      setExportError("Não foi possível abrir o seletor de arquivo.");
      return;
    }
    if (!path) return;
    try {
      await exportReportPdf(
        path,
        "Comparativo de períodos",
        `${monthLabel(monthA)} vs. ${monthLabel(monthB)}`,
        [],
        reportHeaders,
        REPORT_COLUMN_WEIGHTS,
        reportRows(),
      );
    } catch (err) {
      logger.error("falha ao exportar PDF de comparativo de períodos", path, err);
      setExportError(String(err));
    }
  }

  if (!user) return null;
  if (!user.isAdmin) return <Navigate to="/" replace />;

  if (availableMonths.length === 0) {
    return <p className="text-sm text-theme-3">Nenhuma venda registrada ainda — nada pra comparar.</p>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={monthA}
          onChange={(e) => setMonthA(e.target.value)}
          className="rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-1 outline-none"
        >
          {availableMonths.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        <span className="text-sm text-theme-3">vs.</span>
        <select
          value={monthB}
          onChange={(e) => setMonthB(e.target.value)}
          className="rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-1 outline-none"
        >
          {availableMonths.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <Button variant="secondary" onClick={handleExportCsv}>
          ⭱ Exportar CSV
        </Button>
        <Button variant="secondary" onClick={handleExportPdf}>
          ⭱ Exportar PDF
        </Button>
      </div>

      {exportError && <p className="mb-4 text-xs text-danger">{exportError}</p>}

      <div className="mb-4 grid grid-cols-2 gap-4">
        <Card>
          <div className="text-xs font-semibold text-theme-3">{monthLabel(monthA)}</div>
          <div className="mt-1 text-2xl font-bold text-theme-1">{fmt(statsA.total)}</div>
          {totalVariance !== null && (
            <div className={`mt-1 text-xs font-semibold ${totalVariance >= 0 ? "text-success" : "text-danger"}`}>
              {totalVariance >= 0 ? "▲" : "▼"} {fmtPercent(totalVariance)} vs. {monthLabel(monthB)}
            </div>
          )}
        </Card>
        <Card>
          <div className="text-xs font-semibold text-theme-3">{monthLabel(monthB)}</div>
          <div className="mt-1 text-2xl font-bold text-theme-1">{fmt(statsB.total)}</div>
        </Card>
      </div>

      <Card title="Detalhamento">
        <div className="-m-5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-theme-border text-left text-xs uppercase tracking-wide text-theme-3">
                <th className="px-5 py-3">Métrica</th>
                <th className="px-5 py-3 text-right">{monthLabel(monthA)}</th>
                <th className="px-5 py-3 text-right">{monthLabel(monthB)}</th>
                <th className="px-5 py-3 text-right">Variação</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Total vendido", a: statsA.total, b: statsB.total, fmtValue: fmt },
                { label: "Nº de vendas", a: statsA.count, b: statsB.count, fmtValue: (v: number) => String(v) },
                { label: "Ticket médio", a: statsA.ticketMedio, b: statsB.ticketMedio, fmtValue: fmt },
              ].map((row) => {
                const v = variance(row.a, row.b);
                return (
                  <tr key={row.label} className="border-b border-theme-border last:border-0">
                    <td className="px-5 py-3 text-theme-1">{row.label}</td>
                    <td className="px-5 py-3 text-right text-theme-1">{row.fmtValue(row.a)}</td>
                    <td className="px-5 py-3 text-right text-theme-1">{row.fmtValue(row.b)}</td>
                    <td className={`px-5 py-3 text-right font-semibold ${v === null ? "text-theme-3" : v >= 0 ? "text-success" : "text-danger"}`}>
                      {v !== null ? fmtPercent(v) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
