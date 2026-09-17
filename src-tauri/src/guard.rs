use crate::AppState;
use rusqlite::{params, Connection};

/// The AppState's active session id, or an error if nobody is logged in.
pub(crate) fn active_user_id(state: &AppState) -> Result<i64, String> {
    state.active_user_id.lock().map_err(|e| e.to_string())?.ok_or_else(|| "Nenhum usuário autenticado".to_string())
}

pub(crate) fn user_is_admin(conn: &Connection, id: i64) -> Result<bool, String> {
    conn.query_row("SELECT is_admin FROM users WHERE id = ?1", params![id], |row| row.get::<_, i64>(0))
        .map(|v| v != 0)
        .map_err(|e| e.to_string())
}

/// Checks the AppState's active session is an admin, returning its id. Used
/// to gate every admin-only mutation at the backend layer too, not just the UI.
pub(crate) fn require_admin(state: &AppState, conn: &Connection) -> Result<i64, String> {
    let id = active_user_id(state)?;
    if !user_is_admin(conn, id)? {
        return Err("Apenas administradores podem realizar esta ação".to_string());
    }
    Ok(id)
}
