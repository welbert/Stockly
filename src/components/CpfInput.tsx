import { ClipboardEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type Props = {
  /** Raw digits, unformatted — never the masked display string (unlike
   * `PhoneInput`, which round-trips the formatted value). */
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  id?: string;
  className?: string;
};

const MAX_DIGITS = 11;

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, MAX_DIGITS);
}

export function formatCpf(digits: string): string {
  const len = digits.length;
  if (len === 0) return "";
  if (len <= 3) return digits;
  if (len <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (len <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function checkDigit(base: number[], startWeight: number): number {
  const sum = base.reduce((acc, d, i) => acc + d * (startWeight - i), 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/** Standard CPF check-digit algorithm — module 11, weights 10..2 then 11..2.
 * Also blocks the classic "all same digit" fakes (000.000.000-00,
 * 111.111.111-11, ...), which pass the checksum but were never issued. */
export function isValidCpf(raw: string): boolean {
  const digits = onlyDigits(raw);
  if (digits.length !== MAX_DIGITS) return false;
  const nums = digits.split("").map(Number);
  if (nums.every((d) => d === nums[0])) return false;
  const dv1 = checkDigit(nums.slice(0, 9), 10);
  const dv2 = checkDigit([...nums.slice(0, 9), dv1], 11);
  return nums[9] === dv1 && nums[10] === dv2;
}

/** CPF field: same digit-buffer model as `PhoneInput`/`MoneyInput` (always
 * adds/removes from one end), but `value`/`onChange` carry the raw digits,
 * not the masked string — formatting here is display-only, so the field
 * that's actually saved never needs to strip a mask back out. */
export function CpfInput({ value, onChange, autoFocus, id, className = "" }: Props) {
  const [digits, setDigits] = useState(() => onlyDigits(value));
  const lastEmitted = useRef(value);

  useEffect(() => {
    if (value !== lastEmitted.current) {
      setDigits(onlyDigits(value));
      lastEmitted.current = value;
    }
  }, [value]);

  function commit(nextDigits: string) {
    setDigits(nextDigits);
    lastEmitted.current = nextDigits;
    onChange(nextDigits);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Tab" || e.key === "Enter" || e.key === "Escape" || e.key.startsWith("Arrow")) return;

    e.preventDefault();
    if (/^[0-9]$/.test(e.key)) {
      commit(onlyDigits(digits + e.key));
    } else if (e.key === "Backspace" || e.key === "Delete") {
      commit(digits.slice(0, -1));
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = onlyDigits(e.clipboardData.getData("text"));
    if (pasted) commit(pasted);
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      value={formatCpf(digits)}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onChange={() => {}}
      placeholder="000.000.000-00"
      autoFocus={autoFocus}
      className={`w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft ${className}`}
    />
  );
}
