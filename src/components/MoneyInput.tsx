import { ClipboardEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type Props = {
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  autoFocus?: boolean;
  id?: string;
  className?: string;
  /** Destaca a borda em amarelo (ex.: preço de venda abaixo do custo) — um aviso que não impede salvar. */
  warning?: boolean;
  /** Trava o valor digitado nesse teto em vez de deixar passar — ex.: valor de
   * pagamento não pode ultrapassar o saldo em aberto. Precisa ser clampado
   * aqui dentro (não via `value`/`onChange` de fora): o buffer de dígitos é
   * quem decide o que aparece na tela, e se o valor externo parar de mudar
   * (já no teto), o efeito de ressincronização abaixo nunca mais dispara —
   * o buffer ficaria livre pra continuar crescendo com cada tecla nova. */
  max?: number;
};

const MAX_DIGITS = 15;

function centsToDigits(value: number): string {
  const cents = Math.round(value * 100);
  return cents > 0 ? String(cents) : "";
}

function digitsToValue(digits: string): number {
  return digits === "" ? 0 : parseInt(digits, 10) / 100;
}

function formatDigits(digits: string): string {
  return "R$ " + digitsToValue(digits).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Campo de valor monetário: cada dígito digitado entra pela direita, como em
 * caixas eletrônicos/apps bancários — "1" vira R$ 0,01, mais um "0" vira R$ 0,10.
 * Use este componente em qualquer input de R$ do app para manter o comportamento idêntico.
 */
export function MoneyInput({ value, onChange, placeholder, autoFocus, id, className = "", warning, max }: Props) {
  const [digits, setDigits] = useState(() => centsToDigits(value));
  const lastEmitted = useRef(value);

  // só ressincroniza quando `value` muda por fora (ex: modal abrindo pra editar um valor
  // existente) — nunca quando a mudança veio do próprio digitar, senão zeros à esquerda
  // digitados (ex: "0" "0" "1") somem a cada re-render.
  useEffect(() => {
    if (value !== lastEmitted.current) {
      setDigits(centsToDigits(value));
      lastEmitted.current = value;
    }
  }, [value]);

  function commit(next: string) {
    const trimmed = next.slice(-MAX_DIGITS);
    const parsed = digitsToValue(trimmed);
    const clamped = max !== undefined && parsed > max ? max : parsed;
    setDigits(clamped === parsed ? trimmed : centsToDigits(clamped));
    lastEmitted.current = clamped;
    onChange(clamped);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Tab" || e.key === "Enter" || e.key === "Escape" || e.key.startsWith("Arrow")) return;

    e.preventDefault();
    if (/^[0-9]$/.test(e.key)) {
      commit(digits + e.key);
    } else if (e.key === "Backspace" || e.key === "Delete") {
      commit(digits.slice(0, -1));
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const onlyDigits = e.clipboardData.getData("text").replace(/\D/g, "");
    if (onlyDigits) commit(onlyDigits);
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      value={formatDigits(digits)}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onChange={() => {}}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={`w-full rounded-lg border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:ring-2 ${
        warning
          ? "border-warning focus:border-warning focus:ring-warning/20"
          : "border-theme-border focus:border-primary focus:ring-primary-soft"
      } ${className}`}
    />
  );
}
