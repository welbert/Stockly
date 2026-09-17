import { useMemo } from "react";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** When set (together with `onPageSizeChange`), renders a page-size <select> and keeps
   * the bar visible even with a single page, so the choice stays reachable regardless of
   * how many rows currently match. */
  pageSizeOptions?: number[];
  onPageSizeChange?: (pageSize: number) => void;
}

type PageToken = number | "gap";

/** Always includes first/last and a window of `current-1..current+1`, collapsing any
 * other gap into a single "gap" token — e.g. [0, "gap", 2, 3, 4, "gap", 9]. */
function pageWindow(current: number, totalPages: number): PageToken[] {
  const keep = new Set([0, totalPages - 1, current - 1, current, current + 1]);
  const sorted = [...keep].filter((p) => p >= 0 && p < totalPages).sort((a, b) => a - b);

  const tokens: PageToken[] = [];
  let prev = -2;
  for (const p of sorted) {
    if (p - prev > 1) tokens.push("gap");
    tokens.push(p);
    prev = p;
  }
  return tokens;
}

const NAV_BTN =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-theme-border bg-theme-surface text-sm text-theme-1 transition-colors hover:bg-theme-hover disabled:cursor-not-allowed disabled:opacity-40";
const PAGE_BTN = `${NAV_BTN} font-semibold`;
const PAGE_BTN_ACTIVE =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-primary bg-primary text-sm font-semibold text-white";

/** "X–Y de Z" + numbered pages (with ellipsis) + first/prev/next/last — renders nothing
 * when everything fits on one page, unless `pageSizeOptions` is set. Purely client-side
 * (the caller already has the full list in memory and just slices it), same convention
 * as the rest of this app's listings ("fetch everything, filter/paginate in the component"). */
export function Pagination({ page, pageSize, total, onPageChange, pageSizeOptions, onPageSizeChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const tokens = useMemo(() => pageWindow(page, totalPages), [page, totalPages]);

  if (totalPages <= 1 && !pageSizeOptions) return null;

  const start = total === 0 ? 0 : page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-theme-3">
      <span>
        Mostrando{" "}
        <strong className="text-theme-1">
          {start}–{end}
        </strong>{" "}
        de <strong className="text-theme-1">{total}</strong>
      </span>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button className={NAV_BTN} onClick={() => onPageChange(0)} disabled={page === 0} title="Primeira página">
            «
          </button>
          <button className={NAV_BTN} onClick={() => onPageChange(page - 1)} disabled={page === 0} title="Página anterior">
            ‹
          </button>
          {tokens.map((t, i) =>
            t === "gap" ? (
              <span key={`gap-${i}`} className="px-1">
                …
              </span>
            ) : (
              <button key={t} className={t === page ? PAGE_BTN_ACTIVE : PAGE_BTN} onClick={() => onPageChange(t)}>
                {t + 1}
              </button>
            ),
          )}
          <button
            className={NAV_BTN}
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages - 1}
            title="Próxima página"
          >
            ›
          </button>
          <button
            className={NAV_BTN}
            onClick={() => onPageChange(totalPages - 1)}
            disabled={page >= totalPages - 1}
            title="Última página"
          >
            »
          </button>
        </div>
      )}

      {pageSizeOptions && onPageSizeChange && (
        <label className="flex items-center gap-2">
          Itens por página
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-lg border border-theme-border bg-theme-surface px-2 py-1.5 text-xs text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
