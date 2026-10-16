# MW Master

Noten, Notenspiegel und Modulplanung für den **M.Sc. Maschinenwesen an der TUM**.

- **Noten:** eigene Noten eintragen; die App rechnet den CP-gewichteten Schnitt, die Zeugnisnote (nach einer Nachkommastelle abgeschnitten), das Prädikat und prüft die CP-Struktur.
- **Spielmodus:** Für die offenen CP vermutete Noten eintragen und sehen, welcher Schnitt dabei herauskommt.
- **Semesterplan und Katalog:** Module aus einem gemeinsamen Katalog mit Kurzbeschreibung, Kategorie, TUMonline-Links, Notenspiegeln (auch mehrere Termine pro Modul) und Kommentaren auf die eigenen Semester verteilen.
- **Prüfungen:** Klausurtermine aus TUMonline als Monat, Woche oder Liste, nach eigenem Plan oder nach Themen gefiltert, mit Warnung bei ungünstigen Überschneidungen und Export als Kalenderdatei.
- **Bewertungen:** In der Moduldetailansicht 1–5 Sterne und öffentliche Kommentare anderer Studierender lesen. Mit Google-Anmeldung kannst du pro Modul eine eigene Bewertung veröffentlichen, ändern oder löschen. 5 Sterne sind am besten; diese Bewertung ist von Prüfungsnoten und Notenspiegeln getrennt.

Deine Noten und dein Plan bleiben auf deinem Rechner. Katalog, Notenspiegel und Prüfungstermine kommen aus einem geteilten Ordner, den die App nur liest. Bewertungen werden über einen separaten Onlinedienst geladen und gespeichert. Dein Name wird anderen Nutzern bei Bewertungen nicht angezeigt; die Betreiber können dein Google-Konto zur Moderation zuordnen. Die Browser-Demo (`npm run dev`) verbindet sich nicht mit dem Bewertungsdienst.

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

## Prüfungstermine

Unter **Prüfungen** stehen die Klausurtermine eines Semesters. Maßgeblich ist das Semester, in dem du die Prüfung im Plan eingetragen hast – nicht das Datum (ein Termin im Oktober kann noch zum Sommersemester gehören).

- **Schätzung (≈, gestrichelt):** Gibt es für ein Semester noch keine Termine, nimmt die App den Termin aus dem Vorjahr (gleiche Semesterart, gleicher Kalendertag). Der Vorjahrestermin steht im Tooltip.
- **Konflikte** zwischen Modulen, die im selben Semester im Plan stehen (Status Idee, geplant, angemeldet):
  - **rot:** gleicher Tag, Zeiten überschneiden sich
  - **orange:** gleicher Tag
  - **gelb:** höchstens zwei Kalendertage Abstand (einstellbar unter Einstellungen → Studium, 0 schaltet gelb ab)
  - Gibt es parallele Gruppen, zählt die günstigste. Ist ein Termin nur geschätzt, heißt der Konflikt „möglich“ und ist gestrichelt.
- **Eigener Termin:** Im Bearbeiten-Dialog einer Belegung unter „Eigener Prüfungstermin“, z. B. für Auslandskurse oder „Termin nach Absprache“. Er gilt statt der geteilten Termine.
- Die Termine stehen auch auf den Karten im Semesterplan, in der Katalogspalte „Prüfung“ und in der Detailansicht eines Moduls. Beim „Zum Plan hinzufügen“ zeigt eine Vorschau, welche Konflikte entstehen würden.
- **Kalenderexport:** „Als Kalenderdatei (.ics) exportieren“ speichert die Prüfungen des Semesters für Google Kalender, Outlook oder Apple Kalender. Importierst du die Datei später noch einmal, werden die Termine aktualisiert statt doppelt angelegt.
  - Google Kalender: Einstellungen → Importieren & Exportieren → Datei auswählen.
  - Outlook: Datei → Öffnen und exportieren → Importieren/Exportieren → iCalendar-Datei (oder die Datei einfach doppelklicken).

Ohne Prüfungsdaten im geteilten Ordner zeigt die App „Keine Prüfungsdaten“; eigene Termine funktionieren trotzdem.

## Wo liegen meine Daten?

- Windows: `%APPDATA%\de.maxbergt.mwmaster\mwmaster.db`
- macOS: `~/Library/Application Support/de.maxbergt.mwmaster/mwmaster.db`

Unter Einstellungen → Meine Daten kannst du einen **Backup-Ordner** wählen (z. B. einen privaten OneDrive-Ordner, nicht den geteilten). Die App schreibt dann nach jeder Änderung `mw-master-backup.json`. Über „Wiederherstellen / Importieren“ holst du ein Backup zurück, z. B. auf einem neuen Rechner.

## Änderungen

Siehe [CHANGELOG.md](CHANGELOG.md).

- **Datenformat 1.1:** Notenspiegel mit Notenbonus (Stufen 1,4 / 2,4 / 3,4, Felder `notenbonus` und `hinweis`). Ältere App-Versionen halten solche Moduldateien für ungültig und zeigen für diese Module weiter den alten Stand – dann bitte die App aktualisieren.
- **Datenformat 1.3:** Prüfungstermine (`pruefungen/<SEMESTER>.json`) und der optionale Prüfwert `moduleCodesSha256` im `shared/manifest.json`. Ältere App-Versionen ignorieren die Prüfungstermine. Der Prüfwert sichert den Import der Modulcodes für Online-Bewertungen ab; ohne ihn bleibt der bisherige Online-Katalog unverändert.

## Entwicklung

Tauri 2 (Rust) + React/TypeScript. Details für Entwickler und Claude Code: [CLAUDE.md](CLAUDE.md), Spezifikation: [docs/ANFORDERUNGEN.md](docs/ANFORDERUNGEN.md).

Online-Bewertungen erscheinen erst in einer konfigurierten Desktop-Version. Die nötigen Build-Einstellungen stehen in [`.env.example`](.env.example); für GitHub-Releases sind die fünf öffentlichen Werte als **GitHub Actions Repository Variables** und `VITE_GOOGLE_DESKTOP_CLIENT_SECRET` als **GitHub Actions Repository Secret** einzutragen. Die API-Adresse muss auf den bereitgestellten HTTPS-Dienst zeigen. Der Desktop-OAuth-Client benötigt beim Token-Austausch auch seinen Client-Secret-Wert. Bei installierten Apps kann dieser Wert im fertigen Programm ausgelesen werden; PKCE schützt den einzelnen Anmeldevorgang. Ein Dienstkonto-Schlüssel gehört weder in die App noch in GitHub. Fehlen Variablen, bleibt die Funktion im Build deaktiviert. Der Browser-Demo-Modus bleibt offline für Bewertungen.

```bash
npm install
npm run dev                 # nur Oberfläche im Browser, mit erfundenen Beispieldaten
npm run tauri dev           # komplette App (braucht Rust und die Tauri-Voraussetzungen)
npm test                    # Logik-Tests
cargo test -p mwmaster-core # Rust-Tests
```
