import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { UserProfile } from "../lib/api";
import { deleteUser, listUsers } from "../lib/api";
import { Button } from "../components/Button";
import { ConfirmModal } from "../components/ConfirmModal";
import { ContextMenu, ContextMenuItem } from "../components/ContextMenu";
import { UserFormModal } from "../components/UserFormModal";
import { fmtDateTime } from "../lib/format";
import { logger } from "../logger";

export function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [editing, setEditing] = useState<UserProfile | "new" | null>(null);
  const [toDelete, setToDelete] = useState<UserProfile | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; actions: ContextMenuItem[] } | null>(null);

  function reload() {
    listUsers()
      .then(setUsers)
      .catch((err) => logger.error("falha ao listar usuários", err));
  }

  useEffect(() => {
    if (user?.isAdmin) reload();
  }, [user]);

  if (!user?.isAdmin) {
    return <Navigate to="/" replace />;
  }

  function userActions(u: UserProfile): ContextMenuItem[] {
    const actions: ContextMenuItem[] = [{ label: "Editar", onSelect: () => setEditing(u) }];
    if (u.id !== user!.id) {
      actions.push({
        label: "Excluir",
        danger: true,
        onSelect: () => {
          setDeleteError(null);
          setToDelete(u);
        },
      });
    }
    return actions;
  }

  async function handleDelete() {
    if (!toDelete) return;
    setDeleteError(null);
    try {
      await deleteUser(toDelete.id);
      setToDelete(null);
      reload();
    } catch (err) {
      logger.error("falha ao excluir usuário", err);
      setDeleteError(String(err));
    }
  }

  return (
    <div>
      <div className="mb-6 flex justify-end">
        <Button variant="primary" onClick={() => setEditing("new")}>
          + Novo usuário
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-theme-border bg-theme-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-theme-border text-left text-xs uppercase tracking-wide text-theme-3">
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Papel</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Último login</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                className="border-b border-theme-border last:border-0 hover:bg-theme-hover"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, actions: userActions(u) });
                }}
              >
                <td className="px-4 py-3 text-theme-1">{u.name}</td>
                <td className="px-4 py-3">
                  <Badge tone={u.isAdmin ? "admin" : "neutral"}>{u.isAdmin ? "Administrador" : "Usuário"}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={u.active ? "success" : "neutral"}>{u.active ? "Ativo" : "Desativado"}</Badge>
                </td>
                <td className="px-4 py-3 text-theme-3">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "Nunca"}</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" className="mr-2" onClick={() => setEditing(u)}>
                    Editar
                  </Button>
                  {u.id !== user.id && (
                    <Button
                      variant="ghost"
                      className="text-danger"
                      onClick={() => {
                        setDeleteError(null);
                        setToDelete(u);
                      }}
                    >
                      Excluir
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <UserFormModal
          initial={editing === "new" ? undefined : editing}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {toDelete && (
        <ConfirmModal
          title="Excluir usuário"
          message={`Excluir ${toDelete.name} permanentemente? Isso não pode ser desfeito.`}
          confirmLabel="Excluir"
          danger
          error={deleteError}
          onConfirm={handleDelete}
          onCancel={() => setToDelete(null)}
        />
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.actions}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

function Badge({ tone, children }: { tone: "admin" | "success" | "neutral"; children: React.ReactNode }) {
  const toneClass =
    tone === "admin"
      ? "bg-primary-soft text-primary"
      : tone === "success"
        ? "bg-success/10 text-success"
        : "bg-theme-hover text-theme-3";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${toneClass}`}>{children}</span>;
}
