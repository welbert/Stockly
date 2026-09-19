import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { DashboardGrid } from "../components/dashboard-cards/DashboardGrid";
import { getDashboardData, DashboardData } from "../lib/api";
import { logger } from "../logger";

/** Admin-only — guards itself with a redirect
 * since it's still reachable by URL even though the sidebar hides the link,
 * same pattern as `UsersPage`. */
export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    getDashboardData()
      .then(setData)
      .catch((err) => logger.error("falha ao carregar dados do dashboard", err));
  }, []);

  if (!user) return null;
  if (!user.isAdmin) return <Navigate to="/" replace />;

  if (!data) {
    return <div className="text-theme-3">Carregando...</div>;
  }

  return <DashboardGrid cardProps={{ data }} />;
}
