import type { ItemSummary, StockStatus } from "../lib/api";
import { lowStockWarningThreshold, stockStatus } from "../lib/api";
import { Tooltip } from "./Tooltip";

const LABELS: Record<StockStatus, string> = {
  critical: "Crítico",
  warning: "Baixo",
  ok: "OK",
};

const TONE_CLASS: Record<StockStatus, string> = {
  critical: "bg-danger/10 text-danger",
  warning: "bg-warning/10 text-warning",
  ok: "bg-success/10 text-success",
};

function explain(item: Pick<ItemSummary, "quantity" | "minQuantity">, status: StockStatus, lowStockPercent: number): string | null {
  if (status === "ok") return null;
  // `stockStatus()` only returns non-"ok" with `minQuantity === null` for a
  // zeroed item (the one case that alerts regardless of a minimum) — every
  // other branch below is reachable only when `minQuantity` is actually set.
  if (item.minQuantity === null) return "Estoque zerado.";
  if (item.quantity === 0) {
    return `Estoque zerado (mínima definida: ${item.minQuantity}).`;
  }
  if (status === "critical") {
    return `Quantidade atual (${item.quantity}) está igual ou abaixo da mínima definida (${item.minQuantity}).`;
  }
  const threshold = lowStockWarningThreshold(item.minQuantity, lowStockPercent);
  return `Quantidade atual (${item.quantity}) está acima da mínima (${item.minQuantity}), mas dentro da faixa de atenção (até ${threshold}, ${lowStockPercent}% acima da mínima).`;
}

interface StockBadgeProps {
  item: Pick<ItemSummary, "quantity" | "minQuantity">;
  lowStockPercent: number;
}

/** "Sem estoque" é o mesmo estado crítico, só com texto diferente — não é um terceiro estado. */
export function StockBadge({ item, lowStockPercent }: StockBadgeProps) {
  const status = stockStatus(item, lowStockPercent);
  const label = status === "critical" && item.quantity === 0 ? "Sem estoque" : LABELS[status];
  const explanation = explain(item, status, lowStockPercent);
  const badge = (
    <span
      tabIndex={explanation ? 0 : undefined}
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary-soft ${TONE_CLASS[status]}`}
    >
      {label}
    </span>
  );

  return explanation ? <Tooltip text={explanation}>{badge}</Tooltip> : badge;
}
