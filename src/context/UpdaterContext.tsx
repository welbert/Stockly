import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { UpdateModal } from "../components/UpdateModal";
import { logger } from "../logger";

/** Delay before the automatic startup check — "alguns segundos depois" the
 * app opens, not blocking initial render. */
const AUTO_CHECK_DELAY_MS = 5000;

export type UpdatePhase =
  | { phase: "available"; currentVersion: string; newVersion: string }
  | { phase: "downloading"; currentVersion: string; newVersion: string; downloaded: number; total: number }
  | { phase: "ready" };

interface UpdaterContextValue {
  phase: UpdatePhase | null;
  /** The running binary's version, once known — `null` until `getVersion()`
   * resolves. Used by `SettingsPage`'s "Versão" line. */
  currentVersion: string | null;
  /** Runs `check()` and, if a new version exists, sets `phase` to
   * `"available"` (same as the automatic startup check). Returns whether an
   * update was found, so a manual "Verificar atualizações" button can show
   * its own "já está na versão mais recente" feedback — the automatic check
   * stays silent either way. */
  checkNow: () => Promise<boolean>;
  startUpdate: () => Promise<void>;
  /** "Adiar" — only hides the modal for this session; the next app start
   * checks again from scratch, no persisted "don't ask again" flag. */
  dismiss: () => void;
}

const UpdaterContext = createContext<UpdaterContextValue | null>(null);

/** Autoupdate — mounted once at the app
 * root (`App.tsx`, outside `AuthGate`) so the startup check runs and the
 * modal can show up even before anyone logs in, not just once `AppShell` is
 * reached. Failure at any step (no internet, endpoint down) is only logged,
 * never surfaced as an error to the cashier — matches `run_backup`'s same
 * "never block the app" reasoning. In `pnpm tauri dev` `check()` always
 * rejects (the dev binary is unsigned and doesn't match the endpoint's
 * version) — expected, not a bug. */
export function UpdaterProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<UpdatePhase | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const pendingUpdateRef = useRef<Update | null>(null);

  useEffect(() => {
    getVersion()
      .then(setCurrentVersion)
      .catch((err) => logger.error("falha ao ler a versão do app", err));
  }, []);

  async function checkNow(): Promise<boolean> {
    try {
      const update = await check();
      if (!update) return false;
      pendingUpdateRef.current = update;
      setCurrentVersion(update.currentVersion);
      setPhase({ phase: "available", currentVersion: update.currentVersion, newVersion: update.version });
      return true;
    } catch (err) {
      logger.error("falha ao verificar atualização", err);
      return false;
    }
  }

  useEffect(() => {
    const timer = setTimeout(checkNow, AUTO_CHECK_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startUpdate() {
    const pending = pendingUpdateRef.current;
    if (!pending || phase?.phase !== "available") return;
    const { currentVersion: from, newVersion: to } = phase;
    let downloaded = 0;
    let total = 0;
    try {
      await pending.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
          setPhase({ phase: "downloading", currentVersion: from, newVersion: to, downloaded: 0, total });
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          setPhase({ phase: "downloading", currentVersion: from, newVersion: to, downloaded, total });
        } else if (event.event === "Finished") {
          setPhase({ phase: "ready" });
        }
      });
      await relaunch();
    } catch (err) {
      logger.error("falha ao baixar/instalar atualização", err);
      setPhase(null);
    }
  }

  function dismiss() {
    setPhase(null);
  }

  return (
    <UpdaterContext.Provider value={{ phase, currentVersion, checkNow, startUpdate, dismiss }}>
      {children}
      {phase && <UpdateModal phase={phase} onConfirm={startUpdate} onDismiss={dismiss} />}
    </UpdaterContext.Provider>
  );
}

export function useUpdater(): UpdaterContextValue {
  const ctx = useContext(UpdaterContext);
  if (!ctx) throw new Error("useUpdater() precisa estar dentro de um UpdaterProvider");
  return ctx;
}
