// Reading the exam date files pruefungen/<SEMESTER>.json (schema 1.3,
// docs/ANFORDERUNGEN.md 5.6) into the local cache. Pure functions,
// unit-tested in pruefungsdaten.test.ts.
//
// Same rules as for the module files: each file is validated on its own, and
// a broken or unreadable file keeps the cached version of that semester.
// A file is only read again when its updatedAt in the manifest changed.
import type { Manifest, ManifestPruefung, Modul, PruefungsBericht, PruefungsCache, PruefungsDatei, SharedRead } from "../types";
import { pruefe } from "./shared";

/** Manifest entries, one per semester (the first wins if a semester is listed twice). */
function eintraege(manifest: Manifest): ManifestPruefung[] {
  const seen = new Set<string>();
  return (manifest.pruefungen ?? []).filter((e) => {
    if (seen.has(e.semester)) return false;
    seen.add(e.semester);
    return true;
  });
}

/** Exam files that have to be read: new semesters and those whose updatedAt or file name changed. */
export function zuLesendePruefungen(manifest: Manifest, cache: PruefungsCache): ManifestPruefung[] {
  return eintraege(manifest).filter((e) => {
    const alt = cache[e.semester];
    return !alt || alt.updatedAt !== e.updatedAt || alt.datei !== e.datei;
  });
}

/** Codes of entries that are not in the catalog (skipped everywhere in the app). */
export function unbekannteCodes(datei: Pick<PruefungsDatei, "termine">, codes: Set<string>): string[] {
  return [...new Set(datei.termine.map((t) => t.code).filter((c) => !codes.has(c)))].sort();
}

export interface PruefungsErgebnis {
  cache: PruefungsCache;
  bericht: PruefungsBericht[];
  warnungen: string[];
  /** Whether `cache` differs from the one passed in. */
  geaendert: boolean;
}

/**
 * Merge freshly read exam files into the cache.
 * `read` holds the files requested via zuLesendePruefungen (others are
 * unchanged and taken from `cache`). Semesters no longer listed in the
 * manifest are dropped; without manifest.pruefungen there is no exam data.
 */
export function verarbeitePruefungen(
  manifest: Manifest,
  read: Pick<SharedRead, "files" | "errors">,
  cache: PruefungsCache,
  module: Pick<Modul, "code">[],
  jetzt: string,
): PruefungsErgebnis {
  const warnungen: string[] = [];
  const bericht: PruefungsBericht[] = [];
  const neu: PruefungsCache = {};
  const codes = new Set(module.map((m) => m.code));
  const angefragt = new Set(zuLesendePruefungen(manifest, cache).map((e) => e.datei));

  const doppelt = (manifest.pruefungen ?? []).length - eintraege(manifest).length;
  if (doppelt > 0) warnungen.push("manifest.json: ein Semester steht mehrfach in „pruefungen“ – nur der erste Eintrag zählt.");

  for (const e of eintraege(manifest)) {
    const alt = cache[e.semester];
    const zeile = (zustand: PruefungsBericht["zustand"], fehler?: string): PruefungsBericht => {
      const d = neu[e.semester];
      return {
        semester: e.semester,
        datei: e.datei,
        zustand,
        ...(fehler ? { fehler } : {}),
        stand: d?.stand ?? null,
        anzahl: d ? d.termine.filter((t) => codes.has(t.code)).length : 0,
        unbekannteCodes: d ? unbekannteCodes(d, codes) : [],
      };
    };

    if (!angefragt.has(e.datei) && alt) {
      neu[e.semester] = alt;
      bericht.push(zeile("unveraendert"));
      continue;
    }

    const f = read.files.find((x) => x.name === e.datei);
    let fehler: string;
    if (!f) {
      fehler = `nicht lesbar (${read.errors.find((x) => x.name === e.datei)?.error ?? "fehlt"})`;
    } else {
      const res = pruefe<PruefungsDatei>("pruefungen", f.content);
      if (!res.ok) fehler = res.fehler;
      else if (res.value.semester !== e.semester) {
        fehler = `enthält ${res.value.semester}, laut manifest.json ${e.semester}`;
      } else {
        const ids = res.value.termine.map((t) => t.id);
        const dup = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
        if (dup.length) warnungen.push(`${e.datei}: id mehrfach vergeben (${dup.join(", ")}) – der Kalenderexport kann Termine zusammenlegen.`);
        neu[e.semester] = { ...res.value, datei: e.datei, updatedAt: e.updatedAt, gelesenAm: jetzt };
        bericht.push(zeile("neu"));
        continue;
      }
    }
    if (alt) neu[e.semester] = alt;
    warnungen.push(`${e.datei}: ${fehler}${alt ? " – alte Version bleibt in Gebrauch." : " – übersprungen."}`);
    bericht.push(zeile("fehler", fehler));
  }

  for (const z of bericht) {
    if (z.unbekannteCodes.length) {
      const n = neu[z.semester].termine.filter((t) => !codes.has(t.code)).length;
      warnungen.push(`${z.datei}: ${n} ${n === 1 ? "Eintrag" : "Einträge"} mit unbekanntem Code übersprungen (${z.unbekannteCodes.join(", ")}).`);
    }
  }

  const geaendert = JSON.stringify(neu) !== JSON.stringify(cache);
  return { cache: neu, bericht, warnungen, geaendert };
}

/** Report rows from the cache alone (before the folder was read in this session). */
export function berichtAusCache(cache: PruefungsCache, module: Pick<Modul, "code">[]): PruefungsBericht[] {
  const codes = new Set(module.map((m) => m.code));
  return Object.values(cache).map((d) => ({
    semester: d.semester,
    datei: d.datei,
    zustand: "unveraendert" as const,
    stand: d.stand,
    anzahl: d.termine.filter((t) => codes.has(t.code)).length,
    unbekannteCodes: unbekannteCodes(d, codes),
  }));
}
