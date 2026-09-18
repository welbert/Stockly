import { fmt } from "../../lib/format";
import type { DashboardCardProps } from "./types";
import { StatCard } from "./StatCard";

export function VendasCanceladasCard({ data }: DashboardCardProps) {
  const { count, totalValue } = data.cancelledSalesMonth;
  return (
    <StatCard
      label="Vendas canceladas no mês"
      value={String(count)}
      tone={count > 0 ? "danger" : undefined}
      sub={count > 0 ? `${fmt(totalValue)} estornados` : undefined}
    />
  );
}
