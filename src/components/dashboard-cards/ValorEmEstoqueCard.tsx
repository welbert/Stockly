import { fmt } from "../../lib/format";
import type { DashboardCardProps } from "./types";
import { StatCard } from "./StatCard";

/** Cost-basis value (`cost_price * quantity`), not sale price — see
 * `Plans/PLANO.md`'s Dashboard section for why: represents capital tied up
 * in stock, not a hypothetical revenue that still depends on selling
 * everything at full price. */
export function ValorEmEstoqueCard({ data }: DashboardCardProps) {
  return <StatCard label="Valor em estoque (custo)" value={fmt(data.stockValue)} />;
}
