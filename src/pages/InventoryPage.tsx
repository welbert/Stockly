import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { CategorySummary, ItemSummary } from "../lib/api";
import { deleteItem, getLowStockPercent, listCategories, listItems } from "../lib/api";
import { Button } from "../components/Button";
import { ConfirmModal } from "../components/ConfirmModal";
import { ItemFormModal } from "../components/ItemFormModal";
import { StockAdjustModal } from "../components/StockAdjustModal";
import { StockBadge } from "../components/StockBadge";
import { fmt } from "../lib/format";
import { logger } from "../logger";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();
}

export function InventoryPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [lowStockPercent, setLowStockPercent] = useState(20);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [editing, setEditing] = useState<ItemSummary | "new" | null>(null);
  const [adjusting, setAdjusting] = useState<ItemSummary | null>(null);
  const [toDelete, setToDelete] = useState<ItemSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function reload() {
    listItems()
      .then(setItems)
      .catch((err) => logger.error("falha ao listar itens", err));
    listCategories()
      .then(setCategories)
      .catch((err) => logger.error("falha ao listar categorias", err));
    getLowStockPercent()
      .then(setLowStockPercent)
      .catch((err) => logger.error("falha ao ler percentual de alerta", err));
  }

  useEffect(reload, []);

  const filtered = useMemo(() => {
    const term = normalize(search.trim());
    return items.filter((item) => {
      const matchesTerm = !term || normalize(item.code).includes(term) || normalize(item.name).includes(term);
      const matchesCategory =
        !categoryFilter ||
        (categoryFilter === "undefined" ? item.categoryId === null : item.categoryId === Number(categoryFilter));
      return matchesTerm && matchesCategory;
    });
  }, [items, search, categoryFilter]);

  async function handleDelete() {
    if (!toDelete) return;
    setDeleteError(null);
    try {
      await deleteItem(toDelete.id);
      setToDelete(null);
      reload();
    } catch (err) {
      logger.error("falha ao excluir item", err);
      setDeleteError(String(err));
    }
  }

  if (!user) return null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          placeholder="Buscar por código ou nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[220px] max-w-[340px] flex-1 rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="max-w-[200px] rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-1 outline-none"
        >
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="undefined">Categoria indefinida</option>
        </select>
        <div className="flex-1" />
        {user.isAdmin && (
          <Button variant="primary" onClick={() => setEditing("new")}>
            + Novo item
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-theme-border bg-theme-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-theme-border text-left text-xs uppercase tracking-wide text-theme-3">
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">Preço venda</th>
              <th className="px-4 py-3">Qtd. disponível</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr
                key={item.id}
                className={`border-b border-theme-border last:border-0 hover:bg-theme-hover ${!item.active ? "opacity-60" : ""}`}
              >
                <td className="px-4 py-3">
                  <code className="rounded-md border border-theme-border bg-theme-hover px-1.5 py-0.5 text-xs">
                    {item.code}
                  </code>
                </td>
                <td className="px-4 py-3 text-theme-1">{item.name}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-theme-hover px-2.5 py-0.5 text-xs font-semibold text-theme-3">
                    {item.categoryName ?? "Categoria indefinida"}
                  </span>
                </td>
                <td className="px-4 py-3 text-theme-1">{fmt(item.salePrice)}</td>
                <td className="px-4 py-3 text-theme-1">{item.quantity}</td>
                <td className="px-4 py-3">
                  {item.active ? (
                    <StockBadge item={item} lowStockPercent={lowStockPercent} />
                  ) : (
                    <span className="rounded-full bg-theme-hover px-2.5 py-0.5 text-xs font-semibold text-theme-3">
                      Inativo
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {user.isAdmin ? (
                    <>
                      <Button variant="ghost" className="mr-2" onClick={() => setEditing(item)}>
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-danger"
                        onClick={() => {
                          setDeleteError(null);
                          setToDelete(item);
                        }}
                      >
                        Excluir
                      </Button>
                    </>
                  ) : (
                    item.active && (
                      <Button variant="ghost" onClick={() => setAdjusting(item)}>
                        Ajustar estoque
                      </Button>
                    )
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-theme-3">
                  Nenhum item encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <ItemFormModal
          initial={editing === "new" ? undefined : editing}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {adjusting && (
        <StockAdjustModal
          item={adjusting}
          onSaved={() => {
            setAdjusting(null);
            reload();
          }}
          onClose={() => setAdjusting(null)}
        />
      )}

      {toDelete && (
        <ConfirmModal
          title="Excluir item"
          message={`Excluir ${toDelete.name} permanentemente? Isso não pode ser desfeito.`}
          confirmLabel="Excluir"
          danger
          error={deleteError}
          onConfirm={handleDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
