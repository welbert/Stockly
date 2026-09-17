import { useEffect, useState } from "react";
import type { SaleDetail } from "../lib/api";
import { openReceiptsFolder, printFile, regenerateReceiptPdf } from "../lib/api";
import { fmt, fmtDateTime } from "../lib/format";
import { Button } from "./Button";
import { Kbd } from "./Kbd";
import { Modal } from "./Modal";
import { logger } from "../logger";

const PAYMENT_LABEL: Record<string, string> = { cash: "Dinheiro", card: "Cartão", pix: "PIX", credit: "Crediário" };

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
 * (the sale stays valid either way) — "Reimprimir/regenerar" covers that. */
export function ReceiptResultModal({ sale, storeName, storeInfo, thankYouMessage, onNewSale }: ReceiptResultModalProps) {
  const [pdfPath, setPdfPath] = useState(sale.receiptPdfPath);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal's own Escape-to-close is off here (`dismissible={false}`, on
  // purpose — no accidental click-outside dismissal of a finished sale), but
  // Esc should still do *something* on this keyboard-first screen: since the
  // sale already committed, there's nothing to lose by treating Esc the same
  // as "Nova venda".
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onNewSale();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNewSale]);

  async function ensurePdf(): Promise<string | null> {
    if (pdfPath) return pdfPath;
    setBusy(true);
    setError(null);
    try {
      const path = await regenerateReceiptPdf(sale.id);
      setPdfPath(path);
      return path;
    } catch (err) {
      logger.error("falha ao gerar recibo em PDF", err);
      setError("Não foi possível gerar o PDF do recibo.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handlePrint() {
    const path = await ensurePdf();
    if (!path) return;
    try {
      await printFile(path);
    } catch (err) {
      logger.error("falha ao imprimir recibo", err);
      setError("Não foi possível imprimir o recibo.");
    }
  }

  async function handleOpenFolder() {
    await ensurePdf();
    try {
      await openReceiptsFolder();
    } catch (err) {
      logger.error("falha ao abrir pasta de recibos", err);
      setError("Não foi possível abrir a pasta de recibos.");
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
        {sale.discountAuthorizedByName && (
          <p className="mt-1 italic text-theme-3">Descontos autorizados por: {sale.discountAuthorizedByName}</p>
        )}
        <hr className="my-2 border-dashed border-theme-border" />
        <div className="text-center">Forma de pagamento: {PAYMENT_LABEL[sale.paymentMethod] ?? sale.paymentMethod}</div>
        <div className="mt-1 text-center">{thankYouMessage}</div>
      </div>

      {!pdfPath && <p className="mt-2 text-xs text-warning">PDF ainda não gerado — será gerado ao abrir/imprimir.</p>}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={handlePrint} disabled={busy}>
          Imprimir
        </Button>
        <Button variant="secondary" onClick={handleOpenFolder} disabled={busy}>
          Abrir pasta de recibos
        </Button>
        <div className="flex-1" />
        <Button variant="primary" autoFocus onClick={onNewSale}>
          Nova venda <Kbd>Enter</Kbd> / <Kbd>Esc</Kbd>
        </Button>
      </div>
    </Modal>
  );
}
