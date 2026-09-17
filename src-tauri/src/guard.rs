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

/// Shared bcrypt check — `commands::auth::verify_password` is a thin wrapper
/// around this; kept here (not commands/auth.rs) so it can also be called
/// from within `commands::sales` without a cross-module `#[tauri::command]` call.
pub(crate) fn verify_user_password(conn: &Connection, user_id: i64, password: &str) -> Result<bool, String> {
    let hash: String = conn
        .query_row("SELECT password_hash FROM users WHERE id = ?1", params![user_id], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    bcrypt::verify(password, &hash).map_err(|e| e.to_string())
}

/// Resolves who is authorizing an admin-gated action inside a sale (discount,
/// cancel/refund): if the active session is already an Admin, they authorize
/// themselves, no extra password required. Otherwise `authorizer_id`/
/// `authorizer_password` must name a *different* admin whose password checks
/// out — same modal pattern for both discount and cancel/estorno.
pub(crate) fn resolve_admin_authorization(
    state: &AppState,
    conn: &Connection,
    authorizer_id: Option<i64>,
    authorizer_password: Option<&str>,
) -> Result<i64, String> {
    let active_id = active_user_id(state)?;
    if user_is_admin(conn, active_id)? {
        return Ok(active_id);
    }
    let authorizer_id = authorizer_id.ok_or_else(|| "Autorização de um administrador é obrigatória".to_string())?;
    let password = authorizer_password.ok_or_else(|| "Senha do administrador é obrigatória".to_string())?;
    if !user_is_admin(conn, authorizer_id)? {
        return Err("O usuário selecionado não é administrador".to_string());
    }
    if !verify_user_password(conn, authorizer_id, password)? {
        return Err("Senha incorreta".to_string());
    }
    Ok(authorizer_id)
}
