import { Card } from "../Card";
import type { DashboardCardProps } from "./types";

export function TopItensVendidosCard({ data }: DashboardCardProps) {
  return (
    <Card title="Top itens vendidos" hint="mês atual" className="flex h-full flex-col">
      <div className="h-full overflow-y-auto">
        {data.topSellingItems.length === 0 ? (
          <p className="text-sm text-theme-3">Nenhuma venda no mês ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-theme-border text-left text-xs uppercase tracking-wide text-theme-3">
                <th className="pb-2">Item</th>
                <th className="pb-2 text-right">Qtd.</th>
              </tr>
            </thead>
            <tbody>
              {data.topSellingItems.map((item) => (
                <tr key={item.name} className="border-b border-theme-border last:border-0">
                  <td className="py-1.5 text-theme-1">{item.name}</td>
                  <td className="py-1.5 text-right text-theme-1">{item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
