// Parsing and validating the shared folder against schema/*.schema.json, and
// merging the result into the local cache. Pure functions, unit-tested in
// shared.test.ts.
//
// Rule: a file that cannot be read or does not validate never removes good
// data. The previous cached version of that file stays in use and the user
// sees a warning (docs/ANFORDERUNGEN.md 4.6).
import Ajv2020 from "ajv/dist/2020";
import manifestSchema from "../../schema/manifest.schema.json";
import modulSchema from "../../schema/modul.schema.json";
import pruefungenSchema from "../../schema/pruefungen.schema.json";
import regelnSchema from "../../schema/regeln.schema.json";
import tagsSchema from "../../schema/tags.schema.json";
import type { Manifest, Modul, PruefungsDatei, Regeln, SharedData, SharedRead, Tag } from "../types";

/** Highest MAJOR schema version this app understands. */
export const APP_SCHEMA_MAJOR = 1;

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validators = {
  manifest: ajv.compile<Manifest>(manifestSchema),
  regeln: ajv.compile<Regeln>(regelnSchema),
  tags: ajv.compile<Tag[]>(tagsSchema),
  modul: ajv.compile<Modul>(modulSchema),
  pruefungen: ajv.compile<PruefungsDatei>(pruefungenSchema),
};

type Kind = keyof typeof validators;

/** Parse JSON and validate; returns the value or a readable error. */
export function pruefe<T>(kind: Kind, content: string): { ok: true; value: T } | { ok: false; fehler: string } {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (e) {
    return { ok: false, fehler: `kein gültiges JSON (${(e as Error).message})` };
  }
  const v = validators[kind];
  if (v(value)) return { ok: true, value: value as T };
  const msg = (v.errors ?? [])
    .slice(0, 3)
    .map((er) => `${er.instancePath || "/"} ${er.message}`)
    .join("; ");
  return { ok: false, fehler: msg || "entspricht nicht dem Schema" };
}

export function schemaMajor(version: string): number {
  return Number(version.split(".")[0]);
}

export interface EinleseErgebnis {
  /** Data to use from now on (new, merged, or the old cache). null = nothing usable at all. */
  daten: SharedData | null;
  /** Problems that blocked the update as a whole (old cache kept). */
  fehler: string | null;
  /** Problems with single files (old version of those kept). */
  warnungen: string[];
  /** Whether `daten` differs from the cache passed in. */
  geaendert: boolean;
}

const codeAusDateiname = (name: string) => name.replace(/^module\//, "").replace(/\.json$/i, "");

/**
 * Turn the raw folder read into SharedData, falling back to `cache` file by file.
 * `jetzt` is the ISO time stored as `gelesenAm`.
 */
export function verarbeite(read: SharedRead, cache: SharedData | null, jetzt: string): EinleseErgebnis {
  const warnungen: string[] = [];
  const file = (name: string) => read.files.find((f) => f.name === name);
  const readError = (name: string) => read.errors.find((e) => e.name === name);
  const keep = (fehler: string): EinleseErgebnis => ({ daten: cache, fehler, warnungen, geaendert: false });

  // ---- manifest: without a valid one nothing is taken over ----
  const mf = file("manifest.json");
  if (!mf) return keep(`manifest.json nicht lesbar: ${readError("manifest.json")?.error ?? "fehlt"}`);
  const m = pruefe<Manifest>("manifest", mf.content);
  if (!m.ok) return keep(`manifest.json ungültig: ${m.fehler}`);
  const major = schemaMajor(m.value.schemaVersion);
  if (major > APP_SCHEMA_MAJOR) {
    return keep(
      `Die Daten haben Schema-Version ${m.value.schemaVersion}, diese App versteht nur ${APP_SCHEMA_MAJOR}.x. Bitte App aktualisieren.`,
    );
  }

  // ---- regeln ----
  let regeln: Regeln | null = null;
  const rf = file("regeln.json");
  const r = rf ? pruefe<Regeln>("regeln", rf.content) : null;
  if (r?.ok) regeln = r.value;
  else {
    const grund = r && !r.ok ? r.fehler : (readError("regeln.json")?.error ?? "fehlt");
    if (cache) {
      regeln = cache.regeln;
      warnungen.push(`regeln.json: ${grund} – alte Version bleibt in Gebrauch.`);
    } else return keep(`regeln.json: ${grund}`);
  }

  // ---- tags ----
  let tags: Tag[] = [];
  const tf = file("tags.json");
  const t = tf ? pruefe<Tag[]>("tags", tf.content) : null;
  if (t?.ok) tags = t.value;
  else {
    const grund = t && !t.ok ? t.fehler : (readError("tags.json")?.error ?? "fehlt");
    tags = cache?.tags ?? [];
    warnungen.push(`tags.json: ${grund}${cache ? " – alte Version bleibt in Gebrauch." : ""}`);
  }

  // ---- modules ----
  const alt = new Map((cache?.module ?? []).map((mod) => [mod.code, mod]));
  const module: Modul[] = [];
  const gesehen = new Set<string>();
  for (const f of read.files.filter((f) => f.name.startsWith("module/"))) {
    const code = codeAusDateiname(f.name);
    gesehen.add(code);
    const res = pruefe<Modul>("modul", f.content);
    if (res.ok) {
      if (res.value.code !== code) warnungen.push(`${f.name}: Code im Inhalt ist ${res.value.code}, Dateiname sagt ${code}.`);
      module.push(res.value);
    } else {
      const old = alt.get(code);
      warnungen.push(`${f.name}: ${res.fehler}${old ? " – alte Version bleibt in Gebrauch." : " – übersprungen."}`);
      if (old) module.push(old);
    }
  }
  // Files that exist but could not be read (e.g. cloud-only, offline): keep the cached module.
  for (const er of read.errors.filter((e) => e.name.startsWith("module/") && e.name !== "module/")) {
    const code = codeAusDateiname(er.name);
    if (gesehen.has(code)) continue;
    gesehen.add(code);
    const old = alt.get(code);
    warnungen.push(`${er.name}: nicht lesbar (${er.error})${old ? " – alte Version bleibt in Gebrauch." : "."}`);
    if (old) module.push(old);
  }
  if (read.errors.some((e) => e.name === "module/")) {
    warnungen.push("Ordner module/ nicht lesbar – alle Module aus dem letzten Stand.");
    for (const old of alt.values()) if (!gesehen.has(old.code)) module.push(old);
  }

  // Duplicate codes: keep the first, warn.
  const seen = new Set<string>();
  const eindeutig = module.filter((mod) => {
    if (seen.has(mod.code)) {
      warnungen.push(`Modul ${mod.code} kommt mehrfach vor – nur der erste Eintrag wird verwendet.`);
      return false;
    }
    seen.add(mod.code);
    return true;
  });
  eindeutig.sort((a, b) => a.titel.localeCompare(b.titel, "de"));

  // Tags not listed in tags.json are shown by id; warn once so Claude can fix it.
  const tagIds = new Set(tags.map((tg) => tg.id));
  const unbekannt = new Set(eindeutig.flatMap((mod) => mod.tags ?? []).filter((id) => !tagIds.has(id)));
  if (unbekannt.size) warnungen.push(`Unbekannte Tags (fehlen in tags.json): ${[...unbekannt].join(", ")}`);

  const katIds = new Set(regeln.kategorien.map((k) => k.id));
  for (const mod of eindeutig) {
    const fremd = mod.kategorien.filter((k) => !katIds.has(k));
    if (fremd.length) warnungen.push(`Modul ${mod.code}: unbekannte Kategorie ${fremd.join(", ")}`);
  }

  const daten: SharedData = { manifest: m.value, regeln, tags, module: eindeutig, gelesenAm: jetzt };
  const geaendert = !cache || JSON.stringify({ ...cache, gelesenAm: "" }) !== JSON.stringify({ ...daten, gelesenAm: "" });
  return { daten, fehler: null, warnungen, geaendert };
}

/** Only re-read everything if the manifest's updatedAt moved (cheap hourly check). */
export function manifestGeaendert(manifestContent: string, cache: SharedData | null): boolean {
  if (!cache) return true;
  const m = pruefe<Manifest>("manifest", manifestContent);
  return !m.ok || m.value.updatedAt !== cache.manifest.updatedAt;
}

/** Minimal rules used before any shared folder is linked (CP and grade maths still work). */
export const FALLBACK_REGELN: Regeln = {
  gesamtCp: 120,
  kategorien: [
    { id: "G", name: "Ingenieurwissenschaftliche Grundlagen", kurz: "Grundlagen", gruppe: "Mastermodule", minCp: 20, maxCp: null, zaehltZurNote: true },
    { id: "K", name: "Kernfächer des Maschinenwesens", kurz: "Kernfach", gruppe: "Mastermodule", minCp: null, maxCp: 40, zaehltZurNote: true },
    { id: "A", name: "Angrenzende Fachgebiete", kurz: "Angrenzend", gruppe: "Mastermodule", minCp: null, maxCp: 15, zaehltZurNote: true },
    { id: "F", name: "Ingenieurwissenschaftliche Flexibilisierung", kurz: "Flexibilisierung", gruppe: "Mastermodule", minCp: null, maxCp: 15, zaehltZurNote: true },
    { id: "HP", name: "Hochschulpraktika", kurz: "Praktikum", minCp: 8, maxCp: null, zaehltZurNote: true },
    { id: "IE", name: "International Experience / Interdisziplinäre Ergänzungsfächer", kurz: "Intern. Exp.", minCp: 6, maxCp: null, zaehltZurNote: true },
    {
      id: "UE",
      name: "Überfachliche Ergänzung",
      kurz: "Überfachlich",
      minCp: 5,
      maxCp: null,
      zaehltZurNote: false,
      unterbereiche: [
        { id: "UE-ETHIK", name: "Ethik des menschzentrierten Ingenieurwesens", minCp: 3 },
        { id: "UE-WEITERE", name: "Weitere Angebote zur Überfachlichen Ergänzung", minCp: 2 },
      ],
    },
    { id: "FP", name: "Forschungspraxis", kurz: "Forschungspraxis", minCp: 11, maxCp: 11, zaehltZurNote: true, genauEinModul: true },
    { id: "MA", name: "Master's Thesis", kurz: "Thesis", minCp: 30, maxCp: 30, zaehltZurNote: true },
  ],
  gruppen: [{ id: "Mastermodule", sollCp: 60 }],
  platzhalterCp: { G: 5, K: 5, A: 5, F: 5, HP: 4, IE: 3, UE: 3, FP: 11, MA: 30 },
  notenstufen: [1.0, 1.3, 1.7, 2.0, 2.3, 2.7, 3.0, 3.3, 3.7, 4.0],
  zeugnisnote: "abschneiden_1_nachkommastelle",
  praedikate: [
    { bis: 1.5, name: "sehr gut" },
    { bis: 2.5, name: "gut" },
    { bis: 3.5, name: "befriedigend" },
    { bis: 4.0, name: "ausreichend" },
  ],
  auszeichnung: { bis: 1.2, bezogenAuf: "zeugnisnote" },
  fristen: [],
  farben: { G: "#1d5fd1", K: "#0f766e", A: "#8a4fd0", F: "#b0572a", HP: "#a1690a", IE: "#2f7d8f", UE: "#6b7280", FP: "#9d3b6b", MA: "#374151" },
};
