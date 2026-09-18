import { useMemo, useState } from "react";
import type { ItemSummary } from "../lib/api";
import { fmt, normalize } from "../lib/format";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { StockBadge } from "./StockBadge";

interface StockBrowserModalProps {
  items: ItemSummary[];
  lowStockPercent: number;
  /** Feedback from the last `onSelect` call (e.g. "sem estoque") — kept in
   * sync with the same error state the main search box uses, since the
   * failure modes are identical (out of stock, quantity above what's left). */
  error: string | null;
  onSelect: (item: ItemSummary) => void;
  onClose: () => void;
}

/** Lets the user browse the full stock (like Estoque) without leaving Venda,
 * and add straight from it — the search box only matches by code/name, which
 * doesn't help someone who wants to look at what's available first. Stays
 * open after each pick so several items can be added in a row. */
export function StockBrowserModal({ items, lowStockPercent, error, onSelect, onClose }: StockBrowserModalProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = normalize(search.trim());
    return items
      .filter((item) => item.active)
      .filter((item) => !term || normalize(item.code).includes(term) || normalize(item.name).includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [items, search]);

  return (
    <Modal title="Estoque disponível" onClose={onClose} size="lg">
      <input
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filtrar por código ou nome..."
        className="mb-3 w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2.5 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
      />

      {error && <p className="mb-2 text-xs text-danger">{error}</p>}

      <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-theme-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-theme-surface">
            <tr className="border-b border-theme-border text-left text-xs uppercase tracking-wide text-theme-3">
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Categoria</th>
              <th className="px-3 py-2">Preço</th>
              <th className="px-3 py-2">Estoque</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id} className="border-b border-theme-border last:border-0 hover:bg-theme-hover">
                <td className="px-3 py-2">
                  <code className="text-xs">{item.code}</code>
                </td>
                <td className="px-3 py-2 text-theme-1">{item.name}</td>
                <td className="px-3 py-2 text-theme-3">{item.categoryName ?? "—"}</td>
                <td className="px-3 py-2 text-theme-1">{fmt(item.salePrice)}</td>
                <td className="px-3 py-2">
                  <StockBadge item={item} lowStockPercent={lowStockPercent} />
                </td>
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" className="text-xs" disabled={item.quantity === 0} onClick={() => onSelect(item)}>
                    + Adicionar
                  </Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-theme-3">
                  Nenhum item encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </Modal>
  );
}
