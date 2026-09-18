import type { DashboardCardProps } from "./types";
import { StatCard } from "./StatCard";

export function EstoqueBaixoCard({ data }: DashboardCardProps) {
  return (
    <StatCard label="Itens em estoque baixo" value={String(data.lowStockCount)} tone={data.lowStockCount > 0 ? "warning" : undefined} />
  );
}
