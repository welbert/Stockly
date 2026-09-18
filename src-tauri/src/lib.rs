mod commands;
mod csv_util;
/// `pub` only so `src/bin/seed_demo.rs` (the demo-database generator, see
/// `demo/README.md`) can reuse `init_db`/`migrate_db` instead of duplicating
/// the schema — nothing else outside this crate depends on it.
pub mod db;
mod guard;
mod models;
mod money;
mod pdf_util;

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
            commands::items::export_items_csv,
            commands::items::preview_items_csv_import,
            commands::items::apply_items_csv_import,
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
            commands::sales::get_sale_detail,
            commands::sales::list_sales,
            commands::sales::cancel_sale,
            commands::sales::export_sales_csv,
            commands::sales::export_sales_report_pdf,
            commands::receipts::regenerate_receipt_pdf,
            commands::receipts::print_file,
            commands::receipts::open_receipts_folder,
            commands::receipts::open_receipt_file,
            commands::clients::list_clients,
            commands::clients::create_client,
            commands::clients::update_client,
            commands::clients::get_client_detail,
            commands::clients::register_credit_payment,
            commands::clients::cancel_credit_payment,
            commands::config::get_credit_enabled,
            commands::config::set_credit_enabled,
            commands::dashboard_layout::get_dashboard_layout,
            commands::dashboard_layout::save_dashboard_layout,
            commands::dashboard::get_dashboard_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
