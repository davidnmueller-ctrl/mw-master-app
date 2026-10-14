use crate::AppState;
use mwmaster_core::shared::{self, SharedRead};
use mwmaster_core::{backup, Belegung};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

type Res<T> = Result<T, String>;

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

macro_rules! db {
    ($state:expr) => {
        $state.db.lock().map_err(|e| e.to_string())?
    };
}

fn e<T: std::fmt::Display>(err: T) -> String {
    err.to_string()
}

// ---------------- private data ----------------

#[tauri::command]
pub fn kv_get(state: State<AppState>, key: String) -> Res<Option<String>> {
    db!(state).get_kv(&key).map_err(e)
}

#[tauri::command]
pub fn kv_set(state: State<AppState>, key: String, value: String) -> Res<()> {
    db!(state).set_kv(&key, &value).map_err(e)
}

#[tauri::command]
pub fn belegungen_list(state: State<AppState>) -> Res<Vec<Belegung>> {
    db!(state).list_belegungen().map_err(e)
}

#[tauri::command]
pub fn belegung_upsert(state: State<AppState>, belegung: Belegung) -> Res<Belegung> {
    db!(state).upsert_belegung(&belegung, now_ms()).map_err(e)
}

#[tauri::command]
pub fn belegung_delete(state: State<AppState>, id: i64) -> Res<()> {
    db!(state).delete_belegung(id).map_err(e)
}

// ---------------- shared folder (read-only) ----------------

#[tauri::command]
pub fn shared_manifest(path: String) -> Res<String> {
    shared::read_manifest(&PathBuf::from(path))
}

#[tauri::command]
pub async fn shared_read(path: String) -> Res<SharedRead> {
    // async: runs off the main thread, so a slow OneDrive download of a
    // cloud-only file does not freeze the window.
    shared::read_all(&PathBuf::from(path))
}

/// Read single exam date files from the shared folder (read-only).
#[tauri::command]
pub async fn shared_read_files(path: String, names: Vec<String>) -> Res<SharedRead> {
    shared::read_files(&PathBuf::from(path), &names)
}

// ---------------- backup ----------------

/// Write the private data as JSON into `dir`. Returns the file path.
#[tauri::command]
pub fn backup_write(state: State<AppState>, dir: String) -> Res<String> {
    let snap = db!(state).snapshot().map_err(e)?;
    let path = backup::write_backup(&PathBuf::from(dir), &snap).map_err(e)?;
    Ok(path.to_string_lossy().to_string())
}

/// Replace the private data with a backup or import file. Returns the number
/// of restored Belegungen.
#[tauri::command]
pub fn backup_restore(state: State<AppState>, path: String) -> Res<usize> {
    let snap = backup::read_backup(&PathBuf::from(path)).map_err(e)?;
    db!(state).restore(&snap).map_err(e)?;
    Ok(snap.belegungen.len())
}

#[tauri::command]
pub fn data_dir(app: AppHandle) -> Res<String> {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(e)
}

// ---------------- calendar export ----------------

/// Write the .ics export to the file chosen in the save dialog. Refuses
/// paths inside the shared folder (`shared`, the linked path).
#[tauri::command]
pub fn ics_write(path: String, content: String, shared: Option<String>) -> Res<()> {
    let shared = shared.map(PathBuf::from);
    mwmaster_core::export::write_ics(&PathBuf::from(path), &content, shared.as_deref())
}
