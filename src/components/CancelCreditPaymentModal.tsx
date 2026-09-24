import { FormEvent, useState } from "react";
import type { ClientDetail, ClientSummary, CreditPaymentSummary, UserSummary } from "../lib/api";
import { cancelCreditPayment, round2, verifyPassword } from "../lib/api";
import { fmt, fmtDateTime } from "../lib/format";
import { logger } from "../logger";
import { Button } from "./Button";
import { Kbd } from "./Kbd";
import { Modal } from "./Modal";

interface CancelCreditPaymentModalProps {
  payment: CreditPaymentSummary;
  client: ClientSummary;
  /** `true` when the logged-in user isn't Admin — asks for a *different*
   * admin's password, same pattern as `DiscountModal`. A logged-in Admin
   * self-authorizes instead. */
  requiresAuth: boolean;
  admins: UserSummary[];
  onCancelled: (client: ClientDetail) => void;
  onClose: () => void;
}

/** Cancels (soft-delete) a payment registered by mistake — never deleted,
 * just marked with who cancelled it and why (see "Pagamentos registrados" in
 * `ClientsPage`). Reverses a financial entry, so it requires admin
 * authorization, unlike registering the payment itself. */
export function CancelCreditPaymentModal({ payment, client, requiresAuth, admins, onCancelled, onClose }: CancelCreditPaymentModalProps) {
  const balanceAfter = round2(client.balance + payment.amount);
  const [reason, setReason] = useState("");
  const [adminId, setAdminId] = useState(admins[0]?.id ?? 0);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!reason.trim()) {
      setError("Motivo é obrigatório");
      return;
    }
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
      const updated = await cancelCreditPayment({
        paymentId: payment.id,
        reason: reason.trim(),
        authorizerId: requiresAuth ? adminId : null,
        authorizerPassword: requiresAuth ? password : null,
      });
      onCancelled(updated);
    } catch (err) {
      logger.error("falha ao cancelar pagamento", payment.id, err);
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Cancelar pagamento" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <p className="mb-3 text-sm text-theme-2">
          Essa ação vai aumentar o débito de <span className="font-semibold text-theme-1">{client.name}</span> para{" "}
          <span className="font-semibold text-theme-1">{fmt(balanceAfter)}</span>, já que você está cancelando o pagamento
          de <span className="font-semibold text-theme-1">{fmt(payment.amount)}</span>.
        </p>
        <p className="mb-3 text-xs text-theme-3">
          {fmtDateTime(payment.createdAt)} · registrado por {payment.userName}
        </p>

        <label className="mb-1 block text-xs font-semibold text-theme-3">Motivo *</label>
        <textarea
          required
          autoFocus
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex.: valor digitado errado"
          className="w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
        />

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
            Cancelar pagamento
          </Button>
        </div>
        {requiresAuth && admins.length === 0 && (
          <p className="mt-2 text-xs text-danger">Nenhum administrador ativo cadastrado para autorizar.</p>
        )}
      </form>
    </Modal>
  );
}
