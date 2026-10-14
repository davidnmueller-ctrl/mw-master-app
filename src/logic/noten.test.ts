import { test } from "node:test";
import assert from "node:assert/strict";
import type { Belegung } from "../types";
import {
  berechneSchnitt,
  formatCp,
  formatNote,
  fristenCheck,
  istNotenstufe,
  parseNote,
  praedikatFuer,
  strukturCheck,
  type Leistung,
} from "./noten";
import { FALLBACK_REGELN as R } from "./shared";

const L = (kategorie: string, cp: number, note: number | null, unterbereich: string | null = null): Leistung => ({
  kategorie,
  cp,
  note100: note == null ? null : Math.round(note * 100),
  unterbereich,
});

test("parse and format grades", () => {
  assert.equal(parseNote("1,3"), 130);
  assert.equal(parseNote("1.7"), 170);
  assert.equal(parseNote("1"), 100);
  assert.equal(parseNote("1,5"), 150); // converted grade from abroad
  assert.equal(parseNote("0,7"), null);
  assert.equal(parseNote("1,33"), null);
  assert.equal(parseNote("abc"), null);
  assert.equal(formatNote(130), "1,3");
  assert.equal(formatNote(125, 2), "1,25");
  assert.equal(formatNote(null), "–");
  assert.equal(formatCp(5), "5");
  assert.equal(formatCp(2.5), "2,5");
  assert.equal(istNotenstufe(130, R), true);
  assert.equal(istNotenstufe(150, R), false);
});

test("certificate grade is cut, not rounded", () => {
  // exact 1.25 -> 1.2
  const s = berechneSchnitt([L("G", 5, 1.0), L("F", 5, 1.5), L("F", 5, null), L("UE", 2, null, "UE-WEITERE")], R);
  assert.equal(s.exakt100, 125);
  assert.equal(s.zeugnis10, 12);
  assert.equal(s.benoteteCp, 10);
  assert.equal(s.gesamtCp, 17);
  assert.equal(s.unbenoteteCp, 7);
  assert.equal(s.praedikat, "sehr gut");
  assert.equal(s.auszeichnung, true);

  // exact 1.29 -> 1.2 (and the exact value shown is 1,29, never rounded up to 1,30)
  const s129 = berechneSchnitt([L("K", 1, 1.0), L("K", 29, 1.3)], R);
  assert.equal(s129.exakt100, 129);
  assert.equal(s129.zeugnis10, 12);
  // exact 1.30 -> 1.3
  assert.equal(berechneSchnitt([L("K", 5, 1.3)], R).zeugnis10, 13);
});

test("integer maths avoids the floating point trap", () => {
  // (1.0·3 + 1.0·5 + 1.3·4) / 12 = 1.1 exactly. Naive floating point gives
  // 1.0999999999999999 and Math.floor(x*10)/10 = 1.0 — wrong.
  const s = berechneSchnitt([L("K", 3, 1.0), L("K", 5, 1.0), L("K", 4, 1.3)], R);
  assert.equal(s.zeugnis10, 11);
  assert.equal(s.exakt100, 110);
});

test("full 120 CP scenario", () => {
  const ls = [
    ...Array.from({ length: 4 }, () => L("G", 5, 2.0)),
    ...Array.from({ length: 5 }, () => L("K", 5, 2.0)),
    L("G", 5, 1.0),
    L("F", 5, 1.5),
    L("F", 5, null),
    L("HP", 4, 1.0),
    L("HP", 4, 1.3),
    L("IE", 3, 1.3),
    L("IE", 3, 1.3),
    L("UE", 3, null, "UE-ETHIK"),
    L("UE", 2, null, "UE-WEITERE"),
    L("FP", 11, 1.3),
    L("MA", 30, 1.0),
  ];
  const s = berechneSchnitt(ls, R);
  // 163.8 / 110 = 1.48909…
  assert.equal(s.exakt100, 148);
  assert.equal(s.zeugnis10, 14);
  assert.equal(s.gesamtCp, 120);
  assert.equal(s.auszeichnung, false);
  const c = strukturCheck(ls, R);
  assert.equal(c.gesamt.status, "ok");
  assert.equal(c.gruppen[0].ist, 60);
  assert.equal(c.gruppen[0].status, "ok");
  const ue = c.kategorien.find((k) => k.id === "UE")!;
  assert.equal(ue.status, "ok");
  assert.deepEqual(ue.unterbereiche.map((u) => u.status), ["ok", "ok"]);
});

test("UE does not enter the average, HP and IE do", () => {
  const s = berechneSchnitt([L("K", 5, 2.0), L("HP", 4, 1.0), L("UE", 3, 4.0, "UE-ETHIK")], R);
  // (2.0·5 + 1.0·4) / 9 = 1.555…
  assert.equal(s.exakt100, 155);
  assert.equal(s.benoteteCp, 9);
  assert.equal(s.gesamtCp, 12);
});

test("no graded CP", () => {
  const s = berechneSchnitt([L("F", 5, null)], R);
  assert.equal(s.zeugnis10, null);
  assert.equal(s.praedikat, null);
  assert.equal(s.gesamtCp, 5);
});

test("predicates", () => {
  assert.equal(praedikatFuer(15, R), "sehr gut");
  assert.equal(praedikatFuer(16, R), "gut");
  assert.equal(praedikatFuer(35, R), "befriedigend");
  assert.equal(praedikatFuer(40, R), "ausreichend");
  assert.equal(praedikatFuer(41, R), null);
});

test("structure check: maximums, sub-areas, exactly one module", () => {
  const c = strukturCheck(
    [L("A", 10, 2.0), L("A", 6, 2.0), L("UE", 3, null, "UE-ETHIK"), L("FP", 11, 1.0), L("FP", 11, 1.0), L("HP", 4, 1.0)],
    R,
  );
  const by = (id: string) => c.kategorien.find((k) => k.id === id)!;
  assert.equal(by("A").status, "ueber"); // 16 > 15
  assert.equal(by("UE").status, "offen"); // 3 of 5, "Weitere" missing
  assert.equal(by("UE").unterbereiche[0].status, "ok");
  assert.equal(by("UE").unterbereiche[1].status, "offen");
  assert.equal(by("FP").status, "ueber"); // two modules (and 22 CP)
  assert.equal(by("HP").status, "offen");
  assert.equal(by("K").status, "frei");
  assert.equal(c.gesamt.status, "offen");
});

test("deadline: one G/K/A module by the end of the 2nd semester", () => {
  const regeln = {
    ...R,
    fristen: [{ text: "Frist", bisFachsemester: 2, kategorien: ["G", "K", "A"], minModule: 1 }],
  };
  const b = (kategorie: string, status: Belegung["status"]): Belegung => ({
    id: 1,
    modulCode: null,
    titel: "x",
    cp: 5,
    kategorie,
    unterbereich: null,
    semester: "WS 26/27",
    status,
    note100: 200,
    notiz: "",
    eigenerTermin: null,
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
  });
  const imErsten = new Date(2026, 10, 1);
  const imZweiten = new Date(2027, 5, 1);
  assert.deepEqual(
    fristenCheck([b("F", "bestanden")], regeln, "WS 26/27", imErsten).map((f) => [f.erfuellt, f.dringend, f.aktuellesFachsemester]),
    [[false, false, 1]],
  );
  assert.equal(fristenCheck([b("F", "bestanden")], regeln, "WS 26/27", imZweiten)[0].dringend, true);
  assert.equal(fristenCheck([b("K", "geplant")], regeln, "WS 26/27", imZweiten)[0].erfuellt, false);
  assert.equal(fristenCheck([b("K", "bestanden")], regeln, "WS 26/27", imZweiten)[0].erfuellt, true);
});
