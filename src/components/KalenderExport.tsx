// Dialog "Als Kalenderdatei (.ics) exportieren" for the Belegungen of one
// semester (docs/ANFORDERUNGEN.md 4.8).
import { useMemo, useState } from "react";
import { EXPORT_STANDARD, exportEreignisse, icsDatei, icsDateiname } from "../logic/ics";
import { planEintraege } from "../logic/pruefungen";
import { speichereKalender } from "../platform";
import { useStore } from "../store";
import type { Status } from "../types";
import { STATUS_LABEL } from "../types";
import { Modal } from "./ui";

const ALLE_STATUS = Object.keys(STATUS_LABEL) as Status[];

export function KalenderExport({ semester, onClose }: { semester: string; onClose: () => void }) {
  const { belegungen, pruefungen, modulMap, settings } = useStore();
  const [status, setStatus] = useState<Status[]>(EXPORT_STANDARD.status);
  const [schaetzungen, setSchaetzungen] = useState(EXPORT_STANDARD.schaetzungen);
  const [busy, setBusy] = useState(false);
  const [ergebnis, setErgebnis] = useState<{ ok: boolean; text: string } | null>(null);

  const eintraege = useMemo(() => planEintraege(belegungen, semester, pruefungen, modulMap, false), [belegungen, semester, pruefungen, modulMap]);
  const ereignisse = useMemo(() => exportEreignisse(eintraege, { status, schaetzungen }), [eintraege, status, schaetzungen]);
  const ohneDatum = eintraege.filter((e) => status.includes(e.belegung.status) && !e.termine.termine.some((t) => t.datum)).length;
  const anzahl = (s: Status) => eintraege.filter((e) => e.belegung.status === s).length;

  async function exportieren() {
    setBusy(true);
    setErgebnis(null);
    try {
      const inhalt = icsDatei(ereignisse, new Date(), `Prüfungen ${semester}`);
      const pfad = await speichereKalender(icsDateiname(semester), inhalt, settings.sharedPath);
      if (pfad) setErgebnis({ ok: true, text: `${ereignisse.length} Termine gespeichert: ${pfad}` });
    } catch (e) {
      setErgebnis({ ok: false, text: String(e instanceof Error ? e.message : e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      titel={`Kalenderdatei · ${semester}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>Schließen</button>
          <button className="primary" disabled={busy || ereignisse.length === 0} onClick={() => void exportieren()}>
            {ereignisse.length} {ereignisse.length === 1 ? "Termin" : "Termine"} exportieren
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small muted">
          Eine .ics-Datei für Google Kalender, Outlook oder Apple Kalender. Ein erneuter Import aktualisiert die Termine, statt sie doppelt anzulegen. Termine ohne Uhrzeit
          werden ganztägig eingetragen.
        </p>
        <div className="stack" style={{ gap: 6 }}>
          <span className="small muted">Belegungen mit Status</span>
          <div className="row">
            {ALLE_STATUS.map((s) => (
              <label key={s} className="check">
                <input
                  type="checkbox"
                  checked={status.includes(s)}
                  onChange={(e) => setStatus(e.target.checked ? [...status, s] : status.filter((x) => x !== s))}
                />
                {STATUS_LABEL[s]} <span className="faint">({anzahl(s)})</span>
              </label>
            ))}
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={schaetzungen} onChange={(e) => setSchaetzungen(e.target.checked)} />
          Schätzungen mitnehmen (Titel mit „(Schätzung)“)
        </label>
        {ohneDatum ? (
          <p className="small muted">
            {ohneDatum} {ohneDatum === 1 ? "Belegung hat" : "Belegungen haben"} keinen Termin mit Datum und {ohneDatum === 1 ? "fehlt" : "fehlen"} in der Datei.
          </p>
        ) : null}
        {ergebnis ? <div className={`notice ${ergebnis.ok ? "ok" : "bad"}`}>{ergebnis.text}</div> : null}
      </div>
    </Modal>
  );
}
