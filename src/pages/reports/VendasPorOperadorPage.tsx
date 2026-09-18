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
import { PeriodToolbar } from "./PeriodToolbar";
import { usePeriodFilter } from "./usePeriodFilter";

const REPORT_HEADERS = ["Operador", "Nº de vendas", "Total vendido", "Ticket médio"];
const REPORT_COLUMN_WEIGHTS = [4, 2, 3, 3];

/** Simplest Relatórios screen so far — just the shared period toolbar and a
 * table, no chart (matches `Plans/mockups-relatorios.html`'s own layout for
 * this one, unlike the Vendas por categoria/item and forma de pagamento
 * screens which pair a donut with theirs). Computed client-side over
 * `listSales()` — `userName`/`total` are already there, no new backend data
 * needed (same reasoning as `VendasPorFormaPagamentoPage`). Exports via the
 * generic `exportReportCsv`/`exportReportPdf`, not `exportSalesCsv`, since
 * this row shape (one per operador, not one per venda) isn't `SaleCsvRow`. */
export function VendasPorOperadorPage() {
  const { user } = useAuth();
  const [sales, setSales] = useState<SaleListItem[]>([]);
  const period = usePeriodFilter();
  const { range, periodLabel } = period;
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

  const byOperator = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const s of filtered) {
      const entry = map.get(s.userName) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += s.total;
      map.set(s.userName, entry);
    }
    return [...map.entries()]
      .map(([userName, { count, total }]) => ({ userName, count, total, ticketMedio: count > 0 ? total / count : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  function reportRows(): string[][] {
    return byOperator.map((o) => [o.userName, String(o.count), fmt(o.total), fmt(o.ticketMedio)]);
  }

  async function handleExportCsv() {
    setExportError(null);
    let path: string | null;
    try {
      path = await save({
        defaultPath: `vendas-por-operador-${range.from}-a-${range.to}.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
    } catch (err) {
      logger.error("falha ao abrir seletor de destino do CSV", err);
      setExportError("Não foi possível abrir o seletor de arquivo.");
      return;
    }
    if (!path) return;
    try {
      await exportReportCsv(path, REPORT_HEADERS, reportRows());
    } catch (err) {
      logger.error("falha ao exportar CSV de vendas por operador", path, err);
      setExportError(String(err));
    }
  }

  async function handleExportPdf() {
    setExportError(null);
    let path: string | null;
    try {
      path = await save({
        defaultPath: `vendas-por-operador-${range.from}-a-${range.to}.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
    } catch (err) {
      logger.error("falha ao abrir seletor de destino do PDF", err);
      setExportError("Não foi possível abrir o seletor de arquivo.");
      return;
    }
    if (!path) return;
    try {
      await exportReportPdf(path, "Vendas por operador", periodLabel, [], REPORT_HEADERS, REPORT_COLUMN_WEIGHTS, reportRows());
    } catch (err) {
      logger.error("falha ao exportar PDF de vendas por operador", path, err);
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

      <Card title="Vendas por operador" hint={periodLabel}>
        {byOperator.length === 0 ? (
          <p className="text-sm text-theme-3">Nenhuma venda no período selecionado.</p>
        ) : (
          <div className="-m-5 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-theme-border text-left text-xs uppercase tracking-wide text-theme-3">
                  <th className="px-5 py-3">Operador</th>
                  <th className="px-5 py-3 text-right">Nº de vendas</th>
                  <th className="px-5 py-3 text-right">Total vendido</th>
                  <th className="px-5 py-3 text-right">Ticket médio</th>
                </tr>
              </thead>
              <tbody>
                {byOperator.map((o) => (
                  <tr key={o.userName} className="border-b border-theme-border last:border-0 hover:bg-theme-hover">
                    <td className="px-5 py-3 text-theme-1">{o.userName}</td>
                    <td className="px-5 py-3 text-right text-theme-1">{o.count}</td>
                    <td className="px-5 py-3 text-right text-theme-1">{fmt(o.total)}</td>
                    <td className="px-5 py-3 text-right text-theme-1">{fmt(o.ticketMedio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
