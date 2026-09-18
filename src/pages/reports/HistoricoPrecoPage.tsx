import { useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import type { ItemPriceHistoryRow, ItemSummary } from "../../lib/api";
import { exportReportCsv, exportReportPdf, listItemPriceHistory, listItems, openContainingFolder } from "../../lib/api";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Pagination } from "../../components/Pagination";
import { useToast } from "../../context/ToastContext";
import { fmt, fmtDateFull, localDateKey } from "../../lib/format";
import { logger } from "../../logger";
import { ItemFilterCombobox } from "./ItemFilterCombobox";

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const ALL_ITEMS_HEADERS = ["Item", "Data", "Custo", "Venda", "Alterado por"];
const ALL_ITEMS_COLUMN_WEIGHTS = [4, 3, 3, 3, 4];
const SINGLE_ITEM_HEADERS = ["Data", "Custo", "Venda", "Alterado por"];
const SINGLE_ITEM_COLUMN_WEIGHTS = [3, 3, 3, 4];

type Delta = "up" | "down" | "same";

function priceDelta(current: number, previous: number | undefined): Delta | null {
  if (previous === undefined) return null;
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "same";
}

/** `▲`/`▼` next to a price cell, comparing it to the previous (chronologically
 * older) record for the same item — only meaningful when filtered to one
 * item, since consecutive rows in "Todos os itens" can belong to different
 * items entirely. */
function PriceCell({ value, delta }: { value: number; delta: Delta | null }) {
  return (
    <span className="inline-flex items-center gap-1">
      {fmt(value)}
      {delta === "up" && (
        <span className="text-success" title="Aumentou em relação ao registro anterior">
          ▲
        </span>
      )}
      {delta === "down" && (
        <span className="text-danger" title="Diminuiu em relação ao registro anterior">
          ▼
        </span>
      )}
    </span>
  );
}

/** Timeline de `item_price_history` — sem período (é um histórico de
 * auditoria, não algo naturalmente escopado por data como as vendas). "Todos
 * os itens" (padrão) mostra tudo junto, mais recente primeiro, com a coluna
 * "Item"; selecionando um item específico vira a "linha do tempo" focada do
 * mockup, sem essa coluna (redundante — já está no título do card). A
 * primeira linha (mais antiga) de cada item mostra "cadastro do item" em vez
 * do operador — `create_item`/`update_item` sempre gravam um registro de
 * preço, então a linha mais antiga de qualquer item é sempre o cadastro
 * inicial, não uma alteração de verdade. */
export function HistoricoPrecoPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [history, setHistory] = useState<ItemPriceHistoryRow[]>([]);
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[1]);

  useEffect(() => {
    listItemPriceHistory()
      .then(setHistory)
      .catch((err) => logger.error("falha ao listar histórico de preço", err));
    listItems()
      .then(setItems)
      .catch((err) => logger.error("falha ao listar itens", err));
  }, []);

  const firstRowIds = useMemo(() => {
    const earliest = new Map<number, ItemPriceHistoryRow>();
    for (const r of history) {
      const cur = earliest.get(r.itemId);
      if (!cur || r.createdAt < cur.createdAt) earliest.set(r.itemId, r);
    }
    return new Set([...earliest.values()].map((r) => r.id));
  }, [history]);

  const filtered = useMemo(
    () => (selectedItemId !== null ? history.filter((r) => r.itemId === selectedItemId) : history),
    [history, selectedItemId],
  );

  useEffect(() => setPage(0), [selectedItemId]);

  // `filtered` is newest-first, so the "previous" (chronologically older)
  // record for row `i` sits at `i + 1` — computed here, before pagination,
  // so a row at the top of page 2 can still compare against the last row of
  // page 1 (data `filtered` already has, `paginated` is just a display slice).
  const rowsWithDelta = useMemo(
    () =>
      filtered.map((r, i) => {
        if (selectedItemId === null) return { row: r, costDelta: null, saleDelta: null };
        const previous = filtered[i + 1];
        return {
          row: r,
          costDelta: priceDelta(r.costPrice, previous?.costPrice),
          saleDelta: priceDelta(r.salePrice, previous?.salePrice),
        };
      }),
    [filtered, selectedItemId],
  );

  const paginated = rowsWithDelta.slice(page * pageSize, (page + 1) * pageSize);
  const selectedItemName = items.find((i) => i.id === selectedItemId)?.name;

  function alteradoPor(r: ItemPriceHistoryRow): string {
    return firstRowIds.has(r.id) ? "cadastro do item" : r.userName;
  }

  function reportRows(): string[][] {
    return filtered.map((r) =>
      selectedItemId
        ? [fmtDateFull(localDateKey(r.createdAt)), fmt(r.costPrice), fmt(r.salePrice), alteradoPor(r)]
        : [r.itemName, fmtDateFull(localDateKey(r.createdAt)), fmt(r.costPrice), fmt(r.salePrice), alteradoPor(r)],
    );
  }

  async function handleExportCsv() {
    let path: string | null;
    try {
      path = await save({
        defaultPath: `historico-preco${selectedItemName ? `-${selectedItemName}` : ""}.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
    } catch (err) {
      logger.error("falha ao abrir seletor de destino do CSV", err);
      showToast({ type: "error", title: "Não foi possível abrir o seletor de arquivo" });
      return;
    }
    if (!path) return;
    try {
      await exportReportCsv(path, selectedItemId ? SINGLE_ITEM_HEADERS : ALL_ITEMS_HEADERS, reportRows());
      showToast({
        type: "success",
        title: `CSV de ${selectedItemName ? `Histórico de preço — ${selectedItemName}` : "Histórico de alteração de preço"} gerado`,
        message: "Clique aqui para abrir a pasta",
        onClick: () => openContainingFolder(path!),
      });
    } catch (err) {
      logger.error("falha ao exportar CSV de histórico de preço", path, err);
      showToast({
        type: "error",
        title: `Falha ao exportar CSV de ${selectedItemName ? `Histórico de preço — ${selectedItemName}` : "Histórico de alteração de preço"}`,
        message: String(err),
      });
    }
  }

  async function handleExportPdf() {
    let path: string | null;
    try {
      path = await save({
        defaultPath: `historico-preco${selectedItemName ? `-${selectedItemName}` : ""}.pdf`,
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
        selectedItemName ? `Histórico de preço — ${selectedItemName}` : "Histórico de alteração de preço",
        selectedItemName ? "Linha do tempo de preço" : "Todos os itens",
        [],
        selectedItemId ? SINGLE_ITEM_HEADERS : ALL_ITEMS_HEADERS,
        selectedItemId ? SINGLE_ITEM_COLUMN_WEIGHTS : ALL_ITEMS_COLUMN_WEIGHTS,
        reportRows(),
      );
      showToast({
        type: "success",
        title: `PDF de ${selectedItemName ? `Histórico de preço — ${selectedItemName}` : "Histórico de alteração de preço"} gerado`,
        message: "Clique aqui para abrir a pasta",
        onClick: () => openContainingFolder(path!),
      });
    } catch (err) {
      logger.error("falha ao exportar PDF de histórico de preço", path, err);
      showToast({
        type: "error",
        title: `Falha ao exportar PDF de ${selectedItemName ? `Histórico de preço — ${selectedItemName}` : "Histórico de alteração de preço"}`,
        message: String(err),
      });
    }
  }

  if (!user) return null;
  if (!user.isAdmin) return <Navigate to="/" replace />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ItemFilterCombobox items={items} value={selectedItemId} onChange={setSelectedItemId} />
        {selectedItemId !== null && (
          <Button variant="ghost" onClick={() => setSelectedItemId(null)}>
            Limpar filtro
          </Button>
        )}
        <div className="flex-1" />
        <Button variant="secondary" onClick={handleExportCsv}>
          ⭱ Exportar CSV
        </Button>
        <Button variant="secondary" onClick={handleExportPdf}>
          ⭱ Exportar PDF
        </Button>
      </div>

      <Card title={selectedItemName ?? "Histórico de alteração de preço"} hint={selectedItemName ? "linha do tempo de preço" : undefined}>
        <div className="-m-5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-theme-border text-left text-xs uppercase tracking-wide text-theme-3">
                {!selectedItemId && <th className="px-5 py-3">Item</th>}
                <th className="px-5 py-3">Data</th>
                <th className="px-5 py-3 text-right">Custo</th>
                <th className="px-5 py-3 text-right">Venda</th>
                <th className="px-5 py-3">Alterado por</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(({ row: r, costDelta, saleDelta }) => (
                <tr key={r.id} className="border-b border-theme-border last:border-0 hover:bg-theme-hover">
                  {!selectedItemId && <td className="px-5 py-3 text-theme-1">{r.itemName}</td>}
                  <td className="px-5 py-3 text-theme-1">{fmtDateFull(localDateKey(r.createdAt))}</td>
                  <td className="px-5 py-3 text-right text-theme-1">
                    <PriceCell value={r.costPrice} delta={costDelta} />
                  </td>
                  <td className="px-5 py-3 text-right text-theme-1">
                    <PriceCell value={r.salePrice} delta={saleDelta} />
                  </td>
                  <td className="px-5 py-3">
                    {firstRowIds.has(r.id) ? <span className="italic text-theme-3">cadastro do item</span> : r.userName}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={selectedItemId ? 4 : 5} className="px-5 py-6 text-center text-theme-3">
                    Nenhum registro de preço encontrado.
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
