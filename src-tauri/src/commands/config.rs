use crate::commands::clients::has_open_debtors;
use crate::guard::{active_user_id, require_admin};
use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

const LOW_STOCK_PERCENT_KEY: &str = "low_stock_warning_percent";
/// 20% is a reasonable starting buffer above `min_quantity` for the yellow
/// "Baixo" chip; change via `set_low_stock_percent`.
const DEFAULT_LOW_STOCK_PERCENT: i64 = 20;

/// `pub(crate)`, not just the `#[tauri::command]` below — also read by
/// `commands::dashboard` to apply the exact same "warning" threshold to its
/// low-stock cards, instead of a narrower critical-only definition.
pub(crate) fn low_stock_percent(conn: &Connection) -> Result<i64, String> {
    let value: Option<String> = conn
        .query_row("SELECT value FROM config WHERE key = ?1", params![LOW_STOCK_PERCENT_KEY], |row| row.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(value.and_then(|v| v.parse().ok()).unwrap_or(DEFAULT_LOW_STOCK_PERCENT))
}

/// Both roles read this (it's used to compute the yellow "warning" chip in
/// Estoque, above the red "critical" threshold), but only Admin can change it.
#[tauri::command]
pub fn get_low_stock_percent(state: State<AppState>) -> Result<i64, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;
    low_stock_percent(&conn)
}

#[tauri::command]
pub fn set_low_stock_percent(state: State<AppState>, percent: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;
    if percent < 0 {
        return Err("Percentual não pode ser negativo".to_string());
    }
    conn.execute(
        "INSERT INTO config (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![LOW_STOCK_PERCENT_KEY, percent.to_string()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

const ITEM_CODE_PAD_LENGTH_KEY: &str = "item_code_pad_length";
/// 4 digits ("0001") is a reasonable starting width for a small store's
/// catalog; change via `set_item_code_pad_length`. Only affects codes the
/// app generates on its own (blank `code` at creation, see
/// `commands::items::padded_next_code_base`) — never a manually typed code,
/// and never shrinks a generated code below its natural digit count once the
/// item count outgrows this width (e.g. item #12345 stays "12345" even at
/// the default width of 4 — padding never truncates).
const DEFAULT_ITEM_CODE_PAD_LENGTH: i64 = 4;

/// `pub(crate)`, not just the `#[tauri::command]` below — also read directly
/// by `commands::items::create_item`/`import_items_csv` when generating a code.
pub(crate) fn item_code_pad_length(conn: &Connection) -> Result<i64, String> {
    let value: Option<String> = conn
        .query_row("SELECT value FROM config WHERE key = ?1", params![ITEM_CODE_PAD_LENGTH_KEY], |row| row.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(value.and_then(|v| v.parse().ok()).unwrap_or(DEFAULT_ITEM_CODE_PAD_LENGTH))
}

/// Admin-only both ways — only the (Admin-only) item creation form and CSV
/// import consume this.
#[tauri::command]
pub fn get_item_code_pad_length(state: State<AppState>) -> Result<i64, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;
    item_code_pad_length(&conn)
}

#[tauri::command]
pub fn set_item_code_pad_length(state: State<AppState>, digits: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;
    if !(1..=10).contains(&digits) {
        return Err("Número de dígitos deve estar entre 1 e 10".to_string());
    }
    conn.execute(
        "INSERT INTO config (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![ITEM_CODE_PAD_LENGTH_KEY, digits.to_string()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

const PROFIT_MARGIN_KEY: &str = "default_profit_margin_percent";
/// 30% is a reasonable starting markup over cost; change via
/// `set_default_profit_margin`.
const DEFAULT_PROFIT_MARGIN_PERCENT: f64 = 30.0;

/// Admin-only both ways — only the item creation form (Admin-only) consumes
/// this, to suggest `sale_price = cost_price * (1 + percent / 100)`.
#[tauri::command]
pub fn get_default_profit_margin(state: State<AppState>) -> Result<f64, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;
    let value: Option<String> = conn
        .query_row("SELECT value FROM config WHERE key = ?1", params![PROFIT_MARGIN_KEY], |row| row.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(value.and_then(|v| v.parse().ok()).unwrap_or(DEFAULT_PROFIT_MARGIN_PERCENT))
}

#[tauri::command]
pub fn set_default_profit_margin(state: State<AppState>, percent: f64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;
    if percent < 0.0 {
        return Err("Percentual não pode ser negativo".to_string());
    }
    conn.execute(
        "INSERT INTO config (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![PROFIT_MARGIN_KEY, percent.to_string()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) const STORE_NAME_KEY: &str = "store_name";
pub(crate) const STORE_INFO_KEY: &str = "store_info";

pub(crate) fn config_string(conn: &Connection, key: &str) -> Result<String, String> {
    let value: Option<String> =
        conn.query_row("SELECT value FROM config WHERE key = ?1", params![key], |row| row.get(0)).optional().map_err(|e| e.to_string())?;
    Ok(value.unwrap_or_default())
}

pub(crate) fn set_config_string(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO config (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Both roles read this (used to build the receipt header, see
/// `commands::receipts`), only Admin can change it. Empty (the default,
/// nothing configured) means the receipt falls back to "BORA VENDER".
#[tauri::command]
pub fn get_store_name(state: State<AppState>) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;
    config_string(&conn, STORE_NAME_KEY)
}

#[tauri::command]
pub fn set_store_name(state: State<AppState>, name: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;
    set_config_string(&conn, STORE_NAME_KEY, name.trim())
}

/// Free-text lines printed under the store name on the receipt (e.g. CNPJ,
/// phone) — one line per `\n`, printed as-is. Empty means no extra lines.
#[tauri::command]
pub fn get_store_info(state: State<AppState>) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;
    config_string(&conn, STORE_INFO_KEY)
}

#[tauri::command]
pub fn set_store_info(state: State<AppState>, info: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;
    set_config_string(&conn, STORE_INFO_KEY, info.trim())
}

pub(crate) const RECEIPT_THANK_YOU_KEY: &str = "receipt_thank_you_message";
/// Unlike `store_name`/`store_info` (empty means "fall back to something
/// else"), this one already comes back with a real message when nothing's
/// been configured yet — the Settings field shows it pre-filled from the start.
pub(crate) const DEFAULT_THANK_YOU_MESSAGE: &str = "Obrigado pela preferência!";

/// Both roles read this (used to build the receipt footer, see
/// `commands::receipts`), only Admin can change it.
#[tauri::command]
pub fn get_receipt_thank_you_message(state: State<AppState>) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;
    let value = config_string(&conn, RECEIPT_THANK_YOU_KEY)?;
    Ok(if value.is_empty() { DEFAULT_THANK_YOU_MESSAGE.to_string() } else { value })
}

#[tauri::command]
pub fn set_receipt_thank_you_message(state: State<AppState>, message: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;
    set_config_string(&conn, RECEIPT_THANK_YOU_KEY, message.trim())
}

const CREDIT_ENABLED_KEY: &str = "credit_enabled";

/// Both roles read this — it decides whether "Crediário" shows up as a
/// payment method in Venda. Enabled by default (no row yet = "1").
#[tauri::command]
pub fn get_credit_enabled(state: State<AppState>) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;
    let value = config_string(&conn, CREDIT_ENABLED_KEY)?;
    Ok(value != "0")
}

/// Admin-only, and blocked while any client still has an open Crediário
/// balance — same "reconfirmation not needed, but must be structurally safe"
/// spirit as the other Configurações locks ("Crediário" > "trava de
/// desativação").
#[tauri::command]
pub fn set_credit_enabled(state: State<AppState>, enabled: bool) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;
    if !enabled && has_open_debtors(&conn)? {
        return Err("Não é possível desativar: existem devedores com saldo em aberto".to_string());
    }
    set_config_string(&conn, CREDIT_ENABLED_KEY, if enabled { "1" } else { "0" })
}
