import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { findReport } from "../lib/reportsCatalog";

/** Blank screen every Relatórios sub-route renders to for now — the menu
 * (`AppShell`'s nav tree) is what this pass is actually building; each
 * report gets real content later, one at a time, without touching routing
 * or navigation again (see `lib/reportsCatalog.ts`). */
export function ReportPlaceholderPage() {
  const { user } = useAuth();
  const { slug } = useParams<{ slug: string }>();
  const report = findReport(slug);

  if (!user?.isAdmin || !report) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-1 text-center">
      <p className="text-sm font-semibold text-theme-1">{report.label}</p>
      <p className="text-xs text-theme-3">Relatório ainda não implementado — {report.subtitle.toLowerCase()}.</p>
    </div>
  );
}
