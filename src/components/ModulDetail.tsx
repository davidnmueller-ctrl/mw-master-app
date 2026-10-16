// Detail view of one catalog module: description, links, Notenspiegel
// (per exam, comparison, trend, pooled), online reviews, curated comments,
// private note, add to plan.
import { useEffect, useMemo, useState } from "react";
import { formatCp } from "../logic/noten";
import { artVon, chronologisch, kennzahlen, summiere } from "../logic/notenspiegel";
import { artVonTermin, formatTermin, konflikteMitPlan, planEintraege, STUFE_TEXT, termineFuer } from "../logic/pruefungen";
import { compareSemester, parseSemester } from "../logic/semester";
import { openUrl } from "../platform";
import { useStore } from "../store";
import type { Belegung, Modul } from "../types";
import { belegungAusModul, BelegungDialog, semesterOptionen } from "./BelegungDialog";
import { Verlauf, VerteilungChart } from "./Charts";
import { Reviews } from "./Reviews";
import { formatDatum, formatProzent, formatSchnitt, KategorieBadge, StatusPill } from "./ui";
import { KonfliktIcon, schaetzungsHinweis, TerminKurz, terminText } from "./Termine";

const ALLE = "__alle__";

export function ModulDetail({ modul, onClose }: { modul: Modul; onClose: () => void }) {
  const { belegungen, settings, notizen, setNotiz, tags, pruefungen, modulMap } = useStoreParts();
  const liste = useMemo(() => chronologisch(modul.notenspiegel ?? []), [modul]);
  const [auswahl, setAuswahl] = useState<string>(liste.length ? liste.at(-1)!.termin + "|" + liste.at(-1)!.semester : ALLE);
  const [notiz, setNotizText] = useState(notizen[modul.code] ?? "");
  const [neu, setNeu] = useState<Belegung | null>(null);
  const [semester, setSemester] = useState(settings.erstesSemester);

  useEffect(() => {
    setAuswahl(liste.length ? liste.at(-1)!.termin + "|" + liste.at(-1)!.semester : ALLE);
    setNotizText(notizen[modul.code] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modul.code]);

  const imPlan = belegungen.filter((b) => b.modulCode === modul.code);
  const aktuell = auswahl === ALLE ? null : liste.find((ns) => ns.termin + "|" + ns.semester === auswahl) ?? null;
  const gezeigt = aktuell ?? (liste.length ? { ...summiere(liste), termin: "Alle Termine", semester: "" } : null);
  const k = gezeigt ? kennzahlen(gezeigt) : null;

  const tagName = (id: string) => tags.find((t) => t.id === id)?.name ?? id;

  // Exam dates (4.5): real ones per semester, newest first; estimates for plan semesters without real
  // ones come first (plan semesters lie ahead).
  const echteSemester = Object.keys(pruefungen)
    .filter((s) => pruefungen[s].termine.some((t) => t.code === modul.code))
    .sort((a, b) => compareSemester(b, a));
  const schaetzSemester = [...new Set(imPlan.map((b) => b.semester))]
    .filter((s) => parseSemester(s) && !echteSemester.includes(s))
    .sort((a, b) => compareSemester(b, a));

  // Preview for "Zum Plan hinzufügen": date in the chosen semester and the conflicts it would cause.
  const vorschau = useMemo(() => {
    if (!parseSemester(semester)) return null;
    const mt = termineFuer({ code: modul.code, semester }, pruefungen, modul);
    const plan = planEintraege(belegungen, semester, pruefungen, modulMap);
    return { mt, konflikte: konflikteMitPlan(mt, plan, settings.gelbGrenze, modul.code) };
  }, [semester, modul, pruefungen, belegungen, modulMap, settings.gelbGrenze]);

  return (
    <div className="card detail stack-lg">
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div className="stack" style={{ gap: 4 }}>
          <span className="mono small faint">{modul.code}</span>
          <h2>{modul.titel}</h2>
          {modul.titelEn ? <span className="small muted">{modul.titelEn}</span> : null}
        </div>
        <button className="ghost icon" onClick={onClose} aria-label="Detail schließen">
          ✕
        </button>
      </div>

      <div className="row">
        {modul.kategorien.map((kid) => (
          <KategorieBadge key={kid} id={kid} unterbereich={modul.unterbereich} />
        ))}
        {(modul.tags ?? []).map((t) => (
          <span key={t} className="pill">
            {tagName(t)}
          </span>
        ))}
      </div>

      {modul.kurzbeschreibung ? <p>{modul.kurzbeschreibung}</p> : null}

      <dl className="kv">
        <dt>CP</dt>
        <dd className="mono">{formatCp(modul.cp)}</dd>
        <dt>Turnus</dt>
        <dd>{modul.turnus === "WS+SS" ? "jedes Semester" : modul.turnus === "unregelmaessig" ? "unregelmäßig" : modul.turnus}</dd>
        {modul.sprache ? (
          <>
            <dt>Sprache</dt>
            <dd>{modul.sprache}</dd>
          </>
        ) : null}
        {modul.leitung ? (
          <>
            <dt>Leitung</dt>
            <dd>{modul.leitung}</dd>
          </>
        ) : null}
        {modul.pruefung ? (
          <>
            <dt>Prüfung</dt>
            <dd>{modul.pruefung}</dd>
          </>
        ) : null}
        {modul.angebot?.length ? (
          <>
            <dt>Angebot</dt>
            <dd>{modul.angebot.map((a) => `${a.semester}${a.status === "erwartet" ? " (erwartet)" : ""}`).join(", ")}</dd>
          </>
        ) : null}
        {modul.stand ? (
          <>
            <dt>Stand</dt>
            <dd>{formatDatum(modul.stand)}</dd>
          </>
        ) : null}
      </dl>

      {modul.links?.modul || modul.links?.lehrveranstaltungen?.length ? (
        <div className="row">
          {modul.links?.modul ? <button onClick={() => openUrl(modul.links!.modul!)}>Modulbeschreibung ↗</button> : null}
          {(modul.links?.lehrveranstaltungen ?? []).map((l) => (
            <button key={l.url} onClick={() => openUrl(l.url)}>
              Lehrveranstaltung {l.semester} ↗
            </button>
          ))}
        </div>
      ) : null}

      <section className="stack">
        <h3>Notenspiegel</h3>
        {!liste.length || !gezeigt || !k ? (
          <p className="muted small">Noch kein Notenspiegel.</p>
        ) : (
          <>
            <div className="row" role="group" aria-label="Prüfungstermin">
              {liste.map((ns) => {
                const id = ns.termin + "|" + ns.semester;
                return (
                  <button key={id} className="chip" aria-pressed={auswahl === id} onClick={() => setAuswahl(id)} title={ns.termin}>
                    {ns.semester}
                    {artVon(ns, modul) === "Wiederholung" ? " · Wdh." : ""}
                  </button>
                );
              })}
              {liste.length > 1 ? (
                <button className="chip" aria-pressed={auswahl === ALLE} onClick={() => setAuswahl(ALLE)}>
                  Alle zusammen
                </button>
              ) : null}
            </div>
            {aktuell ? (
              <p className="small muted">
                {aktuell.termin} · {artVon(aktuell, modul)}
                {aktuell.pruefungsdatum ? ` · ${formatDatum(aktuell.pruefungsdatum)}` : ""}
              </p>
            ) : (
              <p className="small muted">Alle {liste.length} Termine addiert.</p>
            )}
            {aktuell?.notenbonus ? <p className="small faint">Verteilung inkl. Notenbonus {formatBonus(aktuell.notenbonus)}</p> : null}
            {aktuell?.hinweis ? <p className="small faint">{aktuell.hinweis}</p> : null}
            {!aktuell && liste.some((ns) => ns.notenbonus) ? (
              <p className="small faint">
                Enthält Termine mit Notenbonus ({liste.filter((ns) => ns.notenbonus).map((ns) => ns.semester).join(", ")}).
              </p>
            ) : null}
            <div className="grid-3" style={{ gap: 10 }}>
              <Stat label="Ø bestanden" wert={formatSchnitt(k.schnittBestanden)} />
              <Stat label="Durchfallquote" wert={formatProzent(k.durchfallquote)} />
              <Stat label="Angetreten / angemeldet" wert={`${k.angetreten} / ${k.angemeldet}`} />
            </div>
            <VerteilungChart verteilung={gezeigt.verteilung} nichtErschienen={gezeigt.nichtErschienen} titel={aktuell ? aktuell.termin : "alle Termine"} />
            <p className="small faint">Ø gesamt (inkl. nicht bestanden): {formatSchnitt(k.schnittGesamt)}</p>

            {liste.length > 1 ? (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Termin</th>
                        <th>Art</th>
                        <th className="r">Angetr.</th>
                        <th className="r">Ø best.</th>
                        <th className="r">Ø ges.</th>
                        <th className="r">Durchfall</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liste.map((ns) => {
                        const kk = kennzahlen(ns);
                        return (
                          <tr key={ns.termin + ns.semester}>
                            <td>
                              {ns.semester} <span className="faint mono small">{ns.termin}</span>
                            </td>
                            <td className="small">{artVon(ns, modul)}</td>
                            <td className="num">{kk.angetreten}</td>
                            <td className="num">{formatSchnitt(kk.schnittBestanden)}</td>
                            <td className="num">{formatSchnitt(kk.schnittGesamt)}</td>
                            <td className="num">{formatProzent(kk.durchfallquote)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="spark-row">
                  <Verlauf
                    titel="Ø bestanden je Termin"
                    punkte={liste.map((ns) => ({ label: ns.semester, wert: kennzahlen(ns).schnittBestanden }))}
                    format={(v) => v.toFixed(1).replace(".", ",")}
                    yMin={1}
                    yMax={4}
                  />
                  <Verlauf
                    titel="Durchfallquote je Termin"
                    punkte={liste.map((ns) => ({ label: ns.semester, wert: kennzahlen(ns).durchfallquote }))}
                    format={(v) => `${Math.round(v * 100)} %`}
                    yMin={0}
                    yMax={Math.max(0.5, ...liste.map((ns) => kennzahlen(ns).durchfallquote ?? 0))}
                  />
                </div>
              </>
            ) : null}
          </>
        )}
      </section>

      <Reviews code={modul.code} />

      {modul.kommentare?.length ? (
        <section className="stack">
          <h3>Kommentare aus dem Katalog</h3>
          {modul.kommentare.map((c, i) => (
            <div key={i} className="comment">
              <p>{c.text}</p>
              <p className="small faint">
                {c.von ?? "anonym"}
                {c.datum ? ` · ${formatDatum(c.datum)}` : ""}
              </p>
            </div>
          ))}
        </section>
      ) : null}

      <section className="stack">
        <h3>Prüfungstermine</h3>
        {!echteSemester.length && !schaetzSemester.length ? <p className="small muted">Keine Prüfungstermine bekannt.</p> : null}
        {schaetzSemester.map((s) => {
          const mt = termineFuer({ code: modul.code, semester: s }, pruefungen, modul);
          return (
            <div key={s} className="stack" style={{ gap: 4 }}>
              <div className="small">
                <strong>{s}</strong> <span className="faint">· im Plan · {mt.herkunft === "schaetzung" ? "Schätzung" : "noch kein Termin"}</span>
              </div>
              {mt.termine.map((t) => (
                <div key={t.id} className="pruef-termin small schaetzung">
                  <span>{terminText(t)}</span>
                  <span className="faint">{schaetzungsHinweis(t)}</span>
                </div>
              ))}
            </div>
          );
        })}
        {echteSemester.map((s) => {
          const art = artVonTermin(modul.turnus, s);
          return (
            <div key={s} className="stack" style={{ gap: 4 }}>
              <div className="small">
                <strong>{s}</strong>
                <span className="faint"> · {art === "unbekannt" ? "Art unbekannt" : art}</span>
              </div>
              {pruefungen[s].termine
                .filter((t) => t.code === modul.code)
                .map((t) => (
                  <div key={t.id} className="pruef-termin small">
                    <span>
                      {formatTermin({ datum: t.datum, datumBis: t.datumBis ?? null, beginn: t.beginn ?? null, ende: t.ende ?? null })}
                      {t.vorbehaltlich ? <span className="tag-mini">vorbehaltlich</span> : null}
                      {t.alternativGruppe ? <span className="tag-mini" title="Parallele Gruppe – man schreibt eine davon">Gruppe</span> : null}
                    </span>
                    <span className="muted">
                      {[t.raeume?.join(", "), t.pruefungsnummer, t.art].filter(Boolean).join(" · ")}
                      {t.abmeldungBis ? ` · Abmeldung bis ${formatDatum(t.abmeldungBis)}` : ""}
                    </span>
                    {t.hinweis ? <span className="faint">{t.hinweis}</span> : null}
                  </div>
                ))}
            </div>
          );
        })}
      </section>

      <section className="stack">
        <h3>Mein Plan</h3>
        {imPlan.length ? (
          imPlan.map((b) => (
            <div key={b.id} className="row small">
              <StatusPill status={b.status} />
              <span>{b.semester === "ohne" ? "ohne Termin" : b.semester === "vor" ? "vor dem Master" : b.semester}</span>
            </div>
          ))
        ) : (
          <p className="small muted">Noch nicht im Plan.</p>
        )}
        <div className="row">
          <select value={semester} onChange={(e) => setSemester(e.target.value)} aria-label="Semester">
            {semesterOptionen(settings).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button className="primary" onClick={() => setNeu(belegungAusModul(modul, { semester, status: "geplant" }))}>
            Zum Plan hinzufügen
          </button>
        </div>
        {vorschau ? (
          <div className="small stack" style={{ gap: 4 }} aria-live="polite">
            <span>
              Prüfung in {semester}: <TerminKurz mt={vorschau.mt} />
            </span>
            {vorschau.konflikte.length ? (
              vorschau.konflikte.map((k, i) => (
                <span key={i} className="row" style={{ gap: 6 }}>
                  <KonfliktIcon stufe={k.stufe} moeglich={k.moeglich} />
                  Konflikt mit {k.mit.titel}: {STUFE_TEXT[k.stufe]}
                  {k.moeglich ? " (möglich, Schätzung)" : ""}
                  <span className="faint">({terminText(k.b)})</span>
                </span>
              ))
            ) : (
              <span className="muted">Keine Prüfungskonflikte.</span>
            )}
          </div>
        ) : null}
      </section>

      <section className="stack">
        <h3>Meine Notiz</h3>
        <textarea
          value={notiz}
          onChange={(e) => setNotizText(e.target.value)}
          onBlur={() => notiz !== (notizen[modul.code] ?? "") && void setNotiz(modul.code, notiz)}
          placeholder="Nur für dich, wird nicht geteilt."
        />
      </section>

      {modul.quellen?.length ? <p className="small faint">Quellen: {modul.quellen.join(" · ")}</p> : null}
      {neu ? <BelegungDialog start={neu} onClose={() => setNeu(null)} /> : null}
    </div>
  );
}

const formatBonus = (x: number) => x.toLocaleString("de-DE", { maximumFractionDigits: 2 });

function Stat({ label, wert }: { label: string; wert: string }) {
  return (
    <div className="kpi" style={{ padding: "10px 12px" }}>
      <span className="eyebrow">{label}</span>
      <span className="mid" style={{ fontSize: 19 }}>
        {wert}
      </span>
    </div>
  );
}

function useStoreParts() {
  const s = useStore();
  return {
    belegungen: s.belegungen,
    settings: s.settings,
    notizen: s.notizen,
    setNotiz: s.setNotiz,
    tags: s.shared?.tags ?? [],
    pruefungen: s.pruefungen,
    modulMap: s.modulMap,
  };
}
