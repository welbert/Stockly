import { useEffect, useState } from "react";
import type { SaleDetail } from "../lib/api";
import { getSaleDetail } from "../lib/api";
import { fmt, fmtDateTime } from "../lib/format";
import { logger } from "../logger";
import { Button } from "./Button";
import { Modal } from "./Modal";

const PAYMENT_LABEL: Record<string, string> = { cash: "Dinheiro", card: "Cartão", pix: "PIX", credit: "Crediário" };

interface SaleDetailModalProps {
  saleId: number;
  onClose: () => void;
}

/** "Ver venda" — opened from a debtor's history (Devedores screen), without
 * leaving the client's screen. Read-only for now: cancel/estorno lands with
 * the Histórico de vendas slice (next on the roadmap). */
export function SaleDetailModal({ saleId, onClose }: SaleDetailModalProps) {
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSaleDetail(saleId)
      .then(setSale)
      .catch((err) => {
        logger.error("falha ao carregar detalhe da venda", err);
        setError(String(err));
      });
  }, [saleId]);

  return (
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
          {sale.creditPaidNow !== null && (
            <>
              <div className="flex justify-between">
                <span>Valor pago agora</span>
                <span>{fmt(sale.creditPaidNow)}</span>
              </div>
              <div className="flex justify-between">
                <span>Saldo Crediário</span>
                <span>{fmt(sale.total - sale.creditPaidNow)}</span>
              </div>
            </>
          )}
          <div className="mt-1 text-center">Forma de pagamento: {PAYMENT_LABEL[sale.paymentMethod] ?? sale.paymentMethod}</div>
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </Modal>
  );
}
