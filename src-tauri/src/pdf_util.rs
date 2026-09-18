use crate::money::fmt_money;
use genpdf::{elements, fonts, style, Document, Element, PaperSize};
use std::path::Path;

/// Courier Prime (SIL OFL license, see `assets/fonts/OFL.txt`) — embedded in
/// the binary via `include_bytes!` rather than loaded from a directory at
/// runtime, so packaging never depends on resolving a resource path. Shared
/// by every PDF generator (`commands::receipts`, and any report PDF built on
/// `write_report_pdf` below) — one font setup, not one per module.
pub(crate) fn font_family() -> Result<fonts::FontFamily<fonts::FontData>, String> {
    let regular = include_bytes!("../assets/fonts/CourierPrime-Regular.ttf").to_vec();
    let bold = include_bytes!("../assets/fonts/CourierPrime-Bold.ttf").to_vec();
    let italic = include_bytes!("../assets/fonts/CourierPrime-Italic.ttf").to_vec();
    let bold_italic = include_bytes!("../assets/fonts/CourierPrime-BoldItalic.ttf").to_vec();
    Ok(fonts::FontFamily {
        regular: fonts::FontData::new(regular, None).map_err(|e| e.to_string())?,
        bold: fonts::FontData::new(bold, None).map_err(|e| e.to_string())?,
        italic: fonts::FontData::new(italic, None).map_err(|e| e.to_string())?,
        bold_italic: fonts::FontData::new(bold_italic, None).map_err(|e| e.to_string())?,
    })
}

/// One (label, value) pair from a report's on-screen stat cards, shown as a
/// summary row under the title — e.g. `{ label: "Total vendido", value: "R$
/// 3.240,60" }`. Already formatted by the frontend (same values the cards
/// show), not recomputed here.
pub(crate) struct ReportPdfStat {
    pub label: String,
    pub value: String,
}

/// A report's raw data table — the same rows the on-screen listing and CSV
/// export already show, laid out as a genpdf table instead.
pub(crate) struct ReportPdfTable {
    pub headers: Vec<String>,
    /// Same length as `headers` — relative column width, passed straight to
    /// `TableLayout::new`.
    pub column_weights: Vec<usize>,
    pub rows: Vec<Vec<String>>,
}

/// Generic "data report" PDF: title/subtitle, a row of stat summaries, and a
/// bordered table — the shape every Relatórios screen follows (stat cards +
/// listing), **minus the on-screen chart**: genpdf is a text/table layout
/// library with no drawing/canvas API, so reproducing a chart isn't
/// realistic here (decided when wiring "Vendas por período"'s export —
/// the chart stays an on-screen-only aid, the PDF is the printable data
/// sheet). Any future report reuses this instead of hand-building its own
/// PDF layout, the same way every CSV export reuses `csv_util::write_csv`.
pub(crate) fn write_report_pdf(
    path: &Path,
    title: &str,
    subtitle: &str,
    stats: &[ReportPdfStat],
    table: &ReportPdfTable,
) -> Result<(), String> {
    let mut doc = Document::new(font_family()?);
    doc.set_title(title.to_string());
    doc.set_font_size(10);
    let mut decorator = genpdf::SimplePageDecorator::new();
    decorator.set_margins(12);
    doc.set_page_decorator(decorator);
    doc.set_paper_size(PaperSize::A4);

    doc.push(elements::Paragraph::new(title.to_string()).styled(style::Style::new().bold().with_font_size(15)));
    if !subtitle.is_empty() {
        doc.push(elements::Paragraph::new(subtitle.to_string()).styled(style::Style::new().with_font_size(9)));
    }
    doc.push(elements::Break::new(1));

    // genpdf's `TableLayout` renders cell content flush against the frame
    // border with no padding of its own — `.padded()` (an `Element` default
    // method) is what actually gives header text and wrapped multi-line
    // cells (e.g. a date that wraps onto its own "HH:MM" line) breathing
    // room, both from the border and between lines. The data table uses a
    // smaller font (7pt vs. the stats' 8/12pt) specifically to leave enough
    // room for a fixed-width, unbreakable field like "Recibo" (always 14
    // digits, no spaces to wrap at) — genpdf drops a word it can't fit
    // instead of overflowing the cell, so that column being even ~1mm too
    // narrow silently blanks it out rather than just looking cramped.
    let stats_padding = (1.5, 2.0);
    let table_padding = (1.0, 1.5);
    let table_font_size = 7;

    if !stats.is_empty() {
        let mut stats_table = elements::TableLayout::new(vec![1; stats.len()]);
        let mut row = stats_table.row();
        for stat in stats {
            let mut cell = elements::LinearLayout::vertical();
            cell.push(elements::Paragraph::new(stat.label.clone()).styled(style::Style::new().with_font_size(8)));
            cell.push(elements::Paragraph::new(stat.value.clone()).styled(style::Style::new().bold().with_font_size(12)));
            row.push_element(cell.padded(stats_padding));
        }
        row.push().map_err(|e| e.to_string())?;
        doc.push(stats_table);
        doc.push(elements::Break::new(1));
    }

    if table.rows.is_empty() {
        doc.push(elements::Paragraph::new("Nenhum dado no período selecionado."));
    } else {
        let mut pdf_table = elements::TableLayout::new(table.column_weights.clone());
        pdf_table.set_cell_decorator(elements::FrameCellDecorator::new(true, true, false));

        let mut header_row = pdf_table.row();
        for header in &table.headers {
            header_row.push_element(
                elements::Paragraph::new(header.clone())
                    .styled(style::Style::new().bold().with_font_size(table_font_size))
                    .padded(table_padding),
            );
        }
        header_row.push().map_err(|e| e.to_string())?;

        for record in &table.rows {
            let mut row = pdf_table.row();
            for cell in record {
                row.push_element(
                    elements::Paragraph::new(cell.clone())
                        .styled(style::Style::new().with_font_size(table_font_size))
                        .padded(table_padding),
                );
            }
            row.push().map_err(|e| e.to_string())?;
        }
        doc.push(pdf_table);
    }

    doc.render_to_file(path).map_err(|e| e.to_string())
}

/// `"-R$ X,XX"` for a positive discount, `"—"` for none — same convention
/// the frontend's tables/receipt already use.
pub(crate) fn fmt_discount(value: f64) -> String {
    if value > 0.0 {
        format!("-{}", fmt_money(value))
    } else {
        "—".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fmt_discount_formats_positive_only() {
        assert_eq!(fmt_discount(5.0), "-R$ 5,00");
        assert_eq!(fmt_discount(0.0), "—");
    }

    /// Smoke test: the `TableLayout` + `LinearLayout` (stats) + `TableLayout`
    /// with `FrameCellDecorator` (data table) combination actually renders
    /// without panicking or erroring, both with and without rows — genpdf
    /// errors (e.g. a row/column-count mismatch) only surface at render time,
    /// not at compile time.
    #[test]
    fn write_report_pdf_renders_with_and_without_rows() {
        let stats = vec![ReportPdfStat { label: "Total".into(), value: "R$ 10,00".into() }];
        let table = ReportPdfTable {
            headers: vec!["Recibo".into(), "Total".into()],
            column_weights: vec![1, 1],
            rows: vec![vec!["1".into(), "R$ 10,00".into()]],
        };

        let path = std::env::temp_dir().join("stockly_test_report_with_rows.pdf");
        write_report_pdf(&path, "Título", "Subtítulo", &stats, &table).unwrap();
        assert!(std::fs::metadata(&path).unwrap().len() > 0);
        std::fs::remove_file(&path).ok();

        let empty_table = ReportPdfTable { headers: table.headers, column_weights: table.column_weights, rows: vec![] };
        let path = std::env::temp_dir().join("stockly_test_report_empty.pdf");
        write_report_pdf(&path, "Título", "", &[], &empty_table).unwrap();
        assert!(std::fs::metadata(&path).unwrap().len() > 0);
        std::fs::remove_file(&path).ok();
    }
}
