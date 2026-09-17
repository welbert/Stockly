import { ReactNode } from "react";

interface CardProps {
  title?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

/** Container padrão de tela (mesmo `.card`/`.card-head`/`.card-pad` do mockup) —
 * cabeçalho com título/dica separado do corpo por uma linha divisória. */
export function Card({ title, hint, children, className = "" }: CardProps) {
  return (
    <div className={`rounded-xl border border-theme-border bg-theme-surface shadow-sm ${className}`}>
      {title && (
        <div className="flex items-center justify-between border-b border-theme-border px-5 py-3.5">
          <h3 className="text-sm font-semibold text-theme-1">{title}</h3>
          {hint && <span className="text-xs text-theme-3">{hint}</span>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}
