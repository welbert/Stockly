use rusqlite::Row;
use serde::{Deserialize, Serialize};

/// `username` is intentionally excluded — it's an internal login key only
/// (auto-derived from `name`, see `commands::users::slugify`), never shown
/// or edited through the UI (login picks a profile by id, not by typing it).
pub const USER_PROFILE_COLUMNS: &str = "id, name, is_admin, active, auto_lock_minutes, theme, font_scale, last_login_at";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserSummary {
    pub id: i64,
    pub name: String,
    pub is_admin: bool,
    pub active: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    pub id: i64,
    pub name: String,
    pub is_admin: bool,
    pub active: bool,
    pub auto_lock_minutes: Option<i64>,
    pub theme: String,
    pub font_scale: String,
    pub last_login_at: Option<String>,
}

impl UserProfile {
    /// Row shape must match `USER_PROFILE_COLUMNS`'s column order.
    pub fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            name: row.get(1)?,
            is_admin: row.get::<_, i64>(2)? != 0,
            active: row.get::<_, i64>(3)? != 0,
            auto_lock_minutes: row.get(4)?,
            theme: row.get(5)?,
            font_scale: row.get(6)?,
            last_login_at: row.get(7)?,
        })
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CategorySummary {
    pub id: i64,
    pub name: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ItemSummary {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub category_id: Option<i64>,
    /// `None` when `category_id` is `None` — the frontend shows "Categoria indefinida".
    pub category_name: Option<String>,
    pub cost_price: f64,
    pub sale_price: f64,
    pub quantity: i64,
    pub min_quantity: Option<i64>,
    pub active: bool,
}

/// One `stock_movements` ledger row, joined with its item/user names — feeds
/// `MovimentacaoEstoquePage` ("Histórico de movimentações de estoque").
/// `itemId` (not just `itemName`) travels too so a report can
/// group by item reliably (`VendasPorCategoriaItemPage`'s `SaleItemReportRow`
/// groups by name instead only because `sale_items` snapshots the name and
/// has no `item_id` guarantee across a deleted item — this table always has
/// a live `item_id`, cascade-deleted alongside the item itself).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StockMovementRow {
    pub id: i64,
    pub item_id: i64,
    pub item_name: String,
    pub movement_type: String,
    pub quantity_delta: i64,
    pub user_name: String,
    pub created_at: String,
    /// The linked sale's `status` (`"completed"`/`"cancelled"`) when
    /// `sale_id` is set (`movement_type` `"sale"` or `"refund"`), `None`
    /// otherwise. Lets a consumer tell a `sale` movement whose sale was
    /// later cancelled apart from one that's still live — e.g.
    /// `ItensParadosPage` shouldn't treat a fully-estornada sale as recent
    /// activity when deciding an item is still "moving".
    pub sale_status: Option<String>,
}

/// One `item_price_history` row, joined with its item/user names — same
/// "fetch everything" ledger query as `StockMovementRow`, for the "Histórico
/// de alteração de preço" report.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ItemPriceHistoryRow {
    pub id: i64,
    pub item_id: i64,
    pub item_name: String,
    pub cost_price: f64,
    pub sale_price: f64,
    pub user_name: String,
    pub created_at: String,
}

/// One row of the items CSV export/import, as it travels over the Tauri IPC
/// (JSON, camelCase, same convention as every other model here) — **not**
/// what actually gets written to/read from the `.csv` file itself, which
/// uses Portuguese headers instead (see `commands::items::ItemCsvFileRow`,
/// converted to/from this type right at the `csv_util` boundary). Keeping
/// these separate means a `serde(rename)` chosen for the spreadsheet's
/// column header can never silently break the JSON contract with the
/// frontend, which expects plain camelCase like every other command.
/// `active` travels as `"sim"`/`"nao"` rather than a bool: friendlier to type
/// by hand in a spreadsheet than `1`/`0`, and `csv`/`serde` has no built-in
/// support for a custom bool spelling.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ItemCsvRow {
    pub code: String,
    pub name: String,
    /// Blank = "Categoria indefinida", same convention as `ItemSummary::category_name`.
    pub category: String,
    pub cost_price: f64,
    pub sale_price: f64,
    pub quantity: i64,
    pub min_quantity: Option<i64>,
    pub active: String,
}

/// One field that differs between the DB's current item and an incoming CSV
/// row — `field` matches `ItemCsvRow`'s header names ("nome", "preco_custo",
/// ...) so the frontend can pick the right label/formatter per row.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ItemCsvFieldDiff {
    pub field: String,
    pub current: String,
    pub new: String,
}

/// A CSV row whose code (or, as fallback, normalized name) matched no
/// existing item — a candidate to create, unless the admin remaps it to an
/// existing item on the review screen ("Importação de CSV — tela de
/// resumo").
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ItemCsvNewRow {
    pub row_line: usize,
    pub row: ItemCsvRow,
    /// Set when the row's name, accent/case-folded, exactly matches an
    /// existing item's — a possible typo/variation the admin should confirm
    /// rather than a definite new item. `None` doesn't rule out a manual
    /// remap; it just means nothing was auto-suggested.
    pub suggested_item_id: Option<i64>,
    pub suggested_item_name: Option<String>,
}

/// A CSV row matched directly by `code` to an existing item, with at least
/// one field actually different from what's stored (rows with no diff are
/// left out of the preview entirely — nothing to review).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ItemCsvChangedRow {
    pub row_line: usize,
    pub item_id: i64,
    pub diffs: Vec<ItemCsvFieldDiff>,
    pub row: ItemCsvRow,
}

/// An active item that exists in the DB but wasn't matched by any CSV row —
/// the admin picks what happens to it on the review screen (default "keep").
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ItemCsvMissingItem {
    pub item_id: i64,
    pub code: String,
    pub name: String,
    pub quantity: i64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ItemCsvRowError {
    pub line: usize,
    pub message: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ItemsCsvImportPreview {
    pub new_items: Vec<ItemCsvNewRow>,
    pub changed_items: Vec<ItemCsvChangedRow>,
    pub missing_items: Vec<ItemCsvMissingItem>,
    pub errors: Vec<ItemCsvRowError>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ItemCsvCreateDecision {
    pub row: ItemCsvRow,
}

/// `keep_existing_name` is set when this update came from a "new" row the
/// admin manually remapped to an existing item — the CSV's name is discarded
/// and the DB's own name kept, so a typo in the spreadsheet (e.g. "Canet")
/// can't silently rename the real item ("Caneta"). A direct code match never
/// sets this — its name *does* follow the CSV, same as any other field.
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ItemCsvUpdateDecision {
    pub item_id: i64,
    pub row: ItemCsvRow,
    pub keep_existing_name: bool,
}

/// `action`: `"keep"` (default, no-op), `"zero"` (set quantity to 0), or
/// `"deactivate"`.
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ItemCsvMissingAction {
    pub item_id: i64,
    pub action: String,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ItemsCsvImportDecision {
    pub creates: Vec<ItemCsvCreateDecision>,
    pub updates: Vec<ItemCsvUpdateDecision>,
    pub missing_actions: Vec<ItemCsvMissingAction>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ItemsCsvImportResult {
    pub created: i64,
    pub updated: i64,
    pub missing_handled: i64,
}

/// One line the frontend wants to add to a sale — `commands::sales::create_sale`
/// never trusts `unit_price`/`item_code`/`item_name` from the caller, it
/// re-fetches those fresh from `items` (see `docs/database.md`'s `sale_items`).
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SaleItemInput {
    pub item_id: i64,
    pub quantity: i64,
    pub discount_percent: Option<f64>,
    pub discount_amount: Option<f64>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SaleItemDetail {
    pub item_id: Option<i64>,
    pub item_code: String,
    pub item_name: String,
    pub unit_price: f64,
    pub quantity: i64,
    pub discount_percent: Option<f64>,
    pub discount_amount: Option<f64>,
    pub subtotal: f64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SaleDetail {
    pub id: i64,
    pub receipt_number: String,
    pub user_id: i64,
    pub user_name: String,
    pub subtotal: f64,
    pub discount_percent: Option<f64>,
    pub discount_amount: Option<f64>,
    pub discount_authorized_by_name: Option<String>,
    pub total: f64,
    pub status: String,
    pub payment_method: String,
    /// Only set when `payment_method == "credit"` — the client the debt was
    /// lodged against (see `commands::clients`).
    pub client_id: Option<i64>,
    pub client_name: Option<String>,
    /// Amount of the Crediário debt paid off so far for this specific sale —
    /// sum of active `credit_payment_allocations` targeting it, whether paid
    /// at sale time ("Valor pago agora") or later through Clientes. `None`
    /// when nothing has been paid on it yet, or the sale isn't Crediário.
    pub credit_paid: Option<f64>,
    /// The four `cancelled_*`/`cancel_*` fields below are only set once the
    /// sale has been cancelled/estornada — never deleted, see
    /// `commands::sales::cancel_sale`.
    pub cancelled_at: Option<String>,
    pub cancelled_by_name: Option<String>,
    pub cancel_authorized_by_name: Option<String>,
    pub created_at: String,
    pub items: Vec<SaleItemDetail>,
    /// `None` when the PDF failed to generate right after the sale committed
    /// (disk full, permission, ...) — the sale itself is still valid either
    /// way; the frontend offers "gerar recibo" again in that case.
    pub receipt_pdf_path: Option<String>,
}

/// Lightweight row for the Histórico de vendas listing — no line items (those
/// are a separate round-trip via `get_sale_detail`, only fetched once a
/// specific sale is opened).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SaleListItem {
    pub id: i64,
    pub receipt_number: String,
    pub created_at: String,
    pub user_name: String,
    pub client_name: Option<String>,
    pub payment_method: String,
    pub total: f64,
    pub status: String,
    /// Combined discount (item-level + general), i.e. gross total (no
    /// discounts) minus `total` — `0.0` when the sale had none.
    pub discount_value: f64,
}

/// One `sale_items` line, joined with its (current) category — the
/// line-item-level counterpart of `SaleListItem`, needed for any report that
/// breaks sales down by category/item instead of just by sale (`list_sales`
/// has no line items). `category_name`/`item_name` reflect the item's
/// *current* category/name, not a historical snapshot — same limitation
/// `commands::dashboard::sales_by_category`/`top_selling_items` already have
/// (both also `GROUP BY si.item_name`, joining `items`/`categories` live).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SaleItemReportRow {
    pub sale_id: i64,
    pub created_at: String,
    pub status: String,
    pub item_name: String,
    /// `None` = "Categoria indefinida", same convention as `ItemSummary::category_name`.
    pub category_name: Option<String>,
    pub quantity: i64,
    pub subtotal: f64,
}

/// One granted discount — either a sale's general discount or a single
/// `sale_items` line's discount — powering `Relatórios > Descontos
/// concedidos` (`commands::sales::list_sale_discounts`). A sale with both a
/// general *and* one or more item-level discounts produces one row of each
/// kind, not a single merged row: the original mockup's
/// `descontos-concedidos` screen shows one "Tipo" per row, and a sale's
/// discounts can genuinely be of different kinds. `discountPercent`/`itemName` are left
/// for the frontend to turn into the "Geral (10%)"/"Item (Nome, -15%)" label
/// text, same reasoning as `SaleDetail` not pre-formatting money for display.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SaleDiscountRow {
    /// Synthesized (`"general-{sale id}"` / `"item-{sale_items id}"`) — a
    /// stable React key, not a real database id, same convention as
    /// `AdminAuthorizationRow::id`.
    pub id: String,
    pub receipt_number: String,
    pub created_at: String,
    /// The cashier who made the sale — used only for the "operador" filter,
    /// not shown as its own table column (matches the mockup).
    pub user_name: String,
    /// `"general"` | `"item"`.
    pub kind: String,
    /// `Some` only when `kind == "item"`.
    pub item_name: Option<String>,
    /// The original percent input, `None` when the discount was entered as a
    /// fixed R$ amount instead.
    pub discount_percent: Option<f64>,
    /// Resolved discount value in reais, always positive.
    pub amount: f64,
    pub authorized_by_name: String,
}

/// One row of a sales CSV export, as it travels over the Tauri IPC (JSON,
/// camelCase) — already shaped for display by the frontend (`toSaleCsvRows`
/// in `src/lib/api.ts`: formatted date, payment method label, "Concluída"/
/// "Cancelada"), not raw codes. **Not** what actually gets written to the
/// `.csv` file, which uses Portuguese headers instead — see
/// `commands::sales::SaleCsvFileRow`, converted from this type right at the
/// `csv_util` boundary. Same split, same reasoning, as `ItemCsvRow`/
/// `commands::items::ItemCsvFileRow`.
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SaleCsvRow {
    pub receipt_number: String,
    pub created_at: String,
    pub client_name: String,
    pub user_name: String,
    pub payment_method: String,
    pub discount: f64,
    pub total: f64,
    pub status: String,
}

/// One (label, value) pair from a report's on-screen stat cards — the JSON/
/// IPC counterpart of `pdf_util::ReportPdfStat`, sent by whichever report
/// page calls `export_sales_report_pdf` (or a future report's own PDF export).
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReportPdfStatInput {
    pub label: String,
    pub value: String,
}

/// A client, with their computed Crediário balance — used both by the
/// Clientes listing (all clients, optionally filtered client-side to
/// `balance > 0`, mirroring how Estoque filters `list_items` client-side) and
/// by the client picker inside the Venda payment modal (all clients, matched
/// by name). Only someone with `balance > 0` is a "devedor" — most clients
/// never carry a Crediário balance at all.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClientSummary {
    pub id: i64,
    pub name: String,
    pub phone: Option<String>,
    pub reminder_date: Option<String>,
    pub note: Option<String>,
    pub birth_date: Option<String>,
    /// `"cpf"` or `"cnpj"` — can be set alone (client known to be pessoa
    /// jurídica, say, but their CNPJ wasn't on hand at registration time)
    /// without `document_number`; the reverse (a number with no type) never
    /// happens, enforced in `commands::clients`.
    pub document_type: Option<String>,
    /// Digits only for CPF, uppercase alphanumeric for CNPJ — never the
    /// masked/formatted display string.
    pub document_number: Option<String>,
    pub balance: f64,
}

/// One sale in a client's purchase history, any payment method — `paid`/
/// `remaining` only carry real meaning for Crediário (the one method with
/// partial/deferred payment); every other method is settled in full at sale
/// time, so those rows always report `paid == total` and `remaining == 0`.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClientSaleSummary {
    pub sale_id: i64,
    pub receipt_number: String,
    pub created_at: String,
    pub total: f64,
    pub payment_method: String,
    /// Sum of active (non-cancelled-payment) `credit_payment_allocations` for
    /// this sale — `total - paid` is what's still owed on it specifically.
    pub paid: f64,
    pub remaining: f64,
    /// `"completed"` or `"cancelled"` — so Clientes can flag a reversed sale
    /// without needing to open "Ver venda" to find out.
    pub status: String,
}

/// One sale a `credit_payments` row was allocated to, with how much of that
/// payment went to it — a payment can span multiple sales (see
/// `commands::clients::register_credit_payment`).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreditPaymentAllocationSummary {
    pub sale_id: i64,
    pub receipt_number: String,
    pub amount: f64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreditPaymentSummary {
    pub id: i64,
    pub amount: f64,
    pub user_name: String,
    pub created_at: String,
    pub allocations: Vec<CreditPaymentAllocationSummary>,
    /// The four `cancelled_*` fields below are only set once the payment has
    /// been soft-cancelled (never deleted) — see `commands::clients::cancel_credit_payment`.
    pub cancelled_at: Option<String>,
    pub cancelled_by_name: Option<String>,
    pub cancel_authorized_by_name: Option<String>,
    pub cancel_reason: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClientDetail {
    pub id: i64,
    pub name: String,
    pub phone: Option<String>,
    pub reminder_date: Option<String>,
    pub note: Option<String>,
    pub birth_date: Option<String>,
    pub document_type: Option<String>,
    pub document_number: Option<String>,
    pub balance: f64,
    pub sales: Vec<ClientSaleSummary>,
    pub payments: Vec<CreditPaymentSummary>,
}

/// Global (all clients) version of `ClientSaleSummary` — every still-open
/// Crediário sale, used only by the "Inadimplência" report's aging
/// computation (`commands::clients::list_credit_sales`), which needs each
/// client's *oldest* open sale date, not just their current total balance.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreditSaleReportRow {
    pub sale_id: i64,
    pub client_id: i64,
    pub client_name: String,
    pub receipt_number: String,
    pub created_at: String,
    pub total: f64,
    pub paid: f64,
    pub remaining: f64,
}

/// Every `credit_payments` row, across all clients (active and cancelled) —
/// feeds both "Pagamentos recebidos" (`cancelledAt === null`) and "Pagamentos
/// cancelados" (`cancelledAt !== null`), same "one command, filtered
/// client-side per report" shape as `list_sales`/`list_stock_movements`.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreditPaymentReportRow {
    pub id: i64,
    pub client_id: i64,
    pub client_name: String,
    pub amount: f64,
    pub user_name: String,
    pub created_at: String,
    pub cancelled_at: Option<String>,
    pub cancelled_by_name: Option<String>,
    pub cancel_authorized_by_name: Option<String>,
    pub cancel_reason: Option<String>,
}

/// One authorized admin action, from one of 3 sources unioned by
/// `commands::audit::list_admin_authorizations` — see that command's doc
/// comment for exactly which 3, and why a 4th candidate (cliente renomeado)
/// isn't included. `id` is synthesized (`"{actionType}-{row id}"`, e.g.
/// `"discount-42"`) since rows come from 3 different tables with their own
/// autoincrement ids — just a stable React key, not a real database id.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AdminAuthorizationRow {
    pub id: String,
    /// `"discount"` | `"sale_cancel"` | `"payment_cancel"`.
    pub action_type: String,
    /// Receipt number for `discount`/`sale_cancel`, `null` for
    /// `payment_cancel` (a payment has no receipt of its own — `clientName`
    /// is the reference there instead).
    pub reference: Option<String>,
    pub client_name: Option<String>,
    pub amount: f64,
    /// Who performed the underlying action (applied the discount, requested
    /// the cancellation) — same person as `authorizedByName` when an Admin
    /// self-authorized their own action (no separate password typed, see
    /// `guard::resolve_admin_authorization`), different when a second admin's
    /// password was required.
    pub requested_by_name: String,
    pub authorized_by_name: String,
    pub created_at: String,
}

/// One card's position/size/visibility in a single Admin's Dashboard —
/// `size` travels as a raw string (e.g. "2x1"), not validated against a
/// fixed set on the backend: the vocabulary of sizes is a frontend catalog
/// decision (`src/components/dashboard-cards/catalog.ts`), same reasoning as
/// the schema's lack of a `CHECK` on `dashboard_layout.size`.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DashboardLayoutItem {
    pub card_key: String,
    pub x: i64,
    pub y: i64,
    pub size: String,
    pub visible: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LowStockItemSummary {
    pub name: String,
    pub quantity: i64,
    /// `None` when this item has no minimum configured — it can still show
    /// up here at `quantity == 0` (see `commands::dashboard::low_stock_candidates`).
    pub min_quantity: Option<i64>,
}

/// The folder receipts PDFs are saved to, always resolved to an absolute
/// path — `isCustom` is `false` when this is just the app's own default
/// (`<pasta de dados do app>/recibos/`), `true` when an Admin picked a
/// different one in Configurações. See `commands::receipts::receipts_dir`.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptsFolderInfo {
    pub path: String,
    pub is_custom: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TopSellingItemSummary {
    pub name: String,
    pub quantity: i64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CategorySalesSummary {
    pub category_name: Option<String>,
    pub total: f64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PaymentMethodSalesSummary {
    pub payment_method: String,
    pub count: i64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DailySalesSummary {
    /// `YYYY-MM-DD`, local time.
    pub date: String,
    pub total: f64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RecentSaleSummary {
    pub receipt_number: String,
    pub created_at: String,
    pub user_name: String,
    pub total: f64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReminderDueSummary {
    pub client_id: i64,
    pub client_name: String,
    pub reminder_date: String,
    pub overdue: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CancelledSalesSummary {
    pub count: i64,
    pub total_value: f64,
}

/// Everything every Dashboard card needs, fetched in one round-trip
/// (`commands::dashboard::get_dashboard_data`) — cards never fetch their own
/// data, they only read their own slice of this via props (same "dumb
/// component" rule as the catalog itself). All money/count figures already
/// exclude `status = 'cancelled'` sales unless the field name says otherwise.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DashboardData {
    pub items_in_stock: i64,
    pub stock_value: f64,
    pub sales_today: f64,
    pub sales_month: f64,
    pub received_today: f64,
    pub received_month: f64,
    pub low_stock_count: i64,
    pub low_stock_items: Vec<LowStockItemSummary>,
    pub top_selling_items: Vec<TopSellingItemSummary>,
    pub sales_by_category: Vec<CategorySalesSummary>,
    pub payment_methods: Vec<PaymentMethodSalesSummary>,
    pub sales_last_7_days: Vec<DailySalesSummary>,
    pub recent_sales: Vec<RecentSaleSummary>,
    /// `null` when there's no completed sale in the previous month to compare against.
    pub month_comparison_percent: Option<f64>,
    pub reminders_due: Vec<ReminderDueSummary>,
    pub credit_outstanding_total: f64,
    pub discount_granted_month: f64,
    pub cancelled_sales_month: CancelledSalesSummary,
}
