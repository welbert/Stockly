import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { AuthGate } from "./components/layout/AuthGate";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { DevedoresPage } from "./pages/DevedoresPage";
import { InventoryPage } from "./pages/InventoryPage";
import { SalesPage } from "./pages/SalesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { UsersPage } from "./pages/UsersPage";

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AuthGate />}>
              <Route element={<AppShell />}>
                <Route index element={<InventoryPage />} />
                <Route path="venda" element={<SalesPage />} />
                <Route path="devedores" element={<DevedoresPage />} />
                <Route path="configuracoes" element={<SettingsPage />} />
                <Route path="usuarios" element={<UsersPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
