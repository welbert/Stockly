import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { ItemSummary, ItemsCsvImportDecision, ItemsCsvImportPreview, ItemsCsvImportResult, MissingItemAction } from "../lib/api";
import { applyItemsCsvImport, previewItemsCsvImport } from "../lib/api";
import { fmt } from "../lib/format";
import { ITEM_SEARCH_PEEK_LIMIT, itemSearchSuggestions } from "../lib/itemSearch";
import { logger } from "../logger";
import { Button } from "./Button";
import { Modal } from "./Modal";

const FIELD_LABELS: Record<string, string> = {
  nome: "Nome",
  categoria: "Categoria",
  preco_custo: "Preço de custo",
  preco_venda: "Preço de venda",
  quantidade: "Quantidade",
  quantidade_minima: "Quantidade mínima",
  ativo: "Ativo",
};

const MONEY_FIELDS = new Set(["preco_custo", "preco_venda"]);

function formatDiffValue(field: string, value: string): string {
  if (MONEY_FIELDS.has(field)) return fmt(Number(value) || 0);
  if (field === "quantidade_minima") return value === "" ? "Sem mínima" : value;
  if (field === "categoria") return value === "" ? "Categoria indefinida" : value;
  if (field === "ativo") return value === "sim" ? "Ativo" : "Inativo";
  return value;
}

const MISSING_ACTION_LABEL: Record<MissingItemAction, string> = {
  keep: "Manter como está",
  zero: "Zerar quantidade",
  deactivate: "Desativar",
};

interface RemapComboBoxProps {
  items: ItemSummary[];
  value: number | null;
  onChange: (itemId: number | null) => void;
}

/** "Vincular a item existente" field for a "new" CSV row — an autocomplete
 * instead of a plain `<select>` listing every item, since that stops scaling
 * once the catalog is more than a handful of items. Once something is
 * picked, collapses to a chip + "Desvincular" instead of the input. */
function RemapComboBox({ items, value, onChange }: RemapComboBoxProps) {
  const selected = value != null ? (items.find((it) => it.id === value) ?? null) : null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (selected) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="rounded-lg border border-theme-border bg-theme-hover px-2 py-1 text-xs text-theme-1">
          {selected.code} — {selected.name}
        </span>
        <button type="button" className="text-xs text-theme-3 underline" onClick={() => onChange(null)}>
          Desvincular
        </button>
      </div>
    );
  }

  const suggestions = itemSearchSuggestions(query, items);

  function select(item: ItemSummary) {
    onChange(item.id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlighted(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
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
            if (item) select(item);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Vincular a item existente..."
        className="w-60 rounded-lg border border-theme-border bg-theme-surface px-2 py-1 text-xs text-theme-1 outline-none focus:border-primary"
      />
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-64 overflow-hidden rounded-lg border border-theme-border bg-theme-surface shadow-lg">
          {!query.trim() && (
            <p className="border-b border-theme-border px-3 py-1.5 text-[11px] text-theme-3">
              Digite código ou nome pra buscar — mostrando os {ITEM_SEARCH_PEEK_LIMIT} primeiros
            </p>
          )}
          <div className="max-h-56 overflow-y-auto">
            {suggestions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-theme-3">Nenhum item encontrado.</p>
            ) : (
              suggestions.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(item)}
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

interface ImportCsvModalProps {
  /** Full item list (already loaded by the caller) — feeds the "vincular a
   * item existente" select for rows the admin remaps instead of creating. */
  items: ItemSummary[];
  onClose: () => void;
  onImported: () => void;
}

type Step = "pick" | "review" | "result";

/** Admin-only CSV import flow: pick a file, review the classified rows
 * (novos/alterados/ausentes), then apply. Nothing is written to the DB until
 * "Aplicar importação" — `previewItemsCsvImport` is read-only. */
export function ImportCsvModal({ items, onClose, onImported }: ImportCsvModalProps) {
  const [step, setStep] = useState<Step>("pick");
  const [preview, setPreview] = useState<ItemsCsvImportPreview | null>(null);
  /** rowLine -> existing item id to update instead of creating, or `null` to
   * keep the row as a brand-new item. */
  const [remap, setRemap] = useState<Record<number, number | null>>({});
  const [missingActions, setMissingActions] = useState<Record<number, MissingItemAction>>({});
  const [result, setResult] = useState<ItemsCsvImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePickFile() {
    setError(null);
    let path: string | null;
    try {
      const picked = await open({ multiple: false, filters: [{ name: "CSV", extensions: ["csv"] }] });
      path = Array.isArray(picked) ? (picked[0] ?? null) : picked;
    } catch (err) {
      logger.error("falha ao abrir seletor de arquivo CSV", err);
      setError("Não foi possível abrir o seletor de arquivo.");
      return;
    }
    if (!path) return;
    setBusy(true);
    try {
      const data = await previewItemsCsvImport(path);
      setPreview(data);
      setMissingActions(Object.fromEntries(data.missingItems.map((m) => [m.itemId, "keep" as MissingItemAction])));
      setRemap({});
      setStep("review");
    } catch (err) {
      logger.error("falha ao pré-visualizar importação de CSV", path, err);
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  // Um item "ausente" deixa de estar ausente assim que alguma linha "nova" é
  // vinculada a ele manualmente — a lista efetiva é recalculada aqui, não no backend.
  const coveredItemIds = new Set(Object.values(remap).filter((id): id is number => id != null));
  const effectiveMissing = preview ? preview.missingItems.filter((m) => !coveredItemIds.has(m.itemId)) : [];

  async function handleConfirm() {
    if (!preview) return;
    setError(null);
    setBusy(true);
    const decision: ItemsCsvImportDecision = {
      creates: preview.newItems.filter((n) => remap[n.rowLine] == null).map((n) => ({ row: n.row })),
      updates: [
        ...preview.newItems
          .filter((n) => remap[n.rowLine] != null)
          .map((n) => ({ itemId: remap[n.rowLine]!, row: n.row, keepExistingName: true })),
        ...preview.changedItems.map((c) => ({ itemId: c.itemId, row: c.row, keepExistingName: false })),
      ],
      missingActions: effectiveMissing.map((m) => ({ itemId: m.itemId, action: missingActions[m.itemId] ?? "keep" })),
    };
    try {
      const res = await applyItemsCsvImport(decision);
      setResult(res);
      setStep("result");
    } catch (err) {
      logger.error("falha ao aplicar importação de CSV", err);
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  if (step === "pick") {
    return (
      <Modal title="Importar CSV" onClose={onClose}>
        <p className="text-sm text-theme-3">Selecione o arquivo CSV com os itens do estoque a importar.</p>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handlePickFile} disabled={busy}>
            {busy ? "Lendo arquivo..." : "Selecionar arquivo"}
          </Button>
        </div>
      </Modal>
    );
  }

  if (step === "result" && result) {
    return (
      <Modal title="Importação concluída" onClose={onImported}>
        <ul className="space-y-1 text-sm text-theme-1">
          <li>{result.created} item(ns) criado(s)</li>
          <li>{result.updated} item(ns) atualizado(s)</li>
          <li>{result.missingHandled} item(ns) ausente(s) tratado(s)</li>
        </ul>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" autoFocus onClick={onImported}>
            Concluir
          </Button>
        </div>
      </Modal>
    );
  }

  if (!preview) return null;

  return (
    <Modal title="Revisar importação de CSV" size="xl" onClose={onClose}>
      {preview.errors.length > 0 && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
          <p className="font-semibold">{preview.errors.length} linha(s) ignorada(s) por erro:</p>
          <ul className="mt-1 list-disc pl-4">
            {preview.errors.map((e) => (
              <li key={e.line}>
                Linha {e.line}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="max-h-[55vh] space-y-6 overflow-y-auto pr-1">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-theme-1">Itens novos ({preview.newItems.length})</h3>
          {preview.newItems.length === 0 ? (
            <p className="text-xs text-theme-3">Nenhum item novo.</p>
          ) : (
            <div className="space-y-2">
              {preview.newItems.map((n) => (
                <div key={n.rowLine} className="rounded-lg border border-theme-border p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm text-theme-1">
                      <code className="rounded-md border border-theme-border bg-theme-hover px-1.5 py-0.5 text-xs">{n.row.code}</code>{" "}
                      {n.row.name}
                    </div>
                    <RemapComboBox
                      items={items}
                      value={remap[n.rowLine] ?? null}
                      onChange={(itemId) => setRemap((prev) => ({ ...prev, [n.rowLine]: itemId }))}
                    />
                  </div>
                  {n.suggestedItemName && remap[n.rowLine] == null && (
                    <p className="mt-1 text-xs text-warning">
                      Possível variação de "{n.suggestedItemName}" já cadastrado —{" "}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => setRemap((prev) => ({ ...prev, [n.rowLine]: n.suggestedItemId }))}
                      >
                        vincular
                      </button>
                      .
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-theme-1">Itens alterados ({preview.changedItems.length})</h3>
          {preview.changedItems.length === 0 ? (
            <p className="text-xs text-theme-3">Nenhuma alteração.</p>
          ) : (
            <div className="space-y-2">
              {preview.changedItems.map((c) => (
                <div key={c.rowLine} className="rounded-lg border border-theme-border p-2.5">
                  <div className="text-sm text-theme-1">
                    <code className="rounded-md border border-theme-border bg-theme-hover px-1.5 py-0.5 text-xs">{c.row.code}</code>{" "}
                    {c.row.name}
                  </div>
                  <table className="mt-1.5 w-full text-xs">
                    <tbody>
                      {c.diffs.map((d) => (
                        <tr key={d.field} className="border-t border-theme-border first:border-0">
                          <td className="py-1 pr-2 text-theme-3">{FIELD_LABELS[d.field] ?? d.field}</td>
                          <td className="py-1 pr-2 text-theme-3 line-through">{formatDiffValue(d.field, d.current)}</td>
                          <td className="py-1 text-theme-1">{formatDiffValue(d.field, d.new)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-theme-1">Itens ausentes no CSV ({effectiveMissing.length})</h3>
          {effectiveMissing.length === 0 ? (
            <p className="text-xs text-theme-3">Nenhum item ausente.</p>
          ) : (
            <div className="space-y-2">
              {effectiveMissing.map((m) => (
                <div
                  key={m.itemId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-theme-border p-2.5"
                >
                  <div className="text-sm text-theme-1">
                    <code className="rounded-md border border-theme-border bg-theme-hover px-1.5 py-0.5 text-xs">{m.code}</code> {m.name}{" "}
                    <span className="text-theme-3">({m.quantity} un.)</span>
                  </div>
                  <select
                    value={missingActions[m.itemId] ?? "keep"}
                    onChange={(e) => setMissingActions((prev) => ({ ...prev, [m.itemId]: e.target.value as MissingItemAction }))}
                    className="rounded-lg border border-theme-border bg-theme-surface px-2 py-1 text-xs text-theme-1 outline-none"
                  >
                    {(Object.keys(MISSING_ACTION_LABEL) as MissingItemAction[]).map((action) => (
                      <option key={action} value={action}>
                        {MISSING_ACTION_LABEL[action]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      <div className="mt-4 flex justify-end gap-2 border-t border-theme-border pt-4">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button variant="primary" onClick={handleConfirm} disabled={busy}>
          {busy ? "Aplicando..." : "Aplicar importação"}
        </Button>
      </div>
    </Modal>
  );
}
