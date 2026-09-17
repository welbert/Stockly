import { invoke } from "@tauri-apps/api/core";
import { logger } from "../logger";

export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (err) {
    logger.error(`invoke ${command} falhou`, err);
    throw err;
  }
}

export type UserSummary = {
  id: number;
  name: string;
  isAdmin: boolean;
  active: boolean;
};

export type UserProfile = {
  id: number;
  name: string;
  isAdmin: boolean;
  active: boolean;
  /** Three-state: null = usa o padrão do papel, 0 = "Nunca", N = minutos. */
  autoLockMinutes: number | null;
  theme: string;
  /** ISO-ish `datetime('now')` do SQLite (UTC); `null` = nunca logou (ex.: criado por outro admin, ainda não usou). */
  lastLoginAt: string | null;
};

/** Minutos efetivos de bloqueio, já resolvendo o padrão por papel; null = nunca bloqueia. */
export function effectiveAutoLockMinutes(user: UserProfile): number | null {
  if (user.autoLockMinutes === null) return user.isAdmin ? 5 : null;
  if (user.autoLockMinutes === 0) return null;
  return user.autoLockMinutes;
}

export function hasAnyUsers() {
  return call<boolean>("has_any_users");
}

export function listLoginProfiles() {
  return call<UserSummary[]>("list_login_profiles");
}

export function listUsers() {
  return call<UserProfile[]>("list_users");
}

export function createUser(input: { name: string; password: string; isAdmin: boolean }) {
  return call<UserProfile>("create_user", input);
}

export function updateUser(input: {
  id: number;
  name: string;
  isAdmin: boolean;
  active: boolean;
  autoLockMinutes: number | null;
}) {
  return call<UserProfile>("update_user", input);
}

export function deleteUser(id: number) {
  return call<void>("delete_user", { id });
}

export function updateTheme(theme: string) {
  return call<void>("update_theme", { theme });
}

export function updateMyAutoLock(autoLockMinutes: number | null) {
  return call<UserProfile>("update_my_auto_lock", { autoLockMinutes });
}

export function login(userId: number, password: string) {
  return call<UserProfile>("login", { userId, password });
}

export function logout() {
  return call<void>("logout");
}

export function getActiveUser() {
  return call<UserProfile | null>("get_active_user");
}

export function verifyPassword(userId: number, password: string) {
  return call<boolean>("verify_password", { userId, password });
}
