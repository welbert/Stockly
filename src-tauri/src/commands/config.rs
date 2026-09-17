use crate::guard::{active_user_id, require_admin};
use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

const LOW_STOCK_PERCENT_KEY: &str = "low_stock_warning_percent";
/// 20% is a reasonable starting buffer above `min_quantity` for the yellow
/// "Baixo" chip; change via `set_low_stock_percent`.
const DEFAULT_LOW_STOCK_PERCENT: i64 = 20;

/// Both roles read this (it's used to compute the yellow "warning" chip in
/// Estoque, above the red "critical" threshold), but only Admin can change it.
#[tauri::command]
pub fn get_low_stock_percent(state: State<AppState>) -> Result<i64, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;
    let value: Option<String> = conn
        .query_row("SELECT value FROM config WHERE key = ?1", params![LOW_STOCK_PERCENT_KEY], |row| row.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(value.and_then(|v| v.parse().ok()).unwrap_or(DEFAULT_LOW_STOCK_PERCENT))
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

fn set_config_string(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
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
