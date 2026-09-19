import { useEffect, useState } from "react";
import type { SaleDetail } from "../lib/api";
import { printFile, regenerateReceiptPdf } from "../lib/api";
import { PAYMENT_METHOD_LABEL, fmt, fmtDateTime } from "../lib/format";
import { Button } from "./Button";
import { Kbd } from "./Kbd";
import { Modal } from "./Modal";
import { logger } from "../logger";

interface ReceiptResultModalProps {
  sale: SaleDetail;
  /** Empty means the receipt falls back to "BORA VENDER" — same rule as the backend's PDF generation. */
  storeName: string;
  storeInfo: string;
  thankYouMessage: string;
  onNewSale: () => void;
}

/** Result screen after finalizing a sale — same reference as the "Recibo (PDF)"
 * mockup. The PDF may not exist yet if generation failed right after commit
 * (the sale stays valid either way) — printing regenerates it on demand.
 * Fully keyboard-driven by design: a single "Imprimir recibo?" Sim/Não
 * question instead of separate Imprimir/Abrir pasta/Nova venda buttons —
 * answering it *is* the last step, there's nothing left to do after either
 * choice but start the next sale. */
export function ReceiptResultModal({ sale, storeName, storeInfo, thankYouMessage, onNewSale }: ReceiptResultModalProps) {
  const [pdfPath, setPdfPath] = useState(sale.receiptPdfPath);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal's own Escape-to-close is off here (`dismissible={false}`, on
  // purpose — no accidental click-outside dismissal of a finished sale).
  // Neither key relies on a focused button's native Enter/Space activation
  // (no `autoFocus` below) — both are handled here, once, so a single
  // keypress can never double-fire through both this listener and a
  // button's own native activation.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onNewSale();
      } else if (e.key === "Enter") {
        e.stopPropagation();
        handlePrintAndContinue();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onNewSale, pdfPath, busy]);

  async function ensurePdf(): Promise<string | null> {
    if (pdfPath) return pdfPath;
    setBusy(true);
    setError(null);
    try {
      const path = await regenerateReceiptPdf(sale.id);
      setPdfPath(path);
      return path;
    } catch (err) {
      logger.error("falha ao gerar recibo em PDF", sale.id, err);
      setError("Não foi possível gerar o PDF do recibo.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  /** "Sim" — the sale already committed either way, so a print failure stays
   * on this screen (with the error shown) instead of silently moving on;
   * only a successful print advances to "Nova venda" automatically. */
  async function handlePrintAndContinue() {
    if (busy) return;
    const path = await ensurePdf();
    if (!path) return;
    setBusy(true);
    try {
      await printFile(path);
      onNewSale();
    } catch (err) {
      logger.error("falha ao imprimir recibo", sale.id, err);
      setError("Não foi possível imprimir o recibo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Venda concluída" dismissible={false}>
      <div className="rounded-lg border border-theme-border bg-theme-bg p-3 font-mono text-xs text-theme-1">
        <div className="text-center font-bold">
          {storeName || "BORA VENDER"}
          {storeInfo
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line, i) => (
              <div key={i} className="font-normal">
                {line}
              </div>
            ))}
          <div className="font-normal">Recibo de Venda</div>
        </div>
        <hr className="my-2 border-dashed border-theme-border" />
        <div>Recibo: {sale.receiptNumber}</div>
        <div>Data: {fmtDateTime(sale.createdAt)}</div>
        <div>Operador: {sale.userName}</div>
        {sale.clientName && <div>Cliente: {sale.clientName}</div>}
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
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{fmt(sale.subtotal)}</span>
        </div>
        {sale.discountAmount !== null && (
          <div className="flex justify-between">
            <span>Desconto geral{sale.discountPercent !== null ? ` (-${sale.discountPercent}%)` : ""}</span>
            <span>-{fmt(sale.discountAmount)}</span>
          </div>
        )}
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
              <span>Valor devido</span>
              <span>{fmt(sale.total - sale.creditPaid)}</span>
            </div>
          </>
        )}
        <hr className="my-2 border-dashed border-theme-border" />
        <div className="text-center">Forma de pagamento: {PAYMENT_METHOD_LABEL[sale.paymentMethod] ?? sale.paymentMethod}</div>
        <div className="mt-1 text-center">{thankYouMessage}</div>
      </div>

      {!pdfPath && !busy && <p className="mt-2 text-xs text-warning">PDF ainda não gerado — será gerado ao imprimir.</p>}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <div className="mt-4 flex items-center justify-center gap-3">
        <span className="text-sm font-semibold text-theme-1">{busy ? "Imprimindo…" : "Imprimir recibo?"}</span>
        <Button variant="secondary" onClick={onNewSale} disabled={busy}>
          Não <Kbd>Esc</Kbd>
        </Button>
        <Button variant="primary" onClick={handlePrintAndContinue} disabled={busy}>
          Sim <Kbd>Enter</Kbd>
        </Button>
      </div>
    </Modal>
  );
}
