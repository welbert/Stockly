import { FormEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import * as api from "../lib/api";
import type { UserSummary } from "../lib/api";
import { Button } from "../components/Button";
import { logger } from "../logger";

export function LoginPage() {
  const [checking, setChecking] = useState(true);
  const [firstRun, setFirstRun] = useState(false);

  useEffect(() => {
    api
      .hasAnyUsers()
      .then((has) => setFirstRun(!has))
      .catch((err) => logger.error("falha ao verificar usuários existentes", err))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return <CenteredShell>Carregando…</CenteredShell>;
  }

  return <CenteredShell>{firstRun ? <FirstRunForm /> : <ProfilePicker />}</CenteredShell>;
}

function CenteredShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-theme-bg px-4">
      <div className="w-full max-w-sm rounded-2xl border border-theme-border bg-theme-surface p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-gradient-to-br from-primary to-primary-hover" />
          <span className="text-lg font-bold text-theme-1">Bora Vender</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function FirstRunForm() {
  const { setUser } = useAuth();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("As senhas não conferem.");
      return;
    }
    setSubmitting(true);
    try {
      const profile = await api.createUser({ name, password, isAdmin: true });
      setUser(profile);
    } catch (err) {
      logger.error("falha ao criar primeiro administrador", err);
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1 className="mb-1 text-center text-lg font-semibold text-theme-1">Bem-vindo ao Bora Vender</h1>
      <p className="mb-5 text-center text-xs text-theme-3">Crie o primeiro administrador para começar</p>

      <Field label="Nome">
        <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Senha">
        <input
          required
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Confirmação de senha">
        <input
          required
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={inputClass}
        />
      </Field>

      {error && <p className="mb-2 text-xs text-danger">{error}</p>}
      <Button type="submit" variant="primary" className="w-full justify-center" disabled={submitting}>
        Criar e entrar
      </Button>
    </form>
  );
}

function ProfilePicker() {
  const { login } = useAuth();
  const [profiles, setProfiles] = useState<UserSummary[]>([]);
  const [selected, setSelected] = useState(0);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [awaitingPassword, setAwaitingPassword] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.listLoginProfiles().then(setProfiles).catch((err) => logger.error("falha ao listar perfis", err));
  }, []);

  useEffect(() => {
    if (awaitingPassword) passwordRef.current?.focus();
  }, [awaitingPassword]);

  function handleTilesKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, profiles.length - 1));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      setAwaitingPassword(true);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const profile = profiles[selected];
    if (!profile) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(profile.id, password);
    } catch (err) {
      logger.error("falha no login", profile.id, err);
      setError("Senha incorreta.");
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  if (profiles.length === 0) {
    return <p className="text-center text-sm text-theme-3">Carregando perfis…</p>;
  }

  if (!awaitingPassword) {
    return (
      <div>
        <h1 className="mb-4 text-center text-lg font-semibold text-theme-1">Quem é você?</h1>
        <div
          className="flex flex-wrap justify-center gap-3 outline-none"
          tabIndex={0}
          autoFocus
          onKeyDown={handleTilesKeyDown}
        >
          {profiles.map((p, i) => (
            <button
              key={p.id}
              onClick={() => {
                setSelected(i);
                setAwaitingPassword(true);
              }}
              className={`flex w-24 flex-col items-center gap-2 rounded-xl border px-2 py-3 text-center ${
                i === selected
                  ? "border-primary bg-primary-soft ring-2 ring-primary-soft"
                  : "border-theme-border bg-theme-surface hover:bg-theme-hover"
              }`}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="text-xs font-semibold leading-tight text-theme-1">{p.name}</span>
              <span className="text-[10px] text-theme-3">{p.isAdmin ? "Administrador" : "Usuário"}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const profile = profiles[selected];
  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
          {profile.name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <p className="text-sm font-semibold text-theme-1">{profile.name}</p>
          <button
            type="button"
            onClick={() => {
              setAwaitingPassword(false);
              setPassword("");
              setError(null);
            }}
            className="text-xs text-theme-3 underline hover:text-theme-1"
          >
            Trocar de perfil
          </button>
        </div>
      </div>
      <Field label="Senha">
        <input
          ref={passwordRef}
          required
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </Field>
      {error && <p className="mb-2 text-xs text-danger">{error}</p>}
      <Button type="submit" variant="primary" className="w-full justify-center" disabled={submitting}>
        Entrar
      </Button>
    </form>
  );
}

const inputClass =
  "w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm text-theme-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs font-semibold text-theme-3">{label}</label>
      {children}
    </div>
  );
}
