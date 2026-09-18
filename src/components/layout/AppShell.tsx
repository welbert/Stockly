import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { NavigationGuardContext } from "../../context/NavigationGuardContext";
import { getStoreName } from "../../lib/api";
import { logger } from "../../logger";
import { ConfirmModal } from "../ConfirmModal";
import type { AuthGateOutletContext } from "./AuthGate";

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** `group` depende do papel: no mockup do Admin, Configurações fica junto de
 * Usuários sob "Administração"; no mockup do Usuário comum (sem Usuários no
 * menu), Configurações fica sob "Operação" junto do que ele usa no dia a dia.
 * A ordem do array já reflete a ordem visual correta pros dois papéis —
 * ver comentário em "Adding features" do CLAUDE.md antes de reordenar. */
const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: "▦", adminOnly: true, group: () => "Operação" },
  { to: "/venda", label: "Venda", icon: "🛒", adminOnly: false, group: () => "Operação" },
  { to: "/", label: "Estoque", icon: "📦", adminOnly: false, group: () => "Operação" },
  { to: "/devedores", label: "Devedores", icon: "💳", adminOnly: false, group: () => "Operação" },
  { to: "/historico", label: "Histórico de vendas", icon: "🧾", adminOnly: false, group: () => "Operação" },
  { to: "/usuarios", label: "Usuários", icon: "👤", adminOnly: true, group: () => "Administração" },
  {
    to: "/configuracoes",
    label: "Configurações",
    icon: "⚙️",
    adminOnly: false,
    group: (isAdmin: boolean) => (isAdmin ? "Administração" : "Operação"),
  },
];

/** Título/subtítulo do topbar por rota — mesmo texto do `titles` do mockup,
 * ajustado ao que a tela realmente tem hoje. Some rota nova, some entrada aqui. */
const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Estoque", subtitle: "Itens cadastrados e categorias" },
  "/dashboard": { title: "Dashboard", subtitle: "Visão geral do estoque e das vendas" },
  "/venda": { title: "Venda", subtitle: "Registro rápido de venda, otimizado para teclado" },
  "/devedores": { title: "Devedores (Crediário)", subtitle: "Saldo em aberto, histórico de vendas fiado e pagamentos por cliente" },
  "/historico": { title: "Histórico de vendas", subtitle: "Busca por recibo, cliente ou operador, e cancelamento/estorno" },
  "/configuracoes": { title: "Configurações", subtitle: "Tema e bloqueio automático" },
  "/usuarios": { title: "Usuários", subtitle: "Gestão de administradores e usuários" },
};

export function AppShell() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { secondsUntilLock } = useOutletContext<AuthGateOutletContext>();
  const [version, setVersion] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("");
  const [routeDirty, setRouteDirty] = useState(false);
  const [pendingNav, setPendingNav] = useState<string | null>(null);

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch((err) => logger.error("falha ao ler a versão do app", err));
    // Fetched once per session (same as version) — a store name changed in
    // Configurações only shows up here after the app restarts.
    getStoreName()
      .then(setStoreName)
      .catch((err) => logger.error("falha ao ler nome da loja", err));
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

  const page = PAGE_META[pathname];

  return (
    <div className="grid h-screen grid-cols-[220px_1fr]">
      <aside className="flex h-full flex-col gap-1 overflow-y-auto bg-sidebar-bg p-4 text-sidebar-text">
        <div className="mb-4 flex items-center gap-2 px-1 text-sm font-bold text-white">
          <span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-br from-primary to-primary-hover" />
          {storeName || "Bora Vender"}
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {(() => {
            const items = NAV_ITEMS.filter((item) => !item.adminOnly || user.isAdmin);
            let lastGroup: string | null = null;
            return items.map((item, index) => {
              const group = item.group(user.isAdmin);
              const showLabel = group !== lastGroup;
              lastGroup = group;
              return (
                <div key={item.to}>
                  {showLabel && (
                    <div
                      className={`px-2 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-label ${index === 0 ? "pt-0" : "pt-2.5"}`}
                    >
                      {group}
                    </div>
                  )}
                  <NavLink
                    to={item.to}
                    end={item.to === "/"}
                    onClick={(e) => {
                      if (routeDirty && item.to !== pathname) {
                        e.preventDefault();
                        setPendingNav(item.to);
                      }
                    }}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${isActive ? "bg-sidebar-active text-white" : "hover:bg-sidebar-hover hover:text-white"}`
                    }
                  >
                    <span className="w-4 text-center text-[13px]" aria-hidden>
                      {item.icon}
                    </span>
                    {item.label}
                    {item.to === "/venda" && (
                      <span className="ml-auto rounded border border-white/20 px-1 text-[10px] font-semibold text-sidebar-label">
                        F1
                      </span>
                    )}
                  </NavLink>
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
            <span>{version ? `Stockly - v${version}` : ""}</span>
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
