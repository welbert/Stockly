mod commands;
mod db;

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub db_path: PathBuf,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir().expect("sem diretório de dados do app");
            std::fs::create_dir_all(&data_dir).expect("falha ao criar diretório de dados");
            let db_path = data_dir.join("stockly.db");
            let conn = db::open_connection(db_path.clone()).expect("falha ao abrir o banco");

            app.manage(AppState {
                db: Mutex::new(conn),
                db_path,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::logging::write_log,
            commands::logging::open_log_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
