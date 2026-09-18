import { useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { ArcElement, Chart as ChartJS, Tooltip } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import type { PaymentMethod, SaleListItem } from "../../lib/api";
import { exportReportCsv, exportReportPdf, listSales, openContainingFolder } from "../../lib/api";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { useToast } from "../../context/ToastContext";
import { PAYMENT_METHOD_LABEL, fmt, localDateKey } from "../../lib/format";
import { logger } from "../../logger";
import { themeColor } from "../../theme";
import { PeriodToolbar } from "./PeriodToolbar";
import { usePeriodFilter } from "./usePeriodFilter";

ChartJS.register(ArcElement, Tooltip);

/** Fixed per-method color (not palette-by-index) — same method should always
 * read the same color, regardless of which methods had sales in the period.
 * Same mapping as the Dashboard's `FormasPagamentoCard`, kept local here (it
 * isn't shared between the two today, matching how that card doesn't import
 * from anywhere else either). */
function colorFor(method: PaymentMethod): string {
  switch (method) {
    case "cash":
      return themeColor("--color-success", "#16a34a");
    case "card":
      return themeColor("--color-primary", "#4f46e5");
    case "pix":
      return themeColor("--color-info", "#0891b2");
    case "credit":
      return themeColor("--color-warning", "#d97706");
  }
}

const REPORT_HEADERS = ["Forma de pagamento", "Nº de vendas", "Total"];
const REPORT_COLUMN_WEIGHTS = [3, 2, 2];

export function VendasPorFormaPagamentoPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [sales, setSales] = useState<SaleListItem[]>([]);
  const period = usePeriodFilter();
  const { range, periodLabel } = period;

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

  const byMethod = useMemo(() => {
    const map = new Map<PaymentMethod, { count: number; total: number }>();
    for (const s of filtered) {
      const entry = map.get(s.paymentMethod) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += s.total;
      map.set(s.paymentMethod, entry);
    }
    return [...map.entries()]
      .map(([paymentMethod, { count, total }]) => ({ paymentMethod, count, total }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  const totalCount = filtered.length;

  function reportRows(): string[][] {
    return byMethod.map((m) => [PAYMENT_METHOD_LABEL[m.paymentMethod] ?? m.paymentMethod, String(m.count), fmt(m.total)]);
  }

  async function handleExportCsv() {
    let path: string | null;
    try {
      path = await save({
        defaultPath: `vendas-forma-pagamento-${range.from}-a-${range.to}.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
    } catch (err) {
      logger.error("falha ao abrir seletor de destino do CSV", err);
      showToast({ type: "error", title: "Não foi possível abrir o seletor de arquivo" });
      return;
    }
    if (!path) return;
    try {
      await exportReportCsv(path, REPORT_HEADERS, reportRows());
      showToast({
        type: "success",
        title: "CSV de Vendas por forma de pagamento gerado",
        message: "Clique aqui para abrir a pasta",
        onClick: () => openContainingFolder(path!),
      });
    } catch (err) {
      logger.error("falha ao exportar CSV de vendas por forma de pagamento", path, err);
      showToast({ type: "error", title: "Falha ao exportar CSV de Vendas por forma de pagamento", message: String(err) });
    }
  }

  async function handleExportPdf() {
    let path: string | null;
    try {
      path = await save({
        defaultPath: `vendas-forma-pagamento-${range.from}-a-${range.to}.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
    } catch (err) {
      logger.error("falha ao abrir seletor de destino do PDF", err);
      showToast({ type: "error", title: "Não foi possível abrir o seletor de arquivo" });
      return;
    }
    if (!path) return;
    try {
      await exportReportPdf(
        path,
        "Vendas por forma de pagamento",
        `${periodLabel} · ${totalCount} venda(s)`,
        [],
        REPORT_HEADERS,
        REPORT_COLUMN_WEIGHTS,
        reportRows(),
      );
      showToast({
        type: "success",
        title: "PDF de Vendas por forma de pagamento gerado",
        message: "Clique aqui para abrir a pasta",
        onClick: () => openContainingFolder(path!),
      });
    } catch (err) {
      logger.error("falha ao exportar PDF de vendas por forma de pagamento", path, err);
      showToast({ type: "error", title: "Falha ao exportar PDF de Vendas por forma de pagamento", message: String(err) });
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

      <Card title="Vendas por forma de pagamento" hint={`${periodLabel} · ${totalCount} venda(s)`}>
        {totalCount === 0 ? (
          <p className="text-sm text-theme-3">Nenhuma venda no período selecionado.</p>
        ) : (
          <div className="flex flex-col gap-6 md:flex-row md:items-center">
            <div className="relative h-[160px] w-[160px] shrink-0 self-center">
              <Doughnut
                data={{
                  labels: byMethod.map((m) => PAYMENT_METHOD_LABEL[m.paymentMethod] ?? m.paymentMethod),
                  datasets: [
                    { data: byMethod.map((m) => m.count), backgroundColor: byMethod.map((m) => colorFor(m.paymentMethod)), borderWidth: 0 },
                  ],
                }}
                options={{
                  cutout: "62%",
                  animation: { duration: 250 },
                  plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed} venda(s)` } },
                  },
                }}
              />
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-lg font-bold text-theme-1">{totalCount}</div>
                <div className="text-[10px] uppercase tracking-wide text-theme-3">vendas</div>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-theme-border text-left text-xs uppercase tracking-wide text-theme-3">
                    <th className="pb-2">Forma de pagamento</th>
                    <th className="pb-2 text-right">Nº de vendas</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {byMethod.map((m) => (
                    <tr key={m.paymentMethod} className="border-b border-theme-border last:border-0">
                      <td className="py-2">
                        <span className="flex items-center gap-1.5 text-theme-1">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorFor(m.paymentMethod) }} />
                          {PAYMENT_METHOD_LABEL[m.paymentMethod] ?? m.paymentMethod}
                        </span>
                      </td>
                      <td className="py-2 text-right text-theme-1">{m.count}</td>
                      <td className="py-2 text-right text-theme-1">{fmt(m.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
