import { useEffect, useState } from "react";
import type { SaleDetail, UserSummary } from "../lib/api";
import { getSaleDetail } from "../lib/api";
import { PAYMENT_METHOD_LABEL, fmt, fmtDateTime } from "../lib/format";
import { logger } from "../logger";
import { Button } from "./Button";
import { CancelSaleModal } from "./CancelSaleModal";
import { Modal } from "./Modal";

interface SaleDetailModalProps {
  saleId: number;
  admins: UserSummary[];
  requiresAuth: boolean;
  onClose: () => void;
  /** Lets the caller (Devedores/Histórico de vendas) refresh its own list
   * once a cancellation actually goes through — this modal only owns its own
   * copy of the sale. */
  onCancelled?: () => void;
}

/** "Ver venda" — opened from a debtor's history (Devedores screen) or from
 * Histórico de vendas. Shows "Cancelar/estornar venda" for a still-completed
 * sale (`Plans/PLANO.md`'s "Cancelamento / Estorno de venda"), or a banner
 * with who cancelled/authorized it once it's already been reversed. */
export function SaleDetailModal({ saleId, admins, requiresAuth, onClose, onCancelled }: SaleDetailModalProps) {
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  function reload() {
    getSaleDetail(saleId)
      .then(setSale)
      .catch((err) => {
        logger.error("falha ao carregar detalhe da venda", saleId, err);
        setError(String(err));
      });
  }

  useEffect(reload, [saleId]);

  return (
    <>
      <Modal title={sale ? `Venda #${sale.receiptNumber}` : "Venda"} onClose={onClose}>
        {error && <p className="text-xs text-danger">{error}</p>}
        {!sale && !error && <p className="text-sm text-theme-3">Carregando…</p>}
        {sale && (
          <div className="rounded-lg border border-theme-border bg-theme-bg p-3 font-mono text-xs text-theme-1">
            <div>Recibo: {sale.receiptNumber}</div>
            <div>Data: {fmtDateTime(sale.createdAt)}</div>
            <div>Operador: {sale.userName}</div>
            {sale.clientName && <div>Cliente (Crediário): {sale.clientName}</div>}
            <hr className="my-2 border-dashed border-theme-border" />
            {sale.items.map((item, i) => (
              <div key={i} className="flex justify-between gap-2">
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
            <hr className="my-2 border-dashed border-theme-border" />
            <div className="flex justify-between font-bold">
              <span>TOTAL</span>
              <span>{fmt(sale.total)}</span>
            </div>
            {sale.creditPaid !== null && (
              <>
                <div className="flex justify-between">
                  <span>Valor pago</span>
                  <span>{fmt(sale.creditPaid)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Saldo Crediário</span>
                  <span>{fmt(sale.total - sale.creditPaid)}</span>
                </div>
              </>
            )}
            <div className="mt-1 text-center">
              Forma de pagamento: {PAYMENT_METHOD_LABEL[sale.paymentMethod] ?? sale.paymentMethod}
            </div>
          </div>
        )}

        {sale?.status === "cancelled" && (
          <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
            Venda cancelada em {fmtDateTime(sale.cancelledAt!)} por {sale.cancelledByName}
            {sale.cancelAuthorizedByName && sale.cancelAuthorizedByName !== sale.cancelledByName
              ? ` (autorizado por ${sale.cancelAuthorizedByName})`
              : ""}
            .
          </p>
        )}

        <div className="mt-4 flex justify-between gap-2">
          {sale?.status === "completed" ? (
            <Button variant="danger" onClick={() => setCancelling(true)}>
              Cancelar / estornar venda
            </Button>
          ) : (
            <span />
          )}
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </Modal>

      {cancelling && sale && (
        <CancelSaleModal
          sale={sale}
          requiresAuth={requiresAuth}
          admins={admins}
          onCancelled={(updated) => {
            setCancelling(false);
            setSale(updated);
            onCancelled?.();
          }}
          onClose={() => setCancelling(false)}
        />
      )}
    </>
  );
}
