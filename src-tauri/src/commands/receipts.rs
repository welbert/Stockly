use crate::commands::config::{config_string, DEFAULT_THANK_YOU_MESSAGE, RECEIPT_THANK_YOU_KEY, STORE_INFO_KEY, STORE_NAME_KEY};
use crate::guard::active_user_id;
use crate::AppState;
use chrono::{Local, NaiveDateTime, TimeZone, Utc};
use genpdf::{elements, fonts, style, Alignment, Document, Element};
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::State;

/// Courier Prime (SIL OFL license, see `assets/fonts/OFL.txt`) — embedded in
/// the binary via `include_bytes!` rather than loaded from a directory at
/// runtime, so packaging never depends on resolving a resource path.
fn font_family() -> Result<genpdf::fonts::FontFamily<fonts::FontData>, String> {
    let regular = include_bytes!("../../assets/fonts/CourierPrime-Regular.ttf").to_vec();
    let bold = include_bytes!("../../assets/fonts/CourierPrime-Bold.ttf").to_vec();
    let italic = include_bytes!("../../assets/fonts/CourierPrime-Italic.ttf").to_vec();
    let bold_italic = include_bytes!("../../assets/fonts/CourierPrime-BoldItalic.ttf").to_vec();
    Ok(fonts::FontFamily {
        regular: fonts::FontData::new(regular, None).map_err(|e| e.to_string())?,
        bold: fonts::FontData::new(bold, None).map_err(|e| e.to_string())?,
        italic: fonts::FontData::new(italic, None).map_err(|e| e.to_string())?,
        bold_italic: fonts::FontData::new(bold_italic, None).map_err(|e| e.to_string())?,
    })
}

/// `<pasta de dados do app>/recibos/` — sibling of `stockly.db`, not inside it.
pub(crate) fn receipts_dir(db_path: &Path) -> PathBuf {
    db_path.parent().map(|p| p.join("recibos")).unwrap_or_else(|| PathBuf::from("recibos"))
}

/// `sales.created_at` is stored as SQLite's `datetime('now')`, which is UTC —
/// convert to local time for display, same as the frontend's `fmtDateTime`
/// does, so the printed receipt and the on-screen preview never disagree.
/// Falls back to the raw string if it doesn't parse (should never happen —
/// the column is always written by the same `datetime('now')` default).
fn fmt_local_datetime(sqlite_utc: &str) -> String {
    match NaiveDateTime::parse_from_str(sqlite_utc, "%Y-%m-%d %H:%M:%S") {
        Ok(naive) => Utc.from_utc_datetime(&naive).with_timezone(&Local).format("%d/%m/%Y %H:%M:%S").to_string(),
        Err(_) => sqlite_utc.to_string(),
    }
}

fn fmt_money(value: f64) -> String {
    let negative = value < 0.0;
    let cents = (value.abs() * 100.0).round() as i64;
    let (reais, cents) = (cents / 100, cents % 100);
    let digits: Vec<char> = reais.to_string().chars().rev().collect();
    let mut grouped = String::new();
    for (i, c) in digits.iter().enumerate() {
        if i > 0 && i % 3 == 0 {
            grouped.push('.');
        }
        grouped.push(*c);
    }
    let reais_str: String = grouped.chars().rev().collect();
    format!("{}R$ {reais_str},{cents:02}", if negative { "-" } else { "" })
}

fn push_line(doc: &mut Document, label: impl Into<String>, value: impl Into<String>, bold: bool) {
    let mut table = elements::TableLayout::new(vec![3, 2]);
    let mut row = table.row();
    let label_p = elements::Paragraph::new(label.into());
    let value_p = elements::Paragraph::new(value.into()).aligned(Alignment::Right);
    if bold {
        row.push_element(label_p.styled(style::Style::new().bold()));
        row.push_element(value_p.styled(style::Style::new().bold()));
    } else {
        row.push_element(label_p);
        row.push_element(value_p);
    }
    let _ = row.push();
    doc.push(table);
}

fn push_separator(doc: &mut Document) {
    doc.push(elements::Paragraph::new("-".repeat(32)));
}

/// The full sale (items, discounts, payment) is re-fetched fresh from the DB
/// by `sale_id` — never regenerated from data the caller could have stale or
/// tampered with. Overwrites any previous PDF for the same sale (same
/// filename, derived from the receipt number, which never changes).
pub(crate) fn render_receipt_pdf(conn: &Connection, sale_id: i64, dir: &Path) -> Result<PathBuf, String> {
    let sale = crate::commands::sales::fetch_sale_detail(conn, sale_id, None)?;

    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("recibo-{}.pdf", sale.receipt_number));

    let mut doc = Document::new(font_family()?);
    doc.set_title(format!("Recibo {}", sale.receipt_number));
    doc.set_font_size(8);
    let mut decorator = genpdf::SimplePageDecorator::new();
    decorator.set_margins(4);
    doc.set_page_decorator(decorator);

    let store_name = config_string(conn, STORE_NAME_KEY)?;
    let store_name = if store_name.is_empty() { "BORA VENDER".to_string() } else { store_name };
    let store_info_lines: Vec<String> =
        config_string(conn, STORE_INFO_KEY)?.lines().map(str::trim).filter(|l| !l.is_empty()).map(str::to_string).collect();

    let item_lines = sale.items.len() as f64;
    let height_mm = 46.0
        + item_lines * 9.0
        + store_info_lines.len() as f64 * 4.0
        + if sale.discount_authorized_by_name.is_some() { 5.0 } else { 0.0 }
        + if sale.client_name.is_some() { 5.0 } else { 0.0 }
        + if sale.credit_paid.is_some() { 10.0 } else { 0.0 };
    doc.set_paper_size((80, height_mm));

    doc.push(elements::Paragraph::new(store_name).aligned(Alignment::Center).styled(style::Style::new().bold()));
    for line in &store_info_lines {
        doc.push(elements::Paragraph::new(line.clone()).aligned(Alignment::Center));
    }
    doc.push(elements::Paragraph::new("Recibo de Venda").aligned(Alignment::Center));
    push_separator(&mut doc);
    doc.push(elements::Paragraph::new(format!("Recibo: {}", sale.receipt_number)));
    doc.push(elements::Paragraph::new(format!("Data: {}", fmt_local_datetime(&sale.created_at))));
    doc.push(elements::Paragraph::new(format!("Operador: {}", sale.user_name)));
    if let Some(client_name) = &sale.client_name {
        doc.push(elements::Paragraph::new(format!("Cliente (Crediário): {client_name}")));
    }
    push_separator(&mut doc);

    for item in &sale.items {
        doc.push(elements::Paragraph::new(item.item_name.clone()));
        let mut detail = format!("  {}x {}", item.quantity, fmt_money(item.unit_price));
        if let Some(pct) = item.discount_percent {
            detail.push_str(&format!(" (desc. item -{pct:.0}%)"));
        } else if item.discount_amount.is_some() {
            detail.push_str(" (com desconto)");
        }
        push_line(&mut doc, detail, fmt_money(item.subtotal), false);
    }
    push_separator(&mut doc);

    push_line(&mut doc, "Subtotal", fmt_money(sale.subtotal), false);
    if let Some(amount) = sale.discount_amount {
        let label = match sale.discount_percent {
            Some(pct) => format!("Desconto geral (-{pct:.0}%)"),
            None => "Desconto geral".to_string(),
        };
        push_line(&mut doc, label, format!("-{}", fmt_money(amount)), false);
    }
    push_line(&mut doc, "TOTAL", fmt_money(sale.total), true);
    if let Some(paid) = sale.credit_paid {
        push_line(&mut doc, "Valor pago", fmt_money(paid), false);
        push_line(&mut doc, "Saldo Crediário", fmt_money(sale.total - paid), false);
    }
    if let Some(name) = &sale.discount_authorized_by_name {
        doc.push(elements::Paragraph::new(format!("Descontos autorizados por: {name}")).styled(style::Style::new().italic()));
    }
    push_separator(&mut doc);

    let payment_label = match sale.payment_method.as_str() {
        "cash" => "Dinheiro",
        "card" => "Cartão",
        "pix" => "PIX",
        "credit" => "Crediário",
        other => other,
    };
    let thank_you = config_string(conn, RECEIPT_THANK_YOU_KEY)?;
    let thank_you = if thank_you.is_empty() { DEFAULT_THANK_YOU_MESSAGE.to_string() } else { thank_you };

    doc.push(elements::Paragraph::new(format!("Forma de pagamento: {payment_label}")).aligned(Alignment::Center));
    doc.push(elements::Paragraph::new(thank_you).aligned(Alignment::Center));
    doc.push(elements::Break::new(1));
    doc.push(
        elements::Paragraph::new("Não possui valor de documento fiscal")
            .aligned(Alignment::Center)
            .styled(style::Style::new().italic().with_font_size(6)),
    );

    doc.render_to_file(&path).map_err(|e| e.to_string())?;
    Ok(path)
}

/// On-demand regeneration — needed because a sale can exist without a PDF
/// (generation failed right after commit) and because "reimprimir" should
/// always be possible, not just right after the sale.
#[tauri::command]
pub fn regenerate_receipt_pdf(state: State<AppState>, sale_id: i64) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;
    let path = render_receipt_pdf(&conn, sale_id, &receipts_dir(&state.db_path))?;
    Ok(path.to_string_lossy().to_string())
}

/// Windows shell "print" verb (v1 — simplest option; doesn't guarantee a print
/// dialog appears, that depends on whatever's associated with .pdf on the
/// user's machine). The path travels via an environment variable, never
/// interpolated into the PowerShell command string, so a path containing
/// quotes/special characters can't break out of it.
#[tauri::command]
pub fn print_file(state: State<AppState>, path: String) -> Result<(), String> {
    active_user_id(&state)?;
    Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", "Start-Process -FilePath $env:STOCKLY_PRINT_PATH -Verb Print"])
        .env("STOCKLY_PRINT_PATH", &path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn open_receipts_folder(app: tauri::AppHandle, state: State<AppState>) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    active_user_id(&state)?;
    let dir = receipts_dir(&state.db_path);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener().open_path(dir.to_string_lossy(), None::<String>).map_err(|e| e.to_string())
}
