// Small pieces for exam dates shared by the exam view, the plan, the catalog
// and the module detail: date text, conflict symbol, tooltips.
import { formatTag, formatTermin, STUFE_TEXT, type ModulTermine, type Stufe, type Termin } from "../logic/pruefungen";
import { parseSemester, semesterRange } from "../logic/semester";
import type { Belegung, Settings } from "../types";

export const STUFE_LABEL: Record<Stufe, string> = { rot: "rot", orange: "orange", gelb: "gelb" };

/** Plan semesters: the visible range plus every real semester that holds a Belegung. */
export function planSemesterListe(settings: Settings, belegungen: Belegung[]): string[] {
  const s = new Set(semesterRange(settings.erstesSemester, settings.anzahlSemester));
  for (const b of belegungen) if (parseSemester(b.semester)) s.add(b.semester);
  return [...s];
}

/** "Do 12.02.2027, 14:00–15:30" with "≈" for estimates. */
export function terminText(t: Termin): string {
  return `${t.herkunft === "schaetzung" ? "≈ " : ""}${formatTermin(t)}`;
}

/** Hint for an estimate: "Schätzung – Vorjahr: Do 12.02.2026". */
export function schaetzungsHinweis(t: Termin): string | null {
  if (t.herkunft !== "schaetzung" || !t.vorjahr) return null;
  return `Schätzung – Vorjahr: ${t.vorjahr.datum ? formatTag(t.vorjahr.datum) : "ohne Datum"}${
    t.vorjahr.datumBis ? `–${formatTag(t.vorjahr.datumBis)}` : ""
  } (${t.vorjahr.semester})`;
}

export function stufeTitel(stufe: Stufe, moeglich: boolean): string {
  return `${STUFE_TEXT[stufe]}${moeglich ? " – möglich (Schätzung)" : ""}`;
}

/** Coloured conflict symbol; dashed ring for a possible conflict. */
export function KonfliktIcon({ stufe, moeglich, title }: { stufe: Stufe; moeglich: boolean; title?: string }) {
  const t = title ?? stufeTitel(stufe, moeglich);
  return (
    <span className={`k-icon k-${stufe}${moeglich ? " moeglich" : ""}`} role="img" aria-label={`Prüfungskonflikt: ${t}`} title={t}>
      {stufe === "gelb" ? "!" : "⚡"}
    </span>
  );
}

/** One-line date of a module in a semester, for cards and tables. */
export function TerminKurz({ mt, leer = "kein Termin bekannt" }: { mt: ModulTermine; leer?: string }) {
  const datiert = mt.termine.filter((t) => t.datum);
  if (!mt.termine.length) return <span className="faint">{leer}</span>;
  if (!datiert.length) return <span className="faint" title={mt.termine[0].hinweis ?? undefined}>ohne Datum</span>;
  const t = datiert[0];
  const hinweis = schaetzungsHinweis(t);
  const weitere = datiert.length - 1;
  return (
    <span className={`termin-kurz ${t.herkunft}`} title={[hinweis, t.vorbehaltlich ? "vorbehaltlich" : null].filter(Boolean).join(" · ") || undefined}>
      {terminText(t)}
      {weitere ? <span className="faint"> +{weitere}</span> : null}
      {t.vorbehaltlich ? <span className="tag-mini">vorbehaltlich</span> : null}
      {t.herkunft === "eigen" ? <span className="tag-mini">eigener</span> : null}
    </span>
  );
}
