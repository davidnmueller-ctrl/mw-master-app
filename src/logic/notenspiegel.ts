// Exam statistics ("Notenspiegel"). Definitions in docs/ANFORDERUNGEN.md 5.5,
// verified against real TUMonline exports (the published averages come out
// exactly). Pure functions, unit-tested in notenspiegel.test.ts.
import type { Modul, Notenspiegel, TerminArt } from "../types";
import { compareSemester, terminArt } from "./semester";

/** Grade steps in display order. Steps above 4,0 are fails. */
export const STUFEN = ["1.0", "1.3", "1.7", "2.0", "2.3", "2.7", "3.0", "3.3", "3.7", "4.0", "4.3", "4.7", "5.0"] as const;

/**
 * Steps to draw for a distribution, in grade order: the regular ones always,
 * any intermediate step ("1.4", "2.5", "3.1", … schema 1.2) only if it has a
 * count > 0. The schema guarantees keys of the form "x.y", so no step can
 * appear twice under different spellings.
 */
export function sichtbareStufen(verteilung: Record<string, number>): string[] {
  const regulaer = new Set<string>(STUFEN);
  const extra = Object.entries(verteilung)
    .filter(([s, n]) => n > 0 && !regulaer.has(s))
    .map(([s]) => s);
  return [...STUFEN, ...extra].sort((a, b) => stufe100(a) - stufe100(b));
}

const stufe100 = (s: string) => Math.round(Number(s) * 100);

export interface Kennzahlen {
  angetreten: number;
  angemeldet: number;
  nichtErschienen: number;
  bestanden: number;
  durchgefallen: number;
  /** Average over everyone who sat the exam, in grade units (e.g. 2.34). null if nobody. */
  schnittGesamt: number | null;
  /** Average over the passes only. */
  schnittBestanden: number | null;
  /** Share of fails among those who sat the exam, 0..1. */
  durchfallquote: number | null;
}

export function kennzahlen(ns: Pick<Notenspiegel, "verteilung" | "nichtErschienen">): Kennzahlen {
  let angetreten = 0;
  let bestanden = 0;
  let sumAlle = 0;
  let sumBest = 0;
  for (const [s, n] of Object.entries(ns.verteilung)) {
    const v = stufe100(s);
    angetreten += n;
    sumAlle += v * n;
    if (v <= 400) {
      bestanden += n;
      sumBest += v * n;
    }
  }
  const durchgefallen = angetreten - bestanden;
  return {
    angetreten,
    angemeldet: angetreten + ns.nichtErschienen,
    nichtErschienen: ns.nichtErschienen,
    bestanden,
    durchgefallen,
    schnittGesamt: angetreten ? sumAlle / angetreten / 100 : null,
    schnittBestanden: bestanden ? sumBest / bestanden / 100 : null,
    durchfallquote: angetreten ? durchgefallen / angetreten : null,
  };
}

export interface Abweichung {
  feld: string;
  gelesen: number;
  berechnet: number | null;
}

/**
 * Compare the computed figures with the ones read off TUMonline. Used when
 * entering data: a deviation means the screenshot was misread.
 */
export function pruefeGegenTumonline(ns: Notenspiegel, toleranz = 0.01): Abweichung[] {
  const t = ns.tumonline;
  if (!t) return [];
  const k = kennzahlen(ns);
  const out: Abweichung[] = [];
  const cmp = (feld: string, gelesen: number | undefined, berechnet: number | null, tol: number) => {
    if (gelesen == null) return;
    if (berechnet == null || Math.abs(gelesen - berechnet) > tol) out.push({ feld, gelesen, berechnet });
  };
  cmp("angetreten", t.angetreten, k.angetreten, 0);
  if (ns.angemeldet != null) cmp("angemeldet", ns.angemeldet, k.angemeldet, 0);
  cmp("schnittGesamt", t.schnittGesamt, k.schnittGesamt, toleranz);
  cmp("schnittBestanden", t.schnittBestanden, k.schnittBestanden, toleranz);
  cmp("quoteNegativ", t.quoteNegativ, k.durchfallquote, 0.0001);
  return out;
}

/** Add up several distributions ("Alle Termine zusammen"). */
export function summiere(liste: Notenspiegel[]): Pick<Notenspiegel, "verteilung" | "nichtErschienen"> {
  const verteilung: Record<string, number> = {};
  let nichtErschienen = 0;
  for (const ns of liste) {
    for (const [s, n] of Object.entries(ns.verteilung)) verteilung[s] = (verteilung[s] ?? 0) + n;
    nichtErschienen += ns.nichtErschienen;
  }
  return { verteilung, nichtErschienen };
}

/** Explicit `art` wins; otherwise derived from the module's Turnus. */
export function artVon(ns: Notenspiegel, modul: Pick<Modul, "turnus">): TerminArt {
  return ns.art ?? terminArt(modul.turnus, ns.semester);
}

/** Chronological, oldest first. */
export function chronologisch(liste: Notenspiegel[]): Notenspiegel[] {
  return [...liste].sort((a, b) => compareSemester(a.semester, b.semester));
}

/** Below this many Angetretene the key figures are flagged as not very meaningful. */
export const MIN_ANGETRETENE = 15;

export interface Referenztermin {
  ns: Notenspiegel;
  kennzahlen: Kennzahlen;
  /** false = no main exam exists, the newest exam of any kind is used instead (shown as "Wdh."). */
  istHaupttermin: boolean;
  /** Fewer than MIN_ANGETRETENE people sat the exam. */
  kleineStichprobe: boolean;
  /** Number of exam dates of the module (all kinds). */
  anzahlTermine: number;
}

/**
 * The exam whose figures catalog table and Semesterplan show: the newest main
 * exam; only if the module has none, the newest exam of any kind.
 * null = no Notenspiegel at all. Docs/ANFORDERUNGEN.md 4.5.
 */
export function referenztermin(modul: Modul): Referenztermin | null {
  const liste = chronologisch(modul.notenspiegel ?? []);
  if (!liste.length) return null;
  const haupt = liste.filter((ns) => artVon(ns, modul) === "Haupttermin");
  const ns = (haupt.length ? haupt : liste).at(-1)!;
  const k = kennzahlen(ns);
  return { ns, kennzahlen: k, istHaupttermin: haupt.length > 0, kleineStichprobe: k.angetreten < MIN_ANGETRETENE, anzahlTermine: liste.length };
}
