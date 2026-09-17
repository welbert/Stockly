# Database

SQLite via `rusqlite` (`bundled` feature — does not depend on SQLite being installed on the system).
Single file: `stockly.db` in the app's data directory.

`PRAGMA foreign_keys = ON;` is set on every connection opened (`db::open_connection`) — without it the `ON DELETE CASCADE`/`SET NULL` below would do nothing.

## Schema/migration pattern (`src-tauri/src/db.rs`)

Two functions, called in this order in `open_connection`:

1. **`init_db`** — `CREATE TABLE IF NOT EXISTS` with the **complete, current** schema of each table. This is what runs on a brand-new installation from scratch.
2. **`migrate_db`** — idempotent `ALTER TABLE ... ADD COLUMN` (the "column already exists" error is ignored) for databases that already existed **before** a new column/table was added. First real entry: `users.last_login_at` (added after real installs already existed).

**Rule when adding a new column/table:** it needs to go in both places — the `CREATE TABLE` inside `init_db` (for fresh installs) **and** as an `ALTER TABLE` in `migrate_db` (for those who already had the database). Any `CREATE INDEX` that depends on that new column can only run **after** it's guaranteed to exist — i.e. inside `migrate_db`, never inside the same `execute_batch` block of `init_db` right after the `CREATE TABLE IF NOT EXISTS` of the table that received it (this already broke a sibling project once: the index was placed in `init_db` and broke on any database that predated the column, because there the table already existed without it and the `CREATE TABLE IF NOT EXISTS` became a no-op).

`db::tests::schema_applies_cleanly` (in `db.rs`) is a smoke test that runs `init_db` twice in a row against an in-memory database — a cheap guard that the statements stay idempotent as the schema grows.

## Tables

### `users` — Admin and Usuário comum profiles
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `name` | TEXT NOT NULL | display name |
| `username` | TEXT NOT NULL UNIQUE | **internal login key only, never shown or typed anywhere in the UI** — login picks a profile from a picker (by `id`), it doesn't type a username. Auto-derived from `name` at creation time by `commands::users::slugify` (lowercase, accents stripped, everything else collapsed to `_` — "João da Silva" → `joao_da_silva`) plus `unique_username` appending `_2`, `_3`... on a collision. Immutable after creation (`update_user` never touches it), and intentionally excluded from `UserProfile`/`USER_PROFILE_COLUMNS` — the frontend has no reason to ever see it |
| `password_hash` | TEXT NOT NULL | bcrypt |
| `is_admin` | INTEGER NOT NULL DEFAULT 0 | boolean |
| `active` | INTEGER NOT NULL DEFAULT 1 | boolean — deactivated users disappear from the login profile picker |
| `auto_lock_minutes` | INTEGER NULL | three-state: `NULL` = use the role default (5 min for Admin, never for Usuário comum), `0` = "Nunca" explicitly chosen, `N` = N minutes |
| `theme` | TEXT NOT NULL DEFAULT `'light'`, `CHECK IN ('light', 'dark')` | per-profile, not global — a typed column rather than a generic key-value table, matching `auto_lock_minutes`. Wired end-to-end: `ThemeContext` applies `localStorage` before login (first-run/login/lock screens need a theme too), then switches to this column's value on login and writes through `update_theme` on every change |
| `last_login_at` | TEXT NULL | set to `datetime('now')` (UTC) by `login` on success, and by `create_user`'s first-run auto-login — `NULL` means the profile was created but has never actually logged in yet. Added after the table already existed on real installs, so it's also in `migrate_db` as an `ALTER TABLE` (see "Schema/migration pattern" above) |
| `created_at` | TEXT | |

The very first user ever created becomes Admin automatically (no role picker on that form) and is auto-logged-in right after. Elevating an existing Usuário comum to Admin requires a confirmation modal at the UI layer — no schema-level distinction beyond the `is_admin` flag.

### `categories` — optional item grouping
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `name` | TEXT NOT NULL UNIQUE | |

An item with `category_id IS NULL` is displayed as "Categoria indefinida" (frontend concern, not a schema value).

### `items` — stock catalog
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `code` | TEXT NOT NULL UNIQUE | the identifier used for fast lookup during a sale — duplicates are rejected at the command layer before insert. Optional in the create form: left blank, `create_item` uses the item's own `id` as the code instead (`commands::items::predict_next_item_id` + `unique_code`) — editable into a real code afterward like any other field |
| `name` | TEXT NOT NULL | |
| `category_id` | INTEGER NULL → `categories(id)` **SET NULL** | optional |
| `cost_price` / `sale_price` | REAL, `CHECK (>= 0)` | money as float, rounded to 2 decimals at the command layer |
| `quantity` | INTEGER, `CHECK (>= 0)` | current stock level — the fast-read counter; see `stock_movements` for the "why" behind each change |
| `min_quantity` | INTEGER NULL | drives the low-stock alert (red chip when `quantity <= min_quantity`); `NULL` means the item never alerts |
| `active` | INTEGER NOT NULL DEFAULT 1 | boolean — any logged-in profile can set this to `0` (`commands::items::deactivate_item`); only Admin can set it back to `1` (`update_item`). Also the eventual target of the CSV import screen's "desativar" action for items missing from the sheet (not built yet) |
| `created_at` | TEXT | |

`delete_item` (Admin-only, hard delete) is blocked by the `stock_movements.item_id` foreign key once the item has any recorded movement — in practice that means it only works for a freshly-created, never-touched item (a mistake being corrected). Retiring a real item goes through `active` instead (see `sale_items` below for how a hard-deleted item's past receipts still stay accurate).

### `stock_movements` — append-only ledger
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `item_id` | INTEGER NOT NULL → `items(id)` | |
| `movement_type` | TEXT CHECK IN (`sale`, `entry`, `adjustment`, `initial`, `csv_import`, `refund`) | |
| `quantity_delta` | INTEGER | negative on `sale`, positive on `entry`/`refund`/`initial` |
| `sale_id` | INTEGER NULL → `sales(id)` | only set when `movement_type = 'sale'` (or `'refund'` reversing one) |
| `user_id` | INTEGER NOT NULL → `users(id)` | who caused the movement |
| `created_at` | TEXT | |

Never edited or deleted. Written by `commands::items` (`initial` on `create_item` when the starting quantity is `> 0`, `entry` on `add_stock_entry`, `adjustment` on `update_item` when its `quantity` field's value differs from what was stored) and by `commands::sales::create_sale` (`sale`, one row per line item, `sale_id` set — inserted only after the `sales` row exists in the same transaction, so the reference is always valid; `refund` is reserved for the not-yet-built cancel/estorno flow). `items.quantity` is always updated in the same statement/transaction as the matching ledger row — the ledger is the "why", the item's column is the fast "how much now". No consultation screen yet — it's still just the data source for a possible future stock-rupture forecast (see `docs/future.md`).

### `clients` — Crediário debtors
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `name` | TEXT NOT NULL | |
| `phone` | TEXT NULL | |
| `reminder_date` | TEXT NULL | one per client (not per debt) — sorts the "Devedores" screen |
| `note` | TEXT NULL | free text |
| `created_at` | TEXT | |

Not a `users` row — clients never log in.

### `sales` — one row per sale (completed or cancelled)
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `receipt_sequential` | INTEGER NOT NULL UNIQUE | global, gap-free counter — assigned in the same transaction as the sale, never reused even if PDF generation fails afterward |
| `receipt_number` | TEXT NOT NULL UNIQUE | formatted `{yyyyMMdd}{receipt_sequential zero-padded to 6 digits}`, kept alongside the raw sequential for direct lookup/search |
| `user_id` | INTEGER NOT NULL → `users(id)` | who registered the sale |
| `client_id` | INTEGER NULL → `clients(id)` | only set when a Crediário payment is part of the sale |
| `subtotal` | REAL, `CHECK (>= 0)` | sum of `sale_items.subtotal` (i.e. already net of item-level discounts) |
| `discount_percent` / `discount_amount` | REAL NULL, `CHECK` 0–100 / `>= 0` | the *general* (whole-sale) discount, applied on top of `subtotal` |
| `discount_authorized_by_user_id` / `discount_authorized_at` | INTEGER NULL → `users(id)` / TEXT NULL | which Admin authorized the discount, when the person registering the sale wasn't already an Admin |
| `total` | REAL, `CHECK (>= 0)` | final charged amount, after the general discount |
| `status` | TEXT CHECK IN (`completed`, `cancelled`) | a cancelled sale is never deleted — see below |
| `cancelled_at` | TEXT NULL | |
| `cancelled_by_user_id` | INTEGER NULL → `users(id)` | who requested the cancellation |
| `cancel_authorized_by_user_id` | INTEGER NULL → `users(id)` | which Admin authorized it |
| `created_at` | TEXT | |

Cancelling/reverting a sale (`commands::sales::cancel_sale`, from Histórico de vendas or Devedores' "Ver venda") never deletes the row — it flips `status` to `cancelled` and fills the three `cancelled_*`/`cancel_authorized_*` columns, plus reverses the stock (a `refund`-type row per item in `stock_movements`, only for lines whose item wasn't hard-deleted since). A Crediário client's open balance is **never a stored column** — it's always `SUM(sales.total WHERE client_id = ? AND status = 'completed' AND <a 'credit' sale_payments row exists>) - SUM(credit_payments.amount WHERE client_id = ? AND cancelled_at IS NULL)`, computed on read. Cancelling a Crediário sale therefore reduces the client's balance automatically, just by excluding it from that sum — but if the sale also had a "Valor pago agora" down payment (a `credit_payments` row with `sale_id` set), `cancel_sale` soft-cancels that payment too in the same transaction; otherwise it would keep subtracting from the balance for a debt that no longer exists.

Indexed on `client_id` and `status` (the two columns "Devedores" and sale listings filter by).

### `sale_payments` — payment method(s) per sale
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `sale_id` | INTEGER NOT NULL → `sales(id)` **CASCADE** | |
| `payment_method` | TEXT CHECK IN (`cash`, `card`, `pix`, `credit`) | |
| `amount` | REAL, `CHECK (> 0)` | |

Modeled as its own table from day one specifically so a future split-payment feature (e.g. part PIX, part Crediário — deliberately not implemented in v1) needs no schema migration: `create_sale` always writes exactly one row per sale today, but nothing about the table assumes that.

### `sale_items` — line items of a sale
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `sale_id` | INTEGER NOT NULL → `sales(id)` **CASCADE** | |
| `item_id` | INTEGER NULL → `items(id)` **SET NULL** | |
| `item_code` / `item_name` | TEXT NOT NULL | **snapshot** at time of sale | |
| `unit_price` | REAL, `CHECK (>= 0)` | price at time of sale, independent of later price changes on `items` |
| `quantity` | INTEGER, `CHECK (> 0)` | |
| `discount_percent` / `discount_amount` | REAL NULL, `CHECK` 0–100 / `>= 0` | the *item-level* discount (applied before the sale's general discount) |
| `subtotal` | REAL, `CHECK (>= 0)` | this line's total after its own discount |

`item_code`/`item_name` are snapshotted (not just joined from `items`) and `item_id` uses `ON DELETE SET NULL` rather than a hard foreign key requirement, because an Admin is allowed to hard-delete an item from the catalog — a past receipt must keep showing the correct name/code even after that.

### `credit_payments` — Crediário debt settlements
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `client_id` | INTEGER NOT NULL → `clients(id)` | |
| `amount` | REAL, `CHECK (> 0)` | partial or full — any amount up to the current balance |
| `user_id` | INTEGER NOT NULL → `users(id)` | who registered it (no Admin password required) |
| `sale_id` | INTEGER NULL → `sales(id)` | only set when this payment came from the "Valor pago agora" step of `create_sale` (a Crediário sale where the customer already had part of the money) — `NULL` for every payment registered later through Devedores' "Registrar pagamento" |
| `cancelled_at` | TEXT NULL | soft-cancel of a mistakenly-registered payment — never deleted. `NULL` = still active |
| `cancelled_by_user_id` | INTEGER NULL → `users(id)` | who requested the cancellation |
| `cancel_authorized_by_user_id` | INTEGER NULL → `users(id)` | which Admin authorized it (same "self-authorizes if already Admin, otherwise a *different* admin's password" rule as discount/cancel-sale — unlike registering the payment itself, which needs no admin password) |
| `cancel_reason` | TEXT NULL | required by the command layer once cancelling, shown as "Pagamento cancelado por X devido a Y" |
| `created_at` | TEXT | |

A client's open balance only sums `amount` where `cancelled_at IS NULL` (see `commands::clients::client_balance`) — cancelling a payment is what makes the balance go back up, no separate reversal entry needed.

### `config` — generic key/value
```
config(key TEXT PRIMARY KEY, value TEXT NOT NULL)
```
No rows are seeded — `commands::config`'s getters fall back to a default in code when the key is absent rather than seeding a row. Keys in use: `low_stock_warning_percent` (the global "yellow chip" threshold, defaults to `20`), `default_profit_margin_percent` (suggests `sale_price` on item creation as `cost_price * (1 + percent / 100)`, defaults to `30`; Admin-only, editable in Configurações), `store_name` and `store_info` (both default to `""`; feed the receipt header — see `commands::receipts` — falling back to "BORA VENDER" with no extra lines when empty), `receipt_thank_you_message` (defaults to `"Obrigado pela preferência!"` — unlike the two above, this one's default *is* real content, not an empty-means-fallback value), `credit_enabled` (`"0"`/`"1"`, defaults to enabled when absent — Admin-only, `set_credit_enabled` refuses `"0"` while any client has an open balance, see `commands::clients::has_open_debtors`). Expected as later features land: `backup_folder` (chosen backup destination).
