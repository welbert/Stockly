use crate::guard::{active_user_id, require_admin};
use crate::AppState;
use rusqlite::{params, Connection, OpenFlags};
use tauri::State;

const BACKUP_FOLDER_KEY: &str = "backup_folder";

fn get_config_value(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM config WHERE key = ?1", params![key], |row| row.get(0)).ok()
}

fn set_config_value(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO config (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Admin-only both ways — the whole "Backup" section of Configurações is
/// invisible to Usuário comum, not just its restore button
/// (`Plans/PLANO.md`'s "Backup do banco").
#[tauri::command]
pub fn get_backup_folder(state: State<AppState>) -> Result<Option<String>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;
    Ok(get_config_value(&conn, BACKUP_FOLDER_KEY))
}

#[tauri::command]
pub fn set_backup_folder(state: State<AppState>, path: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;
    set_config_value(&conn, BACKUP_FOLDER_KEY, &path)
}

#[tauri::command]
pub fn clear_backup_folder(state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;
    conn.execute("DELETE FROM config WHERE key = ?1", params![BACKUP_FOLDER_KEY]).map_err(|e| e.to_string())?;
    Ok(())
}

/// A no-op when no backup folder is configured yet. Unlike every setter
/// above, **not** admin-gated — the frontend calls this once on app mount
/// and then every 10 minutes for as long as the app stays open, regardless
/// of which profile is logged in (`Plans/PLANO.md`'s "Backup do banco":
/// unlike the sibling CashVault project, Stockly tends to stay open a whole
/// shift with a Usuário comum at the register, so gating the timer to
/// Admin-only sessions would leave most of the day unbacked-up). Still only
/// `active_user_id`-gated, same as every other command, rather than wide
/// open — it's just never *reachable* by Usuário comum through the UI, since
/// only the Admin-only Configurações screen ever sets `backup_folder`.
///
/// `VACUUM INTO`, not a raw `std::fs::copy` like CashVault's own
/// `run_backup` — copying the file directly can produce an inconsistent
/// backup while the active connection is in WAL mode (`-wal`/`-shm` files
/// not reflected in a plain copy); `VACUUM INTO` is SQLite's own safe way to
/// snapshot the currently-open database consistently.
#[tauri::command]
pub fn run_backup(state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;
    let Some(folder) = get_config_value(&conn, BACKUP_FOLDER_KEY) else {
        return Ok(());
    };
    let folder_path = std::path::PathBuf::from(&folder);
    if !folder_path.is_dir() {
        return Err(format!("Pasta de backup não encontrada: {folder}"));
    }
    let dest = folder_path.join("stockly-backup.db");
    // `VACUUM INTO` refuses to overwrite a file that already exists — the
    // fixed filename is deliberate (no version history, same as CashVault),
    // so the previous backup is simply removed right before each run.
    if dest.exists() {
        std::fs::remove_file(&dest).map_err(|e| e.to_string())?;
    }
    conn.execute("VACUUM INTO ?1", params![dest.to_string_lossy()]).map_err(|e| e.to_string())?;
    Ok(())
}

/// Overwrites the *entire* active database with `path`'s contents. Admin-only
/// on top of the page itself already being Admin-only (`Plans/PLANO.md`'s
/// "Ações sensíveis" group 3) — the frontend adds its own re-confirmation
/// step (the admin's own password re-typed via `verify_password`) before
/// even calling this, since it's destructive enough to warrant a guard
/// against an accidental click, not just the right role.
#[tauri::command]
pub fn import_backup(state: State<AppState>, path: String) -> Result<(), String> {
    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        require_admin(&state, &conn)?;
    }

    let source = std::path::PathBuf::from(&path);
    if !source.is_file() {
        return Err("Arquivo de backup não encontrado".to_string());
    }

    let check = Connection::open_with_flags(&source, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("Não foi possível abrir o arquivo como banco de dados: {e}"))?;
    let is_stockly_db: bool = check
        .query_row("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'", [], |_| Ok(true))
        .unwrap_or(false);
    drop(check);
    if !is_stockly_db {
        return Err("Esse arquivo não parece ser um backup do Stockly".to_string());
    }

    // Swaps the live connection for an in-memory one before overwriting the
    // on-disk file, since the app restarts right after this call to reopen
    // the imported database fresh — same flow as CashVault's `import_backup`.
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    *conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
    std::fs::copy(&source, &state.db_path).map_err(|e| e.to_string())?;
    Ok(())
}
