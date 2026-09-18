use crate::guard::{active_user_id, require_admin};
use crate::models::ItemSummary;
use crate::money::round2;
use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension, Row};
use tauri::State;

const ITEM_COLUMNS: &str =
    "i.id, i.code, i.name, i.category_id, c.name, i.cost_price, i.sale_price, i.quantity, i.min_quantity, i.active";

fn map_item(row: &Row) -> rusqlite::Result<ItemSummary> {
    Ok(ItemSummary {
        id: row.get(0)?,
        code: row.get(1)?,
        name: row.get(2)?,
        category_id: row.get(3)?,
        category_name: row.get(4)?,
        cost_price: row.get(5)?,
        sale_price: row.get(6)?,
        quantity: row.get(7)?,
        min_quantity: row.get(8)?,
        active: row.get::<_, i64>(9)? != 0,
    })
}

fn fetch_item(conn: &Connection, id: i64) -> Result<ItemSummary, String> {
    conn.query_row(
        &format!("SELECT {ITEM_COLUMNS} FROM items i LEFT JOIN categories c ON c.id = i.category_id WHERE i.id = ?1"),
        params![id],
        map_item,
    )
    .map_err(|e| e.to_string())
}

fn code_taken(conn: &Connection, code: &str, exclude_id: Option<i64>) -> Result<bool, String> {
    match exclude_id {
        Some(id) => conn
            .query_row("SELECT 1 FROM items WHERE code = ?1 AND id != ?2", params![code, id], |_| Ok(()))
            .optional(),
        None => conn.query_row("SELECT 1 FROM items WHERE code = ?1", params![code], |_| Ok(())).optional(),
    }
    .map(|r| r.is_some())
    .map_err(|e| e.to_string())
}

/// Appends `-2`, `-3`, ... to `base` on a collision — same idea as
/// `commands::users::unique_username`. In practice only matters if a manually
/// typed code elsewhere happens to already equal the predicted id below.
fn unique_code(conn: &Connection, base: &str) -> Result<String, String> {
    if !code_taken(conn, base, None)? {
        return Ok(base.to_string());
    }
    let mut n = 2;
    loop {
        let candidate = format!("{base}-{n}");
        if !code_taken(conn, &candidate, None)? {
            return Ok(candidate);
        }
        n += 1;
    }
}

/// The id `items`'s next `AUTOINCREMENT` insert will get — safe to predict
/// because `AppState.db` is behind a single `Mutex<Connection>`, so nothing
/// else can insert between this read and `create_item`'s own insert.
fn predict_next_item_id(conn: &Connection) -> Result<i64, String> {
    let seq: Option<i64> = conn
        .query_row("SELECT seq FROM sqlite_sequence WHERE name = 'items'", [], |row| row.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(seq.unwrap_or(0) + 1)
}

fn record_movement(conn: &Connection, item_id: i64, movement_type: &str, delta: i64, user_id: i64) -> Result<(), String> {
    conn.execute(
        "INSERT INTO stock_movements (item_id, movement_type, quantity_delta, user_id) VALUES (?1, ?2, ?3, ?4)",
        params![item_id, movement_type, delta, user_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Append-only, same idea as `record_movement` but for `cost_price`/`sale_price`
/// — one row per value *after* the change, who changed it, and when. Also
/// doubles as an audit trail (who touched pricing, not just stock).
fn record_price_change(conn: &Connection, item_id: i64, cost_price: f64, sale_price: f64, user_id: i64) -> Result<(), String> {
    conn.execute(
        "INSERT INTO item_price_history (item_id, cost_price, sale_price, user_id) VALUES (?1, ?2, ?3, ?4)",
        params![item_id, cost_price, sale_price, user_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_items(state: State<AppState>) -> Result<Vec<ItemSummary>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;
    let mut stmt = conn
        .prepare(&format!("SELECT {ITEM_COLUMNS} FROM items i LEFT JOIN categories c ON c.id = i.category_id ORDER BY i.name"))
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_item).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Admin-only. Records an `initial` stock_movements row when `quantity > 0`
/// (nothing to log for a fresh item that starts at zero).
///
/// `code` is optional: an empty/blank string means "use the item's own id as
/// the code" (predicted via `predict_next_item_id`, before the row exists) —
/// kept simple on purpose; the admin can still edit it into a real code
/// afterward through `update_item`, same as any other field.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_item(
    state: State<AppState>,
    code: String,
    name: String,
    category_id: Option<i64>,
    cost_price: f64,
    sale_price: f64,
    quantity: i64,
    min_quantity: Option<i64>,
) -> Result<ItemSummary, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let admin_id = require_admin(&state, &conn)?;
    if cost_price < 0.0 || sale_price < 0.0 {
        return Err("Preço não pode ser negativo".to_string());
    }
    if quantity < 0 {
        return Err("Quantidade não pode ser negativa".to_string());
    }
    let trimmed_code = code.trim();
    let final_code = if trimmed_code.is_empty() {
        unique_code(&conn, &predict_next_item_id(&conn)?.to_string())?
    } else {
        if code_taken(&conn, trimmed_code, None)? {
            return Err("Já existe um item com esse código".to_string());
        }
        trimmed_code.to_string()
    };
    conn.execute(
        "INSERT INTO items (code, name, category_id, cost_price, sale_price, quantity, min_quantity) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![final_code, name, category_id, round2(cost_price), round2(sale_price), quantity, min_quantity],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    if quantity > 0 {
        record_movement(&conn, id, "initial", quantity, admin_id)?;
    }
    record_price_change(&conn, id, round2(cost_price), round2(sale_price), admin_id)?;
    fetch_item(&conn, id)
}

/// Admin-only full edit, including `quantity` directly — a manual correction
/// here is the "ajuste de inventário" reserved for Admin (logged as
/// `adjustment`, whatever the delta's sign). Everyday stock-ins go through
/// `add_stock_entry` instead (logged as `entry`, any profile).
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_item(
    state: State<AppState>,
    id: i64,
    code: String,
    name: String,
    category_id: Option<i64>,
    cost_price: f64,
    sale_price: f64,
    quantity: i64,
    min_quantity: Option<i64>,
    active: bool,
) -> Result<ItemSummary, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let admin_id = require_admin(&state, &conn)?;
    if cost_price < 0.0 || sale_price < 0.0 {
        return Err("Preço não pode ser negativo".to_string());
    }
    if quantity < 0 {
        return Err("Quantidade não pode ser negativa".to_string());
    }
    if code_taken(&conn, &code, Some(id))? {
        return Err("Já existe um item com esse código".to_string());
    }
    let (previous_quantity, previous_cost_price, previous_sale_price): (i64, f64, f64) = conn
        .query_row("SELECT quantity, cost_price, sale_price FROM items WHERE id = ?1", params![id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .map_err(|e| e.to_string())?;
    let (new_cost_price, new_sale_price) = (round2(cost_price), round2(sale_price));

    conn.execute(
        "UPDATE items SET code = ?1, name = ?2, category_id = ?3, cost_price = ?4, sale_price = ?5, quantity = ?6, min_quantity = ?7, active = ?8 WHERE id = ?9",
        params![code, name, category_id, new_cost_price, new_sale_price, quantity, min_quantity, active as i64, id],
    )
    .map_err(|e| e.to_string())?;

    let delta = quantity - previous_quantity;
    if delta != 0 {
        record_movement(&conn, id, "adjustment", delta, admin_id)?;
    }
    if new_cost_price != previous_cost_price || new_sale_price != previous_sale_price {
        record_price_change(&conn, id, new_cost_price, new_sale_price, admin_id)?;
    }
    fetch_item(&conn, id)
}

/// Hard delete — Admin-only. Blocked **only** by the item having ever been
/// sold (`sale_items`, checked explicitly below) — a stock entry, adjustment,
/// or price change with no sale is still just "correcting a fresh mistake",
/// not retiring a real item, so `stock_movements`/`item_price_history` rows
/// are cascade-deleted along with the item instead of blocking it (use
/// `deactivate_item`/`update_item`'s `active` to retire an item that *has*
/// sales history).
#[tauri::command]
pub fn delete_item(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;
    let sale_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM sale_items WHERE item_id = ?1", params![id], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if sale_count > 0 {
        return Err("Não é possível excluir: este item já foi vendido. Desative-o em vez de excluir.".to_string());
    }
    conn.execute("DELETE FROM items WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

/// Self-service stock entry ("recebi mercadoria") — any logged-in profile,
/// always a positive delta, logged as `entry`. The arbitrary "set to N"
/// correction (`update_item`'s `quantity` field, logged as `adjustment`)
/// stays Admin-only.
#[tauri::command]
pub fn add_stock_entry(state: State<AppState>, item_id: i64, quantity: i64) -> Result<ItemSummary, String> {
    if quantity <= 0 {
        return Err("Quantidade deve ser maior que zero".to_string());
    }
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let user_id = active_user_id(&state)?;
    conn.execute("UPDATE items SET quantity = quantity + ?1 WHERE id = ?2", params![quantity, item_id])
        .map_err(|e| e.to_string())?;
    record_movement(&conn, item_id, "entry", quantity, user_id)?;
    fetch_item(&conn, item_id)
}

/// Any logged-in profile can deactivate an item — a regular user can only
/// deactivate, not edit/reactivate, which goes through `update_item` (Admin-only).
#[tauri::command]
pub fn deactivate_item(state: State<AppState>, item_id: i64) -> Result<ItemSummary, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;
    conn.execute("UPDATE items SET active = 0 WHERE id = ?1", params![item_id]).map_err(|e| e.to_string())?;
    fetch_item(&conn, item_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_connection;

    #[test]
    fn duplicate_code_is_rejected_at_the_db_level() {
        let conn = test_connection();
        conn.execute(
            "INSERT INTO items (code, name, cost_price, sale_price, quantity) VALUES ('A1', 'Item A', 1.0, 2.0, 0)",
            [],
        )
        .unwrap();
        let id = conn.last_insert_rowid();
        assert!(code_taken(&conn, "A1", None).unwrap());
        assert!(!code_taken(&conn, "A1", Some(id)).unwrap()); // excluindo o próprio item, não conta como "em uso"
        assert!(!code_taken(&conn, "B2", None).unwrap());
    }

    #[test]
    fn predicted_next_id_matches_actual_autoincrement() {
        let conn = test_connection();
        assert_eq!(predict_next_item_id(&conn).unwrap(), 1);
        conn.execute("INSERT INTO items (code, name, cost_price, sale_price, quantity) VALUES ('X', 'Item X', 0, 0, 0)", [])
            .unwrap();
        assert_eq!(conn.last_insert_rowid(), 1);
        assert_eq!(predict_next_item_id(&conn).unwrap(), 2);
    }

    #[test]
    fn unique_code_appends_suffix_on_collision() {
        let conn = test_connection();
        conn.execute("INSERT INTO items (code, name, cost_price, sale_price, quantity) VALUES ('7', 'Item', 0, 0, 0)", [])
            .unwrap();
        assert_eq!(unique_code(&conn, "7").unwrap(), "7-2");
        assert_eq!(unique_code(&conn, "8").unwrap(), "8");
    }
}
