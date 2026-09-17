import { useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { effectiveAutoLockMinutes } from "../../lib/api";
import { useIdleTimer } from "../../hooks/useIdleTimer";
import { LoginPage } from "../../pages/LoginPage";
import { LockScreen } from "../LockScreen";

export interface AuthGateOutletContext {
  /** Segundos até o bloqueio por inatividade; `null` fora da janela de aviso (ver useIdleTimer). */
  secondsUntilLock: number | null;
}

export function AuthGate() {
  const { user, loading, logout } = useAuth();
  const [locked, setLocked] = useState(false);
  const { secondsRemaining } = useIdleTimer(user ? effectiveAutoLockMinutes(user) : null, () => setLocked(true));

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-theme-3">Carregando…</div>;
  }

  if (!user) {
    return <LoginPage />;
  }

  // `locked` must be reset here, not left for the `!user` branch above to
  // implicitly "clear" — this component never unmounts on logout (only its
  // return value switches to `<LoginPage/>`), so once a *different* profile
  // logs back in, a stale `locked=true` would immediately re-show the lock
  // screen over their fresh session.
  async function handleLogoutFromLock() {
    setLocked(false);
    await logout();
  }

  return (
    <>
      <Outlet context={{ secondsUntilLock: secondsRemaining } satisfies AuthGateOutletContext} />
      {locked && <LockScreen user={user} onUnlock={() => setLocked(false)} onLogout={handleLogoutFromLock} />}
    </>
  );
}
