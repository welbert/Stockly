use crate::guard::{active_user_id, resolve_admin_authorization};
use crate::models::{ClientDetail, ClientSummary, CreditPaymentSummary, CreditSaleSummary};
use crate::money::round2;
use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

/// Sum of `sales.total` for completed Crediário sales, minus payments already
/// registered — never stored directly, always derived so it can't drift from
/// the ledger of sales/payments it's built from.
fn client_balance(conn: &Connection, client_id: i64) -> Result<f64, String> {
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
                "SELECT s.id, s.receipt_number, s.created_at, s.total FROM sales s
                 JOIN sale_payments sp ON sp.sale_id = s.id
                 WHERE sp.payment_method = 'credit' AND s.client_id = ?1
                 ORDER BY s.created_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![id], |row| {
                Ok(CreditSaleSummary { sale_id: row.get(0)?, receipt_number: row.get(1)?, created_at: row.get(2)?, total: row.get(3)? })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
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
                    cancelled_at: row.get(4)?,
                    cancelled_by_name: row.get(5)?,
                    cancel_authorized_by_name: row.get(6)?,
                    cancel_reason: row.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };

    Ok(ClientDetail { id, name, phone, reminder_date, note, balance: client_balance(&conn, id)?, credit_sales, payments })
}

/// Partial or total payoff — no admin password required (same decision as
/// registering the Crediário sale itself). Rejects an amount that would leave
/// the balance negative.
#[tauri::command]
pub fn register_credit_payment(state: State<AppState>, client_id: i64, amount: f64) -> Result<ClientDetail, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let user_id = active_user_id(&state)?;
    if amount <= 0.0 {
        return Err("Valor deve ser maior que zero".to_string());
    }
    let exists: Option<i64> =
        conn.query_row("SELECT id FROM clients WHERE id = ?1", params![client_id], |row| row.get(0)).optional().map_err(|e| e.to_string())?;
    if exists.is_none() {
        return Err("Cliente não encontrado".to_string());
    }
    let balance = client_balance(&conn, client_id)?;
    if round2(amount) > balance {
        return Err("Valor não pode ser maior que o saldo em aberto".to_string());
    }
    conn.execute(
        "INSERT INTO credit_payments (client_id, amount, user_id) VALUES (?1, ?2, ?3)",
        params![client_id, round2(amount), user_id],
    )
    .map_err(|e| e.to_string())?;

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
