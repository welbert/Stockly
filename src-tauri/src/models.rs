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
    pub created_at: String,
    pub items: Vec<SaleItemDetail>,
    /// `None` when the PDF failed to generate right after the sale committed
    /// (disk full, permission, ...) — the sale itself is still valid either
    /// way; the frontend offers "gerar recibo" again in that case.
    pub receipt_pdf_path: Option<String>,
}
