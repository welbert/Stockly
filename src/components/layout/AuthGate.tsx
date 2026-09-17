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
  const { user, loading } = useAuth();
  const [locked, setLocked] = useState(false);
  const { secondsRemaining } = useIdleTimer(user ? effectiveAutoLockMinutes(user) : null, () => setLocked(true));

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-theme-3">Carregando…</div>;
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <>
      <Outlet context={{ secondsUntilLock: secondsRemaining } satisfies AuthGateOutletContext} />
      {locked && <LockScreen user={user} onUnlock={() => setLocked(false)} />}
    </>
  );
}
