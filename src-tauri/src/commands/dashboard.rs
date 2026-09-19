use super::clients::client_balance;
use super::config::low_stock_percent;
use crate::guard::require_admin;
use crate::models::{
    CancelledSalesSummary, CategorySalesSummary, DailySalesSummary, DashboardData, LowStockItemSummary,
    PaymentMethodSalesSummary, RecentSaleSummary, ReminderDueSummary, TopSellingItemSummary,
};
use crate::money::round2;
use crate::AppState;
use chrono::{Datelike, Duration, Local};
use rusqlite::{params, Connection};
use tauri::State;

/// Same threshold as `DevedoresPage.tsx`'s `ReminderBadge` — kept in sync by
/// hand since there's no shared Rust/TS date-rules module yet; bump both if
/// this ever changes.
const REMINDER_WARNING_DAYS: i64 = 7;
const RECENT_SALES_LIMIT: i64 = 8;
const TOP_ITEMS_LIMIT: i64 = 10;
const LOW_STOCK_ITEMS_LIMIT: i64 = 10;
const REMINDERS_LIMIT: i64 = 10;

fn scalar_f64(conn: &Connection, sql: &str, param: &str) -> Result<f64, String> {
    conn.query_row(sql, params![param], |row| row.get(0)).map_err(|e| e.to_string())
}

fn scalar_i64(conn: &Connection, sql: &str, param: &str) -> Result<i64, String> {
    conn.query_row(sql, params![param], |row| row.get(0)).map_err(|e| e.to_string())
}

fn scalar_f64_no_param(conn: &Connection, sql: &str) -> Result<f64, String> {
    conn.query_row(sql, [], |row| row.get(0)).map_err(|e| e.to_string())
}

fn scalar_i64_no_param(conn: &Connection, sql: &str) -> Result<i64, String> {
    conn.query_row(sql, [], |row| row.get(0)).map_err(|e| e.to_string())
}

fn previous_month_str(today: chrono::DateTime<Local>) -> String {
    let (y, m) = (today.year(), today.month());
    let (py, pm) = if m == 1 { (y - 1, 12) } else { (y, m - 1) };
    format!("{py:04}-{pm:02}")
}

/// Same formula as `lowStockWarningThreshold` in `src/lib/api.ts` — hand-kept
/// in sync, no shared Rust/TS module for it yet. Using this (not just
/// `quantity <= min_quantity`) matters: Estoque's own "Baixo" chip already
/// covers this wider warning band, on top of the narrower red "Crítico" one,
/// and the Dashboard's low-stock cards need to agree with that, not report a
/// smaller number just because they only checked the critical tier.
fn low_stock_threshold(min_quantity: i64, percent: i64) -> i64 {
    ((min_quantity as f64) * (1.0 + percent as f64 / 100.0)).ceil() as i64
}

/// Every active item at/under its warning threshold, most critical (lowest
/// quantity) first — `low_stock_count` is just this list's full length,
/// `low_stock_items` is its first `LOW_STOCK_ITEMS_LIMIT`. A zeroed item
/// always qualifies, even with no `min_quantity` set — same "zero is always
/// critical, independent of a configured minimum" rule as `stockStatus()`
/// in `src/lib/api.ts` — so the SQL can no longer filter out
/// `min_quantity IS NULL` rows upfront, that filtering happens per-row below
/// instead.
fn low_stock_candidates(conn: &Connection, percent: i64) -> Result<Vec<LowStockItemSummary>, String> {
    let mut stmt = conn.prepare("SELECT name, quantity, min_quantity FROM items WHERE active = 1").map_err(|e| e.to_string())?;
    let rows: Vec<LowStockItemSummary> = stmt
        .query_map([], |row| Ok(LowStockItemSummary { name: row.get(0)?, quantity: row.get(1)?, min_quantity: row.get(2)? }))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut candidates: Vec<LowStockItemSummary> = rows
        .into_iter()
        .filter(|item| item.quantity == 0 || item.min_quantity.is_some_and(|min| item.quantity <= low_stock_threshold(min, percent)))
        .collect();
    candidates.sort_by_key(|item| item.quantity);
    Ok(candidates)
}

fn top_selling_items(conn: &Connection, month: &str) -> Result<Vec<TopSellingItemSummary>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT si.item_name, SUM(si.quantity) as qty
             FROM sale_items si JOIN sales s ON s.id = si.sale_id
             WHERE s.status = 'completed' AND strftime('%Y-%m', s.created_at, 'localtime') = ?1
             GROUP BY si.item_name ORDER BY qty DESC LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![month, TOP_ITEMS_LIMIT], |row| Ok(TopSellingItemSummary { name: row.get(0)?, quantity: row.get(1)? }))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn sales_by_category(conn: &Connection, month: &str) -> Result<Vec<CategorySalesSummary>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT c.name, SUM(si.subtotal) as total
             FROM sale_items si
             JOIN sales s ON s.id = si.sale_id
             LEFT JOIN items i ON i.id = si.item_id
             LEFT JOIN categories c ON c.id = i.category_id
             WHERE s.status = 'completed' AND strftime('%Y-%m', s.created_at, 'localtime') = ?1
             GROUP BY c.name ORDER BY total DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![month], |row| {
            Ok(CategorySalesSummary { category_name: row.get(0)?, total: round2(row.get(1)?) })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn payment_methods(conn: &Connection, month: &str) -> Result<Vec<PaymentMethodSalesSummary>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT sp.payment_method, COUNT(*) FROM sale_payments sp
             JOIN sales s ON s.id = sp.sale_id
             WHERE s.status = 'completed' AND strftime('%Y-%m', s.created_at, 'localtime') = ?1
             GROUP BY sp.payment_method",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![month], |row| Ok(PaymentMethodSalesSummary { payment_method: row.get(0)?, count: row.get(1)? }))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Always returns exactly 7 entries (today plus the 6 days before it), zero-
/// filled for a day with no sales — the trend chart shouldn't have to guess
/// whether a missing day means "no data" or "not fetched yet".
fn sales_last_7_days(conn: &Connection, today: chrono::DateTime<Local>) -> Result<Vec<DailySalesSummary>, String> {
    let start = (today - Duration::days(6)).format("%Y-%m-%d").to_string();
    let mut stmt = conn
        .prepare(
            "SELECT date(created_at, 'localtime') as d, SUM(total) FROM sales
             WHERE status = 'completed' AND date(created_at, 'localtime') >= ?1
             GROUP BY d",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(String, f64)> = stmt
        .query_map(params![start], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let by_day: std::collections::HashMap<String, f64> = rows.into_iter().collect();
    Ok((0..7)
        .map(|i| {
            let date = (today - Duration::days(6 - i)).format("%Y-%m-%d").to_string();
            let total = round2(*by_day.get(&date).unwrap_or(&0.0));
            DailySalesSummary { date, total }
        })
        .collect())
}

fn recent_sales(conn: &Connection) -> Result<Vec<RecentSaleSummary>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT s.receipt_number, s.created_at, u.name, s.total
             FROM sales s JOIN users u ON u.id = s.user_id
             WHERE s.status = 'completed'
             ORDER BY s.created_at DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![RECENT_SALES_LIMIT], |row| {
            Ok(RecentSaleSummary { receipt_number: row.get(0)?, created_at: row.get(1)?, user_name: row.get(2)?, total: row.get(3)? })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Only clients who still owe (`client_balance > 0`) and have a reminder
/// within the same overdue/upcoming window `ReminderBadge` highlights —
/// someone with a reminder 3 months out, or one already fully paid off,
/// isn't something this card needs to flag.
fn reminders_due(conn: &Connection, today: chrono::DateTime<Local>) -> Result<Vec<ReminderDueSummary>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, reminder_date FROM clients WHERE reminder_date IS NOT NULL ORDER BY reminder_date ASC")
        .map_err(|e| e.to_string())?;
    let candidates: Vec<(i64, String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let today_date = today.date_naive();
    let mut due = Vec::new();
    for (id, name, reminder_date) in candidates {
        if due.len() as i64 >= REMINDERS_LIMIT {
            break;
        }
        let Ok(parsed) = chrono::NaiveDate::parse_from_str(&reminder_date, "%Y-%m-%d") else { continue };
        let days = (parsed - today_date).num_days();
        if days > REMINDER_WARNING_DAYS {
            continue;
        }
        if client_balance(conn, id)? <= 0.0 {
            continue;
        }
        due.push(ReminderDueSummary { client_id: id, client_name: name, reminder_date, overdue: days < 0 });
    }
    Ok(due)
}

fn credit_outstanding_total(conn: &Connection) -> Result<f64, String> {
    let ids: Vec<i64> = {
        let mut stmt = conn.prepare("SELECT id FROM clients").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| row.get(0)).map_err(|e| e.to_string())?;
        rows.collect::<Result<_, _>>().map_err(|e| e.to_string())?
    };
    let mut total = 0.0;
    for id in ids {
        let balance = client_balance(conn, id)?;
        if balance > 0.0 {
            total += balance;
        }
    }
    Ok(round2(total))
}

/// Everything every Dashboard card needs, in one round-trip — see
/// `DashboardData`. Admin-only; every money/count figure keyed off
/// "hoje"/"mês atual" uses local time
/// (`'localtime'` in SQL, `chrono::Local` in Rust), matching how the rest of
/// the app converts the UTC `created_at` columns for display.
#[tauri::command]
pub fn get_dashboard_data(state: State<AppState>) -> Result<DashboardData, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;

    let today = Local::now();
    let today_str = today.format("%Y-%m-%d").to_string();
    let month_str = today.format("%Y-%m").to_string();
    let previous_month_str = previous_month_str(today);

    let items_in_stock = scalar_i64_no_param(&conn, "SELECT COALESCE(SUM(quantity), 0) FROM items WHERE active = 1")?;
    let stock_value = round2(scalar_f64_no_param(&conn, "SELECT COALESCE(SUM(cost_price * quantity), 0) FROM items WHERE active = 1")?);

    let sales_today = round2(scalar_f64(
        &conn,
        "SELECT COALESCE(SUM(total), 0) FROM sales WHERE status = 'completed' AND date(created_at, 'localtime') = ?1",
        &today_str,
    )?);
    let sales_month = round2(scalar_f64(
        &conn,
        "SELECT COALESCE(SUM(total), 0) FROM sales WHERE status = 'completed' AND strftime('%Y-%m', created_at, 'localtime') = ?1",
        &month_str,
    )?);

    let received_today = round2(
        scalar_f64(
            &conn,
            "SELECT COALESCE(SUM(sp.amount), 0) FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
             WHERE sp.payment_method IN ('cash','card','pix') AND s.status = 'completed' AND date(s.created_at, 'localtime') = ?1",
            &today_str,
        )? + scalar_f64(
            &conn,
            "SELECT COALESCE(SUM(amount), 0) FROM credit_payments WHERE cancelled_at IS NULL AND date(created_at, 'localtime') = ?1",
            &today_str,
        )?,
    );
    let received_month = round2(
        scalar_f64(
            &conn,
            "SELECT COALESCE(SUM(sp.amount), 0) FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
             WHERE sp.payment_method IN ('cash','card','pix') AND s.status = 'completed' AND strftime('%Y-%m', s.created_at, 'localtime') = ?1",
            &month_str,
        )? + scalar_f64(
            &conn,
            "SELECT COALESCE(SUM(amount), 0) FROM credit_payments WHERE cancelled_at IS NULL AND strftime('%Y-%m', created_at, 'localtime') = ?1",
            &month_str,
        )?,
    );

    let low_stock_candidates = low_stock_candidates(&conn, low_stock_percent(&conn)?)?;
    let low_stock_count = low_stock_candidates.len() as i64;
    let low_stock_items: Vec<LowStockItemSummary> = low_stock_candidates.into_iter().take(LOW_STOCK_ITEMS_LIMIT as usize).collect();

    let previous_month_total =
        scalar_f64(&conn, "SELECT COALESCE(SUM(total), 0) FROM sales WHERE status = 'completed' AND strftime('%Y-%m', created_at, 'localtime') = ?1", &previous_month_str)?;
    let month_comparison_percent =
        if previous_month_total > 0.0 { Some(round2((sales_month - previous_month_total) / previous_month_total * 100.0)) } else { None };

    let discount_granted_month = round2(scalar_f64(
        &conn,
        "SELECT COALESCE(SUM(
            (SELECT COALESCE(SUM(si.unit_price * si.quantity), 0) FROM sale_items si WHERE si.sale_id = s.id) - s.total
         ), 0)
         FROM sales s WHERE s.status = 'completed' AND strftime('%Y-%m', s.created_at, 'localtime') = ?1",
        &month_str,
    )?);

    let cancelled_count = scalar_i64(
        &conn,
        "SELECT COUNT(*) FROM sales WHERE status = 'cancelled' AND strftime('%Y-%m', cancelled_at, 'localtime') = ?1",
        &month_str,
    )?;
    let cancelled_total = round2(scalar_f64(
        &conn,
        "SELECT COALESCE(SUM(total), 0) FROM sales WHERE status = 'cancelled' AND strftime('%Y-%m', cancelled_at, 'localtime') = ?1",
        &month_str,
    )?);

    Ok(DashboardData {
        items_in_stock,
        stock_value,
        sales_today,
        sales_month,
        received_today,
        received_month,
        low_stock_count,
        low_stock_items,
        top_selling_items: top_selling_items(&conn, &month_str)?,
        sales_by_category: sales_by_category(&conn, &month_str)?,
        payment_methods: payment_methods(&conn, &month_str)?,
        sales_last_7_days: sales_last_7_days(&conn, today)?,
        recent_sales: recent_sales(&conn)?,
        month_comparison_percent,
        reminders_due: reminders_due(&conn, today)?,
        credit_outstanding_total: credit_outstanding_total(&conn)?,
        discount_granted_month,
        cancelled_sales_month: CancelledSalesSummary { count: cancelled_count, total_value: cancelled_total },
    })
}
