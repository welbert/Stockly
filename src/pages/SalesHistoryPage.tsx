import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { SaleListItem, UserSummary } from "../lib/api";
import { listAdmins, listSales } from "../lib/api";
import { Card } from "../components/Card";
import { Pagination } from "../components/Pagination";
import { SaleDetailModal } from "../components/SaleDetailModal";
import { PAYMENT_METHOD_LABEL, fmt, fmtDateTime, normalize } from "../lib/format";
import { logger } from "../logger";

const PAGE_SIZE_OPTIONS = [10, 20, 50];

/** Local (not UTC) `YYYY-MM-DD` for comparing against the `<input type="date">`
 * range fields — `createdAt` is stored in UTC, same conversion `fmtDateTime` does. */
function saleLocalDate(createdAt: string): string {
  const d = new Date(createdAt.replace(" ", "T") + "Z");
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[1]);

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
      if (dateFrom && saleLocalDate(s.createdAt) < dateFrom) return false;
      if (dateTo && saleLocalDate(s.createdAt) > dateTo) return false;
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
      </div>

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
                <th className="px-5 py-3">Total</th>
                <th className="px-5 py-3">Status</th>
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
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-center text-theme-3">
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
    </div>
  );
}
