interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** Checkbox estilizado (caixa + check, não o quadradinho nativo do navegador). */
export function Checkbox({ label, checked, onChange, disabled }: CheckboxProps) {
  return (
    <label className={`flex items-center gap-2 text-sm text-theme-1 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
      <span className="relative inline-flex h-5 w-5 flex-shrink-0">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span
          className={`pointer-events-none flex h-5 w-5 items-center justify-center rounded-md border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary-soft ${
            checked ? "border-primary bg-primary" : "border-theme-border bg-theme-bg"
          }`}
        >
          {checked && (
            <svg viewBox="0 0 16 16" className="h-3 w-3 text-white" fill="none" aria-hidden>
              <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      </span>
      {label}
    </label>
  );
}
