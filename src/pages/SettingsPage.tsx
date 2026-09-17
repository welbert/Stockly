import { useAuth } from "../context/AuthContext";
import { effectiveAutoLockMinutes, updateMyAutoLock } from "../lib/api";
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
  if (!user) return null;

  async function handleAutoLockChange(value: number) {
    try {
      const updated = await updateMyAutoLock(value);
      setUser(updated);
    } catch (err) {
      logger.error("falha ao salvar tempo de bloqueio", err);
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
    </div>
  );
}
