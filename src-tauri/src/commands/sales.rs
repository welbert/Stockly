use super::clients::client_balance;
use crate::csv_util;
use crate::guard::{active_user_id, resolve_admin_authorization};
use crate::models::{ReportPdfStatInput, SaleCsvRow, SaleDetail, SaleItemDetail, SaleItemInput, SaleListItem};
use crate::money::{fmt_money, round2};
use crate::pdf_util::{self, fmt_discount, ReportPdfStat, ReportPdfTable};
use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::Path;
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
        cancelled_at,
        cancelled_by_name,
        cancel_authorized_by_name,
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
        Option<String>,
        Option<String>,
        Option<String>,
        String,
    ) = conn
        .query_row(
            "SELECT s.receipt_number, s.user_id, u.name, s.subtotal, s.discount_percent, s.discount_amount, a.name, s.total, s.status, s.client_id, c.name, s.cancelled_at, cb.name, ca.name, s.created_at
             FROM sales s
             JOIN users u ON u.id = s.user_id
             LEFT JOIN users a ON a.id = s.discount_authorized_by_user_id
             LEFT JOIN clients c ON c.id = s.client_id
             LEFT JOIN users cb ON cb.id = s.cancelled_by_user_id
             LEFT JOIN users ca ON ca.id = s.cancel_authorized_by_user_id
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
                    row.get(12)?,
                    row.get(13)?,
                    row.get(14)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;

    let payment_method: String = conn
        .query_row("SELECT payment_method FROM sale_payments WHERE sale_id = ?1 LIMIT 1", params![sale_id], |row| {
            row.get(0)
        })
        .map_err(|e| e.to_string())?;

    let credit_paid: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(cpa.amount), 0) FROM credit_payment_allocations cpa
             JOIN credit_payments cp ON cp.id = cpa.payment_id
             WHERE cpa.sale_id = ?1 AND cp.cancelled_at IS NULL",
            params![sale_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let credit_paid = if credit_paid > 0.0 { Some(credit_paid) } else { None };

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
        credit_paid,
        cancelled_at,
        cancelled_by_name,
        cancel_authorized_by_name,
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

/// Every sale ever, newest first — any logged-in profile. Frontend filters by
/// date range/receipt/cliente/operador client-side (same "fetch everything,
/// filter in the component" convention as Estoque/Devedores). Line items
/// aren't included here — that's a separate `get_sale_detail` round-trip once
/// a specific sale is opened, so this listing stays light even as sales pile
/// up over time.
#[tauri::command]
pub fn list_sales(state: State<AppState>) -> Result<Vec<SaleListItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.receipt_number, s.created_at, u.name, c.name, sp.payment_method, s.total, s.status,
                    COALESCE((SELECT SUM(si.unit_price * si.quantity) FROM sale_items si WHERE si.sale_id = s.id), 0) - s.total
             FROM sales s
             JOIN users u ON u.id = s.user_id
             LEFT JOIN clients c ON c.id = s.client_id
             JOIN sale_payments sp ON sp.sale_id = s.id
             ORDER BY s.created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(SaleListItem {
                id: row.get(0)?,
                receipt_number: row.get(1)?,
                created_at: row.get(2)?,
                user_name: row.get(3)?,
                client_name: row.get(4)?,
                payment_method: row.get(5)?,
                total: row.get(6)?,
                status: row.get(7)?,
                discount_value: round2(row.get(8)?),
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// The actual on-disk shape of a sales CSV row — Portuguese headers via
/// `rename`, same reasoning and split as `commands::items::ItemCsvFileRow`:
/// kept separate from `SaleCsvRow` (the JSON/IPC shape the frontend already
/// sends, camelCase) so a header chosen for the spreadsheet never leaks into
/// what the frontend has to parse. Values are pre-formatted strings/plain
/// numbers, not raw codes — the frontend already shaped them for display
/// (`toSaleCsvRows` in `src/lib/api.ts`), since this export is a read-only
/// artifact for the shop owner (no re-import counterpart, unlike Estoque's).
#[derive(Serialize)]
struct SaleCsvFileRow {
    #[serde(rename = "recibo")]
    receipt_number: String,
    #[serde(rename = "data")]
    created_at: String,
    #[serde(rename = "cliente")]
    client_name: String,
    #[serde(rename = "operador")]
    user_name: String,
    #[serde(rename = "forma_pagamento")]
    payment_method: String,
    #[serde(rename = "desconto")]
    discount: f64,
    #[serde(rename = "total")]
    total: f64,
    #[serde(rename = "status")]
    status: String,
}

impl From<&SaleCsvRow> for SaleCsvFileRow {
    fn from(row: &SaleCsvRow) -> Self {
        Self {
            receipt_number: row.receipt_number.clone(),
            created_at: row.created_at.clone(),
            client_name: row.client_name.clone(),
            user_name: row.user_name.clone(),
            payment_method: row.payment_method.clone(),
            discount: row.discount,
            total: row.total,
            status: row.status.clone(),
        }
    }
}

/// Any logged-in profile — same access as `list_sales`, which both
/// `SalesHistoryPage` and the Admin-only `VendasPorPeriodoPage` already call;
/// this just writes whatever rows the caller already filtered/formatted on
/// screen to `path` (already chosen via the frontend's save dialog). No DB
/// access needed: the rows travel in the call, this command only owns the
/// CSV file mechanics (delimiter, BOM, headers — see `csv_util`).
#[tauri::command]
pub fn export_sales_csv(state: State<AppState>, path: String, rows: Vec<SaleCsvRow>) -> Result<(), String> {
    active_user_id(&state)?;
    let file_rows: Vec<SaleCsvFileRow> = rows.iter().map(SaleCsvFileRow::from).collect();
    csv_util::write_csv(Path::new(&path), &file_rows)
}

/// The PDF counterpart of `export_sales_csv` — same rows, same access (any
/// logged-in profile), no DB access needed. Built on `pdf_util::write_report_pdf`
/// (the generic "stat summary + table" report layout — see its own doc
/// comment for why it deliberately doesn't try to reproduce the on-screen
/// chart). `title`/`subtitle`/`stats` are whatever the calling report screen
/// already has on hand (its header text and stat cards) — this command only
/// owns the PDF file mechanics, same division of responsibility as the CSV export.
#[tauri::command]
pub fn export_sales_report_pdf(
    state: State<AppState>,
    path: String,
    title: String,
    subtitle: String,
    stats: Vec<ReportPdfStatInput>,
    rows: Vec<SaleCsvRow>,
) -> Result<(), String> {
    active_user_id(&state)?;
    let pdf_stats: Vec<ReportPdfStat> =
        stats.into_iter().map(|s| ReportPdfStat { label: s.label, value: s.value }).collect();
    let table = ReportPdfTable {
        headers: vec![
            "Recibo".into(),
            "Data".into(),
            "Cliente".into(),
            "Operador".into(),
            "Pagamento".into(),
            "Desconto".into(),
            "Total".into(),
            "Status".into(),
        ],
        // Not proportional to header length — "Recibo" is always exactly 14
        // digits with no space to wrap at (`{yyyyMMdd}{6-digit sequential}`,
        // see `create_sale`), so it needs real room at `write_report_pdf`'s
        // 7pt table font: a `Paragraph` that can't fit an unbreakable word
        // drops it silently instead of overflowing the cell, so a column
        // even ~1mm too narrow here would blank out receipt numbers rather
        // than just look cramped. "Data" (e.g. "17/09/2026, 15:53") is the
        // next-widest realistic cell, but has a wrap point (the comma), so
        // it degrades gracefully onto two lines if it ever doesn't fit.
        column_weights: vec![6, 8, 5, 5, 4, 4, 4, 4],
        rows: rows
            .iter()
            .map(|r| {
                vec![
                    r.receipt_number.clone(),
                    r.created_at.clone(),
                    if r.client_name.is_empty() { "—".to_string() } else { r.client_name.clone() },
                    r.user_name.clone(),
                    r.payment_method.clone(),
                    fmt_discount(r.discount),
                    fmt_money(r.total),
                    r.status.clone(),
                ]
            })
            .collect(),
    };
    pdf_util::write_report_pdf(Path::new(&path), &title, &subtitle, &pdf_stats, &table)
}

/// Cancels/estorna a completed sale — never deletes it, flips `status` to
/// `cancelled` and fills the `cancelled_*`/`cancel_authorized_*` columns.
/// Same admin-authorization pattern as discount/cancel-payment
/// (`resolve_admin_authorization`): self-authorizes if the active session is
/// already Admin, otherwise needs a *different* admin's password. Reverses
/// the stock decrement (`refund`-type `stock_movements` rows) for every line
/// whose item still exists.
///
/// Never touches `credit_payments`/`credit_payment_allocations`, even if this
/// was a Crediário sale that already had money applied to it (at sale time or
/// later, via Devedores): that amount simply becomes floating credit for the
/// client once this sale drops out of the completed-sales sum behind
/// `client_balance` — decided over auto-reversing it (a prior version of this
/// command did auto-cancel a "Valor pago agora" down payment here, to avoid
/// exactly this negative/credit balance).
#[tauri::command]
pub fn cancel_sale(
    state: State<AppState>,
    sale_id: i64,
    authorizer_id: Option<i64>,
    authorizer_password: Option<String>,
) -> Result<SaleDetail, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    let requester_id = active_user_id(&state)?;

    let status: String = conn
        .query_row("SELECT status FROM sales WHERE id = ?1", params![sale_id], |row| row.get(0))
        .map_err(|_| "Venda não encontrada".to_string())?;
    if status != "completed" {
        return Err("Venda já está cancelada".to_string());
    }

    let authorized_by = resolve_admin_authorization(&state, &conn, authorizer_id, authorizer_password.as_deref())?;

    {
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        let items: Vec<(i64, i64)> = {
            let mut stmt = tx
                .prepare("SELECT item_id, quantity FROM sale_items WHERE sale_id = ?1 AND item_id IS NOT NULL")
                .map_err(|e| e.to_string())?;
            let rows = stmt.query_map(params![sale_id], |row| Ok((row.get(0)?, row.get(1)?))).map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
        };
        for (item_id, quantity) in items {
            tx.execute("UPDATE items SET quantity = quantity + ?1 WHERE id = ?2", params![quantity, item_id])
                .map_err(|e| e.to_string())?;
            tx.execute(
                "INSERT INTO stock_movements (item_id, movement_type, quantity_delta, sale_id, user_id) VALUES (?1, 'refund', ?2, ?3, ?4)",
                params![item_id, quantity, sale_id, requester_id],
            )
            .map_err(|e| e.to_string())?;
        }

        tx.execute(
            "UPDATE sales SET status = 'cancelled', cancelled_at = datetime('now'), cancelled_by_user_id = ?1, cancel_authorized_by_user_id = ?2 WHERE id = ?3",
            params![requester_id, authorized_by, sale_id],
        )
        .map_err(|e| e.to_string())?;

        tx.commit().map_err(|e| e.to_string())?;
    }

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
    // already has part of the money on hand, so a `credit_payments` row (with
    // a `credit_payment_allocations` row pointing back at this sale) is
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
        // Normally strictly less than `total`, never equal: a Crediário sale
        // is supposed to leave an open balance — paying it off in full at the
        // same moment belongs to a different payment method entirely (cash,
        // card, PIX), not this one. The one exception: a client who already
        // has store credit (a negative balance, e.g. from a paid sale that
        // was later cancelled) has that credit applied to this sale
        // automatically, and it's allowed to cover the total exactly — that's
        // the client's own money settling itself, not someone typing the full
        // amount as a workaround. Re-checked against the DB here rather than
        // trusting the frontend's math, same reasoning as every other
        // server-side validation in this command.
        if paid >= total {
            let available_credit = match client_balance(&conn, client_id.unwrap()) {
                Ok(balance) if balance < 0.0 => round2(-balance),
                _ => 0.0,
            };
            if paid > available_credit {
                return Err(
                    "Valor pago agora deve ser menor que o total da venda — para pagamento total, escolha outra forma de pagamento"
                        .to_string(),
                );
            }
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
                "INSERT INTO credit_payments (client_id, amount, user_id) VALUES (?1, ?2, ?3)",
                params![client_id.unwrap(), paid, cashier_id],
            )
            .map_err(|e| e.to_string())?;
            let payment_id = tx.last_insert_rowid();
            tx.execute(
                "INSERT INTO credit_payment_allocations (payment_id, sale_id, amount) VALUES (?1, ?2, ?3)",
                params![payment_id, sale_id, paid],
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Regression test for the same bug class `ItemCsvRow`/`ItemCsvFileRow`
    /// hit once already: the on-disk CSV shape (Portuguese headers) must
    /// never be the same struct the frontend exchanges over JSON — writing
    /// through `SaleCsvFileRow` here, never `SaleCsvRow` directly.
    #[test]
    fn sale_csv_file_row_round_trips_through_csv_util_with_portuguese_headers() {
        let path = std::env::temp_dir().join("stockly_test_sales_csv_roundtrip.csv");
        let row = SaleCsvRow {
            receipt_number: "20260918000001".into(),
            created_at: "18/09/2026 15:53".into(),
            client_name: "".into(),
            user_name: "Admin Demo".into(),
            payment_method: "Cartão".into(),
            discount: 0.0,
            total: 24.0,
            status: "Concluída".into(),
        };
        csv_util::write_csv(&path, &[SaleCsvFileRow::from(&row)]).unwrap();

        let content = std::fs::read_to_string(&path).unwrap();
        std::fs::remove_file(&path).ok();
        assert!(content.contains("recibo;data;cliente;operador;forma_pagamento;desconto;total;status"));
        assert!(content.contains("20260918000001"));
    }
}
