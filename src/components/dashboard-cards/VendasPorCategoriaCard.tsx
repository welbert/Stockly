import { ArcElement, Chart as ChartJS, Tooltip } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { Card } from "../Card";
import { fmt } from "../../lib/format";
import { themeColor } from "../../theme";
import type { DashboardCardProps } from "./types";

ChartJS.register(ArcElement, Tooltip);

const NEUTRAL = "#d7dae2";

function palette(): string[] {
  return [
    themeColor("--color-primary", "#4f46e5"),
    themeColor("--color-info", "#0891b2"),
    themeColor("--color-success", "#16a34a"),
    themeColor("--color-warning", "#d97706"),
    themeColor("--color-danger", "#dc2626"),
  ];
}

export function VendasPorCategoriaCard({ data }: DashboardCardProps) {
  const categories = data.salesByCategory;
  if (categories.length === 0) {
    return (
      <Card title="Vendas por categoria" hint="mês atual" className="flex h-full flex-col items-center justify-center">
        <p className="text-sm text-theme-3">Nenhuma venda no mês ainda.</p>
      </Card>
    );
  }

  const colors = palette();
  const labels = categories.map((c) => c.categoryName ?? "Categoria indefinida");
  const values = categories.map((c) => c.total);
  const total = values.reduce((sum, v) => sum + v, 0);
  const sliceColors = categories.map((c, i) => (c.categoryName === null ? NEUTRAL : colors[i % colors.length]));

  return (
    <Card title="Vendas por categoria" hint="mês atual" className="flex h-full flex-col">
      <div className="flex h-full items-center gap-4">
        <div className="relative h-[110px] w-[110px] shrink-0">
          <Doughnut
            data={{ labels, datasets: [{ data: values, backgroundColor: sliceColors, borderWidth: 0 }] }}
            options={{
              cutout: "62%",
              animation: { duration: 250 },
              plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${fmt(ctx.parsed as number)}` } },
              },
            }}
          />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5 overflow-y-auto">
          {categories.map((c, i) => (
            <div key={labels[i]} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex min-w-0 items-center gap-1.5 truncate text-theme-3">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: sliceColors[i] }} />
                <span className="truncate">{labels[i]}</span>
              </span>
              <span className="shrink-0 font-semibold text-theme-1">{total > 0 ? `${Math.round((c.total / total) * 100)}%` : "0%"}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
