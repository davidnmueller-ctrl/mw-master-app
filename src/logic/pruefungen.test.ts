import { test } from "node:test";
import assert from "node:assert/strict";
import type { Belegung, EigenerTermin, Modul, PruefungsCache, PruefungsTermin, Status, Turnus } from "../types";
import {
  artVonTermin,
  formatTag,
  formatTermin,
  konfliktText,
  konflikteImSemester,
  konflikteMitPlan,
  konflikteVon,
  konfliktZwischen,
  planEintraege,
  plusJahre,
  schaetzung,
  stufeZwischen,
  termineFuer,
  zaehleKonflikte,
  type ModulTermine,
  type Termin,
} from "./pruefungen";

// ---------------- helpers (invented data) ----------------

function termin(datum: string | null, beginn: string | null = null, ende: string | null = null, extra: Partial<Termin> = {}): Termin {
  return {
    id: `T-${datum}-${beginn}`,
    code: "XX0001",
    semester: "WS 26/27",
    herkunft: "echt",
    datum,
    datumBis: null,
    beginn,
    ende,
    raeume: [],
    alternativGruppe: null,
    vorbehaltlich: false,
    hinweis: null,
    art: "Haupttermin",
    ...extra,
  };
}
const mt = (termine: Termin[], herkunft: ModulTermine["herkunft"] = "echt"): ModulTermine => ({ herkunft, termine });

function eintrag(code: string, datum: string | null, extra: Partial<PruefungsTermin> = {}): PruefungsTermin {
  return { id: `${code}-${datum}`, code, datum, beginn: "09:00", ende: "10:30", ...extra };
}

function cache(semester: Record<string, PruefungsTermin[]>): PruefungsCache {
  return Object.fromEntries(
    Object.entries(semester).map(([s, termine]) => [
      s,
      { semester: s, stand: "2026-10-14", termine, datei: "x", updatedAt: "u", gelesenAm: "g" },
    ]),
  );
}

let nextId = 1;
function belegung(code: string | null, semester: string, status: Status = "geplant", eigenerTermin: EigenerTermin | null = null): Belegung {
  return {
    id: nextId++,
    modulCode: code,
    titel: code ?? "Freier Eintrag",
    cp: 5,
    kategorie: "K",
    unterbereich: null,
    semester,
    status,
    note100: null,
    notiz: "",
    eigenerTermin,
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

const modul = (code: string, turnus: Turnus = "WS"): Modul => ({ code, titel: `Modul ${code}`, cp: 5, kategorien: ["K"], turnus });

// ---------------- single dates ----------------

test("yellow limit 2: Mon+Tue and Mon+Wed yellow, Mon+Thu no conflict; limit 0 has no yellow", () => {
  const mo = termin("2027-02-08", "09:00", "10:00");
  assert.equal(formatTag("2027-02-08"), "Mo 08.02.2027");
  assert.equal(stufeZwischen(mo, termin("2027-02-09", "09:00", "10:00"), 2), "gelb");
  assert.equal(stufeZwischen(mo, termin("2027-02-10", "09:00", "10:00"), 2), "gelb");
  assert.equal(stufeZwischen(mo, termin("2027-02-11", "09:00", "10:00"), 2), null);
  assert.equal(stufeZwischen(termin("2027-02-10"), mo, 2), "gelb", "order does not matter");
  assert.equal(stufeZwischen(mo, termin("2027-02-09", "09:00", "10:00"), 0), null);
  assert.equal(stufeZwischen(mo, termin("2027-02-08", "13:00", "14:00"), 0), "orange", "same day stays orange with limit 0");
});

test("same day: touching times orange, overlapping red, unknown time orange", () => {
  const a = termin("2027-02-12", "14:00", "15:30");
  assert.equal(stufeZwischen(a, termin("2027-02-12", "15:30", "17:00"), 2), "orange");
  assert.equal(stufeZwischen(a, termin("2027-02-12", "15:00", "16:00"), 2), "rot");
  assert.equal(stufeZwischen(a, termin("2027-02-12", "08:00", "18:00"), 2), "rot", "one inside the other");
  assert.equal(stufeZwischen(a, termin("2027-02-12"), 2), "orange");
  assert.equal(stufeZwischen(a, termin("2027-02-12", "14:00", null), 2), "orange", "end unknown");
});

test("multi-day dates: overlapping ranges orange, gap measured between the nearest days", () => {
  const block = termin("2027-02-10", null, null, { datumBis: "2027-02-12" });
  assert.equal(stufeZwischen(block, termin("2027-02-11", "09:00", "10:00"), 2), "orange");
  assert.equal(stufeZwischen(block, termin("2027-02-14", "09:00", "10:00"), 2), "gelb");
  assert.equal(stufeZwischen(block, termin("2027-02-15", "09:00", "10:00"), 2), null);
  assert.equal(stufeZwischen(termin("2027-02-08"), block, 2), "gelb");
});

test("dates without a day never conflict", () => {
  assert.equal(stufeZwischen(termin(null), termin("2027-02-12", "09:00", "10:00"), 7), null);
  assert.equal(stufeZwischen(termin(null), termin(null), 7), null);
});

// ---------------- between modules ----------------

test("alternatives: the most favourable group counts", () => {
  const a = mt([
    termin("2027-02-10", "09:00", "10:00", { alternativGruppe: "g" }),
    termin("2027-02-20", "09:00", "10:00", { alternativGruppe: "g" }),
  ]);
  const b = mt([termin("2027-02-10", "09:00", "10:00")]);
  assert.equal(konfliktZwischen(a, b, 2), null);
  assert.equal(konfliktZwischen(b, a, 2), null);
});

test("parts: every part is written, the worst part pair counts", () => {
  const a = mt([termin("2027-02-10", "09:00", "10:00"), termin("2027-02-11", "09:00", "10:00")]);
  const b = mt([termin("2027-02-11", "13:00", "14:00")]);
  const k = konfliktZwischen(a, b, 2)!;
  assert.equal(k.stufe, "orange");
  assert.equal(k.a.datum, "2027-02-11");
  assert.equal(k.moeglich, false);

  // Two parts of A with groups of their own: still parts.
  const a2 = mt([
    termin("2027-02-10", "09:00", "10:00", { alternativGruppe: "g1" }),
    termin("2027-02-11", "09:00", "10:00", { alternativGruppe: "g2" }),
  ]);
  assert.equal(konfliktZwischen(a2, b, 2)!.stufe, "orange");
});

test("an estimate on either side makes the conflict possible; an own date counts as real", () => {
  const echt = mt([termin("2027-02-12", "09:00", "10:00")]);
  const sch = mt([termin("2027-02-12", "13:00", "14:00", { herkunft: "schaetzung" })], "schaetzung");
  const eigen = mt([termin("2027-02-12", "09:30", "11:00", { herkunft: "eigen" })], "eigen");
  assert.deepEqual([konfliktZwischen(echt, sch, 2)!.stufe, konfliktZwischen(echt, sch, 2)!.moeglich], ["orange", true]);
  assert.equal(konfliktZwischen(sch, echt, 2)!.moeglich, true);
  assert.deepEqual([konfliktZwischen(echt, eigen, 2)!.stufe, konfliktZwischen(echt, eigen, 2)!.moeglich], ["rot", false]);
});

// ---------------- estimate ----------------

test("estimate: SS 26 on 13.08.2026 becomes 13.08.2027 in SS 27", () => {
  const c = cache({ "SS 26": [eintrag("XX0003", "2026-08-13", { raeume: ["Hörsaal B1"], alternativGruppe: "g" })] });
  const r = termineFuer({ code: "XX0003", semester: "SS 27" }, c, modul("XX0003", "SS"));
  assert.equal(r.herkunft, "schaetzung");
  const t = r.termine[0];
  assert.equal(t.datum, "2027-08-13");
  assert.equal(t.beginn, "09:00");
  assert.deepEqual(t.raeume, ["Hörsaal B1"]);
  assert.equal(t.alternativGruppe, "g");
  assert.deepEqual(t.vorjahr, { semester: "SS 26", datum: "2026-08-13", datumBis: null });
  assert.equal(t.id, "XX0003-2026-08-13-schaetzung-SS27", "ids outside the pattern get a suffix");
});

test("estimate: 29.02. becomes 28.02. a year later; newest earlier semester of the same kind", () => {
  assert.equal(plusJahre("2028-02-29", 1), "2029-02-28");
  assert.equal(plusJahre("2028-02-29", 4), "2032-02-29");
  assert.equal(plusJahre("2027-02-12", 2), "2029-02-12");

  const c = cache({
    "WS 26/27": [eintrag("XX0001", "2027-02-01", { id: "XX0001-2026W-1" })],
    "WS 27/28": [eintrag("XX0001", "2028-02-29", { id: "XX0001-2027W-1", datumBis: "2028-03-01" })],
  });
  const t = schaetzung(c, "WS 28/29", "XX0001")[0];
  assert.equal(t.datum, "2029-02-28");
  assert.equal(t.datumBis, "2029-03-01");
  assert.equal(t.id, "XX0001-2028W-1", "predicted id of the real entry");
  // Two years back if the year in between has nothing.
  assert.equal(schaetzung(c, "WS 29/30", "XX0001")[0].datum, "2030-02-28");
  assert.deepEqual(schaetzung(c, "WS 26/27", "XX0001"), [], "only earlier semesters");
});

test("estimate: a WS is only estimated from a WS, never from an SS", () => {
  const c = cache({ "SS 26": [eintrag("XX0001", "2026-04-14")] });
  assert.equal(termineFuer({ code: "XX0001", semester: "WS 26/27" }, c).herkunft, "keiner");
  assert.equal(termineFuer({ code: "XX0001", semester: "SS 27" }, c).herkunft, "schaetzung");
});

test("precedence: own > real > estimate > none", () => {
  const c = cache({
    "WS 25/26": [eintrag("XX0001", "2026-02-12")],
    "WS 26/27": [eintrag("XX0001", "2027-02-10")],
  });
  const real = termineFuer({ code: "XX0001", semester: "WS 26/27" }, c);
  assert.equal(real.herkunft, "echt");
  assert.equal(real.termine[0].datum, "2027-02-10");
  assert.equal(termineFuer({ code: "XX0001", semester: "WS 27/28" }, c).herkunft, "schaetzung");
  const eigen = termineFuer(
    { code: "XX0001", semester: "WS 26/27", belegungId: 7, eigenerTermin: { datum: "2027-03-01", beginn: "10:00", ende: null, raum: "R 1" } },
    c,
  );
  assert.equal(eigen.herkunft, "eigen");
  assert.equal(eigen.termine[0].id, "7-eigen");
  assert.deepEqual(eigen.termine[0].raeume, ["R 1"]);
  assert.equal(termineFuer({ code: "XX0002", semester: "WS 26/27" }, c).herkunft, "keiner");
  assert.equal(termineFuer({ code: null, semester: "WS 26/27" }, c).herkunft, "keiner");
  assert.equal(termineFuer({ code: "XX0001", semester: "ohne" }, c).herkunft, "keiner");
});

test("main or repeat exam for all Turnus values and both kinds of semester", () => {
  const erwartet: [Turnus, string, string][] = [
    ["WS", "Haupttermin", "Wiederholung"],
    ["SS", "Wiederholung", "Haupttermin"],
    ["WS+SS", "Haupttermin", "Haupttermin"],
    ["unregelmaessig", "unbekannt", "unbekannt"],
  ];
  for (const [turnus, ws, ss] of erwartet) {
    assert.equal(artVonTermin(turnus, "WS 26/27"), ws, `${turnus} im WS`);
    assert.equal(artVonTermin(turnus, "SS 27"), ss, `${turnus} im SS`);
  }
  // The semester of the plan decides, not the date (an October date can belong to the SS).
  const c = cache({ "SS 26": [eintrag("XX0001", "2026-10-09")] });
  assert.equal(termineFuer({ code: "XX0001", semester: "SS 26" }, c, modul("XX0001", "WS")).termine[0].art, "Wiederholung");
});

// ---------------- plan ----------------

test("only Idee/geplant/angemeldet in real semesters are checked; undated entries never conflict", () => {
  const c = cache({
    "WS 26/27": [
      eintrag("XX0001", "2027-02-12"),
      eintrag("XX0002", "2027-02-12"),
      eintrag("XX0003", "2027-02-12"),
      eintrag("XX0004", null, { beginn: null, ende: null, hinweis: "nach Absprache" }),
    ],
  });
  const mm = new Map<string, Modul>();
  const bs = [
    belegung("XX0001", "WS 26/27", "idee"),
    belegung("XX0002", "WS 26/27", "bestanden"),
    belegung("XX0003", "WS 26/27", "anerkannt"),
    belegung("XX0004", "WS 26/27", "angemeldet"),
    belegung("XX0003", "WS 26/27", "nicht_bestanden"),
    belegung("XX0002", "vor", "geplant"),
    belegung("XX0002", "ohne", "geplant"),
  ];
  const ein = planEintraege(bs, "WS 26/27", c, mm);
  assert.deepEqual(ein.map((e) => e.belegung.modulCode), ["XX0001", "XX0004"]);
  assert.deepEqual(konflikteImSemester(ein, 2), []);
  assert.deepEqual(planEintraege(bs, "vor", c, mm), []);
  assert.deepEqual(planEintraege(bs, "ohne", c, mm), []);
});

test("conflicts per semester are counted, possible ones separately", () => {
  const c = cache({
    "WS 25/26": [eintrag("XX0003", "2026-02-11", { id: "XX0003-2025W-1" })],
    "WS 26/27": [
      eintrag("XX0001", "2027-02-12", { beginn: "14:00", ende: "15:30" }),
      eintrag("XX0002", "2027-02-12", { beginn: "15:00", ende: "16:00" }),
      eintrag("XX0004", "2027-02-14"),
    ],
  });
  const frei = belegung(null, "WS 26/27", "geplant", { datum: "2027-02-12", beginn: null, ende: null, raum: null });
  const bs = [
    belegung("XX0001", "WS 26/27"),
    belegung("XX0002", "WS 26/27", "angemeldet"),
    belegung("XX0003", "WS 26/27"), // estimate 11.02.2027
    belegung("XX0004", "WS 26/27"),
    frei,
    belegung("XX0001", "SS 27"),
  ];
  const ks = konflikteImSemester(planEintraege(bs, "WS 26/27", c, new Map()), 2);
  const paar = (k: (typeof ks)[number]) => `${k.x.titel}+${k.y.titel}:${k.stufe}${k.moeglich ? "?" : ""}`;
  assert.deepEqual(ks.map(paar), [
    "XX0001+XX0002:rot",
    "XX0001+Freier Eintrag:orange",
    "XX0002+Freier Eintrag:orange",
    "XX0001+XX0004:gelb",
    "XX0002+XX0004:gelb",
    "XX0004+Freier Eintrag:gelb",
    "XX0001+XX0003:gelb?",
    "XX0002+XX0003:gelb?",
    "XX0003+Freier Eintrag:gelb?",
  ]);
  const z = zaehleKonflikte(ks);
  assert.deepEqual(z, { sicher: 6, moeglich: 3, schlimmste: "rot" });
  assert.equal(konfliktText(z), "6 Prüfungskonflikte · 3 möglich (Schätzung)");
  assert.equal(konfliktText({ sicher: 1, moeglich: 0, schlimmste: "gelb" }), "1 Prüfungskonflikt");
  assert.equal(konfliktText({ sicher: 0, moeglich: 0, schlimmste: null }), "");

  const vonFrei = konflikteVon(ks, frei.id);
  assert.equal(vonFrei.length, 4);
  assert.equal(vonFrei[0].anderer.titel, "XX0001");
  assert.equal(vonFrei[0].eigener.herkunft, "eigen");
  assert.equal(formatTermin(vonFrei[0].fremder), "Fr 12.02.2027, 14:00–15:30");

  // Moving a module to another semester changes the result at once.
  const verschoben = bs.map((b) => (b.modulCode === "XX0002" ? { ...b, semester: "SS 27" } : b));
  assert.equal(zaehleKonflikte(konflikteImSemester(planEintraege(verschoben, "WS 26/27", c, new Map()), 2)).schlimmste, "orange");
});

test("preview: conflicts a module would have with the plan", () => {
  const c = cache({ "WS 26/27": [eintrag("XX0001", "2027-02-12"), eintrag("XX0002", "2027-02-13")] });
  const plan = planEintraege([belegung("XX0001", "WS 26/27")], "WS 26/27", c, new Map());
  const k = konflikteMitPlan(termineFuer({ code: "XX0002", semester: "WS 26/27" }, c), plan, 2, "XX0002");
  assert.equal(k.length, 1);
  assert.equal(k[0].stufe, "gelb");
  assert.equal(k[0].mit.titel, "XX0001");
  // The module itself (already in the plan) is not its own conflict.
  assert.deepEqual(konflikteMitPlan(termineFuer({ code: "XX0001", semester: "WS 26/27" }, c), plan, 2, "XX0001"), []);
});
