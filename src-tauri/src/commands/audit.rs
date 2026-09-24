use crate::guard::active_user_id;
use crate::models::AdminAuthorizationRow;
use crate::AppState;
use rusqlite::{params, Connection};
use tauri::State;

/// One row to append to `audit_log` (`db.rs`) — written in the **same
/// transaction** as the action it records (discount, sale/payment cancel,
/// password reset), never as an afterthought outside it, so the trail can't
/// drift from what actually happened. `created_at` is deliberately not a
/// field here: every live write leaves it to the column's own `DEFAULT
/// (datetime('now'))` — only `db::migrate_db`'s one-time historical backfill
/// sets it explicitly, to the real historical timestamp instead of "now".
pub(crate) struct AuditEntry<'a> {
    pub action_type: &'a str,
    pub reference: Option<&'a str>,
    pub client_id: Option<i64>,
    pub target_user_id: Option<i64>,
    pub amount: Option<f64>,
    pub requested_by_user_id: i64,
    pub authorized_by_user_id: i64,
}

pub(crate) fn record(conn: &Connection, entry: AuditEntry) -> Result<(), String> {
    conn.execute(
        "INSERT INTO audit_log (action_type, reference, client_id, target_user_id, amount, requested_by_user_id, authorized_by_user_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            entry.action_type,
            entry.reference,
            entry.client_id,
            entry.target_user_id,
            entry.amount,
            entry.requested_by_user_id,
            entry.authorized_by_user_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Every authorized admin action — desconto concedido, venda cancelada,
/// pagamento de Crediário cancelado, senha redefinida — read straight from
/// the single append-only `audit_log` table instead of the 3 separate
/// per-table queries this command used before that table existed (each
/// action's own write site now calls `record` above, inline with the action
/// itself — see `commands::sales::create_sale`/`cancel_sale`,
/// `commands::clients::cancel_credit_payment`,
/// `commands::users::reset_user_password`).
///
/// `clientName` is doubly-used: a client's name for the first 3 action
/// types, or the *target user's* name for `password_reset` — mutually
/// exclusive (`client_id`/`target_user_id` are never both set on the same
/// row), merged here via `COALESCE` rather than stretching the row shape
/// with a second, almost-always-null name column.
#[tauri::command]
pub fn list_admin_authorizations(state: State<AppState>) -> Result<Vec<AdminAuthorizationRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;

    let mut stmt = conn
        .prepare(
            "SELECT al.id, al.action_type, al.reference, COALESCE(c.name, tu.name), al.amount, ru.name, au.name, al.created_at
             FROM audit_log al
             JOIN users ru ON ru.id = al.requested_by_user_id
             JOIN users au ON au.id = al.authorized_by_user_id
             LEFT JOIN clients c ON c.id = al.client_id
             LEFT JOIN users tu ON tu.id = al.target_user_id
             ORDER BY al.created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(AdminAuthorizationRow {
                id: row.get(0)?,
                action_type: row.get(1)?,
                reference: row.get(2)?,
                client_name: row.get(3)?,
                amount: row.get(4)?,
                requested_by_name: row.get(5)?,
                authorized_by_name: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
