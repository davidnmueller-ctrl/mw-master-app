// "Semesterplan": records per exam semester, drag & drop between semesters.
// Cards of catalog modules open the catalog detail on the right (ⓘ).
import { useMemo, useState } from "react";
import { formatCp, formatNote, strukturCheck, type Leistung } from "../logic/noten";
import { referenztermin } from "../logic/notenspiegel";
import {
  konflikteImSemester,
  konflikteVon,
  konfliktText,
  planEintraege,
  STUFE_TEXT,
  termineFuer,
  zaehleKonflikte,
  type Konflikt,
} from "../logic/pruefungen";
import { OHNE_TERMIN, parseSemester, passtZumTurnus, semesterRange, VOR_MASTER } from "../logic/semester";
import { useStore } from "../store";
import type { Belegung } from "../types";
import { BelegungDialog, leereBelegung } from "./BelegungDialog";
import { ModulDetail } from "./ModulDetail";
import { StrukturListe } from "./Struktur";
import { KonfliktIcon, stufeTitel, TerminKurz, terminText } from "./Termine";
import { formatProzent, formatSchnitt, kategorieFarbe, StatusPill, Kennwert, ModulInfo, TerminHinweis, type InfoProps } from "./ui";

const RICHTWERT_CP = 30;

export function Plan({ zuPruefungen }: { zuPruefungen: (semester: string) => void }) {
  const { belegungen, settings, setSettings, speichereBelegung, regeln, modulMap, pruefungen } = useStore();
  const [edit, setEdit] = useState<Belegung | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [detailCode, setDetailCode] = useState<string | null>(null);
  const detailModul = detailCode ? modulMap.get(detailCode) ?? null : null;
  const info: InfoProps = { offen: detailCode, oeffnen: (code) => setDetailCode(detailCode === code ? null : code) };

  const semester = semesterRange(settings.erstesSemester, settings.anzahlSemester);
  const spalten = [
    ...(belegungen.some((b) => b.semester === VOR_MASTER) ? [{ id: VOR_MASTER, titel: "vor dem Master" }] : []),
    ...semester.map((s) => ({ id: s, titel: s })),
    // records in semesters beyond the visible range stay visible
    ...[...new Set(belegungen.map((b) => b.semester))]
      .filter((s) => s !== VOR_MASTER && s !== OHNE_TERMIN && !semester.includes(s))
      .map((s) => ({ id: s, titel: s })),
    { id: OHNE_TERMIN, titel: "ohne Termin" },
  ];

  // Planned view: everything except failed modules counts towards the plan.
  const planLeistungen: Leistung[] = useMemo(
    () =>
      belegungen
        .filter((b) => b.status !== "nicht_bestanden")
        .map((b) => ({ cp: b.cp, kategorie: b.kategorie, unterbereich: b.unterbereich, note100: b.note100 })),
    [belegungen],
  );
  const check = useMemo(() => strukturCheck(planLeistungen, regeln), [planLeistungen, regeln]);

  // Exam conflicts per semester (4.3, 4.8); recomputed whenever a card moves.
  const konflikte = useMemo(() => {
    const map = new Map<string, Konflikt[]>();
    for (const s of new Set(belegungen.map((b) => b.semester))) {
      if (!parseSemester(s)) continue;
      const k = konflikteImSemester(planEintraege(belegungen, s, pruefungen, modulMap), settings.gelbGrenze);
      if (k.length) map.set(s, k);
    }
    return map;
  }, [belegungen, pruefungen, modulMap, settings.gelbGrenze]);
  const alleKonflikte = [...konflikte.entries()].sort(([a], [b]) => spalten.findIndex((x) => x.id === a) - spalten.findIndex((x) => x.id === b));

  async function verschiebe(id: number, ziel: string) {
    const b = belegungen.find((x) => x.id === id);
    if (b && b.semester !== ziel) await speichereBelegung({ ...b, semester: ziel });
  }

  return (
    <div className="page" style={{ maxWidth: 1600 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Mein Plan</div>
          <h1>Semesterplan</h1>
          <p className="lead">
            Gezählt wird das Semester der Prüfung. Ein SS-Modul im WS ist erlaubt – die App zeigt dann nur einen Hinweis. Karten per Drag &amp; Drop verschieben, Klick zum Bearbeiten.
          </p>
        </div>
        <div className="row">
          <button onClick={() => setSettings({ anzahlSemester: settings.anzahlSemester + 1 })}>+ Semester</button>
          {settings.anzahlSemester > 2 ? (
            <button className="ghost" onClick={() => setSettings({ anzahlSemester: settings.anzahlSemester - 1 })}>
              − Semester
            </button>
          ) : null}
          <button className="primary" onClick={() => setEdit(leereBelegung({ semester: semester[0] ?? OHNE_TERMIN }))}>
            + Modul planen
          </button>
        </div>
      </div>

      <div className={`plan-main ${detailModul ? "with-detail" : ""}`}>
      <div className="board">
        {spalten.map((sp) => {
          const items = belegungen.filter((b) => b.semester === sp.id);
          const cp = items.filter((b) => b.status !== "nicht_bestanden").reduce((a, b) => a + b.cp, 0);
          const istSemester = sp.id !== VOR_MASTER && sp.id !== OHNE_TERMIN;
          const ks = konflikte.get(sp.id) ?? [];
          const z = zaehleKonflikte(ks);
          return (
            <div
              key={sp.id}
              id={`semester-${sp.id.replace(/[^A-Za-z0-9]/g, "")}`}
              className={`column ${over === sp.id ? "drop" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== sp.id) setOver(sp.id);
              }}
              onDragLeave={(e) => {
                // ignore moving onto a child element (card, header)
                if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                setOver((o) => (o === sp.id ? null : o));
              }}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                // some WebViews hand out no data on drop; the dragged id is also kept in state
                const id = Number(e.dataTransfer.getData("text/plain")) || drag;
                setDrag(null);
                if (id) void verschiebe(id, sp.id);
              }}
            >
              <div className="column-head">
                <div className="row between">
                  <h3>{sp.titel}</h3>
                  <span className="mono small">
                    {formatCp(cp)}
                    {istSemester ? <span className="faint"> / {RICHTWERT_CP}</span> : null} CP
                  </span>
                </div>
                {istSemester ? (
                  <div className={`meter ${cp > RICHTWERT_CP + 4 ? "ueber" : ""}`}>
                    <span style={{ width: `${Math.min(100, (cp / RICHTWERT_CP) * 100)}%` }} />
                  </div>
                ) : null}
                {z.schlimmste ? (
                  <button
                    className={`ghost konflikt-kopf k-text k-${z.schlimmste}`}
                    onClick={() => zuPruefungen(sp.id)}
                    title="In der Ansicht „Prüfungen“ öffnen"
                  >
                    <KonfliktIcon stufe={z.schlimmste} moeglich={ks[0].moeglich} />
                    {konfliktText(z)}
                  </button>
                ) : null}
              </div>
              <div className="column-body">
                {items.map((b) => {
                  const m = b.modulCode ? modulMap.get(b.modulCode) : undefined;
                  const ref = m ? referenztermin(m) : null;
                  const turnusAnders = m && istSemester && !passtZumTurnus(m.turnus, sp.id);
                  const termine = istSemester
                    ? termineFuer({ code: b.modulCode, semester: sp.id, eigenerTermin: b.eigenerTermin, belegungId: b.id }, pruefungen, m)
                    : null;
                  const eigeneKonflikte = konflikteVon(ks, b.id);
                  const schlimmster = eigeneKonflikte[0]?.k;
                  return (
                    <div
                      key={b.id}
                      className={`plan-card ${drag === b.id ? "dragging" : ""}`}
                      style={{ borderLeftColor: kategorieFarbe(regeln, b.kategorie) }}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", String(b.id));
                        e.dataTransfer.effectAllowed = "move";
                        setDrag(b.id);
                      }}
                      onDragEnd={() => {
                        setDrag(null);
                        setOver(null);
                      }}
                      onClick={() => setEdit(b)}
                      title="Klicken zum Bearbeiten, ziehen zum Verschieben"
                    >
                      <span className="card-head">
                        <span className="t">{b.titel}</span>
                        <ModulInfo modul={m} info={info} label="ⓘ" />
                      </span>
                      <span className="m">
                        <span className="mono">{formatCp(b.cp)} CP</span>
                        <span>{regeln.kategorien.find((x) => x.id === b.kategorie)?.kurz ?? b.kategorie}</span>
                        <StatusPill status={b.status} />
                        {b.note100 != null ? <span className="mono">Note {formatNote(b.note100)}</span> : null}
                      </span>
                      {ref ? (
                        <span className="m">
                          <span>
                            <Kennwert r={ref}>
                              Ø {formatSchnitt(ref.kennzahlen.schnittBestanden)} · Durchfall {formatProzent(ref.kennzahlen.durchfallquote)}
                            </Kennwert>
                            <TerminHinweis r={ref} />
                          </span>
                        </span>
                      ) : null}
                      {termine ? (
                        <span className="exam-zeile">
                          {schlimmster ? (
                            <KonfliktIcon
                              stufe={schlimmster.stufe}
                              moeglich={schlimmster.moeglich}
                              title={eigeneKonflikte
                                .map((x) => `${stufeTitel(x.k.stufe, x.k.moeglich)}: ${x.anderer.titel}\n  ${terminText(x.eigener)}\n  ${terminText(x.fremder)}`)
                                .join("\n")}
                            />
                          ) : null}
                          <TerminKurz mt={termine} />
                        </span>
                      ) : null}
                      {turnusAnders ? <span className="m" style={{ color: "var(--warn)" }}>läuft laut Katalog im {m!.turnus}</span> : null}
                    </div>
                  );
                })}
                {items.length === 0 ? <p className="small faint" style={{ padding: 6 }}>Hierher ziehen</p> : null}
              </div>
            </div>
          );
        })}
      </div>
      {detailModul ? <ModulDetail modul={detailModul} onClose={() => setDetailCode(null)} /> : null}
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <StrukturListe check={check} titel="Gesamtplan nach Kategorien (alles außer „nicht bestanden“)" />
        </div>
        <div className="card stack">
          <h3>Prüfungskonflikte</h3>
          {alleKonflikte.length ? (
            alleKonflikte.map(([s, ks]) => (
              <div key={s} className="stack" style={{ gap: 6 }}>
                <div className="row between">
                  <button
                    className="ghost small"
                    style={{ fontWeight: 600, paddingLeft: 0 }}
                    onClick={() => document.getElementById(`semester-${s.replace(/[^A-Za-z0-9]/g, "")}`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })}
                  >
                    {s}
                  </button>
                  <button className="ghost small" onClick={() => zuPruefungen(s)}>
                    In „Prüfungen“ öffnen
                  </button>
                </div>
                <ul className="konflikt-liste">
                  {ks.map((k, i) => (
                    <li key={i}>
                      <KonfliktIcon stufe={k.stufe} moeglich={k.moeglich} />
                      <span>
                        {k.x.titel} <span className="faint">({terminText(k.a)})</span> · {k.y.titel} <span className="faint">({terminText(k.b)})</span>
                      </span>
                      <span className={`small k-text k-${k.stufe}`}>
                        {STUFE_TEXT[k.stufe]}
                        {k.moeglich ? " · möglich" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <p className="small muted">Keine Prüfungskonflikte im Plan.</p>
          )}
        </div>
      </div>

      {edit ? <BelegungDialog start={edit} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}
