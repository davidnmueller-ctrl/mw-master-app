# Changelog

Versionen nach [semver](https://semver.org/lang/de/). Die Versionsnummer vergibt Max beim Release.

## Unveröffentlicht

### Neu: Prüfungstermine

- Neue Ansicht **Prüfungen**: Klausurtermine eines Semesters als Monat, Woche oder Liste. Filter nach eigenem Plan oder allen Katalogmodulen, Themen, Kategorien und Turnus, Wiederholungstermine und Schätzungen ein- und ausblendbar, „Nur konfliktfreie“. Filter und Ansicht werden gespeichert.
- **Schätzung aus dem Vorjahr** (≈, gestrichelt), wenn für ein Semester noch keine Termine vorliegen.
- **Prüfungskonflikte** im Semesterplan: rot (Zeiten überschneiden sich), orange (gleicher Tag), gelb (kurz hintereinander, Grenze einstellbar 0–7 Tage). Parallele Gruppen werden berücksichtigt, Konflikte mit Schätzungen heißen „möglich“. Hinweis im Semesterkopf, Symbol auf den Karten, Liste aller Konflikte im Gesamtüberblick.
- **Eigener Prüfungstermin** an jeder Belegung (Datum, Beginn, Ende, Raum).
- Katalog: Spalte „Prüfung“; Detailansicht: Abschnitt „Prüfungstermine“ und Konfliktvorschau bei „Zum Plan hinzufügen“.
- **Kalenderexport** als .ics für Google Kalender und Outlook; ein erneuter Import aktualisiert die Termine.
- Einstellungen: Stand der Prüfungsdaten pro Semester.

### Technik

- Geteilte Daten: Schema 1.3 (`manifest.pruefungen`, `pruefungen/<SEMESTER>.json`). Daten der Version 1.2 bleiben gültig. Jede Prüfungsdatei wird einzeln geprüft und nur bei geändertem `updatedAt` neu eingelesen; eine kaputte Datei behält den alten Stand.
- Datenbank-Migration (eigener Prüfungstermin); Backup-Format Version 2, ältere Backups werden beim Wiederherstellen hochgestuft.

## 0.2.0

- Erste Version mit funktionierendem In-App-Updater.
- Datenformat 1.2: beliebige Zwischenstufen x,y in Notenspiegeln.

## 0.1.0

- Erste Version: Noten, Spielmodus, Semesterplan, Katalog mit Notenspiegeln.
