import { useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { useAuth } from "../context/AuthContext";
import type { SaleListItem, UserSummary } from "../lib/api";
import { exportSalesCsv, listAdmins, listSales, openReceiptFile, printFile, regenerateReceiptPdf, toSaleCsvRows } from "../lib/api";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ContextMenu, ContextMenuItem } from "../components/ContextMenu";
import { Pagination } from "../components/Pagination";
import { SaleDetailModal } from "../components/SaleDetailModal";
import { PAYMENT_METHOD_LABEL, fmt, fmtDateTime, localDateKey, normalize } from "../lib/format";
import { logger } from "../logger";

const PAGE_SIZE_OPTIONS = [10, 20, 50];

export function SalesHistoryPage() {
  const { user } = useAuth();
  const [sales, setSales] = useState<SaleListItem[]>([]);
  const [admins, setAdmins] = useState<UserSummary[]>([]);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [viewingSaleId, setViewingSaleId] = useState<number | null>(null);
  const [actionMenu, setActionMenu] = useState<{ x: number; y: number; actions: ContextMenuItem[] } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[1]);

  // Both actions regenerate the PDF fresh rather than trusting a path we
  // might have cached — same reasoning as `ReceiptResultModal`'s `ensurePdf`:
  // the file is cheap to re-render and may not exist yet (creation failed
  // right after the sale, or the "recibos" folder was cleared).
  async function handlePrintReceipt(sale: SaleListItem) {
    setActionError(null);
    try {
      const path = await regenerateReceiptPdf(sale.id);
      await printFile(path);
    } catch (err) {
      logger.error("falha ao imprimir recibo", sale.id, err);
      setActionError("Não foi possível imprimir o recibo.");
    }
  }

  async function handleOpenReceiptPdf(sale: SaleListItem) {
    setActionError(null);
    try {
      const path = await regenerateReceiptPdf(sale.id);
      await openReceiptFile(path);
    } catch (err) {
      logger.error("falha ao abrir PDF do recibo", sale.id, err);
      setActionError("Não foi possível abrir o PDF do recibo.");
    }
  }

  function reloadList() {
    listSales()
      .then(setSales)
      .catch((err) => logger.error("falha ao listar vendas", err));
  }

  useEffect(reloadList, []);
  useEffect(() => {
    listAdmins()
      .then(setAdmins)
      .catch((err) => logger.error("falha ao listar administradores", err));
  }, []);

  const filtered = useMemo(() => {
    const term = normalize(search.trim());
    return sales.filter((s) => {
      if (dateFrom && localDateKey(s.createdAt) < dateFrom) return false;
      if (dateTo && localDateKey(s.createdAt) > dateTo) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      if (paymentFilter && s.paymentMethod !== paymentFilter) return false;
      if (!term) return true;
      return (
        normalize(s.receiptNumber).includes(term) ||
        normalize(s.userName).includes(term) ||
        (s.clientName !== null && normalize(s.clientName).includes(term))
      );
    });
  }, [sales, search, dateFrom, dateTo, statusFilter, paymentFilter]);

  useEffect(() => setPage(0), [search, dateFrom, dateTo, statusFilter, paymentFilter]);

  const paginated = useMemo(
    () => filtered.slice(page * pageSize, (page + 1) * pageSize),
    [filtered, page, pageSize],
  );

  // Exports whatever's currently filtered (same rows `paginated` slices
  // from), not just the visible page — same rationale as `toSaleCsvRows`'s
  // doc comment, shared with `VendasPorPeriodoPage`'s own export button.
  async function handleExportCsv() {
    setActionError(null);
    let path: string | null;
    try {
      path = await save({ defaultPath: "historico-de-vendas.csv", filters: [{ name: "CSV", extensions: ["csv"] }] });
    } catch (err) {
      logger.error("falha ao abrir seletor de destino do CSV", err);
      setActionError("Não foi possível abrir o seletor de arquivo.");
      return;
    }
    if (!path) return;
    try {
      await exportSalesCsv(path, toSaleCsvRows(filtered));
    } catch (err) {
      logger.error("falha ao exportar CSV do histórico de vendas", path, err);
      setActionError(String(err));
    }
  }

  if (!user) return null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          placeholder="Buscar por recibo, cliente ou operador..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[220px] max-w-[340px] flex-1 rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
        />
        <label className="flex items-center gap-1.5 text-xs text-theme-3">
          De
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-theme-border bg-theme-surface px-2 py-2 text-sm text-theme-1 outline-none"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-theme-3">
          Até
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-theme-border bg-theme-surface px-2 py-2 text-sm text-theme-1 outline-none"
          />
        </label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-1 outline-none"
        >
          <option value="">Todos os status</option>
          <option value="completed">Concluída</option>
          <option value="cancelled">Cancelada</option>
        </select>
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          className="rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-1 outline-none"
        >
          <option value="">Todas as formas de pagamento</option>
          {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <Button variant="secondary" onClick={handleExportCsv}>
          ⭱ Exportar CSV
        </Button>
      </div>

      {actionError && <p className="mb-3 text-xs text-danger">{actionError}</p>}

      <Card>
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
                <th className="px-5 py-3">Total Final</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {paginated.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setViewingSaleId(s.id)}
                  className={`cursor-pointer border-b border-theme-border last:border-0 hover:bg-theme-hover ${
                    s.status === "cancelled" ? "opacity-60" : ""
                  }`}
                >
                  <td className="px-5 py-3">
                    <code className="text-xs">{s.receiptNumber}</code>
                  </td>
                  <td className="px-5 py-3 text-theme-1">{fmtDateTime(s.createdAt)}</td>
                  <td className="px-5 py-3 text-theme-1">{s.clientName ?? "—"}</td>
                  <td className="px-5 py-3 text-theme-1">{s.userName}</td>
                  <td className="px-5 py-3 text-theme-1">{PAYMENT_METHOD_LABEL[s.paymentMethod] ?? s.paymentMethod}</td>
                  <td className="px-5 py-3 text-theme-3">{s.discountValue > 0 ? `-${fmt(s.discountValue)}` : "—"}</td>
                  <td className={`px-5 py-3 ${s.status === "cancelled" ? "text-theme-3 line-through" : "text-theme-1"}`}>
                    {fmt(s.total)}
                  </td>
                  <td className="px-5 py-3">
                    {s.status === "cancelled" ? (
                      <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">Cancelada</span>
                    ) : (
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">Concluída</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      aria-label="Ações do recibo"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActionMenu({
                          x: e.clientX,
                          y: e.clientY,
                          actions: [
                            { label: "Detalhe", onSelect: () => setViewingSaleId(s.id) },
                            { label: "Imprimir recibo", onSelect: () => handlePrintReceipt(s) },
                            { label: "Abrir PDF do recibo", onSelect: () => handleOpenReceiptPdf(s) },
                          ],
                        });
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-base leading-none text-theme-3 hover:bg-theme-hover-strong hover:text-theme-1"
                    >
                      ⋮
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-6 text-center text-theme-3">
                    Nenhuma venda encontrada.
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

      {viewingSaleId !== null && (
        <SaleDetailModal
          saleId={viewingSaleId}
          admins={admins}
          requiresAuth={!user.isAdmin}
          onClose={() => setViewingSaleId(null)}
          onCancelled={reloadList}
        />
      )}

      {actionMenu && (
        <ContextMenu x={actionMenu.x} y={actionMenu.y} items={actionMenu.actions} onClose={() => setActionMenu(null)} />
      )}
    </div>
  );
}
