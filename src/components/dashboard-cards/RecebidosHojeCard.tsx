import { fmt } from "../../lib/format";
import type { DashboardCardProps } from "./types";
import { StatCard } from "./StatCard";

/** Differs from "Vendas hoje" because a Crediário sale counts as a sale the
 * moment it's registered, but the money only comes in when the debt is paid
 * off — see `Plans/PLANO.md`'s "Crediário e Devedores". */
export function RecebidosHojeCard({ data }: DashboardCardProps) {
  return <StatCard label="Valores recebidos hoje" value={fmt(data.receivedToday)} />;
}
