import { FormEvent, ReactNode, useEffect, useState } from "react";
import type { CategorySummary, ItemSummary } from "../lib/api";
import { createItem, getDefaultProfitMargin, listCategories, suggestedSalePrice, updateItem } from "../lib/api";
import { Button } from "./Button";
import { CategoryManagerModal } from "./CategoryManagerModal";
import { Checkbox } from "./Checkbox";
import { ConfirmModal } from "./ConfirmModal";
import { InfoTooltip } from "./InfoTooltip";
import { Modal } from "./Modal";
import { MoneyInput } from "./MoneyInput";
import { logger } from "../logger";

interface ItemFormModalProps {
  /** Presente = editando um item existente; ausente = criando um novo. */
  initial?: ItemSummary;
  onSaved: (item: ItemSummary) => void;
  onClose: () => void;
}

/** Cadastro/edição de item — exclusivo do Administrador. */
export function ItemFormModal({ initial, onSaved, onClose }: ItemFormModalProps) {
  const editing = Boolean(initial);
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [categoryId, setCategoryId] = useState<number | null>(initial?.categoryId ?? null);
  const [costPrice, setCostPrice] = useState(initial?.costPrice ?? 0);
  const [salePrice, setSalePrice] = useState(initial?.salePrice ?? 0);
  const [quantity, setQuantity] = useState(initial ? String(initial.quantity) : "0");
  const [minQuantity, setMinQuantity] = useState(initial?.minQuantity != null ? String(initial.minQuantity) : "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [managingCategories, setManagingCategories] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [profitMargin, setProfitMargin] = useState<number | null>(null);
  // só entra em jogo pra item novo — uma vez que o admin mexe no preço de
  // venda com a própria mão, para de recalcular por cima ao mudar o custo.
  const [salePriceTouched, setSalePriceTouched] = useState(false);

  const dirty =
    code !== (initial?.code ?? "") ||
    name !== (initial?.name ?? "") ||
    categoryId !== (initial?.categoryId ?? null) ||
    costPrice !== (initial?.costPrice ?? 0) ||
    salePrice !== (initial?.salePrice ?? 0) ||
    quantity !== (initial ? String(initial.quantity) : "0") ||
    minQuantity !== (initial?.minQuantity != null ? String(initial.minQuantity) : "") ||
    active !== (initial?.active ?? true);

  const belowCost = costPrice > 0 && salePrice < costPrice;

  function reloadCategories() {
    listCategories()
      .then(setCategories)
      .catch((err) => logger.error("falha ao listar categorias", err));
  }

  useEffect(reloadCategories, []);

  useEffect(() => {
    if (!editing) {
      getDefaultProfitMargin()
        .then(setProfitMargin)
        .catch((err) => logger.error("falha ao ler margem de lucro padrão", err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCostChange(next: number) {
    setCostPrice(next);
    if (!editing && !salePriceTouched && profitMargin !== null) {
      setSalePrice(suggestedSalePrice(next, profitMargin));
    }
  }

  function handleSaleChange(next: number) {
    setSalePrice(next);
    if (!editing) setSalePriceTouched(true);
  }

  function requestClose() {
    if (dirty) {
      setConfirmDiscard(true);
    } else {
      onClose();
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        code,
        name,
        categoryId,
        costPrice,
        salePrice,
        quantity: Number(quantity),
        minQuantity: minQuantity === "" ? null : Number(minQuantity),
      };
      const saved = initial ? await updateItem({ id: initial.id, ...payload, active }) : await createItem(payload);
      onSaved(saved);
    } catch (err) {
      logger.error("falha ao salvar item", err);
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Modal title={editing ? "Editar item" : "Novo item"} onClose={requestClose}>
        <form onSubmit={handleSubmit}>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <Field label="Código (opcional)">
              <input
                autoFocus
                placeholder="Deixe em branco para usar o ID"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Nome">
              <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </Field>
          </div>

          <Field label="Categoria">
            <div className="flex gap-2">
              <select
                value={categoryId ?? ""}
                onChange={(e) => setCategoryId(e.target.value === "" ? null : Number(e.target.value))}
                className={inputClass}
              >
                <option value="">Categoria indefinida</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Button type="button" variant="ghost" onClick={() => setManagingCategories(true)}>
                Gerenciar
              </Button>
            </div>
          </Field>

          <div className="mb-1.5 grid grid-cols-2 gap-3">
            <Field label="Preço de custo">
              <MoneyInput value={costPrice} onChange={handleCostChange} warning={belowCost} />
            </Field>
            <Field label="Preço de venda">
              <MoneyInput value={salePrice} onChange={handleSaleChange} warning={belowCost} />
            </Field>
          </div>
          {!editing && !salePriceTouched && profitMargin !== null && costPrice > 0 && (
            <p className="mb-3 text-xs text-theme-3">
              Sugestão automática com {profitMargin}% de lucro — edite o preço de venda se quiser outro valor.
            </p>
          )}
          {belowCost && (
            <p className="mb-3 text-xs text-warning">
              ⚠ Preço de venda menor que o de custo — o item será vendido no prejuízo.
            </p>
          )}

          <div className="mb-3 grid grid-cols-2 gap-3">
            <Field label="Quantidade">
              <input
                required
                type="number"
                min="0"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field
              label="Quantidade mínima"
              tooltip="Abaixo (ou igual a) desse valor, o item aparece com o chip de estoque baixo/crítico na listagem e na venda. Deixe em branco para este item nunca alertar."
            >
              <input
                type="number"
                min="0"
                step="1"
                placeholder="Sem alerta"
                value={minQuantity}
                onChange={(e) => setMinQuantity(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          {editing && (
            <div className="mb-3">
              <Checkbox label="Ativo" checked={active} onChange={setActive} />
            </div>
          )}

          {error && <p className="mb-2 text-xs text-danger">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={requestClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              Salvar
            </Button>
          </div>
        </form>
      </Modal>

      {managingCategories && (
        <CategoryManagerModal onChanged={reloadCategories} onClose={() => setManagingCategories(false)} />
      )}

      {confirmDiscard && (
        <ConfirmModal
          title="Descartar alterações?"
          message="Você tem alterações não salvas neste item. Fechar agora descarta o que foi digitado."
          confirmLabel="Descartar"
          danger
          onConfirm={() => {
            setConfirmDiscard(false);
            onClose();
          }}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}
    </>
  );
}

const inputClass =
  "w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft";

function Field({ label, tooltip, children }: { label: string; tooltip?: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-theme-3">
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </label>
      {children}
    </div>
  );
}
