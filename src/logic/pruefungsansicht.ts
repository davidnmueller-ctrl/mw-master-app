// What the "Prüfungen" view shows: semester choice, entries after the
// filters, conflict colours (docs/ANFORDERUNGEN.md 4.8). Pure functions,
// unit-tested in pruefungsansicht.test.ts.
import type { Belegung, Modul, PruefungsAnsicht, PruefungsCache } from "../types";
import {
  konflikteImSemester,
  konflikteMitPlan,
  planEintraege,
  rang,
  termineFuer,
  type Konflikt,
  type ModulTermine,
  type Stufe,
  type Termin,
} from "./pruefungen";
import { compareSemester, parseSemester } from "./semester";

/** Plan semesters and all semesters with exam data, in order. */
export function semesterAuswahl(planSemester: string[], cache: PruefungsCache): string[] {
  const alle = new Set([...planSemester.filter((s) => parseSemester(s)), ...Object.keys(cache)]);
  return [...alle].sort(compareSemester);
}

/** Last day of a semester for this purpose: a WS runs until 31.03., an SS until 30.09. */
export function semesterEnde(semester: string): string | null {
  const p = parseSemester(semester);
  if (!p) return null;
  return p.art === "WS" ? `${p.jahr + 1}-03-31` : `${p.jahr}-09-30`;
}

/** First of the given semesters that is not over yet (today as ISO date); else the last one. */
export function erstesOffenesSemester(semester: string[], heute: string): string | null {
  const echte = semester.filter((s) => parseSemester(s)).sort(compareSemester);
  return echte.find((s) => semesterEnde(s)! >= heute) ?? echte.at(-1) ?? null;
}

export interface AnsichtsEintrag {
  /** Unique key: termin id plus Belegung id (plan) or code. */
  key: string;
  termin: Termin;
  /** All dates of this module/Belegung in the semester (for the detail hint). */
  termine: ModulTermine;
  code: string | null;
  titel: string;
  modul?: Modul;
  belegung?: Belegung;
  imPlan: boolean;
  /** Worst conflict with the plan (plan modules: with other plan modules). */
  konflikt: { stufe: Stufe; moeglich: boolean } | null;
}

export interface AnsichtsErgebnis {
  eintraege: AnsichtsEintrag[];
  /** Conflicts between the checked Belegungen of the semester. */
  konflikte: Konflikt[];
}

function passtZuFiltern(f: PruefungsAnsicht, modul: Modul | undefined, kategorie: string | null): boolean {
  if (f.tags.length && !(modul?.tags ?? []).some((t) => f.tags.includes(t))) return false;
  if (f.kategorien.length) {
    const kats = modul ? modul.kategorien : kategorie ? [kategorie] : [];
    if (!kats.some((k) => f.kategorien.includes(k))) return false;
  }
  if (f.turnus) {
    const t = modul?.turnus;
    if (!t) return false;
    if (f.turnus === "WS" || f.turnus === "SS") {
      if (t !== f.turnus && t !== "WS+SS") return false;
    } else if (t !== f.turnus) return false;
  }
  return true;
}

function worst(ks: { stufe: Stufe; moeglich: boolean }[]): { stufe: Stufe; moeglich: boolean } | null {
  let w: { stufe: Stufe; moeglich: boolean } | null = null;
  for (const k of ks) {
    // A real conflict beats a possible one of the same level.
    if (!w || rang(k.stufe) > rang(w.stufe) || (rang(k.stufe) === rang(w.stufe) && w.moeglich && !k.moeglich)) w = k;
  }
  return w ? { stufe: w.stufe, moeglich: w.moeglich } : null;
}

/**
 * Entries of the view for one semester after all filters.
 * "plan": all Belegungen of the semester. "alle": catalog modules with a real
 * date or an estimate, plus the plan (unfiltered if `planImmer`).
 */
export function ansichtsEintraege(
  f: PruefungsAnsicht,
  semester: string,
  belegungen: Belegung[],
  module: Modul[],
  cache: PruefungsCache,
  gelbGrenze: number,
): AnsichtsErgebnis {
  const modulMap = new Map(module.map((m) => [m.code, m]));
  const geprueft = planEintraege(belegungen, semester, cache, modulMap);
  const konflikte = konflikteImSemester(geprueft, gelbGrenze);
  const out: AnsichtsEintrag[] = [];

  const mitTermin = (mt: ModulTermine) => mt.termine.filter((t) => f.schaetzungen || t.herkunft !== "schaetzung");

  // ---- plan ----
  const plan = planEintraege(belegungen, semester, cache, modulMap, false);
  const planCodes = new Set(plan.map((p) => p.belegung.modulCode).filter((c): c is string => !!c));
  for (const p of plan) {
    const filtern = f.grundlage === "plan" || !f.planImmer;
    if (filtern && !passtZuFiltern(f, p.modul, p.belegung.kategorie)) continue;
    const ks = konflikte
      .filter((k) => k.x.belegung.id === p.belegung.id || k.y.belegung.id === p.belegung.id)
      .map((k) => ({ stufe: k.stufe, moeglich: k.moeglich }));
    for (const t of mitTermin(p.termine)) {
      out.push({
        key: `${t.id}#${p.belegung.id}`,
        termin: t,
        termine: p.termine,
        code: p.belegung.modulCode,
        titel: p.titel,
        modul: p.modul,
        belegung: p.belegung,
        imPlan: true,
        konflikt: worst(ks),
      });
    }
  }

  // ---- catalog modules outside the plan ----
  if (f.grundlage === "alle") {
    for (const m of module) {
      if (planCodes.has(m.code)) continue;
      if (!passtZuFiltern(f, m, null)) continue;
      const mt = termineFuer({ code: m.code, semester }, cache, m);
      if (mt.herkunft === "keiner") continue;
      let termine = mitTermin(mt);
      if (!f.wiederholungen) termine = termine.filter((t) => t.art !== "Wiederholung");
      if (!termine.length) continue;
      const konflikt = worst(konflikteMitPlan(mt, geprueft, gelbGrenze, m.code));
      if (f.nurKonfliktfrei && konflikt) continue;
      for (const t of termine) {
        out.push({ key: `${t.id}#${m.code}`, termin: t, termine: mt, code: m.code, titel: m.titel, modul: m, imPlan: false, konflikt });
      }
    }
  }

  out.sort(
    (a, b) =>
      (a.termin.datum ?? "9999").localeCompare(b.termin.datum ?? "9999") ||
      (a.termin.beginn ?? "").localeCompare(b.termin.beginn ?? "") ||
      a.titel.localeCompare(b.titel, "de"),
  );
  return { eintraege: out, konflikte };
}

/** First month (ISO "YYYY-MM") with a dated entry; null without any. */
export function ersterMonat(eintraege: AnsichtsEintrag[]): string | null {
  const d = eintraege.map((e) => e.termin.datum).filter((x): x is string => !!x).sort()[0];
  return d ? d.slice(0, 7) : null;
}

/** Whether an entry lies on a day (multi-day dates on every day of their range). */
export function liegtAm(t: Pick<Termin, "datum" | "datumBis">, iso: string): boolean {
  if (!t.datum) return false;
  return t.datum <= iso && iso <= (t.datumBis ?? t.datum);
}
