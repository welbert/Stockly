use rusqlite::Connection;
use std::path::PathBuf;

pub fn open_connection(db_path: PathBuf) -> rusqlite::Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    init_db(&conn)?;
    migrate_db(&conn);
    Ok(conn)
}

pub(crate) fn init_db(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS users (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            name              TEXT    NOT NULL,
            username          TEXT    NOT NULL UNIQUE,
            password_hash     TEXT    NOT NULL,
            is_admin          INTEGER NOT NULL DEFAULT 0,
            active            INTEGER NOT NULL DEFAULT 1,
            auto_lock_minutes INTEGER NULL,
            theme             TEXT    NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
            font_scale        TEXT    NOT NULL DEFAULT 'normal' CHECK (font_scale IN ('small', 'normal', 'large', 'xlarge')),
            last_login_at     TEXT    NULL,
            created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS categories (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT    NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS items (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            code        TEXT    NOT NULL UNIQUE,
            name        TEXT    NOT NULL,
            category_id INTEGER NULL REFERENCES categories(id) ON DELETE SET NULL,
            cost_price  REAL    NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
            sale_price  REAL    NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
            quantity    INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
            min_quantity INTEGER NULL,
            active      INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id);

        CREATE TABLE IF NOT EXISTS clients (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT    NOT NULL,
            phone           TEXT    NULL,
            reminder_date   TEXT    NULL,
            note            TEXT    NULL,
            birth_date      TEXT    NULL,
            document_type   TEXT    NULL CHECK (document_type IN ('cpf', 'cnpj')),
            document_number TEXT    NULL,
            created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sales (
            id                            INTEGER PRIMARY KEY AUTOINCREMENT,
            receipt_sequential            INTEGER NOT NULL UNIQUE,
            receipt_number                TEXT    NOT NULL UNIQUE,
            user_id                       INTEGER NOT NULL REFERENCES users(id),
            client_id                     INTEGER NULL REFERENCES clients(id),
            subtotal                      REAL    NOT NULL CHECK (subtotal >= 0),
            discount_percent              REAL    NULL CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100)),
            discount_amount               REAL    NULL CHECK (discount_amount IS NULL OR discount_amount >= 0),
            discount_authorized_by_user_id INTEGER NULL REFERENCES users(id),
            discount_authorized_at        TEXT    NULL,
            total                         REAL    NOT NULL CHECK (total >= 0),
            status                        TEXT    NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
            cancelled_at                  TEXT    NULL,
            cancelled_by_user_id          INTEGER NULL REFERENCES users(id),
            cancel_authorized_by_user_id  INTEGER NULL REFERENCES users(id),
            created_at                    TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_sales_client ON sales(client_id);
        CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);

        CREATE TABLE IF NOT EXISTS sale_payments (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_id         INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
            payment_method  TEXT    NOT NULL CHECK (payment_method IN ('cash', 'card', 'pix', 'credit')),
            amount          REAL    NOT NULL CHECK (amount > 0)
        );
        CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id);

        CREATE TABLE IF NOT EXISTS sale_items (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_id           INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
            item_id           INTEGER NULL REFERENCES items(id) ON DELETE SET NULL,
            item_code         TEXT    NOT NULL,
            item_name         TEXT    NOT NULL,
            unit_price        REAL    NOT NULL CHECK (unit_price >= 0),
            quantity          INTEGER NOT NULL CHECK (quantity > 0),
            discount_percent  REAL    NULL CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100)),
            discount_amount   REAL    NULL CHECK (discount_amount IS NULL OR discount_amount >= 0),
            subtotal          REAL    NOT NULL CHECK (subtotal >= 0)
        );
        CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);

        -- `item_id` cascades on delete — `delete_item` only ever blocks on
        -- `sale_items` (checked explicitly there), so a stock/price ledger
        -- with no sale attached is never a reason by itself to keep an item
        -- around; it's removed along with it.
        CREATE TABLE IF NOT EXISTS stock_movements (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id         INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
            movement_type   TEXT    NOT NULL CHECK (movement_type IN ('sale', 'entry', 'adjustment', 'initial', 'csv_import', 'refund')),
            quantity_delta  INTEGER NOT NULL,
            sale_id         INTEGER NULL REFERENCES sales(id),
            user_id         INTEGER NOT NULL REFERENCES users(id),
            created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_id);

        -- Append-only, same shape as stock_movements but for cost_price/sale_price
        -- instead of quantity: one row per value *after* the change (not a
        -- before/after pair — the previous value is just the row before it).
        -- Written once at create_item (the starting prices) and again on
        -- every update_item that actually changes one of the two prices.
        CREATE TABLE IF NOT EXISTS item_price_history (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id     INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
            cost_price  REAL    NOT NULL CHECK (cost_price >= 0),
            sale_price  REAL    NOT NULL CHECK (sale_price >= 0),
            user_id     INTEGER NOT NULL REFERENCES users(id),
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_item_price_history_item ON item_price_history(item_id);

        CREATE TABLE IF NOT EXISTS credit_payments (
            id                           INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id                    INTEGER NOT NULL REFERENCES clients(id),
            amount                       REAL    NOT NULL CHECK (amount > 0),
            user_id                      INTEGER NOT NULL REFERENCES users(id),
            cancelled_at                 TEXT    NULL,
            cancelled_by_user_id         INTEGER NULL REFERENCES users(id),
            cancel_authorized_by_user_id INTEGER NULL REFERENCES users(id),
            cancel_reason                TEXT    NULL,
            created_at                   TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_credit_payments_client ON credit_payments(client_id);

        CREATE TABLE IF NOT EXISTS credit_payment_allocations (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            payment_id INTEGER NOT NULL REFERENCES credit_payments(id) ON DELETE CASCADE,
            sale_id    INTEGER NOT NULL REFERENCES sales(id),
            amount     REAL    NOT NULL CHECK (amount > 0)
        );
        CREATE INDEX IF NOT EXISTS idx_credit_payment_allocations_payment ON credit_payment_allocations(payment_id);
        CREATE INDEX IF NOT EXISTS idx_credit_payment_allocations_sale ON credit_payment_allocations(sale_id);

        CREATE TABLE IF NOT EXISTS config (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        -- `size` has no CHECK on purpose: the vocabulary of sizes ('1x1'..'6x3')
        -- is a catalog decision (src/components/dashboard-cards/catalog.ts), not
        -- a schema one — locking it in the DB would mean a migration every time
        -- a card's allowed sizes change.
        CREATE TABLE IF NOT EXISTS dashboard_layout (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            card_key TEXT    NOT NULL,
            x        INTEGER NOT NULL,
            y        INTEGER NOT NULL,
            size     TEXT    NOT NULL,
            visible  INTEGER NOT NULL DEFAULT 1,
            UNIQUE(user_id, card_key)
        );
        CREATE INDEX IF NOT EXISTS idx_dashboard_layout_user ON dashboard_layout(user_id);

        -- Append-only trail of every admin-authorized action — discount,
        -- cancelamento de venda, cancelamento de pagamento de Crediário,
        -- redefinição de senha. `client_id`/`target_user_id` are mutually
        -- exclusive per action type (a client for the first 3, the affected
        -- user for password_reset) — see `commands::audit`'s doc comment for
        -- how the two get merged into one `clientName` field over IPC.
        -- `requested_by_user_id`/`authorized_by_user_id` are equal whenever
        -- the acting admin authorized their own action, same as
        -- `sales.discount_authorized_by_user_id` always has for a
        -- self-authorized discount.
        CREATE TABLE IF NOT EXISTS audit_log (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            action_type           TEXT    NOT NULL CHECK (action_type IN ('discount', 'sale_cancel', 'payment_cancel', 'password_reset')),
            reference             TEXT    NULL,
            client_id             INTEGER NULL REFERENCES clients(id),
            target_user_id        INTEGER NULL REFERENCES users(id),
            amount                REAL    NULL,
            requested_by_user_id  INTEGER NOT NULL REFERENCES users(id),
            authorized_by_user_id INTEGER NOT NULL REFERENCES users(id),
            created_at            TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);",
    )
}

/// (card_key, x, y, size) of the Dashboard's default layout, seeded the first
/// time an Admin ever opens the screen (see `commands::dashboard::get_dashboard_layout`).
/// Only a curated subset of `CARD_CATALOG` ships visible by default — the rest
/// exist in the catalog but stay opt-in via "+ Adicionar card", so a fresh
/// dashboard isn't overwhelming. Chosen to fit a clean 6-column grid: six 1x1
/// stat cards fill the first row exactly, then the two cards that benefit from
/// more height/width (the low-stock table, the sales trend chart) share the row below.
pub const DEFAULT_DASHBOARD_LAYOUT: &[(&str, i64, i64, &str)] = &[
    ("itens_em_estoque", 0, 0, "1x1"),
    ("vendas_hoje", 1, 0, "1x1"),
    ("recebidos_hoje", 2, 0, "1x1"),
    ("vendas_mes", 3, 0, "1x1"),
    ("recebidos_mes", 4, 0, "1x1"),
    ("estoque_baixo", 5, 0, "1x1"),
    ("itens_estoque_baixo", 0, 1, "2x2"),
    ("vendas_por_periodo", 2, 1, "4x2"),
];

/// Seeds an Admin's dashboard with `DEFAULT_DASHBOARD_LAYOUT` — `INSERT OR
/// IGNORE` so it's safe to call even if some rows already exist (e.g. the
/// lazy "seed on first empty load" path in `get_dashboard_layout`).
pub fn seed_default_dashboard_layout(conn: &Connection, user_id: i64) -> Result<(), String> {
    for (card_key, x, y, size) in DEFAULT_DASHBOARD_LAYOUT {
        conn.execute(
            "INSERT OR IGNORE INTO dashboard_layout (user_id, card_key, x, y, size) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![user_id, card_key, x, y, size],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn migrate_db(conn: &Connection) {
    // Seguro rodar a cada início — o erro de "coluna já existe" é ignorado.
    let _ = conn.execute("ALTER TABLE users ADD COLUMN last_login_at TEXT NULL", []);
    let _ = conn.execute("ALTER TABLE users ADD COLUMN font_scale TEXT NOT NULL DEFAULT 'normal' CHECK (font_scale IN ('small', 'normal', 'large', 'xlarge'))", []);
    let _ = conn.execute("ALTER TABLE credit_payments ADD COLUMN cancelled_at TEXT NULL", []);
    let _ = conn.execute("ALTER TABLE credit_payments ADD COLUMN cancelled_by_user_id INTEGER NULL REFERENCES users(id)", []);
    let _ = conn.execute("ALTER TABLE credit_payments ADD COLUMN cancel_authorized_by_user_id INTEGER NULL REFERENCES users(id)", []);
    let _ = conn.execute("ALTER TABLE credit_payments ADD COLUMN cancel_reason TEXT NULL", []);
    // credit_payments.sale_id (added above, once) is superseded by credit_payment_allocations
    // — dropped instead of kept around unused, since this app has no installs to preserve yet.
    let _ = conn.execute("ALTER TABLE credit_payments DROP COLUMN sale_id", []);
    let _ = conn.execute("ALTER TABLE clients ADD COLUMN birth_date TEXT NULL", []);
    let _ = conn.execute("ALTER TABLE clients ADD COLUMN document_type TEXT NULL CHECK (document_type IN ('cpf', 'cnpj'))", []);
    let _ = conn.execute("ALTER TABLE clients ADD COLUMN document_number TEXT NULL", []);
    let _ =
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_document_number ON clients(document_number) WHERE document_number IS NOT NULL", []);
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS dashboard_layout (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            card_key TEXT    NOT NULL,
            x        INTEGER NOT NULL,
            y        INTEGER NOT NULL,
            size     TEXT    NOT NULL,
            visible  INTEGER NOT NULL DEFAULT 1,
            UNIQUE(user_id, card_key)
        );
        CREATE INDEX IF NOT EXISTS idx_dashboard_layout_user ON dashboard_layout(user_id);",
    );
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS item_price_history (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id     INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
            cost_price  REAL    NOT NULL CHECK (cost_price >= 0),
            sale_price  REAL    NOT NULL CHECK (sale_price >= 0),
            user_id     INTEGER NOT NULL REFERENCES users(id),
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_item_price_history_item ON item_price_history(item_id);",
    );
    // `created_at` has no index on any table by default (only foreign keys
    // do) — these four are the ones worth it, one per report-backing
    // `list_*` command that does a full-table `ORDER BY created_at DESC`:
    // `sales.created_at` (`list_sales`, read by almost every Vendas report),
    // `stock_movements.created_at` (`list_stock_movements`),
    // `credit_payments.created_at` (`list_credit_payments`, Pagamentos
    // recebidos/cancelados) and `item_price_history.created_at`
    // (`list_item_price_history`, Histórico de alteração de preço). Doesn't
    // help the Dashboard's `strftime('%Y-%m', created_at, 'localtime') = ?1`
    // filters — wrapping the column in a function makes those non-sargable,
    // which would need a separate expression index not judged worth the
    // complexity here.
    let _ = conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
         CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at);
         CREATE INDEX IF NOT EXISTS idx_credit_payments_created_at ON credit_payments(created_at);
         CREATE INDEX IF NOT EXISTS idx_item_price_history_created_at ON item_price_history(created_at);",
    );
    // Partial indexes matching `commands::audit::list_admin_authorizations`'s
    // 3 `WHERE ... IS NOT NULL` queries exactly — each one otherwise scans
    // every `sales`/`credit_payments` row just to find the handful that were
    // ever discount/cancel-authorized.
    let _ = conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_sales_discount_authorized_by
             ON sales(discount_authorized_by_user_id) WHERE discount_authorized_by_user_id IS NOT NULL;
         CREATE INDEX IF NOT EXISTS idx_sales_cancel_authorized_by
             ON sales(cancel_authorized_by_user_id) WHERE cancel_authorized_by_user_id IS NOT NULL;
         CREATE INDEX IF NOT EXISTS idx_credit_payments_cancel_authorized_by
             ON credit_payments(cancel_authorized_by_user_id) WHERE cancel_authorized_by_user_id IS NOT NULL;",
    );

    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS audit_log (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            action_type           TEXT    NOT NULL CHECK (action_type IN ('discount', 'sale_cancel', 'payment_cancel', 'password_reset')),
            reference             TEXT    NULL,
            client_id             INTEGER NULL REFERENCES clients(id),
            target_user_id        INTEGER NULL REFERENCES users(id),
            amount                REAL    NULL,
            requested_by_user_id  INTEGER NOT NULL REFERENCES users(id),
            authorized_by_user_id INTEGER NOT NULL REFERENCES users(id),
            created_at            TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);",
    );

    // One-time backfill from the 3 sources that predate this table (desconto
    // concedido, venda cancelada, pagamento de Crediário cancelado — see
    // `docs/future.md`'s "Auditoria" section). Guarded by "has audit_log ever
    // held a row" instead of being unconditionally re-runnable like the rest
    // of this function: every live authorized action now also writes here
    // directly, inline with the action itself (`commands::audit::record`,
    // called from `commands::sales`/`commands::clients`/`commands::users`),
    // so the *only* reason this SELECT ever needs to run again is to catch
    // historical rows from before `audit_log` existed — and once either this
    // backfill or a single live write has landed one row, that job is done
    // for good. Deliberately not an idempotent `INSERT OR IGNORE` left
    // running forever instead: this app has never needed a "did this
    // one-time step already run" tracking mechanism beyond a plain existence
    // check, and it doesn't start needing one for this.
    let seeded: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM audit_log)", [], |row| row.get(0)).unwrap_or(true);
    if !seeded {
        let _ = conn.execute_batch(
            "INSERT INTO audit_log (action_type, reference, client_id, requested_by_user_id, authorized_by_user_id, amount, created_at)
             SELECT 'discount', s.receipt_number, s.client_id, s.user_id, s.discount_authorized_by_user_id,
                    ROUND(COALESCE((SELECT SUM(si.unit_price * si.quantity) FROM sale_items si WHERE si.sale_id = s.id), 0) - s.total, 2),
                    s.discount_authorized_at
             FROM sales s WHERE s.discount_authorized_by_user_id IS NOT NULL;

             INSERT INTO audit_log (action_type, reference, client_id, requested_by_user_id, authorized_by_user_id, amount, created_at)
             SELECT 'sale_cancel', s.receipt_number, s.client_id, s.cancelled_by_user_id, s.cancel_authorized_by_user_id, s.total, s.cancelled_at
             FROM sales s WHERE s.cancel_authorized_by_user_id IS NOT NULL;

             INSERT INTO audit_log (action_type, client_id, requested_by_user_id, authorized_by_user_id, amount, created_at)
             SELECT 'payment_cancel', cp.client_id, cp.cancelled_by_user_id, cp.cancel_authorized_by_user_id, cp.amount, cp.cancelled_at
             FROM credit_payments cp WHERE cp.cancel_authorized_by_user_id IS NOT NULL;",
        );
    }
}

/// In-memory connection with the schema applied — reused by other modules'
/// tests (e.g. commands::users) so they don't each reimplement this setup.
#[cfg(test)]
pub(crate) fn test_connection() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
    init_db(&conn).unwrap();
    conn
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    #[test]
    fn schema_applies_cleanly() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        init_db(&conn).unwrap();
        migrate_db(&conn);
        // roda de novo pra garantir que os IF NOT EXISTS sao realmente idempotentes
        init_db(&conn).unwrap();
    }

    /// Regression test for a real crash: on an already-installed database,
    /// `clients` exists without `birth_date`/`document_type`/`document_number`
    /// — `init_db`'s `CREATE TABLE IF NOT EXISTS` is then a no-op, so those
    /// columns (and the unique index on `document_number`) must come entirely
    /// from `migrate_db`'s `ALTER TABLE`s, never from a statement inside
    /// `init_db` that assumes the column already exists.
    #[test]
    fn migrate_db_adds_new_client_columns_to_a_pre_existing_table() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        conn.execute_batch(
            "CREATE TABLE clients (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                name          TEXT    NOT NULL,
                phone         TEXT    NULL,
                reminder_date TEXT    NULL,
                note          TEXT    NULL,
                created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
            );",
        )
        .unwrap();

        init_db(&conn).unwrap();
        migrate_db(&conn);

        conn.execute(
            "INSERT INTO clients (name, document_type, document_number) VALUES ('Cliente Teste', 'cpf', '11144477735')",
            [],
        )
        .unwrap();
    }

    /// Same shape of regression as `migrate_db_adds_new_client_columns_to_a_pre_existing_table`,
    /// but for `users.font_scale` — a pre-existing `users` table (before this
    /// column existed) must still end up with it after `migrate_db`.
    #[test]
    fn migrate_db_adds_font_scale_to_a_pre_existing_users_table() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        conn.execute_batch(
            "CREATE TABLE users (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                name              TEXT    NOT NULL,
                username          TEXT    NOT NULL UNIQUE,
                password_hash     TEXT    NOT NULL,
                is_admin          INTEGER NOT NULL DEFAULT 0,
                active            INTEGER NOT NULL DEFAULT 1,
                auto_lock_minutes INTEGER NULL,
                theme             TEXT    NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
                created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
            );",
        )
        .unwrap();

        init_db(&conn).unwrap();
        migrate_db(&conn);

        conn.execute(
            "INSERT INTO users (name, username, password_hash) VALUES ('Usuário Teste', 'usuario.teste', 'hash')",
            [],
        )
        .unwrap();
        let font_scale: String = conn.query_row("SELECT font_scale FROM users WHERE username = 'usuario.teste'", [], |row| row.get(0)).unwrap();
        assert_eq!(font_scale, "normal");
    }

    /// The one-time backfill guard discussed with the user: `audit_log`
    /// starts empty, so the first `migrate_db` call that sees a
    /// discount-authorized sale already in `sales` must backfill it — but a
    /// second call must not duplicate that row, even though nothing new
    /// stops it from re-running except the "has audit_log ever held a row"
    /// check itself.
    #[test]
    fn migrate_db_backfills_audit_log_once_from_pre_existing_authorizations() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        init_db(&conn).unwrap();
        migrate_db(&conn); // creates audit_log fresh — still nothing to backfill yet

        conn.execute("INSERT INTO users (name, username, password_hash, is_admin) VALUES ('Admin', 'admin', 'h', 1)", []).unwrap();
        let admin_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO sales (receipt_sequential, receipt_number, user_id, subtotal, discount_amount, discount_authorized_by_user_id, discount_authorized_at, total, status)
             VALUES (1, '20260101000001', ?1, 100.0, 10.0, ?1, '2026-01-01 10:00:00', 90.0, 'completed')",
            params![admin_id],
        )
        .unwrap();

        migrate_db(&conn); // sees the sale for the first time — backfills it
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM audit_log WHERE action_type = 'discount'", [], |row| row.get(0)).unwrap();
        assert_eq!(count, 1);

        migrate_db(&conn); // audit_log already non-empty — must skip, not duplicate
        let count_again: i64 = conn.query_row("SELECT COUNT(*) FROM audit_log WHERE action_type = 'discount'", [], |row| row.get(0)).unwrap();
        assert_eq!(count_again, 1);
    }
}
