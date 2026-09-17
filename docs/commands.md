# Tauri Commands

All registered in `src-tauri/src/lib.rs` (`invoke_handler![...]`), implemented in `src-tauri/src/commands/<domain>.rs`.
Typed wrapper on the frontend: `src/lib/api.ts` — no component calls `invoke()` directly (see `call<T>()`).

Arguments are passed in camelCase on the JS side and automatically converted to snake_case for the Rust parameters (Tauri v2 default behavior) — the names below are already in Rust format.

Every mutation that isn't self-service (`update_theme`, `update_my_auto_lock`, `add_stock_entry`, `deactivate_item`) re-checks `AppState.active_user_id` against `users.is_admin` on the backend itself (`require_admin`, in `src-tauri/src/guard.rs` — shared across command modules) — the frontend hiding a button is not the real access control.

## Auth / session (`commands/auth.rs`)

| Command | Signature | Notes |
|---|---|---|
| `login` | `(user_id, password) -> UserProfile` | verifies the bcrypt hash, rejects a deactivated (`active = 0`) user, stamps `users.last_login_at = datetime('now')`, sets `AppState.active_user_id` |
| `logout` | `() -> ()` | clears `AppState.active_user_id` |
| `get_active_user` | `() -> Option<UserProfile>` | reads the current in-memory session — always `None` right after a process restart (no "remember me", unlike the sibling project's `last_active_user_id`: this app requires a password every time the process starts) |
| `verify_password` | `(user_id, password) -> bool` | re-checks a password without changing the session. Used by the idle-lock unlock screen (own `user_id`) and by the discount-authorization modal in Venda, where a *different* admin authorizes — same command, no session side effect either way |

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
| `list_admins` | `() -> Vec<UserSummary>` | any logged-in profile, active admins only — feeds the admin picker in the discount-authorization modal (Venda) |

## Categories (`commands/categories.rs`)

| Command | Signature | Notes |
|---|---|---|
| `list_categories` | `() -> Vec<CategorySummary>` | any logged-in profile |
| `create_category` | `(name) -> CategorySummary` | admin-only, friendly error on a duplicate name (`categories.name` is also `UNIQUE` at the DB level as a backstop) |
| `rename_category` | `(id, name) -> CategorySummary` | admin-only, same duplicate check excluding `id` itself |
| `delete_category` | `(id) -> ()` | admin-only. `items.category_id` is `ON DELETE SET NULL` — items just fall back to "Categoria indefinida", nothing else breaks |

## Items (`commands/items.rs`)

| Command | Signature | Notes |
|---|---|---|
| `list_items` | `() -> Vec<ItemSummary>` | any logged-in profile; `categoryName` is `null` when uncategorized (LEFT JOIN) |
| `create_item` | `(code, name, category_id, cost_price, sale_price, quantity, min_quantity) -> ItemSummary` | admin-only. `code` is optional — blank/whitespace-only means "use this item's own id" (`predict_next_item_id` + `unique_code`, since the id doesn't exist until after insert). Friendly error on a duplicate explicit `code`. Prices rounded to 2 decimals (`round2`). Writes an `initial` `stock_movements` row when `quantity > 0` |
| `update_item` | `(id, code, name, category_id, cost_price, sale_price, quantity, min_quantity, active) -> ItemSummary` | admin-only, full edit **including** `quantity` directly — this is the Admin-only "ajuste de inventário"; the delta (positive or negative) is logged as an `adjustment` row. Also where `active` gets flipped back to `true` (reactivating is Admin-only) |
| `delete_item` | `(id) -> ()` | admin-only, hard delete. Fails (friendly message) on a foreign-key violation once the item has any `stock_movements`/`sale_items` history — deliberately: it's for correcting a fresh mistake, not retiring a real item |
| `add_stock_entry` | `(item_id, quantity) -> ItemSummary` | any logged-in profile, `quantity` must be `> 0`. Logged as `entry` — the everyday "recebi mercadoria" action, distinct from Admin's `adjustment` |
| `deactivate_item` | `(item_id) -> ItemSummary` | any logged-in profile can deactivate; only Admin can hard-delete or reactivate (via `update_item`) |

## Config (`commands/config.rs`)

| Command | Signature | Notes |
|---|---|---|
| `get_low_stock_percent` | `() -> i64` | any logged-in profile (needed to render the yellow "Baixo" chip everywhere). Defaults to `20` (a reasonable starting buffer) if the `config` row `low_stock_warning_percent` was never set |
| `set_low_stock_percent` | `(percent) -> ()` | admin-only — shown only in the Administrador's Configurações |
| `get_default_profit_margin` | `() -> f64` | admin-only both ways (not just the write) — only the item creation form consumes it. Defaults to `30` (a reasonable starting markup) if the `config` row `default_profit_margin_percent` was never set |
| `set_default_profit_margin` | `(percent) -> ()` | admin-only |
| `get_store_name` | `() -> String` | any logged-in profile. Empty string (the default) means the receipt falls back to "BORA VENDER" |
| `set_store_name` | `(name) -> ()` | admin-only. Feeds the bold header line on the PDF receipt (`receipts.rs`) in place of "BORA VENDER" |
| `get_store_info` | `() -> String` | any logged-in profile. Free multi-line text (e.g. CNPJ, phone) |
| `set_store_info` | `(info) -> ()` | admin-only. Each `\n`-separated line prints under the store name on the receipt, before "Recibo de Venda" |
| `get_receipt_thank_you_message` | `() -> String` | any logged-in profile. Unlike `store_name`/`store_info`, this one already comes back with a real default ("Obrigado pela preferência!") when nothing's been configured, not an empty string |
| `set_receipt_thank_you_message` | `(message) -> ()` | admin-only. Feeds the receipt's footer line, right below the payment method |

## Sales (`commands/sales.rs`)

| Command | Signature | Notes |
|---|---|---|
| `create_sale` | `(items: Vec<SaleItemInput>, discount_percent, discount_amount, discount_authorizer_id, discount_authorizer_password, payment_method) -> SaleDetail` | any logged-in profile. Re-fetches each item's code/name/price/active/quantity fresh from the DB (never trusts a frontend-sent price). Validates stock, active status, and discount bounds (0-100%, or an amount that can't exceed the line/order total) per item and for the general (order-level) discount, which is applied *after* item-level discounts (sequential, not exclusive). Calls `resolve_admin_authorization` (`guard.rs`) only when at least one discount (item or general) is present — self-authorizes if the active session is already Admin, otherwise requires `discount_authorizer_id`/`_password` for a *different* admin. Commits venda + baixa de estoque (`stock_movements`, type `sale`) + numeração do recibo atomically in one transaction (receipt number: `{yyyyMMdd}{6-digit sequential}`, global and gap-free, assigned inside the same transaction). PDF generation happens *after* the transaction commits, best-effort — a failure there doesn't fail the sale (see `receipts.rs` below); `SaleDetail.receiptPdfPath` is simply `null` in that case |

## Receipts (`commands/receipts.rs`)

| Command | Signature | Notes |
|---|---|---|
| `regenerate_receipt_pdf` | `(sale_id) -> String` (file path) | any logged-in profile. Re-fetches the full sale fresh from the DB and re-renders the PDF, overwriting any previous file for that sale (same filename, derived from the receipt number, which never changes). Needed both for the "PDF failed right after commit" case and for on-demand reprints |
| `print_file` | `(path) -> ()` | any logged-in profile. Spawns `powershell -Command "Start-Process -FilePath $env:STOCKLY_PRINT_PATH -Verb Print"` — the path travels via an environment variable, never interpolated into the command string, so it can't break out via quotes/special characters. Doesn't guarantee a print dialog appears; depends on whatever's associated with `.pdf` on the user's machine |
| `open_receipts_folder` | `() -> ()` | any logged-in profile. Opens `<db_path's parent>/recibos/` in the OS file explorer (creates the folder first if it doesn't exist yet) |

The PDF itself is built with `genpdf` (real vector text, not a rasterized screenshot), using an embedded Courier Prime font (`src-tauri/assets/fonts/`, SIL OFL license, via `include_bytes!`) and an 80mm continuous-roll page size with dynamic height — matches the thermal printer this app targets. Layout: header (store name/info from config, falling back to "BORA VENDER"), recibo/data/operador, itemized lines (with any item-level discount noted), subtotal/desconto geral/total, who authorized the discount (if any), payment method, and a configurable thank-you footer plus a line stating the receipt has no fiscal value. `sale.created_at` is stored in UTC (SQLite's `datetime('now')`) but printed converted to local time (`fmt_local_datetime`), matching the frontend's `fmtDateTime` — otherwise the PDF and the on-screen preview would show different hours.

## Logging (`commands/logging.rs`)

| Command | Signature | Notes |
|---|---|---|
| `write_log` | `(level, message) -> ()` | appends to a daily log file in the app's log dir; called by `src/logger.ts`, never directly |
| `open_log_dir` | `() -> ()` | opens that folder in the OS file explorer |
