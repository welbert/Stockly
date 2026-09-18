import { fmt } from "../../lib/format";
import type { DashboardCardProps } from "./types";
import { StatCard } from "./StatCard";

/** Same aggregate that feeds Devedores' own "Total em aberto" stat card —
 * reused, not recalculated (see `docs/commands.md`'s `get_dashboard_data`). */
export function CreditoEmAbertoCard({ data }: DashboardCardProps) {
  return <StatCard label="Total em Crediário em aberto" value={fmt(data.creditOutstandingTotal)} />;
}
