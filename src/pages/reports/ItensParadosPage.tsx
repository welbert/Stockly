import { useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import type { ItemSummary, StockMovementRow } from "../../lib/api";
import { exportReportCsv, exportReportPdf, listItems, listStockMovements, openContainingFolder } from "../../lib/api";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Pagination } from "../../components/Pagination";
import { useToast } from "../../context/ToastContext";
import { fmtDateFull, localDateKey } from "../../lib/format";
import { logger } from "../../logger";
import { todayKey } from "./usePeriodFilter";

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const REPORT_HEADERS = ["Item", "Categoria", "Última venda", "Dias parado", "Estoque atual"];
const REPORT_COLUMN_WEIGHTS = [4, 3, 3, 3, 3];

function daysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  const from = new Date(fy, fm - 1, fd);
  const to = new Date(ty, tm - 1, td);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

interface StoppedItem {
  item: ItemSummary;
  lastSale: string | null;
  daysStopped: number;
}

/** "Capital parado" candidato: item ativo sem `movement_type = 'sale'` há N
 * dias (ou nunca vendido). Client-side sobre `listItems()` + o mesmo
 * `listStockMovements()` de "Movimentação de estoque" (filtrado a `sale`
 * aqui), sem comando novo no backend. */
export function ItensParadosPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [thresholdDays, setThresholdDays] = useState(30);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[1]);

  useEffect(() => {
    listItems()
      .then(setItems)
      .catch((err) => logger.error("falha ao listar itens", err));
    listStockMovements()
      .then(setMovements)
      .catch((err) => logger.error("falha ao listar movimentações de estoque", err));
  }, []);

  const lastSaleByItem = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of movements) {
      // A `sale` movement whose sale was later cancelled/estornada isn't
      // real recent activity anymore (the stock came back via a separate
      // `refund` row) — counting it would hide an item that should show up
      // here as parado.
      if (m.movementType !== "sale" || m.saleStatus === "cancelled") continue;
      const cur = map.get(m.itemId);
      if (!cur || m.createdAt > cur) map.set(m.itemId, m.createdAt);
    }
    return map;
  }, [movements]);

  const stopped = useMemo(() => {
    const today = todayKey();
    const list: StoppedItem[] = [];
    for (const item of items) {
      if (!item.active) continue;
      const lastSaleRaw = lastSaleByItem.get(item.id) ?? null;
      const lastSale = lastSaleRaw ? localDateKey(lastSaleRaw) : null;
      const daysStopped = lastSale ? daysBetween(lastSale, today) : Infinity;
      if (lastSale !== null && daysStopped < thresholdDays) continue;
      list.push({ item, lastSale, daysStopped });
    }
    return list.sort((a, b) => b.daysStopped - a.daysStopped);
  }, [items, lastSaleByItem, thresholdDays]);

  const paginated = stopped.slice(page * pageSize, (page + 1) * pageSize);

  function reportRows(): string[][] {
    return stopped.map((s) => [
      s.item.name,
      s.item.categoryName ?? "Categoria indefinida",
      s.lastSale ? fmtDateFull(s.lastSale) : "—",
      s.lastSale ? String(s.daysStopped) : "Nunca vendido",
      String(s.item.quantity),
    ]);
  }

  async function handleExportCsv() {
    let path: string | null;
    try {
      path = await save({ defaultPath: `itens-parados-${thresholdDays}d.csv`, filters: [{ name: "CSV", extensions: ["csv"] }] });
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
        title: "CSV de Itens sem movimento gerado",
        message: "Clique aqui para abrir a pasta",
        onClick: () => openContainingFolder(path!),
      });
    } catch (err) {
      logger.error("falha ao exportar CSV de itens sem movimento", path, err);
      showToast({ type: "error", title: "Falha ao exportar CSV de Itens sem movimento", message: String(err) });
    }
  }

  async function handleExportPdf() {
    let path: string | null;
    try {
      path = await save({ defaultPath: `itens-parados-${thresholdDays}d.pdf`, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    } catch (err) {
      logger.error("falha ao abrir seletor de destino do PDF", err);
      showToast({ type: "error", title: "Não foi possível abrir o seletor de arquivo" });
      return;
    }
    if (!path) return;
    try {
      await exportReportPdf(
        path,
        "Itens sem movimento",
        `Sem venda há ${thresholdDays}+ dias (ou nunca vendidos)`,
        [],
        REPORT_HEADERS,
        REPORT_COLUMN_WEIGHTS,
        reportRows(),
      );
      showToast({
        type: "success",
        title: "PDF de Itens sem movimento gerado",
        message: "Clique aqui para abrir a pasta",
        onClick: () => openContainingFolder(path!),
      });
    } catch (err) {
      logger.error("falha ao exportar PDF de itens sem movimento", path, err);
      showToast({ type: "error", title: "Falha ao exportar PDF de Itens sem movimento", message: String(err) });
    }
  }

  if (!user) return null;
  if (!user.isAdmin) return <Navigate to="/" replace />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={thresholdDays}
          onChange={(e) => setThresholdDays(Number(e.target.value))}
          className="rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-1 outline-none"
        >
          <option value={30}>Sem venda há 30+ dias</option>
          <option value={60}>Sem venda há 60+ dias</option>
        </select>
        <div className="flex-1" />
        <Button variant="secondary" onClick={handleExportCsv}>
          ⭱ Exportar CSV
        </Button>
        <Button variant="secondary" onClick={handleExportPdf}>
          ⭱ Exportar PDF
        </Button>
      </div>

      <Card>
        <div className="-m-5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-theme-border text-left text-xs uppercase tracking-wide text-theme-3">
                <th className="px-5 py-3">Item</th>
                <th className="px-5 py-3">Categoria</th>
                <th className="px-5 py-3">Última venda</th>
                <th className="px-5 py-3 text-right">Dias parado</th>
                <th className="px-5 py-3 text-right">Estoque atual</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((s) => (
                <tr key={s.item.id} className="border-b border-theme-border last:border-0 hover:bg-theme-hover">
                  <td className="px-5 py-3 text-theme-1">{s.item.name}</td>
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-theme-hover px-2.5 py-0.5 text-xs font-semibold text-theme-3">
                      {s.item.categoryName ?? "Categoria indefinida"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-theme-1">{s.lastSale ? fmtDateFull(s.lastSale) : "—"}</td>
                  <td className="px-5 py-3 text-right">
                    {s.lastSale ? (
                      <span className="text-theme-1">{s.daysStopped}</span>
                    ) : (
                      <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-xs font-semibold text-danger">nunca vendido</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right text-theme-1">{s.item.quantity}</td>
                </tr>
              ))}
              {stopped.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-theme-3">
                    Nenhum item parado com esse filtro.
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
        total={stopped.length}
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
