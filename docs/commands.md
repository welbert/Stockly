# Tauri Commands

All registered in `src-tauri/src/lib.rs` (`invoke_handler![...]`), implemented in `src-tauri/src/commands/<domain>.rs`.
Typed wrapper on the frontend: `src/lib/api.ts` — no component calls `invoke()` directly (see `call<T>()`).

Arguments are passed in camelCase on the JS side and automatically converted to snake_case for the Rust parameters (Tauri v2 default behavior) — the names below are already in Rust format.

Every mutation that isn't self-service (`update_theme`, `update_my_auto_lock`) re-checks `AppState.active_user_id` against `users.is_admin` on the backend itself (`require_admin`, in `commands/users.rs`) — the frontend hiding a button is not the real access control.

## Auth / session (`commands/auth.rs`)

| Command | Signature | Notes |
|---|---|---|
| `login` | `(user_id, password) -> UserProfile` | verifies the bcrypt hash, rejects a deactivated (`active = 0`) user, stamps `users.last_login_at = datetime('now')`, sets `AppState.active_user_id` |
| `logout` | `() -> ()` | clears `AppState.active_user_id` |
| `get_active_user` | `() -> Option<UserProfile>` | reads the current in-memory session — always `None` right after a process restart (no "remember me", unlike the sibling project's `last_active_user_id`: this app requires a password every time the process starts) |
| `verify_password` | `(user_id, password) -> bool` | re-checks a password without changing the session. Used by the idle-lock unlock screen (own `user_id`) and, later, by admin-authorization modals (discount, cancel/refund) where a *different* admin authorizes — same command, no session side effect either way |

## Users (`commands/users.rs`)

| Command | Signature | Notes |
|---|---|---|
| `has_any_users` | `() -> bool` | drives the login screen's first-run vs. profile-picker branch |
| `list_login_profiles` | `() -> Vec<UserSummary>` | active users only, feeds the login picker |
| `list_users` | `() -> Vec<UserProfile>` | every user, admin-only, feeds the Usuários screen |
| `create_user` | `(name, password, is_admin) -> UserProfile` | no `username` argument — it's derived from `name` (`slugify` + `unique_username`, see `docs/database.md`). First user ever (`has_any_users() == false`) is forced `is_admin = true` regardless of the argument, auto-logs in (sets `active_user_id`) and stamps `last_login_at` same as `login` would; otherwise requires an authenticated admin and honors `is_admin` as given |
| `update_user` | `(id, name, is_admin, active, auto_lock_minutes) -> UserProfile` | admin-only. `username` isn't editable (assigned once at creation). The "elevate to Admin" confirmation is a frontend-only modal (`UserFormModal`) before calling this — no separate backend step. Refuses to change `is_admin`/`active` on **your own** logged-in row (`is_active_session`) — only a *different* admin can grant/revoke a role or (de)activate an account. Also refuses to demote or deactivate the **last active Admin** (`is_last_active_admin`) — otherwise nothing could unlock the app again short of editing the `.db` by hand |
| `delete_user` | `(id) -> ()` | admin-only, hard delete. Refuses to delete your own logged-in row, same reasoning as above. Also refuses to delete the last active Admin. Fails with a foreign-key error if the user has sales/stock movements/credit payments on record (no cascade there by design) |
| `update_theme` | `(theme) -> ()` | self-service — always writes to whichever user is in `AppState.active_user_id`, never a `user_id` argument |
| `update_my_auto_lock` | `(auto_lock_minutes) -> UserProfile` | self-service equivalent of `update_user`'s `auto_lock_minutes` field — any logged-in profile (not just Admin) can change its own idle-lock timeout |

## Logging (`commands/logging.rs`)

| Command | Signature | Notes |
|---|---|---|
| `write_log` | `(level, message) -> ()` | appends to a daily log file in the app's log dir; called by `src/logger.ts`, never directly |
| `open_log_dir` | `() -> ()` | opens that folder in the OS file explorer |
