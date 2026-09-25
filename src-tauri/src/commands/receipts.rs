use crate::commands::config::{
    config_string, set_config_string, DEFAULT_THANK_YOU_MESSAGE, PRINTER_NAME_KEY, RECEIPT_THANK_YOU_KEY, STORE_INFO_KEY, STORE_NAME_KEY,
};
use crate::guard::{active_user_id, require_admin};
use crate::models::ReceiptsFolderInfo;
use crate::money::fmt_money;
use crate::pdf_util::font_family;
use crate::AppState;
use chrono::{Local, NaiveDateTime, TimeZone, Utc};
use genpdf::{elements, style, Alignment, Document, Element};
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{Manager, State};

const RECEIPTS_FOLDER_KEY: &str = "receipts_folder";

/// The configured folder (see `RECEIPTS_FOLDER_KEY`, set via Configurações)
/// when there is one, otherwise `<pasta de dados do app>/recibos/` — sibling
/// of `stockly.db`, not inside it. Reads `config` on every call rather than
/// caching, same convention as every other config-backed setting.
pub(crate) fn receipts_dir(conn: &Connection, db_path: &Path) -> Result<PathBuf, String> {
    let configured = config_string(conn, RECEIPTS_FOLDER_KEY)?;
    if !configured.is_empty() {
        return Ok(PathBuf::from(configured));
    }
    Ok(db_path.parent().map(|p| p.join("recibos")).unwrap_or_else(|| PathBuf::from("recibos")))
}

/// Admin-only, matching the rest of the "Recibo" card in Configurações
/// (store name/info/thank-you message) — both roles still print/generate
/// receipts through whatever folder is configured, only *choosing* it is
/// gated.
#[tauri::command]
pub fn get_receipts_folder(state: State<AppState>) -> Result<ReceiptsFolderInfo, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;
    let is_custom = !config_string(&conn, RECEIPTS_FOLDER_KEY)?.is_empty();
    let path = receipts_dir(&conn, &state.db_path)?;
    Ok(ReceiptsFolderInfo { path: path.to_string_lossy().to_string(), is_custom })
}

#[tauri::command]
pub fn set_receipts_folder(state: State<AppState>, path: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;
    set_config_string(&conn, RECEIPTS_FOLDER_KEY, path.trim())
}

/// Reverts to the app's own default folder — same "empty means unset" convention
/// `STORE_NAME_KEY`/`STORE_INFO_KEY` already use, not a deleted row like `backup_folder`.
#[tauri::command]
pub fn clear_receipts_folder(state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;
    set_config_string(&conn, RECEIPTS_FOLDER_KEY, "")
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
        doc.push(elements::Paragraph::new(format!("Cliente: {client_name}")));
    }
    push_separator(&mut doc);

    for item in &sale.items {
        doc.push(elements::Paragraph::new(item.item_name.clone()));
        let mut detail = format!("  {}x {}", item.quantity, fmt_money(item.unit_price));
        if let Some(pct) = item.discount_percent {
            detail.push_str(&format!(" (desc. -{pct:.0}%)"));
        } else if let Some(amount) = item.discount_amount {
            detail.push_str(&format!(" (desc. -{})", fmt_money(amount)));
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
        push_line(&mut doc, "Valor devido", fmt_money(sale.total - paid), false);
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
    let dir = receipts_dir(&conn, &state.db_path)?;
    let path = render_receipt_pdf(&conn, sale_id, &dir)?;
    Ok(path.to_string_lossy().to_string())
}

/// Prints via a bundled SumatraPDF (`vendor/SumatraPDF.exe`, shipped as a
/// Tauri resource — `tauri.conf.json`'s `bundle.resources`) — v2, replacing
/// the Windows shell "print" verb (v1: `Start-Process -Verb Print`), which
/// has no way to *name* a printer and always targets whichever one Windows
/// currently has set as default. `-print-to-default` when `printer_name`
/// (Configurações) is empty (the default — same "empty means fallback"
/// convention as `store_name`/`receipts_folder`), otherwise `-print-to
/// "<name>"`. Invoked directly, no shell string involved at all — a path
/// with quotes/special characters can't break out of anything, since there's
/// no command string to interpolate into in the first place (stronger than
/// v1's env-var workaround, which still went through `powershell -Command`).
/// Fire-and-forget (`spawn`, not `output`) same as v1: SumatraPDF hands the
/// job to the print spooler and exits immediately with `-print-to`/
/// `-print-to-default`, there's nothing further to wait on here.
/// `-print-settings "portrait"` forces portrait regardless of the printer
/// driver's own default/last-used orientation — both receipts (80mm-wide
/// roll) and reports (A4, `pdf_util.rs`) are always authored portrait, so
/// this is safe to hardcode rather than derive per document.
#[tauri::command]
pub fn print_file(app: tauri::AppHandle, state: State<AppState>, path: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;
    let printer_name = config_string(&conn, PRINTER_NAME_KEY)?;
    drop(conn);

    let sumatra_path =
        app.path().resolve("vendor/SumatraPDF.exe", tauri::path::BaseDirectory::Resource).map_err(|e| e.to_string())?;

    let mut cmd = Command::new(sumatra_path);
    if printer_name.is_empty() {
        cmd.arg("-print-to-default");
    } else {
        cmd.args(["-print-to", &printer_name]);
    }
    cmd.args(["-print-settings", "portrait", "-silent", &path]);
    cmd.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

/// Admin-only — feeds the printer picker in Configurações. Shells out to
/// PowerShell/WMI, same "no pure-Rust way to do this without a new
/// dependency" reasoning as printing itself shelling out. `Win32_Printer`
/// (WMI, via `Get-CimInstance`) rather than the newer `Get-Printer` cmdlet —
/// WMI is always available on Windows, `Get-Printer` needs the
/// PrintManagement module present.
#[tauri::command]
pub fn list_printers(state: State<AppState>) -> Result<Vec<String>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_admin(&state, &conn)?;
    drop(conn);
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-CimInstance -ClassName Win32_Printer | Select-Object -ExpandProperty Name",
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err("Não foi possível listar as impressoras".to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect())
}

#[tauri::command]
pub fn open_receipts_folder(app: tauri::AppHandle, state: State<AppState>) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    active_user_id(&state)?;
    let dir = receipts_dir(&conn, &state.db_path)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener().open_path(dir.to_string_lossy(), None::<String>).map_err(|e| e.to_string())
}

/// Opens one specific receipt PDF (e.g. "Abrir PDF" from Histórico de vendas)
/// with whatever's associated with .pdf on the user's machine — as opposed to
/// `open_receipts_folder`, which just reveals the whole folder.
#[tauri::command]
pub fn open_receipt_file(app: tauri::AppHandle, state: State<AppState>, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    active_user_id(&state)?;
    app.opener().open_path(path, None::<String>).map_err(|e| e.to_string())
}
