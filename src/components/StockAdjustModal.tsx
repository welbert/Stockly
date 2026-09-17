import { FormEvent, useState } from "react";
import type { ItemSummary } from "../lib/api";
import { addStockEntry, deactivateItem } from "../lib/api";
import { Button } from "./Button";
import { ConfirmModal } from "./ConfirmModal";
import { Modal } from "./Modal";
import { logger } from "../logger";

interface StockAdjustModalProps {
  item: ItemSummary;
  onSaved: (item: ItemSummary) => void;
  onClose: () => void;
}

/** Fluxo do Usuário comum: só dar entrada (delta positivo) e desativar — a
 * correção livre de quantidade ("ajuste de inventário") é exclusiva do
 * Administrador, via `ItemFormModal`. */
export function StockAdjustModal({ item, onSaved, onClose }: StockAdjustModalProps) {
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const saved = await addStockEntry(item.id, Number(quantity));
      onSaved(saved);
    } catch (err) {
      logger.error("falha ao dar entrada de estoque", item.id, err);
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate() {
    try {
      const saved = await deactivateItem(item.id);
      onSaved(saved);
    } catch (err) {
      logger.error("falha ao desativar item", item.id, err);
      setError(String(err));
    }
  }

  return (
    <>
      <Modal title={`Ajustar estoque — ${item.name}`} onClose={onClose}>
        <p className="mb-4 text-sm text-theme-3">
          Quantidade atual: <span className="font-semibold text-theme-1">{item.quantity}</span>
        </p>
        <form onSubmit={handleSubmit}>
          <label className="mb-1 block text-xs font-semibold text-theme-3">Adicionar quantidade (entrada)</label>
          <input
            required
            autoFocus
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
          />
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
          <div className="mt-4 flex items-center justify-between">
            <Button type="button" variant="secondary" className="text-danger" onClick={() => setConfirmDeactivate(true)}>
              Desativar item
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" disabled={submitting}>
                Adicionar
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {confirmDeactivate && (
        <ConfirmModal
          title="Desativar item"
          message={`Desativar ${item.name}? Ele deixa de aparecer nas listagens e na busca de venda.`}
          confirmLabel="Desativar"
          danger
          onConfirm={() => {
            setConfirmDeactivate(false);
            handleDeactivate();
          }}
          onCancel={() => setConfirmDeactivate(false)}
        />
      )}
    </>
  );
}
