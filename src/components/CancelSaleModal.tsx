import { FormEvent, useState } from "react";
import type { SaleDetail, UserSummary } from "../lib/api";
import { cancelSale, verifyPassword } from "../lib/api";
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
 * `status: 'cancelled'` with who requested/authorized it (`Plans/PLANO.md`'s
 * "Cancelamento / Estorno de venda"). Returns stock and, for a Crediário
 * sale, reverses the client's open balance too (see `commands::sales::cancel_sale`) —
 * no "motivo" field here, unlike cancelling a Crediário payment, since PLANO.md
 * doesn't ask for one on this action. */
export function CancelSaleModal({ sale, requiresAuth, admins, onCancelled, onClose }: CancelSaleModalProps) {
  const [adminId, setAdminId] = useState(admins[0]?.id ?? 0);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      logger.error("falha ao cancelar venda", err);
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Cancelar venda #${sale.receiptNumber}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <p className="text-sm text-theme-2">
          Devolve os itens ao estoque{sale.clientName ? ` e reverte o saldo em Crediário de ${sale.clientName}` : ""}. O
          histórico da venda não é apagado — só fica marcado como cancelada. Essa ação não pode ser desfeita.
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
