import { FormEvent, useState } from "react";
import type { ClientDetail, ClientSummary, CreditSaleSummary, SaleItemDetail } from "../lib/api";
import { getSaleDetail, registerCreditPayment, round2 } from "../lib/api";
import { fmt } from "../lib/format";
import { logger } from "../logger";
import { Button } from "./Button";
import { Kbd } from "./Kbd";
import { Modal } from "./Modal";
import { MoneyInput } from "./MoneyInput";

interface CreditPaymentModalProps {
  client: ClientSummary;
  /** The sales checked in "Vendas em Crediário" — always `remaining > 0`, the
   * caller never lets a quitada/cancelada row be selectable. */
  selectedSales: CreditSaleSummary[];
  onSaved: (client: ClientDetail) => void;
  onClose: () => void;
}

/** Pays off 1+ selected Crediário sales at once — no admin password required,
 * same as registering the Crediário sale itself. If the amount doesn't cover
 * the sum of the selected sales, asks which one absorbs the difference
 * (every other selected sale is paid off in full). With a single sale
 * selected there's nothing to choose, so that sale is the residual one
 * automatically. */
export function CreditPaymentModal({ client, selectedSales, onSaved, onClose }: CreditPaymentModalProps) {
  const sumRemaining = round2(selectedSales.reduce((sum, s) => sum + s.remaining, 0));
  const [amount, setAmount] = useState(0);
  const [residualSaleId, setResidualSaleId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Accordion state for the "which sale is this" peek below — only one open
  // at a time, items fetched lazily on first expand and cached per sale id
  // for the rest of the modal's lifetime.
  const [expandedSaleId, setExpandedSaleId] = useState<number | null>(null);
  const [itemsBySale, setItemsBySale] = useState<Record<number, SaleItemDetail[]>>({});
  const [loadingSaleId, setLoadingSaleId] = useState<number | null>(null);

  const shortfall = round2(sumRemaining - amount);
  const needsResidualChoice = shortfall > 0 && selectedSales.length > 1;
  const effectiveResidualId = selectedSales.length === 1 ? selectedSales[0].saleId : residualSaleId;

  async function toggleExpand(saleId: number) {
    if (expandedSaleId === saleId) {
      setExpandedSaleId(null);
      return;
    }
    setExpandedSaleId(saleId);
    if (itemsBySale[saleId]) return;
    setLoadingSaleId(saleId);
    try {
      const detail = await getSaleDetail(saleId);
      setItemsBySale((prev) => ({ ...prev, [saleId]: detail.items }));
    } catch (err) {
      logger.error("falha ao carregar os itens da venda", saleId, err);
    } finally {
      setLoadingSaleId(null);
    }
  }

  async function submit(value: number) {
    if (value <= 0) return;
    if (shortfall > 0 && effectiveResidualId === null) {
      setError("Selecione qual venda fica com o saldo residual");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const updated = await registerCreditPayment({
        clientId: client.id,
        saleIds: selectedSales.map((s) => s.saleId),
        amount: value,
        residualSaleId: shortfall > 0 ? effectiveResidualId : null,
      });
      onSaved(updated);
    } catch (err) {
      logger.error("falha ao registrar pagamento", client.id, selectedSales.map((s) => s.saleId), err);
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit(amount);
  }

  const invalid = amount <= 0 || (shortfall > 0 && effectiveResidualId === null);

  return (
    <Modal
      title={`Registrar pagamento — ${selectedSales.length === 1 ? "1 venda" : `${selectedSales.length} vendas`} selecionada${selectedSales.length === 1 ? "" : "s"}`}
      onClose={submitting ? undefined : onClose}
    >
      <form onSubmit={handleSubmit}>
        <div className="mb-3 overflow-hidden rounded-lg border border-theme-border">
          {selectedSales.map((s) => {
            const expanded = expandedSaleId === s.saleId;
            return (
              <div key={s.saleId} className="border-b border-theme-border last:border-0">
                <button
                  type="button"
                  onClick={() => toggleExpand(s.saleId)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-theme-hover"
                >
                  <span className="flex items-center gap-1.5">
                    <span className={`inline-block transition-transform ${expanded ? "rotate-90" : ""}`}>›</span>
                    <code>{s.receiptNumber}</code>
                  </span>
                  <span className="text-theme-1">{fmt(s.remaining)}</span>
                </button>
                {expanded && (
                  <div className="border-t border-theme-border bg-theme-bg px-3 py-2">
                    {loadingSaleId === s.saleId && <p className="text-xs text-theme-3">Carregando…</p>}
                    {itemsBySale[s.saleId]?.map((item, i) => (
                      <div key={i} className="flex justify-between gap-2 py-0.5 text-xs text-theme-1">
                        <span>
                          {item.itemName} {item.quantity}x
                          {item.discountPercent !== null
                            ? ` (-${item.discountPercent}%)`
                            : item.discountAmount !== null
                              ? ` (-${fmt(item.discountAmount)})`
                              : ""}
                        </span>
                        <span>{fmt(item.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex justify-between bg-theme-hover px-3 py-2 text-xs font-bold">
            <span>Total selecionado</span>
            <span>{fmt(sumRemaining)}</span>
          </div>
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-[2]">
            <label className="mb-1 block text-xs font-semibold text-theme-3">Valor do pagamento (máx. {fmt(sumRemaining)})</label>
            <MoneyInput value={amount} onChange={setAmount} max={sumRemaining} autoFocus />
          </div>
          <Button type="button" variant="secondary" className="flex-1" onClick={() => setAmount(sumRemaining)}>
            Quitar tudo
          </Button>
        </div>

        {needsResidualChoice && (
          <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
            <p className="mb-2 text-xs font-semibold text-warning">
              Faltam {fmt(shortfall)} — qual venda fica com o saldo residual?
            </p>
            <div className="flex flex-col gap-1.5">
              {selectedSales.map((s) => {
                const leftover = round2(s.remaining - shortfall);
                const disabled = leftover < 0;
                return (
                  <label
                    key={s.saleId}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                      disabled
                        ? "cursor-not-allowed border-theme-border opacity-50"
                        : residualSaleId === s.saleId
                          ? "border-primary bg-primary-soft"
                          : "cursor-pointer border-theme-border bg-theme-surface"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="residual-sale"
                        disabled={disabled}
                        checked={residualSaleId === s.saleId}
                        onChange={() => setResidualSaleId(s.saleId)}
                      />
                      <code>{s.receiptNumber}</code> ({fmt(s.remaining)})
                    </span>
                    {!disabled && <span className="text-theme-3">ficaria com {fmt(leftover)} em aberto</span>}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancelar <Kbd>Esc</Kbd>
          </Button>
          <Button type="submit" variant="primary" disabled={submitting || invalid}>
            Confirmar pagamento <Kbd>Enter</Kbd>
          </Button>
        </div>
      </form>
    </Modal>
  );
}
