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
