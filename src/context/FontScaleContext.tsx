import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { updateFontScale } from "../lib/api";
import { applyFontScale, FontScaleId, getStoredFontScale, isKnownFontScale, storeFontScale } from "../fontScale";
import { logger } from "../logger";
import { useAuth } from "./AuthContext";

interface FontScaleContextValue {
  fontScale: FontScaleId;
  setFontScale: (scale: FontScaleId) => void;
}

const FontScaleContext = createContext<FontScaleContextValue | null>(null);

/** Same lifecycle as `ThemeContext`: before login (primeiro uso/login/lock)
 * only the localStorage value applies; once a user logs in, their own saved
 * preference (banco) takes over and is mirrored back into localStorage, so
 * the next login screen already opens at the size that profile uses. */
export function FontScaleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [fontScale, setFontScaleState] = useState<FontScaleId>(getStoredFontScale());

  useEffect(() => {
    if (user && isKnownFontScale(user.fontScale) && user.fontScale !== fontScale) {
      setFontScaleState(user.fontScale);
      storeFontScale(user.fontScale);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    applyFontScale(fontScale);
  }, [fontScale]);

  function setFontScale(next: FontScaleId) {
    setFontScaleState(next);
    storeFontScale(next);
    if (user) {
      updateFontScale(next).catch((err) => logger.error("falha ao salvar tamanho de fonte do usuário", user.id, err));
    }
  }

  return <FontScaleContext.Provider value={{ fontScale, setFontScale }}>{children}</FontScaleContext.Provider>;
}

export function useFontScale() {
  const ctx = useContext(FontScaleContext);
  if (!ctx) throw new Error("useFontScale must be used within FontScaleProvider");
  return ctx;
}
