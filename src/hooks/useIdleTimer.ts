import { useEffect, useRef, useState } from "react";

const ACTIVITY_EVENTS = ["mousemove", "keydown", "click"] as const;

interface UseIdleTimerResult {
  /** Segundos até o bloqueio — só preenchido dentro da janela de aviso (últimos `warningSeconds`); `null` fora dela. */
  secondsRemaining: number | null;
}

/** Chama `onIdle` depois de `timeoutMinutes` sem interação com o documento.
 * `null`/`0` desativa (nunca bloqueia). Qualquer clique, tecla ou movimento
 * do mouse reseta a contagem do zero. Nos últimos `warningSeconds` antes do
 * bloqueio, `secondsRemaining` passa a contar regressivamente (pra mostrar um
 * aviso) — fora dessa janela fica `null` de propósito, pra não recalcular/
 * re-renderizar a cada movimento enquanto a pessoa está de fato ativa. */
export function useIdleTimer(timeoutMinutes: number | null, onIdle: () => void, warningSeconds = 30): UseIdleTimerResult {
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    setSecondsRemaining(null);
    if (!timeoutMinutes) return;

    const timeoutMs = timeoutMinutes * 60_000;
    let lockTimer: ReturnType<typeof setTimeout>;
    let warningTimer: ReturnType<typeof setTimeout>;
    let tickInterval: ReturnType<typeof setInterval> | null = null;

    function clearAll() {
      clearTimeout(lockTimer);
      clearTimeout(warningTimer);
      if (tickInterval) clearInterval(tickInterval);
    }

    function startWarning() {
      let remaining = warningSeconds;
      setSecondsRemaining(remaining);
      tickInterval = setInterval(() => {
        remaining -= 1;
        setSecondsRemaining(Math.max(remaining, 0));
        if (remaining <= 0 && tickInterval) clearInterval(tickInterval);
      }, 1000);
    }

    function reset() {
      clearAll();
      setSecondsRemaining(null);
      const warningDelayMs = Math.max(timeoutMs - warningSeconds * 1000, 0);
      warningTimer = setTimeout(startWarning, warningDelayMs);
      lockTimer = setTimeout(() => onIdleRef.current(), timeoutMs);
    }

    ACTIVITY_EVENTS.forEach((event) => document.addEventListener(event, reset));
    reset();

    return () => {
      ACTIVITY_EVENTS.forEach((event) => document.removeEventListener(event, reset));
      clearAll();
    };
  }, [timeoutMinutes, warningSeconds]);

  return { secondsRemaining };
}
