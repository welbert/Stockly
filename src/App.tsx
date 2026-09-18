import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { AuthGate } from "./components/layout/AuthGate";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import { DashboardPage } from "./pages/DashboardPage";
import { DevedoresPage } from "./pages/DevedoresPage";
import { InventoryPage } from "./pages/InventoryPage";
import { ReportPlaceholderPage } from "./pages/ReportPlaceholderPage";
import { AutorizacoesAdminPage } from "./pages/reports/AutorizacoesAdminPage";
import { HistoricoPrecoPage } from "./pages/reports/HistoricoPrecoPage";
import { InadimplenciaAgingPage } from "./pages/reports/InadimplenciaAgingPage";
import { ItensParadosPage } from "./pages/reports/ItensParadosPage";
import { MovimentacaoEstoquePage } from "./pages/reports/MovimentacaoEstoquePage";
import { PagamentosCanceladosPage } from "./pages/reports/PagamentosCanceladosPage";
import { PagamentosRecebidosPage } from "./pages/reports/PagamentosRecebidosPage";
import { VendasComparativoPeriodosPage } from "./pages/reports/VendasComparativoPeriodosPage";
import { VendasPorCategoriaItemPage } from "./pages/reports/VendasPorCategoriaItemPage";
import { VendasPorFormaPagamentoPage } from "./pages/reports/VendasPorFormaPagamentoPage";
import { VendasPorOperadorPage } from "./pages/reports/VendasPorOperadorPage";
import { VendasPorPeriodoPage } from "./pages/reports/VendasPorPeriodoPage";
import { SalesHistoryPage } from "./pages/SalesHistoryPage";
import { SalesPage } from "./pages/SalesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { UsersPage } from "./pages/UsersPage";

/** Landing screen right after login: Admin → Dashboard, Usuário comum →
 * Venda (the day-to-day screen for that profile — see `CLAUDE.md`'s "Menu
 * reduzido"). `user` is always set here — this only renders under `AuthGate`,
 * which already redirects to `LoginPage` otherwise. */
function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user?.isAdmin ? "/dashboard" : "/venda"} replace />;
}

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <ThemeProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<AuthGate />}>
                <Route element={<AppShell />}>
                  <Route index element={<HomeRedirect />} />
                  <Route path="dashboard" element={<DashboardPage />} />
                  <Route path="venda" element={<SalesPage />} />
                  <Route path="estoque" element={<InventoryPage />} />
                  <Route path="devedores" element={<DevedoresPage />} />
                  <Route path="historico" element={<SalesHistoryPage />} />
                  <Route path="relatorios/vendas-periodo" element={<VendasPorPeriodoPage />} />
                  <Route path="relatorios/vendas-categoria-item" element={<VendasPorCategoriaItemPage />} />
                  <Route path="relatorios/vendas-forma-pagamento" element={<VendasPorFormaPagamentoPage />} />
                  <Route path="relatorios/vendas-operador" element={<VendasPorOperadorPage />} />
                  <Route path="relatorios/comparativo-periodos" element={<VendasComparativoPeriodosPage />} />
                  <Route path="relatorios/movimentacao-estoque" element={<MovimentacaoEstoquePage />} />
                  <Route path="relatorios/historico-preco" element={<HistoricoPrecoPage />} />
                  <Route path="relatorios/itens-parados" element={<ItensParadosPage />} />
                  <Route path="relatorios/inadimplencia-aging" element={<InadimplenciaAgingPage />} />
                  <Route path="relatorios/pagamentos-recebidos" element={<PagamentosRecebidosPage />} />
                  <Route path="relatorios/pagamentos-cancelados" element={<PagamentosCanceladosPage />} />
                  <Route path="relatorios/autorizacoes-admin" element={<AutorizacoesAdminPage />} />
                  <Route path="relatorios/:slug" element={<ReportPlaceholderPage />} />
                  <Route path="configuracoes" element={<SettingsPage />} />
                  <Route path="usuarios" element={<UsersPage />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ThemeProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
