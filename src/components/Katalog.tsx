// "Katalog": all modules from the shared folder with filters, sorting and a detail panel.
import { useMemo, useState } from "react";
import { formatCp } from "../logic/noten";
import { referenztermin, type Referenztermin } from "../logic/notenspiegel";
import { erstesOffenesSemester } from "../logic/pruefungsansicht";
import { ersterTermin, termineFuer, type ModulTermine } from "../logic/pruefungen";
import { useStore } from "../store";
import type { Modul } from "../types";
import { ModulDetail } from "./ModulDetail";
import { planSemesterListe, TerminKurz } from "./Termine";
import { formatProzent, formatSchnitt, kategorieFarbe, Kennwert, KategorieBadge, TerminHinweis } from "./ui";

type SortKey = "titel" | "code" | "cp" | "turnus" | "schnitt" | "durchfall" | "pruefung";

export function Katalog({ zuEinstellungen }: { zuEinstellungen: () => void }) {
  const { shared, belegungen, regeln, settings, pruefungen } = useStore();
  const [q, setQ] = useState("");
  // Category filter, multi-select. null = all categories (also covers modules with unknown categories).
  const [kats, setKats] = useState<Set<string> | null>(null);
  const [tag, setTag] = useState("");
  const [turnus, setTurnus] = useState("");
  const [angebot, setAngebot] = useState("");
  const [sprache, setSprache] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "titel", asc: true });
  const [sel, setSel] = useState<string | null>(null);

  const module = shared?.module ?? [];
  const imPlan = useMemo(() => new Set(belegungen.map((b) => b.modulCode).filter(Boolean)), [belegungen]);
  const angebotSemester = useMemo(() => [...new Set(module.flatMap((m) => (m.angebot ?? []).map((a) => a.semester)))].sort(), [module]);
  const sprachen = useMemo(() => [...new Set(module.map((m) => m.sprache).filter((x): x is string => !!x))].sort(), [module]);

  const stat = useMemo(() => {
    const map = new Map<string, Referenztermin | null>();
    for (const m of module) map.set(m.code, referenztermin(m));
    return map;
  }, [module]);

  // Exam column: semester of the "Angebot" filter, otherwise the first plan semester that is not over.
  const pruefSemester = useMemo(
    () => angebot || erstesOffenesSemester(planSemesterListe(settings, belegungen), new Date().toISOString().slice(0, 10)),
    [angebot, settings, belegungen],
  );
  const termine = useMemo(() => {
    const map = new Map<string, ModulTermine>();
    if (pruefSemester) for (const m of module) map.set(m.code, termineFuer({ code: m.code, semester: pruefSemester }, pruefungen, m));
    return map;
  }, [module, pruefSemester, pruefungen]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = module.filter(
      (m) =>
        (!kats || m.kategorien.some((k) => kats.has(k))) &&
        (!tag || (m.tags ?? []).includes(tag)) &&
        (!turnus || m.turnus === turnus || (turnus !== "unregelmaessig" && m.turnus === "WS+SS")) &&
        (!angebot || (m.angebot ?? []).some((a) => a.semester === angebot)) &&
        (!sprache || m.sprache === sprache) &&
        (!needle || `${m.titel} ${m.titelEn ?? ""} ${m.code} ${m.leitung ?? ""}`.toLowerCase().includes(needle)),
    );
    const val = (m: Modul): string | number => {
      switch (sort.key) {
        case "code":
          return m.code;
        case "cp":
          return m.cp;
        case "turnus":
          return m.turnus;
        case "schnitt":
          return stat.get(m.code)?.kennzahlen.schnittBestanden ?? 99;
        case "durchfall":
          return stat.get(m.code)?.kennzahlen.durchfallquote ?? 99;
        case "pruefung": {
          const t = ersterTermin(termine.get(m.code) ?? { herkunft: "keiner", termine: [] });
          return t?.datum ? `${t.datum}${t.beginn ?? ""}` : "~";
        }
        default:
          return m.titel.toLowerCase();
      }
    };
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "de");
      return sort.asc ? c : -c;
    });
  }, [module, q, kats, tag, turnus, angebot, sprache, sort, stat, termine]);

  const mitStatistik = rows.filter((m) => stat.get(m.code)).length;
  const gefiltert = rows.length !== module.length;

  const alleKats = regeln.kategorien.map((k) => k.id);
  const katAn = (id: string) => !kats || kats.has(id);
  const toggleKat = (id: string) =>
    setKats((alt) => {
      const n = new Set(alt ?? alleKats);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n.size === alleKats.length && alleKats.every((k) => n.has(k)) ? null : n;
    });

  const selModul = sel ? module.find((m) => m.code === sel) ?? null : null;
  // With the detail panel open, the table drops two columns so nothing scrolls sideways.
  const kompakt = !!selModul;

  if (!shared) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <div className="eyebrow">Gemeinsamer Katalog</div>
            <h1>Modulkatalog</h1>
          </div>
        </div>
        <div className="card empty">
          Noch kein geteilter Ordner verknüpft.{" "}
          <button className="primary" onClick={zuEinstellungen} style={{ marginLeft: 8 }}>
            Ordner wählen
          </button>
        </div>
      </div>
    );
  }

  const th = (key: SortKey, label: string, cls = "") => (
    <th
      className={`sortable ${cls}`}
      onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }))}
      aria-sort={sort.key === key ? (sort.asc ? "ascending" : "descending") : "none"}
    >
      {label}
      {sort.key === key ? (sort.asc ? " ↑" : " ↓") : ""}
    </th>
  );

  return (
    <div className="page" style={{ maxWidth: selModul ? 1440 : undefined }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Gemeinsamer Katalog · {module.length} Module</div>
          <h1>Modulkatalog</h1>
          <p className="lead">Nur lesbar. Ø und Durchfallquote vom neuesten Haupttermin (ohne Haupttermin: vom neuesten Termin, „Wdh.“); alle Termine in der Detailansicht.</p>
        </div>
      </div>

      <div className="stack">
        <div className="filters">
          <input type="search" placeholder="Suche nach Titel, Nummer, Dozent" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Suche" />
          <select value={turnus} onChange={(e) => setTurnus(e.target.value)} aria-label="Turnus">
            <option value="">WS und SS</option>
            <option value="WS">läuft im WS</option>
            <option value="SS">läuft im SS</option>
            <option value="unregelmaessig">unregelmäßig</option>
          </select>
          {angebotSemester.length ? (
            <select value={angebot} onChange={(e) => setAngebot(e.target.value)} aria-label="Angebot im Semester">
              <option value="">Angebot: egal</option>
              {angebotSemester.map((s) => (
                <option key={s} value={s}>
                  angeboten {s}
                </option>
              ))}
            </select>
          ) : null}
          {sprachen.length > 1 ? (
            <select value={sprache} onChange={(e) => setSprache(e.target.value)} aria-label="Sprache">
              <option value="">Sprache: egal</option>
              {sprachen.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <div className="filters" role="group" aria-label="Kategorien">
          {regeln.kategorien.map((k) => (
            <button key={k.id} className="chip kat" aria-pressed={katAn(k.id)} onClick={() => toggleKat(k.id)} title={k.name}>
              <span className="dot" style={{ background: kategorieFarbe(regeln, k.id) }} />
              {k.kurz}
            </button>
          ))}
          <span className="spacer" />
          <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
            <button className="ghost" disabled={!kats} onClick={() => setKats(null)}>
              Alle wählen
            </button>
            <button className="ghost" disabled={kats?.size === 0} onClick={() => setKats(new Set())}>
              Alle abwählen
            </button>
          </span>
        </div>
        {shared.tags.length ? (
          <div className="filters" role="group" aria-label="Themen">
            <button className="chip" aria-pressed={tag === ""} onClick={() => setTag("")}>
              Alle Themen
            </button>
            {shared.tags.map((t) => (
              <button key={t.id} className="chip" aria-pressed={tag === t.id} onClick={() => setTag(tag === t.id ? "" : t.id)}>
                {t.name}
              </button>
            ))}
          </div>
        ) : null}
        <p className="small muted" aria-live="polite">
          <strong>{rows.length}</strong>
          {gefiltert ? ` von ${module.length} Modulen` : rows.length === 1 ? " Modul" : " Module"}
          {rows.length ? (
            <>
              {" · "}
              <strong>{mitStatistik}</strong> mit Prüfungsstatistik ({formatProzent(mitStatistik / rows.length)})
            </>
          ) : null}
        </p>
      </div>

      <div className={`catalog ${selModul ? "with-detail" : ""}`}>
        <div className="card flat">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {th("titel", "Modul")}
                  {th("cp", "CP", "r")}
                  {kompakt ? null : <th>Kategorie</th>}
                  {kompakt ? null : th("turnus", "Turnus")}
                  {th("schnitt", "Ø best.", "r")}
                  {th("durchfall", "Durchfall", "r")}
                  {pruefSemester ? th("pruefung", `Prüfung ${pruefSemester}`) : null}
                  <th className="c">Plan</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={(kompakt ? 5 : 7) + (pruefSemester ? 1 : 0)} className="empty">
                      {kats?.size === 0 ? "Keine Kategorie gewählt." : "Kein Modul passt zu diesen Filtern."}
                    </td>
                  </tr>
                ) : (
                  rows.map((m) => {
                    const s = stat.get(m.code);
                    return (
                      <tr key={m.code} className={`clickable ${sel === m.code ? "selected" : ""}`} onClick={() => setSel(sel === m.code ? null : m.code)}>
                        <td>
                          <div>{m.titel}</div>
                          <div className="small faint mono">
                            {m.code}
                            {m.sprache ? ` · ${m.sprache}` : ""}
                            {m.kommentare?.length ? ` · ${m.kommentare.length} Kommentar${m.kommentare.length > 1 ? "e" : ""}` : ""}
                            {kompakt ? ` · ${turnusKurz(m)}` : ""}
                          </div>
                        </td>
                        <td className="num">{formatCp(m.cp)}</td>
                        {kompakt ? null : (
                          <td>
                            <div className="row" style={{ gap: 4 }}>
                              {m.kategorien.map((k) => (
                                <KategorieBadge key={k} id={k} />
                              ))}
                            </div>
                          </td>
                        )}
                        {kompakt ? null : <td className="small">{turnusKurz(m)}</td>}
                        <td className="num">
                          {s ? <Kennwert r={s}>{formatSchnitt(s.kennzahlen.schnittBestanden)}</Kennwert> : formatSchnitt(null)}
                          {s ? <TerminHinweis r={s} /> : null}
                          {s && s.anzahlTermine > 1 ? <span className="faint small"> ({s.anzahlTermine})</span> : null}
                        </td>
                        <td className="num">
                          {s ? <Kennwert r={s}>{formatProzent(s.kennzahlen.durchfallquote)}</Kennwert> : formatProzent(null)}
                          {s ? <TerminHinweis r={s} ohneWarnung /> : null}
                        </td>
                        {pruefSemester ? (
                          <td className="small nowrap">
                            <TerminKurz mt={termine.get(m.code) ?? { herkunft: "keiner", termine: [] }} leer="–" />
                          </td>
                        ) : null}
                        <td className="c">{imPlan.has(m.code) ? "✓" : ""}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        {selModul ? <ModulDetail modul={selModul} onClose={() => setSel(null)} /> : null}
      </div>
    </div>
  );
}

function turnusKurz(m: Modul): string {
  return m.turnus === "WS+SS" ? "WS + SS" : m.turnus === "unregelmaessig" ? "unregelm." : m.turnus;
}
