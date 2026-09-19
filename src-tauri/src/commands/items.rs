use crate::csv_util;
use crate::guard::{active_user_id, require_admin};
use crate::models::{
    ItemCsvChangedRow, ItemCsvFieldDiff, ItemCsvMissingItem, ItemCsvNewRow, ItemCsvRow, ItemCsvRowError, ItemPriceHistoryRow,
    ItemSummary, ItemsCsvImportDecision, ItemsCsvImportPreview, ItemsCsvImportResult, StockMovementRow,
};
use crate::money::round2;
use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;
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

/// Every `stock_movements` row ever, newest first — the "Movimentação de
/// estoque" report's data source (and, filtered to `movement_type = 'sale'`
/// client-side, "Itens sem movimento"'s too). Same "fetch everything,
/// filter/aggregate client-side" convention as `list_sales`. `item_id`'s
/// `ON DELETE CASCADE` means this join is always valid — a deleted item
/// takes its movement rows with it, never leaving an orphan to `LEFT JOIN`
/// around.
#[tauri::command]
pub fn list_stock_movements(state: State<AppState>) -> Result<Vec<StockMovementRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;
    let mut stmt = conn
        .prepare(
            "SELECT sm.id, sm.item_id, i.name, sm.movement_type, sm.quantity_delta, u.name, sm.created_at, s.status
             FROM stock_movements sm
             JOIN items i ON i.id = sm.item_id
             JOIN users u ON u.id = sm.user_id
             LEFT JOIN sales s ON s.id = sm.sale_id
             ORDER BY sm.created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(StockMovementRow {
                id: row.get(0)?,
                item_id: row.get(1)?,
                item_name: row.get(2)?,
                movement_type: row.get(3)?,
                quantity_delta: row.get(4)?,
                user_name: row.get(5)?,
                created_at: row.get(6)?,
                sale_status: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Every `item_price_history` row ever, newest first — the "Histórico de
/// alteração de preço" report's data source. Same reasoning as
/// `list_stock_movements` (cascade-deleted alongside its item, so the join
/// never orphans).
#[tauri::command]
pub fn list_item_price_history(state: State<AppState>) -> Result<Vec<ItemPriceHistoryRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;
    let mut stmt = conn
        .prepare(
            "SELECT iph.id, iph.item_id, i.name, iph.cost_price, iph.sale_price, u.name, iph.created_at
             FROM item_price_history iph
             JOIN items i ON i.id = iph.item_id
             JOIN users u ON u.id = iph.user_id
             ORDER BY iph.created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ItemPriceHistoryRow {
                id: row.get(0)?,
                item_id: row.get(1)?,
                item_name: row.get(2)?,
                cost_price: row.get(3)?,
                sale_price: row.get(4)?,
                user_name: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
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

/// Lowercase + fold the accented Latin characters Portuguese item/category
/// names actually use — same purpose as `src/lib/format.ts`'s `normalize()`
/// (accent/case-insensitive match), hand-rolled here instead of pulling in a
/// Unicode-normalization crate for a handful of known characters.
fn normalize_text(s: &str) -> String {
    s.trim()
        .to_lowercase()
        .chars()
        .map(|c| match c {
            'á' | 'à' | 'â' | 'ã' | 'ä' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            'ñ' => 'n',
            other => other,
        })
        .collect()
}

/// `"sim"`/`"nao"` (accent/case-insensitive via `normalize_text`, so `"Não"`
/// also works) — anything else is a row-level error, not a silent default.
fn parse_active(value: &str) -> Result<bool, String> {
    match normalize_text(value).as_str() {
        "sim" => Ok(true),
        "nao" => Ok(false),
        other => Err(format!("Valor inválido para \"ativo\": \"{other}\" (use sim ou nao)")),
    }
}

/// The actual on-disk shape of a CSV row — Portuguese headers via `rename`,
/// since the file is opened directly by the shop owner in Excel (end-user
/// content, not an internal identifier). Kept separate from `ItemCsvRow`
/// (the JSON/IPC shape, camelCase) on purpose: a `serde` rename picked here
/// only ever affects `csv_util::write_csv`/`read_csv`, never the payload the
/// frontend receives — see `models::ItemCsvRow`'s doc comment.
#[derive(Serialize, Deserialize, Clone)]
struct ItemCsvFileRow {
    #[serde(rename = "codigo")]
    code: String,
    #[serde(rename = "nome")]
    name: String,
    #[serde(rename = "categoria")]
    category: String,
    #[serde(rename = "preco_custo")]
    cost_price: f64,
    #[serde(rename = "preco_venda")]
    sale_price: f64,
    #[serde(rename = "quantidade")]
    quantity: i64,
    #[serde(rename = "quantidade_minima")]
    min_quantity: Option<i64>,
    #[serde(rename = "ativo")]
    active: String,
}

impl From<&ItemCsvRow> for ItemCsvFileRow {
    fn from(row: &ItemCsvRow) -> Self {
        Self {
            code: row.code.clone(),
            name: row.name.clone(),
            category: row.category.clone(),
            cost_price: row.cost_price,
            sale_price: row.sale_price,
            quantity: row.quantity,
            min_quantity: row.min_quantity,
            active: row.active.clone(),
        }
    }
}

impl From<ItemCsvFileRow> for ItemCsvRow {
    fn from(row: ItemCsvFileRow) -> Self {
        Self {
            code: row.code,
            name: row.name,
            category: row.category,
            cost_price: row.cost_price,
            sale_price: row.sale_price,
            quantity: row.quantity,
            min_quantity: row.min_quantity,
            active: row.active,
        }
    }
}

fn item_to_csv_row(item: &ItemSummary) -> ItemCsvRow {
    ItemCsvRow {
        code: item.code.clone(),
        name: item.name.clone(),
        category: item.category_name.clone().unwrap_or_default(),
        cost_price: item.cost_price,
        sale_price: item.sale_price,
        quantity: item.quantity,
        min_quantity: item.min_quantity,
        active: if item.active { "sim".to_string() } else { "nao".to_string() },
    }
}

/// Same validation `create_item`/`update_item` already do on their own
/// arguments, applied to a CSV row before it's allowed into `creates`/`updates`.
fn validate_csv_row(row: &ItemCsvRow) -> Result<(), String> {
    if row.name.trim().is_empty() {
        return Err("Nome não pode ser vazio".to_string());
    }
    if row.cost_price < 0.0 || row.sale_price < 0.0 {
        return Err("Preço não pode ser negativo".to_string());
    }
    if row.quantity < 0 {
        return Err("Quantidade não pode ser negativa".to_string());
    }
    if row.min_quantity.is_some_and(|q| q < 0) {
        return Err("Quantidade mínima não pode ser negativa".to_string());
    }
    parse_active(&row.active).map(|_| ())
}

fn field_diff(field: &str, current: impl Into<String>, new: impl Into<String>) -> ItemCsvFieldDiff {
    ItemCsvFieldDiff { field: field.to_string(), current: current.into(), new: new.into() }
}

/// `None` diffs means the row matches the DB exactly — the caller skips it,
/// nothing to review.
fn diff_item(item: &ItemSummary, row: &ItemCsvRow) -> Result<Vec<ItemCsvFieldDiff>, String> {
    let active = parse_active(&row.active)?;
    let mut diffs = Vec::new();

    let new_name = row.name.trim();
    if new_name != item.name {
        diffs.push(field_diff("nome", &item.name, new_name));
    }

    let current_category = item.category_name.clone().unwrap_or_default();
    let new_category = row.category.trim().to_string();
    if new_category != current_category {
        diffs.push(field_diff("categoria", current_category, new_category));
    }

    let new_cost = round2(row.cost_price);
    if new_cost != item.cost_price {
        diffs.push(field_diff("preco_custo", item.cost_price.to_string(), new_cost.to_string()));
    }

    let new_sale = round2(row.sale_price);
    if new_sale != item.sale_price {
        diffs.push(field_diff("preco_venda", item.sale_price.to_string(), new_sale.to_string()));
    }

    if row.quantity != item.quantity {
        diffs.push(field_diff("quantidade", item.quantity.to_string(), row.quantity.to_string()));
    }

    if row.min_quantity != item.min_quantity {
        diffs.push(field_diff(
            "quantidade_minima",
            item.min_quantity.map(|v| v.to_string()).unwrap_or_default(),
            row.min_quantity.map(|v| v.to_string()).unwrap_or_default(),
        ));
    }

    if active != item.active {
        diffs.push(field_diff("ativo", if item.active { "sim" } else { "nao" }, if active { "sim" } else { "nao" }));
    }

    Ok(diffs)
}

/// Finds a category by exact (trimmed) name, creating it if it doesn't exist
/// yet — safe here specifically because CSV import is already Admin-only,
/// same trust level `create_category` requires on its own.
fn resolve_category_id(conn: &Connection, name: &str) -> Result<Option<i64>, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let existing: Option<i64> = conn
        .query_row("SELECT id FROM categories WHERE name = ?1", params![trimmed], |row| row.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(id) = existing {
        return Ok(Some(id));
    }
    conn.execute("INSERT INTO categories (name) VALUES (?1)", params![trimmed]).map_err(|e| e.to_string())?;
    Ok(Some(conn.last_insert_rowid()))
}

/// Admin-only. Exports every item (active and inactive — an inactive item's
/// row lets a full round-trip reimport reproduce the same state) as
/// `;`-delimited CSV at `path` (already chosen by the frontend's save dialog).
#[tauri::command]
pub fn export_items_csv(state: State<AppState>, path: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;
    let mut stmt = conn
        .prepare(&format!("SELECT {ITEM_COLUMNS} FROM items i LEFT JOIN categories c ON c.id = i.category_id ORDER BY i.name"))
        .map_err(|e| e.to_string())?;
    let items = stmt.query_map([], map_item).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    let rows: Vec<ItemCsvFileRow> = items.iter().map(|i| ItemCsvFileRow::from(&item_to_csv_row(i))).collect();
    csv_util::write_csv(Path::new(&path), &rows)
}

/// Admin-only, read-only — parses the CSV at `path` and classifies every row
/// against the current DB ("Importação de CSV — tela de resumo"), without
/// writing anything. `code` is the match key; a row
/// whose code matches nothing falls back to an accent/case-insensitive name
/// match as a *suggestion* only — the admin decides on the review screen
/// (`apply_items_csv_import` is the only command that actually writes).
#[tauri::command]
pub fn preview_items_csv_import(state: State<AppState>, path: String) -> Result<ItemsCsvImportPreview, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;

    let raw_rows = csv_util::read_csv::<ItemCsvFileRow>(Path::new(&path))?;

    let mut stmt = conn
        .prepare(&format!("SELECT {ITEM_COLUMNS} FROM items i LEFT JOIN categories c ON c.id = i.category_id"))
        .map_err(|e| e.to_string())?;
    let all_items = stmt.query_map([], map_item).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    let by_code: HashMap<&str, &ItemSummary> = all_items.iter().map(|i| (i.code.as_str(), i)).collect();
    let by_normalized_name: HashMap<String, &ItemSummary> = all_items.iter().map(|i| (normalize_text(&i.name), i)).collect();

    let mut new_items = Vec::new();
    let mut changed_items = Vec::new();
    let mut errors = Vec::new();
    let mut matched_ids: HashSet<i64> = HashSet::new();

    for raw in raw_rows {
        let row: ItemCsvRow = match raw.value {
            Ok(file_row) => file_row.into(),
            Err(message) => {
                errors.push(ItemCsvRowError { line: raw.line, message });
                continue;
            }
        };
        if let Err(message) = validate_csv_row(&row) {
            errors.push(ItemCsvRowError { line: raw.line, message });
            continue;
        }

        let trimmed_code = row.code.trim();
        let matched = (!trimmed_code.is_empty()).then(|| by_code.get(trimmed_code)).flatten();
        match matched {
            Some(item) => {
                matched_ids.insert(item.id);
                let diffs = diff_item(item, &row)?;
                if !diffs.is_empty() {
                    changed_items.push(ItemCsvChangedRow { row_line: raw.line, item_id: item.id, diffs, row });
                }
            }
            None => {
                let suggestion = by_normalized_name.get(&normalize_text(&row.name));
                new_items.push(ItemCsvNewRow {
                    row_line: raw.line,
                    suggested_item_id: suggestion.map(|i| i.id),
                    suggested_item_name: suggestion.map(|i| i.name.clone()),
                    row,
                });
            }
        }
    }

    let missing_items = all_items
        .iter()
        .filter(|i| i.active && !matched_ids.contains(&i.id))
        .map(|i| ItemCsvMissingItem { item_id: i.id, code: i.code.clone(), name: i.name.clone(), quantity: i.quantity })
        .collect();

    Ok(ItemsCsvImportPreview { new_items, changed_items, missing_items, errors })
}

/// Admin-only — applies a decision already reviewed on the summary screen.
/// Trusts the field values in `decision` the same way `update_item` trusts an
/// admin's form submission (no re-diff against the DB here); still re-checks
/// code uniqueness and non-negative price/quantity server-side rather than
/// assuming the frontend enforced it. One transaction for the whole import —
/// either everything lands or nothing does.
#[tauri::command]
pub fn apply_items_csv_import(state: State<AppState>, decision: ItemsCsvImportDecision) -> Result<ItemsCsvImportResult, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    let admin_id = require_admin(&state, &conn)?;

    for create in &decision.creates {
        validate_csv_row(&create.row)?;
    }
    for update in &decision.updates {
        validate_csv_row(&update.row)?;
    }
    for missing in &decision.missing_actions {
        if !matches!(missing.action.as_str(), "keep" | "zero" | "deactivate") {
            return Err(format!("Ação inválida para item ausente: {}", missing.action));
        }
    }

    let mut created = 0i64;
    let mut updated = 0i64;
    let mut missing_handled = 0i64;

    {
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        for create in &decision.creates {
            let row = &create.row;
            let trimmed_code = row.code.trim();
            let final_code = if trimmed_code.is_empty() {
                unique_code(&tx, &predict_next_item_id(&tx)?.to_string())?
            } else if code_taken(&tx, trimmed_code, None)? {
                return Err(format!("Já existe um item com o código \"{trimmed_code}\""));
            } else {
                trimmed_code.to_string()
            };
            let category_id = resolve_category_id(&tx, &row.category)?;
            let active = parse_active(&row.active)?;
            let (cost_price, sale_price) = (round2(row.cost_price), round2(row.sale_price));
            tx.execute(
                "INSERT INTO items (code, name, category_id, cost_price, sale_price, quantity, min_quantity, active) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![final_code, row.name.trim(), category_id, cost_price, sale_price, row.quantity, row.min_quantity, active as i64],
            )
            .map_err(|e| e.to_string())?;
            let id = tx.last_insert_rowid();
            if row.quantity > 0 {
                record_movement(&tx, id, "csv_import", row.quantity, admin_id)?;
            }
            record_price_change(&tx, id, cost_price, sale_price, admin_id)?;
            created += 1;
        }

        for update in &decision.updates {
            let row = &update.row;
            if code_taken(&tx, row.code.trim(), Some(update.item_id))? {
                return Err(format!("Já existe um item com o código \"{}\"", row.code.trim()));
            }
            let (previous_quantity, previous_cost_price, previous_sale_price, previous_name): (i64, f64, f64, String) = tx
                .query_row("SELECT quantity, cost_price, sale_price, name FROM items WHERE id = ?1", params![update.item_id], |r| {
                    Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
                })
                .map_err(|e| e.to_string())?;
            let final_name = if update.keep_existing_name { previous_name } else { row.name.trim().to_string() };
            let category_id = resolve_category_id(&tx, &row.category)?;
            let active = parse_active(&row.active)?;
            let (cost_price, sale_price) = (round2(row.cost_price), round2(row.sale_price));
            tx.execute(
                "UPDATE items SET code = ?1, name = ?2, category_id = ?3, cost_price = ?4, sale_price = ?5, quantity = ?6, min_quantity = ?7, active = ?8 WHERE id = ?9",
                params![row.code.trim(), final_name, category_id, cost_price, sale_price, row.quantity, row.min_quantity, active as i64, update.item_id],
            )
            .map_err(|e| e.to_string())?;
            let delta = row.quantity - previous_quantity;
            if delta != 0 {
                record_movement(&tx, update.item_id, "csv_import", delta, admin_id)?;
            }
            if cost_price != previous_cost_price || sale_price != previous_sale_price {
                record_price_change(&tx, update.item_id, cost_price, sale_price, admin_id)?;
            }
            updated += 1;
        }

        for missing in &decision.missing_actions {
            match missing.action.as_str() {
                "zero" => {
                    let previous_quantity: i64 = tx
                        .query_row("SELECT quantity FROM items WHERE id = ?1", params![missing.item_id], |r| r.get(0))
                        .map_err(|e| e.to_string())?;
                    if previous_quantity != 0 {
                        tx.execute("UPDATE items SET quantity = 0 WHERE id = ?1", params![missing.item_id]).map_err(|e| e.to_string())?;
                        record_movement(&tx, missing.item_id, "csv_import", -previous_quantity, admin_id)?;
                    }
                    missing_handled += 1;
                }
                "deactivate" => {
                    tx.execute("UPDATE items SET active = 0 WHERE id = ?1", params![missing.item_id]).map_err(|e| e.to_string())?;
                    missing_handled += 1;
                }
                _ => {}
            }
        }

        tx.commit().map_err(|e| e.to_string())?;
    }

    Ok(ItemsCsvImportResult { created, updated, missing_handled })
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

    #[test]
    fn normalize_text_folds_accents_and_case() {
        assert_eq!(normalize_text("Lâmpada"), "lampada");
        assert_eq!(normalize_text("  Canção  "), "cancao");
        assert_eq!(normalize_text("CAFÉ"), "cafe");
    }

    #[test]
    fn parse_active_accepts_sim_nao_accent_and_case_insensitive() {
        assert_eq!(parse_active("sim").unwrap(), true);
        assert_eq!(parse_active("SIM").unwrap(), true);
        assert_eq!(parse_active("nao").unwrap(), false);
        assert_eq!(parse_active("Não").unwrap(), false);
        assert!(parse_active("yes").is_err());
    }

    #[test]
    fn validate_csv_row_rejects_negative_values_and_bad_active() {
        let base =
            ItemCsvRow { code: "1".into(), name: "Item".into(), category: "".into(), cost_price: 1.0, sale_price: 2.0, quantity: 1, min_quantity: None, active: "sim".into() };
        assert!(validate_csv_row(&base).is_ok());
        assert!(validate_csv_row(&ItemCsvRow { name: "  ".into(), ..base.clone() }).is_err());
        assert!(validate_csv_row(&ItemCsvRow { cost_price: -1.0, ..base.clone() }).is_err());
        assert!(validate_csv_row(&ItemCsvRow { quantity: -1, ..base.clone() }).is_err());
        assert!(validate_csv_row(&ItemCsvRow { min_quantity: Some(-1), ..base.clone() }).is_err());
        assert!(validate_csv_row(&ItemCsvRow { active: "talvez".into(), ..base }).is_err());
    }

    #[test]
    fn diff_item_reports_only_the_fields_that_changed() {
        let item = ItemSummary {
            id: 1,
            code: "1".into(),
            name: "Caneta".into(),
            category_id: None,
            category_name: None,
            cost_price: 1.0,
            sale_price: 2.0,
            quantity: 10,
            min_quantity: Some(5),
            active: true,
        };
        let same_row = ItemCsvRow {
            code: "1".into(),
            name: "Caneta".into(),
            category: "".into(),
            cost_price: 1.0,
            sale_price: 2.0,
            quantity: 10,
            min_quantity: Some(5),
            active: "sim".into(),
        };
        assert!(diff_item(&item, &same_row).unwrap().is_empty());

        let changed_row = ItemCsvRow { name: "Caneta Azul".into(), quantity: 8, ..same_row };
        let diffs = diff_item(&item, &changed_row).unwrap();
        let fields: Vec<&str> = diffs.iter().map(|d| d.field.as_str()).collect();
        assert_eq!(fields, vec!["nome", "quantidade"]);
    }

    /// Regression test: `ItemCsvRow` is what the frontend receives over the
    /// Tauri IPC (JSON) — it must stay camelCase/English (`code`, `costPrice`,
    /// ...) even though the on-disk CSV uses Portuguese headers. A rename
    /// attribute added directly to `ItemCsvRow` for the CSV's sake would leak
    /// into this JSON too and silently break the frontend (exactly what
    /// happened before `ItemCsvFileRow` was split out — the review screen
    /// rendered blank code/name for every "new" row).
    #[test]
    fn item_csv_row_json_stays_camel_case() {
        let row = ItemCsvRow {
            code: "1".into(),
            name: "Item".into(),
            category: "".into(),
            cost_price: 1.0,
            sale_price: 2.0,
            quantity: 1,
            min_quantity: None,
            active: "sim".into(),
        };
        let json = serde_json::to_string(&row).unwrap();
        assert!(json.contains("\"code\":\"1\""), "{json}");
        assert!(json.contains("\"costPrice\":1.0"), "{json}");
        assert!(!json.contains("codigo"));
        assert!(!json.contains("preco_custo"));
    }

    #[test]
    fn csv_file_row_round_trips_through_csv_util_with_portuguese_headers() {
        let path = std::env::temp_dir().join("stockly_test_items_roundtrip.csv");
        let rows = vec![ItemCsvFileRow::from(&ItemCsvRow {
            code: "A1".into(),
            name: "Caneta Azul".into(),
            category: "Papelaria".into(),
            cost_price: 1.5,
            sale_price: 3.0,
            quantity: 10,
            min_quantity: Some(2),
            active: "sim".into(),
        })];
        csv_util::write_csv(&path, &rows).unwrap();

        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.contains("codigo;nome;categoria;preco_custo;preco_venda;quantidade;quantidade_minima;ativo"));

        let read_back = csv_util::read_csv::<ItemCsvFileRow>(&path).unwrap();
        std::fs::remove_file(&path).ok();

        assert_eq!(read_back.len(), 1);
        let row: ItemCsvRow = read_back.into_iter().next().unwrap().value.unwrap().into();
        assert_eq!(row.code, "A1");
        assert_eq!(row.name, "Caneta Azul");
        assert_eq!(row.category, "Papelaria");
    }

    #[test]
    fn resolve_category_id_finds_or_creates_by_exact_name() {
        let conn = test_connection();
        assert_eq!(resolve_category_id(&conn, "  ").unwrap(), None);
        let created = resolve_category_id(&conn, "Papelaria").unwrap().unwrap();
        assert_eq!(resolve_category_id(&conn, "Papelaria").unwrap(), Some(created));
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
    }
}
