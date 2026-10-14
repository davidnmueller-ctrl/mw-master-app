// "Einstellungen": shared folder, first semester, backup/restore/import, updates.
import { useEffect, useState } from "react";
import { backend, isTauri } from "../api";
import { semesterRange } from "../logic/semester";
import { APP_VERSION, bestaetigen, openFolder, pickFolder, pickJsonFile, suchenNachUpdate, type UpdateInfo } from "../platform";
import { useStore } from "../store";
import { formatDatum, Icon } from "./ui";

export function semesterAuswahl(): string[] {
  return semesterRange("WS 23/24", 10);
}

/** Per-semester state of the exam date files (4.6). */
function PruefungsStand() {
  const { pruefungsBericht, shared } = useStore();
  if (!shared) return null;
  if (!pruefungsBericht.length) {
    return <p className="small muted">Prüfungstermine: keine Prüfungsdaten im geteilten Ordner. Eigene Termine an den Belegungen gehen trotzdem.</p>;
  }
  return (
    <div className="stack" style={{ gap: 4 }}>
      <span className="small muted">Prüfungstermine</span>
      <table className="small">
        <thead>
          <tr>
            <th>Semester</th>
            <th>Stand</th>
            <th className="r">Termine</th>
            <th>Hinweis</th>
          </tr>
        </thead>
        <tbody>
          {pruefungsBericht.map((z) => (
            <tr key={z.semester}>
              <td>{z.semester}</td>
              <td>{z.stand ? formatDatum(z.stand) : "–"}</td>
              <td className="num">{z.anzahl}</td>
              <td className="small">
                {z.zustand === "fehler" ? (
                  <span style={{ color: "var(--warn)" }}>
                    {z.fehler}
                    {z.stand ? " – alter Stand bleibt" : ""}
                  </span>
                ) : z.zustand === "neu" ? (
                  <span className="muted">neu eingelesen</span>
                ) : null}
                {z.unbekannteCodes.length ? (
                  <span className="faint">
                    {z.zustand === "fehler" || z.zustand === "neu" ? " · " : ""}
                    {z.unbekannteCodes.length} {z.unbekannteCodes.length === 1 ? "unbekannter Code" : "unbekannte Codes"} übersprungen ({z.unbekannteCodes.join(", ")})
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SharedStatus() {
  const { shared, einlesen, settings } = useStore();
  return (
    <div className="stack" style={{ gap: 8 }}>
      {shared ? (
        <dl className="kv">
          <dt>Datenstand</dt>
          <dd>{formatDatum(shared.manifest.updatedAt, true)}</dd>
          <dt>Module</dt>
          <dd>{shared.module.length}</dd>
          <dt>Studienplan</dt>
          <dd>
            {shared.manifest.studiengang}
            {shared.manifest.studienplan ? ` [${shared.manifest.studienplan}]` : ""}
          </dd>
          <dt>Schema</dt>
          <dd className="mono">{shared.manifest.schemaVersion}</dd>
          <dt>Zuletzt gelesen</dt>
          <dd>{formatDatum(shared.gelesenAm, true)}</dd>
        </dl>
      ) : settings.sharedPath ? (
        <p className="small muted">Noch keine gültigen Daten gelesen.</p>
      ) : null}
      {shared?.manifest.hinweis ? <p className="small faint">{shared.manifest.hinweis}</p> : null}
      <PruefungsStand />
      {einlesen.fehler ? <div className="notice bad">{einlesen.fehler}</div> : null}
      {einlesen.warnungen.length ? (
        <div className="notice warn">
          <div>
            {einlesen.warnungen.length} Hinweis{einlesen.warnungen.length > 1 ? "e" : ""} beim Einlesen:
            <ul>
              {einlesen.warnungen.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Einstellungen() {
  const { settings, setSettings, leseShared, einlesen, backupInfo, backupJetzt, wiederherstellen } = useStore();
  const [datenOrdner, setDatenOrdner] = useState("");
  const [meldung, setMeldung] = useState<{ text: string; art: "ok" | "bad" } | null>(null);
  const [update, setUpdate] = useState<UpdateInfo | null | "aktuell">(null);
  const [updateFehler, setUpdateFehler] = useState<string | null>(null);

  useEffect(() => {
    void backend().then((b) => b.dataDir().then(setDatenOrdner));
  }, []);

  async function waehleShared() {
    const p = await pickFolder("Geteilten Ordner wählen (shared oder der Ordner darüber)");
    if (!p) return;
    await setSettings({ sharedPath: p });
    await leseShared({ pfad: p });
  }

  async function waehleBackup() {
    const p = await pickFolder("Ordner für Backups wählen");
    if (!p) return;
    if (settings.sharedPath && p.toLowerCase().startsWith(settings.sharedPath.toLowerCase())) {
      setMeldung({ text: "Der Backup-Ordner liegt im geteilten Ordner – deine Noten wären dann für andere sichtbar. Bitte einen privaten Ordner wählen.", art: "bad" });
      return;
    }
    await setSettings({ backupDir: p });
    setMeldung({ text: "Backup-Ordner gespeichert. Ab jetzt wird nach jeder Änderung automatisch gesichert.", art: "ok" });
  }

  async function importieren() {
    const p = await pickJsonFile("Backup- oder Importdatei wählen");
    if (!p) return;
    if (!(await bestaetigen("Alle privaten Daten (Noten, Plan, Spielmodus, Notizen) werden durch den Inhalt der Datei ersetzt. Fortfahren?"))) return;
    try {
      const n = await wiederherstellen(p);
      setMeldung({ text: `${n} Einträge übernommen.`, art: "ok" });
    } catch (e) {
      setMeldung({ text: `Import fehlgeschlagen: ${String(e)}`, art: "bad" });
    }
  }

  async function updatePruefen() {
    setUpdateFehler(null);
    try {
      const u = await suchenNachUpdate();
      setUpdate(u ?? "aktuell");
    } catch (e) {
      setUpdateFehler(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">App</div>
          <h1>Einstellungen</h1>
        </div>
      </div>

      {meldung ? <div className={`notice ${meldung.art}`}>{meldung.text}</div> : null}

      <section className="card stack">
        <h2>Geteilter Ordner</h2>
        <p className="small muted">
          Modulkatalog und Notenspiegel. Entweder der eingebundene OneDrive-Ordner oder ein entpackter ZIP-Download. Gewählt werden darf der Ordner „shared“ selbst oder der Ordner, der ihn enthält. Die App liest nur, sie schreibt nie hinein.
        </p>
        <div className="row">
          <code className="mono small" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
            {settings.sharedPath ?? "nicht gewählt"}
          </code>
          <button onClick={waehleShared}>Ordner wählen</button>
          <button className="primary" disabled={!settings.sharedPath || einlesen.laeuft} onClick={() => void leseShared()}>
            <span className="row" style={{ gap: 6 }}>
              <Icon name="refresh" size={14} /> {einlesen.laeuft ? "Lese …" : "Aktualisieren"}
            </span>
          </button>
        </div>
        <SharedStatus />
        <p className="small faint">Wird bei jedem Start gelesen und, solange die App offen ist, höchstens einmal pro Stunde automatisch geprüft.</p>
      </section>

      <section className="card stack">
        <h2>Studium</h2>
        <label className="field" style={{ maxWidth: 260 }}>
          Erstes Mastersemester
          <select value={settings.erstesSemester} onChange={(e) => void setSettings({ erstesSemester: e.target.value })}>
            {semesterAuswahl().map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ maxWidth: 420 }}>
          Prüfungskonflikte: „gelb“ bis zu so vielen Kalendertagen Abstand
          <select value={settings.gelbGrenze} onChange={(e) => void setSettings({ gelbGrenze: Number(e.target.value) })}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "0 – gelb aus" : n === 1 ? "1 Tag (direkt hintereinander)" : `${n} Tage${n === 2 ? " (Standard: höchstens ein freier Tag dazwischen)" : ""}`}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="card stack">
        <h2>Meine Daten</h2>
        <p className="small muted">
          Deine Noten, dein Plan, der Spielmodus und deine Notizen liegen nur auf diesem Rechner. Updates und Neuinstallation lassen sie stehen.
        </p>
        <dl className="kv">
          <dt>Datenordner</dt>
          <dd className="row">
            <code className="mono small">{datenOrdner}</code>
            {isTauri ? (
              <button className="ghost small" onClick={() => void openFolder(datenOrdner)}>
                öffnen
              </button>
            ) : null}
          </dd>
          <dt>Backup-Ordner</dt>
          <dd className="mono small">{settings.backupDir ?? "nicht gewählt"}</dd>
          <dt>Letztes Backup</dt>
          <dd>{backupInfo.zuletzt ? formatDatum(backupInfo.zuletzt, true) : "–"}</dd>
        </dl>
        {backupInfo.fehler ? <div className="notice bad">Backup fehlgeschlagen: {backupInfo.fehler}</div> : null}
        <div className="row">
          <button onClick={waehleBackup}>Backup-Ordner wählen</button>
          <button disabled={!settings.backupDir} onClick={() => void backupJetzt()}>
            Jetzt sichern
          </button>
          <button onClick={importieren} disabled={!isTauri}>
            Wiederherstellen / Importieren …
          </button>
        </div>
        <p className="small faint">
          Das Backup („mw-master-backup.json“) wird nach jeder Änderung automatisch geschrieben. Dasselbe Format dient zum Import, z. B. einer von Claude vorbereiteten Datei mit deinen bisherigen Noten.
        </p>
      </section>

      <section className="card stack">
        <h2>Version und Updates</h2>
        <div className="row">
          <span>
            MW Master <span className="mono">{APP_VERSION}</span>
          </span>
          <span className="spacer" />
          <button onClick={updatePruefen}>Nach Updates suchen</button>
        </div>
        {update === "aktuell" ? <div className="notice ok">Du hast die neueste Version.</div> : null}
        {update && update !== "aktuell" ? (
          <div className="notice">
            <div className="stack" style={{ gap: 6 }}>
              <strong>Version {update.version} ist verfügbar.</strong>
              {update.notes ? <span className="small">{update.notes}</span> : null}
              <div>
                <button className="primary" onClick={() => void update.install()}>
                  Installieren und neu starten
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {updateFehler ? <div className="notice warn">{updateFehler}</div> : null}
      </section>
    </div>
  );
}
