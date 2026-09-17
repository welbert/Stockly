import { FormEvent, useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { UserProfile } from "../lib/api";
import { createUser, updateUser } from "../lib/api";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { ConfirmModal } from "./ConfirmModal";
import { Modal } from "./Modal";
import { logger } from "../logger";

interface UserFormModalProps {
  /** Presente = editando um usuário existente; ausente = criando um novo. */
  initial?: UserProfile;
  onSaved: (user: UserProfile) => void;
  onClose: () => void;
}

export function UserFormModal({ initial, onSaved, onClose }: UserFormModalProps) {
  const { user: loggedInUser } = useAuth();
  const editing = Boolean(initial);
  // Ninguém edita o próprio papel de administrador nem o próprio status —
  // isso é bloqueado no backend também (separação de privilégios), mas já
  // trava aqui pra não deixar clicar numa opção que vai ser recusada depois.
  const editingSelf = Boolean(initial && loggedInUser && initial.id === loggedInUser.id);
  const [name, setName] = useState(initial?.name ?? "");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(initial?.isAdmin ?? false);
  const [active, setActive] = useState(initial?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmElevate, setConfirmElevate] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const dirty =
    name !== (initial?.name ?? "") ||
    password !== "" ||
    isAdmin !== (initial?.isAdmin ?? false) ||
    active !== (initial?.active ?? true);

  function requestClose() {
    if (dirty) {
      setConfirmDiscard(true);
    } else {
      onClose();
    }
  }

  async function save() {
    setSubmitting(true);
    setError(null);
    try {
      const saved = initial
        ? await updateUser({
            id: initial.id,
            name,
            isAdmin,
            active,
            autoLockMinutes: initial.autoLockMinutes,
          })
        : await createUser({ name, password, isAdmin });
      onSaved(saved);
    } catch (err) {
      logger.error("falha ao salvar usuário", err);
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const elevating = editing && initial && !initial.isAdmin && isAdmin;
    if (elevating) {
      setConfirmElevate(true);
      return;
    }
    save();
  }

  return (
    <>
      <Modal title={editing ? "Editar usuário" : "Novo usuário"} onClose={requestClose}>
        <form onSubmit={handleSubmit}>
          <Field label="Nome">
            <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Field>
          {!editing && (
            <Field label="Senha">
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </Field>
          )}
          <div className="mb-1.5">
            <Checkbox label="Administrador" checked={isAdmin} disabled={editingSelf} onChange={setIsAdmin} />
          </div>
          {editing && (
            <div className="mb-1.5">
              <Checkbox label="Ativo" checked={active} disabled={editingSelf} onChange={setActive} />
            </div>
          )}
          {editingSelf && (
            <p className="mb-2 text-xs text-theme-3">
              Você não pode alterar seu próprio papel ou status — peça para outro administrador.
            </p>
          )}
          {error && <p className="mb-2 text-xs text-danger">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={requestClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              Salvar
            </Button>
          </div>
        </form>
      </Modal>

      {confirmElevate && (
        <ConfirmModal
          title="Tornar administrador"
          message={`Tem certeza que quer tornar ${name} administrador?`}
          confirmLabel="Tornar administrador"
          onConfirm={() => {
            setConfirmElevate(false);
            save();
          }}
          onCancel={() => setConfirmElevate(false)}
        />
      )}

      {confirmDiscard && (
        <ConfirmModal
          title="Descartar alterações?"
          message="Você tem alterações não salvas neste usuário. Fechar agora descarta o que foi digitado."
          confirmLabel="Descartar"
          danger
          onConfirm={() => {
            setConfirmDiscard(false);
            onClose();
          }}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}
    </>
  );
}

const inputClass =
  "w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs font-semibold text-theme-3">{label}</label>
      {children}
    </div>
  );
}
