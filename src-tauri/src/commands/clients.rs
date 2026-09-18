use crate::guard::{active_user_id, resolve_admin_authorization};
use crate::models::{
    ClientDetail, ClientSummary, CreditPaymentAllocationSummary, CreditPaymentReportRow, CreditPaymentSummary, CreditSaleReportRow,
    CreditSaleSummary,
};
use crate::money::round2;
use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

/// Sum of `sales.total` for completed Crediário sales, minus payments already
/// registered — never stored directly, always derived so it can't drift from
/// the ledger of sales/payments it's built from. `pub(crate)`: also used by
/// `commands::sales::create_sale` to independently verify how much store
/// credit (a negative balance) a client actually has before letting an
/// automatic "Valor pago agora" cover the sale's full total.
pub(crate) fn client_balance(conn: &Connection, client_id: i64) -> Result<f64, String> {
    let credit_sales_total: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(s.total), 0) FROM sales s
             JOIN sale_payments sp ON sp.sale_id = s.id
             WHERE sp.payment_method = 'credit' AND s.client_id = ?1 AND s.status = 'completed'",
            params![client_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let paid_total: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(amount), 0) FROM credit_payments WHERE client_id = ?1 AND cancelled_at IS NULL",
            params![client_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(round2(credit_sales_total - paid_total))
}

/// Sum of active (non-cancelled-payment) `credit_payment_allocations` applied
/// to a specific sale — how much of that sale's own `total` is already
/// covered, regardless of which payment(s) it came from or when.
fn sale_paid_amount(conn: &Connection, sale_id: i64) -> Result<f64, String> {
    conn.query_row(
        "SELECT COALESCE(SUM(cpa.amount), 0) FROM credit_payment_allocations cpa
         JOIN credit_payments cp ON cp.id = cpa.payment_id
         WHERE cpa.sale_id = ?1 AND cp.cancelled_at IS NULL",
        params![sale_id],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

/// Any client with an open balance blocks Crediário from being disabled in
/// Configurações (see `commands::config::set_credit_enabled`).
pub(crate) fn has_open_debtors(conn: &Connection) -> Result<bool, String> {
    let ids: Vec<i64> = {
        let mut stmt = conn.prepare("SELECT id FROM clients").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| row.get(0)).map_err(|e| e.to_string())?;
        rows.collect::<Result<_, _>>().map_err(|e| e.to_string())?
    };
    for id in ids {
        if client_balance(conn, id)? > 0.0 {
            return Ok(true);
        }
    }
    Ok(false)
}

fn fetch_client_summary(conn: &Connection, id: i64) -> Result<ClientSummary, String> {
    let (name, phone, reminder_date, note): (String, Option<String>, Option<String>, Option<String>) = conn
        .query_row("SELECT name, phone, reminder_date, note FROM clients WHERE id = ?1", params![id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(|e| e.to_string())?;
    Ok(ClientSummary { id, name, phone, reminder_date, note, balance: client_balance(conn, id)? })
}

/// Every client, each with its computed balance — any profile. The frontend
/// filters/sorts client-side (same convention as `list_items`): the Devedores
/// screen keeps only `balance > 0`, the Venda client picker matches by name
/// (accent/case-insensitive) over the full list.
#[tauri::command]
pub fn list_clients(state: State<AppState>) -> Result<Vec<ClientSummary>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;
    let ids: Vec<i64> = {
        let mut stmt = conn.prepare("SELECT id FROM clients ORDER BY name").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| row.get(0)).map_err(|e| e.to_string())?;
        rows.collect::<Result<_, _>>().map_err(|e| e.to_string())?
    };
    ids.into_iter().map(|id| fetch_client_summary(&conn, id)).collect()
}

/// No admin required — registering a Crediário debtor (in Venda or in
/// Devedores) is explicitly not a sensitive action (see `Plans/PLANO.md`,
/// "Fluxo na venda").
#[tauri::command]
pub fn create_client(
    state: State<AppState>,
    name: String,
    phone: Option<String>,
    reminder_date: Option<String>,
    note: Option<String>,
) -> Result<ClientSummary, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err("Nome é obrigatório".to_string());
    }
    conn.execute(
        "INSERT INTO clients (name, phone, reminder_date, note) VALUES (?1, ?2, ?3, ?4)",
        params![trimmed_name, non_empty(phone), non_empty(reminder_date), non_empty(note)],
    )
    .map_err(|e| e.to_string())?;
    fetch_client_summary(&conn, conn.last_insert_rowid())
}

/// Renaming a client with an open Crediário balance requires admin
/// authorization (self-authorizes if the active session is already Admin,
/// otherwise a *different* admin's password — same `resolve_admin_authorization`
/// pattern as discount/cancel-sale/cancel-payment) — protects the debt
/// ledger's identity from a regular operator's typo/mischief. Every other
/// field (phone/reminder/note) stays free, and renaming a client with no
/// open balance needs no authorization either.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_client(
    state: State<AppState>,
    id: i64,
    name: String,
    phone: Option<String>,
    reminder_date: Option<String>,
    note: Option<String>,
    authorizer_id: Option<i64>,
    authorizer_password: Option<String>,
) -> Result<ClientSummary, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err("Nome é obrigatório".to_string());
    }

    let current_name: String =
        conn.query_row("SELECT name FROM clients WHERE id = ?1", params![id], |row| row.get(0)).map_err(|_| "Cliente não encontrado".to_string())?;
    if current_name != trimmed_name && client_balance(&conn, id)? > 0.0 {
        resolve_admin_authorization(&state, &conn, authorizer_id, authorizer_password.as_deref())?;
    }

    conn.execute(
        "UPDATE clients SET name = ?1, phone = ?2, reminder_date = ?3, note = ?4 WHERE id = ?5",
        params![trimmed_name, non_empty(phone), non_empty(reminder_date), non_empty(note), id],
    )
    .map_err(|e| e.to_string())?;
    fetch_client_summary(&conn, id)
}

fn non_empty(value: Option<String>) -> Option<String> {
    value.map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

fn fetch_payment_allocations(conn: &Connection, payment_id: i64) -> Result<Vec<CreditPaymentAllocationSummary>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT cpa.sale_id, s.receipt_number, cpa.amount FROM credit_payment_allocations cpa
             JOIN sales s ON s.id = cpa.sale_id
             WHERE cpa.payment_id = ?1
             ORDER BY cpa.id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![payment_id], |row| {
            Ok(CreditPaymentAllocationSummary { sale_id: row.get(0)?, receipt_number: row.get(1)?, amount: row.get(2)? })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Client detail: balance plus the two histories shown side by side in
/// Devedores ("Vendas em Crediário" and "Pagamentos registrados").
#[tauri::command]
pub fn get_client_detail(state: State<AppState>, id: i64) -> Result<ClientDetail, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;
    fetch_client_detail(&conn, id)
}

fn fetch_client_detail(conn: &Connection, id: i64) -> Result<ClientDetail, String> {
    let (name, phone, reminder_date, note): (String, Option<String>, Option<String>, Option<String>) = conn
        .query_row("SELECT name, phone, reminder_date, note FROM clients WHERE id = ?1", params![id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(|_| "Cliente não encontrado".to_string())?;

    let credit_sales = {
        let mut stmt = conn
            .prepare(
                "SELECT s.id, s.receipt_number, s.created_at, s.total, s.status FROM sales s
                 JOIN sale_payments sp ON sp.sale_id = s.id
                 WHERE sp.payment_method = 'credit' AND s.client_id = ?1
                 ORDER BY s.created_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, f64>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let raw: Vec<(i64, String, String, f64, String)> = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
        raw.into_iter()
            .map(|(sale_id, receipt_number, created_at, total, status)| {
                let paid = sale_paid_amount(conn, sale_id)?;
                Ok(CreditSaleSummary { sale_id, receipt_number, created_at, total, paid, remaining: round2(total - paid), status })
            })
            .collect::<Result<Vec<_>, String>>()?
    };

    let payments = {
        let mut stmt = conn
            .prepare(
                "SELECT cp.id, cp.amount, u.name, cp.created_at, cp.cancelled_at, cb.name, ca.name, cp.cancel_reason
                 FROM credit_payments cp
                 JOIN users u ON u.id = cp.user_id
                 LEFT JOIN users cb ON cb.id = cp.cancelled_by_user_id
                 LEFT JOIN users ca ON ca.id = cp.cancel_authorized_by_user_id
                 WHERE cp.client_id = ?1
                 ORDER BY cp.created_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![id], |row| {
                Ok(CreditPaymentSummary {
                    id: row.get(0)?,
                    amount: row.get(1)?,
                    user_name: row.get(2)?,
                    created_at: row.get(3)?,
                    allocations: Vec::new(),
                    cancelled_at: row.get(4)?,
                    cancelled_by_name: row.get(5)?,
                    cancel_authorized_by_name: row.get(6)?,
                    cancel_reason: row.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut payments: Vec<CreditPaymentSummary> = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
        for payment in &mut payments {
            payment.allocations = fetch_payment_allocations(conn, payment.id)?;
        }
        payments
    };

    Ok(ClientDetail { id, name, phone, reminder_date, note, balance: client_balance(&conn, id)?, credit_sales, payments })
}

/// Every still-completed Crediário sale, across all clients — only consumer
/// today is the "Inadimplência" report (`relatorios/inadimplencia-aging`),
/// which groups these by `clientId` client-side and needs each client's
/// *oldest* sale with `remaining > 0` to compute days-overdue; `list_clients`
/// only has the current total balance, not per-sale dates. Cancelled sales
/// are excluded here (same as `client_balance`'s own credit-sales sum) —
/// they never carry real debt regardless of what `remaining` would compute to.
#[tauri::command]
pub fn list_credit_sales(state: State<AppState>) -> Result<Vec<CreditSaleReportRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.client_id, cl.name, s.receipt_number, s.created_at, s.total
             FROM sales s
             JOIN sale_payments sp ON sp.sale_id = s.id
             JOIN clients cl ON cl.id = s.client_id
             WHERE sp.payment_method = 'credit' AND s.status = 'completed'
             ORDER BY s.created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, f64>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let raw: Vec<(i64, i64, String, String, String, f64)> = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    raw.into_iter()
        .map(|(sale_id, client_id, client_name, receipt_number, created_at, total)| {
            let paid = sale_paid_amount(&conn, sale_id)?;
            Ok(CreditSaleReportRow { sale_id, client_id, client_name, receipt_number, created_at, total, paid, remaining: round2(total - paid) })
        })
        .collect::<Result<Vec<_>, String>>()
}

/// Every `credit_payments` row ever registered, across all clients — feeds
/// both "Pagamentos recebidos" and "Pagamentos cancelados" (see
/// `CreditPaymentReportRow`'s doc comment).
#[tauri::command]
pub fn list_credit_payments(state: State<AppState>) -> Result<Vec<CreditPaymentReportRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;
    let mut stmt = conn
        .prepare(
            "SELECT cp.id, cp.client_id, cl.name, cp.amount, u.name, cp.created_at,
                    cp.cancelled_at, cb.name, ca.name, cp.cancel_reason
             FROM credit_payments cp
             JOIN clients cl ON cl.id = cp.client_id
             JOIN users u ON u.id = cp.user_id
             LEFT JOIN users cb ON cb.id = cp.cancelled_by_user_id
             LEFT JOIN users ca ON ca.id = cp.cancel_authorized_by_user_id
             ORDER BY cp.created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(CreditPaymentReportRow {
                id: row.get(0)?,
                client_id: row.get(1)?,
                client_name: row.get(2)?,
                amount: row.get(3)?,
                user_name: row.get(4)?,
                created_at: row.get(5)?,
                cancelled_at: row.get(6)?,
                cancelled_by_name: row.get(7)?,
                cancel_authorized_by_name: row.get(8)?,
                cancel_reason: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

struct SelectedSale {
    id: i64,
    remaining: f64,
}

/// Partial or total payoff of one or more of the client's own open Crediário
/// sales — no admin password required (same decision as registering the
/// Crediário sale itself). `sale_ids` are the ones checked in "Vendas em
/// Crediário"; `amount` can be less than their combined `remaining`, in which
/// case `residual_sale_id` (one of `sale_ids`) says which one absorbs the
/// difference and stays partially paid — every other selected sale is paid
/// off in full.
#[tauri::command]
pub fn register_credit_payment(
    state: State<AppState>,
    client_id: i64,
    sale_ids: Vec<i64>,
    amount: f64,
    residual_sale_id: Option<i64>,
) -> Result<ClientDetail, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    let user_id = active_user_id(&state)?;
    if amount <= 0.0 {
        return Err("Valor deve ser maior que zero".to_string());
    }
    if sale_ids.is_empty() {
        return Err("Selecione ao menos uma venda".to_string());
    }
    let exists: Option<i64> =
        conn.query_row("SELECT id FROM clients WHERE id = ?1", params![client_id], |row| row.get(0)).optional().map_err(|e| e.to_string())?;
    if exists.is_none() {
        return Err("Cliente não encontrado".to_string());
    }

    let mut selected: Vec<SelectedSale> = Vec::with_capacity(sale_ids.len());
    for sale_id in &sale_ids {
        let (sale_client_id, status, total): (i64, String, f64) = conn
            .query_row("SELECT client_id, status, total FROM sales WHERE id = ?1", params![sale_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
            .map_err(|_| "Venda não encontrada".to_string())?;
        if sale_client_id != client_id {
            return Err("Venda selecionada não pertence a este cliente".to_string());
        }
        if status != "completed" {
            return Err("Venda cancelada não pode receber pagamento".to_string());
        }
        let remaining = round2(total - sale_paid_amount(&conn, *sale_id)?);
        if remaining <= 0.0 {
            return Err("Venda selecionada já está quitada".to_string());
        }
        selected.push(SelectedSale { id: *sale_id, remaining });
    }

    let sum_remaining = round2(selected.iter().map(|s| s.remaining).sum());
    let amount = round2(amount);
    if amount > sum_remaining {
        return Err("Valor não pode ser maior que a soma das vendas selecionadas".to_string());
    }
    let shortfall = round2(sum_remaining - amount);

    if shortfall > 0.0 {
        let residual_id = residual_sale_id.ok_or_else(|| "Selecione qual venda fica com o saldo residual".to_string())?;
        let residual = selected
            .iter()
            .find(|s| s.id == residual_id)
            .ok_or_else(|| "A venda do saldo residual precisa estar entre as selecionadas".to_string())?;
        if shortfall > residual.remaining {
            return Err("Valor insuficiente para quitar as demais vendas selecionadas".to_string());
        }
    }

    {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO credit_payments (client_id, amount, user_id) VALUES (?1, ?2, ?3)",
            params![client_id, amount, user_id],
        )
        .map_err(|e| e.to_string())?;
        let payment_id = tx.last_insert_rowid();

        for sale in &selected {
            let alloc_amount =
                if Some(sale.id) == residual_sale_id { round2(sale.remaining - shortfall) } else { sale.remaining };
            if alloc_amount > 0.0 {
                tx.execute(
                    "INSERT INTO credit_payment_allocations (payment_id, sale_id, amount) VALUES (?1, ?2, ?3)",
                    params![payment_id, sale.id, alloc_amount],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        tx.commit().map_err(|e| e.to_string())?;
    }

    fetch_client_detail(&conn, client_id)
}

/// Soft-cancel of a mistakenly-registered payment — never deleted, just
/// flipped with a reason (shown as "Pagamento cancelado por X devido a Y").
/// Reverses a financial entry, so it goes through `resolve_admin_authorization`
/// (`guard.rs`) same as discount/cancel-sale: self-authorizes if the
/// active session is already Admin, otherwise needs a *different* admin's
/// password — unlike registering the payment itself, which needs none.
#[tauri::command]
pub fn cancel_credit_payment(
    state: State<AppState>,
    payment_id: i64,
    reason: String,
    authorizer_id: Option<i64>,
    authorizer_password: Option<String>,
) -> Result<ClientDetail, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let requester_id = active_user_id(&state)?;
    let trimmed_reason = reason.trim();
    if trimmed_reason.is_empty() {
        return Err("Motivo é obrigatório".to_string());
    }
    let (client_id, already_cancelled): (i64, Option<String>) = conn
        .query_row("SELECT client_id, cancelled_at FROM credit_payments WHERE id = ?1", params![payment_id], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .map_err(|_| "Pagamento não encontrado".to_string())?;
    if already_cancelled.is_some() {
        return Err("Pagamento já está cancelado".to_string());
    }
    let authorized_by = resolve_admin_authorization(&state, &conn, authorizer_id, authorizer_password.as_deref())?;
    conn.execute(
        "UPDATE credit_payments
         SET cancelled_at = datetime('now'), cancelled_by_user_id = ?1, cancel_authorized_by_user_id = ?2, cancel_reason = ?3
         WHERE id = ?4",
        params![requester_id, authorized_by, trimmed_reason, payment_id],
    )
    .map_err(|e| e.to_string())?;

    fetch_client_detail(&conn, client_id)
}
