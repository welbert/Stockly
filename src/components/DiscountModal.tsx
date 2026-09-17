import { FormEvent, KeyboardEvent, useRef, useState } from "react";
import type { UserSummary } from "../lib/api";
import { verifyPassword } from "../lib/api";
import { Button } from "./Button";
import { Kbd } from "./Kbd";
import { Modal } from "./Modal";
import { MoneyInput } from "./MoneyInput";
import { logger } from "../logger";

export type DiscountResult = {
  percent: number | null;
  amount: number | null;
  authorizerId?: number;
  authorizerPassword?: string;
};

interface DiscountModalProps {
  /** Item name (per-item discount) or `null` (order-wide discount). */
  targetLabel: string | null;
  /** Gross value the discount applies to — the absolute-value cap. */
  grossValue: number;
  current: { percent: number | null; amount: number | null };
  /** `true` when the logged-in user isn't Admin and hasn't authorized any discount in this sale yet. */
  requiresAuth: boolean;
  admins: UserSummary[];
  onApply: (result: DiscountResult) => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Applies a discount (item or whole order), in % or R$ — asks for admin
 * authorization only when the logged-in user is a regular user and hasn't
 * authorized any discount in this sale yet (see `SalesPage`, which reuses
 * the same authorization for later discounts in the same sale). */
export function DiscountModal({
  targetLabel,
  grossValue,
  current,
  requiresAuth,
  admins,
  onApply,
  onRemove,
  onClose,
}: DiscountModalProps) {
  const [type, setType] = useState<"percent" | "amount">(current.percent !== null ? "percent" : "amount");
  const [percent, setPercent] = useState(current.percent !== null ? String(current.percent) : "");
  const [amount, setAmount] = useState(current.amount ?? 0);
  const [adminId, setAdminId] = useState(admins[0]?.id ?? 0);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const valueAreaRef = useRef<HTMLDivElement>(null);

  /** `←`/`→` toggle % ↔ R$ — only while the value field is still empty, so
   * it never fights with moving the text cursor once something's been typed.
   * Scoped to this block (not the whole form) so it doesn't interfere with
   * the admin password field, which also uses arrow keys to edit text. */
  function handleValueAreaKeyDown(e: KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (!valueAreaRef.current?.contains(document.activeElement)) return;
    const isEmpty = type === "percent" ? percent === "" : amount === 0;
    if (!isEmpty) return;
    e.preventDefault();
    setType(type === "percent" ? "amount" : "percent");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    let parsedPercent: number | null = null;
    let parsedAmount: number | null = null;
    if (type === "percent") {
      parsedPercent = Number(percent.replace(",", "."));
      if (!Number.isFinite(parsedPercent) || parsedPercent < 0 || parsedPercent > 100) {
        setError("Desconto deve estar entre 0% e 100%");
        return;
      }
    } else {
      parsedAmount = amount;
      if (parsedAmount < 0 || parsedAmount > grossValue) {
        setError("Desconto não pode ser maior que o valor do item/venda");
        return;
      }
    }

    // A zero discount (blank field, or "0" typed) is the same as no discount
    // at all — clear it instead of applying a meaningless "-0%"/"-R$ 0,00".
    if ((parsedPercent ?? parsedAmount) === 0) {
      onRemove();
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
      onApply({
        percent: parsedPercent,
        amount: parsedAmount,
        authorizerId: requiresAuth ? adminId : undefined,
        authorizerPassword: requiresAuth ? password : undefined,
      });
    } catch (err) {
      logger.error("falha ao verificar senha do administrador", adminId, err);
      setError("Não foi possível verificar a senha");
    } finally {
      setSubmitting(false);
    }
  }

  const hasCurrentDiscount = current.percent !== null || current.amount !== null;

  return (
    <Modal title={targetLabel ? `Desconto — ${targetLabel}` : "Desconto na venda"} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div ref={valueAreaRef} onKeyDown={handleValueAreaKeyDown}>
          <div className="mb-1.5 flex items-center justify-between">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setType("percent")}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                  type === "percent" ? "border-primary bg-primary-soft text-primary" : "border-theme-border text-theme-2"
                }`}
              >
                %
              </button>
              <button
                type="button"
                onClick={() => setType("amount")}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                  type === "amount" ? "border-primary bg-primary-soft text-primary" : "border-theme-border text-theme-2"
                }`}
              >
                R$
              </button>
            </div>
            <span className="flex items-center gap-1 text-[11px] text-theme-3">
              <Kbd>←</Kbd>
              <Kbd>→</Kbd> alternar
            </span>
          </div>

          {type === "percent" ? (
            <input
              autoFocus
              inputMode="decimal"
              placeholder="Ex.: 10"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              className="w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
            />
          ) : (
            <MoneyInput value={amount} onChange={setAmount} autoFocus />
          )}
        </div>

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

        <div className="mt-4 flex items-center justify-between gap-2">
          {hasCurrentDiscount ? (
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex items-center gap-1.5 rounded-lg border border-danger/40 px-3.5 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger/10"
            >
              Remover desconto
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar <Kbd>Esc</Kbd>
            </Button>
            <Button type="submit" variant="primary" disabled={submitting || (requiresAuth && admins.length === 0)}>
              Confirmar desconto
            </Button>
          </div>
        </div>
        {requiresAuth && admins.length === 0 && (
          <p className="mt-2 text-xs text-danger">Nenhum administrador ativo cadastrado para autorizar.</p>
        )}
      </form>
    </Modal>
  );
}
