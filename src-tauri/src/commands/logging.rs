use chrono::Local;
use std::io::Write;
use tauri::{AppHandle, Manager};

fn append_log(app: &AppHandle, level: &str, message: &str) {
    let Ok(log_dir) = app.path().app_log_dir() else { return };
    let _ = std::fs::create_dir_all(&log_dir);
    let now = Local::now();
    let log_file = log_dir.join(format!("log-{}.txt", now.format("%Y%m%d")));
    let line = format!("[{}] [{}] {}\n", now.format("%Y-%m-%d %H:%M:%S%.3f"), level, message);
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(log_file) {
        let _ = f.write_all(line.as_bytes());
    }
}

#[tauri::command]
pub fn write_log(app: AppHandle, level: String, message: String) {
    append_log(&app, &level, &message);
}

#[tauri::command]
pub fn open_log_dir(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let log_dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&log_dir).ok();
    app.opener()
        .open_path(log_dir.to_string_lossy(), None::<String>)
        .map_err(|e| e.to_string())
}
