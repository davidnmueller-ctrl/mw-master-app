// "Prüfungen": exam dates of a semester as month, week or list, with filters,
// the conflicts of the plan and the detail of a module (docs/ANFORDERUNGEN.md 4.8).
import { useEffect, useMemo, useState } from "react";
import { ansichtsEintraege, erstesOffenesSemester, ersterMonat, semesterAuswahl, type AnsichtsEintrag } from "../logic/pruefungsansicht";
import { konfliktText, STUFE_TEXT, zaehleKonflikte } from "../logic/pruefungen";
import { useStore } from "../store";
import type { Belegung, PruefungsAnsicht } from "../types";
import { BelegungDialog } from "./BelegungDialog";
import { KalenderExport } from "./KalenderExport";
import { ListenAnsicht, MonatAnsicht, monatName, montagVon, WochenAnsicht } from "./Kalender";
import { ModulDetail } from "./ModulDetail";
import { KonfliktIcon, planSemesterListe, terminText } from "./Termine";
import { formatDatum, kategorieFarbe } from "./ui";

const heute = () => new Date().toISOString().slice(0, 10);

export function Pruefungen({ zuEinstellungen }: { zuEinstellungen: () => void }) {
  const { shared, belegungen, settings, pruefungen, pruefungsAnsicht: f, setPruefungsAnsicht, regeln, modulMap } = useStore();
  const module = useMemo(() => shared?.module ?? [], [shared]);

  const planSemester = useMemo(() => planSemesterListe(settings, belegungen), [settings, belegungen]);
  const auswahl = useMemo(() => semesterAuswahl(planSemester, pruefungen), [planSemester, pruefungen]);
  const semester = f.semester && auswahl.includes(f.semester) ? f.semester : (erstesOffenesSemester(planSemester, heute()) ?? auswahl[0] ?? null);

  const ergebnis = useMemo(
    () => (semester ? ansichtsEintraege(f, semester, belegungen, module, pruefungen, settings.gelbGrenze) : { eintraege: [], konflikte: [] }),
    [f, semester, belegungen, module, pruefungen, settings.gelbGrenze],
  );
  const { eintraege, konflikte } = ergebnis;
  const zaehlung = zaehleKonflikte(konflikte);

  // Month/week shown; jumps to the first month with dates when the semester or filters change.
  const start = ersterMonat(eintraege);
  const [monat, setMonat] = useState<string | null>(null);
  const [woche, setWoche] = useState<string | null>(null);
  const [fokusTag, setFokusTag] = useState<string | null>(null);
  useEffect(() => {
    setMonat(null);
    setWoche(null);
  }, [semester, f.grundlage]);
  const monatGezeigt = monat ?? start ?? new Date().toISOString().slice(0, 7);
  const ersterTag = eintraege.find((e) => e.termin.datum)?.termin.datum ?? heute();
  const wocheGezeigt = woche ?? montagVon(ersterTag);

  const [detail, setDetail] = useState<string | null>(null);
  const [edit, setEdit] = useState<Belegung | null>(null);
  const [exportOffen, setExportOffen] = useState(false);

  const detailModul = detail ? modulMap.get(detail) ?? null : null;

  const oeffnen = (e: AnsichtsEintrag) => {
    if (e.modul) setDetail(detail === e.modul.code ? null : e.modul.code);
    else if (e.belegung) setEdit(e.belegung);
  };
  const set = (patch: Partial<PruefungsAnsicht>) => void setPruefungsAnsicht(patch);
  const toggle = (liste: string[], id: string) => (liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id]);

  const datei = semester ? pruefungen[semester] : undefined;
  const ohneDaten = !shared?.manifest.pruefungen?.length && !Object.keys(pruefungen).length;
  const alle = f.grundlage === "alle";

  return (
    <div className="page" style={{ maxWidth: detailModul ? 1600 : 1400 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Prüfungstermine</div>
          <h1>Prüfungen</h1>
          <p className="lead">
            Termine aus TUMonline, zugeordnet nach dem Semester der Prüfung. Fehlt ein Termin, schätzt die App ihn aus dem Vorjahr (≈, gestrichelt). Konflikte: rot = Zeiten überschneiden sich, orange = gleicher Tag, gelb = höchstens{" "}
            {settings.gelbGrenze} {settings.gelbGrenze === 1 ? "Tag" : "Tage"} Abstand.
          </p>
        </div>
      </div>

      {ohneDaten ? (
        <div className="notice">
          <strong>Keine Prüfungsdaten.</strong> Im geteilten Ordner gibt es (noch) keine Prüfungstermine. Eigene Termine an den Belegungen werden trotzdem angezeigt und geprüft.{" "}
          {!shared ? (
            <button className="ghost small" onClick={zuEinstellungen}>
              Ordner wählen
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="stack">
        <div className="filters">
          <select value={semester ?? ""} onChange={(e) => set({ semester: e.target.value })} aria-label="Semester">
            {auswahl.map((s) => (
              <option key={s} value={s}>
                {s}
                {planSemester.includes(s) ? "" : " (nicht im Plan)"}
              </option>
            ))}
          </select>
          <div className="segmented" role="group" aria-label="Darstellung">
            {(["monat", "woche", "liste"] as const).map((m) => (
              <button key={m} aria-pressed={f.modus === m} onClick={() => set({ modus: m })}>
                {m === "monat" ? "Monat" : m === "woche" ? "Woche" : "Liste"}
              </button>
            ))}
          </div>
          <span className="small muted">
            {datei ? `Termine Stand ${formatDatum(datei.stand)}` : semester ? "Noch keine Termine – nur Schätzungen" : ""}
          </span>
          <span className="spacer" />
          <button onClick={() => setExportOffen(true)} disabled={!semester}>
            Als Kalenderdatei (.ics) exportieren
          </button>
        </div>

        <div className="filters">
          <div className="segmented" role="group" aria-label="Grundlage">
            <button aria-pressed={!alle} onClick={() => set({ grundlage: "plan" })}>
              Mein Plan
            </button>
            <button aria-pressed={alle} onClick={() => set({ grundlage: "alle" })}>
              Alle Katalogmodule
            </button>
          </div>
          {alle ? (
            <>
              <label className="check">
                <input type="checkbox" checked={f.planImmer} onChange={(e) => set({ planImmer: e.target.checked })} />
                Mein Plan immer einblenden
              </label>
              <label className="check">
                <input type="checkbox" checked={f.wiederholungen} onChange={(e) => set({ wiederholungen: e.target.checked })} />
                Wiederholungstermine
              </label>
              <label className="check">
                <input type="checkbox" checked={f.nurKonfliktfrei} onChange={(e) => set({ nurKonfliktfrei: e.target.checked })} />
                Nur konfliktfreie
              </label>
            </>
          ) : null}
          <label className="check">
            <input type="checkbox" checked={f.schaetzungen} onChange={(e) => set({ schaetzungen: e.target.checked })} />
            Schätzungen
          </label>
          <select value={f.turnus} onChange={(e) => set({ turnus: e.target.value })} aria-label="Turnus">
            <option value="">WS und SS</option>
            <option value="WS">läuft im WS</option>
            <option value="SS">läuft im SS</option>
            <option value="unregelmaessig">unregelmäßig</option>
          </select>
        </div>

        <div className="filters" role="group" aria-label="Kategorien">
          {regeln.kategorien.map((k) => (
            <button
              key={k.id}
              className="chip kat"
              aria-pressed={f.kategorien.length === 0 || f.kategorien.includes(k.id)}
              onClick={() => set({ kategorien: toggle(f.kategorien, k.id) })}
              title={k.name}
            >
              <span className="dot" style={{ background: kategorieFarbe(regeln, k.id) }} />
              {k.kurz}
            </button>
          ))}
          {f.kategorien.length ? (
            <button className="ghost" onClick={() => set({ kategorien: [] })}>
              Alle
            </button>
          ) : null}
        </div>
        {shared?.tags.length ? (
          <div className="filters" role="group" aria-label="Themen">
            <button className="chip" aria-pressed={f.tags.length === 0} onClick={() => set({ tags: [] })}>
              Alle Themen
            </button>
            {shared.tags.map((t) => (
              <button key={t.id} className="chip" aria-pressed={f.tags.includes(t.id)} onClick={() => set({ tags: toggle(f.tags, t.id) })}>
                {t.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className={`catalog ${detailModul ? "with-detail" : ""}`}>
        <div className="stack-lg" style={{ minWidth: 0 }}>
          {!semester ? (
            <div className="card empty">Kein Semester im Plan.</div>
          ) : f.modus === "monat" ? (
            <MonatAnsicht
              eintraege={eintraege}
              monat={monatGezeigt}
              setMonat={setMonat}
              onOpen={oeffnen}
              onMehr={(iso) => {
                setFokusTag(iso);
                set({ modus: "liste" });
              }}
            />
          ) : f.modus === "woche" ? (
            <WochenAnsicht eintraege={eintraege} woche={wocheGezeigt} setWoche={setWoche} onOpen={oeffnen} />
          ) : (
            <ListenAnsicht eintraege={eintraege} fokusTag={fokusTag} onOpen={oeffnen} />
          )}
          {f.modus !== "liste" && eintraege.some((e) => !e.termin.datum) ? (
            <p className="small muted">
              {eintraege.filter((e) => !e.termin.datum).length} Termin(e) ohne Datum stehen in der Liste unter „Ohne Datum / nach Absprache“.
            </p>
          ) : null}
          {f.modus === "monat" && start && monatGezeigt !== start ? (
            <p className="small">
              <button className="ghost small" onClick={() => setMonat(start)}>
                Zum ersten Monat mit Terminen ({monatName(start)})
              </button>
            </p>
          ) : null}

          {semester ? (
            <div className="card stack">
              <div className="row between">
                <h3>Konflikte im Plan · {semester}</h3>
                {konflikte.length ? <span className="small muted">{konfliktText(zaehlung)}</span> : null}
              </div>
              {konflikte.length ? (
                <ul className="konflikt-liste">
                  {konflikte.map((k, i) => (
                    <li key={i} className={k.moeglich ? "moeglich" : ""}>
                      <KonfliktIcon stufe={k.stufe} moeglich={k.moeglich} />
                      <span>
                        <strong>{k.x.titel}</strong> <span className="faint">({terminText(k.a)})</span> und <strong>{k.y.titel}</strong>{" "}
                        <span className="faint">({terminText(k.b)})</span>
                      </span>
                      <span className={`small k-text k-${k.stufe}`}>
                        {STUFE_TEXT[k.stufe]}
                        {k.moeglich ? " · möglich (Schätzung)" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small muted">Keine Prüfungskonflikte zwischen den Modulen dieses Semesters (Status Idee, geplant, angemeldet).</p>
              )}
            </div>
          ) : null}
        </div>
        {detailModul ? <ModulDetail modul={detailModul} onClose={() => setDetail(null)} /> : null}
      </div>

      {edit ? <BelegungDialog start={edit} onClose={() => setEdit(null)} /> : null}
      {exportOffen && semester ? <KalenderExport semester={semester} onClose={() => setExportOffen(false)} /> : null}

    </div>
  );
}
