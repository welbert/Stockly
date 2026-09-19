use crate::guard::active_user_id;
use crate::models::AdminAuthorizationRow;
use crate::money::round2;
use crate::AppState;
use tauri::State;

/// Every authorized admin action, from **3** of the 4 originally-planned
/// "Autorizações de Administrador" candidate names:
/// desconto concedido (`sales.discount_authorized_by_user_id`), venda
/// cancelada (`sales.cancel_authorized_by_user_id`) and pagamento de
/// Crediário cancelado (`credit_payments.cancel_authorized_by_user_id`). The
/// 4th (cliente renomeado com saldo em aberto) is deliberately left out —
/// `commands::clients::update_client` verifies the admin password but never
/// persists who authorized it or when, and `clients` is current-state (not
/// an append-only ledger like `sales`/`credit_payments`), so a plain column
/// there would only ever hold the *last* rename, silently dropping every
/// earlier one from this report. Fixing that for real needs a proper
/// append-only audit table, decided out of scope here — logged in
/// `docs/future.md` instead of half-implemented as a lossy column.
///
/// Each source is queried separately (its own row shape, own joins) then
/// merged and sorted by `createdAt` descending in Rust — a single `UNION`
/// query across `sales` (queried twice, for two different columns) and
/// `credit_payments` would need every column padded to the widest row
/// anyway, with no real savings over 3 plain queries.
#[tauri::command]
pub fn list_admin_authorizations(state: State<AppState>) -> Result<Vec<AdminAuthorizationRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;

    let mut rows = Vec::new();

    let mut discount_stmt = conn
        .prepare(
            "SELECT s.id, s.receipt_number, c.name, u.name, a.name, s.discount_authorized_at,
                    COALESCE((SELECT SUM(si.unit_price * si.quantity) FROM sale_items si WHERE si.sale_id = s.id), 0) - s.total
             FROM sales s
             JOIN users u ON u.id = s.user_id
             JOIN users a ON a.id = s.discount_authorized_by_user_id
             LEFT JOIN clients c ON c.id = s.client_id
             WHERE s.discount_authorized_by_user_id IS NOT NULL",
        )
        .map_err(|e| e.to_string())?;
    let discount_rows = discount_stmt
        .query_map([], |row| {
            let sale_id: i64 = row.get(0)?;
            Ok(AdminAuthorizationRow {
                id: format!("discount-{sale_id}"),
                action_type: "discount".into(),
                reference: row.get(1)?,
                client_name: row.get(2)?,
                requested_by_name: row.get(3)?,
                authorized_by_name: row.get(4)?,
                created_at: row.get(5)?,
                amount: round2(row.get(6)?),
            })
        })
        .map_err(|e| e.to_string())?;
    for row in discount_rows {
        rows.push(row.map_err(|e| e.to_string())?);
    }

    let mut sale_cancel_stmt = conn
        .prepare(
            "SELECT s.id, s.receipt_number, c.name, cb.name, ca.name, s.cancelled_at, s.total
             FROM sales s
             JOIN users cb ON cb.id = s.cancelled_by_user_id
             JOIN users ca ON ca.id = s.cancel_authorized_by_user_id
             LEFT JOIN clients c ON c.id = s.client_id
             WHERE s.cancel_authorized_by_user_id IS NOT NULL",
        )
        .map_err(|e| e.to_string())?;
    let sale_cancel_rows = sale_cancel_stmt
        .query_map([], |row| {
            let sale_id: i64 = row.get(0)?;
            Ok(AdminAuthorizationRow {
                id: format!("sale_cancel-{sale_id}"),
                action_type: "sale_cancel".into(),
                reference: row.get(1)?,
                client_name: row.get(2)?,
                requested_by_name: row.get(3)?,
                authorized_by_name: row.get(4)?,
                created_at: row.get(5)?,
                amount: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    for row in sale_cancel_rows {
        rows.push(row.map_err(|e| e.to_string())?);
    }

    let mut payment_cancel_stmt = conn
        .prepare(
            "SELECT cp.id, cl.name, cb.name, ca.name, cp.cancelled_at, cp.amount
             FROM credit_payments cp
             JOIN clients cl ON cl.id = cp.client_id
             JOIN users cb ON cb.id = cp.cancelled_by_user_id
             JOIN users ca ON ca.id = cp.cancel_authorized_by_user_id
             WHERE cp.cancel_authorized_by_user_id IS NOT NULL",
        )
        .map_err(|e| e.to_string())?;
    let payment_cancel_rows = payment_cancel_stmt
        .query_map([], |row| {
            let payment_id: i64 = row.get(0)?;
            Ok(AdminAuthorizationRow {
                id: format!("payment_cancel-{payment_id}"),
                action_type: "payment_cancel".into(),
                reference: None,
                client_name: row.get(1)?,
                requested_by_name: row.get(2)?,
                authorized_by_name: row.get(3)?,
                created_at: row.get(4)?,
                amount: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    for row in payment_cancel_rows {
        rows.push(row.map_err(|e| e.to_string())?);
    }

    rows.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(rows)
}
