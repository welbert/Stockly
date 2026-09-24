//! Generates `demo/stockly-demonstration.db` — a fully-populated SQLite
//! database used to demo the app (currently the Dashboard; later Relatórios)
//! without needing a real store's data. See `demo/README.md`.
//!
//! Run from `src-tauri/`: `cargo run --bin seed_demo`
//! (an optional first argument overrides the output path).
//!
//! Reuses the real schema (`stockly_app_lib::db::open_connection`, the same
//! function the app itself calls) so this can never drift from the actual
//! `init_db`/`migrate_db` — only the data below is hand-written, mirroring
//! `commands::sales::create_sale`'s exact write sequence (sales → sale_items
//! + stock_movements → sale_payments → credit_payments/allocations) since
//! that command itself needs a running Tauri `AppState`, which isn't
//! available outside the app.

use chrono::{DateTime, Duration, Local, NaiveDate, TimeZone, Utc};
use rusqlite::{params, Connection};
use std::path::PathBuf;
use stockly_app_lib::db;

const DEMO_PASSWORD: &str = "123456";

/// Same formula as `money::round2` — duplicated here (a one-liner) rather
/// than making the whole `money` module `pub` just for this script.
fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

/// Builds the UTC-naive string SQLite expects for every `created_at` (same
/// format `datetime('now')` produces) from a *local* wall-clock moment —
/// `days_ago` days before today, at `hour:minute`. Returns the string plus
/// the local calendar date, since the receipt number's date prefix always
/// reflects local time (see `commands::sales::create_sale`).
fn local_moment(days_ago: i64, hour: u32, minute: u32) -> (String, NaiveDate) {
    let local_date = (Local::now() - Duration::days(days_ago)).date_naive();
    let naive = local_date.and_hms_opt(hour, minute, 0).unwrap();
    let local_dt: DateTime<Local> = Local.from_local_datetime(&naive).single().expect("unambiguous local time");
    let utc_dt: DateTime<Utc> = local_dt.with_timezone(&Utc);
    (utc_dt.format("%Y-%m-%d %H:%M:%S").to_string(), local_date)
}

struct ItemSpec {
    code: &'static str,
    name: &'static str,
    category: Option<&'static str>,
    cost_price: f64,
    sale_price: f64,
    quantity: i64,
    min_quantity: Option<i64>,
}

struct ClientSpec {
    name: &'static str,
    phone: &'static str,
    /// Days from today; `None` means no reminder set at all.
    reminder_offset: Option<i64>,
    note: &'static str,
    birth_date: Option<&'static str>,
    /// `Some(("cpf" | "cnpj", number))` — `number` unformatted, matching how
    /// `commands::clients::create_client` stores it. Left `None` for most
    /// clients, same as a real store where not everyone hands over a
    /// document. The CNPJ used below is Receita Federal/SERPRO's own
    /// published example for the new alphanumeric format.
    document: Option<(&'static str, &'static str)>,
}

struct LineSpec {
    item_code: &'static str,
    quantity: i64,
    discount_percent: Option<f64>,
    discount_amount: Option<f64>,
}

fn line(item_code: &'static str, quantity: i64) -> LineSpec {
    LineSpec { item_code, quantity, discount_percent: None, discount_amount: None }
}

struct SaleSpec {
    days_ago: i64,
    hour: u32,
    minute: u32,
    /// 1 = Admin Demo, 2 = Usuário Demo — matches the two seeded users below.
    user_id: i64,
    lines: Vec<LineSpec>,
    general_discount_percent: Option<f64>,
    general_discount_amount: Option<f64>,
    payment_method: &'static str,
    /// Required when `payment_method == "credit"`; optional (and purely
    /// informational — never affects `client_balance`) for every other
    /// method, same rule as `create_sale`'s own `client_id`.
    client: Option<&'static str>,
    /// "Valor pago agora" — 0.0 means the sale starts fully open.
    credit_paid_now: f64,
    cancelled: bool,
}

/// A later, standalone Crediário settlement (Clientes' "Registrar
/// pagamento") — separate from `SaleSpec.credit_paid_now`, which is the
/// at-sale-time down payment. Targets the Nth credit sale (0-indexed, in the
/// order credit sales are created) for the named client.
struct PaymentSpec {
    client: &'static str,
    credit_sale_index: usize,
    days_after_sale: i64,
    amount: f64,
}

fn items() -> Vec<ItemSpec> {
    vec![
        ItemSpec { code: "F001", name: "Parafuso M6 20mm", category: Some("Ferragens"), cost_price: 0.30, sale_price: 0.80, quantity: 30, min_quantity: Some(5) },
        ItemSpec { code: "F002", name: "Arruela M6", category: Some("Ferragens"), cost_price: 0.05, sale_price: 0.15, quantity: 12, min_quantity: Some(10) },
        ItemSpec { code: "F003", name: "Dobradiça 3in", category: Some("Ferragens"), cost_price: 4.00, sale_price: 9.90, quantity: 9, min_quantity: Some(8) },
        ItemSpec { code: "F004", name: "Fechadura simples", category: Some("Ferragens"), cost_price: 25.00, sale_price: 55.00, quantity: 0, min_quantity: Some(3) },
        ItemSpec { code: "F005", name: "Martelo", category: Some("Ferragens"), cost_price: 18.00, sale_price: 39.90, quantity: 25, min_quantity: Some(5) },
        ItemSpec { code: "E001", name: "Lâmpada LED 9W", category: Some("Elétrica"), cost_price: 6.00, sale_price: 12.50, quantity: 20, min_quantity: Some(5) },
        ItemSpec { code: "E002", name: "Fita isolante 19mm", category: Some("Elétrica"), cost_price: 3.00, sale_price: 6.90, quantity: 18, min_quantity: Some(10) },
        ItemSpec { code: "E003", name: "Disjuntor 20A", category: Some("Elétrica"), cost_price: 15.00, sale_price: 32.00, quantity: 4, min_quantity: Some(6) },
        ItemSpec { code: "E004", name: "Interruptor simples", category: Some("Elétrica"), cost_price: 4.00, sale_price: 9.50, quantity: 30, min_quantity: Some(5) },
        ItemSpec { code: "E005", name: "Conector RJ45", category: Some("Elétrica"), cost_price: 0.80, sale_price: 2.50, quantity: 0, min_quantity: Some(5) },
        ItemSpec { code: "E006", name: "Extensão elétrica 5m", category: Some("Elétrica"), cost_price: 20.00, sale_price: 45.00, quantity: 12, min_quantity: Some(5) },
        ItemSpec { code: "P001", name: "Caneta", category: Some("Papelaria"), cost_price: 0.50, sale_price: 2.00, quantity: 50, min_quantity: Some(10) },
        ItemSpec { code: "P002", name: "Caderno universitário", category: Some("Papelaria"), cost_price: 8.00, sale_price: 18.00, quantity: 40, min_quantity: Some(10) },
        ItemSpec { code: "P003", name: "Lápis com borracha", category: Some("Papelaria"), cost_price: 1.00, sale_price: 3.00, quantity: 60, min_quantity: Some(15) },
        ItemSpec { code: "L001", name: "Detergente 500ml", category: Some("Limpeza"), cost_price: 2.00, sale_price: 5.50, quantity: 35, min_quantity: Some(10) },
        ItemSpec { code: "L002", name: "Vassoura", category: Some("Limpeza"), cost_price: 9.00, sale_price: 22.00, quantity: 15, min_quantity: Some(12) },
        ItemSpec { code: "X001", name: "Vela aromática", category: None, cost_price: 5.00, sale_price: 15.00, quantity: 18, min_quantity: Some(20) },
        ItemSpec { code: "X002", name: "Caneca de porcelana", category: None, cost_price: 7.00, sale_price: 20.00, quantity: 25, min_quantity: None },
    ]
}

fn clients() -> Vec<ClientSpec> {
    vec![
        ClientSpec {
            name: "Ana Souza",
            phone: "(11) 98765-4321",
            reminder_offset: Some(-3),
            note: "Cliente antiga, sempre paga em dia",
            birth_date: Some("1985-04-12"),
            document: Some(("cpf", "52998224725")),
        },
        ClientSpec { name: "Bruno Lima", phone: "(11) 97654-3210", reminder_offset: Some(1), note: "", birth_date: None, document: None },
        ClientSpec { name: "Carla Mendes", phone: "(11) 96543-2109", reminder_offset: Some(6), note: "", birth_date: Some("1998-09-30"), document: None },
        ClientSpec {
            name: "Diego Rocha",
            phone: "(11) 95432-1098",
            reminder_offset: Some(20),
            note: "Já quitou a última compra",
            birth_date: None,
            document: None,
        },
        ClientSpec { name: "Elaine Costa", phone: "(11) 94321-0987", reminder_offset: None, note: "", birth_date: None, document: None },
        // These two never carry a Crediário balance — only ever identified on
        // a Dinheiro/Cartão/PIX sale (optional there, see `PaymentModal`),
        // here specifically to demo the Clientes screen listing everyone, not
        // just debtors, and to show a purchase history entry for a
        // non-Crediário method.
        ClientSpec {
            name: "Fernando Alves",
            phone: "(11) 93210-8765",
            reminder_offset: None,
            note: "",
            birth_date: Some("1990-11-02"),
            document: Some(("cpf", "11223344517")),
        },
        ClientSpec {
            name: "Construtora Horizonte",
            phone: "(11) 3222-4455",
            reminder_offset: None,
            note: "Compra ferragens em volume, paga sempre no cartão",
            birth_date: None,
            document: Some(("cnpj", "12ABC34501DE35")),
        },
    ]
}

/// 23 sales spanning ~45 days, most-negative (oldest) first — enough to
/// cover the current month, the previous month (for the Dashboard's
/// "Comparativo mensal"), and every one of the last 7 days (for "Vendas por
/// período"). Line quantities are clamped to whatever stock is actually left
/// at insert time (see `main`), so these numbers don't need to be hand-balanced
/// against `items()`'s starting quantities.
fn sales() -> Vec<SaleSpec> {
    vec![
        SaleSpec { days_ago: 45, hour: 10, minute: 15, user_id: 2, lines: vec![line("P001", 3), line("P002", 1)], general_discount_percent: None, general_discount_amount: None, payment_method: "pix", client: None, credit_paid_now: 0.0, cancelled: false },
        SaleSpec { days_ago: 42, hour: 15, minute: 0, user_id: 1, lines: vec![line("F005", 1)], general_discount_percent: None, general_discount_amount: None, payment_method: "card", client: None, credit_paid_now: 0.0, cancelled: false },
        SaleSpec { days_ago: 38, hour: 11, minute: 30, user_id: 2, lines: vec![line("E004", 2), line("E002", 2)], general_discount_percent: None, general_discount_amount: None, payment_method: "cash", client: None, credit_paid_now: 0.0, cancelled: false },
        SaleSpec { days_ago: 35, hour: 16, minute: 45, user_id: 2, lines: vec![line("L001", 4)], general_discount_percent: None, general_discount_amount: None, payment_method: "pix", client: None, credit_paid_now: 0.0, cancelled: false },
        SaleSpec { days_ago: 32, hour: 9, minute: 20, user_id: 1, lines: vec![line("X002", 2), line("P003", 3)], general_discount_percent: None, general_discount_amount: None, payment_method: "card", client: None, credit_paid_now: 0.0, cancelled: false },
        SaleSpec { days_ago: 29, hour: 13, minute: 10, user_id: 2, lines: vec![line("F001", 8)], general_discount_percent: Some(10.0), general_discount_amount: None, payment_method: "cash", client: None, credit_paid_now: 0.0, cancelled: false },
        SaleSpec { days_ago: 26, hour: 17, minute: 5, user_id: 1, lines: vec![line("E006", 1)], general_discount_percent: None, general_discount_amount: None, payment_method: "credit", client: Some("Ana Souza"), credit_paid_now: 0.0, cancelled: false },
        SaleSpec { days_ago: 23, hour: 10, minute: 40, user_id: 2, lines: vec![line("E001", 2), line("F002", 5)], general_discount_percent: None, general_discount_amount: None, payment_method: "card", client: None, credit_paid_now: 0.0, cancelled: false },
        SaleSpec { days_ago: 20, hour: 14, minute: 0, user_id: 1, lines: vec![line("P002", 2)], general_discount_percent: None, general_discount_amount: Some(2.0), payment_method: "pix", client: None, credit_paid_now: 0.0, cancelled: false },
        SaleSpec { days_ago: 18, hour: 11, minute: 25, user_id: 2, lines: vec![line("L002", 1), line("E003", 1)], general_discount_percent: None, general_discount_amount: None, payment_method: "cash", client: None, credit_paid_now: 0.0, cancelled: false },
        // Cliente identificado numa venda à vista — opcional fora do
        // Crediário (ver `PaymentModal`), nunca conta pra `client_balance`.
        SaleSpec { days_ago: 17, hour: 14, minute: 30, user_id: 2, lines: vec![line("F005", 1), line("F001", 4)], general_discount_percent: None, general_discount_amount: None, payment_method: "cash", client: Some("Fernando Alves"), credit_paid_now: 0.0, cancelled: false },
        SaleSpec { days_ago: 15, hour: 16, minute: 15, user_id: 1, lines: vec![line("F003", 1)], general_discount_percent: None, general_discount_amount: None, payment_method: "credit", client: Some("Bruno Lima"), credit_paid_now: 0.0, cancelled: false },
        SaleSpec { days_ago: 12, hour: 9, minute: 50, user_id: 2, lines: vec![line("P001", 10), line("P003", 5)], general_discount_percent: None, general_discount_amount: None, payment_method: "pix", client: None, credit_paid_now: 0.0, cancelled: false },
        SaleSpec { days_ago: 10, hour: 12, minute: 0, user_id: 2, lines: vec![line("E004", 1)], general_discount_percent: None, general_discount_amount: None, payment_method: "credit", client: Some("Diego Rocha"), credit_paid_now: 0.0, cancelled: false },
        SaleSpec { days_ago: 9, hour: 13, minute: 30, user_id: 1, lines: vec![line("E004", 1), line("E006", 1)], general_discount_percent: None, general_discount_amount: None, payment_method: "card", client: None, credit_paid_now: 0.0, cancelled: false },
        // Same idea, higher-volume B2B-flavored purchase, Cartão instead of
        // Dinheiro — same client identification rule either way.
        SaleSpec { days_ago: 8, hour: 8, minute: 45, user_id: 1, lines: vec![line("F001", 15), line("E004", 6)], general_discount_percent: None, general_discount_amount: None, payment_method: "card", client: Some("Construtora Horizonte"), credit_paid_now: 0.0, cancelled: false },
        SaleSpec { days_ago: 7, hour: 15, minute: 40, user_id: 2, lines: vec![LineSpec { item_code: "F005", quantity: 1, discount_percent: Some(15.0), discount_amount: None }, line("F001", 1)], general_discount_percent: None, general_discount_amount: None, payment_method: "cash", client: None, credit_paid_now: 0.0, cancelled: false },
        SaleSpec { days_ago: 6, hour: 10, minute: 10, user_id: 1, lines: vec![line("X001", 2)], general_discount_percent: None, general_discount_amount: None, payment_method: "credit", client: Some("Carla Mendes"), credit_paid_now: 0.0, cancelled: false },
        SaleSpec { days_ago: 6, hour: 18, minute: 0, user_id: 2, lines: vec![line("P001", 4)], general_discount_percent: None, general_discount_amount: None, payment_method: "cash", client: None, credit_paid_now: 0.0, cancelled: false },
        SaleSpec { days_ago: 5, hour: 14, minute: 20, user_id: 2, lines: vec![line("L001", 3), line("P001", 2)], general_discount_percent: None, general_discount_amount: None, payment_method: "pix", client: None, credit_paid_now: 0.0, cancelled: false },
        SaleSpec { days_ago: 4, hour: 11, minute: 5, user_id: 1, lines: vec![line("E002", 3)], general_discount_percent: None, general_discount_amount: None, payment_method: "card", client: None, credit_paid_now: 0.0, cancelled: false },
        SaleSpec { days_ago: 3, hour: 10, minute: 30, user_id: 1, lines: vec![line("P001", 1)], general_discount_percent: None, general_discount_amount: None, payment_method: "pix", client: None, credit_paid_now: 0.0, cancelled: false },
        SaleSpec { days_ago: 3, hour: 16, minute: 50, user_id: 2, lines: vec![line("P002", 1), line("P003", 2)], general_discount_percent: None, general_discount_amount: None, payment_method: "cash", client: None, credit_paid_now: 0.0, cancelled: true },
        SaleSpec { days_ago: 2, hour: 9, minute: 15, user_id: 1, lines: vec![line("E006", 1), line("F003", 1)], general_discount_percent: None, general_discount_amount: None, payment_method: "credit", client: Some("Elaine Costa"), credit_paid_now: 20.0, cancelled: false },
        SaleSpec { days_ago: 1, hour: 17, minute: 30, user_id: 2, lines: vec![line("F002", 2), line("L001", 2)], general_discount_percent: None, general_discount_amount: None, payment_method: "cash", client: None, credit_paid_now: 0.0, cancelled: false },
        SaleSpec { days_ago: 0, hour: 10, minute: 0, user_id: 1, lines: vec![line("P001", 4), line("X002", 1)], general_discount_percent: None, general_discount_amount: None, payment_method: "pix", client: None, credit_paid_now: 0.0, cancelled: false },
        SaleSpec { days_ago: 0, hour: 15, minute: 45, user_id: 2, lines: vec![line("E001", 1)], general_discount_percent: None, general_discount_amount: None, payment_method: "card", client: None, credit_paid_now: 0.0, cancelled: false },
    ]
}

/// One extra Crediário settlement per debtor, days after their sale — gives
/// Clientes/Relatórios a mix of fully open, partially paid, and (Diego,
/// seeded directly below, not through a `SaleSpec`) fully quitado clients.
fn extra_payments() -> Vec<PaymentSpec> {
    vec![
        PaymentSpec { client: "Bruno Lima", credit_sale_index: 0, days_after_sale: 4, amount: 5.0 },
        PaymentSpec { client: "Ana Souza", credit_sale_index: 0, days_after_sale: 10, amount: 20.0 },
        // Quitado in full — the one client whose Crediário history is fully paid off, to demo Clientes' "Mostrar apenas com saldo em aberto" filter (unchecked by default, so this client shows up in the plain list too).
        PaymentSpec { client: "Diego Rocha", credit_sale_index: 0, days_after_sale: 3, amount: 9.5 },
    ]
}

fn main() {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let default_path: PathBuf = PathBuf::from(manifest_dir).join("..").join("demo").join("stockly-demonstration.db");
    let out_path = std::env::args().nth(1).map(PathBuf::from).unwrap_or(default_path);

    if out_path.exists() {
        std::fs::remove_file(&out_path).expect("falha ao remover o .db anterior");
    }
    // `open_connection` also removes/ignores a stale `-wal`/`-shm` sidecar
    // from a previous run only if SQLite itself does on open; clean up any
    // leftovers by hand so a re-run always starts from a clean slate.
    for ext in ["-wal", "-shm"] {
        let sidecar = out_path.with_extension(format!("db{ext}"));
        let _ = std::fs::remove_file(sidecar);
    }
    std::fs::create_dir_all(out_path.parent().unwrap()).expect("falha ao criar a pasta demo/");

    let conn = db::open_connection(out_path.clone()).expect("falha ao inicializar o schema");

    let admin_id = seed_user(&conn, "Admin Demo", true);
    let user_id = seed_user(&conn, "Usuário Demo", false);
    assert_eq!(admin_id, 1);
    assert_eq!(user_id, 2);

    let category_ids = seed_categories(&conn);
    let item_ids = seed_items(&conn, &category_ids);
    let client_ids = seed_clients(&conn);

    let credit_sale_ids = seed_sales(&conn, &item_ids, &client_ids);
    seed_extra_payments(&conn, &client_ids, &credit_sale_ids);

    seed_config(&conn);
    db::seed_default_dashboard_layout(&conn, admin_id).expect("falha ao semear o layout padrão do dashboard");

    println!("Banco de demonstração gerado em: {}", out_path.display());
    println!("Login: Admin Demo / Usuário Demo — senha \"{DEMO_PASSWORD}\" para ambos.");
}

fn seed_user(conn: &Connection, name: &str, is_admin: bool) -> i64 {
    let hash = bcrypt::hash(DEMO_PASSWORD, bcrypt::DEFAULT_COST).expect("falha ao gerar hash bcrypt");
    let username = if is_admin { "admin_demo" } else { "user_demo" };
    conn.execute(
        "INSERT INTO users (name, username, password_hash, is_admin, active, last_login_at)
         VALUES (?1, ?2, ?3, ?4, 1, datetime('now'))",
        params![name, username, hash, is_admin as i64],
    )
    .expect("falha ao inserir usuário");
    conn.last_insert_rowid()
}

fn seed_categories(conn: &Connection) -> std::collections::HashMap<&'static str, i64> {
    let mut ids = std::collections::HashMap::new();
    for name in ["Ferragens", "Elétrica", "Papelaria", "Limpeza"] {
        conn.execute("INSERT INTO categories (name) VALUES (?1)", params![name]).expect("falha ao inserir categoria");
        ids.insert(name, conn.last_insert_rowid());
    }
    ids
}

fn seed_items(conn: &Connection, category_ids: &std::collections::HashMap<&'static str, i64>) -> std::collections::HashMap<&'static str, i64> {
    let mut ids = std::collections::HashMap::new();
    for spec in items() {
        let category_id = spec.category.map(|c| category_ids[c]);
        conn.execute(
            "INSERT INTO items (code, name, category_id, cost_price, sale_price, quantity, min_quantity, active)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)",
            params![spec.code, spec.name, category_id, spec.cost_price, spec.sale_price, spec.quantity, spec.min_quantity],
        )
        .expect("falha ao inserir item");
        let item_id = conn.last_insert_rowid();
        ids.insert(spec.code, item_id);
        if spec.quantity > 0 {
            conn.execute(
                "INSERT INTO stock_movements (item_id, movement_type, quantity_delta, user_id, created_at)
                 VALUES (?1, 'initial', ?2, 1, datetime('now'))",
                params![item_id, spec.quantity],
            )
            .expect("falha ao inserir movimentação inicial de estoque");
        }
        // Mirrors `create_item`'s own unconditional initial price-history row.
        conn.execute(
            "INSERT INTO item_price_history (item_id, cost_price, sale_price, user_id, created_at)
             VALUES (?1, ?2, ?3, 1, datetime('now'))",
            params![item_id, spec.cost_price, spec.sale_price],
        )
        .expect("falha ao inserir histórico inicial de preço");
    }
    ids
}

fn seed_clients(conn: &Connection) -> std::collections::HashMap<&'static str, i64> {
    let mut ids = std::collections::HashMap::new();
    for spec in clients() {
        let reminder_date = spec.reminder_offset.map(|offset| (Local::now() + Duration::days(offset)).format("%Y-%m-%d").to_string());
        let note = if spec.note.is_empty() { None } else { Some(spec.note) };
        let (document_type, document_number) = spec.document.map_or((None, None), |(t, n)| (Some(t), Some(n)));
        conn.execute(
            "INSERT INTO clients (name, phone, reminder_date, note, birth_date, document_type, document_number) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![spec.name, spec.phone, reminder_date, note, spec.birth_date, document_type, document_number],
        )
        .expect("falha ao inserir cliente");
        ids.insert(spec.name, conn.last_insert_rowid());
    }
    ids
}

/// Returns, per client name, the sale ids of every Crediário sale created
/// for them, in creation order — `extra_payments()` targets these by index.
fn seed_sales(
    conn: &Connection,
    item_ids: &std::collections::HashMap<&'static str, i64>,
    client_ids: &std::collections::HashMap<&'static str, i64>,
) -> std::collections::HashMap<&'static str, Vec<i64>> {
    let mut credit_sale_ids: std::collections::HashMap<&'static str, Vec<i64>> = std::collections::HashMap::new();
    let mut next_sequential: i64 = 1;

    for spec in sales() {
        let (created_at, local_date) = local_moment(spec.days_ago, spec.hour, spec.minute);
        let receipt_number = format!("{}{:06}", local_date.format("%Y%m%d"), next_sequential);
        let sequential = next_sequential;
        next_sequential += 1;

        // Clamp every line's quantity to whatever stock is actually left —
        // makes the hand-written quantities above safe regardless of how
        // many earlier sales already drew from the same item.
        let mut prepared: Vec<(i64, &str, String, f64, i64, Option<f64>, Option<f64>, f64)> = Vec::new();
        for l in &spec.lines {
            let item_id = item_ids[l.item_code];
            let (name, price, available): (String, f64, i64) = conn
                .query_row("SELECT name, sale_price, quantity FROM items WHERE id = ?1", params![item_id], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?))
                })
                .unwrap();
            let quantity = l.quantity.min(available);
            if quantity <= 0 {
                continue;
            }
            let gross = round2(price * quantity as f64);
            let discount_value = l.discount_amount.unwrap_or_else(|| l.discount_percent.map(|p| round2(gross * p / 100.0)).unwrap_or(0.0));
            let subtotal = round2(gross - discount_value);
            prepared.push((item_id, l.item_code, name, price, quantity, l.discount_percent, l.discount_amount, subtotal));
        }
        if prepared.is_empty() {
            continue;
        }

        let subtotal_total = round2(prepared.iter().map(|p| p.7).sum());
        let general_discount_value = spec
            .general_discount_amount
            .unwrap_or_else(|| spec.general_discount_percent.map(|p| round2(subtotal_total * p / 100.0)).unwrap_or(0.0));
        let total = round2(subtotal_total - general_discount_value);

        let has_discount = spec.general_discount_percent.is_some()
            || spec.general_discount_amount.is_some()
            || prepared.iter().any(|p| p.5.is_some() || p.6.is_some());
        // Only one Admin exists in this demo dataset, so it's always the
        // authorizer when the registering user isn't already an Admin —
        // same shape as `resolve_admin_authorization`, just resolved by hand.
        let discount_authorized_by = if has_discount { Some(1_i64) } else { None };
        let discount_authorized_at = discount_authorized_by.map(|_| created_at.clone());

        let client_id = spec.client.map(|c| client_ids[c]);

        conn.execute(
            "INSERT INTO sales (receipt_sequential, receipt_number, user_id, client_id, subtotal, discount_percent, discount_amount,
                discount_authorized_by_user_id, discount_authorized_at, total, status, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'completed', ?11)",
            params![
                sequential,
                receipt_number,
                spec.user_id,
                client_id,
                subtotal_total,
                spec.general_discount_percent,
                spec.general_discount_amount,
                discount_authorized_by,
                discount_authorized_at,
                total,
                created_at,
            ],
        )
        .expect("falha ao inserir venda");
        let sale_id = conn.last_insert_rowid();

        for (item_id, code, name, price, quantity, disc_pct, disc_amt, line_subtotal) in &prepared {
            conn.execute(
                "INSERT INTO sale_items (sale_id, item_id, item_code, item_name, unit_price, quantity, discount_percent, discount_amount, subtotal)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![sale_id, item_id, code, name, price, quantity, disc_pct, disc_amt, line_subtotal],
            )
            .expect("falha ao inserir item da venda");
            conn.execute(
                "INSERT INTO stock_movements (item_id, movement_type, quantity_delta, sale_id, user_id, created_at)
                 VALUES (?1, 'sale', ?2, ?3, ?4, ?5)",
                params![item_id, -quantity, sale_id, spec.user_id, created_at],
            )
            .expect("falha ao inserir movimentação de estoque da venda");
            conn.execute("UPDATE items SET quantity = quantity - ?1 WHERE id = ?2", params![quantity, item_id])
                .expect("falha ao atualizar estoque");
        }

        conn.execute(
            "INSERT INTO sale_payments (sale_id, payment_method, amount) VALUES (?1, ?2, ?3)",
            params![sale_id, spec.payment_method, total],
        )
        .expect("falha ao inserir pagamento da venda");

        if spec.payment_method == "credit" {
            let name = spec.client.expect("venda em crediário precisa de cliente");
            credit_sale_ids.entry(name).or_default().push(sale_id);
            if spec.credit_paid_now > 0.0 {
                let client_id = client_ids[name];
                conn.execute(
                    "INSERT INTO credit_payments (client_id, amount, user_id, created_at) VALUES (?1, ?2, ?3, ?4)",
                    params![client_id, round2(spec.credit_paid_now), spec.user_id, created_at],
                )
                .expect("falha ao inserir pagamento inicial de crediário");
                let payment_id = conn.last_insert_rowid();
                conn.execute(
                    "INSERT INTO credit_payment_allocations (payment_id, sale_id, amount) VALUES (?1, ?2, ?3)",
                    params![payment_id, sale_id, round2(spec.credit_paid_now)],
                )
                .expect("falha ao inserir alocação de pagamento");
            }
        }

        if spec.cancelled {
            let (cancelled_at, _) = local_moment(spec.days_ago.max(0), spec.hour, (spec.minute + 30).min(59));
            conn.execute(
                "UPDATE sales SET status = 'cancelled', cancelled_at = ?1, cancelled_by_user_id = ?2, cancel_authorized_by_user_id = 1 WHERE id = ?3",
                params![cancelled_at, spec.user_id, sale_id],
            )
            .expect("falha ao cancelar venda");
            for (item_id, _, _, _, quantity, _, _, _) in &prepared {
                conn.execute(
                    "INSERT INTO stock_movements (item_id, movement_type, quantity_delta, sale_id, user_id, created_at)
                     VALUES (?1, 'refund', ?2, ?3, 1, ?4)",
                    params![item_id, quantity, sale_id, cancelled_at],
                )
                .expect("falha ao inserir estorno de estoque");
                conn.execute("UPDATE items SET quantity = quantity + ?1 WHERE id = ?2", params![quantity, item_id])
                    .expect("falha ao devolver estoque");
            }
        }
    }

    credit_sale_ids
}

fn seed_extra_payments(
    conn: &Connection,
    client_ids: &std::collections::HashMap<&'static str, i64>,
    credit_sale_ids: &std::collections::HashMap<&'static str, Vec<i64>>,
) {
    for spec in extra_payments() {
        let Some(sale_ids) = credit_sale_ids.get(spec.client) else { continue };
        let Some(&sale_id) = sale_ids.get(spec.credit_sale_index) else { continue };
        let created_at: String = conn.query_row("SELECT created_at FROM sales WHERE id = ?1", params![sale_id], |row| row.get(0)).unwrap();
        let naive = chrono::NaiveDateTime::parse_from_str(&created_at, "%Y-%m-%d %H:%M:%S").expect("created_at sempre nesse formato");
        let sale_local: NaiveDate = Utc.from_utc_datetime(&naive).with_timezone(&Local).date_naive();
        let days_ago = (Local::now().date_naive() - sale_local).num_days() - spec.days_after_sale;
        let (payment_created_at, _) = local_moment(days_ago.max(0), 12, 0);

        let client_id = client_ids[spec.client];
        conn.execute(
            "INSERT INTO credit_payments (client_id, amount, user_id, created_at) VALUES (?1, ?2, 2, ?3)",
            params![client_id, round2(spec.amount), payment_created_at],
        )
        .expect("falha ao inserir pagamento avulso de crediário");
        let payment_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO credit_payment_allocations (payment_id, sale_id, amount) VALUES (?1, ?2, ?3)",
            params![payment_id, sale_id, round2(spec.amount)],
        )
        .expect("falha ao inserir alocação de pagamento avulso");
    }
}

fn seed_config(conn: &Connection) {
    let rows: &[(&str, &str)] = &[
        ("store_name", "Loja Demonstração"),
        ("store_info", "CNPJ: 00.000.000/0001-00\n(11) 4000-0000"),
        ("receipt_thank_you_message", "Obrigado pela preferência!"),
        ("low_stock_warning_percent", "20"),
        ("default_profit_margin_percent", "30"),
        ("credit_enabled", "1"),
    ];
    for (key, value) in rows {
        conn.execute("INSERT INTO config (key, value) VALUES (?1, ?2)", params![key, value]).expect("falha ao inserir config");
    }
}
