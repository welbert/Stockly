use crate::csv_util;
use crate::guard::active_user_id;
use crate::models::ReportPdfStatInput;
use crate::pdf_util::{self, ReportPdfStat, ReportPdfTable};
use crate::AppState;
use std::path::Path;
use tauri::State;

/// Generic table export, for any report whose aggregated shape doesn't match
/// a dedicated Rust struct/command (a categoria breakdown, a forma de
/// pagamento breakdown, ...) — `commands::sales::export_sales_csv` stays the
/// one exception, since "Vendas por período" already exports full per-sale
/// rows via `SaleCsvRow`, a shape worth its own type. Any logged-in profile,
/// same access as every other Vendas report export; no DB access, the caller
/// already has `headers`/`rows` on screen.
#[tauri::command]
pub fn export_report_csv(state: State<AppState>, path: String, headers: Vec<String>, rows: Vec<Vec<String>>) -> Result<(), String> {
    active_user_id(&state)?;
    csv_util::write_csv_table(Path::new(&path), &headers, &rows)
}

/// PDF counterpart of `export_report_csv`, built on `pdf_util::write_report_pdf`
/// (same generic "title + stats + bordered table" layout `export_sales_report_pdf`
/// uses) — `column_weights` is the caller's call since only it knows which
/// columns hold long, unbreakable content (see `pdf_util.rs`'s doc comment on
/// why that matters: a word too wide for its column gets silently dropped,
/// not overflowed).
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn export_report_pdf(
    state: State<AppState>,
    path: String,
    title: String,
    subtitle: String,
    stats: Vec<ReportPdfStatInput>,
    headers: Vec<String>,
    column_weights: Vec<usize>,
    rows: Vec<Vec<String>>,
) -> Result<(), String> {
    active_user_id(&state)?;
    let pdf_stats: Vec<ReportPdfStat> =
        stats.into_iter().map(|s| ReportPdfStat { label: s.label, value: s.value }).collect();
    let table = ReportPdfTable { headers, column_weights, rows };
    pdf_util::write_report_pdf(Path::new(&path), &title, &subtitle, &pdf_stats, &table)
}

/// Opens the OS file explorer at the parent directory of `path` — the
/// "Clique aqui para abrir a pasta" action on every export success toast
/// (`useToast`, `src/context/ToastContext.tsx`). Lives here (not its own
/// module) despite not being report-specific: it's the same "generic export
/// helper" shape as the two commands above, just triggered from Estoque's
/// CSV export too, not only Relatórios. Unlike `commands::receipts::
/// open_receipts_folder` (always the same fixed `recibos/` dir), `path` is
/// wherever the frontend's own save dialog put the file.
#[tauri::command]
pub fn open_containing_folder(app: tauri::AppHandle, state: State<AppState>, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    active_user_id(&state)?;
    let parent = Path::new(&path).parent().ok_or_else(|| "Caminho inválido".to_string())?;
    app.opener().open_path(parent.to_string_lossy(), None::<String>).map_err(|e| e.to_string())
}
