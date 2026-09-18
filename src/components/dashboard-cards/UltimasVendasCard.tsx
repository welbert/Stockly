import { Card } from "../Card";
import { fmt, fmtDateTime } from "../../lib/format";
import type { DashboardCardProps } from "./types";

export function UltimasVendasCard({ data }: DashboardCardProps) {
  return (
    <Card title="Últimas vendas" className="flex h-full flex-col">
      <div className="h-full overflow-y-auto">
        {data.recentSales.length === 0 ? (
          <p className="text-sm text-theme-3">Nenhuma venda registrada ainda.</p>
        ) : (
          <ul className="divide-y divide-theme-border text-sm">
            {data.recentSales.map((sale) => (
              <li key={sale.receiptNumber} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0">
                  <span className="block truncate text-theme-1">
                    <code className="mr-1.5 text-xs text-theme-3">{sale.receiptNumber}</code>
                    {sale.userName}
                  </span>
                  <span className="text-xs text-theme-3">{fmtDateTime(sale.createdAt)}</span>
                </span>
                <span className="shrink-0 font-semibold text-theme-1">{fmt(sale.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
