# Architecture

## Layers

```
Frontend (React)  →  invoke() via src/lib/api.ts's call<T>()
                  →  #[tauri::command] fns in src-tauri/src/commands/<domain>.rs
                  →  AppState (src-tauri/src/lib.rs)
                  →  rusqlite::Connection  →  stockly.db (SQLite file)
```

Every command locks `AppState.db` (a `Mutex<Connection>` — single connection, single writer, matches the "instância única do app" decision in `Plans/PLANO.md`) and returns a plain `Result<T, String>`; errors always cross the IPC boundary as a string message, not a typed error enum.

## Data directory

`app.path().app_data_dir()` (Tauri's per-OS app data folder, keyed by the `identifier` in `tauri.conf.json`) — on Windows, `%APPDATA%\com.welbert.stockly\`. The database file is `stockly.db` inside it (`lib.rs`'s `setup` hook). Logs go to the sibling `app_log_dir()` (`commands::logging`).

## `AppState`

```rust
pub struct AppState {
    pub db: Mutex<Connection>,
    pub db_path: PathBuf,
    pub active_user_id: Mutex<Option<i64>>,
}
```

`active_user_id` is the **in-memory session** — set by `commands::auth::login` (or by `create_user`'s first-run auto-login), cleared by `logout`. It is never persisted anywhere: a process restart always lands back on the login screen, unlike the sibling project's `config.last_active_user_id` "remembered profile" (deliberate — this is a shared PDV, not a single-user machine, so a password is required every time the app starts, not just once per install).

## `src-tauri/src/guard.rs` — shared session/admin helpers

```rust
pub(crate) fn active_user_id(state: &AppState) -> Result<i64, String>
pub(crate) fn user_is_admin(conn: &Connection, id: i64) -> Result<bool, String>
pub(crate) fn require_admin(state: &AppState, conn: &Connection) -> Result<i64, String>
```

Every `commands/*` module that needs "is someone logged in" or "is the logged-in profile an Admin" imports these instead of re-implementing them — they used to be private to `commands/users.rs` (from the auth slice) and were extracted here once `commands::categories`/`commands::items`/`commands::config` needed the same checks (see "Adding features" in `CLAUDE.md` for the pattern a new command module should follow). User-specific safety checks that only `commands::users` needs (`is_last_active_admin`, `is_active_session`, `current_flags`) stay local to that module — they're not generic enough to belong here.

## Command modules (`src-tauri/src/commands/`)

One file per domain, each declared in `commands/mod.rs` and individually registered in `lib.rs`'s `tauri::generate_handler![...]`:

| Module | Domain |
|---|---|
| `auth.rs` | login/logout/session, password verification |
| `users.rs` | user CRUD, self-service theme/auto-lock, username derivation |
| `categories.rs` | category CRUD |
| `items.rs` | item CRUD, stock entries/adjustments/deactivation |
| `config.rs` | generic `config` key/value settings (low-stock %, profit margin %) |
| `logging.rs` | frontend → log file bridge |

Full command-by-command reference (arguments, return types, notes): [docs/commands.md](commands.md). Full schema: [docs/database.md](database.md).
