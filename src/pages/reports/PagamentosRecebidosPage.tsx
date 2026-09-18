import { useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import type { CreditPaymentReportRow } from "../../lib/api";
import { exportReportCsv, exportReportPdf, listCreditPayments, openContainingFolder } from "../../lib/api";
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
const REPORT_HEADERS = ["Cliente", "Valor", "Data", "Registrado por"];
const REPORT_COLUMN_WEIGHTS = [4, 3, 4, 3];

/** Quitações de Crediário (parciais ou totais) recebidas no período —
 * `list_credit_payments` fetched once and filtered client-side to
 * `cancelledAt === null`, same source `PagamentosCanceladosPage` reuses with
 * the opposite filter (one command, two views, same convention as
 * `listSales`/`listStockMovements`). Filtered by the payment's own
 * `createdAt`, not the underlying sale's date — this is about money that
 * came in during the period, regardless of when the original Crediário sale
 * happened. */
export function PagamentosRecebidosPage() {
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
        if (p.cancelledAt !== null) return false;
        const key = localDateKey(p.createdAt);
        return key >= range.from && key <= range.to;
      }),
    [payments, range],
  );

  useEffect(() => setPage(0), [period.preset, period.customFrom, period.customTo]);

  const totalReceived = filtered.reduce((sum, p) => sum + p.amount, 0);
  const count = filtered.length;
  const ticketMedio = count > 0 ? totalReceived / count : 0;

  const paginated = filtered.slice(page * pageSize, (page + 1) * pageSize);

  function reportRows(): string[][] {
    return filtered.map((p) => [p.clientName, fmt(p.amount), fmtDateTime(p.createdAt), p.userName]);
  }

  async function handleExportCsv() {
    let path: string | null;
    try {
      path = await save({
        defaultPath: `pagamentos-recebidos-${range.from}-a-${range.to}.csv`,
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
        title: "CSV de Pagamentos recebidos gerado",
        message: "Clique aqui para abrir a pasta",
        onClick: () => openContainingFolder(path!),
      });
    } catch (err) {
      logger.error("falha ao exportar CSV de pagamentos recebidos", path, err);
      showToast({ type: "error", title: "Falha ao exportar CSV de Pagamentos recebidos", message: String(err) });
    }
  }

  async function handleExportPdf() {
    let path: string | null;
    try {
      path = await save({
        defaultPath: `pagamentos-recebidos-${range.from}-a-${range.to}.pdf`,
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
        "Pagamentos recebidos",
        periodLabel,
        [
          { label: "Total recebido", value: fmt(totalReceived) },
          { label: "Nº de pagamentos", value: String(count) },
          { label: "Ticket médio", value: fmt(ticketMedio) },
        ],
        REPORT_HEADERS,
        REPORT_COLUMN_WEIGHTS,
        reportRows(),
      );
      showToast({
        type: "success",
        title: "PDF de Pagamentos recebidos gerado",
        message: "Clique aqui para abrir a pasta",
        onClick: () => openContainingFolder(path!),
      });
    } catch (err) {
      logger.error("falha ao exportar PDF de pagamentos recebidos", path, err);
      showToast({ type: "error", title: "Falha ao exportar PDF de Pagamentos recebidos", message: String(err) });
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

      <div className="mb-4 grid grid-cols-3 gap-4">
        <Card>
          <div className="text-xs font-semibold text-theme-3">Total recebido</div>
          <div className="mt-1 text-2xl font-bold text-theme-1">{fmt(totalReceived)}</div>
        </Card>
        <Card>
          <div className="text-xs font-semibold text-theme-3">Nº de pagamentos</div>
          <div className="mt-1 text-2xl font-bold text-theme-1">{count}</div>
        </Card>
        <Card>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-theme-3">
            Ticket médio
            <InfoTooltip text="Valor médio por pagamento: total recebido dividido pelo número de pagamentos no período." />
          </div>
          <div className="mt-1 text-2xl font-bold text-theme-1">{fmt(ticketMedio)}</div>
        </Card>
      </div>

      <Card title="Pagamentos recebidos" hint={periodLabel}>
        <div className="-m-5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-theme-border text-left text-xs uppercase tracking-wide text-theme-3">
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Valor</th>
                <th className="px-5 py-3">Data</th>
                <th className="px-5 py-3">Registrado por</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((p) => (
                <tr key={p.id} className="border-b border-theme-border last:border-0 hover:bg-theme-hover">
                  <td className="px-5 py-3 text-theme-1">{p.clientName}</td>
                  <td className="px-5 py-3 text-theme-1">{fmt(p.amount)}</td>
                  <td className="px-5 py-3 text-theme-1">{fmtDateTime(p.createdAt)}</td>
                  <td className="px-5 py-3 text-theme-1">{p.userName}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-theme-3">
                    Nenhum pagamento recebido no período selecionado.
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
