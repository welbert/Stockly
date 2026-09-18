import { fmt } from "../../lib/format";
import type { DashboardCardProps } from "./types";
import { StatCard } from "./StatCard";

/** Combined item-level + general discount for the month — same figure as
 * Histórico de vendas' "Desconto" column, summed (see `docs/commands.md`). */
export function DescontosConcedidosCard({ data }: DashboardCardProps) {
  return <StatCard label="Descontos concedidos no mês" value={fmt(data.discountGrantedMonth)} />;
}
