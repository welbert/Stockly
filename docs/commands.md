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
| `create_item` | `(code, name, category_id, cost_price, sale_price, quantity, min_quantity) -> ItemSummary` | admin-only. `code` is optional — blank/whitespace-only means "use this item's own id" (`predict_next_item_id` + `unique_code`, since the id doesn't exist until after insert). Friendly error on a duplicate explicit `code`. Prices rounded to 2 decimals (`round2`). Writes an `initial` `stock_movements` row when `quantity > 0`, and always writes an `item_price_history` row with the starting prices (unconditional, unlike the stock one — see `docs/database.md`) |
| `update_item` | `(id, code, name, category_id, cost_price, sale_price, quantity, min_quantity, active) -> ItemSummary` | admin-only, full edit **including** `quantity` directly — this is the Admin-only "ajuste de inventário"; the delta (positive or negative) is logged as an `adjustment` row. Also logs a row to `item_price_history` whenever `cost_price` and/or `sale_price` actually changes from what was stored (doubles as a pricing audit trail — who changed it, and when). Also where `active` gets flipped back to `true` (reactivating is Admin-only) |
| `delete_item` | `(id) -> ()` | admin-only, hard delete. Fails with a friendly message **only** if the item has ever been sold (`sale_items`, checked explicitly, not via a foreign-key catch) — a stock entry/adjustment or price change with no sale is still just correcting a fresh mistake, not retiring a real item. `stock_movements`/`item_price_history` rows are `ON DELETE CASCADE` and go with it |
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
| `get_credit_enabled` | `() -> bool` | any logged-in profile (decides whether "Crediário" shows up as a payment method in Venda). Defaults to `true` if the `config` row `credit_enabled` was never set |
| `set_credit_enabled` | `(enabled) -> ()` | admin-only. Refuses to set `false` while any client still has an open Crediário balance (`commands::clients::has_open_debtors`) |

## Sales (`commands/sales.rs`)

| Command | Signature | Notes |
|---|---|---|
| `create_sale` | `(items: Vec<SaleItemInput>, discount_percent, discount_amount, discount_authorizer_id, discount_authorizer_password, payment_method, client_id, credit_paid_now) -> SaleDetail` | any logged-in profile. Re-fetches each item's code/name/price/active/quantity fresh from the DB (never trusts a frontend-sent price). Validates stock, active status, and discount bounds (0-100%, or an amount that can't exceed the line/order total) per item and for the general (order-level) discount, which is applied *after* item-level discounts (sequential, not exclusive). Calls `resolve_admin_authorization` (`guard.rs`) only when at least one discount (item or general) is present — self-authorizes if the active session is already Admin, otherwise requires `discount_authorizer_id`/`_password` for a *different* admin. `payment_method = "credit"` requires a valid `client_id` (the Crediário debtor); `client_id` is ignored/forced to `null` for every other method. `credit_paid_now` (only meaningful for `"credit"`) lets the customer pay part of the debt up front — validated `< total` (paying it off in full belongs to a different payment method, not Crediário), **except** when the client already has store credit (a negative `client_balance`, e.g. from a paid sale later cancelled) covering the full amount, re-checked server-side via `commands::clients::client_balance` rather than trusted from the frontend — in that case `paid == total` is allowed, since it's the client's own existing credit settling itself, not someone typing the full amount as a workaround. Recorded as a `credit_payments` row plus a `credit_payment_allocations` row pointing at this sale, in the same transaction as the sale, so the open balance is already reduced right after commit. Commits venda + baixa de estoque (`stock_movements`, type `sale`) + numeração do recibo atomically in one transaction (receipt number: `{yyyyMMdd}{6-digit sequential}`, global and gap-free, assigned inside the same transaction). PDF generation happens *after* the transaction commits, best-effort — a failure there doesn't fail the sale (see `receipts.rs` below); `SaleDetail.receiptPdfPath` is simply `null` in that case |
| `get_sale_detail` | `(sale_id) -> SaleDetail` | any logged-in profile, read-only. `receiptPdfPath` always `null` (no PDF (re)generation attempted). Used by "Ver venda" in Devedores and Histórico de vendas |
| `list_sales` | `() -> Vec<SaleListItem>` | any logged-in profile. Every sale ever, newest first, no line items (a separate `get_sale_detail` round-trip once a sale is opened) — frontend filters by date range/recibo/cliente/operador client-side, same "fetch everything" convention as `list_items`/`list_clients`. Each row's `discountValue` is computed in the query itself (`SUM(sale_items.unit_price * quantity) - sales.total`, i.e. gross total with no discounts minus what was actually charged) rather than read from a column — it's the combined item-level + general discount, not just `sales.discount_amount` (which is general-only) |
| `cancel_sale` | `(sale_id, authorizer_id, authorizer_password) -> SaleDetail` | any logged-in profile. Rejects an already-cancelled sale. Goes through `resolve_admin_authorization` (`guard.rs`) same as discount/cancel-payment — self-authorizes if the active session is already Admin, otherwise needs a *different* admin's password. Reverses stock for every line whose item still exists (`refund`-type `stock_movements` rows, `items.quantity` restored). Never touches `credit_payments`/`credit_payment_allocations`, even if this was a Crediário sale with money already applied to it — that amount simply becomes floating credit for the client. Never deletes the row — flips `status` to `cancelled` and fills `cancelled_at`/`cancelled_by_user_id`/`cancel_authorized_by_user_id` |

## Clients (`commands/clients.rs`)

No `username`/login involved — a "cliente"/"devedor" is who buys on Crediário, unrelated to `users`.

| Command | Signature | Notes |
|---|---|---|
| `list_clients` | `() -> Vec<ClientSummary>` | any logged-in profile. Every client, each with `balance` computed on the fly (sum of completed Crediário sales minus `credit_payments`, never stored directly). Frontend filters/sorts client-side, same convention as `list_items`: Devedores keeps only `balance > 0`, the Venda client picker (`PaymentModal`) matches by name over the full list |
| `create_client` | `(name, phone, reminder_date, note) -> ClientSummary` | any logged-in profile — no admin password, deliberately (see `Plans/PLANO.md`, "Crediário e Devedores"). `phone`/`reminder_date`/`note` are optional, blank strings normalized to `null` |
| `update_client` | `(id, name, phone, reminder_date, note, authorizer_id, authorizer_password) -> ClientSummary` | any logged-in profile for phone/lembrete/observação. Renaming a client that currently has an open Crediário balance (`client_balance(conn, id) > 0.0`) goes through `resolve_admin_authorization` (`guard.rs`) — self-authorizes if the active session is already Admin, otherwise needs a *different* admin's password, same pattern as discount/cancelamento de venda/pagamento. The two `authorizer_*` args are ignored when that condition doesn't hold |
| `get_client_detail` | `(id) -> ClientDetail` | any logged-in profile. Adds `creditSales` (every Crediário sale for this client, newest first — completed *and* cancelled, each with its own `status`, `paid` and `remaining`; only the completed ones count toward `balance`) and `payments` (every `credit_payments` row, newest first, each with its `allocations`: which sale(s) it was applied to and how much) to the summary fields |
| `register_credit_payment` | `(client_id, sale_ids: Vec<i64>, amount, residual_sale_id) -> ClientDetail` | any logged-in profile, no admin password. Pays off 1+ of the client's own open Crediário sales (`sale_ids`) in one event. Rejects `amount <= 0`, an empty `sale_ids`, a sale not belonging to `client_id`, a cancelled or already-quitada sale, or an `amount` above the sum of the selected sales' `remaining`. When `amount` is less than that sum, `residual_sale_id` (required, must be one of `sale_ids`) says which sale absorbs the shortfall and stays partially paid — every other selected sale is allocated its full `remaining` and fully quitada |
| `cancel_credit_payment` | `(payment_id, reason, authorizer_id, authorizer_password) -> ClientDetail` | soft-cancel of a mistakenly-registered payment (never deleted — see `docs/database.md`). `reason` is required. Reverses a financial entry, so unlike registering the payment it goes through `resolve_admin_authorization` (`guard.rs`) — self-authorizes if the active session is already Admin, otherwise needs a *different* admin's password, same pattern as discount/cancelamento de venda. Rejects a payment that's already cancelled |

## Receipts (`commands/receipts.rs`)

| Command | Signature | Notes |
|---|---|---|
| `regenerate_receipt_pdf` | `(sale_id) -> String` (file path) | any logged-in profile. Re-fetches the full sale fresh from the DB and re-renders the PDF, overwriting any previous file for that sale (same filename, derived from the receipt number, which never changes). Needed both for the "PDF failed right after commit" case and for on-demand reprints |
| `print_file` | `(path) -> ()` | any logged-in profile. Spawns `powershell -Command "Start-Process -FilePath $env:STOCKLY_PRINT_PATH -Verb Print"` — the path travels via an environment variable, never interpolated into the command string, so it can't break out via quotes/special characters. Doesn't guarantee a print dialog appears; depends on whatever's associated with `.pdf` on the user's machine |
| `open_receipts_folder` | `() -> ()` | any logged-in profile. Opens `<db_path's parent>/recibos/` in the OS file explorer (creates the folder first if it doesn't exist yet) |
| `open_receipt_file` | `(path) -> ()` | any logged-in profile. Opens one specific receipt PDF with whatever's associated with `.pdf` on the user's machine — unlike `open_receipts_folder`, which reveals the whole folder. Used by Histórico de vendas' "Abrir PDF do recibo" row action, after `regenerate_receipt_pdf` guarantees the file exists |

The PDF itself is built with `genpdf` (real vector text, not a rasterized screenshot), using an embedded Courier Prime font (`src-tauri/assets/fonts/`, SIL OFL license, via `include_bytes!`) and an 80mm continuous-roll page size with dynamic height — matches the thermal printer this app targets. Layout: header (store name/info from config, falling back to "BORA VENDER"), recibo/data/operador, **cliente vinculado (only when `payment_method == "credit"`)**, itemized lines (each with its own discount noted when present — `-X%` or `-R$ Y`, matching whichever type was applied), subtotal/desconto geral/total, **"Valor pago" / "Valor devido" (only when the sale already has money applied to it)**, payment method (labeled "Crediário" for `credit`), and a configurable thank-you footer plus a line stating the receipt has no fiscal value. Who authorized a discount isn't printed — it's still recorded (`discount_authorized_by_user_id`) for audit, just not on the customer-facing receipt. `sale.created_at` is stored in UTC (SQLite's `datetime('now')`) but printed converted to local time (`fmt_local_datetime`), matching the frontend's `fmtDateTime` — otherwise the PDF and the on-screen preview would show different hours.

## Dashboard (`commands/dashboard_layout.rs`, `commands/dashboard.rs`)

Admin-only screen (`Plans/PLANO.md`'s "Dashboard") — every command here calls `require_admin`, never just `active_user_id`.

| Command | Signature | Notes |
|---|---|---|
| `get_dashboard_layout` | `() -> Vec<DashboardLayoutItem>` | the logged-in Admin's own layout — resolved from `AppState.active_user_id`, no `userId` argument (see `CLAUDE.md`'s Auth rule). Seeds `db::DEFAULT_DASHBOARD_LAYOUT` the first time this Admin's layout is empty, instead of an empty grid |
| `save_dashboard_layout` | `(items: Vec<DashboardLayoutItem>) -> ()` | replaces the logged-in Admin's entire layout in one transaction (delete + re-insert). Called on every drag/resize (debounced client-side, 500ms) and on every add/remove-card click (immediate — no debounce, so closing the app right after doesn't lose the change) |
| `get_dashboard_data` | `() -> DashboardData` | one aggregate round-trip for every card — cards never fetch their own data (`src/components/dashboard-cards/*`, each a "dumb" component reading its own slice of `DashboardData` via props). All money/count figures scoped to "hoje"/"mês atual" use local time both in SQL (`'localtime'` modifier) and Rust (`chrono::Local`), matching how the rest of the app converts the UTC `created_at` columns for display. Every sales/revenue figure excludes `status = 'cancelled'` (a cancelled sale's `sale_payments` row is never deleted, so an unfiltered sum would double-count money that was actually reversed) — decided in `Plans/PLANO.md`'s Dashboard section after the fact, since Cancelamento/Estorno was designed after the Dashboard's original card list. `discountGrantedMonth` uses the same "gross minus total" formula as `list_sales`'s `discountValue` (see above), aggregated for the month. `lowStockCount`/`lowStockItems` reuse `commands::config::low_stock_percent` and the same "critical or warning" threshold formula as `lowStockWarningThreshold` in `src/lib/api.ts` (not just `quantity <= min_quantity`) — otherwise the Dashboard would undercount relative to Estoque's own yellow "Baixo" chip, which already covers that wider band. `creditOutstandingTotal` reuses `commands::clients::client_balance` per client (same aggregate Devedores' own "Total em aberto" stat is built from) rather than a separate SQL formula, so the two can't drift apart. `remindersDue` mirrors `DevedoresPage.tsx`'s `ReminderBadge` window (`REMINDER_WARNING_DAYS = 7`, hand-kept in sync — no shared Rust/TS date-rules module yet) and only includes clients with an open balance |

## Logging (`commands/logging.rs`)

| Command | Signature | Notes |
|---|---|---|
| `write_log` | `(level, message) -> ()` | appends to a daily log file in the app's log dir; called by `src/logger.ts`, never directly. Every line is tagged with `[user id:name]` (or `[no session]`) by the logger itself before it ever reaches this command — see `docs/frontend.md` |
| `open_log_dir` | `() -> ()` | opens that folder in the OS file explorer. Exposed in the UI via Configurações' "Diagnóstico" card (any profile, not just Admin — see `docs/frontend.md`) |
