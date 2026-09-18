import { fmt } from "../../lib/format";
import type { DashboardCardProps } from "./types";
import { StatCard } from "./StatCard";

export function RecebidosMesCard({ data }: DashboardCardProps) {
  return <StatCard label="Valores recebidos no mês" value={fmt(data.receivedMonth)} />;
}
