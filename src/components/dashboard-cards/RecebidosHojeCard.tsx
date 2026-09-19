import { fmt } from "../../lib/format";
import type { DashboardCardProps } from "./types";
import { StatCard } from "./StatCard";

/** Differs from "Vendas hoje" because a Crediário sale counts as a sale the
 * moment it's registered, but the money only comes in when the debt is paid
 * off. */
export function RecebidosHojeCard({ data }: DashboardCardProps) {
  return <StatCard label="Valores recebidos hoje" value={fmt(data.receivedToday)} />;
}
