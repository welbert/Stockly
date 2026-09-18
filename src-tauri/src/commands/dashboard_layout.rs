use crate::db;
use crate::guard::require_admin;
use crate::models::DashboardLayoutItem;
use crate::AppState;
use rusqlite::params;
use tauri::State;

fn map_item(row: &rusqlite::Row) -> rusqlite::Result<DashboardLayoutItem> {
    Ok(DashboardLayoutItem {
        card_key: row.get(0)?,
        x: row.get(1)?,
        y: row.get(2)?,
        size: row.get(3)?,
        visible: row.get::<_, i64>(4)? != 0,
    })
}

fn list_layout(conn: &rusqlite::Connection, user_id: i64) -> Result<Vec<DashboardLayoutItem>, String> {
    let mut stmt = conn
        .prepare("SELECT card_key, x, y, size, visible FROM dashboard_layout WHERE user_id = ?1 ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![user_id], map_item).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// The logged-in Admin's own dashboard layout — always `AppState.active_user_id`,
/// never a caller-supplied id (see `CLAUDE.md`'s Auth rule). An Admin who has
/// never opened this screen before gets `DEFAULT_DASHBOARD_LAYOUT` seeded at
/// this exact moment, instead of an empty grid.
#[tauri::command]
pub fn get_dashboard_layout(state: State<AppState>) -> Result<Vec<DashboardLayoutItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let user_id = require_admin(&state, &conn)?;
    let existing = list_layout(&conn, user_id)?;
    if !existing.is_empty() {
        return Ok(existing);
    }
    db::seed_default_dashboard_layout(&conn, user_id)?;
    list_layout(&conn, user_id)
}

/// Replaces the logged-in Admin's entire layout — called on every drag/resize
/// (debounced client-side) and on every add/remove-card click (immediate).
/// Each Admin has their own layout (`UNIQUE(user_id, card_key)`), so this
/// never touches another profile's dashboard.
#[tauri::command]
pub fn save_dashboard_layout(state: State<AppState>, items: Vec<DashboardLayoutItem>) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    let user_id = require_admin(&state, &conn)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM dashboard_layout WHERE user_id = ?1", params![user_id]).map_err(|e| e.to_string())?;
    for item in &items {
        tx.execute(
            "INSERT INTO dashboard_layout (user_id, card_key, x, y, size, visible) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![user_id, item.card_key, item.x, item.y, item.size, item.visible],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}
