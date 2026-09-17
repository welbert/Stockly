import { ButtonHTMLAttributes, Ref } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover border-transparent",
  secondary: "bg-theme-surface text-theme-1 hover:bg-theme-hover border-theme-border",
  danger: "bg-danger text-white hover:brightness-90 border-transparent",
  // hover mais forte que o hover-padrão de linha/card — senão some quando o
  // botão está dentro de algo que já fica bg-theme-hover ao passar o mouse
  // (ex.: linha de tabela), ver "Theme rule" no CLAUDE.md.
  ghost: "bg-transparent text-theme-1 hover:bg-theme-hover-strong border-transparent",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ variant = "secondary", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
