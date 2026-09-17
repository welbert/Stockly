import { FormEvent, KeyboardEvent, useRef, useState } from "react";
import type { PaymentMethod } from "../lib/api";
import { fmt } from "../lib/format";
import { Button } from "./Button";
import { Kbd } from "./Kbd";
import { Modal } from "./Modal";

const METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: "cash", label: "Dinheiro", icon: "💵" },
  { value: "card", label: "Cartão", icon: "💳" },
  { value: "pix", label: "PIX", icon: "📱" },
];

interface PaymentModalProps {
  total: number;
  submitting: boolean;
  error: string | null;
  onConfirm: (method: PaymentMethod) => void;
  onClose: () => void;
}

/** Crediário is left out — depends on the not-yet-built Devedores/clients screen. */
export function PaymentModal({ total, submitting, error, onConfirm, onClose }: PaymentModalProps) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const methodButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onConfirm(method);
  }

  /** `←`/`→` move both the selection and focus between the three method
   * buttons — standard roving-tabindex radiogroup pattern. `Enter` is handled
   * explicitly too: a focused `type="button"` only re-fires its own click,
   * it doesn't submit the form on its own, so without this Enter would do
   * nothing while focus sits on a method button. */
  function handleMethodKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const nextIndex = e.key === "ArrowRight" ? Math.min(index + 1, METHODS.length - 1) : Math.max(index - 1, 0);
      setMethod(METHODS[nextIndex].value);
      methodButtonRefs.current[nextIndex]?.focus();
    } else if (e.key === "Enter" && !submitting) {
      e.preventDefault();
      onConfirm(METHODS[index].value);
    }
  }

  return (
    <Modal title="Finalizar venda" onClose={submitting ? undefined : onClose}>
      <form onSubmit={handleSubmit}>
        <p className="mb-3 text-sm text-theme-3">
          Total <span className="text-lg font-bold text-theme-1">{fmt(total)}</span>
        </p>
        <label className="mb-1 block text-xs font-semibold text-theme-3">Forma de pagamento</label>
        <div className="grid grid-cols-3 gap-2">
          {METHODS.map((m, i) => (
            <button
              key={m.value}
              ref={(el) => {
                methodButtonRefs.current[i] = el;
              }}
              type="button"
              autoFocus={m.value === method}
              onClick={() => setMethod(m.value)}
              onKeyDown={(e) => handleMethodKeyDown(e, i)}
              className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-xs font-semibold ${
                method === m.value ? "border-primary bg-primary-soft text-primary" : "border-theme-border text-theme-2"
              }`}
            >
              <span className="text-lg">{m.icon}</span>
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-theme-3">
          <Kbd>←</Kbd>/<Kbd>→</Kbd> escolher forma de pagamento
        </p>

        {error && <p className="mt-3 text-xs text-danger">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Voltar <Kbd>Esc</Kbd>
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            Finalizar <Kbd>Enter</Kbd>
          </Button>
        </div>
      </form>
    </Modal>
  );
}
