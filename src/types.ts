// Shared types. The shapes of the shared data mirror schema/*.schema.json;
// change both together (and bump the schema version, see docs/ANFORDERUNGEN.md 5.2).

// ---------------- shared data (read-only, from the OneDrive folder) ----------------

export interface Manifest {
  schemaVersion: string;
  updatedAt: string;
  studiengang: string;
  studienplan?: string;
  fpso?: string;
  anzahlModule?: number;
  moduleCodesSha256?: string;
  hinweis?: string;
  /** Exam date files (schema 1.3). Missing = no exam data. */
  pruefungen?: ManifestPruefung[];
}

/** One entry of manifest.pruefungen (schema 1.3). */
export interface ManifestPruefung {
  semester: string;
  /** Path relative to the shared root, e.g. "pruefungen/WS26-27.json". */
  datei: string;
  updatedAt: string;
}

export interface Unterbereich {
  id: string;
  name: string;
  minCp?: number | null;
}

export interface Kategorie {
  id: string;
  name: string;
  kurz: string;
  gruppe?: string | null;
  minCp?: number | null;
  maxCp?: number | null;
  zaehltZurNote: boolean;
  genauEinModul?: boolean;
  unterbereiche?: Unterbereich[];
}

export interface Frist {
  text: string;
  bisFachsemester: number;
  kategorien: string[];
  minModule: number;
}

export interface Regeln {
  gesamtCp: number;
  kategorien: Kategorie[];
  gruppen?: { id: string; sollCp: number }[];
  platzhalterCp?: Record<string, number>;
  notenstufen: number[];
  zeugnisnote: "abschneiden_1_nachkommastelle";
  praedikate: { bis: number; name: string }[];
  auszeichnung?: { bis: number; bezogenAuf?: "zeugnisnote" };
  fristen?: Frist[];
  farben?: Record<string, string>;
}

export interface Tag {
  id: string;
  name: string;
}

export type Turnus = "WS" | "SS" | "WS+SS" | "unregelmaessig";
export type TerminArt = "Haupttermin" | "Wiederholung" | "unbekannt";

export interface Notenspiegel {
  termin: string;
  semester: string;
  art?: TerminArt;
  pruefungsdatum?: string | null;
  angemeldet?: number;
  /**
   * Count per grade step, keys "1.0" … "5.0" with one decimal (without
   * "nicht erschienen"). Besides the regular steps, intermediate steps occur:
   * "1.4", "2.4", "3.4" with a grade bonus (schema 1.1), any "x.y" since 1.2.
   */
  verteilung: Record<string, number>;
  nichtErschienen: number;
  /** The distribution already includes a grade bonus of this size, e.g. 0.3 (schema 1.1). */
  notenbonus?: number;
  /** Short note on this exam, shown in the detail view (schema 1.1). */
  hinweis?: string;
  /** Numbers as read off the TUMonline screenshot; only used to check the extraction. */
  tumonline?: { angetreten?: number; quoteNegativ?: number; schnittGesamt?: number; schnittBestanden?: number };
  erfasstAm?: string;
  quelle?: string;
}

export interface Kommentar {
  text: string;
  datum?: string;
  von?: string;
}

export interface Modul {
  code: string;
  titel: string;
  titelEn?: string;
  cp: number;
  kategorien: string[];
  unterbereich?: string | null;
  tags?: string[];
  turnus: Turnus;
  sprache?: string;
  leitung?: string;
  kurzbeschreibung?: string;
  pruefung?: string;
  links?: { modul?: string; lehrveranstaltungen?: { semester: string; url: string }[] };
  angebot?: { semester: string; status: "bestaetigt" | "erwartet" }[];
  notenspiegel?: Notenspiegel[];
  kommentare?: Kommentar[];
  stand?: string;
  quellen?: string[];
}

/** One exam date from pruefungen/<SEMESTER>.json (schema 1.3, docs/ANFORDERUNGEN.md 5.6). */
export interface PruefungsTermin {
  /** "<code>-<YYYY><W|S>-<n>", unique in the file; used as ICS UID. */
  id: string;
  /** Catalog code (exam number without suffix). */
  code: string;
  pruefungsnummer?: string;
  titel?: string;
  art?: string;
  vorbehaltlich?: boolean;
  /** ISO date, or null when TUMonline gives none (e.g. "nach Absprache"). */
  datum: string | null;
  /** Last day of a multi-day exam. */
  datumBis?: string;
  beginn?: string | null;
  ende?: string | null;
  raeume?: string[];
  pruefer?: string[];
  anmeldungVon?: string;
  anmeldungBis?: string;
  abmeldungBis?: string;
  /** Same string = parallel groups of one module; one of them is written. */
  alternativGruppe?: string | null;
  hinweis?: string | null;
}

export interface PruefungsDatei {
  semester: string;
  stand: string;
  quelle?: string;
  termine: PruefungsTermin[];
}

/** Cached exam data of one semester (kv "cache:pruefungen"). */
export interface PruefungsSemester extends PruefungsDatei {
  datei: string;
  /** updatedAt from the manifest entry this file was read for. */
  updatedAt: string;
  gelesenAm: string;
}

/** Cached exam data per semester, keyed by semester ("WS 26/27"). */
export type PruefungsCache = Record<string, PruefungsSemester>;

/** Per-semester line of the import report (Einstellungen, 4.6). */
export interface PruefungsBericht {
  semester: string;
  datei: string;
  /** "neu" = read now, "unveraendert" = updatedAt same as cache, "fehler" = kept old/none. */
  zustand: "neu" | "unveraendert" | "fehler";
  fehler?: string;
  stand: string | null;
  anzahl: number;
  /** Codes in the file that are not in the catalog (entries skipped). */
  unbekannteCodes: string[];
}

export interface SharedData {
  manifest: Manifest;
  regeln: Regeln;
  tags: Tag[];
  module: Modul[];
  /** When the app last read the folder successfully (ISO). */
  gelesenAm: string;
}

/** Raw result of reading the shared folder (Rust `shared_read`). */
export interface SharedRead {
  root: string;
  files: { name: string; content: string }[];
  errors: { name: string; error: string }[];
}

// ---------------- private data (local SQLite) ----------------

export type Status = "idee" | "geplant" | "angemeldet" | "bestanden" | "anerkannt" | "nicht_bestanden";

export interface Belegung {
  id: number;
  /** Code from the catalog, or null for a free entry (e.g. recognised course from abroad). */
  modulCode: string | null;
  titel: string;
  cp: number;
  kategorie: string;
  unterbereich: string | null;
  /** "WS 26/27", "SS 27", "vor" (before the master) or "ohne" (no term yet). */
  semester: string;
  status: Status;
  /** Grade in hundredths (1,3 -> 130); null = no grade. */
  note100: number | null;
  notiz: string;
  /** Own exam date; overrides shared dates and estimates (4.1, 4.8). */
  eigenerTermin: EigenerTermin | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface EigenerTermin {
  /** ISO date. */
  datum: string;
  /** "HH:MM" or null. */
  beginn: string | null;
  ende: string | null;
  raum: string | null;
}

export interface SpielZeile {
  id: string;
  titel: string;
  kategorie: string;
  /** Sub-area (only for categories with unterbereiche, e.g. UE-ETHIK). */
  unterbereich?: string | null;
  cp: number;
  /** Assumed grade in hundredths; null = not filled in yet. */
  note100: number | null;
  quelle: "plan" | "platzhalter" | "manuell";
  /** Belegung this row was taken from ("Aus Plan übernehmen"). */
  belegungId?: number;
  /** Catalog module of that Belegung, kept so the row still links to it if the Belegung goes away. */
  modulCode?: string | null;
}

export interface Settings {
  /** First master semester, e.g. "WS 26/27". */
  erstesSemester: string;
  /** How many semesters the plan shows (grows on demand). */
  anzahlSemester: number;
  sharedPath: string | null;
  backupDir: string | null;
  einrichtungFertig: boolean;
  /** Exam conflicts: "yellow" up to this many calendar days apart (0 = off, max 7). */
  gelbGrenze: number;
}

export const DEFAULT_SETTINGS: Settings = {
  erstesSemester: "WS 26/27",
  anzahlSemester: 4,
  sharedPath: null,
  backupDir: null,
  einrichtungFertig: false,
  gelbGrenze: 2,
};

/** Saved state of the "Prüfungen" view (kv "pruefungsansicht", 4.8). */
export interface PruefungsAnsicht {
  /** Selected semester; null = choose automatically. */
  semester: string | null;
  modus: "monat" | "woche" | "liste";
  grundlage: "plan" | "alle";
  /** With "alle": always show the plan's modules, other filters only apply outside the plan. */
  planImmer: boolean;
  /** Tag ids (OR); empty = all. */
  tags: string[];
  /** Category ids (module's allowed categories); empty = all. */
  kategorien: string[];
  /** "" = all, otherwise "WS" / "SS" (WS+SS matches both) or "unregelmaessig". */
  turnus: string;
  /** With "alle": show repeat exams (always shown for "plan"). */
  wiederholungen: boolean;
  schaetzungen: boolean;
  /** With "alle": hide modules outside the plan that would conflict with it. */
  nurKonfliktfrei: boolean;
}

export const DEFAULT_PRUEFUNGS_ANSICHT: PruefungsAnsicht = {
  semester: null,
  modus: "monat",
  grundlage: "plan",
  planImmer: true,
  tags: [],
  kategorien: [],
  turnus: "",
  wiederholungen: false,
  schaetzungen: true,
  nurKonfliktfrei: false,
};

export const STATUS_LABEL: Record<Status, string> = {
  idee: "Idee",
  geplant: "geplant",
  angemeldet: "angemeldet",
  bestanden: "bestanden",
  anerkannt: "anerkannt",
  nicht_bestanden: "nicht bestanden",
};

/** Statuses that count as achieved (CP and, if graded, the average). */
export const ERREICHT: Status[] = ["bestanden", "anerkannt"];
/** Statuses of modules that are still open. */
export const OFFEN: Status[] = ["idee", "geplant", "angemeldet"];
