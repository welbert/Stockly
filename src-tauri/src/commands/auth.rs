use crate::guard::verify_user_password;
use crate::models::{UserProfile, USER_PROFILE_COLUMNS};
use crate::AppState;
use rusqlite::{params, Connection};
use tauri::State;

fn fetch_profile(conn: &Connection, id: i64) -> Result<UserProfile, String> {
    conn.query_row(
        &format!("SELECT {USER_PROFILE_COLUMNS} FROM users WHERE id = ?1"),
        params![id],
        UserProfile::from_row,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn login(state: State<AppState>, user_id: i64, password: String) -> Result<UserProfile, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let (hash, active): (String, i64) = conn
        .query_row("SELECT password_hash, active FROM users WHERE id = ?1", params![user_id], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .map_err(|_| "Usuário não encontrado".to_string())?;
    if active == 0 {
        return Err("Usuário desativado".to_string());
    }
    let ok = bcrypt::verify(&password, &hash).map_err(|e| e.to_string())?;
    if !ok {
        return Err("Senha incorreta".to_string());
    }
    conn.execute("UPDATE users SET last_login_at = datetime('now') WHERE id = ?1", params![user_id])
        .map_err(|e| e.to_string())?;
    *state.active_user_id.lock().map_err(|e| e.to_string())? = Some(user_id);
    fetch_profile(&conn, user_id)
}

#[tauri::command]
pub fn logout(state: State<AppState>) -> Result<(), String> {
    *state.active_user_id.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

#[tauri::command]
pub fn get_active_user(state: State<AppState>) -> Result<Option<UserProfile>, String> {
    let active_id = *state.active_user_id.lock().map_err(|e| e.to_string())?;
    match active_id {
        Some(id) => {
            let conn = state.db.lock().map_err(|e| e.to_string())?;
            Ok(Some(fetch_profile(&conn, id)?))
        }
        None => Ok(None),
    }
}

/// Re-checks a password without touching the active session — used by the
/// idle-lock unlock screen (own password) and by admin-authorization modals
/// (discount, cancel/refund) where a *different* admin authorizes.
#[tauri::command]
pub fn verify_password(state: State<AppState>, user_id: i64, password: String) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    verify_user_password(&conn, user_id, &password)
}
