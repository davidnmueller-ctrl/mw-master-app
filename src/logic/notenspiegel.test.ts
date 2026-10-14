import { test } from "node:test";
import assert from "node:assert/strict";
import type { Modul, Notenspiegel } from "../types";
import { artVon, chronologisch, kennzahlen, MIN_ANGETRETENE, pruefeGegenTumonline, referenztermin, sichtbareStufen, STUFEN, summiere } from "./notenspiegel";

// Invented numbers. The formulas were checked against real TUMonline exports
// (the published averages and fail rates came out exactly); real exam
// statistics are not committed to this public repo.
const ns = (termin: string, semester: string, verteilung: Record<string, number>, x: number, extra: Partial<Notenspiegel> = {}): Notenspiegel => ({
  termin,
  semester,
  verteilung,
  nichtErschienen: x,
  ...extra,
});

const A = ns("FA 24W", "WS 24/25", { "1.0": 2, "1.7": 2, "2.3": 4, "3.0": 2, "4.0": 2, "4.7": 1, "5.0": 7 }, 5);

test("key figures", () => {
  const k = kennzahlen(A);
  assert.equal(k.angetreten, 20);
  assert.equal(k.angemeldet, 25);
  assert.equal(k.bestanden, 12);
  assert.equal(k.durchgefallen, 8);
  // (2·1.0 + 2·1.7 + 4·2.3 + 2·3.0 + 2·4.0 + 4.7 + 7·5.0) / 20 = 68.3 / 20
  assert.ok(Math.abs(k.schnittGesamt! - 3.415) < 1e-12);
  // (2 + 3.4 + 9.2 + 6 + 8) / 12 = 28.6 / 12
  assert.ok(Math.abs(k.schnittBestanden! - 2.3833333) < 1e-6);
  assert.equal(k.durchfallquote, 0.4);
});

test("empty distribution", () => {
  const k = kennzahlen(ns("x", "SS 25", {}, 3));
  assert.equal(k.angetreten, 0);
  assert.equal(k.angemeldet, 3);
  assert.equal(k.schnittGesamt, null);
  assert.equal(k.durchfallquote, null);
});

test("check against the numbers read off TUMonline", () => {
  const gut = { ...A, angemeldet: 25, tumonline: { angetreten: 20, quoteNegativ: 0.4, schnittGesamt: 3.42, schnittBestanden: 2.38 } };
  assert.deepEqual(pruefeGegenTumonline(gut), []);
  const verlesen = { ...gut, tumonline: { ...gut.tumonline, schnittBestanden: 2.48, angetreten: 21 } };
  assert.deepEqual(
    pruefeGegenTumonline(verlesen).map((a) => a.feld),
    ["angetreten", "schnittBestanden"],
  );
});

test("pooling and order", () => {
  const B = ns("FA 25S", "SS 25", { "1.0": 1, "5.0": 1 }, 2);
  const s = summiere([A, B]);
  assert.equal(s.verteilung["1.0"], 3);
  assert.equal(s.verteilung["5.0"], 8);
  assert.equal(s.nichtErschienen, 7);
  const C = ns("FA 25W", "WS 25/26", { "2.0": 1 }, 0);
  assert.deepEqual(chronologisch([C, A, B]).map((x) => x.termin), ["FA 24W", "FA 25S", "FA 25W"]);
});

test("main/repeat exam and newest main exam", () => {
  const modul: Modul = {
    code: "XX1",
    titel: "x",
    cp: 5,
    kategorien: ["K"],
    turnus: "WS",
    notenspiegel: [
      ns("FA 24W", "WS 24/25", { "1.0": 1 }, 0),
      ns("FA 25S", "SS 25", { "2.0": 1 }, 0),
      ns("FA 25W", "WS 25/26", { "3.0": 1 }, 0),
      ns("FA 26S", "SS 26", { "4.0": 1 }, 0),
    ],
  };
  assert.equal(artVon(modul.notenspiegel![1], modul), "Wiederholung");
  assert.equal(artVon({ ...modul.notenspiegel![1], art: "Haupttermin" }, modul), "Haupttermin");
});

// ---- reference exam shown in catalog table and Semesterplan ----

const modulMit = (turnus: Modul["turnus"], notenspiegel?: Notenspiegel[]): Modul => ({ code: "XX1", titel: "x", cp: 5, kategorien: ["K"], turnus, notenspiegel });

test("reference exam: the newest of several main exams wins", () => {
  const m = modulMit("WS", [ns("FA 25W", "WS 25/26", { "2.0": 1 }, 0), ns("FA 24W", "WS 24/25", { "1.0": 1 }, 0), ns("FA 23W", "WS 23/24", { "3.0": 1 }, 0)]);
  const r = referenztermin(m)!;
  assert.equal(r.ns.termin, "FA 25W");
  assert.equal(r.istHaupttermin, true);
  assert.equal(r.anzahlTermine, 3);
});

test("reference exam: an older main exam beats a newer repeat", () => {
  const m = modulMit("WS", [ns("FA 24W", "WS 24/25", { "1.0": 1 }, 0), ns("FA 25S", "SS 25", { "2.0": 1 }, 0)]);
  const r = referenztermin(m)!;
  assert.equal(r.ns.termin, "FA 24W");
  assert.equal(r.istHaupttermin, true);
});

test("reference exam: only repeats fall back to the newest exam", () => {
  const m = modulMit("WS", [ns("FA 24S", "SS 24", { "1.0": 1 }, 0), ns("FA 25S", "SS 25", { "2.0": 1 }, 0)]);
  const r = referenztermin(m)!;
  assert.equal(r.ns.termin, "FA 25S");
  assert.equal(r.istHaupttermin, false);
});

test("reference exam: irregular module (art unknown) falls back, explicit art still wins", () => {
  const m = modulMit("unregelmaessig", [ns("A", "WS 24/25", { "1.0": 1 }, 0), ns("B", "SS 25", { "2.0": 1 }, 0)]);
  const r = referenztermin(m)!;
  assert.equal(r.ns.termin, "B");
  assert.equal(r.istHaupttermin, false);
  const m2 = modulMit("unregelmaessig", [ns("A", "WS 24/25", { "1.0": 1 }, 0, { art: "Haupttermin" }), ns("B", "SS 25", { "2.0": 1 }, 0)]);
  assert.equal(referenztermin(m2)!.ns.termin, "A");
  assert.equal(referenztermin(m2)!.istHaupttermin, true);
});

test("reference exam: small sample warning below 15 Angetretene", () => {
  assert.equal(MIN_ANGETRETENE, 15);
  const mitAngetreten = (n: number) => referenztermin(modulMit("WS", [ns("FA", "WS 24/25", { "2.0": n - 1, "5.0": 1 }, 40)]))!;
  const r14 = mitAngetreten(14);
  assert.equal(r14.kennzahlen.angetreten, 14);
  assert.equal(r14.kleineStichprobe, true);
  const r15 = mitAngetreten(15);
  assert.equal(r15.kennzahlen.angetreten, 15); // nichtErschienen (40) does not count
  assert.equal(r15.kleineStichprobe, false);
});

test("reference exam: none without a Notenspiegel", () => {
  assert.equal(referenztermin(modulMit("WS")), null);
  assert.equal(referenztermin(modulMit("WS", [])), null);
});

test("grade bonus steps 1,4 / 2,4 / 3,4 count like any other step", () => {
  const k = kennzahlen(ns("FA 25W", "WS 25/26", { "1.0": 5, "1.4": 10, "2.4": 10, "3.4": 5, "3.7": 5, "4.7": 5, "5.0": 5 }, 0, { notenbonus: 0.3 }));
  assert.equal(k.angetreten, 45);
  assert.equal(k.bestanden, 35);
  // 12 700 / 45 hundredths
  assert.ok(Math.abs(k.schnittGesamt! - 2.8222222) < 1e-6);
  assert.equal(k.schnittGesamt!.toFixed(2), "2.82");
  // 7 850 / 35 hundredths
  assert.ok(Math.abs(k.schnittBestanden! - 2.2428571) < 1e-6);
  assert.equal(k.schnittBestanden!.toFixed(2), "2.24");
  assert.ok(Math.abs(k.durchfallquote! - 10 / 45) < 1e-12);
  assert.equal((k.durchfallquote! * 100).toFixed(2), "22.22");
});

test("bonus steps are only shown when they have a count", () => {
  assert.deepEqual(sichtbareStufen({ "1.0": 1, "5.0": 1 }), [...STUFEN]);
  assert.deepEqual(sichtbareStufen({ "1.0": 1, "1.4": 0, "2.4": 0 }), [...STUFEN]);
  const mit = sichtbareStufen({ "1.4": 2, "3.4": 1 });
  assert.equal(mit.length, STUFEN.length + 2);
  assert.deepEqual(mit.slice(1, 4), ["1.3", "1.4", "1.7"]);
  assert.deepEqual(mit.slice(8, 11), ["3.3", "3.4", "3.7"]);
  assert.ok(!mit.includes("2.4"));
  // pooled: union of the steps
  const s = summiere([ns("A", "WS 24/25", { "1.0": 1 }, 0), ns("B", "WS 25/26", { "2.4": 3 }, 0, { notenbonus: 0.3 })]);
  assert.deepEqual(s.verteilung, { "1.0": 1, "2.4": 3 });
  assert.ok(sichtbareStufen(s.verteilung).includes("2.4"));
});

// Schema 1.2: any "x.y" step between 1,0 and 5,0.
const Z = ns("FA 26S", "SS 26", { "1.0": 14, "1.3": 5, "1.5": 4, "1.7": 5, "2.0": 3, "2.5": 2, "2.7": 2, "3.1": 2 }, 3);

test("intermediate steps 1,5 / 2,5 / 3,1 count like any other step", () => {
  const k = kennzahlen(Z);
  assert.equal(k.angetreten, 37);
  assert.equal(k.angemeldet, 40);
  assert.equal(k.bestanden, 37);
  assert.equal(k.durchfallquote, 0);
  // 5 760 / 37 hundredths = 1.5567…
  assert.ok(Math.abs(k.schnittGesamt! - 5760 / 3700) < 1e-12);
  assert.equal(k.schnittGesamt!.toFixed(2), "1.56");
  assert.equal(k.schnittBestanden!.toFixed(2), "1.56");
  // a step above 4,0 that is not a regular one is a fail
  const f = kennzahlen(ns("x", "SS 26", { "2.0": 3, "4.1": 1 }, 0));
  assert.equal(f.bestanden, 3);
  assert.equal(f.durchgefallen, 1);
});

test("intermediate steps are shown only with a count, in grade order", () => {
  const s = sichtbareStufen(Z.verteilung);
  assert.equal(s.length, STUFEN.length + 3);
  assert.deepEqual(s.slice(0, 4), ["1.0", "1.3", "1.5", "1.7"]);
  assert.deepEqual(s.slice(5, 9), ["2.3", "2.5", "2.7", "3.0"]);
  assert.deepEqual(s.slice(9, 11), ["3.1", "3.3"]);
  for (const st of STUFEN) assert.ok(s.includes(st), `regular step ${st} always shown`);
  assert.deepEqual(sichtbareStufen({ "1.0": 1, "1.5": 0, "3.1": 0 }), [...STUFEN]);
  // bonus and intermediate steps mixed, pooled over several exams
  const p = summiere([Z, ns("B", "WS 25/26", { "1.4": 2, "2.4": 1 }, 0, { notenbonus: 0.3 })]);
  const sp = sichtbareStufen(p.verteilung);
  assert.deepEqual(sp.slice(1, 5), ["1.3", "1.4", "1.5", "1.7"]);
  assert.deepEqual(sp.slice(6, 10), ["2.3", "2.4", "2.5", "2.7"]);
});
