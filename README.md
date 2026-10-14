# MW Master

Noten, Notenspiegel und Modulplanung für den **M.Sc. Maschinenwesen an der TUM**.

- **Noten:** eigene Noten eintragen; die App rechnet den CP-gewichteten Schnitt, die Zeugnisnote (nach einer Nachkommastelle abgeschnitten), das Prädikat und prüft die CP-Struktur.
- **Spielmodus:** Für die offenen CP vermutete Noten eintragen und sehen, welcher Schnitt dabei herauskommt.
- **Semesterplan und Katalog:** Module aus einem gemeinsamen Katalog mit Kurzbeschreibung, Kategorie, TUMonline-Links, Notenspiegeln (auch mehrere Termine pro Modul) und Kommentaren auf die eigenen Semester verteilen.

Deine Noten und dein Plan bleiben auf deinem Rechner. Katalog und Notenspiegel kommen aus einem geteilten Ordner, den die App nur liest.

> Ohne Gewähr. Rechtsverbindlich sind allein Prüfungsbescheid und Zeugnis.

## Installieren

Die neueste Version liegt unter **Releases** (rechts auf der GitHub-Seite).

| Rechner | Datei |
|---|---|
| Windows mit ARM-Prozessor (z. B. Surface mit Snapdragon) | `MW Master_…_arm64-setup.exe` |
| Windows mit Intel/AMD | `MW Master_…_x64-setup.exe` |
| Mac (Apple Silicon und Intel) | `MW Master_…_universal.dmg` |

Die App ist nicht mit einem gekauften Zertifikat signiert. Deshalb kommt beim ersten Start eine Warnung:

- **Windows:** „Der Computer wurde durch Windows geschützt“ → **Weitere Informationen** → **Trotzdem ausführen**.
- **macOS:** Die App in „Programme“ ziehen und öffnen. Kommt „kann nicht geöffnet werden, da der Entwickler nicht überprüft werden kann“: **Systemeinstellungen → Datenschutz & Sicherheit** → unten bei MW Master **Trotzdem öffnen**.

Danach startet sie normal. Updates: Einstellungen → „Nach Updates suchen“, oder einfach die neue Setup-Datei installieren. Deine Daten bleiben dabei erhalten. Hast du noch v0.1.0, installiere die neue Version einmal von Hand (v0.1.0 kann sich nicht selbst aktualisieren); ab v0.2.0 klappt das Update in der App.

## Geteilten Ordner verknüpfen

Beim ersten Start fragt die App nach dem geteilten Ordner (geht auch später unter Einstellungen). Zwei Wege:

1. **Einbinden (automatische Updates):** Mit einem privaten Microsoft-Konto den Freigabelink öffnen → **Zu „Meine Dateien“ hinzufügen**. OneDrive synchronisiert den Ordner dann auf deinen Rechner. In der App diesen Ordner wählen.
2. **ZIP-Download:** Funktioniert das Einbinden nicht (z. B. nur TUM-Konto), den Ordner im Browser als ZIP herunterladen, an einen festen Ort entpacken und in der App wählen. Für neue Daten ab und zu neu herunterladen und an dieselbe Stelle entpacken.

Gewählt werden darf der Ordner `shared` selbst oder der Ordner, der ihn enthält. Die App liest ihn bei jedem Start und zeigt unten links den **Datenstand** – so siehst du, ob deine Kopie alt ist.

## Wo liegen meine Daten?

- Windows: `%APPDATA%\de.maxbergt.mwmaster\mwmaster.db`
- macOS: `~/Library/Application Support/de.maxbergt.mwmaster/mwmaster.db`

Unter Einstellungen → Meine Daten kannst du einen **Backup-Ordner** wählen (z. B. einen privaten OneDrive-Ordner, nicht den geteilten). Die App schreibt dann nach jeder Änderung `mw-master-backup.json`. Über „Wiederherstellen / Importieren“ holst du ein Backup zurück, z. B. auf einem neuen Rechner.

## Änderungen

- **Datenformat 1.1:** Notenspiegel mit Notenbonus (Stufen 1,4 / 2,4 / 3,4, Felder `notenbonus` und `hinweis`). Ältere App-Versionen halten solche Moduldateien für ungültig und zeigen für diese Module weiter den alten Stand – dann bitte die App aktualisieren.

## Entwicklung

Tauri 2 (Rust) + React/TypeScript. Details für Entwickler und Claude Code: [CLAUDE.md](CLAUDE.md), Spezifikation: [docs/ANFORDERUNGEN.md](docs/ANFORDERUNGEN.md).

```bash
npm install
npm run dev                 # nur Oberfläche im Browser, mit erfundenen Beispieldaten
npm run tauri dev           # komplette App (braucht Rust und die Tauri-Voraussetzungen)
npm test                    # Logik-Tests
cargo test -p mwmaster-core # Rust-Tests
```
