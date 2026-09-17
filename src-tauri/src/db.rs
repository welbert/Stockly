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
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            name          TEXT    NOT NULL,
            phone         TEXT    NULL,
            reminder_date TEXT    NULL,
            note          TEXT    NULL,
            created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
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

        CREATE TABLE IF NOT EXISTS stock_movements (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id         INTEGER NOT NULL REFERENCES items(id),
            movement_type   TEXT    NOT NULL CHECK (movement_type IN ('sale', 'entry', 'adjustment', 'initial', 'csv_import', 'refund')),
            quantity_delta  INTEGER NOT NULL,
            sale_id         INTEGER NULL REFERENCES sales(id),
            user_id         INTEGER NOT NULL REFERENCES users(id),
            created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_id);

        CREATE TABLE IF NOT EXISTS credit_payments (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id   INTEGER NOT NULL REFERENCES clients(id),
            amount      REAL    NOT NULL CHECK (amount > 0),
            user_id     INTEGER NOT NULL REFERENCES users(id),
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_credit_payments_client ON credit_payments(client_id);

        CREATE TABLE IF NOT EXISTS config (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    )
}

fn migrate_db(conn: &Connection) {
    // Seguro rodar a cada início — o erro de "coluna já existe" é ignorado.
    let _ = conn.execute("ALTER TABLE users ADD COLUMN last_login_at TEXT NULL", []);
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

    #[test]
    fn schema_applies_cleanly() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        init_db(&conn).unwrap();
        migrate_db(&conn);
        // roda de novo pra garantir que os IF NOT EXISTS sao realmente idempotentes
        init_db(&conn).unwrap();
    }
}
