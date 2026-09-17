use crate::guard::{active_user_id, require_admin};
use crate::AppState;
use rusqlite::{params, OptionalExtension};
use tauri::State;

const LOW_STOCK_PERCENT_KEY: &str = "low_stock_warning_percent";
/// 20% is a reasonable starting buffer above `min_quantity` for the yellow
/// "Baixo" chip; change via `set_low_stock_percent`.
const DEFAULT_LOW_STOCK_PERCENT: i64 = 20;

/// Both roles read this (it's used to compute the yellow chip in Estoque),
/// but only Admin can change it — see PLANO.md's "Alerta de estoque baixo".
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
