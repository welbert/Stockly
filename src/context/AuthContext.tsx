import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import * as api from "../lib/api";
import type { UserProfile } from "../lib/api";
import { logger } from "../logger";

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  login: (userId: number, password: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
  setUser: (user: UserProfile) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getActiveUser()
      .then(setUser)
      .catch((err) => logger.error("falha ao verificar sessão ativa", err))
      .finally(() => setLoading(false));
  }, []);

  async function login(userId: number, password: string) {
    const profile = await api.login(userId, password);
    setUser(profile);
    return profile;
  }

  async function logout() {
    await api.logout();
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, login, logout, setUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
