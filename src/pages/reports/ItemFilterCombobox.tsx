import { useEffect, useRef, useState } from "react";
import type { ItemSummary } from "../../lib/api";
import { itemSearchSuggestions } from "../../lib/itemSearch";

interface ItemFilterComboboxProps {
  items: ItemSummary[];
  /** `null` = no filter (`allLabel`). */
  value: number | null;
  onChange: (itemId: number | null) => void;
  allLabel?: string;
}

/** Item filter as an autocomplete instead of a plain `<select>` listing
 * every item — same reasoning, and the same `itemSearchSuggestions` ranking,
 * as `ImportCsvModal`'s `RemapComboBox`. Unlike that one (which collapses to
 * a "linked" chip + "Desvincular" once something's picked, since it's
 * assigning a CSV row to an item), this stays a **persistent filter**:
 * closed, it just shows the selected item's "código — nome" (or `allLabel`)
 * as the input's value, and clicking it reopens the search — same shape as
 * a normal `<select>` in the toolbar, just searchable. The dropdown always
 * lists `allLabel` first (clears the filter) above the matching items. */
export function ItemFilterCombobox({ items, value, onChange, allLabel = "Todos os itens" }: ItemFilterComboboxProps) {
  const selected = value != null ? (items.find((it) => it.id === value) ?? null) : null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const suggestions = itemSearchSuggestions(query, items);
  const displayValue = open ? query : selected ? `${selected.code} — ${selected.name}` : "";

  function select(itemId: number | null) {
    onChange(itemId);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        value={displayValue}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlighted(0);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlighted((i) => Math.min(i + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlighted((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const item = suggestions[highlighted];
            if (item) select(item.id);
          } else if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
          }
        }}
        placeholder={allLabel}
        className="w-56 rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary"
      />
      {open && (
        <div className="absolute left-0 z-10 mt-1 w-64 overflow-hidden rounded-lg border border-theme-border bg-theme-surface shadow-lg">
          {!query.trim() && (
            <p className="border-b border-theme-border px-3 py-1.5 text-[11px] text-theme-3">Digite código ou nome pra buscar</p>
          )}
          <div className="max-h-56 overflow-y-auto">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(null)}
              className="block w-full px-3 py-1.5 text-left text-xs font-semibold hover:bg-theme-hover"
            >
              {allLabel}
            </button>
            {suggestions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-theme-3">Nenhum item encontrado.</p>
            ) : (
              suggestions.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(item.id)}
                  className={`block w-full px-3 py-1.5 text-left text-xs ${i === highlighted ? "bg-theme-hover-strong" : "hover:bg-theme-hover"}`}
                >
                  <code className="text-theme-3">{item.code}</code> {item.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
