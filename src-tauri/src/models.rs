use rusqlite::Row;
use serde::{Deserialize, Serialize};

/// `username` is intentionally excluded — it's an internal login key only
/// (auto-derived from `name`, see `commands::users::slugify`), never shown
/// or edited through the UI (login picks a profile by id, not by typing it).
pub const USER_PROFILE_COLUMNS: &str = "id, name, is_admin, active, auto_lock_minutes, theme, last_login_at";

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
            last_login_at: row.get(6)?,
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
    /// at sale time ("Valor pago agora") or later through Devedores. `None`
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

/// A client ("devedor") with their computed Crediário balance — used both by
/// the Devedores listing (filtered client-side to `balance > 0`, mirroring
/// how Estoque filters `list_items` client-side) and by the client picker
/// inside the Venda payment modal (all clients, matched by name).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClientSummary {
    pub id: i64,
    pub name: String,
    pub phone: Option<String>,
    pub reminder_date: Option<String>,
    pub note: Option<String>,
    pub balance: f64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreditSaleSummary {
    pub sale_id: i64,
    pub receipt_number: String,
    pub created_at: String,
    pub total: f64,
    /// Sum of active (non-cancelled-payment) `credit_payment_allocations` for
    /// this sale — `total - paid` is what's still owed on it specifically.
    pub paid: f64,
    pub remaining: f64,
    /// `"completed"` or `"cancelled"` — so Devedores can flag a reversed sale
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
    pub balance: f64,
    pub credit_sales: Vec<CreditSaleSummary>,
    pub payments: Vec<CreditPaymentSummary>,
}
