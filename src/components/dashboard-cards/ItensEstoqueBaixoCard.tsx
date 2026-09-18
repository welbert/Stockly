import { Card } from "../Card";
import type { DashboardCardProps } from "./types";

export function ItensEstoqueBaixoCard({ data }: DashboardCardProps) {
  return (
    <Card title="Itens com estoque baixo" hint={`${data.lowStockCount} ${data.lowStockCount === 1 ? "item" : "itens"}`} className="flex h-full flex-col">
      <div className="h-full overflow-y-auto">
        {data.lowStockItems.length === 0 ? (
          <p className="text-sm text-theme-3">Nenhum item abaixo da quantidade mínima.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-theme-border text-left text-xs uppercase tracking-wide text-theme-3">
                <th className="pb-2">Item</th>
                <th className="pb-2 text-right">Qtd.</th>
              </tr>
            </thead>
            <tbody>
              {data.lowStockItems.map((item) => (
                <tr key={item.name} className="border-b border-theme-border last:border-0">
                  <td className="py-1.5 text-theme-1">{item.name}</td>
                  <td className="py-1.5 text-right">
                    <span className={`font-semibold ${item.quantity === 0 ? "text-danger" : "text-warning"}`}>{item.quantity}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
