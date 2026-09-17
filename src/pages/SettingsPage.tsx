import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  effectiveAutoLockMinutes,
  getDefaultProfitMargin,
  getLowStockPercent,
  setDefaultProfitMargin,
  setLowStockPercent,
  updateMyAutoLock,
} from "../lib/api";
import { Card } from "../components/Card";
import { ThemeSwitcher } from "../components/ThemeSwitcher";
import { logger } from "../logger";

const AUTO_LOCK_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Nunca" },
  { value: 1, label: "1 minuto" },
  { value: 5, label: "5 minutos" },
  { value: 10, label: "10 minutos" },
  { value: 15, label: "15 minutos" },
  { value: 30, label: "30 minutos" },
  { value: 60, label: "1 hora" },
];

export function SettingsPage() {
  const { user, setUser } = useAuth();
  const [lowStockPercent, setLowStockPercentState] = useState<number | null>(null);
  const [profitMargin, setProfitMarginState] = useState<number | null>(null);

  useEffect(() => {
    if (user?.isAdmin) {
      getLowStockPercent()
        .then(setLowStockPercentState)
        .catch((err) => logger.error("falha ao ler percentual de alerta", err));
      getDefaultProfitMargin()
        .then(setProfitMarginState)
        .catch((err) => logger.error("falha ao ler margem de lucro padrão", err));
    }
  }, [user]);

  if (!user) return null;

  async function handleAutoLockChange(value: number) {
    try {
      const updated = await updateMyAutoLock(value);
      setUser(updated);
    } catch (err) {
      logger.error("falha ao salvar tempo de bloqueio", err);
    }
  }

  async function handleLowStockPercentChange(value: number) {
    setLowStockPercentState(value);
    try {
      await setLowStockPercent(value);
    } catch (err) {
      logger.error("falha ao salvar percentual de alerta", err);
    }
  }

  async function handleProfitMarginChange(value: number) {
    setProfitMarginState(value);
    try {
      await setDefaultProfitMargin(value);
    } catch (err) {
      logger.error("falha ao salvar margem de lucro padrão", err);
    }
  }

  return (
    <div className="grid max-w-3xl grid-cols-2 gap-4">
      <Card title="Aparência">
        <label className="mb-1.5 block text-xs font-semibold text-theme-3">Tema</label>
        <ThemeSwitcher />
        <p className="mt-2.5 text-xs text-theme-3">Preferência salva no seu perfil e lembrada entre reinícios.</p>
      </Card>

      <Card title="Bloqueio automático">
        <label className="mb-1.5 block text-xs font-semibold text-theme-3">Bloquear por inatividade após</label>
        <select
          value={effectiveAutoLockMinutes(user) ?? 0}
          onChange={(e) => handleAutoLockChange(Number(e.target.value))}
          className="rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
        >
          {AUTO_LOCK_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="mt-2.5 text-xs text-theme-3">
          Padrão para {user.isAdmin ? "Administrador" : "Usuário"}: {user.isAdmin ? "5 minutos" : "Nunca"}.
        </p>
      </Card>

      {user.isAdmin && lowStockPercent !== null && (
        <Card title="Alerta de estoque baixo">
          <label className="mb-1.5 block text-xs font-semibold text-theme-3">Percentual de aviso (chip amarelo)</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="1"
              value={lowStockPercent}
              onChange={(e) => handleLowStockPercentChange(Number(e.target.value))}
              className="w-24 rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
            />
            <span className="text-sm text-theme-3">%</span>
          </div>
          <p className="mt-2.5 text-xs text-theme-3">
            Acima da quantidade mínima de cada item, definida no cadastro — só exibido para Administrador.
          </p>
        </Card>
      )}

      {user.isAdmin && profitMargin !== null && (
        <Card title="Precificação">
          <label className="mb-1.5 block text-xs font-semibold text-theme-3">% de lucro padrão</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="1"
              value={profitMargin}
              onChange={(e) => handleProfitMarginChange(Number(e.target.value))}
              className="w-24 rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
            />
            <span className="text-sm text-theme-3">%</span>
          </div>
          <p className="mt-2.5 text-xs text-theme-3">
            Ao cadastrar um item novo, o preço de venda é sugerido automaticamente (custo + esse percentual) — ainda
            editável antes de salvar.
          </p>
        </Card>
      )}
    </div>
  );
}
