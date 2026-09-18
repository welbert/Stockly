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
import { fmtDateTime, localDateKey } from "../../lib/format";
import { logger } from "../../logger";
import { ItemFilterCombobox } from "./ItemFilterCombobox";
import { PeriodToolbar } from "./PeriodToolbar";
import { usePeriodFilter } from "./usePeriodFilter";

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  sale: "Venda",
  entry: "Entrada",
  adjustment: "Ajuste",
  initial: "Inicial",
  csv_import: "Importação CSV",
  refund: "Estorno",
};

const MOVEMENT_TYPE_BADGE_CLASS: Record<string, string> = {
  sale: "bg-info/10 text-info",
  entry: "bg-success/10 text-success",
  adjustment: "bg-warning/10 text-warning",
  refund: "bg-danger/10 text-danger",
  initial: "bg-theme-hover text-theme-3",
  csv_import: "bg-theme-hover text-theme-3",
};

const REPORT_HEADERS = ["Data", "Item", "Tipo", "Quantidade", "Qtd. total", "Operador"];
const REPORT_COLUMN_WEIGHTS = [4, 5, 3, 2, 2, 4];

/** The "consulta" screen `docs/database.md` registered as pending since the
 * `stock_movements` table was created. Client-side over `listStockMovements()`
 * (same convention as every other report), filtered by item, tipo, and the
 * shared period toolbar. "Qtd. total" is the running balance right after
 * each movement (see `runningTotalByMovementId`), not just that row's delta
 * — always derived from the full ledger, never from the filtered view, so
 * narrowing by período/tipo/item can't change what it shows for the rows
 * that stay visible. */
export function MovimentacaoEstoquePage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [itemFilter, setItemFilter] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const period = usePeriodFilter();
  const { range, periodLabel } = period;
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[1]);

  useEffect(() => {
    listStockMovements()
      .then(setMovements)
      .catch((err) => logger.error("falha ao listar movimentações de estoque", err));
    listItems()
      .then(setItems)
      .catch((err) => logger.error("falha ao listar itens", err));
  }, []);

  // Running balance per item ("quantidade total" right after this movement)
  // — always computed from the *full*, unfiltered `movements`, never from
  // `filtered`: a sale from outside the selected período still affects
  // today's balance, so narrowing by período/tipo/item can't be allowed to
  // change what this column shows for the rows that do stay visible.
  // Grouped by `itemId` and summed in `createdAt` order — **not** `id`
  // (insertion order): the demo seed backdates some movements (a sale
  // stamped days before the item's own `initial` row, which is only
  // inserted "now" when the demo db is generated), so `id` and `createdAt`
  // order can genuinely disagree. The table itself is sorted by `createdAt`
  // (`list_stock_movements`'s `ORDER BY ... DESC`), so the running total has
  // to follow the same field to read sensibly top-to-bottom — `id` only
  // breaks a tie between two movements stamped the same second.
  const runningTotalByMovementId = useMemo(() => {
    const byItem = new Map<number, StockMovementRow[]>();
    for (const m of movements) {
      const list = byItem.get(m.itemId);
      if (list) list.push(m);
      else byItem.set(m.itemId, [m]);
    }
    const result = new Map<number, number>();
    for (const list of byItem.values()) {
      let running = 0;
      const sorted = [...list].sort((a, b) => (a.createdAt !== b.createdAt ? (a.createdAt < b.createdAt ? -1 : 1) : a.id - b.id));
      for (const m of sorted) {
        running += m.quantityDelta;
        result.set(m.id, running);
      }
    }
    return result;
  }, [movements]);

  const filtered = useMemo(
    () =>
      movements.filter((m) => {
        if (itemFilter !== null && m.itemId !== itemFilter) return false;
        if (typeFilter && m.movementType !== typeFilter) return false;
        const key = localDateKey(m.createdAt);
        return key >= range.from && key <= range.to;
      }),
    [movements, itemFilter, typeFilter, range],
  );

  useEffect(() => setPage(0), [itemFilter, typeFilter, period.preset, period.customFrom, period.customTo]);

  const paginated = filtered.slice(page * pageSize, (page + 1) * pageSize);

  function reportRows(): string[][] {
    return filtered.map((m) => [
      fmtDateTime(m.createdAt),
      m.itemName,
      MOVEMENT_TYPE_LABEL[m.movementType] ?? m.movementType,
      m.quantityDelta > 0 ? `+${m.quantityDelta}` : String(m.quantityDelta),
      String(runningTotalByMovementId.get(m.id) ?? m.quantityDelta),
      m.userName,
    ]);
  }

  async function handleExportCsv() {
    let path: string | null;
    try {
      path = await save({
        defaultPath: `movimentacao-estoque-${range.from}-a-${range.to}.csv`,
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
        title: "CSV de Movimentação de estoque gerado",
        message: "Clique aqui para abrir a pasta",
        onClick: () => openContainingFolder(path!),
      });
    } catch (err) {
      logger.error("falha ao exportar CSV de movimentação de estoque", path, err);
      showToast({ type: "error", title: "Falha ao exportar CSV de Movimentação de estoque", message: String(err) });
    }
  }

  async function handleExportPdf() {
    let path: string | null;
    try {
      path = await save({
        defaultPath: `movimentacao-estoque-${range.from}-a-${range.to}.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
    } catch (err) {
      logger.error("falha ao abrir seletor de destino do PDF", err);
      showToast({ type: "error", title: "Não foi possível abrir o seletor de arquivo" });
      return;
    }
    if (!path) return;
    try {
      await exportReportPdf(path, "Movimentação de estoque", periodLabel, [], REPORT_HEADERS, REPORT_COLUMN_WEIGHTS, reportRows());
      showToast({
        type: "success",
        title: "PDF de Movimentação de estoque gerado",
        message: "Clique aqui para abrir a pasta",
        onClick: () => openContainingFolder(path!),
      });
    } catch (err) {
      logger.error("falha ao exportar PDF de movimentação de estoque", path, err);
      showToast({ type: "error", title: "Falha ao exportar PDF de Movimentação de estoque", message: String(err) });
    }
  }

  if (!user) return null;
  if (!user.isAdmin) return <Navigate to="/" replace />;

  return (
    <div>
      <PeriodToolbar filter={period}>
        <ItemFilterCombobox items={items} value={itemFilter} onChange={setItemFilter} />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-1 outline-none"
        >
          <option value="">Todos os tipos</option>
          {Object.entries(MOVEMENT_TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {(itemFilter !== null || typeFilter !== "") && (
          <Button
            variant="ghost"
            onClick={() => {
              setItemFilter(null);
              setTypeFilter("");
            }}
          >
            Limpar filtro
          </Button>
        )}
        <Button variant="secondary" onClick={handleExportCsv}>
          ⭱ Exportar CSV
        </Button>
        <Button variant="secondary" onClick={handleExportPdf}>
          ⭱ Exportar PDF
        </Button>
      </PeriodToolbar>

      <Card>
        <div className="-m-5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-theme-border text-left text-xs uppercase tracking-wide text-theme-3">
                <th className="px-5 py-3">Data</th>
                <th className="px-5 py-3">Item</th>
                <th className="px-5 py-3">Tipo</th>
                <th className="px-5 py-3 text-right">Quantidade</th>
                <th className="px-5 py-3 text-right">Qtd. total</th>
                <th className="px-5 py-3">Operador</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((m) => (
                <tr key={m.id} className="border-b border-theme-border last:border-0 hover:bg-theme-hover">
                  <td className="px-5 py-3 text-theme-1">{fmtDateTime(m.createdAt)}</td>
                  <td className="px-5 py-3 text-theme-1">{m.itemName}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${MOVEMENT_TYPE_BADGE_CLASS[m.movementType] ?? "bg-theme-hover text-theme-3"}`}
                    >
                      {MOVEMENT_TYPE_LABEL[m.movementType] ?? m.movementType}
                    </span>
                  </td>
                  <td className={`px-5 py-3 text-right font-semibold ${m.quantityDelta >= 0 ? "text-success" : "text-danger"}`}>
                    {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                  </td>
                  <td className="px-5 py-3 text-right text-theme-1">{runningTotalByMovementId.get(m.id) ?? m.quantityDelta}</td>
                  <td className="px-5 py-3 text-theme-1">{m.userName}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-theme-3">
                    Nenhuma movimentação no período selecionado.
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
