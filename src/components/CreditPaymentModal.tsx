import { FormEvent, useState } from "react";
import type { ClientDetail, ClientSummary } from "../lib/api";
import { registerCreditPayment } from "../lib/api";
import { fmt } from "../lib/format";
import { logger } from "../logger";
import { Button } from "./Button";
import { Kbd } from "./Kbd";
import { Modal } from "./Modal";
import { MoneyInput } from "./MoneyInput";

interface CreditPaymentModalProps {
  client: ClientSummary;
  onSaved: (client: ClientDetail) => void;
  onClose: () => void;
}

/** Partial or total payoff — no admin password required (see "Crediário e
 * Devedores" in `Plans/PLANO.md`). */
export function CreditPaymentModal({ client, onSaved, onClose }: CreditPaymentModalProps) {
  const [amount, setAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(value: number) {
    if (value <= 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await registerCreditPayment(client.id, value);
      onSaved(updated);
    } catch (err) {
      logger.error("falha ao registrar pagamento", err);
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit(amount);
  }

  const invalid = amount <= 0;

  return (
    <Modal title={`Registrar pagamento — ${client.name}`} onClose={submitting ? undefined : onClose}>
      <form onSubmit={handleSubmit}>
        <p className="mb-3 text-xs text-theme-3">
          Saldo em aberto: <span className="font-semibold text-theme-1">{fmt(client.balance)}</span>
        </p>
        <div className="flex items-end gap-2">
          <div className="flex-[2]">
            <label className="mb-1 block text-xs font-semibold text-theme-3">Valor recebido</label>
            <MoneyInput value={amount} onChange={setAmount} max={client.balance} autoFocus />
          </div>
          <Button type="button" variant="secondary" className="flex-1" onClick={() => setAmount(client.balance)}>
            Quitar tudo
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancelar <Kbd>Esc</Kbd>
          </Button>
          <Button type="submit" variant="primary" disabled={submitting || invalid}>
            Registrar pagamento <Kbd>Enter</Kbd>
          </Button>
        </div>
      </form>
    </Modal>
  );
}
