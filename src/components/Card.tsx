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
      {/* `flex-1 min-h-0` only take effect when the outer div is itself a flex
          column (e.g. Dashboard cards passing `className="flex h-full flex-col"`)
          — harmless no-ops otherwise, since `flex`/`min-height` only apply to
          flex items. Needed so a scrollable inner wrapper (`overflow-y-auto`)
          a card renders actually gets a bounded height to scroll within,
          instead of growing past the grid cell. */}
      <div className="min-h-0 flex-1 p-5">{children}</div>
    </div>
  );
}
