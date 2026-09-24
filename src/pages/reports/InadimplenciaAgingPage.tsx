import { useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { ArcElement, Chart as ChartJS, Tooltip } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import type { ClientSummary, CreditSaleReportRow } from "../../lib/api";
import { exportReportCsv, exportReportPdf, listClients, listCreditSales, openContainingFolder } from "../../lib/api";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Pagination } from "../../components/Pagination";
import { useToast } from "../../context/ToastContext";
import { fmt, fmtDateFull, localDateKey } from "../../lib/format";
import { logger } from "../../logger";
import { themeColor } from "../../theme";
import { todayKey } from "./usePeriodFilter";

ChartJS.register(ArcElement, Tooltip);

const PAGE_SIZE_OPTIONS = [10, 20, 50];

type Bucket = "0-7" | "8-30" | "31+";

const BUCKET_LABEL: Record<Bucket, string> = {
  "0-7": "0–7 dias",
  "8-30": "8–30 dias",
  "31+": "31+ dias",
};

const REPORT_HEADERS = ["Cliente", "Telefone", "Saldo em aberto", "Venda mais antiga em aberto", "Dias em atraso", "Faixa"];
const REPORT_COLUMN_WEIGHTS = [4, 3, 3, 4, 3, 3];

function bucketFor(days: number): Bucket {
  if (days <= 7) return "0-7";
  if (days <= 30) return "8-30";
  return "31+";
}

function bucketBadgeClass(bucket: Bucket): string {
  if (bucket === "31+") return "bg-danger/10 text-danger";
  if (bucket === "8-30") return "bg-warning/10 text-warning";
  return "bg-theme-hover text-theme-3";
}

function daysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  const from = new Date(fy, fm - 1, fd);
  const to = new Date(ty, tm - 1, td);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

interface DebtorAging {
  clientId: number;
  clientName: string;
  phone: string | null;
  balance: number;
  oldestOpenSale: string;
  daysOverdue: number;
  bucket: Bucket;
}

/** "Inadimplência com aging" — decided to base days-overdue on the client's
 * *oldest still-open Crediário sale* (`list_credit_sales`), not
 * `reminder_date`: the plan text left this open ("calculado a partir de
 * reminder_date ou de quando a venda foi feita"), and a sale date is always
 * present for any real debtor while a reminder is optional and can be
 * cleared/rescheduled without the underlying debt getting any younger. No
 * period toolbar — this is a snapshot of debt *as of now*, not something
 * scoped to a date range (same reasoning as `ItensParadosPage`). */
export function InadimplenciaAgingPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [creditSales, setCreditSales] = useState<CreditSaleReportRow[]>([]);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[1]);

  useEffect(() => {
    listCreditSales()
      .then(setCreditSales)
      .catch((err) => logger.error("falha ao listar vendas em Crediário", err));
    listClients()
      .then(setClients)
      .catch((err) => logger.error("falha ao listar clientes", err));
  }, []);

  const debtors = useMemo(() => {
    // `balance` comes from `ClientSummary` (server-side `client_balance`, one
    // `round2` over the client's aggregate), not summed here from each sale's
    // own `remaining` — summing several already-rounded per-sale `remaining`
    // values and rounding *that* again can drift a cent or two from the
    // single aggregate rounding `client_balance`/Clientes/Dashboard all show
    // for the same client. `creditSales` is only still needed for
    // `oldestOpenSale`, which has no equivalent aggregate to reuse.
    const oldestOpenSaleByClient = new Map<number, string>();
    for (const s of creditSales) {
      if (s.remaining <= 0.004) continue;
      const current = oldestOpenSaleByClient.get(s.clientId);
      if (!current || s.createdAt < current) oldestOpenSaleByClient.set(s.clientId, s.createdAt);
    }
    const today = todayKey();
    const list: DebtorAging[] = clients
      .filter((c) => c.balance > 0 && oldestOpenSaleByClient.has(c.id))
      .map((c) => {
        const oldestOpenSale = oldestOpenSaleByClient.get(c.id)!;
        const daysOverdue = daysBetween(localDateKey(oldestOpenSale), today);
        return {
          clientId: c.id,
          clientName: c.name,
          phone: c.phone,
          balance: c.balance,
          oldestOpenSale,
          daysOverdue,
          bucket: bucketFor(daysOverdue),
        };
      });
    return list.sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [creditSales, clients]);

  const totalOpen = debtors.reduce((sum, d) => sum + d.balance, 0);
  const overdueCount = debtors.filter((d) => d.bucket === "31+").length;
  const worstDays = debtors.reduce((max, d) => Math.max(max, d.daysOverdue), 0);

  const byBucket = useMemo(() => {
    const totals: Record<Bucket, number> = { "0-7": 0, "8-30": 0, "31+": 0 };
    for (const d of debtors) totals[d.bucket] += d.balance;
    return (["0-7", "8-30", "31+"] as Bucket[]).map((bucket) => ({ bucket, total: totals[bucket] }));
  }, [debtors]);

  const bucketColors = [themeColor("--color-success", "#16a34a"), themeColor("--color-warning", "#d97706"), themeColor("--color-danger", "#dc2626")];

  const paginated = debtors.slice(page * pageSize, (page + 1) * pageSize);

  function reportRows(): string[][] {
    return debtors.map((d) => [
      d.clientName,
      d.phone ?? "—",
      fmt(d.balance),
      fmtDateFull(localDateKey(d.oldestOpenSale)),
      String(d.daysOverdue),
      BUCKET_LABEL[d.bucket],
    ]);
  }

  async function handleExportCsv() {
    let path: string | null;
    try {
      path = await save({ defaultPath: `inadimplencia-${todayKey()}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }] });
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
        title: "CSV de Inadimplência gerado",
        message: "Clique aqui para abrir a pasta",
        onClick: () => openContainingFolder(path!),
      });
    } catch (err) {
      logger.error("falha ao exportar CSV de inadimplência", path, err);
      showToast({ type: "error", title: "Falha ao exportar CSV de Inadimplência", message: String(err) });
    }
  }

  async function handleExportPdf() {
    let path: string | null;
    try {
      path = await save({ defaultPath: `inadimplencia-${todayKey()}.pdf`, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    } catch (err) {
      logger.error("falha ao abrir seletor de destino do PDF", err);
      showToast({ type: "error", title: "Não foi possível abrir o seletor de arquivo" });
      return;
    }
    if (!path) return;
    try {
      await exportReportPdf(
        path,
        "Inadimplência",
        `Situação em ${fmtDateFull(todayKey())}`,
        [
          { label: "Total em aberto", value: fmt(totalOpen) },
          { label: "Devedores ativos", value: String(debtors.length) },
          { label: "Em atraso (31+ dias)", value: String(overdueCount) },
          { label: "Maior atraso", value: debtors.length > 0 ? `${worstDays} dias` : "—" },
        ],
        REPORT_HEADERS,
        REPORT_COLUMN_WEIGHTS,
        reportRows(),
      );
      showToast({
        type: "success",
        title: "PDF de Inadimplência gerado",
        message: "Clique aqui para abrir a pasta",
        onClick: () => openContainingFolder(path!),
      });
    } catch (err) {
      logger.error("falha ao exportar PDF de inadimplência", path, err);
      showToast({ type: "error", title: "Falha ao exportar PDF de Inadimplência", message: String(err) });
    }
  }

  if (!user) return null;
  if (!user.isAdmin) return <Navigate to="/" replace />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex-1" />
        <Button variant="secondary" onClick={handleExportCsv}>
          ⭱ Exportar CSV
        </Button>
        <Button variant="secondary" onClick={handleExportPdf}>
          ⭱ Exportar PDF
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <div className="text-xs font-semibold text-theme-3">Total em aberto</div>
          <div className="mt-1 text-2xl font-bold text-theme-1">{fmt(totalOpen)}</div>
        </Card>
        <Card>
          <div className="text-xs font-semibold text-theme-3">Devedores ativos</div>
          <div className="mt-1 text-2xl font-bold text-theme-1">{debtors.length}</div>
        </Card>
        <Card>
          <div className="text-xs font-semibold text-theme-3">Em atraso (31+ dias)</div>
          <div className={`mt-1 text-2xl font-bold ${overdueCount > 0 ? "text-danger" : "text-theme-1"}`}>{overdueCount}</div>
        </Card>
        <Card>
          <div className="text-xs font-semibold text-theme-3">Maior atraso</div>
          <div className="mt-1 text-2xl font-bold text-theme-1">{debtors.length > 0 ? `${worstDays} dias` : "—"}</div>
        </Card>
      </div>

      <Card title="Saldo em aberto por faixa de atraso" className="mb-4">
        {totalOpen <= 0 ? (
          <p className="text-sm text-theme-3">Nenhum devedor em aberto no momento.</p>
        ) : (
          <div className="flex flex-col gap-6 md:flex-row md:items-center">
            <div className="relative h-[160px] w-[160px] shrink-0 self-center">
              <Doughnut
                data={{
                  labels: byBucket.map((b) => BUCKET_LABEL[b.bucket]),
                  datasets: [{ data: byBucket.map((b) => b.total), backgroundColor: bucketColors, borderWidth: 0 }],
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
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-sm font-bold text-theme-1">{fmt(totalOpen)}</div>
                <div className="text-[10px] uppercase tracking-wide text-theme-3">em aberto</div>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-theme-border text-left text-xs uppercase tracking-wide text-theme-3">
                    <th className="pb-2">Faixa</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {byBucket.map((b, i) => (
                    <tr key={b.bucket} className="border-b border-theme-border last:border-0">
                      <td className="py-2">
                        <span className="flex items-center gap-1.5 text-theme-1">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: bucketColors[i] }} />
                          {BUCKET_LABEL[b.bucket]}
                        </span>
                      </td>
                      <td className="py-2 text-right text-theme-1">{fmt(b.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      <Card title="Devedores" hint="ordenado por maior atraso">
        <div className="-m-5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-theme-border text-left text-xs uppercase tracking-wide text-theme-3">
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Telefone</th>
                <th className="px-5 py-3">Saldo em aberto</th>
                <th className="px-5 py-3">Venda mais antiga em aberto</th>
                <th className="px-5 py-3 text-right">Dias em atraso</th>
                <th className="px-5 py-3">Faixa</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((d) => (
                <tr key={d.clientId} className="border-b border-theme-border last:border-0 hover:bg-theme-hover">
                  <td className="px-5 py-3 text-theme-1">{d.clientName}</td>
                  <td className="px-5 py-3 text-theme-1">{d.phone ?? "—"}</td>
                  <td className="px-5 py-3 text-theme-1">{fmt(d.balance)}</td>
                  <td className="px-5 py-3 text-theme-1">{fmtDateFull(localDateKey(d.oldestOpenSale))}</td>
                  <td className="px-5 py-3 text-right text-theme-1">{d.daysOverdue}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${bucketBadgeClass(d.bucket)}`}>
                      {BUCKET_LABEL[d.bucket]}
                    </span>
                  </td>
                </tr>
              ))}
              {debtors.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-theme-3">
                    Nenhum devedor em aberto no momento.
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
        total={debtors.length}
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
