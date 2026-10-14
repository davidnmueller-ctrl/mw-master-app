mod commands;

use mwmaster_core::Db;
use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<Db>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Private data lives in the app data folder, which updates and
            // reinstalls leave untouched:
            // Windows: %APPDATA%\de.maxbergt.mwmaster\mwmaster.db
            // macOS:   ~/Library/Application Support/de.maxbergt.mwmaster/mwmaster.db
            let dir = app.path().app_data_dir()?;
            let db = Db::open(&dir.join("mwmaster.db"))?;
            app.manage(AppState { db: Mutex::new(db) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::kv_get,
            commands::kv_set,
            commands::belegungen_list,
            commands::belegung_upsert,
            commands::belegung_delete,
            commands::shared_manifest,
            commands::shared_read,
            commands::shared_read_files,
            commands::backup_write,
            commands::backup_restore,
            commands::data_dir,
            commands::ics_write,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
