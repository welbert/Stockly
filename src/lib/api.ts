import { invoke } from "@tauri-apps/api/core";
import { PAYMENT_METHOD_LABEL, fmtDateTime } from "./format";
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

/** One `stock_movements` ledger row — the "Movimentação de estoque" report's
 * data source (and "Itens sem movimento"'s too, filtered to `movementType
 * === "sale"` client-side). */
export type StockMovementRow = {
  id: number;
  itemId: number;
  itemName: string;
  movementType: string;
  quantityDelta: number;
  userName: string;
  createdAt: string;
};

export function listStockMovements() {
  return call<StockMovementRow[]>("list_stock_movements");
}

/** One `item_price_history` row — the "Histórico de alteração de preço"
 * report's data source. */
export type ItemPriceHistoryRow = {
  id: number;
  itemId: number;
  itemName: string;
  costPrice: number;
  salePrice: number;
  userName: string;
  createdAt: string;
};

export function listItemPriceHistory() {
  return call<ItemPriceHistoryRow[]>("list_item_price_history");
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

/** One row of the items CSV export/import — field names in English (the
 * command's own contract), header labels are Portuguese in the actual file
 * (see `src-tauri/src/models.rs`'s `ItemCsvRow`). `active` is `"sim"`/`"nao"`,
 * not a boolean — matches the CSV's own spelling so the review screen can
 * show it back unchanged. */
export type ItemCsvRow = {
  code: string;
  name: string;
  category: string;
  costPrice: number;
  salePrice: number;
  quantity: number;
  minQuantity: number | null;
  active: string;
};

export type ItemCsvFieldDiff = { field: string; current: string; new: string };

export type ItemCsvNewRow = {
  rowLine: number;
  row: ItemCsvRow;
  suggestedItemId: number | null;
  suggestedItemName: string | null;
};

export type ItemCsvChangedRow = { rowLine: number; itemId: number; diffs: ItemCsvFieldDiff[]; row: ItemCsvRow };

export type ItemCsvMissingItem = { itemId: number; code: string; name: string; quantity: number };

export type ItemCsvRowError = { line: number; message: string };

export type ItemsCsvImportPreview = {
  newItems: ItemCsvNewRow[];
  changedItems: ItemCsvChangedRow[];
  missingItems: ItemCsvMissingItem[];
  errors: ItemCsvRowError[];
};

export type MissingItemAction = "keep" | "zero" | "deactivate";

export type ItemsCsvImportDecision = {
  creates: { row: ItemCsvRow }[];
  updates: { itemId: number; row: ItemCsvRow; keepExistingName: boolean }[];
  missingActions: { itemId: number; action: MissingItemAction }[];
};

export type ItemsCsvImportResult = { created: number; updated: number; missingHandled: number };

export function exportItemsCsv(path: string) {
  return call<void>("export_items_csv", { path });
}

export function previewItemsCsvImport(path: string) {
  return call<ItemsCsvImportPreview>("preview_items_csv_import", { path });
}

export function applyItemsCsvImport(decision: ItemsCsvImportDecision) {
  return call<ItemsCsvImportResult>("apply_items_csv_import", { decision });
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
  /** Combined discount (item-level + general) — `0` when the sale had none. */
  discountValue: number;
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

/** One `sale_items` line, joined with its (current) category — the
 * line-item-level sibling of `SaleListItem`, needed by any report that
 * breaks sales down by categoria/item instead of just by sale. */
export type SaleItemReportRow = {
  saleId: number;
  createdAt: string;
  status: string;
  itemName: string;
  categoryName: string | null;
  quantity: number;
  subtotal: number;
};

/** Every `sale_items` line ever, newest sale first — same "fetch everything,
 * filter/aggregate client-side" convention as `listSales`. */
export function listSaleItemsReport() {
  return call<SaleItemReportRow[]>("list_sale_items_report");
}

/** One granted discount (general or item-level) on a `completed` sale —
 * powers `Relatórios > Descontos concedidos`. `userName` is only there for
 * the "operador" filter, not a table column of its own (matches the
 * mockup). Label text ("Geral (10%)"/"Item (Nome, -15%)") is built by the
 * page from `kind`/`itemName`/`discountPercent`, not sent pre-formatted. */
export type SaleDiscountRow = {
  id: string;
  receiptNumber: string;
  createdAt: string;
  userName: string;
  kind: "general" | "item";
  itemName: string | null;
  discountPercent: number | null;
  amount: number;
  authorizedByName: string;
};

export function listSaleDiscounts() {
  return call<SaleDiscountRow[]>("list_sale_discounts");
}

/** One row of a sales CSV export — already display-formatted (see
 * `toSaleCsvRows`), matching `src-tauri/src/models.rs`'s `SaleCsvRow`. */
export type SaleCsvRow = {
  receiptNumber: string;
  createdAt: string;
  clientName: string;
  userName: string;
  paymentMethod: string;
  discount: number;
  total: number;
  status: string;
};

export function exportSalesCsv(path: string, rows: SaleCsvRow[]) {
  return call<void>("export_sales_csv", { path, rows });
}

/** One (label, value) pair from a report's stat cards — matches
 * `src-tauri/src/models.rs`'s `ReportPdfStatInput`. */
export type ReportPdfStat = { label: string; value: string };

/** PDF counterpart of `exportSalesCsv` — same rows, plus the report's own
 * title/subtitle and stat cards (whatever the caller already has on
 * screen). Deliberately doesn't reproduce the on-screen chart — see
 * `src-tauri/src/pdf_util.rs`'s doc comment for why. */
export function exportSalesReportPdf(path: string, title: string, subtitle: string, stats: ReportPdfStat[], rows: SaleCsvRow[]) {
  return call<void>("export_sales_report_pdf", { path, title, subtitle, stats, rows });
}

/** Generic table export — for a report whose aggregated shape doesn't match
 * `SaleCsvRow` (a categoria breakdown, a forma de pagamento breakdown, ...):
 * `headers`/`rows` are already the exact display strings to write, nothing
 * for the backend to reshape. `exportSalesCsv` stays the one exception,
 * since "Vendas por período" already exports full per-sale rows through a
 * dedicated type. */
export function exportReportCsv(path: string, headers: string[], rows: string[][]) {
  return call<void>("export_report_csv", { path, headers, rows });
}

/** PDF counterpart of `exportReportCsv`, built on the same generic report
 * layout as `exportSalesReportPdf`. `columnWeights` (same length as
 * `headers`) is the caller's call — only it knows which columns hold long,
 * unbreakable content (see `pdf_util.rs`'s doc comment: a word too wide for
 * its column gets silently dropped, not overflowed). */
export function exportReportPdf(
  path: string,
  title: string,
  subtitle: string,
  stats: ReportPdfStat[],
  headers: string[],
  columnWeights: number[],
  rows: string[][],
) {
  return call<void>("export_report_pdf", { path, title, subtitle, stats, headers, columnWeights, rows });
}

/** Opens the OS file explorer at the parent directory of `path` — the
 * "Clique aqui para abrir a pasta" action on every export success toast
 * (`useToast`). Works for any exported file, CSV or PDF, report or not. */
export function openContainingFolder(path: string) {
  return call<void>("open_containing_folder", { path });
}

/** Shapes already-fetched `SaleListItem`s into the rows `exportSalesCsv`
 * writes to disk — shared by `SalesHistoryPage` and `VendasPorPeriodoPage`
 * so both "Exportar CSV" buttons produce the same column shape. Values are
 * display-formatted (pt-BR date, payment method label, "Concluída"/
 * "Cancelada") rather than raw codes, since this export has no re-import
 * counterpart (unlike Estoque's CSV) — it's a read-only artifact for the
 * shop owner, not meant to round-trip. `total`/`discount` stay plain
 * numbers, not "R$"-formatted strings, so a spreadsheet still sums them. */
export function toSaleCsvRows(sales: SaleListItem[]): SaleCsvRow[] {
  return sales.map((s) => ({
    receiptNumber: s.receiptNumber,
    createdAt: fmtDateTime(s.createdAt),
    clientName: s.clientName ?? "",
    userName: s.userName,
    paymentMethod: PAYMENT_METHOD_LABEL[s.paymentMethod] ?? s.paymentMethod,
    discount: s.discountValue,
    total: s.total,
    status: s.status === "cancelled" ? "Cancelada" : "Concluída",
  }));
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

export function openReceiptFile(path: string) {
  return call<void>("open_receipt_file", { path });
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

/** Global (all clients) version of `CreditSaleSummary` — every still-
 * completed Crediário sale, used only by "Inadimplência" (`relatorios/
 * inadimplencia-aging`) to find each client's *oldest* still-open sale
 * (`remaining > 0`), which `listClients()`'s per-client `balance` alone
 * can't answer. */
export type CreditSaleReportRow = {
  saleId: number;
  clientId: number;
  clientName: string;
  receiptNumber: string;
  createdAt: string;
  total: number;
  paid: number;
  remaining: number;
};

export function listCreditSales() {
  return call<CreditSaleReportRow[]>("list_credit_sales");
}

/** Every `credit_payments` row ever registered, across all clients (active
 * and cancelled) — feeds both "Pagamentos recebidos" (`cancelledAt === null`)
 * and "Pagamentos cancelados" (`cancelledAt !== null`), same "one command,
 * filtered per report" shape as `listSales`/`listStockMovements`. */
export type CreditPaymentReportRow = {
  id: number;
  clientId: number;
  clientName: string;
  amount: number;
  userName: string;
  createdAt: string;
  cancelledAt: string | null;
  cancelledByName: string | null;
  cancelAuthorizedByName: string | null;
  cancelReason: string | null;
};

export function listCreditPayments() {
  return call<CreditPaymentReportRow[]>("list_credit_payments");
}

/** One authorized admin action, from 3 of the 4 sources `Plans/PLANO.md`'s
 * "Autorizações de Administrador" originally listed — see
 * `commands::audit::list_admin_authorizations`'s doc comment for why the 4th
 * (cliente renomeado) isn't included yet. */
export type AdminAuthorizationRow = {
  id: string;
  actionType: "discount" | "sale_cancel" | "payment_cancel";
  reference: string | null;
  clientName: string | null;
  amount: number;
  requestedByName: string;
  authorizedByName: string;
  createdAt: string;
};

export function listAdminAuthorizations() {
  return call<AdminAuthorizationRow[]>("list_admin_authorizations");
}

export function getCreditEnabled() {
  return call<boolean>("get_credit_enabled");
}

export function setCreditEnabled(enabled: boolean) {
  return call<void>("set_credit_enabled", { enabled });
}

/** Width (1st number, in columns of `GRID_COLS`) × height (2nd number, in
 * rows of `ROW_HEIGHT`) — see `SIZE_DIMENSIONS` in `dashboard-cards/catalog.ts`. */
export type CardSize =
  | "1x1" | "1x2" | "1x3"
  | "2x1" | "2x2" | "2x3"
  | "3x1" | "3x2" | "3x3"
  | "4x1" | "4x2" | "4x3"
  | "5x1" | "5x2" | "5x3"
  | "6x1" | "6x2" | "6x3";

export type DashboardLayoutItem = {
  cardKey: string;
  x: number;
  y: number;
  size: CardSize;
  visible: boolean;
};

export type LowStockItemSummary = { name: string; quantity: number; minQuantity: number };
export type TopSellingItemSummary = { name: string; quantity: number };
export type CategorySalesSummary = { categoryName: string | null; total: number };
export type PaymentMethodSalesSummary = { paymentMethod: PaymentMethod; count: number };
export type DailySalesSummary = { date: string; total: number };
export type RecentSaleSummary = { receiptNumber: string; createdAt: string; userName: string; total: number };
export type ReminderDueSummary = { clientId: number; clientName: string; reminderDate: string; overdue: boolean };
export type CancelledSalesSummary = { count: number; totalValue: number };

/** Everything every Dashboard card needs, fetched once by `DashboardPage` and
 * passed down as props — no card fetches its own data (see `docs/frontend.md`). */
export type DashboardData = {
  itemsInStock: number;
  stockValue: number;
  salesToday: number;
  salesMonth: number;
  receivedToday: number;
  receivedMonth: number;
  lowStockCount: number;
  lowStockItems: LowStockItemSummary[];
  topSellingItems: TopSellingItemSummary[];
  salesByCategory: CategorySalesSummary[];
  paymentMethods: PaymentMethodSalesSummary[];
  salesLast7Days: DailySalesSummary[];
  recentSales: RecentSaleSummary[];
  /** `null` when there's no completed sale in the previous month to compare against. */
  monthComparisonPercent: number | null;
  remindersDue: ReminderDueSummary[];
  creditOutstandingTotal: number;
  discountGrantedMonth: number;
  cancelledSalesMonth: CancelledSalesSummary;
};

/** Admin's own layout — always resolved server-side from the active session,
 * never a `userId` argument (see `CLAUDE.md`'s Auth rule). Seeded with a
 * curated default set the first time it's ever requested. */
export function getDashboardLayout() {
  return call<DashboardLayoutItem[]>("get_dashboard_layout");
}

/** Replaces the whole layout — called on every drag/resize (debounced
 * client-side) and on every add/remove-card click (immediate). */
export function saveDashboardLayout(items: DashboardLayoutItem[]) {
  return call<void>("save_dashboard_layout", { items });
}

export function getDashboardData() {
  return call<DashboardData>("get_dashboard_data");
}
