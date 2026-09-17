import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { updateTheme } from "../lib/api";
import { applyTheme, getStoredTheme, isKnownTheme, storeTheme, ThemeId } from "../theme";
import { logger } from "../logger";
import { useAuth } from "./AuthContext";

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<ThemeId>(getStoredTheme());

  // Antes do login (tela de login/primeiro uso) e depois do logout, o tema
  // vem só do localStorage. Assim que um usuário loga, o tema dele (banco)
  // passa a valer e também é espelhado no localStorage, pra a próxima tela
  // de login já abrir no tema que essa pessoa usa.
  useEffect(() => {
    if (user && isKnownTheme(user.theme) && user.theme !== theme) {
      setThemeState(user.theme);
      storeTheme(user.theme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function setTheme(next: ThemeId) {
    setThemeState(next);
    storeTheme(next);
    if (user) {
      updateTheme(next).catch((err) => logger.error("falha ao salvar tema do usuário", err));
    }
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
