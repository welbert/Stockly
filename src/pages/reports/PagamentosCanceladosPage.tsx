import { useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import type { CreditPaymentReportRow } from "../../lib/api";
import { exportReportCsv, exportReportPdf, listCreditPayments, openContainingFolder } from "../../lib/api";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Pagination } from "../../components/Pagination";
import { useToast } from "../../context/ToastContext";
import { fmt, fmtDateTime, localDateKey } from "../../lib/format";
import { logger } from "../../logger";
import { PeriodToolbar } from "./PeriodToolbar";
import { usePeriodFilter } from "./usePeriodFilter";

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const REPORT_HEADERS = ["Cliente", "Valor", "Pago em", "Cancelado em", "Cancelado por", "Autorizado por", "Motivo"];
const REPORT_COLUMN_WEIGHTS = [3, 2, 3, 3, 3, 3, 4];

/** Auditoria de `credit_payments` com `cancelled_at` preenchido — mesma fonte
 * de `PagamentosRecebidosPage` (`list_credit_payments`), filtrada ao oposto
 * (`cancelledAt !== null`). Filtrado pela data do **cancelamento**
 * (`cancelledAt`), não do pagamento original (`createdAt`) — o período aqui
 * responde "quantos cancelamentos aconteceram nesta janela", não "quantos
 * pagamentos daquele período acabaram cancelados depois". */
export function PagamentosCanceladosPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [payments, setPayments] = useState<CreditPaymentReportRow[]>([]);
  const period = usePeriodFilter();
  const { range, periodLabel } = period;
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[1]);

  useEffect(() => {
    listCreditPayments()
      .then(setPayments)
      .catch((err) => logger.error("falha ao listar pagamentos de Crediário", err));
  }, []);

  const filtered = useMemo(
    () =>
      payments.filter((p) => {
        if (p.cancelledAt === null) return false;
        const key = localDateKey(p.cancelledAt);
        return key >= range.from && key <= range.to;
      }),
    [payments, range],
  );

  useEffect(() => setPage(0), [period.preset, period.customFrom, period.customTo]);

  const totalCancelled = filtered.reduce((sum, p) => sum + p.amount, 0);
  const count = filtered.length;

  const paginated = filtered.slice(page * pageSize, (page + 1) * pageSize);

  function reportRows(): string[][] {
    return filtered.map((p) => [
      p.clientName,
      fmt(p.amount),
      fmtDateTime(p.createdAt),
      p.cancelledAt ? fmtDateTime(p.cancelledAt) : "—",
      p.cancelledByName ?? "—",
      p.cancelAuthorizedByName ?? "—",
      p.cancelReason ?? "—",
    ]);
  }

  async function handleExportCsv() {
    let path: string | null;
    try {
      path = await save({
        defaultPath: `pagamentos-cancelados-${range.from}-a-${range.to}.csv`,
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
        title: "CSV de Pagamentos cancelados gerado",
        message: "Clique aqui para abrir a pasta",
        onClick: () => openContainingFolder(path!),
      });
    } catch (err) {
      logger.error("falha ao exportar CSV de pagamentos cancelados", path, err);
      showToast({ type: "error", title: "Falha ao exportar CSV de Pagamentos cancelados", message: String(err) });
    }
  }

  async function handleExportPdf() {
    let path: string | null;
    try {
      path = await save({
        defaultPath: `pagamentos-cancelados-${range.from}-a-${range.to}.pdf`,
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
        "Pagamentos cancelados",
        periodLabel,
        [
          { label: "Nº de cancelamentos", value: String(count) },
          { label: "Valor total cancelado", value: fmt(totalCancelled) },
        ],
        REPORT_HEADERS,
        REPORT_COLUMN_WEIGHTS,
        reportRows(),
      );
      showToast({
        type: "success",
        title: "PDF de Pagamentos cancelados gerado",
        message: "Clique aqui para abrir a pasta",
        onClick: () => openContainingFolder(path!),
      });
    } catch (err) {
      logger.error("falha ao exportar PDF de pagamentos cancelados", path, err);
      showToast({ type: "error", title: "Falha ao exportar PDF de Pagamentos cancelados", message: String(err) });
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

      <div className="mb-4 grid grid-cols-2 gap-4">
        <Card>
          <div className="text-xs font-semibold text-theme-3">Nº de cancelamentos</div>
          <div className="mt-1 text-2xl font-bold text-theme-1">{count}</div>
        </Card>
        <Card>
          <div className="text-xs font-semibold text-theme-3">Valor total cancelado</div>
          <div className="mt-1 text-2xl font-bold text-theme-1">{fmt(totalCancelled)}</div>
        </Card>
      </div>

      <Card title="Pagamentos cancelados" hint={periodLabel}>
        <div className="-m-5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-theme-border text-left text-xs uppercase tracking-wide text-theme-3">
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Valor</th>
                <th className="px-5 py-3">Pago em</th>
                <th className="px-5 py-3">Cancelado em</th>
                <th className="px-5 py-3">Cancelado por</th>
                <th className="px-5 py-3">Autorizado por</th>
                <th className="px-5 py-3">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((p) => (
                <tr key={p.id} className="border-b border-theme-border last:border-0 hover:bg-theme-hover">
                  <td className="px-5 py-3 text-theme-1">{p.clientName}</td>
                  <td className="px-5 py-3 text-theme-1">{fmt(p.amount)}</td>
                  <td className="px-5 py-3 text-theme-1">{fmtDateTime(p.createdAt)}</td>
                  <td className="px-5 py-3 text-theme-1">{p.cancelledAt ? fmtDateTime(p.cancelledAt) : "—"}</td>
                  <td className="px-5 py-3 text-theme-1">{p.cancelledByName ?? "—"}</td>
                  <td className="px-5 py-3 text-theme-1">{p.cancelAuthorizedByName ?? "—"}</td>
                  <td className="px-5 py-3 text-theme-3">{p.cancelReason ?? "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-center text-theme-3">
                    Nenhum pagamento cancelado no período selecionado.
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
