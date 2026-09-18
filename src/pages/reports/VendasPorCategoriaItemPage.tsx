import { useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { ArcElement, Chart as ChartJS, Tooltip } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import type { SaleItemReportRow } from "../../lib/api";
import { exportReportCsv, exportReportPdf, listSaleItemsReport } from "../../lib/api";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { fmt, localDateKey } from "../../lib/format";
import { logger } from "../../logger";
import { themeColor } from "../../theme";
import { PeriodToolbar } from "./PeriodToolbar";
import { usePeriodFilter } from "./usePeriodFilter";

ChartJS.register(ArcElement, Tooltip);

const NEUTRAL_COLOR = "#d7dae2";

/** Palette-by-index (not fixed per category, unlike payment methods — a
 * category isn't a small fixed set) — same colors/order as the Dashboard's
 * `VendasPorCategoriaCard`, kept local here since that card doesn't export
 * its own palette for reuse either. */
function palette(): string[] {
  return [
    themeColor("--color-primary", "#4f46e5"),
    themeColor("--color-info", "#0891b2"),
    themeColor("--color-success", "#16a34a"),
    themeColor("--color-warning", "#d97706"),
    themeColor("--color-danger", "#dc2626"),
  ];
}

type Variant = "categoria" | "item";

const CATEGORY_HEADERS = ["Categoria", "Total"];
const CATEGORY_COLUMN_WEIGHTS = [3, 2];
const ITEM_HEADERS = ["Item", "Categoria", "Qtd. vendida", "Total"];
const ITEM_COLUMN_WEIGHTS = [5, 4, 3, 3];

/** Toggle between "Por categoria" (donut) and "Por item" (table sorted by
 * quantity) — same `Plans/mockups-relatorios.html` screen, one variant
 * switch instead of two separate reports. Needs line-item data `listSales()`
 * doesn't carry (category, quantity per item), hence `listSaleItemsReport()` —
 * see its own doc comment in `src-tauri/src/commands/sales.rs`. */
export function VendasPorCategoriaItemPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<SaleItemReportRow[]>([]);
  const [variant, setVariant] = useState<Variant>("categoria");
  const period = usePeriodFilter();
  const { range, periodLabel } = period;
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    listSaleItemsReport()
      .then(setRows)
      .catch((err) => logger.error("falha ao listar itens de vendas", err));
  }, []);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (r.status !== "completed") return false;
        const key = localDateKey(r.createdAt);
        return key >= range.from && key <= range.to;
      }),
    [rows, range],
  );

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) {
      const key = r.categoryName ?? "Categoria indefinida";
      map.set(key, (map.get(key) ?? 0) + r.subtotal);
    }
    return [...map.entries()].map(([categoryName, total]) => ({ categoryName, total })).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const byItem = useMemo(() => {
    const map = new Map<string, { categoryName: string; quantity: number; total: number }>();
    for (const r of filtered) {
      const categoryName = r.categoryName ?? "Categoria indefinida";
      const entry = map.get(r.itemName) ?? { categoryName, quantity: 0, total: 0 };
      entry.quantity += r.quantity;
      entry.total += r.subtotal;
      map.set(r.itemName, entry);
    }
    return [...map.entries()]
      .map(([itemName, v]) => ({ itemName, ...v }))
      .sort((a, b) => b.quantity - a.quantity);
  }, [filtered]);

  const categoryTotal = byCategory.reduce((sum, c) => sum + c.total, 0);
  const colors = palette();
  const categorySliceColors = byCategory.map((c, i) => (c.categoryName === "Categoria indefinida" ? NEUTRAL_COLOR : colors[i % colors.length]));

  function reportHeaders(): string[] {
    return variant === "categoria" ? CATEGORY_HEADERS : ITEM_HEADERS;
  }

  function reportColumnWeights(): number[] {
    return variant === "categoria" ? CATEGORY_COLUMN_WEIGHTS : ITEM_COLUMN_WEIGHTS;
  }

  function reportRows(): string[][] {
    if (variant === "categoria") {
      return byCategory.map((c) => [c.categoryName, fmt(c.total)]);
    }
    return byItem.map((i) => [i.itemName, i.categoryName, String(i.quantity), fmt(i.total)]);
  }

  async function handleExportCsv() {
    setExportError(null);
    const suffix = variant === "categoria" ? "categoria" : "item";
    let path: string | null;
    try {
      path = await save({
        defaultPath: `vendas-por-${suffix}-${range.from}-a-${range.to}.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
    } catch (err) {
      logger.error("falha ao abrir seletor de destino do CSV", err);
      setExportError("Não foi possível abrir o seletor de arquivo.");
      return;
    }
    if (!path) return;
    try {
      await exportReportCsv(path, reportHeaders(), reportRows());
    } catch (err) {
      logger.error("falha ao exportar CSV de vendas por categoria/item", path, err);
      setExportError(String(err));
    }
  }

  async function handleExportPdf() {
    setExportError(null);
    const suffix = variant === "categoria" ? "categoria" : "item";
    let path: string | null;
    try {
      path = await save({
        defaultPath: `vendas-por-${suffix}-${range.from}-a-${range.to}.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
    } catch (err) {
      logger.error("falha ao abrir seletor de destino do PDF", err);
      setExportError("Não foi possível abrir o seletor de arquivo.");
      return;
    }
    if (!path) return;
    try {
      await exportReportPdf(
        path,
        variant === "categoria" ? "Vendas por categoria" : "Vendas por item",
        periodLabel,
        [],
        reportHeaders(),
        reportColumnWeights(),
        reportRows(),
      );
    } catch (err) {
      logger.error("falha ao exportar PDF de vendas por categoria/item", path, err);
      setExportError(String(err));
    }
  }

  if (!user) return null;
  if (!user.isAdmin) return <Navigate to="/" replace />;

  return (
    <div>
      <PeriodToolbar filter={period}>
        <div className="inline-flex gap-0.5 rounded-full border border-theme-border bg-theme-hover p-1">
          {(["categoria", "item"] as Variant[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVariant(v)}
              aria-pressed={variant === v}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                variant === v ? "bg-theme-surface text-primary shadow-sm" : "text-theme-3 hover:text-theme-1"
              }`}
            >
              {v === "categoria" ? "Por categoria" : "Por item"}
            </button>
          ))}
        </div>
        <Button variant="secondary" onClick={handleExportCsv}>
          ⭱ Exportar CSV
        </Button>
        <Button variant="secondary" onClick={handleExportPdf}>
          ⭱ Exportar PDF
        </Button>
      </PeriodToolbar>

      {exportError && <p className="mb-4 text-xs text-danger">{exportError}</p>}

      {variant === "categoria" ? (
        <Card title="Vendas por categoria" hint={periodLabel}>
          {byCategory.length === 0 ? (
            <p className="text-sm text-theme-3">Nenhuma venda no período selecionado.</p>
          ) : (
            <div className="flex flex-col gap-6 md:flex-row md:items-center">
              <div className="relative h-[160px] w-[160px] shrink-0 self-center">
                <Doughnut
                  data={{
                    labels: byCategory.map((c) => c.categoryName),
                    datasets: [{ data: byCategory.map((c) => c.total), backgroundColor: categorySliceColors, borderWidth: 0 }],
                  }}
                  options={{
                    cutout: "62%",
                    animation: { duration: 250 },
                    plugins: {
                      legend: { display: false },
                      tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${fmt(ctx.parsed as number)}` } },
                    },
                  }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-theme-border text-left text-xs uppercase tracking-wide text-theme-3">
                      <th className="pb-2">Categoria</th>
                      <th className="pb-2 text-right">% do total</th>
                      <th className="pb-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCategory.map((c, i) => (
                      <tr key={c.categoryName} className="border-b border-theme-border last:border-0">
                        <td className="py-2">
                          <span className="flex items-center gap-1.5 text-theme-1">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: categorySliceColors[i] }} />
                            {c.categoryName}
                          </span>
                        </td>
                        <td className="py-2 text-right text-theme-1">
                          {categoryTotal > 0 ? `${Math.round((c.total / categoryTotal) * 100)}%` : "0%"}
                        </td>
                        <td className="py-2 text-right text-theme-1">{fmt(c.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      ) : (
        <Card title="Vendas por item" hint={`${periodLabel} · ordenado por quantidade`}>
          {byItem.length === 0 ? (
            <p className="text-sm text-theme-3">Nenhuma venda no período selecionado.</p>
          ) : (
            <div className="-m-5 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-theme-border text-left text-xs uppercase tracking-wide text-theme-3">
                    <th className="px-5 py-3">Item</th>
                    <th className="px-5 py-3">Categoria</th>
                    <th className="px-5 py-3 text-right">Qtd. vendida</th>
                    <th className="px-5 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {byItem.map((i) => (
                    <tr key={i.itemName} className="border-b border-theme-border last:border-0 hover:bg-theme-hover">
                      <td className="px-5 py-3 text-theme-1">{i.itemName}</td>
                      <td className="px-5 py-3">
                        <span className="rounded-full bg-theme-hover px-2.5 py-0.5 text-xs font-semibold text-theme-3">
                          {i.categoryName}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-theme-1">{i.quantity}</td>
                      <td className="px-5 py-3 text-right text-theme-1">{fmt(i.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
