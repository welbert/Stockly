import type { DashboardCardProps } from "./types";
import { StatCard } from "./StatCard";

export function ItensEmEstoqueCard({ data }: DashboardCardProps) {
  return <StatCard label="Itens em estoque" value={data.itemsInStock.toLocaleString("pt-BR")} />;
}
