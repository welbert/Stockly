import { FormEvent, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { useAuth } from "../context/AuthContext";
import { importBackup, verifyPassword } from "../lib/api";
import { logger } from "../logger";
import { Button } from "./Button";
import { Modal } from "./Modal";

interface RestoreBackupModalProps {
  /** Path picked from the file dialog, already known to exist — this modal
   * only owns the destructive confirm step. */
  path: string;
  onClose: () => void;
}

/** Restaurar backup: Admin-only page already gates *who* can reach this, so
 * this modal's own password field is the app's "ações sensíveis" group 3
 * reconfirmation — a guard against an accidental click, not authorizing a
 * different person. `verifyPassword` checks the **active**
 * session's own password (`user.id`), never an `authorizerId` picker like
 * `DiscountModal`'s group 1 flow. On success, `importBackup` overwrites the
 * live database file and the app relaunches right away to reopen it fresh —
 * there's no "success" state to show, the window just restarts. */
export function RestoreBackupModal({ path, onClose }: RestoreBackupModalProps) {
  const { user } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setRestoring(true);
    try {
      const ok = await verifyPassword(user.id, password);
      if (!ok) {
        setError("Senha incorreta");
        setRestoring(false);
        return;
      }
      await importBackup(path);
      await relaunch();
    } catch (err) {
      logger.error("falha ao restaurar backup", path, err);
      setError("Não foi possível restaurar esse backup");
      setRestoring(false);
    }
  }

  return (
    <Modal title="Restaurar backup" onClose={restoring ? undefined : onClose}>
      <form onSubmit={handleSubmit}>
        <p className="text-sm text-theme-2">
          Isso vai substituir <strong>todo</strong> o banco de dados atual — itens, vendas, clientes, usuários — pelos
          dados desse arquivo. Essa ação não pode ser desfeita, e o app reinicia sozinho em seguida.
        </p>
        <label className="mb-1 mt-4 block text-xs font-semibold text-theme-3">Confirme sua senha</label>
        <input
          type="password"
          autoFocus
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={restoring}
          className="w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
        />
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={restoring}>
            Cancelar
          </Button>
          <Button type="submit" variant="danger" disabled={restoring || !password}>
            {restoring ? "Restaurando…" : "Restaurar e reiniciar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
