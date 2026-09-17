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

export type CategorySummary = {
  id: number;
  name: string;
};

export function listCategories() {
  return call<CategorySummary[]>("list_categories");
}

export function createCategory(name: string) {
  return call<CategorySummary>("create_category", { name });
}

export function renameCategory(id: number, name: string) {
  return call<CategorySummary>("rename_category", { id, name });
}

export function deleteCategory(id: number) {
  return call<void>("delete_category", { id });
}

export type ItemSummary = {
  id: number;
  code: string;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  costPrice: number;
  salePrice: number;
  quantity: number;
  minQuantity: number | null;
  active: boolean;
};

export type StockStatus = "critical" | "warning" | "ok";

/** Limite do chip amarelo — mesma fórmula do PLANO.md: `ceil(mínima * (1 + pct/100))`. */
export function lowStockWarningThreshold(minQuantity: number, lowStockPercent: number): number {
  return Math.ceil(minQuantity * (1 + lowStockPercent / 100));
}

/** Mesma regra do PLANO.md ("Alerta de estoque baixo"): crítico quando
 * quantidade <= mínima; aviso na faixa acima, até `lowStockWarningThreshold`;
 * sem mínima definida, o item nunca alerta. */
export function stockStatus(item: Pick<ItemSummary, "quantity" | "minQuantity">, lowStockPercent: number): StockStatus {
  if (item.minQuantity === null) return "ok";
  if (item.quantity <= item.minQuantity) return "critical";
  return item.quantity <= lowStockWarningThreshold(item.minQuantity, lowStockPercent) ? "warning" : "ok";
}

export function listItems() {
  return call<ItemSummary[]>("list_items");
}

export function createItem(input: {
  /** Vazio/em branco = backend usa o próprio id do item como código. */
  code: string;
  name: string;
  categoryId: number | null;
  costPrice: number;
  salePrice: number;
  quantity: number;
  minQuantity: number | null;
}) {
  return call<ItemSummary>("create_item", input);
}

export function updateItem(input: {
  id: number;
  code: string;
  name: string;
  categoryId: number | null;
  costPrice: number;
  salePrice: number;
  quantity: number;
  minQuantity: number | null;
  active: boolean;
}) {
  return call<ItemSummary>("update_item", input);
}

export function deleteItem(id: number) {
  return call<void>("delete_item", { id });
}

export function addStockEntry(itemId: number, quantity: number) {
  return call<ItemSummary>("add_stock_entry", { itemId, quantity });
}

export function deactivateItem(itemId: number) {
  return call<ItemSummary>("deactivate_item", { itemId });
}

export function getLowStockPercent() {
  return call<number>("get_low_stock_percent");
}

export function setLowStockPercent(percent: number) {
  return call<void>("set_low_stock_percent", { percent });
}

export function getDefaultProfitMargin() {
  return call<number>("get_default_profit_margin");
}

export function setDefaultProfitMargin(percent: number) {
  return call<void>("set_default_profit_margin", { percent });
}

/** `sale_price` sugerido = custo + margem — usado só ao cadastrar um item novo. */
export function suggestedSalePrice(costPrice: number, profitMarginPercent: number): number {
  return Math.round(costPrice * (1 + profitMarginPercent / 100) * 100) / 100;
}
