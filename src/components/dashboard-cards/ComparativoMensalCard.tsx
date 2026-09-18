import type { DashboardCardProps } from "./types";
import { StatCard } from "./StatCard";

export function ComparativoMensalCard({ data }: DashboardCardProps) {
  const pct = data.monthComparisonPercent;
  if (pct === null) {
    return <StatCard label="Comparativo mensal" value="—" sub="Sem venda no mês anterior para comparar" />;
  }
  const sign = pct > 0 ? "+" : "";
  return (
    <StatCard
      label="Comparativo mensal"
      value={`${sign}${pct.toFixed(1)}%`}
      tone={pct < 0 ? "danger" : undefined}
      sub="vs. mês anterior"
    />
  );
}
