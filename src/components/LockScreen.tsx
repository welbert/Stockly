import { FormEvent, useState } from "react";
import type { UserProfile } from "../lib/api";
import { verifyPassword } from "../lib/api";
import { Button } from "./Button";
import { ConfirmModal } from "./ConfirmModal";

interface LockScreenProps {
  user: UserProfile;
  onUnlock: () => void;
  /** Ends the locked user's session outright and returns to the profile
   * picker — for when they're not around to type their own password back in
   * and someone else needs the machine now. */
  onLogout: () => void;
}

/** Sobrepõe a tela atual sem perder o estado dela — só pede a senha de volta. */
export function LockScreen({ user, onUnlock, onLogout }: LockScreenProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError(null);
    try {
      const ok = await verifyPassword(user.id, password);
      if (ok) {
        onUnlock();
      } else {
        setError("Senha incorreta.");
        setPassword("");
      }
    } catch {
      setError("Não foi possível verificar a senha.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <div data-modal-root className="fixed inset-0 z-50 flex items-center justify-center bg-theme-overlay px-4 backdrop-blur-sm">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm rounded-2xl border border-theme-border bg-theme-surface p-6 shadow-xl"
        >
          <div className="mb-4 flex flex-col items-center gap-2 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <p className="font-semibold text-theme-1">{user.name}</p>
            <p className="text-xs text-theme-3">Sessão bloqueada por inatividade</p>
          </div>
          <label className="mb-1 block text-xs font-semibold text-theme-3">Senha</label>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
          />
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
          <Button type="submit" variant="primary" className="mt-4 w-full justify-center" disabled={checking || !password}>
            Desbloquear
          </Button>
          <button
            type="button"
            onClick={() => setConfirmLogout(true)}
            className="mt-3 w-full text-center text-xs text-theme-3 hover:text-theme-1 hover:underline"
          >
            Não é {user.name}? Sair e trocar de usuário
          </button>
        </form>
      </div>

      {confirmLogout && (
        <ConfirmModal
          title="Sair e trocar de usuário?"
          message={`Isso encerra a sessão de ${user.name} nesta tela e volta pro login. Qualquer coisa em andamento (ex.: uma venda ainda não finalizada) é perdida.`}
          confirmLabel="Sair"
          danger
          onConfirm={() => {
            setConfirmLogout(false);
            onLogout();
          }}
          onCancel={() => setConfirmLogout(false)}
        />
      )}
    </>
  );
}
