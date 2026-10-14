// Calendar export (.ics, RFC 5545) of the exam dates of one semester
// (docs/ANFORDERUNGEN.md 4.8). Pure functions, unit-tested in ics.test.ts.
//
// Made to import into Google Calendar and Outlook: CRLF line ends, lines
// folded after 75 octets, TEXT escaping, a VTIMEZONE for Europe/Berlin and
// stable UIDs, so importing again updates the events instead of duplicating.
import type { Status } from "../types";
import { formatTag, isoAusTagNr, tagNr, type PlanEintrag, type Termin } from "./pruefungen";

export interface IcsEreignis {
  uid: string;
  titel: string;
  ort?: string;
  beschreibung?: string;
  datum: string;
  datumBis?: string | null;
  beginn?: string | null;
  ende?: string | null;
}

const TZID = "Europe/Berlin";

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZID}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** Escape a TEXT value: backslash, semicolon, comma and line breaks. */
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

const enc = new TextEncoder();

/**
 * Fold a content line: at most 75 octets per line, continuation lines start
 * with a space. Never splits inside a UTF-8 character.
 */
export function falte(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const max = out.length === 0 ? 75 : 74; // the leading space counts
    if (bytes + n > max) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const datumWert = (iso: string) => iso.replace(/-/g, "");
const zeitWert = (iso: string, hhmm: string) => `${datumWert(iso)}T${hhmm.replace(":", "")}00`;

function utcStempel(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function ereignisZeilen(e: IcsEreignis, stempel: string): string[] {
  const z = ["BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${stempel}`];
  const mehrtaegig = !!e.datumBis && e.datumBis !== e.datum;
  if (e.beginn && !mehrtaegig) {
    z.push(`DTSTART;TZID=${TZID}:${zeitWert(e.datum, e.beginn)}`);
    if (e.ende && e.ende > e.beginn) z.push(`DTEND;TZID=${TZID}:${zeitWert(e.datum, e.ende)}`);
  } else {
    // All-day (also multi-day exams); DTEND is the day after the last day.
    const letzter = mehrtaegig ? e.datumBis! : e.datum;
    z.push(`DTSTART;VALUE=DATE:${datumWert(e.datum)}`);
    z.push(`DTEND;VALUE=DATE:${datumWert(isoAusTagNr(tagNr(letzter) + 1))}`);
  }
  z.push(`SUMMARY:${escapeText(e.titel)}`);
  if (e.ort) z.push(`LOCATION:${escapeText(e.ort)}`);
  if (e.beschreibung) z.push(`DESCRIPTION:${escapeText(e.beschreibung)}`);
  z.push("TRANSP:OPAQUE", "END:VEVENT");
  return z;
}

/** The whole .ics file. `jetzt` is used for DTSTAMP. */
export function icsDatei(ereignisse: IcsEreignis[], jetzt: Date, name?: string): string {
  const stempel = utcStempel(jetzt);
  const zeilen = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MW Master//Pruefungstermine//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...(name ? [`X-WR-CALNAME:${escapeText(name)}`] : []),
    ...VTIMEZONE,
    ...ereignisse.flatMap((e) => ereignisZeilen(e, stempel)),
    "END:VCALENDAR",
  ];
  return zeilen.map(falte).join("\r\n") + "\r\n";
}

// ---------------- from the plan ----------------

export interface ExportOptionen {
  /** Which Belegung statuses are exported (default: geplant, angemeldet). */
  status: Status[];
  /** Include estimates (titled "(Schätzung)"). */
  schaetzungen: boolean;
}

export const EXPORT_STANDARD: ExportOptionen = { status: ["geplant", "angemeldet"], schaetzungen: true };

function beschreibung(t: Termin): string {
  const q = t.quelle;
  const z: string[] = [];
  if (t.herkunft === "schaetzung" && t.vorjahr?.datum) z.push(`Schätzung – Vorjahr: ${formatTag(t.vorjahr.datum)}`);
  if (t.herkunft === "eigen") z.push("Eigener Termin");
  if (t.vorbehaltlich) z.push("vorbehaltlich");
  if (q?.pruefungsnummer) z.push(`Prüfungsnummer: ${q.pruefungsnummer}`);
  if (q?.art) z.push(`Art: ${q.art}`);
  if (q?.pruefer?.length) z.push(`Prüfer*in: ${q.pruefer.join("; ")}`);
  if (q?.abmeldungBis && t.herkunft === "echt") z.push(`Abmeldung bis: ${formatTag(q.abmeldungBis)}`);
  if (t.art !== "unbekannt") z.push(t.art === "Haupttermin" ? "Haupttermin" : "Wiederholungstermin");
  if (t.datumBis && t.beginn) z.push(`Uhrzeit: ${t.beginn}${t.ende ? `–${t.ende}` : ""}`);
  if (t.hinweis) z.push(t.hinweis);
  return z.join("\n");
}

/** One event per dated exam of the chosen Belegungen. Dates without a day are left out. */
export function exportEreignisse(eintraege: PlanEintrag[], opt: ExportOptionen): IcsEreignis[] {
  const out: IcsEreignis[] = [];
  for (const e of eintraege) {
    if (!opt.status.includes(e.belegung.status)) continue;
    for (const t of e.termine.termine) {
      if (!t.datum) continue;
      if (t.herkunft === "schaetzung" && !opt.schaetzungen) continue;
      out.push({
        uid: `${t.id}@mwmaster`,
        titel: `Prüfung: ${e.titel}${t.herkunft === "schaetzung" ? " (Schätzung)" : ""}`,
        ort: t.raeume.join(", ") || undefined,
        beschreibung: beschreibung(t) || undefined,
        datum: t.datum,
        datumBis: t.datumBis,
        beginn: t.beginn,
        ende: t.ende,
      });
    }
  }
  return out.sort((a, b) => a.datum.localeCompare(b.datum) || (a.beginn ?? "").localeCompare(b.beginn ?? ""));
}

/** File name suggestion: "Pruefungen-WS26-27.ics". */
export function icsDateiname(semester: string): string {
  return `Pruefungen-${semester.replace(/\s+/g, "").replace("/", "-")}.ics`;
}
