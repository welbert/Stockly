import { useEffect, useState, type MouseEvent } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { NavigationGuardContext } from "../../context/NavigationGuardContext";
import { useToast } from "../../context/ToastContext";
import { useUpdater } from "../../context/UpdaterContext";
import { getStoreName, runBackup } from "../../lib/api";
import { REPORT_GROUPS, findReport, reportPath } from "../../lib/reportsCatalog";
import { logger } from "../../logger";
import { ConfirmModal } from "../ConfirmModal";
import type { AuthGateOutletContext } from "./AuthGate";

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface NavLinkItem {
  kind: "link";
  to: string;
  label: string;
  icon?: string;
}

/** A menu item that expands in place instead of navigating ("Menu lateral
 * expansível") — `children` can themselves be groups, so this nests to any
 * depth. Built generic on purpose: Relatórios
 * is the first user, but any future menu with sub-screens (e.g. a "Cadastros"
 * group) reuses the same `NavItemRenderer` below instead of a bespoke toggle. */
interface NavGroupItem {
  kind: "group";
  id: string;
  label: string;
  icon?: string;
  children: NavItem[];
}

type NavItem = NavLinkItem | NavGroupItem;

const REPORTS_NAV_GROUP: NavGroupItem = {
  kind: "group",
  id: "relatorios",
  label: "Relatórios",
  icon: "📊",
  children: REPORT_GROUPS.map((g) => ({
    kind: "group",
    id: `relatorios-${g.id}`,
    label: g.label,
    children: g.reports.map((r) => ({ kind: "link", to: reportPath(r.slug), label: r.label })),
  })),
};

/** `group` depende do papel: no mockup do Admin, Configurações fica junto de
 * Usuários sob "Administração"; no mockup do Usuário comum (sem Usuários no
 * menu), Configurações fica sob "Operação" junto do que ele usa no dia a dia.
 * A ordem do array já reflete a ordem visual correta pros dois papéis —
 * ver comentário em "Adding features" do CLAUDE.md antes de reordenar. */
const NAV_ITEMS: { item: NavItem; adminOnly: boolean; group: (isAdmin: boolean) => string }[] = [
  { item: { kind: "link", to: "/dashboard", label: "Dashboard", icon: "▦" }, adminOnly: true, group: () => "Operação" },
  { item: { kind: "link", to: "/venda", label: "Venda", icon: "🛒" }, adminOnly: false, group: () => "Operação" },
  { item: { kind: "link", to: "/estoque", label: "Estoque", icon: "📦" }, adminOnly: false, group: () => "Operação" },
  { item: { kind: "link", to: "/devedores", label: "Devedores", icon: "💳" }, adminOnly: false, group: () => "Operação" },
  { item: { kind: "link", to: "/historico", label: "Histórico de vendas", icon: "🧾" }, adminOnly: false, group: () => "Operação" },
  { item: REPORTS_NAV_GROUP, adminOnly: true, group: () => "Operação" },
  { item: { kind: "link", to: "/usuarios", label: "Usuários", icon: "👤" }, adminOnly: true, group: () => "Administração" },
  {
    item: { kind: "link", to: "/configuracoes", label: "Configurações", icon: "⚙️" },
    adminOnly: false,
    group: (isAdmin: boolean) => (isAdmin ? "Administração" : "Operação"),
  },
];

/** Título/subtítulo do topbar por rota — mesmo texto do `titles` do mockup,
 * ajustado ao que a tela realmente tem hoje. Some rota nova, some entrada aqui. */
const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/estoque": { title: "Estoque", subtitle: "Itens cadastrados e categorias" },
  "/dashboard": { title: "Dashboard", subtitle: "Visão geral do estoque e das vendas" },
  "/venda": { title: "Venda", subtitle: "Registro rápido de venda, otimizado para teclado" },
  "/devedores": { title: "Devedores (Crediário)", subtitle: "Saldo em aberto, histórico de vendas fiado e pagamentos por cliente" },
  "/historico": { title: "Histórico de vendas", subtitle: "Busca por recibo, cliente ou operador, e cancelamento/estorno" },
  "/configuracoes": { title: "Configurações", subtitle: "Tema e bloqueio automático" },
  "/usuarios": { title: "Usuários", subtitle: "Gestão de administradores e usuários" },
};

const REPORT_PATH_PREFIX = "/relatorios/";

/** `run_backup` is a no-op when no `backup_folder` is configured yet — see
 * that command's doc comment for why this fires regardless of which profile
 * is logged in, unlike every other backup command (Admin-only). Runs once on
 * mount, then every 10 minutes for as long as the app stays open, since
 * Stockly tends to stay open a whole shift. */
const BACKUP_INTERVAL_MS = 10 * 60 * 1000;

/** Whether `pathname` matches a link anywhere under this group, at any
 * depth — a group defaults open when this is true, so landing on a report
 * directly (not via the nav) still shows it nested under the right groups. */
function containsPath(item: NavGroupItem, pathname: string): boolean {
  return item.children.some((child) => (child.kind === "link" ? child.to === pathname : containsPath(child, pathname)));
}

interface NavItemRendererProps {
  item: NavItem;
  depth: number;
  pathname: string;
  /** Explicit open/closed per group id, only once the admin has clicked it —
   * before that, a group defaults open when it contains the active route. */
  manualOpen: Record<string, boolean>;
  onToggle: (id: string, defaultOpen: boolean) => void;
  onNavigate: (to: string, e: MouseEvent) => void;
}

/** Defined at module scope (not inside `AppShell`) on purpose — an inline
 * component would get a new identity every `AppShell` render (e.g. every
 * idle-timer tick) and React would remount the whole nav tree, silently
 * collapsing every open group each time. */
function NavItemRenderer({ item, depth, pathname, manualOpen, onToggle, onNavigate }: NavItemRendererProps) {
  const paddingLeft = 12 + depth * 16;

  if (item.kind === "link") {
    return (
      <NavLink
        to={item.to}
        onClick={(e) => onNavigate(item.to, e)}
        style={{ paddingLeft }}
        className={({ isActive }) =>
          `flex items-center gap-2.5 rounded-lg py-2 pr-3 text-sm ${isActive ? "bg-sidebar-active text-white" : "hover:bg-sidebar-hover hover:text-white"}`
        }
      >
        {item.icon && (
          <span className="w-4 flex-shrink-0 text-center text-[13px]" aria-hidden>
            {item.icon}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {item.to === "/venda" && (
          <span className="flex-shrink-0 rounded border border-white/20 px-1 text-[10px] font-semibold text-sidebar-label">F1</span>
        )}
      </NavLink>
    );
  }

  const defaultOpen = containsPath(item, pathname);
  const isOpen = manualOpen[item.id] ?? defaultOpen;

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(item.id, defaultOpen)}
        style={{ paddingLeft }}
        className="flex w-full items-center gap-2.5 rounded-lg py-2 pr-3 text-left text-sm text-sidebar-text hover:bg-sidebar-hover hover:text-white"
      >
        {item.icon && (
          <span className="w-4 flex-shrink-0 text-center text-[13px]" aria-hidden>
            {item.icon}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <span className={`flex-shrink-0 text-[10px] transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden>
          ▸
        </span>
      </button>
      {isOpen && (
        <div className="mt-0.5">
          {item.children.map((child) => (
            <NavItemRenderer
              key={child.kind === "link" ? child.to : child.id}
              item={child}
              depth={depth + 1}
              pathname={pathname}
              manualOpen={manualOpen}
              onToggle={onToggle}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { secondsUntilLock } = useOutletContext<AuthGateOutletContext>();
  const { currentVersion } = useUpdater();
  const [storeName, setStoreName] = useState("");
  const [routeDirty, setRouteDirty] = useState(false);
  const [pendingNav, setPendingNav] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // A store name changed in Configurações only shows up here after the app
    // restarts — fetched once per session, same as `currentVersion` above
    // (`UpdaterProvider` fetches that one, shared instead of duplicated here).
    getStoreName()
      .then(setStoreName)
      .catch((err) => logger.error("falha ao ler nome da loja", err));
  }, []);

  useEffect(() => {
    function backup() {
      runBackup().catch((err) => {
        logger.error("falha ao rodar backup automático do banco", err);
        showToast({ type: "error", title: "Falha ao fazer backup do banco de dados", message: String(err) });
      });
    }
    backup();
    const interval = setInterval(backup, BACKUP_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "F1") return;
      if (document.querySelector("[data-modal-root]")) return;
      e.preventDefault();
      navigate("/venda");
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  if (!user) return null;

  const page = pathname.startsWith(REPORT_PATH_PREFIX)
    ? (() => {
        const report = findReport(pathname.slice(REPORT_PATH_PREFIX.length));
        return report ? { title: report.label, subtitle: report.subtitle } : undefined;
      })()
    : PAGE_META[pathname];

  function handleNavigate(to: string, e: MouseEvent) {
    if (routeDirty && to !== pathname) {
      e.preventDefault();
      setPendingNav(to);
    }
  }

  function handleToggleGroup(id: string, defaultOpen: boolean) {
    setManualOpen((prev) => ({ ...prev, [id]: !(prev[id] ?? defaultOpen) }));
  }

  return (
    <div className="grid h-screen grid-cols-[220px_1fr]">
      <aside className="flex h-full min-h-0 flex-col gap-1 bg-sidebar-bg p-4 text-sidebar-text">
        <div className="mb-4 flex items-center gap-2 px-1 text-sm font-bold text-white">
          <span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-br from-primary to-primary-hover" />
          {storeName || "Bora Vender"}
        </div>

        <nav className="sidebar-nav flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden">
          {(() => {
            const entries = NAV_ITEMS.filter((entry) => !entry.adminOnly || user.isAdmin);
            let lastGroup: string | null = null;
            return entries.map((entry, index) => {
              const group = entry.group(user.isAdmin);
              const showLabel = group !== lastGroup;
              lastGroup = group;
              const key = entry.item.kind === "link" ? entry.item.to : entry.item.id;
              return (
                <div key={key}>
                  {showLabel && (
                    <div
                      className={`px-2 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-label ${index === 0 ? "pt-0" : "pt-2.5"}`}
                    >
                      {group}
                    </div>
                  )}
                  <NavItemRenderer
                    item={entry.item}
                    depth={0}
                    pathname={pathname}
                    manualOpen={manualOpen}
                    onToggle={handleToggleGroup}
                    onNavigate={handleNavigate}
                  />
                </div>
              );
            });
          })()}
        </nav>

        <div className="mt-auto border-t border-white/10 pt-3 text-xs">
          <div className="flex items-center gap-2 px-1">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-semibold text-white">{user.name}</p>
              <p className="text-[11px] text-sidebar-text">{user.isAdmin ? "Administrador" : "Usuário"}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-sidebar-text">
            <span>{currentVersion ? `Stockly - v${currentVersion}` : ""}</span>
            <button onClick={logout} className="text-sidebar-text hover:text-white">
              Sair
            </button>
          </div>
        </div>
      </aside>
      <div className="flex min-h-0 flex-col">
        {page && (
          <header className="flex items-center justify-between border-b border-theme-border bg-theme-surface px-6 py-3.5">
            <h1 className="text-base font-semibold text-theme-1">
              {page.title} <span className="ml-2 text-xs font-normal text-theme-3">{page.subtitle}</span>
            </h1>
            <div className="flex items-center gap-2">
              {secondsUntilLock !== null && (
                <span className="flex items-center gap-1.5 rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-semibold text-warning">
                  🔒 Bloqueia em {formatCountdown(secondsUntilLock)}
                </span>
              )}
              <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
                Perfil: {user.isAdmin ? "Administrador" : "Usuário"}
              </span>
            </div>
          </header>
        )}
        <main className="min-h-0 flex-1 overflow-auto p-6">
          <NavigationGuardContext.Provider value={setRouteDirty}>
            <Outlet />
          </NavigationGuardContext.Provider>
        </main>
      </div>

      {pendingNav && (
        <ConfirmModal
          title="Sair desta tela?"
          message="Há uma ação em andamento aqui — saindo agora, o que já foi feito nesta tela será perdido."
          confirmLabel="Sair mesmo assim"
          danger
          onConfirm={() => {
            const to = pendingNav;
            setRouteDirty(false);
            setPendingNav(null);
            navigate(to);
          }}
          onCancel={() => setPendingNav(null)}
        />
      )}
    </div>
  );
}
