# MW Master App – Anforderungen

Stand: 07.10.2026 · Version 3 der Spezifikation

Grundlage der Regeln: Studienplan **Maschinenwesen [20261]** in TUMonline (Master of Science 1630 16 400), FPSO Maschinenwesen (Master) vom 02.11.2023 in der lesbaren Fassung mit der Änderungssatzung vom 07.03.2024 und die APSO der TUM.

Dieses Dokument ist die gemeinsame Grundlage für zwei Seiten:

- **Claude Code** baut und pflegt die App im Repo `C:\dev\mw-master-app`.
- **Claude im Projekt „Master_App“** pflegt die geteilten Daten (Modulkatalog, Notenspiegel, Kommentare) im OneDrive.

Die Schnittstelle zwischen beiden ist das **Datenformat in Abschnitt 5**. Ändert sich daran etwas, wird es zuerst hier festgelegt.

---

## 1. Ziel

Eine Desktop-App für Studierende im **M.Sc. Maschinenwesen an der TUM** (eine FPSO für alle Nutzer) mit drei Funktionen:

1. **Noten:** Eigene Noten eintragen. Die App rechnet Schnitt, Zeugnisnote und Prädikat aus und prüft die CP-Struktur.
2. **Spielmodus:** Für die noch offenen CP vermutete Noten eintragen und den sich daraus ergebenden Gesamtschnitt sehen.
3. **Modulplanung:** Module aus einem gemeinsamen Katalog mit Kurzbeschreibung, Kategorie, Turnus, TUMonline-Links, Notenspiegel und Kommentaren ansehen und auf eigene Semester verteilen.

Nutzer sind Max und Freunde aus demselben Studiengang. Jeder hat **private Daten** (Noten, Plan, Spielstand) lokal auf dem eigenen Rechner und liest **geteilte Daten** (Katalog, Notenspiegel) aus einem OneDrive-Ordner, für den er nur Lesezugriff hat.

Die Oberfläche ist **Deutsch**. Code, Kommentare und Commits sind Englisch, so wie bei der Pomodoro-App.

---

## 2. Architektur

```
┌──────────────────────── Rechner eines Nutzers ────────────────────────┐
│                                                                        │
│  MW Master App (Tauri)                                                 │
│   ├─ private SQLite-DB  ── %APPDATA%\de.maxbergt.mwmaster\             │
│   │    Noten/Belegungen, Semesterplan, Spielstand, eigene Notizen,     │
│   │    Einstellungen (inkl. Pfad zum geteilten Ordner)                 │
│   │                                                                    │
│   └─ Cache der geteilten Daten (in derselben DB)                       │
│          ▲  nur lesen, beim Start / auf Knopfdruck / bei Fokus         │
│          │                                                             │
│   OneDrive-Ordner „shared“ (lokal synchronisiert, nur Lesezugriff)     │
└──────────┼─────────────────────────────────────────────────────────────┘
           │ OneDrive-Freigabe (Lesen)
┌──────────┴──────────── Max' OneDrive ──────────────────────────────────┐
│  05_Master_App/shared/   ← schreibt nur Claude (Projekt Master_App)    │
│  05_Master_App/_eingang/ ← Max legt Screenshots/PDFs von Freunden ab   │
└────────────────────────────────────────────────────────────────────────┘

GitHub (öffentliches Repo mw-master-app)
  └─ Releases: Installer + Updater-Manifest → Auto-Update in der App
```

Grundregeln:

- **Die App schreibt nie in den geteilten Ordner.** Das gilt auch auf Max' Rechner. Der Katalog wird ausschließlich über Claude im Projekt gepflegt.
- **Die App arbeitet aus dem lokalen Cache.** Ist OneDrive offline, nur halb synchronisiert oder der Ordner nicht verknüpft, läuft die App mit dem letzten gültigen Stand weiter.
- **Wann eingelesen wird:** bei jedem App-Start, jederzeit über den Knopf „Aktualisieren“ und, solange die App offen ist, automatisch höchstens einmal pro Stunde. Dabei wird zuerst nur `manifest.json` gelesen; die Moduldateien werden nur neu eingelesen, wenn sich `updatedAt` geändert hat. Das Einlesen ist ein reiner Lesevorgang auf lokale Dateien und dauert Millisekunden. Das Synchronisieren mit der Cloud erledigt der OneDrive-Client selbst.
- **Private Daten verlassen den Rechner nur als Backup**, und zwar in einen Ordner, den der Nutzer selbst wählt.
- **Im öffentlichen Repo liegen keine echten Daten.** Kein Katalog, keine Notenspiegel, keine Noten. Tests und Entwicklung arbeiten mit erfundenen Beispieldaten.

Die geteilten Daten liegen bewusst nicht auf GitHub: Die Prüfungsstatistiken sind in TUMonline nur für eingeloggte Studierende sichtbar und sollen nicht öffentlich werden.

---

## 3. Technik und Auslieferung

Vorlage ist `C:\dev\pomodoro-app`. Stack, Ordnerstruktur und Konventionen werden übernommen, soweit sie passen.

| Thema | Festlegung |
|---|---|
| Stack | Tauri 2 (Rust) + React / TypeScript + Vite |
| Speicher | SQLite über `rusqlite` (Feature `bundled`) |
| App-Name / Identifier | „MW Master“ / `de.maxbergt.mwmaster` |
| Repo | `C:\dev\mw-master-app`, öffentliches GitHub-Repo |
| Plattformen | Windows ARM64, Windows x64, macOS (Universal: Apple Silicon + Intel) |
| Installer | Windows: NSIS, `installMode: currentUser`. macOS: `.dmg` |
| Updates | Tauri-Updater-Plugin. GitHub Actions baut bei Tag `vX.Y.Z` alle drei Ziele, signiert die Update-Pakete (Schlüssel als GitHub-Secret) und veröffentlicht Release und `latest.json`. Die App prüft beim Start und bietet das Update an. |
| Code-Signing | Keine gekauften Zertifikate. Die Folge: Windows zeigt beim ersten Start „Der Computer wurde durch Windows geschützt“ (weiter über „Weitere Informationen → Trotzdem ausführen“), macOS meldet, dass der Entwickler nicht verifiziert werden kann (freigeben unter Systemeinstellungen → Datenschutz & Sicherheit → „Trotzdem öffnen“). Beides kommt mit Screenshots in die README. Die Updater-Signatur von Tauri ist davon unabhängig, kostenlos und Pflicht: Mit ihr prüft die App, dass ein Update wirklich aus diesem Repo stammt. |
| Struktur | Wie bei Pomodoro: reine Logik in `src/*.ts` mit Unit-Tests, Rust-Kern ohne Tauri in `crates/…-core`, Tauri-Hülle in `src-tauri`, ein Browser-Fake-Backend für `npm run dev` |
| CI | Typecheck, `npm test` und `cargo test` auf Ubuntu, danach Builds für Windows ARM64, Windows x64 und macOS |

**Datenerhalt:** Die DB liegt im App-Datenverzeichnis von Tauri (`%APPDATA%\de.maxbergt.mwmaster\` bzw. `~/Library/Application Support/de.maxbergt.mwmaster/`). Updates und Neuinstallation lassen sie unberührt. Die Option „App-Daten löschen“ im Deinstaller bleibt standardmäßig aus. Schema-Änderungen laufen über Migrationen in der DB; Backups tragen eine Versionsnummer und werden beim Wiederherstellen hochgestuft, wie in der Pomodoro-App.

---

## 4. Funktionen

### 4.1 Gemeinsames Datenmodell für Noten und Plan

Noten und Semesterplan sind **dieselben Datensätze** („Belegungen“), damit nichts doppelt eingetragen wird. Ein geplantes Modul wird zu einer Note, sobald es bestanden ist.

Eine Belegung hat:

- Modul: entweder ein Katalogmodul (über `code`) oder ein **freier Eintrag** (Titel und CP von Hand, z. B. Auslandskurse, die angerechnet werden)
- Kategorie: eine der Kategorien aus `regeln.json`, bei der Überfachlichen Ergänzung zusätzlich der Unterbereich (Ethik oder Weitere Angebote). Vorbelegt mit der ersten erlaubten Kategorie des Katalogmoduls, aber änderbar.
- CP: aus dem Katalog vorbelegt und überschreibbar (Anrechnungen haben oft andere CP)
- Semester: siehe 4.3
- Status: `Idee` · `geplant` · `angemeldet` · `bestanden` · `anerkannt` · `nicht bestanden`
- Note (nur bei `bestanden` oder `anerkannt`): eine TUM-Notenstufe, `bestanden` ohne Note, oder bei `anerkannt` ein freier Wert zwischen 1,0 und 4,0 mit einer Nachkommastelle. Umgerechnete Auslandsnoten behalten nach § 16 Abs. 6 APSO genau eine Nachkommastelle, z. B. 1,5.
- private Notiz (Freitext)

### 4.2 Noten und Schnitt

Ansicht „Noten“: alle Belegungen mit Status `bestanden` oder `anerkannt`, nach Kategorie gruppiert.

Die App zeigt:

- **Zeugnisnote:** auf eine Nachkommastelle **abgeschnitten**, nicht gerundet (1,29 → 1,2)
- **exakter Schnitt** mit zwei Nachkommastellen
- **Prädikat:** sehr gut / gut / befriedigend / ausreichend (Grenzen aus `regeln.json`)
- **„mit Auszeichnung“**, wenn die Zeugnisnote 1,2 oder besser ist (§ 17 Abs. 6 APSO)
- erreichte CP / 120, benotete CP, unbenotete CP
- **Strukturcheck** pro Kategorie und Unterbereich: CP-Ist gegen Mindest- und Höchstwerte, Status „offen“, „OK“ oder „über Maximum“
- **Frist-Hinweis:** Bis Ende des 2. Fachsemesters muss mindestens ein Modul aus Grundlagen, Kernfächern oder Angrenzenden Fachgebieten bestanden sein (§ 38 Abs. 2 FPSO). Ist das noch offen, zeigt die App einen Hinweis.

Berechnung:

```
Schnitt = Σ(Note × CP) / Σ(CP)
```

Gerechnet wird nur über benotete Belegungen in Kategorien mit `zaehltZurNote: true`. Nach § 47 Abs. 2 FPSO sind das Mastermodule, Hochschulpraktika, International Experience, Forschungspraxis und Master's Thesis. „bestanden“ ohne Note und die Überfachliche Ergänzung (Studienleistung, § 45 FPSO) zählen zu den CP, aber nicht zum Schnitt. Belegungen, die das Maximum ihrer Kategorie überschreiten, werden nur markiert und nicht automatisch weggelassen.

**Rechengenauigkeit:** Noten werden intern als ganze Hundertstel gespeichert (1,3 → 130) und mit Ganzzahlen verrechnet. Mit Gleitkommazahlen kann 1,3 als 1,2999… herauskommen und nach dem Abschneiden fälschlich zu 1,2 werden. Für die Randfälle gibt es Tests.

### 4.3 Semesterplan

- Spalten sind Semester: `WS 26/27`, `SS 27`, `WS 27/28`, … sowie `vor dem Master` (vorgezogene Mastermodule aus dem Bachelor) und `ohne Termin`. Das erste Semester stellt man in den Einstellungen ein, die Anzahl wächst nach Bedarf.
- Gemeint ist das Semester, in dem die **Prüfung** geschrieben wird. Das muss nicht zum Turnus des Moduls passen: Man kann ein SS-Modul ins WS legen, z. B. wenn man im Moodle schon angemeldet ist. Weicht das Semester vom Turnus ab, zeigt die App nur einen dezenten Hinweis und blockiert nichts.
- Pro Semester: CP-Summe mit Richtwert 30 und die Liste der Module mit Kategorie-Farbe, Status, Ø aus dem Notenspiegel und Durchfallquote (Referenztermin, Semester und Warnung bei kleiner Stichprobe wie in 4.5).
- Module per Drag & Drop oder Auswahlfeld verschieben. Damit Drag & Drop im Tauri-Fenster funktioniert (WebView2 fängt Ziehen sonst für Datei-Drops ab), ist im Fenster `dragDropEnabled: false` gesetzt; Dateien per Drag & Drop nimmt die App nicht an.
- Karten von Katalogmodulen haben einen kleinen Knopf ⓘ. Er öffnet rechts dieselbe Detailansicht wie im Katalog (Beschreibung, alle Termine, Diagramm), ohne den Bearbeiten-Dialog; ein zweiter Klick oder ✕ schließt sie. Ein Klick auf die übrige Karte öffnet weiterhin den Bearbeiten-Dialog.
- Gesamtüberblick: CP pro Kategorie über alle Semester gegen die Regeln, wie die Leiste in der bisherigen Modulwahl-HTML.

### 4.4 Spielmodus

Bewusst einfach: **Die App rechnet nichts zurück.** Man trägt vermutete Noten ein und sieht den Schnitt, der dabei herauskommt.

- Die echten Noten (4.2) sind immer dabei und hier nicht änderbar.
- Darunter kommen hypothetische Zeilen: Titel, Kategorie, CP und vermutete Note.
- **„Aus Plan übernehmen“** legt für jede Belegung ohne Note (Status `Idee` bis `angemeldet`) eine Zeile an.
- **„Offene CP auffüllen“** legt generische Platzhalter („Platzhalter“) an, bis jede Kategorie ihre Soll-CP erreicht, in Blöcken nach `platzhalterCp` (z. B. Mastermodule je 5 CP, Hochschulpraktikum je 4 CP, Forschungspraxis 11 CP, Thesis 30 CP). Bei Kategorien mit Unterbereichen werden zuerst deren Mindestwerte gefüllt (Überfachliche Ergänzung: 3 CP Ethik, 2 CP Weitere).
- **Darstellung:** Alle Noten sollen auf einen Bildschirm passen. Pro Kategorie gibt es eine Karte in der Kategorie-Farbe, mehrspaltig angeordnet. Jede Karte zeigt im Kopf CP-Ist gegen Soll mit Status (das ist der Strukturcheck der Kategorie, inkl. Unterbereichen) und listet darunter die echten Noten (fest, ausblendbar) und die angenommenen Zeilen. Neue Zeilen legt man direkt in der Karte der Kategorie an.
- **Modul nachschlagen:** Gehört eine Zeile zu einem Katalogmodul (echte Note oder per „Aus Plan übernehmen“), steht in der Zeile ein kleiner Knopf. Mit Notenspiegel zeigt er „Ø 2,34“ (Ø bestanden des Referenztermins wie in 4.5, bei kleiner Stichprobe in der Warnfarbe; Tooltip mit Durchfallquote, Semester und Anzahl der Termine), ohne Notenspiegel „ⓘ“. Ein Klick öffnet rechts dieselbe Detailansicht wie im Katalog (Beschreibung, alle Termine, Diagramm), ein zweiter Klick oder ✕ schließt sie. So lässt sich die vermutete Note an der Statistik abschätzen. Die Zeile merkt sich den Modulcode, damit die Verknüpfung auch bleibt, wenn die Belegung später gelöscht wird.
- Oben steht ein kompakter Strukturcheck: je ein Balken für jede Gruppe (Mastermodule) und für die Gesamt-CP, segmentiert nach Kategorie-Farben; echte CP voll, angenommene CP blass.
- Ergebnis wie in 4.2: Zeugnisnote, exakter Schnitt, Prädikat und CP-Abdeckung. Zusätzlich ist sichtbar, wie viel davon echt und wie viel hypothetisch ist.
- Es gibt **einen** Spielstand. Er wird gespeichert und lässt sich zurücksetzen.
- Komfortfunktion: Eine Note für alle markierten Zeilen auf einmal setzen.

### 4.5 Modulkatalog

- Tabelle aller Module aus dem geteilten Ordner. Filter: Kategorie (Mehrfachauswahl als Chips, mit „Alle wählen“ und „Alle abwählen“; ein Modul passt, wenn eine seiner Kategorien gewählt ist), Themen-Tag, Turnus (WS/SS), Angebot im gewählten Semester, Sprache, Freitextsuche (Titel, Nummer, Dozent).
- Über der Tabelle steht immer, wie viele Module die aktuelle Suche und die Filter ergeben und wie viele davon eine Prüfungsstatistik (mindestens einen Notenspiegel) haben, z. B. „12 von 734 Modulen · 5 mit Prüfungsstatistik (42 %)“; ohne Filter „734 Module · 210 mit Prüfungsstatistik (29 %)“.
- Spalten: Titel, Nummer, CP, Kategorie(n), Turnus, Sprache, Ø bestanden, Durchfallquote, „im Plan“. Alle Spalten sind sortierbar.
- Detailansicht eines Moduls:
  - Kurzbeschreibung, Prüfungsform, Leitung, Sprache, CP, erlaubte Kategorien, Tags
  - Links: Modulbeschreibung in TUMonline und die Lehrveranstaltung pro Semester. Sie öffnen sich im Standardbrowser.
  - **Notenspiegel:** Ein Modul kann beliebig viele Notenspiegel haben, einen pro Prüfungstermin. Jeder ist datiert (Semester, Haupt- oder Wiederholungstermin, wenn bekannt auch das Prüfungsdatum).
    - Auswahl eines Termins: Balkendiagramm über die Notenstufen 1,0 bis 5,0 plus „nicht erschienen“, mit den Kennzahlen Angemeldet, Angetreten, Ø gesamt, Ø bestanden und Durchfallquote. Die Standardstufen erscheinen immer. Jede weitere Stufe (Bonus- und Zwischenstufen wie 1,4 / 1,5 / 2,4 / 3,1, siehe 5.5) erscheint nur, wenn die gezeigte Verteilung dort einen Wert > 0 hat (bei „Alle zusammen“ also, wenn irgendein Termin dort einen Wert > 0 hat), einsortiert nach Notenwert zwischen die Nachbarstufen; ohne solche Daten sieht das Diagramm aus wie immer. Hat der Termin `notenbonus`, steht dezent „Verteilung inkl. Notenbonus 0,3“ darunter, ein `hinweis` erscheint als kleine Notiz.
    - Vergleich: alle Termine als Tabelle untereinander, chronologisch sortiert. So sieht man Haupt- gegen Wiederholungstermin und die Entwicklung über die Jahre.
    - Verlauf: kleines Liniendiagramm für Ø bestanden und Durchfallquote über die Termine, ab zwei Terminen.
    - „Alle Termine zusammen“: Verteilungen addiert (Vereinigung der Stufen). Ist ein Termin mit Notenbonus dabei, steht ein kurzer Hinweis darauf da.
    - In Katalogtabelle und Semesterplan stehen Ø bestanden und Durchfallquote **eines Referenztermins**, mit Hinweis auf die Anzahl der Termine. Dafür gelten drei Regeln:
      1. **Auswahl:** Referenztermin ist der neueste Haupttermin. Hat ein Modul keinen Haupttermin (nur Wiederholungen oder nur Termine mit Art „unbekannt“, z. B. bei Turnus `unregelmaessig`), ist es der neueste Termin, egal welcher Art. Die Auswahl steckt in einer einzigen Funktion (`referenztermin` in `src/logic/notenspiegel.ts`), die Katalogtabelle und Semesterplan gemeinsam nutzen.
      2. **Semester:** Neben den Werten steht immer das Semester des Referenztermins, dezent und in kleinerer Schrift, z. B. „2,4 · WS 24/25“. Ist der Referenztermin kein Haupttermin (Fallback aus Regel 1), steht zusätzlich „Wdh.“ dabei.
      3. **Kleine Stichprobe:** Haben weniger als 15 Personen den Referenztermin angetreten, zeigt die App die Werte trotzdem an, aber in der Warnfarbe und mit dem Tooltip „Nur n Angetretene, wenig aussagekräftig“; neben dem Ø steht zusätzlich ein Warnsymbol (⚠). Die Schwelle ist die Konstante `MIN_ANGETRETENE` (15), Angetretene = Σ `verteilung` ohne `nichtErschienen`.
      Die Detailansicht ändert sich dadurch nicht.
    - Gibt es keine Daten, steht dort „Noch kein Notenspiegel“.
  - **Kommentare** aus den geteilten Daten, z. B. Erfahrungsberichte von Freunden. In der App nur lesbar.
  - Eigene private Notiz und der Knopf „Zum Plan hinzufügen“ mit Semesterauswahl.
- Der Katalog ist in der App nicht bearbeitbar. Ein Modul, das fehlt, wird als freier Eintrag angelegt (4.1).

### 4.6 Einstellungen und Daten

- **Geteilter Ordner:** Pfad wählen. Die App prüft, ob dort ein gültiges `manifest.json` liegt, und zeigt den Stand (Datum, Anzahl Module, Schema-Version).
- **Aktualisieren:** beim Start, per Knopf und automatisch höchstens einmal pro Stunde (siehe Abschnitt 2). Angezeigt wird, wann zuletzt eingelesen wurde und welchen Stand die Daten haben. Jede Moduldatei wird einzeln validiert. Ungültige oder halb synchronisierte Dateien werden übersprungen und gemeldet; für diese Module bleibt der alte Stand im Cache.
- **Schema-Version:** Ist die Hauptversion der Daten neuer als die der App, zeigt die App den Hinweis „Bitte App aktualisieren“ und behält den alten Cache.
- **Backup:** automatisch als JSON in einen frei wählbaren Ordner (z. B. ein privater OneDrive-Ordner), dazu manuell exportieren und wiederherstellen. Die App warnt, wenn der Backup-Ordner innerhalb des geteilten Ordners liegt.
- **Import:** Das Backup-Format lässt sich auch importieren. Darüber kann Claude einmalig die bisherigen Noten aus `Masternote_Rechner.xlsx` als Importdatei vorbereiten.
- Version und „Nach Updates suchen“.

### 4.7 Ersteinrichtung

Beim ersten Start:

1. Erstes Mastersemester wählen.
2. Geteilten Ordner wählen. Das lässt sich überspringen; die App funktioniert dann nur mit privaten Daten.
3. Backup-Ordner wählen (optional).

---

## 5. Datenformat der geteilten Daten (Vertrag)

### 5.1 Ordnerstruktur im OneDrive

```
05_Master_App/
├── shared/                      ← wird mit Freunden geteilt (Lesezugriff)
│   ├── manifest.json
│   ├── regeln.json
│   ├── tags.json
│   └── module/
│       ├── XX0001.json
│       ├── ED140016.json
│       └── …
├── _eingang/                    ← neue Screenshots/JPGs/PDFs, noch nicht verarbeitet
├── _quellen/<MODULCODE>/        ← verarbeitete Originale (privat, nicht geteilt)
├── _privat/                     ← App-Backups und Importdateien (privat)
└── ANFORDERUNGEN.md
```

Alles mit führendem `_` wird **nicht** geteilt. Freigegeben wird nur `shared/`.

**Zwei Wege für Freunde:**
- **Einbinden:** Mit einem privaten Microsoft-Konto können sie den geteilten Ordner über „Zu ‚Meine Dateien‘ hinzufügen“ einbinden. Dann synchronisiert OneDrive automatisch.
- **ZIP-Download:** Mit nur einem TUM- oder Firmenkonto geht das oft nicht. Dann laden sie `shared/` im Browser als ZIP herunter, entpacken es an einen festen Ort und laden es ab und zu neu.

Die App akzeptiert beides: Als Pfad darf der Ordner `shared/` selbst oder ein Ordner gewählt werden, der `shared/` enthält. In den Einstellungen und dezent in der Statusleiste zeigt die App das Datum des Datenstands (`manifest.updatedAt`). So sieht man, wenn ein heruntergeladener Stand alt ist. Die README erklärt beide Wege mit Screenshots.

Dateien sind UTF-8, die Daten-Schlüssel deutsch und in camelCase. Jede Moduldatei steht für sich, damit OneDrive nie eine große Datei halb überträgt und Änderungen an einem Modul andere nicht berühren. Claude schreibt **`manifest.json` immer zuletzt**.

### 5.2 `manifest.json`

```json
{
  "schemaVersion": "1.2",
  "updatedAt": "2026-10-07T18:00:00+02:00",
  "studiengang": "M.Sc. Maschinenwesen (TUM)",
  "studienplan": "20261",
  "fpso": "FPSO Maschinenwesen (Master) vom 02.11.2023, lesbare Fassung 07.03.2024",
  "anzahlModule": 64,
  "hinweis": "Gepflegt von Max Bergt. Ohne Gewähr, maßgeblich ist TUMonline."
}
```

`schemaVersion` hat das Format `MAJOR.MINOR`. Eine neue MINOR-Version fügt nur optionale Felder hinzu, eine neue MAJOR-Version bricht die Kompatibilität. Die App prüft nur die Hauptversion; eine neuere MINOR-Version wird ohne Warnung gelesen.

| Version | Änderung |
|---|---|
| 1.0 | erste Fassung |
| 1.1 | Notenspiegel: Stufen `1.4`, `2.4`, `3.4` in `verteilung`, neue optionale Felder `notenbonus` und `hinweis` (5.5). App-Versionen bis einschließlich v0.1.0 kennen die Bonus-Stufen nicht und behalten für solche Moduldateien ihren Cache. |
| 1.2 | Notenspiegel: `verteilung` erlaubt jede Stufe `"x.y"` von `"1.0"` bis `"5.0"` mit einer Nachkommastelle (Zwischenstufen, 5.5). App-Versionen bis einschließlich v0.1.0 behalten für Moduldateien mit anderen Zwischenstufen als 1,4 / 2,4 / 3,4 ihren Cache. |

### 5.3 `regeln.json`

```json
{
  "gesamtCp": 120,
  "kategorien": [
    { "id": "G",  "name": "Ingenieurwissenschaftliche Grundlagen", "kurz": "Grundlagen",       "gruppe": "Mastermodule", "minCp": 20,   "maxCp": null, "zaehltZurNote": true },
    { "id": "K",  "name": "Kernfächer des Maschinenwesens",        "kurz": "Kernfach",         "gruppe": "Mastermodule", "minCp": null, "maxCp": 40,   "zaehltZurNote": true },
    { "id": "A",  "name": "Angrenzende Fachgebiete",               "kurz": "Angrenzend",       "gruppe": "Mastermodule", "minCp": null, "maxCp": 15,   "zaehltZurNote": true },
    { "id": "F",  "name": "Ingenieurwiss. Flexibilisierung",       "kurz": "Flexibilisierung", "gruppe": "Mastermodule", "minCp": null, "maxCp": 15,   "zaehltZurNote": true },
    { "id": "HP", "name": "Hochschulpraktika",                     "kurz": "Praktikum",        "gruppe": null, "minCp": 8,  "maxCp": null, "zaehltZurNote": true },
    { "id": "IE", "name": "International Experience",              "kurz": "Intern. Exp.",     "gruppe": null, "minCp": 6,  "maxCp": null, "zaehltZurNote": true },
    { "id": "UE", "name": "Überfachliche Ergänzung",               "kurz": "Überfachlich",     "gruppe": null, "minCp": 5,  "maxCp": null, "zaehltZurNote": false,
      "unterbereiche": [
        { "id": "UE-ETHIK", "name": "Ethik des menschzentrierten Ingenieurwesens",    "minCp": 3 },
        { "id": "UE-WEITERE", "name": "Weitere Angebote zur Überfachlichen Ergänzung", "minCp": 2 }
      ] },
    { "id": "FP", "name": "Forschungspraxis",                      "kurz": "Forschungspraxis", "gruppe": null, "minCp": 11, "maxCp": 11,   "zaehltZurNote": true, "genauEinModul": true },
    { "id": "MA", "name": "Master's Thesis",                       "kurz": "Thesis",           "gruppe": null, "minCp": 30, "maxCp": 30,   "zaehltZurNote": true }
  ],
  "gruppen": [ { "id": "Mastermodule", "sollCp": 60 } ],
  "platzhalterCp": { "G": 5, "K": 5, "A": 5, "F": 5, "HP": 4, "IE": 3, "UE": 3, "FP": 11, "MA": 30 },
  "notenstufen": [1.0, 1.3, 1.7, 2.0, 2.3, 2.7, 3.0, 3.3, 3.7, 4.0],
  "zeugnisnote": "abschneiden_1_nachkommastelle",
  "praedikate": [
    { "bis": 1.5, "name": "sehr gut" },
    { "bis": 2.5, "name": "gut" },
    { "bis": 3.5, "name": "befriedigend" },
    { "bis": 4.0, "name": "ausreichend" }
  ],
  "auszeichnung": { "bis": 1.2, "bezogenAuf": "zeugnisnote" },
  "fristen": [
    { "text": "Bis Ende des 2. Fachsemesters mindestens ein Modul aus Grundlagen, Kernfächern oder Angrenzenden Fachgebieten bestehen (§ 38 Abs. 2 FPSO)",
      "bisFachsemester": 2, "kategorien": ["G", "K", "A"], "minModule": 1 }
  ],
  "farben": { "G": "#1d5fd1", "K": "#0f766e", "A": "#8a4fd0", "F": "#b0572a", "HP": "#a1690a", "IE": "#2f7d8f", "UE": "#6b7280", "FP": "#9d3b6b", "MA": "#374151" }
}
```

Die Werte sind gegen den Studienplan [20261] in TUMonline und die FPSO geprüft. Mindestwerte (`minCp`) werden als Soll angezeigt; liegt eine Kategorie darüber, ist das kein Fehler. Nur ein überschrittenes `maxCp` wird als Problem markiert. Die App liest alle Regeln aus dieser Datei; im Code ist keine davon fest eingebaut. Ändert sich die FPSO, passt Claude nur diese Datei an.

### 5.4 `tags.json`

```json
[
  { "id": "aero",    "name": "Aerodynamik" },
  { "id": "cfd",     "name": "CFD & Numerik" },
  { "id": "stroem",  "name": "Strömungsmechanik" },
  { "id": "thermo",  "name": "Thermofluide" },
  { "id": "luftraum","name": "Luft- & Raumfahrt" },
  { "id": "ethik",   "name": "Ethik" }
]
```

Claude erweitert die Liste nach Bedarf. Die App zeigt Tags, die sie nicht kennt, mit ihrer ID an.

### 5.5 `module/<CODE>.json`

Der Dateiname ist der Modulcode. Ein Modul ohne Code bekommt `X-<kurzname>`.

```json
{
  "code": "XX0001",
  "titel": "Beispiel: Grenzschichten und Reibung",
  "titelEn": "Example: Boundary Layers",
  "cp": 5,
  "kategorien": ["K"],
  "unterbereich": null,
  "tags": ["stroem", "aero"],
  "turnus": "WS",
  "sprache": "DE",
  "leitung": "Prof. Beispiel",
  "kurzbeschreibung": "2–4 Sätze: Worum geht es, was kann man danach?",
  "pruefung": "schriftlich, 90 min",
  "links": {
    "modul": "https://campus.tum.de/…",
    "lehrveranstaltungen": [
      { "semester": "WS 26/27", "url": "https://campus.tum.de/tumonline/…/courses/<ID>" }
    ]
  },
  "angebot": [
    { "semester": "WS 26/27", "status": "bestaetigt" },
    { "semester": "SS 27",    "status": "erwartet" }
  ],
  "notenspiegel": [
    {
      "termin": "FA 24W",
      "semester": "WS 24/25",
      "art": "Haupttermin",
      "pruefungsdatum": null,
      "angemeldet": 25,
      "verteilung": { "1.0": 2, "1.7": 2, "2.3": 4, "3.0": 2, "4.0": 2, "4.7": 1, "5.0": 7 },
      "nichtErschienen": 5,
      "tumonline": { "angetreten": 20, "quoteNegativ": 0.4, "schnittGesamt": 3.42, "schnittBestanden": 2.38 },
      "erfasstAm": "2026-07-27",
      "quelle": "Screenshot TUMonline-Prüfungsstatistik"
    }
  ],
  "kommentare": [
    { "text": "…", "datum": "2026-07-27", "von": "anonym" }
  ],
  "stand": "2026-10-07",
  "quellen": ["TUMonline Modulbeschreibung, abgerufen 07.10.2026"]
}
```

Pflichtfelder sind `code`, `titel`, `cp`, `kategorien` und `turnus`. Alle anderen Felder sind optional. `turnus` ist einer der Werte `WS`, `SS`, `WS+SS` oder `unregelmaessig`. `unterbereich` ist nur bei der Überfachlichen Ergänzung gesetzt (`UE-ETHIK` oder `UE-WEITERE`).

**Notenspiegel – Datierung.** Ein Modul kann beliebig viele Einträge in `notenspiegel` haben.

| Feld | Bedeutung |
|---|---|
| `termin` | Bezeichnung genau wie im Screenshot, z. B. `FA 24W` |
| `semester` | Daraus abgeleitet: `24W` → `WS 24/25`, `25S` → `SS 25`. Danach wird chronologisch sortiert. |
| `art` | `Haupttermin`, `Wiederholung` oder `unbekannt`. Optional: Fehlt das Feld, leitet die App es nach der Regel unten ab. |
| `pruefungsdatum` | ISO-Datum, falls bekannt, sonst `null` |

**Notenspiegel – Verteilung, Notenbonus und Zwischenstufen** (seit 1.1, Zwischenstufen seit 1.2)

| Feld | Bedeutung |
|---|---|
| `verteilung` | Anzahl je Notenstufe, ohne „nicht erschienen“. Erlaubt ist jeder Schlüssel `"x.y"` von `"1.0"` bis `"5.0"` mit genau einer Nachkommastelle (Muster `^([1-4]\.[0-9]\|5\.0)$`; also nicht `"1.50"`, `"1,5"` oder `"5.3"`). Die Standardstufen sind `"1.0"`, `"1.3"`, `"1.7"`, `"2.0"`, `"2.3"`, `"2.7"`, `"3.0"`, `"3.3"`, `"3.7"`, `"4.0"`, `"4.3"`, `"4.7"`, `"5.0"`; alle anderen sind Zwischenstufen (siehe unten). Werte sind ganze Zahlen ≥ 0. Stufen mit 0 dürfen fehlen. |
| `notenbonus` | Optional, Zahl > 0, z. B. `0.3`: Die Verteilung enthält bereits einen Notenbonus dieser Größe. Die App rechnet nichts heraus, sie zeigt nur einen Hinweis. |
| `hinweis` | Optional, kurzer Text zu diesem Termin (z. B. wofür es den Bonus gab). Die App zeigt ihn in der Detailansicht als kleine Notiz. |

**Zwischenstufen** (seit 1.2). TUMonline zeigt in der Verteilung jede Note, die tatsächlich vergeben wurde. Neben den Standardstufen kommen deshalb vor:
- Bonus-Stufen `1.4`, `2.4`, `3.4` (seit 1.1): Ein Notenbonus von 0,3 hat eine 1,7 / 2,7 / 3,7 verbessert.
- Andere Zwischenstufen wie `1.5`, `2.5`, `3.1` (seit 1.2), z. B. bei anderen Bonusregeln oder Noten aus Teilleistungen.

Claude trägt jede Stufe genau so ein, wie sie im Screenshot steht. Für die Kennzahlen zählt eine Zwischenstufe wie jede andere mit ihrem Notenwert; bestanden ist alles ≤ 4,0. Beispiel (erfunden): 14×1,0, 5×1,3, 4×1,5, 5×1,7, 3×2,0, 2×2,5, 2×2,7, 2×3,1 → 37 angetreten, Ø 5 760 / 37 Hundertstel = 1,56. Im Diagramm erscheinen Zwischenstufen nur, wenn sie einen Wert > 0 haben (4.5).

Die eigenen Noten (4.1) bleiben auf den Standardstufen aus `regeln.json`.

**Regel für Haupt- und Wiederholungstermin:** Eine Klausur wird pro Semester nur einmal angeboten. Welche Art ein Termin ist, ergibt sich deshalb aus dem `turnus` des Moduls (er steht in TUMonline bei der Lehrveranstaltung, nicht bei der Prüfung):

| `turnus` | Prüfung im WS | Prüfung im SS |
|---|---|---|
| `WS` | Haupttermin | Wiederholung |
| `SS` | Wiederholung | Haupttermin |
| `WS+SS` | Haupttermin | Haupttermin |
| `unregelmaessig` | unbekannt | unbekannt |

Claude setzt `art` beim Eintragen nach dieser Regel. Ist ein Termin bekanntermaßen eine Ausnahme, trägt Claude den abweichenden Wert ausdrücklich ein. Weil es pro Semester nur einen Termin gibt, ist `semester` innerhalb eines Moduls eindeutig: Ein zweiter Screenshot zum selben Semester aktualisiert den vorhandenen Eintrag, statt einen neuen anzulegen.

**Notenspiegel – Definitionen.** Die Formeln sind an echten TUMonline-Exporten geprüft: Die dort veröffentlichten Schnitte und Durchfallquoten kommen exakt heraus. (Das Beispiel oben ist erfunden; echte Notenspiegel gehören nicht ins öffentliche Repo.)

| Größe | Formel |
|---|---|
| Angetreten | Σ verteilung (ohne „nicht erschienen“) |
| Angemeldet | Angetreten + nichtErschienen |
| Ø gesamt | Σ(Stufe × Anzahl) / Angetreten |
| Ø bestanden | dasselbe, nur über Stufen ≤ 4,0 (Bonus- und Zwischenstufen zählen wie alle anderen) |
| Durchfallquote | Anzahl der Stufen > 4,0 / Angetreten |

Die App rechnet alle Kennzahlen selbst aus `verteilung` und `nichtErschienen` aus. Die Werte unter `tumonline` sind die abgelesenen Originalzahlen. Sie dienen Claude als **Kontrolle beim Auslesen**: Weichen die selbst berechneten Werte um mehr als 0,01 ab, hat Claude sich verlesen. Für die zusammengefasste Ansicht über alle Termine werden die Verteilungen addiert.

### 5.6 Validierung

Das Repo enthält JSON-Schemas für alle Dateien (`schema/*.schema.json`) und einen Test, der die erfundenen Beispieldaten dagegen prüft. Max legt eine Kopie der Schemas in den Projekt-Dokumenten ab, damit Claude im Projekt seine Dateien vor dem Schreiben prüfen kann.

---

## 6. Ablauf der Datenpflege (Claude im Projekt Master_App)

1. Max legt Screenshots, JPGs oder PDFs von Freunden in `_eingang/`.
2. Claude liest sie aus, ordnet sie dem Modul zu (Code und Termin stehen in der Überschrift des Screenshots), bestimmt Semester und Terminart, trägt `notenspiegel` bzw. `kommentare` ein und prüft die Werte gegen die TUMonline-Zahlen (5.5). Ist etwas nicht eindeutig lesbar, fragt Claude nach, statt zu raten.
3. Neue Module: Claude sucht Modulbeschreibung, CP, Turnus, Sprache, Leitung und Links in TUMonline bzw. im Modulhandbuch, schreibt eine Kurzbeschreibung und vergibt Kategorie und Tags.
4. Claude verschiebt die verarbeiteten Originale nach `_quellen/<CODE>/` und schreibt zum Schluss `manifest.json` mit neuem `updatedAt`.
5. Vor jedem Semester prüft Claude `angebot` und die Links zu den Lehrveranstaltungen, weil sich die IDs in TUMonline jedes Semester ändern.

**Erstbefüllung** aus den vorhandenen Quellen: der Modulwahl-HTML (Module im WS 26/27 und Liste fürs SS), dem Blatt „Modulkatalog“ aus `Masternote_Rechner.xlsx` und `ExamStatisticsExport.pdf` (Notenspiegel und Kommentare).

---

## 7. Nicht in Version 1

- Leistungsnachweis aus TUMonline (PDF) importieren
- Prüfungsversuche und Wiederholungen tracken (ein nicht bestandenes Modul hat nur den Status `nicht bestanden`)
- Überschneidungen von Vorlesungs- und Prüfungsterminen
- Katalog in der App bearbeiten; Freunde tragen nicht selbst bei
- Mehrere Spielstände, Rückwärtsrechnung („welche Note brauche ich“)
- Mehrere Studiengänge oder FPSO-Versionen
- Englische Oberfläche
- Persönliche Modulempfehlungen von Claude in der App. Die gibt es weiter im Chat; in der App stehen nur eigene Notizen.

---

## 8. Geklärte Punkte (Version 2)

- **Prüfungsordnung:** Es gilt die aktuellste Fassung, in TUMonline Studienplan [20261]. Die Struktur entspricht den „Wahlbereichen 1–4“ des alten Notenrechners.
- **Hochschulpraktika:** 8 CP laut TUMonline.
- **Überfachliche Ergänzung:** 3 CP Ethik und 2 CP „Weitere Angebote“, z. B. ein angerechneter Sprachkurs.
- **Gesamtnote:** Mastermodule, Hochschulpraktika, International Experience, Forschungspraxis und Thesis, gewichtet nach CP, nach einer Nachkommastelle abgeschnitten. „mit Auszeichnung“ gibt es bis Zeugnisnote 1,2.
- **Auslandsnoten:** eine Nachkommastelle, frei eingebbar bei Status `anerkannt`.
- **Haupt- oder Wiederholungstermin:** wird aus dem Turnus des Moduls abgeleitet (Regel in 5.5).
- **Freunde ohne privates OneDrive:** ZIP-Download reicht als Weg. Die App zeigt das Datum des Datenstands.
- **Persönliche Empfehlungen:** nicht in der App.

## 9. Offene Punkte

- App-Icon (in v0.1.0 ein Platzhalter)
- In-App-Updater aktivieren: Signaturschlüssel erzeugen und als GitHub-Secret hinterlegen (Anleitung in `CLAUDE.md`, Abschnitt „Releases“)
