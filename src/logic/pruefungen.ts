// Exam dates of the plan: which date belongs to a Belegung, estimates from
// the previous year, main/repeat exam and conflicts (docs/ANFORDERUNGEN.md 4.8).
// Pure functions, unit-tested in pruefungen.test.ts.
//
// Dates are ISO strings ("2027-02-12") and are compared as day numbers in
// UTC, so the local time zone never shifts a day.
import type { Belegung, EigenerTermin, Modul, PruefungsCache, PruefungsTermin, Status, TerminArt, Turnus } from "../types";
import { OFFEN } from "../types";
import { parseSemester, semesterIndex, terminArt } from "./semester";

/** Where the dates of a Belegung come from, in this order of precedence. */
export type Herkunft = "eigen" | "echt" | "schaetzung" | "keiner";

/** One resolved exam date. */
export interface Termin {
  /** Stable id: the id from the shared file, "<belegung>-eigen" or the predicted id of an estimate. */
  id: string;
  /** Catalog code, null for a free entry. */
  code: string | null;
  /** Semester of the plan this date belongs to. */
  semester: string;
  herkunft: Exclude<Herkunft, "keiner">;
  datum: string | null;
  /** Last day of a multi-day exam (null = single day). */
  datumBis: string | null;
  beginn: string | null;
  ende: string | null;
  raeume: string[];
  /** Same string = alternatives of one module; null = a part of its own. */
  alternativGruppe: string | null;
  vorbehaltlich: boolean;
  hinweis: string | null;
  /** Main or repeat exam (from the module's Turnus and the semester). */
  art: TerminArt;
  /** Estimates: the date of the previous year it was taken from. */
  vorjahr?: { semester: string; datum: string | null; datumBis: string | null };
  /** The entry from the shared file (also the base entry of an estimate). */
  quelle?: PruefungsTermin;
}

export interface ModulTermine {
  herkunft: Herkunft;
  termine: Termin[];
}

// ---------------- dates ----------------

const TAG_MS = 86_400_000;

/** Day number of an ISO date (days since 1970-01-01, UTC). */
export function tagNr(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / TAG_MS;
}

export function isoAusTagNr(n: number): string {
  return new Date(n * TAG_MS).toISOString().slice(0, 10);
}

/** Same calendar day `jahre` years later; 29.02. becomes 28.02. in a non-leap year. */
export function plusJahre(iso: string, jahre: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const ny = y + jahre;
  const schalt = (ny % 4 === 0 && ny % 100 !== 0) || ny % 400 === 0;
  const nd = m === 2 && d === 29 && !schalt ? 28 : d;
  return `${ny}-${String(m).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

const WOCHENTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** "Do 12.02.2026" */
export function formatTag(iso: string, mitJahr = true): string {
  const [y, m, d] = iso.split("-");
  const wt = WOCHENTAG[new Date(tagNr(iso) * TAG_MS).getUTCDay()];
  return `${wt} ${d}.${m}.${mitJahr ? y : ""}`;
}

/** "Do 12.02.2026, 14:00–15:30", "Mo 15.02.–Mi 17.02.2027", "ohne Datum". */
export function formatTermin(t: Pick<Termin, "datum" | "datumBis" | "beginn" | "ende">): string {
  if (!t.datum) return "ohne Datum";
  let s = t.datumBis && t.datumBis !== t.datum ? `${formatTag(t.datum, false)}–${formatTag(t.datumBis)}` : formatTag(t.datum);
  if (t.beginn) s += `, ${t.beginn}${t.ende ? `–${t.ende}` : ""}`;
  return s;
}

// ---------------- main or repeat exam ----------------

/** Main or repeat exam by Turnus and semester (5.5); "unbekannt" counts as main exam where it matters. */
export function artVonTermin(turnus: Turnus | undefined, semester: string): TerminArt {
  return turnus ? terminArt(turnus, semester) : "unbekannt";
}

export function istWiederholung(art: TerminArt): boolean {
  return art === "Wiederholung";
}

// ---------------- which dates belong to a Belegung ----------------

/** Real entries of a module in a semester's exam file. */
export function echteEintraege(cache: PruefungsCache, semester: string, code: string): PruefungsTermin[] {
  return cache[semester]?.termine.filter((t) => t.code === code) ?? [];
}

function ausEintrag(t: PruefungsTermin, semester: string, turnus: Turnus | undefined): Termin {
  return {
    id: t.id,
    code: t.code,
    semester,
    herkunft: "echt",
    datum: t.datum,
    datumBis: t.datumBis && t.datum && t.datumBis !== t.datum ? t.datumBis : null,
    beginn: t.datum ? (t.beginn ?? null) : null,
    ende: t.datum ? (t.ende ?? null) : null,
    raeume: t.raeume ?? [],
    alternativGruppe: t.alternativGruppe ?? null,
    vorbehaltlich: t.vorbehaltlich ?? false,
    hinweis: t.hinweis ?? null,
    art: artVonTermin(turnus, semester),
    quelle: t,
  };
}

/** Predicted id in the target semester ("XX0002-2025W-1" -> "XX0002-2026W-1"), so a later real date replaces the estimate in a calendar. */
function geschaetzteId(id: string, ziel: string): string {
  const p = parseSemester(ziel);
  const m = /^(.*)-(\d{4})([WS])-(\d+)$/.exec(id);
  if (!p || !m) return `${id}-schaetzung-${ziel.replace(/[^A-Za-z0-9]/g, "")}`;
  return `${m[1]}-${p.jahr}${p.art === "WS" ? "W" : "S"}-${m[4]}`;
}

/**
 * Estimate from the newest earlier semester of the same kind (WS from WS, SS
 * from SS) in which the module has entries: same calendar day, shifted by
 * the difference in years. Weekends are not corrected.
 */
export function schaetzung(cache: PruefungsCache, semester: string, code: string, turnus?: Turnus): Termin[] {
  const ziel = parseSemester(semester);
  if (!ziel) return [];
  let basis: { semester: string; jahr: number; eintraege: PruefungsTermin[] } | null = null;
  for (const [sem, datei] of Object.entries(cache)) {
    const p = parseSemester(sem);
    if (!p || p.art !== ziel.art || semesterIndex(p) >= semesterIndex(ziel)) continue;
    const eintraege = datei.termine.filter((t) => t.code === code);
    if (eintraege.length && (!basis || p.jahr > basis.jahr)) basis = { semester: sem, jahr: p.jahr, eintraege };
  }
  if (!basis) return [];
  const diff = ziel.jahr - basis.jahr;
  return basis.eintraege.map((t) => {
    const real = ausEintrag(t, semester, turnus);
    return {
      ...real,
      id: geschaetzteId(t.id, semester),
      herkunft: "schaetzung" as const,
      datum: t.datum ? plusJahre(t.datum, diff) : null,
      datumBis: real.datumBis ? plusJahre(real.datumBis, diff) : null,
      // A "vorbehaltlich" from last year says nothing about this year.
      vorbehaltlich: false,
      vorjahr: { semester: basis.semester, datum: t.datum, datumBis: real.datumBis },
    };
  });
}

function eigenerTermin(e: EigenerTermin, belegungId: number, code: string | null, semester: string, turnus?: Turnus): Termin {
  return {
    id: `${belegungId}-eigen`,
    code,
    semester,
    herkunft: "eigen",
    datum: e.datum,
    datumBis: null,
    beginn: e.beginn,
    ende: e.ende,
    raeume: e.raum ? [e.raum] : [],
    alternativGruppe: null,
    vorbehaltlich: false,
    hinweis: null,
    art: artVonTermin(turnus, semester),
  };
}

/**
 * Dates of a module (or Belegung) in a semester: own date > real dates > estimate > none.
 * The semester is the one of the plan, not the one the date falls in.
 */
export function termineFuer(
  x: { code: string | null; semester: string; eigenerTermin?: EigenerTermin | null; belegungId?: number },
  cache: PruefungsCache,
  modul?: Pick<Modul, "turnus">,
): ModulTermine {
  const turnus = modul?.turnus;
  if (x.eigenerTermin?.datum) {
    return { herkunft: "eigen", termine: [eigenerTermin(x.eigenerTermin, x.belegungId ?? 0, x.code, x.semester, turnus)] };
  }
  if (!x.code || !parseSemester(x.semester)) return { herkunft: "keiner", termine: [] };
  const echt = echteEintraege(cache, x.semester, x.code);
  if (echt.length) return { herkunft: "echt", termine: sortiereTermine(echt.map((t) => ausEintrag(t, x.semester, turnus))) };
  const sch = schaetzung(cache, x.semester, x.code, turnus);
  if (sch.length) return { herkunft: "schaetzung", termine: sortiereTermine(sch) };
  return { herkunft: "keiner", termine: [] };
}

/** By date and start; dates without a day last. */
export function sortiereTermine<T extends Pick<Termin, "datum" | "beginn">>(termine: T[]): T[] {
  return [...termine].sort(
    (a, b) =>
      (a.datum ?? "9999").localeCompare(b.datum ?? "9999") || (a.beginn ?? "").localeCompare(b.beginn ?? ""),
  );
}

/** The date shown for a module in one line: the first dated one (or the first at all). */
export function ersterTermin(mt: ModulTermine): Termin | null {
  return mt.termine.find((t) => t.datum) ?? mt.termine[0] ?? null;
}

// ---------------- conflicts ----------------

export type Stufe = "rot" | "orange" | "gelb";
const RANG: Record<Stufe, number> = { gelb: 1, orange: 2, rot: 3 };

export function rang(s: Stufe | null): number {
  return s ? RANG[s] : 0;
}

export function schlimmer(a: Stufe | null, b: Stufe | null): Stufe | null {
  return rang(b) > rang(a) ? b : a;
}

const minuten = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Conflict level of two single dates (4.8). Dates without a day never conflict. */
export function stufeZwischen(
  a: Pick<Termin, "datum" | "datumBis" | "beginn" | "ende">,
  b: Pick<Termin, "datum" | "datumBis" | "beginn" | "ende">,
  gelbGrenze: number,
): Stufe | null {
  if (!a.datum || !b.datum) return null;
  const a0 = tagNr(a.datum);
  const a1 = a.datumBis ? Math.max(a0, tagNr(a.datumBis)) : a0;
  const b0 = tagNr(b.datum);
  const b1 = b.datumBis ? Math.max(b0, tagNr(b.datumBis)) : b0;

  if (a0 <= b1 && b0 <= a1) {
    // Same day (or overlapping day ranges).
    const mehrtaegig = a1 !== a0 || b1 !== b0;
    if (!mehrtaegig && a.beginn && a.ende && b.beginn && b.ende) {
      return minuten(a.beginn) < minuten(b.ende) && minuten(b.beginn) < minuten(a.ende) ? "rot" : "orange";
    }
    return "orange";
  }
  const abstand = a1 < b0 ? b0 - a1 : a0 - b1;
  return abstand >= 1 && abstand <= gelbGrenze ? "gelb" : null;
}

/** Parts of a module: alternatives (same alternativGruppe) together, every other entry on its own. */
export function teile(termine: Termin[]): Termin[][] {
  const gruppen = new Map<string, Termin[]>();
  const out: Termin[][] = [];
  for (const t of termine) {
    if (t.alternativGruppe == null) {
      out.push([t]);
      continue;
    }
    let g = gruppen.get(t.alternativGruppe);
    if (!g) {
      g = [];
      gruppen.set(t.alternativGruppe, g);
      out.push(g);
    }
    g.push(t);
  }
  return out;
}

export interface Paarkonflikt {
  stufe: Stufe;
  /** At least one side is an estimate. */
  moeglich: boolean;
  /** The two dates behind the level (worst part pair, best alternative). */
  a: Termin;
  b: Termin;
}

/**
 * Conflict between two modules: for each pair of parts the most favourable
 * alternative counts, the result is the worst over all part pairs.
 */
export function konfliktZwischen(a: ModulTermine, b: ModulTermine, gelbGrenze: number): Paarkonflikt | null {
  let schlimmst: Paarkonflikt | null = null;
  for (const ta of teile(a.termine)) {
    for (const tb of teile(b.termine)) {
      let best: { stufe: Stufe | null; a: Termin; b: Termin } | null = null;
      for (const x of ta) {
        for (const y of tb) {
          const s = stufeZwischen(x, y, gelbGrenze);
          if (!best || rang(s) < rang(best.stufe)) best = { stufe: s, a: x, b: y };
        }
      }
      if (best?.stufe && (!schlimmst || rang(best.stufe) > rang(schlimmst.stufe))) {
        schlimmst = { stufe: best.stufe, moeglich: false, a: best.a, b: best.b };
      }
    }
  }
  if (schlimmst) schlimmst.moeglich = a.herkunft === "schaetzung" || b.herkunft === "schaetzung";
  return schlimmst;
}

// ---------------- conflicts in the plan ----------------

/** Statuses that are checked for conflicts (all count the same). */
export const GEPRUEFT: Status[] = OFFEN;

export interface PlanEintrag {
  belegung: Belegung;
  modul?: Modul;
  titel: string;
  termine: ModulTermine;
}

/** Belegungen of a semester with their dates. Only real semesters (not "vor"/"ohne"). */
export function planEintraege(
  belegungen: Belegung[],
  semester: string,
  cache: PruefungsCache,
  modulMap: Map<string, Modul>,
  nurGeprueft = true,
): PlanEintrag[] {
  if (!parseSemester(semester)) return [];
  return belegungen
    .filter((b) => b.semester === semester && (!nurGeprueft || GEPRUEFT.includes(b.status)))
    .map((b) => {
      const modul = b.modulCode ? modulMap.get(b.modulCode) : undefined;
      return {
        belegung: b,
        modul,
        titel: modul?.titel ?? b.titel,
        termine: termineFuer(
          { code: b.modulCode, semester, eigenerTermin: b.eigenerTermin, belegungId: b.id },
          cache,
          modul,
        ),
      };
    });
}

export interface Konflikt extends Paarkonflikt {
  semester: string;
  x: PlanEintrag;
  y: PlanEintrag;
}

/** All conflicts between the checked Belegungen of one semester. */
export function konflikteImSemester(eintraege: PlanEintrag[], gelbGrenze: number): Konflikt[] {
  const out: Konflikt[] = [];
  for (let i = 0; i < eintraege.length; i++) {
    for (let j = i + 1; j < eintraege.length; j++) {
      const x = eintraege[i];
      const y = eintraege[j];
      // The same catalog module twice is a duplicate, not a conflict.
      if (x.belegung.modulCode && x.belegung.modulCode === y.belegung.modulCode) continue;
      const k = konfliktZwischen(x.termine, y.termine, gelbGrenze);
      if (k) out.push({ ...k, semester: x.belegung.semester, x, y });
    }
  }
  return out.sort((p, q) => rang(q.stufe) - rang(p.stufe) || Number(p.moeglich) - Number(q.moeglich));
}

/** Conflicts a module outside the plan would have with the plan entries (preview, exam view). */
export function konflikteMitPlan(
  kandidat: ModulTermine,
  eintraege: PlanEintrag[],
  gelbGrenze: number,
  code?: string | null,
): (Paarkonflikt & { mit: PlanEintrag })[] {
  return eintraege
    .filter((e) => !code || e.belegung.modulCode !== code)
    .map((e) => {
      const k = konfliktZwischen(kandidat, e.termine, gelbGrenze);
      return k ? { ...k, mit: e } : null;
    })
    .filter((k): k is Paarkonflikt & { mit: PlanEintrag } => k != null)
    .sort((p, q) => rang(q.stufe) - rang(p.stufe));
}

export interface KonfliktZaehlung {
  /** Conflicts between real (or own) dates. */
  sicher: number;
  /** Conflicts that involve an estimate. */
  moeglich: number;
  /** Worst level over all conflicts (colour of the semester hint). */
  schlimmste: Stufe | null;
}

export function zaehleKonflikte(konflikte: Pick<Paarkonflikt, "stufe" | "moeglich">[]): KonfliktZaehlung {
  let schlimmste: Stufe | null = null;
  let sicher = 0;
  let moeglich = 0;
  for (const k of konflikte) {
    if (k.moeglich) moeglich++;
    else sicher++;
    schlimmste = schlimmer(schlimmste, k.stufe);
  }
  return { sicher, moeglich, schlimmste };
}

/** "2 Prüfungskonflikte · 1 möglich (Schätzung)"; "" without conflicts. */
export function konfliktText(z: KonfliktZaehlung): string {
  const teile: string[] = [];
  if (z.sicher) teile.push(`${z.sicher} ${z.sicher === 1 ? "Prüfungskonflikt" : "Prüfungskonflikte"}`);
  if (z.moeglich) teile.push(`${z.moeglich} möglich (Schätzung)`);
  return teile.join(" · ");
}

export const STUFE_TEXT: Record<Stufe, string> = {
  rot: "Überschneidung",
  orange: "gleicher Tag",
  gelb: "kurz hintereinander",
};

/** Conflicts of one Belegung (for the icon on a card). */
export function konflikteVon(konflikte: Konflikt[], belegungId: number): { k: Konflikt; anderer: PlanEintrag; eigener: Termin; fremder: Termin }[] {
  return konflikte
    .filter((k) => k.x.belegung.id === belegungId || k.y.belegung.id === belegungId)
    .map((k) =>
      k.x.belegung.id === belegungId
        ? { k, anderer: k.y, eigener: k.a, fremder: k.b }
        : { k, anderer: k.x, eigener: k.b, fremder: k.a },
    );
}
