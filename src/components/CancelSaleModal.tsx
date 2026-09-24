import { FormEvent, useEffect, useState } from "react";
import type { ClientDetail, SaleDetail, UserSummary } from "../lib/api";
import { cancelSale, getClientDetail, round2, verifyPassword } from "../lib/api";
import { fmt } from "../lib/format";
import { logger } from "../logger";
import { Button } from "./Button";
import { Kbd } from "./Kbd";
import { Modal } from "./Modal";

interface CancelSaleModalProps {
  sale: SaleDetail;
  /** `true` when the logged-in user isn't Admin — asks for a *different*
   * admin's password, same pattern as `DiscountModal`/`CancelCreditPaymentModal`.
   * A logged-in Admin self-authorizes instead. */
  requiresAuth: boolean;
  admins: UserSummary[];
  onCancelled: (sale: SaleDetail) => void;
  onClose: () => void;
}

/** Cancels/estorna a completed sale — never deleted, just flipped to
 * `status: 'cancelled'` with who requested/authorized it. Returns stock and,
 * for a Crediário sale,
 * drops its own total off the client's balance (see `commands::sales::cancel_sale`) —
 * fetches the client's current balance (`getClientDetail`) just to spell out
 * the exact before/after in the confirmation text, same reasoning as
 * `CancelCreditPaymentModal`. Any amount already paid on this sale isn't
 * reversed — it becomes floating credit for the client, called out separately
 * when `sale.creditPaid` is set. No "motivo" field here, unlike cancelling a
 * Crediário payment, this action doesn't ask for one. */
export function CancelSaleModal({ sale, requiresAuth, admins, onCancelled, onClose }: CancelSaleModalProps) {
  const [adminId, setAdminId] = useState(admins[0]?.id ?? 0);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Only fetched for a Crediário sale, to spell out the exact before/after
  // balance instead of leaving the operator to do the math themselves.
  const [client, setClient] = useState<ClientDetail | null>(null);

  useEffect(() => {
    // Only meaningful for a Crediário sale — a client identified on a
    // Dinheiro/Cartão/PIX sale (optional, see `PaymentModal`) has no debt
    // for cancelling this sale to reduce, so there's nothing to fetch.
    if (sale.clientId === null || sale.paymentMethod !== "credit") return;
    getClientDetail(sale.clientId)
      .then(setClient)
      .catch((err) => logger.error("falha ao carregar detalhe do cliente", sale.clientId, err));
  }, [sale.clientId, sale.paymentMethod]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (requiresAuth) {
        if (!password) {
          setError("Senha do administrador é obrigatória");
          setSubmitting(false);
          return;
        }
        const ok = await verifyPassword(adminId, password);
        if (!ok) {
          setError("Senha incorreta");
          setSubmitting(false);
          return;
        }
      }
      const updated = await cancelSale({
        saleId: sale.id,
        authorizerId: requiresAuth ? adminId : null,
        authorizerPassword: requiresAuth ? password : null,
      });
      onCancelled(updated);
    } catch (err) {
      logger.error("falha ao cancelar venda", sale.id, err);
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Cancelar venda #${sale.receiptNumber}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <p className="text-sm text-theme-2">
          {sale.paymentMethod === "credit" ? (
            client ? (
              <>
                Essa ação vai reduzir o débito de <span className="font-semibold text-theme-1">{sale.clientName}</span> de{" "}
                <span className="font-semibold text-theme-1">{fmt(client.balance)}</span> para{" "}
                <span className="font-semibold text-theme-1">{fmt(round2(client.balance - sale.total))}</span>, já que a
                venda de <span className="font-semibold text-theme-1">{fmt(sale.total)}</span> será cancelada, e devolve os
                itens ao estoque.
              </>
            ) : (
              <>Devolve os itens ao estoque e reduz o débito de {sale.clientName}.</>
            )
          ) : (
            <>Devolve os itens ao estoque{sale.clientName ? ` (venda identificada para ${sale.clientName})` : ""}.</>
          )}
        </p>
        {sale.creditPaid !== null && (
          <p className="mt-2 text-xs text-theme-3">
            O valor de {fmt(sale.creditPaid)} já pago nessa venda não é estornado — vira saldo credor de {sale.clientName}.
          </p>
        )}
        <p className="mt-2 text-sm text-theme-2">
          O histórico da venda não é apagado — só fica marcado como cancelada. Essa ação não pode ser desfeita.
        </p>

        {requiresAuth && (
          <>
            <hr className="my-4 border-theme-border" />
            <label className="mb-1 block text-xs font-semibold text-theme-3">Senha do administrador</label>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-w-0 flex-[2] rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
              />
              <select
                value={adminId}
                onChange={(e) => setAdminId(Number(e.target.value))}
                className="flex-1 rounded-lg border border-theme-border bg-theme-bg px-2 py-2 text-sm text-theme-1 outline-none"
              >
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {error && <p className="mt-2 text-xs text-danger">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Voltar <Kbd>Esc</Kbd>
          </Button>
          <Button type="submit" variant="danger" disabled={submitting || (requiresAuth && admins.length === 0)}>
            Cancelar / estornar venda
          </Button>
        </div>
        {requiresAuth && admins.length === 0 && (
          <p className="mt-2 text-xs text-danger">Nenhum administrador ativo cadastrado para autorizar.</p>
        )}
      </form>
    </Modal>
  );
}
