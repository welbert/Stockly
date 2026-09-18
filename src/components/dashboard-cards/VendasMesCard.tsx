import { fmt } from "../../lib/format";
import type { DashboardCardProps } from "./types";
import { StatCard } from "./StatCard";

export function VendasMesCard({ data }: DashboardCardProps) {
  return <StatCard label="Vendas no mês" value={fmt(data.salesMonth)} />;
}
