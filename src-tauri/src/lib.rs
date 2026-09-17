mod commands;
mod db;
mod guard;
mod models;
mod money;

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub db_path: PathBuf,
    pub active_user_id: Mutex<Option<i64>>,
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
                active_user_id: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::logging::write_log,
            commands::logging::open_log_dir,
            commands::users::has_any_users,
            commands::users::list_login_profiles,
            commands::users::list_users,
            commands::users::create_user,
            commands::users::update_user,
            commands::users::delete_user,
            commands::users::update_theme,
            commands::users::update_my_auto_lock,
            commands::auth::login,
            commands::auth::logout,
            commands::auth::get_active_user,
            commands::auth::verify_password,
            commands::categories::list_categories,
            commands::categories::create_category,
            commands::categories::rename_category,
            commands::categories::delete_category,
            commands::items::list_items,
            commands::items::create_item,
            commands::items::update_item,
            commands::items::delete_item,
            commands::items::add_stock_entry,
            commands::items::deactivate_item,
            commands::config::get_low_stock_percent,
            commands::config::set_low_stock_percent,
            commands::config::get_default_profit_margin,
            commands::config::set_default_profit_margin,
            commands::config::get_store_name,
            commands::config::set_store_name,
            commands::config::get_store_info,
            commands::config::set_store_info,
            commands::config::get_receipt_thank_you_message,
            commands::config::set_receipt_thank_you_message,
            commands::users::list_admins,
            commands::sales::create_sale,
            commands::receipts::regenerate_receipt_pdf,
            commands::receipts::print_file,
            commands::receipts::open_receipts_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
