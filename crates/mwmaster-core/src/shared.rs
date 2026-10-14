//! Reading the shared data folder (OneDrive). Strictly read-only: nothing in
//! this module ever writes to the shared folder.
//!
//! The files are returned as raw text. Parsing and validation against the
//! JSON schemas happen in the frontend (`src/logic/shared.ts`), so a single
//! broken or half-synced file only skips that file.

use serde::Serialize;
use std::path::{Path, PathBuf};

pub const MANIFEST: &str = "manifest.json";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SharedFile {
    /// Path relative to the shared root with forward slashes, e.g. "module/MW0798.json".
    pub name: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileError {
    pub name: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SharedRead {
    /// The folder that actually contains manifest.json.
    pub root: String,
    pub files: Vec<SharedFile>,
    pub errors: Vec<FileError>,
}

/// The user may pick the `shared` folder itself or a folder that contains it
/// (e.g. an unpacked ZIP download). Returns the folder holding manifest.json.
pub fn resolve_root(path: &Path) -> Option<PathBuf> {
    if path.join(MANIFEST).is_file() {
        return Some(path.to_path_buf());
    }
    let nested = path.join("shared");
    if nested.join(MANIFEST).is_file() {
        return Some(nested);
    }
    None
}

/// Read only manifest.json (cheap check whether anything changed).
pub fn read_manifest(path: &Path) -> Result<String, String> {
    let root = resolve_root(path).ok_or_else(|| no_manifest(path))?;
    std::fs::read_to_string(root.join(MANIFEST)).map_err(|e| e.to_string())
}

/// Read manifest.json, regeln.json, tags.json and every module/*.json.
/// Unreadable files end up in `errors` instead of failing the whole read.
pub fn read_all(path: &Path) -> Result<SharedRead, String> {
    let root = resolve_root(path).ok_or_else(|| no_manifest(path))?;
    let mut files = Vec::new();
    let mut errors = Vec::new();

    for name in [MANIFEST, "regeln.json", "tags.json"] {
        read_into(&root.join(name), name, &mut files, &mut errors);
    }

    let module_dir = root.join("module");
    match std::fs::read_dir(&module_dir) {
        Ok(entries) => {
            let mut paths: Vec<PathBuf> = entries
                .filter_map(|e| e.ok().map(|e| e.path()))
                .filter(|p| p.extension().map(|x| x.eq_ignore_ascii_case("json")).unwrap_or(false))
                .collect();
            paths.sort();
            for p in paths {
                let file_name = p.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default();
                read_into(&p, &format!("module/{file_name}"), &mut files, &mut errors);
            }
        }
        Err(e) => errors.push(FileError { name: "module/".into(), error: e.to_string() }),
    }

    Ok(SharedRead { root: root.to_string_lossy().to_string(), files, errors })
}

/// Whether `name` is an exam date file as listed in manifest.pruefungen:
/// "pruefungen/WS26-27.json" or "pruefungen/SS26.json" (schema 1.3). Nothing
/// else may be read through `read_files`, so a manifest cannot point the app
/// at files outside the shared folder.
pub fn is_pruefungen_file(name: &str) -> bool {
    let Some(stem) = name.strip_prefix("pruefungen/").and_then(|n| n.strip_suffix(".json")) else {
        return false;
    };
    let b = stem.as_bytes();
    let digits = |s: &[u8]| s.iter().all(u8::is_ascii_digit);
    match b {
        [b'W', b'S', y1, y2, b'-', z1, z2] => digits(&[*y1, *y2, *z1, *z2]),
        [b'S', b'S', y1, y2] => digits(&[*y1, *y2]),
        _ => false,
    }
}

/// Read single exam date files (only those whose `updatedAt` changed).
/// Names that are not exam date files are reported as errors, not read.
pub fn read_files(path: &Path, names: &[String]) -> Result<SharedRead, String> {
    let root = resolve_root(path).ok_or_else(|| no_manifest(path))?;
    let mut files = Vec::new();
    let mut errors = Vec::new();
    for name in names {
        if is_pruefungen_file(name) {
            read_into(&root.join(name), name, &mut files, &mut errors);
        } else {
            errors.push(FileError { name: name.clone(), error: "kein gültiger Name einer Prüfungsdatei".into() });
        }
    }
    Ok(SharedRead { root: root.to_string_lossy().to_string(), files, errors })
}

fn read_into(path: &Path, name: &str, files: &mut Vec<SharedFile>, errors: &mut Vec<FileError>) {
    match std::fs::read_to_string(path) {
        // Strip a UTF-8 BOM some Windows editors add.
        Ok(content) => files.push(SharedFile {
            name: name.to_string(),
            content: content.trim_start_matches('\u{feff}').to_string(),
        }),
        Err(e) => errors.push(FileError { name: name.to_string(), error: e.to_string() }),
    }
}

fn no_manifest(path: &Path) -> String {
    format!("Kein manifest.json in {} (auch nicht im Unterordner shared)", path.display())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn make_shared(dir: &Path) {
        fs::create_dir_all(dir.join("module")).unwrap();
        fs::write(dir.join(MANIFEST), "{\"schemaVersion\":\"1.0\"}").unwrap();
        fs::write(dir.join("regeln.json"), "{}").unwrap();
        fs::write(dir.join("tags.json"), "\u{feff}[]").unwrap();
        fs::write(dir.join("module").join("B0002.json"), "{}").unwrap();
        fs::write(dir.join("module").join("A0001.json"), "{}").unwrap();
        fs::write(dir.join("module").join("notes.txt"), "ignored").unwrap();
    }

    #[test]
    fn resolves_shared_or_parent() {
        let tmp = tempfile::tempdir().unwrap();
        let shared = tmp.path().join("shared");
        make_shared(&shared);
        assert_eq!(resolve_root(&shared), Some(shared.clone()));
        assert_eq!(resolve_root(tmp.path()), Some(shared.clone()));
        assert_eq!(resolve_root(&tmp.path().join("missing")), None);
    }

    #[test]
    fn reads_everything_sorted() {
        let tmp = tempfile::tempdir().unwrap();
        make_shared(tmp.path());
        let r = read_all(tmp.path()).unwrap();
        let names: Vec<_> = r.files.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(
            names,
            vec!["manifest.json", "regeln.json", "tags.json", "module/A0001.json", "module/B0002.json"]
        );
        assert!(r.errors.is_empty());
        assert_eq!(r.files[2].content, "[]", "BOM stripped");
        assert!(read_manifest(tmp.path()).unwrap().contains("schemaVersion"));
    }

    #[test]
    fn missing_files_become_errors() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join(MANIFEST), "{}").unwrap();
        let r = read_all(tmp.path()).unwrap();
        assert_eq!(r.files.len(), 1);
        let err_names: Vec<_> = r.errors.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(err_names, vec!["regeln.json", "tags.json", "module/"]);
    }

    #[test]
    fn exam_file_names() {
        assert!(is_pruefungen_file("pruefungen/WS26-27.json"));
        assert!(is_pruefungen_file("pruefungen/SS26.json"));
        for bad in [
            "pruefungen/../manifest.json",
            "pruefungen/WS26-27.txt",
            "module/XX0001.json",
            "pruefungen/WS2627.json",
            "pruefungen/SS2.json",
            "../pruefungen/SS26.json",
            "pruefungen/ss26.json",
        ] {
            assert!(!is_pruefungen_file(bad), "{bad}");
        }
    }

    #[test]
    fn reads_only_requested_exam_files() {
        let tmp = tempfile::tempdir().unwrap();
        make_shared(tmp.path());
        fs::create_dir_all(tmp.path().join("pruefungen")).unwrap();
        fs::write(tmp.path().join("pruefungen").join("SS26.json"), "\u{feff}{}").unwrap();
        fs::write(tmp.path().join("pruefungen").join("WS26-27.json"), "{\"x\":1}").unwrap();
        let names = vec![
            "pruefungen/SS26.json".to_string(),
            "pruefungen/WS25-26.json".to_string(),
            "regeln.json".to_string(),
        ];
        let r = read_files(tmp.path(), &names).unwrap();
        assert_eq!(r.files, vec![SharedFile { name: "pruefungen/SS26.json".into(), content: "{}".into() }]);
        let err_names: Vec<_> = r.errors.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(err_names, vec!["pruefungen/WS25-26.json", "regeln.json"]);
        // read_all does not pick up exam files.
        assert!(read_all(tmp.path()).unwrap().files.iter().all(|f| !f.name.starts_with("pruefungen/")));
    }

    #[test]
    fn no_manifest_is_an_error() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(read_all(tmp.path()).is_err());
        assert!(read_manifest(tmp.path()).is_err());
    }
}
