use crate::guard::{active_user_id, require_admin};
use crate::models::CategorySummary;
use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

fn fetch_category(conn: &Connection, id: i64) -> Result<CategorySummary, String> {
    conn.query_row("SELECT id, name FROM categories WHERE id = ?1", params![id], |row| {
        Ok(CategorySummary { id: row.get(0)?, name: row.get(1)? })
    })
    .map_err(|e| e.to_string())
}

fn name_taken(conn: &Connection, name: &str, exclude_id: Option<i64>) -> Result<bool, String> {
    match exclude_id {
        Some(id) => conn
            .query_row("SELECT 1 FROM categories WHERE name = ?1 AND id != ?2", params![name, id], |_| Ok(()))
            .optional(),
        None => conn.query_row("SELECT 1 FROM categories WHERE name = ?1", params![name], |_| Ok(())).optional(),
    }
    .map(|r| r.is_some())
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_categories(state: State<AppState>) -> Result<Vec<CategorySummary>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;
    let mut stmt = conn.prepare("SELECT id, name FROM categories ORDER BY name").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok(CategorySummary { id: row.get(0)?, name: row.get(1)? }))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_category(state: State<AppState>, name: String) -> Result<CategorySummary, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;
    if name_taken(&conn, &name, None)? {
        return Err("Já existe uma categoria com esse nome".to_string());
    }
    conn.execute("INSERT INTO categories (name) VALUES (?1)", params![name]).map_err(|e| e.to_string())?;
    fetch_category(&conn, conn.last_insert_rowid())
}

#[tauri::command]
pub fn rename_category(state: State<AppState>, id: i64, name: String) -> Result<CategorySummary, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;
    if name_taken(&conn, &name, Some(id))? {
        return Err("Já existe uma categoria com esse nome".to_string());
    }
    conn.execute("UPDATE categories SET name = ?1 WHERE id = ?2", params![name, id]).map_err(|e| e.to_string())?;
    fetch_category(&conn, id)
}

/// Items in this category aren't deleted — `items.category_id` is `ON DELETE
/// SET NULL`, so they just fall back to "Categoria indefinida" (see PLANO.md).
#[tauri::command]
pub fn delete_category(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;
    conn.execute("DELETE FROM categories WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}
