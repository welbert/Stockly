use crate::guard::{active_user_id, resolve_admin_authorization};
use crate::models::{SaleDetail, SaleItemDetail, SaleItemInput};
use crate::money::round2;
use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

const VALID_PAYMENT_METHODS: &[&str] = &["cash", "card", "pix", "credit"];

struct PreparedLine {
    item_id: i64,
    item_code: String,
    item_name: String,
    unit_price: f64,
    quantity: i64,
    discount_percent: Option<f64>,
    discount_amount: Option<f64>,
    subtotal: f64,
}

/// Re-fetches code/name/price/active/quantity fresh from `items` — never
/// trusts what the frontend sends beyond `item_id`/`quantity`/discount.
fn prepare_line(conn: &Connection, input: &SaleItemInput) -> Result<PreparedLine, String> {
    if input.quantity <= 0 {
        return Err("Quantidade deve ser maior que zero".to_string());
    }
    let (code, name, unit_price, active, available): (String, String, f64, i64, i64) = conn
        .query_row(
            "SELECT code, name, sale_price, active, quantity FROM items WHERE id = ?1",
            params![input.item_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .map_err(|_| "Item não encontrado".to_string())?;
    if active == 0 {
        return Err(format!("Item '{name}' está desativado"));
    }
    if input.quantity > available {
        return Err(format!("Estoque insuficiente para '{name}' (disponível: {available})"));
    }
    if let Some(pct) = input.discount_percent {
        if !(0.0..=100.0).contains(&pct) {
            return Err(format!("Desconto de '{name}' deve estar entre 0% e 100%"));
        }
    }
    if let Some(amt) = input.discount_amount {
        if amt < 0.0 {
            return Err(format!("Desconto de '{name}' não pode ser negativo"));
        }
    }
    let gross = round2(unit_price * input.quantity as f64);
    let discount_value = if let Some(amt) = input.discount_amount {
        amt
    } else if let Some(pct) = input.discount_percent {
        round2(gross * pct / 100.0)
    } else {
        0.0
    };
    if discount_value > gross {
        return Err(format!("Desconto de '{name}' não pode ser maior que o valor do item"));
    }
    Ok(PreparedLine {
        item_id: input.item_id,
        item_code: code,
        item_name: name,
        unit_price,
        quantity: input.quantity,
        discount_percent: input.discount_percent,
        discount_amount: if discount_value > 0.0 { Some(discount_value) } else { None },
        subtotal: round2(gross - discount_value),
    })
}

fn fetch_sale_items(conn: &Connection, sale_id: i64) -> Result<Vec<SaleItemDetail>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT item_id, item_code, item_name, unit_price, quantity, discount_percent, discount_amount, subtotal
             FROM sale_items WHERE sale_id = ?1 ORDER BY id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![sale_id], |row| {
            Ok(SaleItemDetail {
                item_id: row.get(0)?,
                item_code: row.get(1)?,
                item_name: row.get(2)?,
                unit_price: row.get(3)?,
                quantity: row.get(4)?,
                discount_percent: row.get(5)?,
                discount_amount: row.get(6)?,
                subtotal: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub(crate) fn fetch_sale_detail(
    conn: &Connection,
    sale_id: i64,
    receipt_pdf_path: Option<String>,
) -> Result<SaleDetail, String> {
    #[allow(clippy::type_complexity)]
    let (
        receipt_number,
        user_id,
        user_name,
        subtotal,
        discount_percent,
        discount_amount,
        discount_authorized_by_name,
        total,
        status,
        client_id,
        client_name,
        created_at,
    ): (
        String,
        i64,
        String,
        f64,
        Option<f64>,
        Option<f64>,
        Option<String>,
        f64,
        String,
        Option<i64>,
        Option<String>,
        String,
    ) = conn
        .query_row(
            "SELECT s.receipt_number, s.user_id, u.name, s.subtotal, s.discount_percent, s.discount_amount, a.name, s.total, s.status, s.client_id, c.name, s.created_at
             FROM sales s
             JOIN users u ON u.id = s.user_id
             LEFT JOIN users a ON a.id = s.discount_authorized_by_user_id
             LEFT JOIN clients c ON c.id = s.client_id
             WHERE s.id = ?1",
            params![sale_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                    row.get(8)?,
                    row.get(9)?,
                    row.get(10)?,
                    row.get(11)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;

    let payment_method: String = conn
        .query_row("SELECT payment_method FROM sale_payments WHERE sale_id = ?1 LIMIT 1", params![sale_id], |row| {
            row.get(0)
        })
        .map_err(|e| e.to_string())?;

    let credit_paid_now: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(amount), 0) FROM credit_payments WHERE sale_id = ?1 AND cancelled_at IS NULL",
            params![sale_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let credit_paid_now = if credit_paid_now > 0.0 { Some(credit_paid_now) } else { None };

    let items = fetch_sale_items(conn, sale_id)?;

    Ok(SaleDetail {
        id: sale_id,
        receipt_number,
        user_id,
        user_name,
        subtotal,
        discount_percent,
        discount_amount,
        discount_authorized_by_name,
        total,
        status,
        payment_method,
        client_id,
        client_name,
        credit_paid_now,
        created_at,
        items,
        receipt_pdf_path,
    })
}

/// Read-only sale lookup — used by "Ver venda" (Devedores' linked-sale
/// detail), which doesn't need a fresh PDF, just the stored facts.
#[tauri::command]
pub fn get_sale_detail(state: State<AppState>, sale_id: i64) -> Result<SaleDetail, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;
    fetch_sale_detail(&conn, sale_id, None)
}

/// The core PDV action: validates stock, computes subtotal/discounts/total
/// server-side (never trusts a frontend-computed total), commits venda +
/// baixa de estoque + numeração do recibo atomically, then makes a
/// best-effort attempt at the receipt PDF *outside* that transaction — a
/// failure there never invalidates the sale, since the sale already
/// committed with its receipt number and the PDF can be regenerated later
/// on demand via `regenerate_receipt_pdf`.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_sale(
    state: State<AppState>,
    items: Vec<SaleItemInput>,
    discount_percent: Option<f64>,
    discount_amount: Option<f64>,
    discount_authorizer_id: Option<i64>,
    discount_authorizer_password: Option<String>,
    payment_method: String,
    client_id: Option<i64>,
    // Only meaningful when `payment_method == "credit"` — the customer
    // already has part of the money on hand, so a `credit_payments` row is
    // recorded in the same transaction as the sale, immediately reducing
    // the open balance below the full `total`.
    credit_paid_now: Option<f64>,
) -> Result<SaleDetail, String> {
    if items.is_empty() {
        return Err("A venda precisa ter pelo menos um item".to_string());
    }
    if !VALID_PAYMENT_METHODS.contains(&payment_method.as_str()) {
        return Err("Forma de pagamento inválida".to_string());
    }
    let client_id = if payment_method == "credit" { client_id } else { None };
    if payment_method == "credit" && client_id.is_none() {
        return Err("Selecione um cliente para Crediário".to_string());
    }
    let credit_paid_now = if payment_method == "credit" { credit_paid_now.filter(|v| *v > 0.0) } else { None };

    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    let cashier_id = active_user_id(&state)?;

    if let Some(id) = client_id {
        let exists: Option<i64> =
            conn.query_row("SELECT id FROM clients WHERE id = ?1", params![id], |row| row.get(0)).optional().map_err(|e| e.to_string())?;
        if exists.is_none() {
            return Err("Cliente não encontrado".to_string());
        }
    }

    let prepared: Vec<PreparedLine> = items.iter().map(|i| prepare_line(&conn, i)).collect::<Result<_, _>>()?;
    let subtotal_total = round2(prepared.iter().map(|l| l.subtotal).sum());

    if let Some(pct) = discount_percent {
        if !(0.0..=100.0).contains(&pct) {
            return Err("Desconto geral deve estar entre 0% e 100%".to_string());
        }
    }
    if let Some(amt) = discount_amount {
        if amt < 0.0 {
            return Err("Desconto geral não pode ser negativo".to_string());
        }
    }
    let general_discount_value = if let Some(amt) = discount_amount {
        amt
    } else if let Some(pct) = discount_percent {
        round2(subtotal_total * pct / 100.0)
    } else {
        0.0
    };
    if general_discount_value > subtotal_total {
        return Err("Desconto geral não pode ser maior que o subtotal".to_string());
    }
    let total = round2(subtotal_total - general_discount_value);
    let general_discount_amount = if general_discount_value > 0.0 { Some(general_discount_value) } else { None };
    let credit_paid_now = credit_paid_now.map(round2);
    if let Some(paid) = credit_paid_now {
        // Strictly less than `total`, never equal: a Crediário sale is
        // supposed to leave an open balance — paying it off in full at the
        // same moment belongs to a different payment method entirely (cash,
        // card, PIX), not this one.
        if paid >= total {
            return Err(
                "Valor pago agora deve ser menor que o total da venda — para pagamento total, escolha outra forma de pagamento"
                    .to_string(),
            );
        }
    }

    let has_discount =
        general_discount_amount.is_some() || prepared.iter().any(|l| l.discount_amount.is_some());
    let discount_authorized_by = if has_discount {
        Some(resolve_admin_authorization(&state, &conn, discount_authorizer_id, discount_authorizer_password.as_deref())?)
    } else {
        None
    };
    let discount_authorized_at =
        discount_authorized_by.map(|_| chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string());

    let today = chrono::Local::now().format("%Y%m%d").to_string();

    let sale_id = {
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        let next_sequential: i64 = tx
            .query_row("SELECT COALESCE(MAX(receipt_sequential), 0) + 1 FROM sales", [], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        let receipt_number = format!("{today}{next_sequential:06}");

        tx.execute(
            "INSERT INTO sales (receipt_sequential, receipt_number, user_id, client_id, subtotal, discount_percent, discount_amount, discount_authorized_by_user_id, discount_authorized_at, total, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'completed')",
            params![
                next_sequential,
                receipt_number,
                cashier_id,
                client_id,
                subtotal_total,
                discount_percent,
                general_discount_amount,
                discount_authorized_by,
                discount_authorized_at,
                total,
            ],
        )
        .map_err(|e| e.to_string())?;
        let sale_id = tx.last_insert_rowid();

        for line in &prepared {
            tx.execute("UPDATE items SET quantity = quantity - ?1 WHERE id = ?2", params![line.quantity, line.item_id])
                .map_err(|e| e.to_string())?;
            tx.execute(
                "INSERT INTO stock_movements (item_id, movement_type, quantity_delta, sale_id, user_id) VALUES (?1, 'sale', ?2, ?3, ?4)",
                params![line.item_id, -line.quantity, sale_id, cashier_id],
            )
            .map_err(|e| e.to_string())?;
        }

        for line in &prepared {
            tx.execute(
                "INSERT INTO sale_items (sale_id, item_id, item_code, item_name, unit_price, quantity, discount_percent, discount_amount, subtotal)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    sale_id,
                    line.item_id,
                    line.item_code,
                    line.item_name,
                    line.unit_price,
                    line.quantity,
                    line.discount_percent,
                    line.discount_amount,
                    line.subtotal
                ],
            )
            .map_err(|e| e.to_string())?;
        }

        tx.execute(
            "INSERT INTO sale_payments (sale_id, payment_method, amount) VALUES (?1, ?2, ?3)",
            params![sale_id, payment_method, total],
        )
        .map_err(|e| e.to_string())?;

        if let Some(paid) = credit_paid_now {
            tx.execute(
                "INSERT INTO credit_payments (client_id, amount, user_id, sale_id) VALUES (?1, ?2, ?3, ?4)",
                params![client_id.unwrap(), paid, cashier_id, sale_id],
            )
            .map_err(|e| e.to_string())?;
        }

        tx.commit().map_err(|e| e.to_string())?;
        sale_id
    };

    let receipt_pdf_path = super::receipts::render_receipt_pdf(&conn, sale_id, &super::receipts::receipts_dir(&state.db_path))
        .ok()
        .map(|p| p.to_string_lossy().to_string());

    fetch_sale_detail(&conn, sale_id, receipt_pdf_path)
}
