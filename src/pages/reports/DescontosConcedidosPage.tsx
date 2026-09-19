import { useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import type { SaleDiscountRow } from "../../lib/api";
import { exportReportCsv, exportReportPdf, listSaleDiscounts, openContainingFolder, round2 } from "../../lib/api";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { InfoTooltip } from "../../components/InfoTooltip";
import { Pagination } from "../../components/Pagination";
import { useToast } from "../../context/ToastContext";
import { fmt, fmtDateTime, localDateKey } from "../../lib/format";
import { logger } from "../../logger";
import { PeriodToolbar } from "./PeriodToolbar";
import { usePeriodFilter } from "./usePeriodFilter";

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const REPORT_HEADERS = ["Recibo", "Tipo", "Valor", "Autorizado por", "Data"];
const REPORT_COLUMN_WEIGHTS = [3, 4, 2, 3, 3];

/** "Geral (10%)" / "Geral (R$ 2,00)" / "Item (Martelo, -15%)" — matches
 * the original mockup's "Tipo" column. Built here, not on the backend, so
 * money/percent formatting stays in one place (`format.ts`). */
function discountLabel(r: SaleDiscountRow): string {
  const amountPart = r.discountPercent !== null ? `${r.discountPercent}%` : fmt(r.amount);
  if (r.kind === "general") return `Geral (${amountPart})`;
  return `Item (${r.itemName}, ${r.discountPercent !== null ? `-${amountPart}` : amountPart})`;
}

/** `list_sale_discounts` returns one row per discount instance (general
 * and/or per item) on a `completed` sale — see that command's doc comment
 * for why a sale with both kinds produces two rows instead of one merged
 * row. `operatorFilter` options come from the loaded rows themselves (no
 * separate `listAdmins`/`listUsers` call — every operator here already made
 * at least one discounted sale). */
export function DescontosConcedidosPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [rows, setRows] = useState<SaleDiscountRow[]>([]);
  const [operatorFilter, setOperatorFilter] = useState("");
  const period = usePeriodFilter();
  const { range, periodLabel } = period;
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[1]);

  useEffect(() => {
    listSaleDiscounts()
      .then(setRows)
      .catch((err) => logger.error("falha ao listar descontos concedidos", err));
  }, []);

  const operators = useMemo(() => [...new Set(rows.map((r) => r.userName))].sort((a, b) => a.localeCompare(b, "pt-BR")), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (operatorFilter && r.userName !== operatorFilter) return false;
        const key = localDateKey(r.createdAt);
        return key >= range.from && key <= range.to;
      }),
    [rows, operatorFilter, range],
  );

  useEffect(() => setPage(0), [operatorFilter, period.preset, period.customFrom, period.customTo]);

  const bySale = useMemo(() => new Set(filtered.map((r) => r.receiptNumber)), [filtered]);
  const totalGranted = useMemo(() => round2(filtered.reduce((sum, r) => sum + r.amount, 0)), [filtered]);
  const salesWithDiscount = bySale.size;
  const averageDiscount = salesWithDiscount > 0 ? round2(totalGranted / salesWithDiscount) : 0;

  const paginated = filtered.slice(page * pageSize, (page + 1) * pageSize);

  function reportRows(): string[][] {
    return filtered.map((r) => [r.receiptNumber, discountLabel(r), fmt(r.amount), r.authorizedByName, fmtDateTime(r.createdAt)]);
  }

  async function handleExportCsv() {
    let path: string | null;
    try {
      path = await save({
        defaultPath: `descontos-concedidos-${range.from}-a-${range.to}.csv`,
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
        title: "CSV de Descontos concedidos gerado",
        message: "Clique aqui para abrir a pasta",
        onClick: () => openContainingFolder(path!),
      });
    } catch (err) {
      logger.error("falha ao exportar CSV de descontos concedidos", path, err);
      showToast({ type: "error", title: "Falha ao exportar CSV de Descontos concedidos", message: String(err) });
    }
  }

  async function handleExportPdf() {
    let path: string | null;
    try {
      path = await save({
        defaultPath: `descontos-concedidos-${range.from}-a-${range.to}.pdf`,
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
        "Descontos concedidos",
        periodLabel,
        [
          { label: "Total concedido", value: fmt(totalGranted) },
          { label: "Vendas com desconto", value: String(salesWithDiscount) },
          { label: "Desconto médio", value: fmt(averageDiscount) },
        ],
        REPORT_HEADERS,
        REPORT_COLUMN_WEIGHTS,
        reportRows(),
      );
      showToast({
        type: "success",
        title: "PDF de Descontos concedidos gerado",
        message: "Clique aqui para abrir a pasta",
        onClick: () => openContainingFolder(path!),
      });
    } catch (err) {
      logger.error("falha ao exportar PDF de descontos concedidos", path, err);
      showToast({ type: "error", title: "Falha ao exportar PDF de Descontos concedidos", message: String(err) });
    }
  }

  if (!user) return null;
  if (!user.isAdmin) return <Navigate to="/" replace />;

  return (
    <div>
      <PeriodToolbar filter={period}>
        <select
          value={operatorFilter}
          onChange={(e) => setOperatorFilter(e.target.value)}
          className="rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-1 outline-none"
        >
          <option value="">Todos os operadores</option>
          {operators.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <Button variant="secondary" onClick={handleExportCsv}>
          ⭱ Exportar CSV
        </Button>
        <Button variant="secondary" onClick={handleExportPdf}>
          ⭱ Exportar PDF
        </Button>
      </PeriodToolbar>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-xs font-semibold text-theme-3">Total concedido</div>
          <div className="mt-1 text-2xl font-bold text-theme-1">{fmt(totalGranted)}</div>
        </Card>
        <Card>
          <div className="text-xs font-semibold text-theme-3">Vendas com desconto</div>
          <div className="mt-1 text-2xl font-bold text-theme-1">{salesWithDiscount}</div>
        </Card>
        <Card>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-theme-3">
            Desconto médio
            <InfoTooltip text="Total concedido dividido pelo número de vendas com desconto no período." />
          </div>
          <div className="mt-1 text-2xl font-bold text-theme-1">{fmt(averageDiscount)}</div>
        </Card>
      </div>

      <Card title="Descontos concedidos" hint={periodLabel}>
        <div className="-m-5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-theme-border text-left text-xs uppercase tracking-wide text-theme-3">
                <th className="px-5 py-3">Recibo</th>
                <th className="px-5 py-3">Tipo</th>
                <th className="px-5 py-3 text-right">Valor</th>
                <th className="px-5 py-3">Autorizado por</th>
                <th className="px-5 py-3">Data</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((r) => (
                <tr key={r.id} className="border-b border-theme-border last:border-0 hover:bg-theme-hover">
                  <td className="px-5 py-3">
                    <code className="text-xs text-theme-1">{r.receiptNumber}</code>
                  </td>
                  <td className="px-5 py-3 text-theme-1">{discountLabel(r)}</td>
                  <td className="px-5 py-3 text-right text-theme-1">{fmt(r.amount)}</td>
                  <td className="px-5 py-3 text-theme-1">{r.authorizedByName}</td>
                  <td className="px-5 py-3 text-theme-1">{fmtDateTime(r.createdAt)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-theme-3">
                    Nenhum desconto concedido no período selecionado.
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
