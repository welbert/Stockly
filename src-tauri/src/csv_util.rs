use serde::{de::DeserializeOwned, Serialize};
use std::io::Write;
use std::path::Path;

/// `;` delimiter (not `,`) so a pt-BR Excel install opens the file correctly
/// on double-click instead of dumping every field into column A — Excel's
/// pt-BR locale treats `,` as the decimal separator, not a field separator.
const DELIMITER: u8 = b';';

/// UTF-8 BOM so Excel renders accented characters correctly instead of
/// guessing the wrong codepage.
const BOM: [u8; 3] = [0xEF, 0xBB, 0xBF];

/// Writes `rows` as a `;`-delimited, UTF-8 (BOM) CSV file at `path` — headers
/// come from each field's `#[serde(rename = "...")]`. Generic on purpose: any
/// domain (items today, reports later) serializes its own row type here
/// instead of hand-rolling CSV writing again.
pub fn write_csv<T: Serialize>(path: &Path, rows: &[T]) -> Result<(), String> {
    let mut file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    file.write_all(&BOM).map_err(|e| e.to_string())?;
    let mut wtr = csv::WriterBuilder::new().delimiter(DELIMITER).from_writer(file);
    for row in rows {
        wtr.serialize(row).map_err(|e| e.to_string())?;
    }
    wtr.flush().map_err(|e| e.to_string())?;
    Ok(())
}

/// Writes an arbitrary string table (`headers` + `rows`, each row the same
/// length as `headers`) as `;`-delimited, UTF-8 (BOM) CSV — for a report
/// whose aggregated shape doesn't match any single Rust struct (a payment-
/// method breakdown, a category breakdown, ...). Unlike `write_csv`, there's
/// no wire/file-shape split needed here: the caller already sends the exact
/// display strings to write, headers included — nothing to translate, since
/// this isn't fed back through any `#[derive(Deserialize)]` IPC type the way
/// `ItemCsvRow`/`SaleCsvRow` are.
pub fn write_csv_table(path: &Path, headers: &[String], rows: &[Vec<String>]) -> Result<(), String> {
    let mut file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    file.write_all(&BOM).map_err(|e| e.to_string())?;
    let mut wtr = csv::WriterBuilder::new().delimiter(DELIMITER).from_writer(file);
    wtr.write_record(headers).map_err(|e| e.to_string())?;
    for row in rows {
        wtr.write_record(row).map_err(|e| e.to_string())?;
    }
    wtr.flush().map_err(|e| e.to_string())?;
    Ok(())
}

/// One parsed (or failed) CSV data row. `line` is 1-based and counts the
/// header row (so the first data row is `2`), matching what a spreadsheet
/// program shows — easier for an admin to find the bad line in Excel.
pub struct CsvRowResult<T> {
    pub line: usize,
    pub value: Result<T, String>,
}

/// Reads a `;`-delimited CSV file (BOM tolerated) into `T` via serde, one
/// [`CsvRowResult`] per data row — a malformed row doesn't abort the whole
/// import, it's just reported back next to the rows that parsed fine, so the
/// caller can show a per-row error list instead of an all-or-nothing failure.
pub fn read_csv<T: DeserializeOwned>(path: &Path) -> Result<Vec<CsvRowResult<T>>, String> {
    let content = std::fs::read(path).map_err(|e| e.to_string())?;
    let content = content.strip_prefix(&BOM).unwrap_or(&content);
    let mut rdr = csv::ReaderBuilder::new().delimiter(DELIMITER).from_reader(content);
    let mut out = Vec::new();
    for (i, result) in rdr.deserialize::<T>().enumerate() {
        out.push(CsvRowResult { line: i + 2, value: result.map_err(|e| e.to_string()) });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_csv_table_writes_arbitrary_headers_and_rows() {
        let path = std::env::temp_dir().join("stockly_test_csv_table.csv");
        let headers = vec!["Categoria".to_string(), "Total".to_string()];
        let rows = vec![vec!["Elétrica".to_string(), "R$ 100,00".to_string()], vec!["Categoria indefinida".to_string(), "R$ 5,00".to_string()]];
        write_csv_table(&path, &headers, &rows).unwrap();

        let content = std::fs::read_to_string(&path).unwrap();
        std::fs::remove_file(&path).ok();
        assert!(content.contains("Categoria;Total"));
        assert!(content.contains("Elétrica;R$ 100,00"));
    }
}
