import { ClipboardEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type Props = {
  /** Raw uppercase alphanumeric characters, unformatted. */
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  id?: string;
  className?: string;
};

const MAX_CHARS = 14;

/** CNPJ can now be alphanumeric (Receita Federal's new format) — the first
 * 12 characters may be digits or uppercase letters, only the last 2 (check
 * digits) stay numeric. */
function onlyAlnumUpper(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, MAX_CHARS);
}

export function formatCnpj(chars: string): string {
  const len = chars.length;
  if (len === 0) return "";
  if (len <= 2) return chars;
  if (len <= 5) return `${chars.slice(0, 2)}.${chars.slice(2)}`;
  if (len <= 8) return `${chars.slice(0, 2)}.${chars.slice(2, 5)}.${chars.slice(5)}`;
  if (len <= 12) return `${chars.slice(0, 2)}.${chars.slice(2, 5)}.${chars.slice(5, 8)}/${chars.slice(8)}`;
  return `${chars.slice(0, 2)}.${chars.slice(2, 5)}.${chars.slice(5, 8)}/${chars.slice(8, 12)}-${chars.slice(12)}`;
}

// Cyclic weight table for the CNPJ checksum, 2-9 repeating from the
// rightmost of the 12 base characters — index i+1 gives the weight for
// character i when computing the first check digit, index i gives it for
// the second (which also folds in the first check digit at index 12).
const CNPJ_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Modulus-11 check-digit algorithm for the alphanumeric CNPJ (Receita
 * Federal's new format): each character's value is its ASCII code minus 48
 * (digits keep 0-9, 'A'..'Z' become 17-42) — same algorithm as the classic
 * numeric CNPJ, generalized to that wider value range. Also blocks the
 * all-zero base, which was never actually issued. */
export function isValidCnpj(raw: string): boolean {
  const chars = onlyAlnumUpper(raw);
  if (chars.length !== MAX_CHARS) return false;
  const base = chars.slice(0, 12);
  const dvPart = chars.slice(12);
  if (!/^[0-9A-Z]{12}$/.test(base) || !/^[0-9]{2}$/.test(dvPart)) return false;
  if (base === "000000000000") return false;

  const values = base.split("").map((c) => c.charCodeAt(0) - 48);
  let sum1 = 0;
  let sum2 = 0;
  values.forEach((v, i) => {
    sum1 += v * CNPJ_WEIGHTS[i + 1];
    sum2 += v * CNPJ_WEIGHTS[i];
  });
  const r1 = sum1 % 11;
  const dv1 = r1 < 2 ? 0 : 11 - r1;
  sum2 += dv1 * CNPJ_WEIGHTS[12];
  const r2 = sum2 % 11;
  const dv2 = r2 < 2 ? 0 : 11 - r2;

  return Number(dvPart[0]) === dv1 && Number(dvPart[1]) === dv2;
}

/** CNPJ field: same digit-buffer model as `PhoneInput`/`CpfInput`, but
 * `value`/`onChange` carry the raw alphanumeric characters, not the masked
 * string — formatting here is display-only. */
export function CnpjInput({ value, onChange, autoFocus, id, className = "" }: Props) {
  const [chars, setChars] = useState(() => onlyAlnumUpper(value));
  const lastEmitted = useRef(value);

  useEffect(() => {
    if (value !== lastEmitted.current) {
      setChars(onlyAlnumUpper(value));
      lastEmitted.current = value;
    }
  }, [value]);

  function commit(nextChars: string) {
    setChars(nextChars);
    lastEmitted.current = nextChars;
    onChange(nextChars);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Tab" || e.key === "Enter" || e.key === "Escape" || e.key.startsWith("Arrow")) return;

    e.preventDefault();
    if (/^[0-9a-zA-Z]$/.test(e.key)) {
      commit(onlyAlnumUpper(chars + e.key));
    } else if (e.key === "Backspace" || e.key === "Delete") {
      commit(chars.slice(0, -1));
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = onlyAlnumUpper(e.clipboardData.getData("text"));
    if (pasted) commit(pasted);
  }

  return (
    <input
      id={id}
      type="text"
      value={formatCnpj(chars)}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onChange={() => {}}
      placeholder="00.000.000/0001-00"
      autoFocus={autoFocus}
      className={`w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft ${className}`}
    />
  );
}
