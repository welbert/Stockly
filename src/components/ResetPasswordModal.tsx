import { FormEvent, useState } from "react";
import type { UserProfile } from "../lib/api";
import { resetUserPassword } from "../lib/api";
import { logger } from "../logger";
import { Button } from "./Button";
import { Modal } from "./Modal";

interface ResetPasswordModalProps {
  target: UserProfile;
  onDone: () => void;
  onClose: () => void;
}

const inputClass =
  "w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft";

/** Admin-only, from `UsersPage`'s row actions — sets `target`'s password
 * directly, no old password required (`docs/future.md`'s "Reset another
 * user's password" gap). Separate from `UserFormModal`'s "Salvar" so
 * resetting a password is never accidentally bundled with, or skipped
 * because of, an unrelated name/role edit — its own deliberate action,
 * logged to `audit_log` as `password_reset`. */
export function ResetPasswordModal({ target, onDone, onClose }: ResetPasswordModalProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await resetUserPassword(target.id, newPassword);
      onDone();
    } catch (err) {
      logger.error("falha ao redefinir senha", target.id, err);
      setError(String(err));
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Redefinir senha" onClose={submitting ? undefined : onClose}>
      <form onSubmit={handleSubmit}>
        <p className="text-sm text-theme-2">
          Defina uma nova senha para <strong>{target.name}</strong>. A senha atual não é necessária.
        </p>
        <label className="mb-1.5 mt-4 block text-xs font-semibold text-theme-3">Nova senha</label>
        <input
          required
          autoFocus
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={submitting}
          className={inputClass}
        />
        <label className="mb-1.5 mt-3 block text-xs font-semibold text-theme-3">Confirmar nova senha</label>
        <input
          required
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={submitting}
          className={inputClass}
        />
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={submitting || !newPassword}>
            {submitting ? "Salvando…" : "Redefinir senha"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
