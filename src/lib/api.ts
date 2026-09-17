import { invoke } from "@tauri-apps/api/core";
import { logger } from "../logger";

export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (err) {
    // `userId` shows up here for commands acting on/authenticating a specific
    // profile (login, verifyPassword, updateUser, deleteUser, ...) — the one
    // way to tell *who* a failed login attempt was for, since there's no
    // active session yet for the logger's own `[user ...]` tag to reflect.
    const target = typeof args?.userId === "number" ? ` (userId=${args.userId})` : "";
    logger.error(`invoke ${command} falhou${target}`, err);
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

/** Limite do chip amarelo: `ceil(mínima * (1 + pct/100))`. */
export function lowStockWarningThreshold(minQuantity: number, lowStockPercent: number): number {
  return Math.ceil(minQuantity * (1 + lowStockPercent / 100));
}

/** Crítico quando quantidade <= mínima; aviso na faixa acima, até
 * `lowStockWarningThreshold`; sem mínima definida, o item nunca alerta. */
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

export function getStoreName() {
  return call<string>("get_store_name");
}

export function setStoreName(name: string) {
  return call<void>("set_store_name", { name });
}

export function getStoreInfo() {
  return call<string>("get_store_info");
}

export function setStoreInfo(info: string) {
  return call<void>("set_store_info", { info });
}

export function getReceiptThankYouMessage() {
  return call<string>("get_receipt_thank_you_message");
}

export function setReceiptThankYouMessage(message: string) {
  return call<void>("set_receipt_thank_you_message", { message });
}

/** `sale_price` sugerido = custo + margem — usado só ao cadastrar um item novo. */
export function suggestedSalePrice(costPrice: number, profitMarginPercent: number): number {
  return Math.round(costPrice * (1 + profitMarginPercent / 100) * 100) / 100;
}

export function listAdmins() {
  return call<UserSummary[]>("list_admins");
}

export type PaymentMethod = "cash" | "card" | "pix" | "credit";

export type SaleItemInput = {
  itemId: number;
  quantity: number;
  discountPercent: number | null;
  discountAmount: number | null;
};

export type SaleItemDetail = {
  itemId: number | null;
  itemCode: string;
  itemName: string;
  unitPrice: number;
  quantity: number;
  discountPercent: number | null;
  discountAmount: number | null;
  subtotal: number;
};

export type SaleDetail = {
  id: number;
  receiptNumber: string;
  userId: number;
  userName: string;
  subtotal: number;
  discountPercent: number | null;
  discountAmount: number | null;
  discountAuthorizedByName: string | null;
  total: number;
  status: string;
  paymentMethod: PaymentMethod;
  /** Only set when `paymentMethod === "credit"`. */
  clientId: number | null;
  clientName: string | null;
  /** Amount of the Crediário debt paid off so far for this specific sale —
   * whether paid at sale time or later through Devedores. `null` when nothing
   * has been paid on it yet. */
  creditPaid: number | null;
  /** The three `cancel*` fields below are only set once the sale has been
   * cancelled/estornada — never deleted, see `cancelSale`. */
  cancelledAt: string | null;
  cancelledByName: string | null;
  cancelAuthorizedByName: string | null;
  createdAt: string;
  items: SaleItemDetail[];
  receiptPdfPath: string | null;
};

/** Lightweight row for the Histórico de vendas listing (no line items — those
 * are a separate `getSaleDetail` round-trip once a sale is opened). */
export type SaleListItem = {
  id: number;
  receiptNumber: string;
  createdAt: string;
  userName: string;
  clientName: string | null;
  paymentMethod: PaymentMethod;
  total: number;
  status: string;
};

/** Arredondamento pra 2 casas decimais — mesma regra do `money::round2` no
 * backend. Usado só pra prévia client-side do recibo; o total que vale é
 * sempre o que o backend devolve. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function createSale(input: {
  items: SaleItemInput[];
  discountPercent: number | null;
  discountAmount: number | null;
  discountAuthorizerId: number | null;
  discountAuthorizerPassword: string | null;
  paymentMethod: PaymentMethod;
  clientId: number | null;
  /** Only used when `paymentMethod === "credit"` — how much the client
   * already paid up front, reducing the Crediário balance this sale opens. */
  creditPaidNow: number | null;
}) {
  return call<SaleDetail>("create_sale", input);
}

export function getSaleDetail(saleId: number) {
  return call<SaleDetail>("get_sale_detail", { saleId });
}

/** Every sale ever, newest first — frontend filters by date range/receipt/
 * cliente/operador client-side, same convention as `listItems`/`listClients`. */
export function listSales() {
  return call<SaleListItem[]>("list_sales");
}

/** Cancels/reverses a completed sale — reverses stock and, for a Crediário
 * sale, the client's open balance too. Same admin-authorization shape as
 * `createSale`'s discount fields. */
export function cancelSale(input: { saleId: number; authorizerId: number | null; authorizerPassword: string | null }) {
  return call<SaleDetail>("cancel_sale", input);
}

export function regenerateReceiptPdf(saleId: number) {
  return call<string>("regenerate_receipt_pdf", { saleId });
}

export function printFile(path: string) {
  return call<void>("print_file", { path });
}

export function openReceiptsFolder() {
  return call<void>("open_receipts_folder");
}

export function openLogDir() {
  return call<void>("open_log_dir");
}

export type ClientSummary = {
  id: number;
  name: string;
  phone: string | null;
  reminderDate: string | null;
  note: string | null;
  /** Open Crediário balance — credited sales minus payments already registered. */
  balance: number;
};

export type CreditSaleSummary = {
  saleId: number;
  receiptNumber: string;
  createdAt: string;
  total: number;
  /** Sum of active allocations already applied to this specific sale. */
  paid: number;
  /** `total - paid` — what's still owed on this sale specifically. */
  remaining: number;
  /** `"completed"` or `"cancelled"`. */
  status: string;
};

/** One sale a payment was applied to, and how much of that payment went to
 * it — a payment can span multiple sales (see `registerCreditPayment`). */
export type CreditPaymentAllocationSummary = {
  saleId: number;
  receiptNumber: string;
  amount: number;
};

export type CreditPaymentSummary = {
  id: number;
  amount: number;
  userName: string;
  createdAt: string;
  allocations: CreditPaymentAllocationSummary[];
  /** Only filled in once the payment has been cancelled (soft-cancel, never deleted). */
  cancelledAt: string | null;
  cancelledByName: string | null;
  cancelAuthorizedByName: string | null;
  cancelReason: string | null;
};

export type ClientDetail = ClientSummary & {
  creditSales: CreditSaleSummary[];
  payments: CreditPaymentSummary[];
};

/** Every client, each already with its computed balance — filtering/sorting
 * (e.g. only debtors with balance > 0, search by name) happens in the
 * frontend, same convention as `listItems`. */
export function listClients() {
  return call<ClientSummary[]>("list_clients");
}

export function createClient(input: { name: string; phone: string | null; reminderDate: string | null; note: string | null }) {
  return call<ClientSummary>("create_client", input);
}

/** Renaming a client with an open Crediário balance requires admin
 * authorization (same pattern as `createSale`'s discount/cancel authorization) —
 * `authorizerId`/`authorizerPassword` are only used in that case. */
export function updateClient(input: {
  id: number;
  name: string;
  phone: string | null;
  reminderDate: string | null;
  note: string | null;
  authorizerId: number | null;
  authorizerPassword: string | null;
}) {
  return call<ClientSummary>("update_client", input);
}

export function getClientDetail(id: number) {
  return call<ClientDetail>("get_client_detail", { id });
}

/** Pays off one or more of the client's own open Crediário sales at once.
 * `amount` can be less than the combined `remaining` of `saleIds`, in which
 * case `residualSaleId` (one of `saleIds`) says which one absorbs the
 * difference and stays partially paid — every other selected sale is paid
 * off in full. Omit `residualSaleId` when `amount` covers the full sum (or
 * when only one sale is selected — nothing to choose there). */
export function registerCreditPayment(input: {
  clientId: number;
  saleIds: number[];
  amount: number;
  residualSaleId: number | null;
}) {
  return call<ClientDetail>("register_credit_payment", input);
}

/** Soft-cancel — doesn't delete the payment, just marks it with a reason.
 * Reverses a financial entry, so it requires admin authorization (same
 * pattern as `createSale`'s discount/cancel authorization). */
export function cancelCreditPayment(input: {
  paymentId: number;
  reason: string;
  authorizerId: number | null;
  authorizerPassword: string | null;
}) {
  return call<ClientDetail>("cancel_credit_payment", input);
}

export function getCreditEnabled() {
  return call<boolean>("get_credit_enabled");
}

export function setCreditEnabled(enabled: boolean) {
  return call<void>("set_credit_enabled", { enabled });
}
