import type { ItemSummary } from "./api";
import { normalize } from "./format";

export const ITEM_SEARCH_PEEK_LIMIT = 3;
export const ITEM_SEARCH_RESULT_LIMIT = 8;

/** Same "starts with" > "contains" ranking as `SalesPage`'s item search
 * (`normalize()` for accent/case-insensitive match), capped so a dropdown
 * stays usable with a large catalog. With an empty query, just a
 * `ITEM_SEARCH_PEEK_LIMIT`-item peek — not real search results, only there
 * so the admin knows what the field shows and how to search it. Shared by
 * every item autocomplete in the app: `ImportCsvModal`'s `RemapComboBox`
 * ("vincular a item existente") and `ItemFilterCombobox` (Estoque report
 * item filters) — a plain `<select>` listing every item stops scaling once
 * the catalog is more than a handful. */
export function itemSearchSuggestions(query: string, items: ItemSummary[]): ItemSummary[] {
  const term = normalize(query.trim());
  if (!term) return items.slice(0, ITEM_SEARCH_PEEK_LIMIT);
  const starts: ItemSummary[] = [];
  const contains: ItemSummary[] = [];
  for (const item of items) {
    const name = normalize(item.name);
    const code = normalize(item.code);
    if (name.startsWith(term) || code.startsWith(term)) starts.push(item);
    else if (name.includes(term) || code.includes(term)) contains.push(item);
  }
  return [...starts, ...contains].slice(0, ITEM_SEARCH_RESULT_LIMIT);
}
