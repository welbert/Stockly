import { FormEvent, useEffect, useState } from "react";
import type { CategorySummary } from "../lib/api";
import { createCategory, deleteCategory, listCategories, renameCategory } from "../lib/api";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { logger } from "../logger";

interface CategoryManagerModalProps {
  onChanged: () => void;
  onClose: () => void;
}

/** CRUD de categorias — exclusivo do Administrador. */
export function CategoryManagerModal({ onChanged, onClose }: CategoryManagerModalProps) {
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reload() {
    listCategories()
      .then(setCategories)
      .catch((err) => logger.error("falha ao listar categorias", err));
  }

  useEffect(reload, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createCategory(newName);
      setNewName("");
      reload();
      onChanged();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleRename(id: number) {
    setError(null);
    try {
      await renameCategory(id, editingName);
      setEditingId(null);
      reload();
      onChanged();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleDelete(id: number) {
    setError(null);
    try {
      await deleteCategory(id);
      reload();
      onChanged();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <Modal title="Categorias" onClose={onClose}>
      <form onSubmit={handleCreate} className="mb-4 flex gap-2">
        <input
          required
          placeholder="Nova categoria"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
        />
        <Button type="submit" variant="primary">
          Adicionar
        </Button>
      </form>

      {error && <p className="mb-2 text-xs text-danger">{error}</p>}

      <ul className="flex max-h-64 flex-col gap-1 overflow-auto">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-theme-hover">
            {editingId === c.id ? (
              <>
                <input
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  className="flex-1 rounded-md border border-theme-border bg-theme-bg px-2 py-1 text-sm text-theme-1 outline-none"
                />
                <Button variant="ghost" onClick={() => handleRename(c.id)}>
                  Salvar
                </Button>
                <Button variant="ghost" onClick={() => setEditingId(null)}>
                  Cancelar
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-theme-1">{c.name}</span>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditingId(c.id);
                    setEditingName(c.name);
                  }}
                >
                  Renomear
                </Button>
                <Button variant="ghost" className="text-danger" onClick={() => handleDelete(c.id)}>
                  Excluir
                </Button>
              </>
            )}
          </li>
        ))}
        {categories.length === 0 && <li className="px-2 py-1.5 text-sm text-theme-3">Nenhuma categoria cadastrada.</li>}
      </ul>
    </Modal>
  );
}
