import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, Tooltip } from "chart.js";
import { Bar } from "react-chartjs-2";
import { Card } from "../Card";
import { fmt, fmtDate } from "../../lib/format";
import { themeColor } from "../../theme";
import type { DashboardCardProps } from "./types";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

export function VendasPorPeriodoCard({ data }: DashboardCardProps) {
  const accent = themeColor("--color-primary", "#4f46e5");
  const days = data.salesLast7Days;

  return (
    <Card title="Vendas por período" hint="últimos 7 dias" className="flex h-full flex-col">
      <div className="h-full">
        <Bar
          data={{
            labels: days.map((d) => fmtDate(d.date)),
            datasets: [{ data: days.map((d) => d.total), backgroundColor: accent, borderRadius: 4, maxBarThickness: 40 }],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 250 },
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (ctx) => ` ${fmt(ctx.parsed.y as number)}` } },
            },
            scales: {
              x: { grid: { display: false } },
              y: { beginAtZero: true, ticks: { callback: (v) => fmt(Number(v)) } },
            },
          }}
        />
      </div>
    </Card>
  );
}
