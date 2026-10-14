//! Writing the calendar export (.ics) to a file the user picked in the save
//! dialog. The content is built in the frontend (`src/logic/ics.ts`).

use crate::backup::write_atomic;
use std::path::Path;

/// Write `content` to `path`. Only `.ics` files, and never inside the shared
/// folder (`shared`, if linked): the app does not write there.
pub fn write_ics(path: &Path, content: &str, shared: Option<&Path>) -> Result<(), String> {
    let ics = path.extension().map(|e| e.eq_ignore_ascii_case("ics")).unwrap_or(false);
    if !ics {
        return Err("Die Kalenderdatei muss auf .ics enden.".into());
    }
    if let Some(shared) = shared {
        if liegt_in(path, shared) {
            return Err("In den geteilten Ordner schreibt die App nicht. Bitte einen anderen Ort wählen.".into());
        }
    }
    write_atomic(path, content.as_bytes()).map_err(|e| e.to_string())
}

/// Whether `path` lies inside `ordner` (compared after resolving links and `..`).
fn liegt_in(path: &Path, ordner: &Path) -> bool {
    let Ok(ordner) = ordner.canonicalize() else { return false };
    let parent = path.parent().unwrap_or(path);
    match parent.canonicalize() {
        Ok(p) => p.starts_with(&ordner),
        Err(_) => path.starts_with(&ordner),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_ics_files_only() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Pruefungen-WS26-27.ics");
        write_ics(&path, "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n", None).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
        // Overwriting works (a second export of the same semester).
        write_ics(&path, "x", None).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "x");
        assert!(write_ics(&dir.path().join("a.txt"), "x", None).is_err());
        assert!(write_ics(&dir.path().join("ohne"), "x", None).is_err());
    }

    #[test]
    fn never_writes_into_the_shared_folder() {
        let dir = tempfile::tempdir().unwrap();
        let shared = dir.path().join("shared");
        std::fs::create_dir_all(shared.join("pruefungen")).unwrap();
        let drinnen = shared.join("pruefungen").join("x.ics");
        assert!(write_ics(&drinnen, "x", Some(&shared)).is_err());
        assert!(!drinnen.exists());
        let tricky = dir.path().join("other").join("..").join("shared").join("y.ics");
        std::fs::create_dir_all(dir.path().join("other")).unwrap();
        assert!(write_ics(&tricky, "x", Some(&shared)).is_err());
        let daneben = dir.path().join("x.ics");
        write_ics(&daneben, "x", Some(&shared)).unwrap();
    }
}
