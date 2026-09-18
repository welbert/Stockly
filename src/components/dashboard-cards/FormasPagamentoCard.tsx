import { ArcElement, Chart as ChartJS, Tooltip } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { Card } from "../Card";
import { PAYMENT_METHOD_LABEL } from "../../lib/format";
import type { PaymentMethod } from "../../lib/api";
import { themeColor } from "../../theme";
import type { DashboardCardProps } from "./types";

ChartJS.register(ArcElement, Tooltip);

/** Fixed per-method color (not a palette-by-index like categories) — the
 * same method should always read the same color across visits, regardless
 * of which methods had sales this month. */
function colorFor(method: PaymentMethod): string {
  switch (method) {
    case "cash":
      return themeColor("--color-success", "#16a34a");
    case "card":
      return themeColor("--color-primary", "#4f46e5");
    case "pix":
      return themeColor("--color-info", "#0891b2");
    case "credit":
      return themeColor("--color-warning", "#d97706");
  }
}

export function FormasPagamentoCard({ data }: DashboardCardProps) {
  const methods = data.paymentMethods;
  const totalCount = methods.reduce((sum, m) => sum + m.count, 0);

  if (totalCount === 0) {
    return (
      <Card title="Formas de pagamento" hint="mês atual" className="flex h-full flex-col items-center justify-center">
        <p className="text-sm text-theme-3">Nenhuma venda no mês ainda.</p>
      </Card>
    );
  }

  const colors = methods.map((m) => colorFor(m.paymentMethod));

  return (
    <Card title="Formas de pagamento" hint="mês atual" className="flex h-full flex-col">
      <div className="flex h-full items-center gap-4">
        <div className="relative h-[110px] w-[110px] shrink-0">
          <Doughnut
            data={{
              labels: methods.map((m) => PAYMENT_METHOD_LABEL[m.paymentMethod] ?? m.paymentMethod),
              datasets: [{ data: methods.map((m) => m.count), backgroundColor: colors, borderWidth: 0 }],
            }}
            options={{
              cutout: "62%",
              animation: { duration: 250 },
              plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed} venda(s)` } },
              },
            }}
          />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-sm font-bold text-theme-1">{totalCount}</div>
            <div className="text-[10px] uppercase tracking-wide text-theme-3">vendas</div>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5 overflow-y-auto">
          {methods.map((m, i) => (
            <div key={m.paymentMethod} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 text-theme-3">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colors[i] }} />
                {PAYMENT_METHOD_LABEL[m.paymentMethod] ?? m.paymentMethod}
              </span>
              <span className="font-semibold text-theme-1">{Math.round((m.count / totalCount) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
