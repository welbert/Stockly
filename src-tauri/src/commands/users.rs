use crate::guard::{active_user_id, require_admin};
use crate::models::{UserProfile, UserSummary, USER_PROFILE_COLUMNS};
use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

fn fetch_profile(conn: &Connection, id: i64) -> Result<UserProfile, String> {
    conn.query_row(
        &format!("SELECT {USER_PROFILE_COLUMNS} FROM users WHERE id = ?1"),
        params![id],
        UserProfile::from_row,
    )
    .map_err(|e| e.to_string())
}

fn current_flags(conn: &Connection, id: i64) -> Result<(bool, bool), String> {
    conn.query_row("SELECT is_admin, active FROM users WHERE id = ?1", params![id], |row| {
        Ok((row.get::<_, i64>(0)? != 0, row.get::<_, i64>(1)? != 0))
    })
    .map_err(|e| e.to_string())
}

/// True when `id` is *currently* an active Admin and no other active Admin
/// exists — i.e. demoting/deactivating/deleting this one row would leave the
/// app with zero Admins (and no way back in short of editing the .db by
/// hand, which is exactly what happened once already).
fn is_last_active_admin(conn: &Connection, id: i64) -> Result<bool, String> {
    let (currently_admin, currently_active) = current_flags(conn, id)?;
    if !currently_admin || !currently_active {
        return Ok(false);
    }
    let other_active_admins: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE is_admin = 1 AND active = 1 AND id != ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(other_active_admins == 0)
}

/// True when `id` is the currently authenticated profile — used so a user
/// can never touch their own `is_admin`/`active` flag or delete themselves,
/// regardless of how many other admins exist (separation of duties: granting
/// or revoking a role, or removing an account, always takes a *different*
/// admin acting on it).
fn is_active_session(state: &AppState, id: i64) -> Result<bool, String> {
    Ok(*state.active_user_id.lock().map_err(|e| e.to_string())? == Some(id))
}

fn strip_accent(c: char) -> char {
    match c {
        'á' | 'à' | 'â' | 'ã' | 'ä' => 'a',
        'é' | 'è' | 'ê' | 'ë' => 'e',
        'í' | 'ì' | 'î' | 'ï' => 'i',
        'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
        'ú' | 'ù' | 'û' | 'ü' => 'u',
        'ç' => 'c',
        'ñ' => 'n',
        other => other,
    }
}

/// `username` is a purely internal login key (never shown/typed in the UI —
/// see `models::USER_PROFILE_COLUMNS`'s comment), derived from `name`: lowercase,
/// accents stripped, anything non-alphanumeric collapsed into a single `_`.
/// e.g. "João da Silva" -> "joao_da_silva".
fn slugify(name: &str) -> String {
    let mut out = String::new();
    let mut pending_sep = false;
    for ch in name.chars() {
        let lower = ch.to_lowercase().next().unwrap_or(ch);
        let normalized = strip_accent(lower);
        if normalized.is_ascii_alphanumeric() {
            if pending_sep && !out.is_empty() {
                out.push('_');
            }
            out.push(normalized);
            pending_sep = false;
        } else {
            pending_sep = true;
        }
    }
    if out.is_empty() {
        "usuario".to_string()
    } else {
        out
    }
}

/// Appends `_2`, `_3`, ... to `base` until it no longer collides with an
/// existing `users.username` — keeps `create_user` from ever hitting the
/// UNIQUE constraint just because two people share a name.
fn unique_username(conn: &Connection, base: &str) -> Result<String, String> {
    let taken = |candidate: &str| -> Result<bool, String> {
        conn.query_row("SELECT 1 FROM users WHERE username = ?1", params![candidate], |_| Ok(()))
            .optional()
            .map(|r| r.is_some())
            .map_err(|e| e.to_string())
    };
    if !taken(base)? {
        return Ok(base.to_string());
    }
    let mut n = 2;
    loop {
        let candidate = format!("{base}_{n}");
        if !taken(&candidate)? {
            return Ok(candidate);
        }
        n += 1;
    }
}

#[tauri::command]
pub fn has_any_users(state: State<AppState>) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0)).map_err(|e| e.to_string())?;
    Ok(count > 0)
}

/// Active users only — feeds the login screen's profile picker.
#[tauri::command]
pub fn list_login_profiles(state: State<AppState>) -> Result<Vec<UserSummary>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, is_admin, active FROM users WHERE active = 1 ORDER BY name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(UserSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                is_admin: row.get::<_, i64>(2)? != 0,
                active: row.get::<_, i64>(3)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Active admins only — feeds the "select which admin is authorizing"
/// picker in the discount/cancel modals (any logged-in profile can call
/// this, it's just names, not the actual authorization check).
#[tauri::command]
pub fn list_admins(state: State<AppState>) -> Result<Vec<UserSummary>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;
    let mut stmt = conn
        .prepare("SELECT id, name, is_admin, active FROM users WHERE is_admin = 1 AND active = 1 ORDER BY name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(UserSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                is_admin: row.get::<_, i64>(2)? != 0,
                active: row.get::<_, i64>(3)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Every user, including inactive ones — feeds the admin's user management screen.
#[tauri::command]
pub fn list_users(state: State<AppState>) -> Result<Vec<UserProfile>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;
    let mut stmt = conn
        .prepare(&format!("SELECT {USER_PROFILE_COLUMNS} FROM users ORDER BY name"))
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], UserProfile::from_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Handles both first-run (no users yet — forces admin, auto-logs in) and the
/// normal admin-creates-a-user flow (requires an authenticated admin). The
/// login (`users.username`) is generated from `name`, never provided by the
/// caller — see `slugify`/`unique_username`.
#[tauri::command]
pub fn create_user(state: State<AppState>, name: String, password: String, is_admin: bool) -> Result<UserProfile, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0)).map_err(|e| e.to_string())?;
    let first_run = count == 0;
    let grant_admin = if first_run {
        true
    } else {
        require_admin(&state, &conn)?;
        is_admin
    };

    let username = unique_username(&conn, &slugify(&name))?;
    let hash = bcrypt::hash(&password, bcrypt::DEFAULT_COST).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO users (name, username, password_hash, is_admin) VALUES (?1, ?2, ?3, ?4)",
        params![name, username, hash, grant_admin as i64],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();

    if first_run {
        conn.execute("UPDATE users SET last_login_at = datetime('now') WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        *state.active_user_id.lock().map_err(|e| e.to_string())? = Some(id);
    }
    fetch_profile(&conn, id)
}

/// `username` is never part of this — it's assigned once at creation and
/// stays stable even if `name` is edited afterward (see `models.rs`).
#[tauri::command]
pub fn update_user(
    state: State<AppState>,
    id: i64,
    name: String,
    is_admin: bool,
    active: bool,
    auto_lock_minutes: Option<i64>,
) -> Result<UserProfile, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;
    if is_active_session(&state, id)? {
        let (currently_admin, currently_active) = current_flags(&conn, id)?;
        if is_admin != currently_admin || active != currently_active {
            return Err("Você não pode alterar seu próprio papel de administrador ou status de ativo".to_string());
        }
    }
    if (!is_admin || !active) && is_last_active_admin(&conn, id)? {
        return Err("Não é possível remover o último administrador ativo".to_string());
    }
    conn.execute(
        "UPDATE users SET name = ?1, is_admin = ?2, active = ?3, auto_lock_minutes = ?4 WHERE id = ?5",
        params![name, is_admin as i64, active as i64, auto_lock_minutes, id],
    )
    .map_err(|e| e.to_string())?;
    fetch_profile(&conn, id)
}

/// Hard delete (not deactivate) — Admin-only. Fails on a foreign key
/// violation if the user has sales/stock movements/credit payments on
/// record (no ON DELETE CASCADE on those by design — history must survive).
#[tauri::command]
pub fn delete_user(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;
    if is_active_session(&state, id)? {
        return Err("Você não pode excluir a si mesmo".to_string());
    }
    if is_last_active_admin(&conn, id)? {
        return Err("Não é possível excluir o último administrador ativo".to_string());
    }
    conn.execute("DELETE FROM users WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

/// Updates the theme for whoever is currently logged in (never a user_id
/// passed by the frontend) — a profile can only ever change its own theme.
#[tauri::command]
pub fn update_theme(state: State<AppState>, theme: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let active_id = state
        .active_user_id
        .lock()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Nenhum usuário autenticado".to_string())?;
    conn.execute("UPDATE users SET theme = ?1 WHERE id = ?2", params![theme, active_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Same shape as `update_theme` — self-service, always the active session's
/// own row, never a `user_id` from the frontend. Accessibility preference,
/// only scales the app's own UI text via the root `font-size` (see
/// `src/fontScale.ts`); never touches receipt/report PDF generation, which
/// is entirely backend-rendered with its own fixed point sizes.
#[tauri::command]
pub fn update_font_scale(state: State<AppState>, font_scale: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let active_id = state
        .active_user_id
        .lock()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Nenhum usuário autenticado".to_string())?;
    conn.execute("UPDATE users SET font_scale = ?1 WHERE id = ?2", params![font_scale, active_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Self-service equivalent of `update_user`'s `auto_lock_minutes` field —
/// any logged-in profile (not just Admin) can change its own idle-lock
/// timeout, same as `update_theme`.
#[tauri::command]
pub fn update_my_auto_lock(state: State<AppState>, auto_lock_minutes: Option<i64>) -> Result<UserProfile, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let active_id = state
        .active_user_id
        .lock()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Nenhum usuário autenticado".to_string())?;
    conn.execute("UPDATE users SET auto_lock_minutes = ?1 WHERE id = ?2", params![auto_lock_minutes, active_id])
        .map_err(|e| e.to_string())?;
    fetch_profile(&conn, active_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_connection;
    use std::path::PathBuf;
    use std::sync::Mutex;

    #[test]
    fn is_active_session_matches_only_the_logged_in_id() {
        let conn = test_connection();
        let state = AppState { db: Mutex::new(conn), db_path: PathBuf::new(), active_user_id: Mutex::new(Some(42)) };
        assert!(is_active_session(&state, 42).unwrap());
        assert!(!is_active_session(&state, 7).unwrap());
    }

    #[test]
    fn password_hash_roundtrip_and_defaults() {
        let conn = test_connection();
        let hash = bcrypt::hash("segredo123", bcrypt::DEFAULT_COST).unwrap();
        conn.execute(
            "INSERT INTO users (name, username, password_hash, is_admin) VALUES ('Admin', 'admin', ?1, 1)",
            params![hash],
        )
        .unwrap();
        let id = conn.last_insert_rowid();

        let profile = fetch_profile(&conn, id).unwrap();
        assert!(profile.is_admin);
        assert_eq!(profile.theme, "light");
        assert_eq!(profile.font_scale, "normal");
        assert_eq!(profile.auto_lock_minutes, None);

        let stored_hash: String = conn
            .query_row("SELECT password_hash FROM users WHERE id = ?1", params![id], |row| row.get(0))
            .unwrap();
        assert!(bcrypt::verify("segredo123", &stored_hash).unwrap());
        assert!(!bcrypt::verify("senha-errada", &stored_hash).unwrap());
    }

    #[test]
    fn duplicate_username_is_rejected() {
        let conn = test_connection();
        let hash = bcrypt::hash("x", bcrypt::DEFAULT_COST).unwrap();
        conn.execute("INSERT INTO users (name, username, password_hash) VALUES ('A', 'dup', ?1)", params![hash])
            .unwrap();
        let result =
            conn.execute("INSERT INTO users (name, username, password_hash) VALUES ('B', 'dup', ?1)", params![hash]);
        assert!(result.is_err());
    }

    #[test]
    fn slugify_strips_accents_and_spaces() {
        assert_eq!(slugify("João da Silva"), "joao_da_silva");
        assert_eq!(slugify("Ana   Corrêa-Núñez"), "ana_correa_nunez");
        assert_eq!(slugify("   "), "usuario");
    }

    #[test]
    fn unique_username_appends_suffix_on_collision() {
        let conn = test_connection();
        let hash = bcrypt::hash("x", bcrypt::DEFAULT_COST).unwrap();
        conn.execute(
            "INSERT INTO users (name, username, password_hash) VALUES ('João Silva', 'joao_silva', ?1)",
            params![hash],
        )
        .unwrap();

        let first = unique_username(&conn, "joao_silva").unwrap();
        assert_eq!(first, "joao_silva_2");

        conn.execute(
            "INSERT INTO users (name, username, password_hash) VALUES ('João Silva', ?1, ?2)",
            params![first, hash],
        )
        .unwrap();
        let second = unique_username(&conn, "joao_silva").unwrap();
        assert_eq!(second, "joao_silva_3");
    }

    #[test]
    fn is_last_active_admin_detects_the_only_admin() {
        let conn = test_connection();
        let hash = bcrypt::hash("x", bcrypt::DEFAULT_COST).unwrap();
        conn.execute(
            "INSERT INTO users (name, username, password_hash, is_admin) VALUES ('Admin', 'admin', ?1, 1)",
            params![hash],
        )
        .unwrap();
        let admin_id = conn.last_insert_rowid();
        conn.execute("INSERT INTO users (name, username, password_hash) VALUES ('User', 'user', ?1)", params![hash])
            .unwrap();

        assert!(is_last_active_admin(&conn, admin_id).unwrap());

        conn.execute(
            "INSERT INTO users (name, username, password_hash, is_admin) VALUES ('Admin 2', 'admin2', ?1, 1)",
            params![hash],
        )
        .unwrap();
        assert!(!is_last_active_admin(&conn, admin_id).unwrap());
    }

    #[test]
    fn is_last_active_admin_is_false_for_non_admin_or_already_inactive() {
        let conn = test_connection();
        let hash = bcrypt::hash("x", bcrypt::DEFAULT_COST).unwrap();
        conn.execute("INSERT INTO users (name, username, password_hash) VALUES ('User', 'user', ?1)", params![hash])
            .unwrap();
        let user_id = conn.last_insert_rowid();
        assert!(!is_last_active_admin(&conn, user_id).unwrap());

        conn.execute(
            "INSERT INTO users (name, username, password_hash, is_admin, active) VALUES ('Admin', 'admin', ?1, 1, 0)",
            params![hash],
        )
        .unwrap();
        let inactive_admin_id = conn.last_insert_rowid();
        assert!(!is_last_active_admin(&conn, inactive_admin_id).unwrap());
    }
}
