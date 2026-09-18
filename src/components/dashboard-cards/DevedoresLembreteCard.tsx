import { Card } from "../Card";
import { fmtDate } from "../../lib/format";
import type { DashboardCardProps } from "./types";

/** Same overdue/upcoming window as Devedores' `ReminderBadge` — only clients
 * who still owe (`balance > 0`) show up here, see `docs/commands.md`'s
 * `get_dashboard_data`. */
export function DevedoresLembreteCard({ data }: DashboardCardProps) {
  return (
    <Card title="Devedores com lembrete" hint="próximo ou vencido" className="flex h-full flex-col">
      <div className="h-full overflow-y-auto">
        {data.remindersDue.length === 0 ? (
          <p className="text-sm text-theme-3">Nenhum lembrete próximo ou vencido.</p>
        ) : (
          <ul className="divide-y divide-theme-border text-sm">
            {data.remindersDue.map((r) => (
              <li key={r.clientId} className="flex items-center justify-between gap-2 py-1.5">
                <span className="truncate text-theme-1">{r.clientName}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    r.overdue ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"
                  }`}
                >
                  {r.overdue ? "Vencido" : "Lembrete"}: {fmtDate(r.reminderDate)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
