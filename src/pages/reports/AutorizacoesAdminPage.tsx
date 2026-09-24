import { useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import type { AdminAuthorizationRow } from "../../lib/api";
import { exportReportCsv, exportReportPdf, listAdminAuthorizations, openContainingFolder } from "../../lib/api";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Pagination } from "../../components/Pagination";
import { useToast } from "../../context/ToastContext";
import { fmt, fmtDateTime, localDateKey } from "../../lib/format";
import { logger } from "../../logger";
import { PeriodToolbar } from "./PeriodToolbar";
import { usePeriodFilter } from "./usePeriodFilter";

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const ACTION_TYPE_LABEL: Record<AdminAuthorizationRow["actionType"], string> = {
  discount: "Desconto concedido",
  sale_cancel: "Venda cancelada",
  payment_cancel: "Pagamento cancelado",
  password_reset: "Senha redefinida",
};

const ACTION_TYPE_BADGE: Record<AdminAuthorizationRow["actionType"], string> = {
  discount: "bg-primary-soft text-primary",
  sale_cancel: "bg-danger/10 text-danger",
  payment_cancel: "bg-warning/10 text-warning",
  password_reset: "bg-success/10 text-success",
};

const REPORT_HEADERS = ["Tipo", "Referência", "Cliente", "Valor", "Solicitado por", "Autorizado por", "Data"];
const REPORT_COLUMN_WEIGHTS = [3, 3, 3, 2, 3, 3, 3];

/** Visão unificada de toda ação que precisou de autorização de Admin, direto
 * da tabela `audit_log` — ver `commands::audit::list_admin_authorizations`'s
 * doc comment pra exatamente quais tipos entram aqui (cliente renomeado
 * ainda não é persistido — `docs/future.md`). Filtro de tipo (`typeFilter`)
 * segue o mesmo padrão do `movementType` de `MovimentacaoEstoquePage`. */
export function AutorizacoesAdminPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [rows, setRows] = useState<AdminAuthorizationRow[]>([]);
  const [typeFilter, setTypeFilter] = useState<AdminAuthorizationRow["actionType"] | "">("");
  const period = usePeriodFilter();
  const { range, periodLabel } = period;
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[1]);

  useEffect(() => {
    listAdminAuthorizations()
      .then(setRows)
      .catch((err) => logger.error("falha ao listar autorizações de administrador", err));
  }, []);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (typeFilter && r.actionType !== typeFilter) return false;
        const key = localDateKey(r.createdAt);
        return key >= range.from && key <= range.to;
      }),
    [rows, typeFilter, range],
  );

  useEffect(() => setPage(0), [typeFilter, period.preset, period.customFrom, period.customTo]);

  const byType = useMemo(() => {
    const counts: Record<AdminAuthorizationRow["actionType"], number> = {
      discount: 0,
      sale_cancel: 0,
      payment_cancel: 0,
      password_reset: 0,
    };
    for (const r of filtered) counts[r.actionType] += 1;
    return counts;
  }, [filtered]);

  const paginated = filtered.slice(page * pageSize, (page + 1) * pageSize);

  function reportRows(): string[][] {
    return filtered.map((r) => [
      ACTION_TYPE_LABEL[r.actionType],
      r.reference ?? "—",
      r.clientName ?? "—",
      r.amount !== null ? fmt(r.amount) : "—",
      r.requestedByName,
      r.authorizedByName,
      fmtDateTime(r.createdAt),
    ]);
  }

  async function handleExportCsv() {
    let path: string | null;
    try {
      path = await save({
        defaultPath: `autorizacoes-admin-${range.from}-a-${range.to}.csv`,
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
        title: "CSV de Autorizações de Administrador gerado",
        message: "Clique aqui para abrir a pasta",
        onClick: () => openContainingFolder(path!),
      });
    } catch (err) {
      logger.error("falha ao exportar CSV de autorizações de administrador", path, err);
      showToast({ type: "error", title: "Falha ao exportar CSV de Autorizações de Administrador", message: String(err) });
    }
  }

  async function handleExportPdf() {
    let path: string | null;
    try {
      path = await save({
        defaultPath: `autorizacoes-admin-${range.from}-a-${range.to}.pdf`,
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
        "Autorizações de Administrador",
        periodLabel,
        [
          { label: "Total de autorizações", value: String(filtered.length) },
          { label: "Descontos", value: String(byType.discount) },
          { label: "Vendas canceladas", value: String(byType.sale_cancel) },
          { label: "Pagamentos cancelados", value: String(byType.payment_cancel) },
          { label: "Senhas redefinidas", value: String(byType.password_reset) },
        ],
        REPORT_HEADERS,
        REPORT_COLUMN_WEIGHTS,
        reportRows(),
      );
      showToast({
        type: "success",
        title: "PDF de Autorizações de Administrador gerado",
        message: "Clique aqui para abrir a pasta",
        onClick: () => openContainingFolder(path!),
      });
    } catch (err) {
      logger.error("falha ao exportar PDF de autorizações de administrador", path, err);
      showToast({ type: "error", title: "Falha ao exportar PDF de Autorizações de Administrador", message: String(err) });
    }
  }

  if (!user) return null;
  if (!user.isAdmin) return <Navigate to="/" replace />;

  return (
    <div>
      <PeriodToolbar filter={period}>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as AdminAuthorizationRow["actionType"] | "")}
          className="rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-1 outline-none"
        >
          <option value="">Todos os tipos</option>
          <option value="discount">Desconto concedido</option>
          <option value="sale_cancel">Venda cancelada</option>
          <option value="payment_cancel">Pagamento cancelado</option>
          <option value="password_reset">Senha redefinida</option>
        </select>
        <Button variant="secondary" onClick={handleExportCsv}>
          ⭱ Exportar CSV
        </Button>
        <Button variant="secondary" onClick={handleExportPdf}>
          ⭱ Exportar PDF
        </Button>
      </PeriodToolbar>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Card>
          <div className="text-xs font-semibold text-theme-3">Total de autorizações</div>
          <div className="mt-1 text-2xl font-bold text-theme-1">{filtered.length}</div>
        </Card>
        <Card>
          <div className="text-xs font-semibold text-theme-3">Descontos</div>
          <div className="mt-1 text-2xl font-bold text-theme-1">{byType.discount}</div>
        </Card>
        <Card>
          <div className="text-xs font-semibold text-theme-3">Vendas canceladas</div>
          <div className="mt-1 text-2xl font-bold text-theme-1">{byType.sale_cancel}</div>
        </Card>
        <Card>
          <div className="text-xs font-semibold text-theme-3">Pagamentos cancelados</div>
          <div className="mt-1 text-2xl font-bold text-theme-1">{byType.payment_cancel}</div>
        </Card>
        <Card>
          <div className="text-xs font-semibold text-theme-3">Senhas redefinidas</div>
          <div className="mt-1 text-2xl font-bold text-theme-1">{byType.password_reset}</div>
        </Card>
      </div>

      <Card title="Autorizações de Administrador" hint={periodLabel}>
        <div className="-m-5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-theme-border text-left text-xs uppercase tracking-wide text-theme-3">
                <th className="px-5 py-3">Tipo</th>
                <th className="px-5 py-3">Referência</th>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Valor</th>
                <th className="px-5 py-3">Solicitado por</th>
                <th className="px-5 py-3">Autorizado por</th>
                <th className="px-5 py-3">Data</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((r) => (
                <tr key={r.id} className="border-b border-theme-border last:border-0 hover:bg-theme-hover">
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ACTION_TYPE_BADGE[r.actionType]}`}>
                      {ACTION_TYPE_LABEL[r.actionType]}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {r.reference ? <code className="text-xs">{r.reference}</code> : <span className="text-theme-3">—</span>}
                  </td>
                  <td className="px-5 py-3 text-theme-1">{r.clientName ?? "—"}</td>
                  <td className="px-5 py-3 text-theme-1">{r.amount !== null ? fmt(r.amount) : "—"}</td>
                  <td className="px-5 py-3 text-theme-1">{r.requestedByName}</td>
                  <td className="px-5 py-3 text-theme-1">{r.authorizedByName}</td>
                  <td className="px-5 py-3 text-theme-1">{fmtDateTime(r.createdAt)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-center text-theme-3">
                    Nenhuma autorização no período selecionado.
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
