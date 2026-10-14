// Month, week and list display of exam dates (docs/ANFORDERUNGEN.md 4.8).
// Plain components, no calendar library: the data is a few dozen dates.
import { useEffect, useMemo, useRef, useState } from "react";
import { referenztermin } from "../logic/notenspiegel";
import { liegtAm, type AnsichtsEintrag } from "../logic/pruefungsansicht";
import { formatTag, isoAusTagNr, rang, tagNr } from "../logic/pruefungen";
import { useStore } from "../store";
import { formatProzent, formatSchnitt, kategorieFarbe, KategorieBadge } from "./ui";
import { KonfliktIcon, schaetzungsHinweis, stufeTitel, terminText } from "./Termine";

type Oeffnen = (e: AnsichtsEintrag) => void;

const MAX_PRO_TAG = 3;
const STUNDE_PX = 44;
const VON = 8;
const BIS = 20;
const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Monday-based weekday 0..6 of an ISO date. */
const wochentag = (iso: string) => (new Date(tagNr(iso) * 86_400_000).getUTCDay() + 6) % 7;
export const montagVon = (iso: string) => isoAusTagNr(tagNr(iso) - wochentag(iso));
const heuteIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const minuten = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export function monatName(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function monatPlus(yyyyMm: string, n: number): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

function tooltip(e: AnsichtsEintrag): string {
  const t = e.termin;
  return [
    e.titel,
    terminText(t),
    t.raeume.length ? t.raeume.join(", ") : null,
    t.art !== "unbekannt" ? t.art : null,
    schaetzungsHinweis(t),
    t.vorbehaltlich ? "vorbehaltlich" : null,
    t.herkunft === "eigen" ? "eigener Termin" : null,
    e.imPlan ? "im Plan" : "nicht im Plan",
    e.konflikt ? `Konflikt${e.imPlan ? "" : " mit dem Plan"}: ${stufeTitel(e.konflikt.stufe, e.konflikt.moeglich)}` : null,
    t.hinweis,
  ]
    .filter(Boolean)
    .join("\n");
}

/** One exam on the calendar: filled = in the plan, outlined = not, dashed = estimate. */
export function TerminChip({ e, onOpen, mitZeit = true }: { e: AnsichtsEintrag; onOpen: Oeffnen; mitZeit?: boolean }) {
  const { regeln } = useStore();
  const kat = e.belegung?.kategorie ?? e.modul?.kategorien[0];
  const ref = e.modul ? referenztermin(e.modul) : null;
  const t = e.termin;
  const cls = [
    "exam",
    e.imPlan ? "im-plan" : "frei",
    t.herkunft === "schaetzung" ? "schaetzung" : "",
    e.konflikt ? `k-${e.konflikt.stufe}` : "",
    e.konflikt?.moeglich ? "k-moeglich" : "",
  ].join(" ");
  return (
    <button
      className={cls}
      style={{ ["--kat" as string]: kat ? kategorieFarbe(regeln, kat) : "var(--faint)" }}
      title={tooltip(e)}
      onClick={(ev) => {
        ev.stopPropagation();
        onOpen(e);
      }}
    >
      <span className="exam-l1">
        {e.konflikt ? <KonfliktIcon stufe={e.konflikt.stufe} moeglich={e.konflikt.moeglich} /> : null}
        {mitZeit && t.beginn ? <span className="exam-zeit">{t.beginn}</span> : null}
        <span className="exam-titel">
          {t.herkunft === "schaetzung" ? "≈ " : ""}
          {e.titel}
        </span>
      </span>
      <span className="exam-l2">
        {t.raeume.length ? <span className="exam-raum">{t.raeume.join(", ")}</span> : null}
        {ref ? <span className="exam-schnitt">Ø {formatSchnitt(ref.kennzahlen.schnittBestanden)}</span> : null}
        {t.vorbehaltlich ? <span className="tag-mini">vorbehaltlich</span> : null}
      </span>
    </button>
  );
}

// ---------------- month ----------------

export function MonatAnsicht({
  eintraege,
  monat,
  setMonat,
  onOpen,
  onMehr,
}: {
  eintraege: AnsichtsEintrag[];
  monat: string;
  setMonat: (m: string) => void;
  onOpen: Oeffnen;
  onMehr: (iso: string) => void;
}) {
  const erster = `${monat}-01`;
  const start = tagNr(montagVon(erster));
  const letzter = tagNr(`${monatPlus(monat, 1)}-01`) - 1;
  const ende = letzter + (6 - wochentag(isoAusTagNr(letzter)));
  const tage = Array.from({ length: ende - start + 1 }, (_, i) => isoAusTagNr(start + i));
  const heute = heuteIso();
  const datiert = eintraege.filter((e) => e.termin.datum);

  return (
    <div className="kalender">
      <div className="row between kal-nav">
        <button className="ghost icon" onClick={() => setMonat(monatPlus(monat, -1))} aria-label="Vorheriger Monat">
          ‹
        </button>
        <h3>{monatName(monat)}</h3>
        <button className="ghost icon" onClick={() => setMonat(monatPlus(monat, 1))} aria-label="Nächster Monat">
          ›
        </button>
      </div>
      <div className="monat" role="grid" aria-label={monatName(monat)}>
        {WOCHENTAGE.map((w) => (
          <div key={w} className="monat-kopf" role="columnheader">
            {w}
          </div>
        ))}
        {tage.map((iso) => {
          const am = datiert.filter((e) => liegtAm(e.termin, iso));
          const fremd = !iso.startsWith(monat);
          return (
            <div key={iso} role="gridcell" className={`monat-tag${fremd ? " fremd" : ""}${iso === heute ? " heute" : ""}`}>
              <div className="monat-nr">{Number(iso.slice(8))}</div>
              {am.slice(0, MAX_PRO_TAG).map((e) => (
                <TerminChip key={e.key} e={e} onOpen={onOpen} />
              ))}
              {am.length > MAX_PRO_TAG ? (
                <button className="ghost mehr" onClick={() => onMehr(iso)}>
                  +{am.length - MAX_PRO_TAG} weitere
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- week ----------------

interface Platz {
  e: AnsichtsEintrag;
  von: number;
  bis: number;
  spur: number;
  spuren: number;
}

/** Side-by-side lanes for dates that overlap in time. */
function spuren(liste: AnsichtsEintrag[]): Platz[] {
  const p: Platz[] = liste
    .map((e) => {
      const von = minuten(e.termin.beginn!);
      const bis = e.termin.ende && minuten(e.termin.ende) > von ? minuten(e.termin.ende) : von + 60;
      return { e, von, bis, spur: 0, spuren: 1 };
    })
    .sort((a, b) => a.von - b.von || b.bis - a.bis);
  let gruppe: Platz[] = [];
  let gruppenEnde = -1;
  const schliessen = () => {
    const n = Math.max(1, ...gruppe.map((x) => x.spur + 1));
    for (const x of gruppe) x.spuren = n;
    gruppe = [];
  };
  for (const x of p) {
    if (x.von >= gruppenEnde) {
      schliessen();
      gruppenEnde = -1;
    }
    const belegt = new Set(gruppe.filter((g) => g.bis > x.von).map((g) => g.spur));
    let s = 0;
    while (belegt.has(s)) s++;
    x.spur = s;
    gruppe.push(x);
    gruppenEnde = Math.max(gruppenEnde, x.bis);
  }
  schliessen();
  return p;
}

export function WochenAnsicht({
  eintraege,
  woche,
  setWoche,
  onOpen,
}: {
  eintraege: AnsichtsEintrag[];
  woche: string;
  setWoche: (iso: string) => void;
  onOpen: Oeffnen;
}) {
  const datiert = eintraege.filter((e) => e.termin.datum);
  const montag = tagNr(woche);
  const sonntag = isoAusTagNr(montag + 6);
  const mitSonntag = datiert.some((e) => liegtAm(e.termin, sonntag));
  const tage = Array.from({ length: mitSonntag ? 7 : 6 }, (_, i) => isoAusTagNr(montag + i));
  const ganztags = (e: AnsichtsEintrag) => !e.termin.beginn || !!e.termin.datumBis;
  const heute = heuteIso();
  const stunden = Array.from({ length: BIS - VON }, (_, i) => VON + i);
  const spalten = `52px repeat(${tage.length}, minmax(0, 1fr))`;

  return (
    <div className="kalender">
      <div className="row between kal-nav">
        <button className="ghost icon" onClick={() => setWoche(isoAusTagNr(montag - 7))} aria-label="Vorherige Woche">
          ‹
        </button>
        <h3>
          {formatTag(tage[0], false)} – {formatTag(tage.at(-1)!)}
        </h3>
        <button className="ghost icon" onClick={() => setWoche(isoAusTagNr(montag + 7))} aria-label="Nächste Woche">
          ›
        </button>
      </div>
      <div className="woche">
        <div className="woche-reihe woche-kopf" style={{ gridTemplateColumns: spalten }}>
          <div />
          {tage.map((iso) => (
            <div key={iso} className={iso === heute ? "heute" : ""}>
              {formatTag(iso, false)}
            </div>
          ))}
        </div>
        <div className="woche-reihe woche-ganztag" style={{ gridTemplateColumns: spalten }}>
          <div className="faint small">ganztags</div>
          {tage.map((iso) => (
            <div key={iso} className="woche-zelle">
              {datiert
                .filter((e) => ganztags(e) && liegtAm(e.termin, iso))
                .map((e) => (
                  <TerminChip key={e.key} e={e} onOpen={onOpen} />
                ))}
            </div>
          ))}
        </div>
        <div className="woche-reihe woche-raster" style={{ gridTemplateColumns: spalten, height: (BIS - VON) * STUNDE_PX }}>
          <div className="woche-stunden">
            {stunden.map((h) => (
              <div key={h} style={{ top: (h - VON) * STUNDE_PX }}>
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {tage.map((iso) => (
            <div key={iso} className="woche-tag" style={{ backgroundSize: `100% ${STUNDE_PX}px` }}>
              {spuren(datiert.filter((e) => !ganztags(e) && e.termin.datum === iso)).map((p) => {
                const top = Math.max(0, ((p.von - VON * 60) / 60) * STUNDE_PX);
                const unten = Math.min((BIS - VON) * STUNDE_PX, ((p.bis - VON * 60) / 60) * STUNDE_PX);
                return (
                  <div
                    key={p.e.key}
                    className="woche-termin"
                    style={{
                      top,
                      height: Math.max(22, unten - top),
                      left: `${(p.spur / p.spuren) * 100}%`,
                      width: `${100 / p.spuren}%`,
                    }}
                  >
                    <TerminChip e={p.e} onOpen={onOpen} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------- list ----------------

type Spalte = "datum" | "zeit" | "modul" | "kategorie" | "raum" | "schnitt" | "durchfall" | "art" | "plan" | "konflikt";

export function ListenAnsicht({ eintraege, fokusTag, onOpen }: { eintraege: AnsichtsEintrag[]; fokusTag: string | null; onOpen: Oeffnen }) {
  const { regeln } = useStore();
  const [sort, setSort] = useState<{ key: Spalte; asc: boolean }>({ key: "datum", asc: true });
  const fokusRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    fokusRef.current?.scrollIntoView({ block: "center" });
  }, [fokusTag]);

  const stat = useMemo(() => new Map(eintraege.map((e) => [e.key, e.modul ? referenztermin(e.modul) : null])), [eintraege]);
  const datiert = eintraege.filter((e) => e.termin.datum);
  const ohne = eintraege.filter((e) => !e.termin.datum);

  const sortiert = useMemo(() => {
    const kurz = (id: string | undefined) => regeln.kategorien.find((k) => k.id === id)?.kurz ?? id ?? "";
    const val = (e: AnsichtsEintrag): string | number => {
      const s = stat.get(e.key);
      switch (sort.key) {
        case "zeit":
          return e.termin.beginn ?? "99";
        case "modul":
          return e.titel.toLowerCase();
        case "kategorie":
          return kurz(e.belegung?.kategorie ?? e.modul?.kategorien[0]);
        case "raum":
          return e.termin.raeume.join(", ") || "~";
        case "schnitt":
          return s?.kennzahlen.schnittBestanden ?? 99;
        case "durchfall":
          return s?.kennzahlen.durchfallquote ?? 99;
        case "art":
          return e.termin.art;
        case "plan":
          return e.imPlan ? 0 : 1;
        case "konflikt":
          return -rang(e.konflikt?.stufe ?? null) * 2 + (e.konflikt?.moeglich ? 1 : 0);
        default:
          return `${e.termin.datum}${e.termin.beginn ?? ""}`;
      }
    };
    return [...datiert].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "de");
      return (sort.asc ? c : -c) || `${a.termin.datum}${a.termin.beginn}`.localeCompare(`${b.termin.datum}${b.termin.beginn}`);
    });
  }, [datiert, sort, stat, regeln]);

  const th = (key: Spalte, label: string, cls = "") => (
    <th
      className={`sortable ${cls}`}
      onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }))}
      aria-sort={sort.key === key ? (sort.asc ? "ascending" : "descending") : "none"}
    >
      {label}
      {sort.key === key ? (sort.asc ? " ↑" : " ↓") : ""}
    </th>
  );

  const zeile = (e: AnsichtsEintrag, fokus: boolean) => {
    const s = stat.get(e.key);
    const t = e.termin;
    const kat = e.belegung?.kategorie ?? e.modul?.kategorien[0];
    return (
      <tr
        key={e.key}
        ref={fokus ? fokusRef : undefined}
        className={`clickable${fokus ? " selected" : ""}${t.herkunft === "schaetzung" ? " schaetzung-zeile" : ""}`}
        onClick={() => onOpen(e)}
        title={tooltip(e)}
      >
        <td className="nowrap">{t.datum ? terminText({ ...t, beginn: null, ende: null }) : "–"}</td>
        <td className="mono small nowrap">{t.beginn ? `${t.beginn}${t.ende ? `–${t.ende}` : ""}` : "–"}</td>
        <td>
          <div>
            {e.titel}
            {t.vorbehaltlich ? <span className="tag-mini">vorbehaltlich</span> : null}
            {t.herkunft === "eigen" ? <span className="tag-mini">eigener</span> : null}
          </div>
          <div className="small faint">
            <span className="mono">{t.quelle?.pruefungsnummer ?? e.code ?? ""}</span>
            {schaetzungsHinweis(t) ? ` · ${schaetzungsHinweis(t)}` : ""}
            {!t.datum && t.hinweis ? ` · ${t.hinweis}` : ""}
          </div>
        </td>
        <td>{kat ? <KategorieBadge id={kat} /> : null}</td>
        <td className="small">{t.raeume.join(", ") || <span className="faint">–</span>}</td>
        <td className="num">{formatSchnitt(s?.kennzahlen.schnittBestanden ?? null)}</td>
        <td className="num">{formatProzent(s?.kennzahlen.durchfallquote ?? null)}</td>
        <td className="small">{t.art === "Wiederholung" ? "Wdh." : t.art === "Haupttermin" ? "Haupt" : "–"}</td>
        <td className="c">{e.imPlan ? "✓" : ""}</td>
        <td className="c">{e.konflikt ? <KonfliktIcon stufe={e.konflikt.stufe} moeglich={e.konflikt.moeglich} /> : null}</td>
      </tr>
    );
  };

  const gruppiert = sort.key === "datum";
  let letzterTag = "";
  return (
    <div className="card flat">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {th("datum", "Datum")}
              {th("zeit", "Zeit")}
              {th("modul", "Modul")}
              {th("kategorie", "Kategorie")}
              {th("raum", "Raum")}
              {th("schnitt", "Ø best.", "r")}
              {th("durchfall", "Durchfall", "r")}
              {th("art", "Art")}
              {th("plan", "Plan", "c")}
              {th("konflikt", "Konflikt", "c")}
            </tr>
          </thead>
          <tbody>
            {!eintraege.length ? (
              <tr>
                <td colSpan={10} className="empty">
                  Keine Termine für diese Auswahl.
                </td>
              </tr>
            ) : null}
            {sortiert.flatMap((e) => {
              const tag = e.termin.datum!;
              const kopf =
                gruppiert && tag !== letzterTag ? (
                  <tr key={`g-${tag}`} className="group">
                    <td colSpan={10}>{formatTag(tag)}</td>
                  </tr>
                ) : null;
              const fokus = !!fokusTag && tag === fokusTag && tag !== letzterTag;
              letzterTag = tag;
              return kopf ? [kopf, zeile(e, fokus)] : [zeile(e, fokus)];
            })}
            {ohne.length ? (
              <tr className="group">
                <td colSpan={10}>Ohne Datum / nach Absprache</td>
              </tr>
            ) : null}
            {ohne.map((e) => zeile(e, false))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
