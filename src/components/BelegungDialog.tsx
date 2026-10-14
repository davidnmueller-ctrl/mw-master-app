// Create or edit a Belegung (a grade and a plan entry are the same record).
import { useMemo, useState } from "react";
import { formatCp, formatNote, istNotenstufe, kategorieVon, parseNote } from "../logic/noten";
import { OHNE_TERMIN, passtZumTurnus, semesterRange, VOR_MASTER } from "../logic/semester";
import { bestaetigen } from "../platform";
import { useStore } from "../store";
import type { Belegung, Modul, Settings, Status } from "../types";
import { ERREICHT, STATUS_LABEL } from "../types";
import { KategorieBadge, Modal } from "./ui";

export function semesterOptionen(settings: Settings, extra = 2): { value: string; label: string }[] {
  return [
    { value: VOR_MASTER, label: "vor dem Master" },
    ...semesterRange(settings.erstesSemester, settings.anzahlSemester + extra).map((s) => ({ value: s, label: s })),
    { value: OHNE_TERMIN, label: "ohne Termin" },
  ];
}

export function leereBelegung(patch: Partial<Belegung> = {}): Belegung {
  return {
    id: 0,
    modulCode: null,
    titel: "",
    cp: 5,
    kategorie: "K",
    unterbereich: null,
    semester: OHNE_TERMIN,
    status: "geplant",
    note100: null,
    notiz: "",
    eigenerTermin: null,
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

export function belegungAusModul(m: Modul, patch: Partial<Belegung> = {}): Belegung {
  return leereBelegung({
    modulCode: m.code,
    titel: m.titel,
    cp: m.cp,
    kategorie: m.kategorien[0],
    unterbereich: m.unterbereich ?? null,
    ...patch,
  });
}

export function BelegungDialog({ start, onClose }: { start: Belegung; onClose: () => void }) {
  const { regeln, settings, shared, modulMap, belegungen, speichereBelegung, loescheBelegung } = useStore();
  const [b, setB] = useState<Belegung>(start);
  const [noteText, setNoteText] = useState(start.note100 != null ? formatNote(start.note100) : "");
  // Only an existing passed record without a grade starts as "ohne Note"; a new one expects a grade.
  const [ohneNote, setOhneNote] = useState(start.id !== 0 && ERREICHT.includes(start.status) && start.note100 == null);
  const [uebernommen, setUebernommen] = useState(false);
  const [suche, setSuche] = useState("");
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const modul = b.modulCode ? modulMap.get(b.modulCode) : undefined;
  const kat = kategorieVon(regeln, b.kategorie);
  const erreicht = ERREICHT.includes(b.status);
  const benotbar = kat?.zaehltZurNote ?? true;

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q || !shared) return [];
    return shared.module.filter((m) => `${m.titel} ${m.code} ${m.titelEn ?? ""}`.toLowerCase().includes(q)).slice(0, 8);
  }, [suche, shared]);

  const set = (patch: Partial<Belegung>) => setB((x) => ({ ...x, ...patch }));

  const waehleModul = (m: Modul) => {
    setSuche("");
    // Already planned? Then grade/update that record instead of creating a duplicate.
    const vorhanden = b.id === 0 ? belegungen.find((x) => x.modulCode === m.code && x.status !== "nicht_bestanden") : undefined;
    if (vorhanden) {
      setB({ ...vorhanden, status: b.status, notiz: vorhanden.notiz });
      setUebernommen(true);
      return;
    }
    set({ modulCode: m.code, titel: m.titel, cp: m.cp, kategorie: m.kategorien[0], unterbereich: m.unterbereich ?? null });
  };

  // Grade validation: TUM steps for exams, any value with one decimal for recognised ones.
  const noteFehler = (() => {
    if (!erreicht || ohneNote) return null;
    if (!noteText.trim()) return benotbar ? "Note eintragen oder „ohne Note“ wählen" : null;
    const n = parseNote(noteText);
    if (n == null || n > 400) return "Note zwischen 1,0 und 4,0 mit einer Nachkommastelle";
    if (b.status === "bestanden" && !istNotenstufe(n, regeln)) return "Keine TUM-Notenstufe – bei umgerechneten Noten Status „anerkannt“ wählen";
    return null;
  })();

  const turnusHinweis = modul && !passtZumTurnus(modul.turnus, b.semester) ? `Laut Katalog läuft das Modul im ${modul.turnus}.` : null;

  async function speichern() {
    if (!b.titel.trim()) return setFehler("Titel fehlt");
    if (!(b.cp > 0)) return setFehler("CP müssen größer als 0 sein");
    if (noteFehler) return setFehler(noteFehler);
    const note100 = erreicht && !ohneNote && noteText.trim() ? parseNote(noteText) : null;
    const unterbereich = kat?.unterbereiche?.length ? (b.unterbereich ?? kat.unterbereiche[0].id) : null;
    setBusy(true);
    try {
      await speichereBelegung({ ...b, titel: b.titel.trim(), note100, unterbereich });
      onClose();
    } catch (e) {
      setFehler(String(e));
      setBusy(false);
    }
  }

  async function loeschen() {
    if (!(await bestaetigen(`„${b.titel}“ wirklich löschen?`))) return;
    await loescheBelegung(b.id);
    onClose();
  }

  return (
    <Modal
      titel={b.id ? "Eintrag bearbeiten" : erreicht ? "Note eintragen" : "Modul planen"}
      onClose={onClose}
      footer={
        <>
          {b.id ? (
            <button className="danger" onClick={loeschen} disabled={busy}>
              Löschen
            </button>
          ) : null}
          <span className="spacer" />
          <button onClick={onClose} disabled={busy}>
            Abbrechen
          </button>
          <button className="primary" onClick={speichern} disabled={busy}>
            Speichern
          </button>
        </>
      }
    >
      {modul ? (
        <div className="notice">
          <div className="stack" style={{ gap: 4, flex: 1 }}>
            <div className="row">
              <strong>{modul.titel}</strong>
              <span className="mono faint small">{modul.code}</span>
            </div>
            <div className="row small muted">
              {formatCp(modul.cp)} CP · {modul.turnus} · {modul.kategorien.map((k) => kategorieVon(regeln, k)?.kurz ?? k).join(" / ")}
            </div>
          </div>
          <button className="ghost small" onClick={() => set({ modulCode: null })}>
            Lösen
          </button>
        </div>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          {shared ? (
            <>
              <input type="search" placeholder="Modul im Katalog suchen (Titel oder Nummer) …" value={suche} onChange={(e) => setSuche(e.target.value)} autoFocus />
              {treffer.length ? (
                <div className="suggest">
                  {treffer.map((m) => (
                    <button key={m.code} onClick={() => waehleModul(m)}>
                      <span>{m.titel}</span>
                      <span className="mono faint small">
                        {m.code} · {formatCp(m.cp)} CP
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              <p className="small faint">Oder unten einen freien Eintrag anlegen, z. B. für eine Anerkennung aus dem Ausland.</p>
            </>
          ) : (
            <p className="small faint">Kein Katalog verknüpft – freier Eintrag.</p>
          )}
        </div>
      )}

      {uebernommen ? <div className="notice">Das Modul steht schon in deinem Plan – dieser Eintrag wird aktualisiert, kein Duplikat angelegt.</div> : null}
      <div className="form-grid">
        <label className="field full">
          Titel
          <input value={b.titel} onChange={(e) => set({ titel: e.target.value })} placeholder="z. B. CFD-Kurs (Erasmus)" />
        </label>
        <label className="field">
          CP
          <input type="number" min={0.5} step={0.5} value={b.cp} onChange={(e) => set({ cp: Number(e.target.value) })} />
        </label>
        <label className="field">
          Kategorie
          <select value={b.kategorie} onChange={(e) => set({ kategorie: e.target.value, unterbereich: null })}>
            {regeln.kategorien.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
                {modul && modul.kategorien.includes(k.id) ? " (laut Katalog)" : ""}
              </option>
            ))}
          </select>
        </label>
        {kat?.unterbereiche?.length ? (
          <label className="field full">
            Unterbereich
            <select value={b.unterbereich ?? kat.unterbereiche[0].id} onChange={(e) => set({ unterbereich: e.target.value })}>
              {kat.unterbereiche.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.minCp ? ` (${formatCp(u.minCp)} CP)` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="field">
          Semester (Prüfung)
          <select value={b.semester} onChange={(e) => set({ semester: e.target.value })}>
            {semesterOptionen(settings).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Status
          <select value={b.status} onChange={(e) => set({ status: e.target.value as Status })}>
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        {turnusHinweis ? <p className="full small muted">{turnusHinweis} Das ist erlaubt, nur ein Hinweis.</p> : null}
        {erreicht ? (
          <div className="full stack" style={{ gap: 6 }}>
            <div className="row">
              <label className="field">
                Note
                <input
                  className="note-input"
                  value={noteText}
                  disabled={ohneNote}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="1,3"
                  aria-invalid={!!noteFehler && !!noteText.trim()}
                />
              </label>
              <label className="check" style={{ marginTop: 18 }}>
                <input type="checkbox" checked={ohneNote} onChange={(e) => setOhneNote(e.target.checked)} />
                ohne Note (nur „bestanden“)
              </label>
            </div>
            {!benotbar ? <p className="small muted">Studienleistung – zählt für die CP, nicht für die Note.</p> : null}
            {b.status === "anerkannt" ? <p className="small muted">Umgerechnete Auslandsnoten haben eine Nachkommastelle, z. B. 1,5.</p> : null}
            {noteFehler && noteText.trim() ? <p className="small" style={{ color: "var(--bad)" }}>{noteFehler}</p> : null}
          </div>
        ) : null}
        <label className="field full">
          Notiz (privat)
          <textarea value={b.notiz} onChange={(e) => set({ notiz: e.target.value })} rows={2} />
        </label>
      </div>
      {b.kategorie ? (
        <div className="row small muted">
          Wird gezählt in <KategorieBadge id={b.kategorie} unterbereich={kat?.unterbereiche?.length ? (b.unterbereich ?? kat.unterbereiche[0].id) : null} />
        </div>
      ) : null}
      {fehler ? <div className="notice bad">{fehler}</div> : null}
    </Modal>
  );
}
