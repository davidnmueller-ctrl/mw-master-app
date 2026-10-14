import { test } from "node:test";
import assert from "node:assert/strict";
import type { Belegung, PruefungsCache, Status } from "../types";
import { EXPORT_STANDARD, escapeText, exportEreignisse, falte, icsDatei, icsDateiname } from "./ics";
import { planEintraege } from "./pruefungen";

// Invented data.
const cache: PruefungsCache = {
  "WS 25/26": {
    semester: "WS 25/26",
    stand: "2026-03-01",
    datei: "pruefungen/WS25-26.json",
    updatedAt: "u",
    gelesenAm: "g",
    termine: [{ id: "XX0002-2025W-1", code: "XX0002", datum: "2026-02-12", beginn: "10:30", ende: "12:00" }],
  },
  "WS 26/27": {
    semester: "WS 26/27",
    stand: "2026-10-14",
    datei: "pruefungen/WS26-27.json",
    updatedAt: "u",
    gelesenAm: "g",
    termine: [
      {
        id: "XX0001-2026W-1",
        code: "XX0001",
        pruefungsnummer: "XX0001",
        datum: "2027-02-12",
        beginn: "14:00",
        ende: "15:30",
        raeume: ["Hörsaal A1", "Hörsaal A2"],
        pruefer: ["Beispiel, Hans"],
        abmeldungBis: "2027-02-05",
        vorbehaltlich: true,
      },
      { id: "XX0005-2026W-1", code: "XX0005", datum: "2027-02-15", datumBis: "2027-02-17", beginn: null, ende: null },
      { id: "XX0007-2026W-1", code: "XX0007", datum: null, hinweis: "nach Absprache" },
    ],
  },
};

let nextId = 10;
const belegung = (code: string | null, status: Status = "geplant", extra: Partial<Belegung> = {}): Belegung => ({
  id: nextId++,
  modulCode: code,
  titel: code ?? "Auslandskurs",
  cp: 5,
  kategorie: "K",
  unterbereich: null,
  semester: "WS 26/27",
  status,
  note100: null,
  notiz: "",
  eigenerTermin: null,
  sortOrder: 0,
  createdAt: 0,
  updatedAt: 0,
  ...extra,
});

const plan = [
  belegung("XX0001"),
  belegung("XX0002", "angemeldet"),
  belegung("XX0005"),
  belegung("XX0007"),
  belegung(null, "geplant", { id: 42, titel: "Kurs; Teil 1, \\neu", eigenerTermin: { datum: "2027-03-01", beginn: "09:00", ende: "11:00", raum: "Raum 5" } }),
  belegung("XX0001", "idee", { id: 99, semester: "WS 26/27" }),
];
const modulMap = new Map([["XX0001", { code: "XX0001", titel: "Beispiel: Grenzschichten", cp: 5, kategorien: ["K"], turnus: "WS" as const }]]);
const eintraege = planEintraege(plan, "WS 26/27", cache, modulMap, false);

test("TEXT escaping of backslash, semicolon, comma and line breaks", () => {
  assert.equal(escapeText("a\\b;c,d\ne\r\nf"), "a\\\\b\\;c\\,d\\ne\\nf");
});

test("lines are folded after 75 octets, never inside a UTF-8 character", () => {
  const lang = "DESCRIPTION:" + "ä".repeat(100);
  const gefaltet = falte(lang);
  const zeilen = gefaltet.split("\r\n");
  assert.ok(zeilen.length > 1);
  const enc = new TextEncoder();
  for (const [i, z] of zeilen.entries()) {
    assert.ok(enc.encode(z).length <= 75, `line ${i} has ${enc.encode(z).length} octets`);
    if (i > 0) assert.equal(z[0], " ");
  }
  // Unfolding gives the original back.
  assert.equal(gefaltet.replace(/\r\n /g, ""), lang);
  assert.equal(falte("SUMMARY:kurz"), "SUMMARY:kurz");
});

test("events from the plan: status choice, estimates, own dates, all-day without time", () => {
  const ev = exportEreignisse(eintraege, EXPORT_STANDARD);
  assert.deepEqual(
    ev.map((e) => e.titel),
    [
      "Prüfung: XX0002 (Schätzung)",
      "Prüfung: Beispiel: Grenzschichten",
      "Prüfung: XX0005",
      "Prüfung: Kurs; Teil 1, \\neu",
    ],
  );
  assert.equal(ev[0].uid, "XX0002-2026W-1@mwmaster", "estimate uses the predicted id");
  assert.equal(ev[1].uid, "XX0001-2026W-1@mwmaster");
  assert.equal(ev[3].uid, "42-eigen@mwmaster");
  assert.equal(ev[1].ort, "Hörsaal A1, Hörsaal A2");
  assert.match(ev[1].beschreibung!, /vorbehaltlich\nPrüfungsnummer: XX0001\nPrüfer\*in: Beispiel, Hans\nAbmeldung bis: Fr 05\.02\.2027\nHaupttermin/);
  assert.match(ev[0].beschreibung!, /Schätzung – Vorjahr: Do 12\.02\.2026/);

  assert.deepEqual(exportEreignisse(eintraege, { ...EXPORT_STANDARD, schaetzungen: false }).map((e) => e.uid).includes("XX0002-2026W-1@mwmaster"), false);
  assert.equal(exportEreignisse(eintraege, { status: ["idee"], schaetzungen: true }).length, 1);
});

test("the .ics file: CRLF, VTIMEZONE, TZID times, all-day dates, stable UIDs", () => {
  const ev = exportEreignisse(eintraege, EXPORT_STANDARD);
  const a = icsDatei(ev, new Date("2026-10-14T18:00:00Z"), "Prüfungen WS 26/27");
  const b = icsDatei(exportEreignisse(planEintraege(plan, "WS 26/27", cache, modulMap, false), EXPORT_STANDARD), new Date("2026-11-01T08:00:00Z"));

  assert.ok(a.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!/[^\r]\n/.test(a), "every line ends with CRLF");
  assert.match(a, /BEGIN:VTIMEZONE\r\nTZID:Europe\/Berlin\r\n/);
  assert.match(a, /DTSTART;TZID=Europe\/Berlin:20270212T140000\r\nDTEND;TZID=Europe\/Berlin:20270212T153000/);
  // Multi-day without time: all-day, DTEND is the day after the last day.
  assert.match(a, /DTSTART;VALUE=DATE:20270215\r\nDTEND;VALUE=DATE:20270218/);
  assert.match(a, /SUMMARY:Prüfung: Kurs\\; Teil 1\\, \\\\neu/);
  assert.match(a, /DTSTAMP:20261014T180000Z/);
  assert.match(a, /X-WR-CALNAME:Prüfungen WS 26\/27/);
  assert.equal((a.match(/BEGIN:VEVENT/g) ?? []).length, 4);

  const uids = (s: string) => [...s.matchAll(/^UID:(.*)$/gm)].map((m) => m[1].trim());
  assert.deepEqual(uids(a), uids(b), "UIDs stay the same across exports");
  assert.equal(new Set(uids(a)).size, 4);

  for (const z of a.split("\r\n")) assert.ok(new TextEncoder().encode(z).length <= 75);
});

test("alternatives are exported, each marked as one of the parallel groups", () => {
  const c: PruefungsCache = {
    "WS 26/27": {
      ...cache["WS 26/27"],
      termine: [
        { id: "XX0004-2026W-1", code: "XX0004", datum: "2027-02-10", alternativGruppe: "A" },
        { id: "XX0004-2026W-2", code: "XX0004", datum: "2027-02-22", alternativGruppe: "A" },
      ],
    },
  };
  const ev = exportEreignisse(planEintraege([belegung("XX0004")], "WS 26/27", c, new Map(), false), EXPORT_STANDARD);
  assert.equal(ev.length, 2);
  for (const e of ev) assert.match(e.beschreibung!, /^Parallele Gruppe: einer von 2 Terminen/);
});

test("all-day event for a single day without time", () => {
  const ics = icsDatei([{ uid: "x@mwmaster", titel: "T", datum: "2027-02-28" }], new Date(0));
  assert.match(ics, /DTSTART;VALUE=DATE:20270228\r\nDTEND;VALUE=DATE:20270301/);
  assert.equal(icsDateiname("WS 26/27"), "Pruefungen-WS26-27.ics");
  assert.equal(icsDateiname("SS 27"), "Pruefungen-SS27.ics");
});
