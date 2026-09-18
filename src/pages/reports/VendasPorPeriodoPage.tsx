import { useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, Tooltip } from "chart.js";
import { Bar } from "react-chartjs-2";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import type { SaleListItem } from "../../lib/api";
import { exportSalesCsv, exportSalesReportPdf, listSales, toSaleCsvRows } from "../../lib/api";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { InfoTooltip } from "../../components/InfoTooltip";
import { Pagination } from "../../components/Pagination";
import { PAYMENT_METHOD_LABEL, fmt, fmtDate, fmtDateTime, localDateKey } from "../../lib/format";
import { themeColor } from "../../theme";
import { logger } from "../../logger";
import { PeriodToolbar } from "./PeriodToolbar";
import { addDays, usePeriodFilter } from "./usePeriodFilter";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function weekdayShort(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** First real Relatórios screen (Admin-only) — establishes the pattern the
 * rest of `lib/reportsCatalog.ts`'s catalog will follow: period toolbar,
 * stat cards, a chart, and a raw listing right below it (so the numbers
 * above are traceable back to the sales that produced them, and "Exportar
 * CSV" has real rows to export instead of just the aggregates — see
 * `toSaleCsvRows`/`exportSalesCsv` in `lib/api.ts`, shared with
 * `SalesHistoryPage`'s own export button). "Exportar PDF" reuses the same
 * rows plus the 4 stat cards' own values (`exportSalesReportPdf`) — it
 * deliberately doesn't reproduce the on-screen chart, genpdf has no
 * drawing/canvas API to do that with (see `pdf_util.rs`'s doc comment).
 * Computed entirely client-side over `listSales()`, same "fetch everything,
 * filter/aggregate in the component" convention as Estoque/Histórico —
 * no dedicated backend command. Only `status === "completed"` sales count,
 * matching the Dashboard's own rule, so the listing's rows always sum to
 * the totals shown above them. */
export function VendasPorPeriodoPage() {
  const { user } = useAuth();
  const [sales, setSales] = useState<SaleListItem[]>([]);
  const period = usePeriodFilter();
  const { range, periodLabel } = period;
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[1]);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    listSales()
      .then(setSales)
      .catch((err) => logger.error("falha ao listar vendas", err));
  }, []);

  const filtered = useMemo(
    () =>
      sales.filter((s) => {
        if (s.status !== "completed") return false;
        const key = localDateKey(s.createdAt);
        return key >= range.from && key <= range.to;
      }),
    [sales, range],
  );

  useEffect(() => setPage(0), [period.preset, period.customFrom, period.customTo]);

  const totalVendido = filtered.reduce((sum, s) => sum + s.total, 0);
  const numVendas = filtered.length;
  const ticketMedio = numVendas > 0 ? totalVendido / numVendas : 0;

  const days = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const s of filtered) {
      const key = localDateKey(s.createdAt);
      byDay.set(key, (byDay.get(key) ?? 0) + s.total);
    }
    const list: { date: string; total: number }[] = [];
    for (let cursor = range.from; cursor <= range.to; cursor = addDays(cursor, 1)) {
      list.push({ date: cursor, total: byDay.get(cursor) ?? 0 });
    }
    return list;
  }, [filtered, range]);

  const peakDay = days.reduce<{ date: string; total: number } | null>(
    (best, d) => (d.total > (best?.total ?? -1) ? d : best),
    null,
  );

  const paginated = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const accent = themeColor("--color-primary", "#4f46e5");
  const peakDayLabel = peakDay && peakDay.total > 0 ? `${weekdayShort(peakDay.date)} · ${fmt(peakDay.total)}` : "—";

  async function handleExportCsv() {
    setExportError(null);
    let path: string | null;
    try {
      path = await save({ defaultPath: `vendas-${range.from}-a-${range.to}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }] });
    } catch (err) {
      logger.error("falha ao abrir seletor de destino do CSV", err);
      setExportError("Não foi possível abrir o seletor de arquivo.");
      return;
    }
    if (!path) return;
    try {
      await exportSalesCsv(path, toSaleCsvRows(filtered));
    } catch (err) {
      logger.error("falha ao exportar CSV de vendas por período", path, err);
      setExportError(String(err));
    }
  }

  async function handleExportPdf() {
    setExportError(null);
    let path: string | null;
    try {
      path = await save({ defaultPath: `vendas-${range.from}-a-${range.to}.pdf`, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    } catch (err) {
      logger.error("falha ao abrir seletor de destino do PDF", err);
      setExportError("Não foi possível abrir o seletor de arquivo.");
      return;
    }
    if (!path) return;
    try {
      await exportSalesReportPdf(
        path,
        "Vendas por período",
        periodLabel,
        [
          { label: "Total vendido", value: fmt(totalVendido) },
          { label: "Nº de vendas", value: String(numVendas) },
          { label: "Ticket médio", value: fmt(ticketMedio) },
          // The PDF has no hover/secondary line to disambiguate "Ter" like
          // the on-screen card does, so the date goes inline here instead.
          { label: "Dia de pico", value: peakDay && peakDay.total > 0 ? `${peakDayLabel} (${fmtDate(peakDay.date)})` : peakDayLabel },
        ],
        toSaleCsvRows(filtered),
      );
    } catch (err) {
      logger.error("falha ao exportar PDF de vendas por período", path, err);
      setExportError(String(err));
    }
  }

  if (!user) return null;
  if (!user.isAdmin) return <Navigate to="/" replace />;

  return (
    <div>
      <PeriodToolbar filter={period}>
        <Button variant="secondary" onClick={handleExportCsv}>
          ⭱ Exportar CSV
        </Button>
        <Button variant="secondary" onClick={handleExportPdf}>
          ⭱ Exportar PDF
        </Button>
      </PeriodToolbar>

      {exportError && <p className="mb-4 text-xs text-danger">{exportError}</p>}

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <div className="text-xs font-semibold text-theme-3">Total vendido</div>
          <div className="mt-1 text-2xl font-bold text-theme-1">{fmt(totalVendido)}</div>
        </Card>
        <Card>
          <div className="text-xs font-semibold text-theme-3">Nº de vendas</div>
          <div className="mt-1 text-2xl font-bold text-theme-1">{numVendas}</div>
        </Card>
        <Card>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-theme-3">
            Ticket médio
            <InfoTooltip text="Valor médio por venda: total vendido dividido pelo número de vendas no período." />
          </div>
          <div className="mt-1 text-2xl font-bold text-theme-1">{fmt(ticketMedio)}</div>
        </Card>
        <Card>
          <div className="text-xs font-semibold text-theme-3">Dia de pico</div>
          <div className="mt-1 text-2xl font-bold text-theme-1">{peakDayLabel}</div>
          {peakDay && peakDay.total > 0 && <div className="mt-0.5 text-xs text-theme-3">{fmtDate(peakDay.date)}</div>}
        </Card>
      </div>

      <Card title="Vendas por dia" hint={periodLabel} className="mb-4">
        <div className="h-52">
          <Bar
            data={{
              labels: days.map((d) => fmtDate(d.date)),
              datasets: [{ data: days.map((d) => d.total), backgroundColor: accent, borderRadius: 4, maxBarThickness: 40 }],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              animation: { duration: 250 },
              plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => ` ${fmt(ctx.parsed.y as number)}` } },
              },
              scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true, ticks: { callback: (v) => fmt(Number(v)) } },
              },
            }}
          />
        </div>
      </Card>

      <Card title="Vendas do período" hint="dado bruto por trás dos números acima">
        <div className="-m-5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-theme-border text-left text-xs uppercase tracking-wide text-theme-3">
                <th className="px-5 py-3">Recibo</th>
                <th className="px-5 py-3">Data</th>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Operador</th>
                <th className="px-5 py-3">Pagamento</th>
                <th className="px-5 py-3">Desconto</th>
                <th className="px-5 py-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((s) => (
                <tr key={s.id} className="border-b border-theme-border last:border-0 hover:bg-theme-hover">
                  <td className="px-5 py-3">
                    <code className="text-xs">{s.receiptNumber}</code>
                  </td>
                  <td className="px-5 py-3 text-theme-1">{fmtDateTime(s.createdAt)}</td>
                  <td className="px-5 py-3 text-theme-1">{s.clientName ?? "—"}</td>
                  <td className="px-5 py-3 text-theme-1">{s.userName}</td>
                  <td className="px-5 py-3 text-theme-1">{PAYMENT_METHOD_LABEL[s.paymentMethod] ?? s.paymentMethod}</td>
                  <td className="px-5 py-3 text-theme-3">{s.discountValue > 0 ? `-${fmt(s.discountValue)}` : "—"}</td>
                  <td className="px-5 py-3 text-theme-1">{fmt(s.total)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-center text-theme-3">
                    Nenhuma venda no período selecionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={filtered.length}
        onPageChange={setPage}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(0);
        }}
      />
    </div>
  );
}
