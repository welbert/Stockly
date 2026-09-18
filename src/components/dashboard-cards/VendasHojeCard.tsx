import { fmt } from "../../lib/format";
import type { DashboardCardProps } from "./types";
import { StatCard } from "./StatCard";

export function VendasHojeCard({ data }: DashboardCardProps) {
  return <StatCard label="Vendas hoje" value={fmt(data.salesToday)} />;
}
