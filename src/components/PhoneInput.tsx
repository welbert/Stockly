import { ClipboardEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  id?: string;
  className?: string;
};

const MAX_DIGITS = 11;

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, MAX_DIGITS);
}

function formatPhone(digits: string): string {
  const len = digits.length;
  if (len === 0) return "";
  if (len <= 2) return `(${digits}`;
  if (len <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (len <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/**
 * Phone field: Brazilian mask applied progressively — `(XX) XXXX-XXXX` for a
 * landline (10 digits), `(XX) XXXXX-XXXX` for mobile (11, with the 9th
 * digit). Formatting only, never blocking — phone is optional and varies
 * (extension, old format, ...), so it's not worth locking the form over that.
 * Same digit-buffer model as `MoneyInput` (always adds/removes from one end,
 * never tries to place the caret mid-string) — without that simplification,
 * reformatting on every keystroke throws the caret to the end of the field
 * anyway.
 */
export function PhoneInput({ value, onChange, placeholder, autoFocus, id, className = "" }: Props) {
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
    const formatted = formatPhone(nextDigits);
    lastEmitted.current = formatted;
    onChange(formatted);
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
      inputMode="tel"
      value={formatPhone(digits)}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onChange={() => {}}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={`w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft ${className}`}
    />
  );
}
