import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { ClientDetail, ClientSummary, CreditPaymentSummary, UserSummary } from "../lib/api";
import { getClientDetail, listAdmins, listClients } from "../lib/api";
import { Button } from "../components/Button";
import { CancelCreditPaymentModal } from "../components/CancelCreditPaymentModal";
import { Card } from "../components/Card";
import { Checkbox } from "../components/Checkbox";
import { ClientFormModal } from "../components/ClientFormModal";
import { CreditPaymentModal } from "../components/CreditPaymentModal";
import { SaleDetailModal } from "../components/SaleDetailModal";
import { fmt, fmtDate, fmtDateFull, fmtDateTime, normalize } from "../lib/format";
import { logger } from "../logger";

type SortBy = "reminder" | "name" | "balance";

/** Reminders inside this window get the yellow "coming up" badge; anything
 * further out (or without a date) is plain text — v1 threshold, not spelled
 * out in `Plans/PLANO.md`. */
const REMINDER_WARNING_DAYS = 7;

function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function ReminderBadge({ reminderDate }: { reminderDate: string | null }) {
  if (!reminderDate) return <span className="text-theme-3">Sem lembrete</span>;
  const days = daysUntil(reminderDate);
  if (days < 0) {
    return <span className="rounded-full bg-danger/10 px-2 py-0.5 font-semibold text-danger">Vencido: {fmtDate(reminderDate)}</span>;
  }
  if (days <= REMINDER_WARNING_DAYS) {
    return <span className="rounded-full bg-warning/10 px-2 py-0.5 font-semibold text-warning">Lembrete: {fmtDate(reminderDate)}</span>;
  }
  return <span className="text-theme-3">Lembrete: {fmtDate(reminderDate)}</span>;
}

export function DevedoresPage() {
  const { user } = useAuth();
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [admins, setAdmins] = useState<UserSummary[]>([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("reminder");
  const [showSettled, setShowSettled] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<ClientDetail | null>(null);
  const [editing, setEditing] = useState<ClientSummary | "new" | null>(null);
  const [paying, setPaying] = useState<ClientSummary | null>(null);
  const [viewingSaleId, setViewingSaleId] = useState<number | null>(null);
  const [cancelingPayment, setCancelingPayment] = useState<CreditPaymentSummary | null>(null);

  function reloadList() {
    listClients()
      .then(setClients)
      .catch((err) => logger.error("falha ao listar clientes", err));
  }

  useEffect(reloadList, []);
  useEffect(() => {
    listAdmins()
      .then(setAdmins)
      .catch((err) => logger.error("falha ao listar administradores", err));
  }, []);

  useEffect(() => {
    if (selectedId === null) {
      setSelected(null);
      return;
    }
    getClientDetail(selectedId)
      .then(setSelected)
      .catch((err) => logger.error("falha ao carregar detalhe do devedor", err));
  }, [selectedId]);

  /** The stat cards always look only at real debtors (open balance),
   * regardless of the "Mostrar quitados" checkbox below — that checkbox only
   * affects what shows up in the list/search. */
  const debtors = useMemo(() => clients.filter((c) => c.balance > 0), [clients]);

  const listedClients = showSettled ? clients : debtors;

  const filtered = useMemo(() => {
    const term = normalize(search.trim());
    const list = listedClients.filter(
      (c) => !term || normalize(c.name).includes(term) || (c.phone && normalize(c.phone).includes(term)),
    );
    return [...list].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name, "pt-BR");
      if (sortBy === "balance") return b.balance - a.balance;
      if (!a.reminderDate && !b.reminderDate) return a.name.localeCompare(b.name, "pt-BR");
      if (!a.reminderDate) return 1;
      if (!b.reminderDate) return -1;
      return a.reminderDate.localeCompare(b.reminderDate);
    });
  }, [listedClients, search, sortBy]);

  const totalOpen = useMemo(() => debtors.reduce((sum, c) => sum + c.balance, 0), [debtors]);
  const overdueCount = useMemo(() => debtors.filter((c) => c.reminderDate && daysUntil(c.reminderDate) < 0).length, [debtors]);

  function handleClientSaved(client: ClientSummary) {
    setEditing(null);
    reloadList();
    if (selectedId === client.id) {
      // `setSelectedId` with the same id doesn't re-trigger the effect that
      // fetches the detail (React bails out, same value) — without this,
      // editing the already-selected debtor left `selected` with stale data.
      getClientDetail(client.id)
        .then(setSelected)
        .catch((err) => logger.error("falha ao recarregar detalhe do devedor", err));
    } else {
      setSelectedId(client.id);
    }
  }

  if (!user) return null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          placeholder="Buscar devedor por nome ou telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[220px] max-w-[340px] flex-1 rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="max-w-[240px] rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-1 outline-none"
        >
          <option value="reminder">Ordenar por lembrete (mais próximo)</option>
          <option value="name">Ordenar por nome</option>
          <option value="balance">Ordenar por saldo (maior)</option>
        </select>
        <div className="rounded-lg border border-theme-border bg-theme-surface px-3 py-2">
          <Checkbox label="Mostrar quitados" checked={showSettled} onChange={setShowSettled} />
        </div>
        <div className="flex-1" />
        <Button variant="primary" onClick={() => setEditing("new")}>
          + Novo devedor
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-4">
        <Card>
          <div className="text-xs font-semibold text-theme-3">Total em aberto</div>
          <div className="mt-1 text-2xl font-bold text-theme-1">{fmt(totalOpen)}</div>
        </Card>
        <Card>
          <div className="text-xs font-semibold text-theme-3">Devedores ativos</div>
          <div className="mt-1 text-2xl font-bold text-theme-1">{debtors.length}</div>
        </Card>
        <Card>
          <div className="text-xs font-semibold text-theme-3">Lembretes vencidos</div>
          <div className={`mt-1 text-2xl font-bold ${overdueCount > 0 ? "text-danger" : "text-theme-1"}`}>{overdueCount}</div>
        </Card>
      </div>

      <div className="grid grid-cols-[340px_1fr] items-start gap-4">
        <Card title="Devedores" hint={sortBy === "reminder" ? "ordenado por lembrete" : undefined}>
          <div className="-m-5 flex flex-col">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`border-b border-theme-border px-5 py-3 text-left last:border-0 ${
                  selectedId === c.id ? "bg-primary-soft" : "hover:bg-theme-hover"
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-theme-1">{c.name}</span>
                  {c.balance > 0 ? (
                    <span className="text-sm font-bold text-theme-1">{fmt(c.balance)}</span>
                  ) : (
                    <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">Quitado</span>
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-theme-3">
                  <span>{c.phone || "Sem telefone"}</span>
                  <ReminderBadge reminderDate={c.reminderDate} />
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-5 py-6 text-center text-sm text-theme-3">
                {showSettled ? "Nenhum cliente encontrado." : "Nenhum devedor encontrado."}
              </p>
            )}
          </div>
        </Card>

        {selected ? (
          <Card
            title={selected.name}
            hint={[selected.phone, selected.reminderDate ? `Lembrete: ${fmtDateFull(selected.reminderDate)}` : null]
              .filter(Boolean)
              .join(" · ")}
          >
            <div className="mb-4 flex items-end justify-between border-b border-theme-border pb-3.5">
              <div>
                <div className="text-xs text-theme-3">Saldo em aberto</div>
                <div className="text-2xl font-bold text-theme-1">{fmt(selected.balance)}</div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setEditing(selected)}>
                  Editar cliente
                </Button>
                <Button variant="primary" disabled={selected.balance <= 0} onClick={() => setPaying(selected)}>
                  Registrar pagamento
                </Button>
              </div>
            </div>

            <div className="mb-1.5 text-xs font-semibold text-theme-3">Vendas em Crediário</div>
            <table className="mb-4 w-full text-sm">
              <thead>
                <tr className="border-b border-theme-border text-left text-xs uppercase tracking-wide text-theme-3">
                  <th className="py-2">Recibo</th>
                  <th className="py-2">Data</th>
                  <th className="py-2">Valor</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {selected.creditSales.map((s) => (
                  <tr key={s.saleId} className="border-b border-theme-border last:border-0">
                    <td className="py-2">
                      <code className="text-xs">{s.receiptNumber}</code>
                    </td>
                    <td className="py-2 text-theme-1">{fmtDateTime(s.createdAt)}</td>
                    <td className="py-2 text-theme-1">{fmt(s.total)}</td>
                    <td className="py-2 text-right">
                      <Button variant="ghost" onClick={() => setViewingSaleId(s.saleId)}>
                        Ver venda
                      </Button>
                    </td>
                  </tr>
                ))}
                {selected.creditSales.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-3 text-center text-theme-3">
                      Nenhuma venda em Crediário ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="mb-1.5 text-xs font-semibold text-theme-3">Pagamentos registrados</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-theme-border text-left text-xs uppercase tracking-wide text-theme-3">
                  <th className="py-2">Data</th>
                  <th className="py-2">Valor</th>
                  <th className="py-2">Operador</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {selected.payments.map((p) => (
                  <tr key={p.id} className="border-b border-theme-border last:border-0">
                    <td className="py-2 text-theme-1">{fmtDateTime(p.createdAt)}</td>
                    <td className={`py-2 ${p.cancelledAt ? "text-theme-3 line-through" : "text-theme-1"}`}>{fmt(p.amount)}</td>
                    <td className="py-2 text-theme-1">{p.userName}</td>
                    <td className="py-2 text-right">
                      {p.cancelledAt ? (
                        <span className="text-xs text-theme-3">
                          Pagamento cancelado em {fmtDateTime(p.cancelledAt)} por {p.cancelledByName}
                          {p.cancelAuthorizedByName && p.cancelAuthorizedByName !== p.cancelledByName
                            ? ` (autorizado por ${p.cancelAuthorizedByName})`
                            : ""}{" "}
                          devido a {p.cancelReason}
                        </span>
                      ) : (
                        <Button variant="ghost" className="text-danger" onClick={() => setCancelingPayment(p)}>
                          Cancelar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {selected.payments.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-3 text-center text-theme-3">
                      Nenhum pagamento registrado ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        ) : (
          <Card>
            <p className="text-center text-sm text-theme-3">Selecione um devedor à esquerda pra ver o detalhe.</p>
          </Card>
        )}
      </div>

      {editing && (
        <ClientFormModal
          initial={editing === "new" ? undefined : editing}
          admins={admins}
          onSaved={handleClientSaved}
          onClose={() => setEditing(null)}
        />
      )}

      {paying && (
        <CreditPaymentModal
          client={paying}
          onSaved={(updated) => {
            setPaying(null);
            reloadList();
            // A full payoff drops out of the left list (unless "Mostrar
            // quitados" is on) — the detail on the right needs to clear too
            // in that case, or it'd keep showing the debtor view of a client
            // who isn't one anymore.
            if (updated.balance > 0 || showSettled) setSelected(updated);
            else setSelectedId(null);
          }}
          onClose={() => setPaying(null)}
        />
      )}

      {viewingSaleId !== null && <SaleDetailModal saleId={viewingSaleId} onClose={() => setViewingSaleId(null)} />}

      {cancelingPayment && (
        <CancelCreditPaymentModal
          payment={cancelingPayment}
          requiresAuth={!user.isAdmin}
          admins={admins}
          onCancelled={(updated) => {
            setCancelingPayment(null);
            setSelected(updated);
            reloadList();
          }}
          onClose={() => setCancelingPayment(null)}
        />
      )}
    </div>
  );
}
