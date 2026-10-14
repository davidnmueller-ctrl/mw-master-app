import { test } from "node:test";
import assert from "node:assert/strict";
import type { Belegung, SpielZeile } from "../types";
import { erreichteLeistungen, strukturCheck } from "./noten";
import { FALLBACK_REGELN as R } from "./shared";
import { alsLeistungen, ausPlan, modulCodeVon, offeneCpAuffuellen, spielErgebnis } from "./spiel";

let nextId = 1;
const B = (kategorie: string, cp: number, status: Belegung["status"], note: number | null = null): Belegung => ({
  id: nextId++,
  modulCode: null,
  titel: `${kategorie}-Modul`,
  cp,
  kategorie,
  unterbereich: null,
  semester: "WS 26/27",
  status,
  note100: note == null ? null : Math.round(note * 100),
  notiz: "",
  eigenerTermin: null,
  sortOrder: 0,
  createdAt: 0,
  updatedAt: 0,
});

const sumBy = (zeilen: SpielZeile[], kat: string) => zeilen.filter((z) => z.kategorie === kat).reduce((a, z) => a + z.cp, 0);

test("rows from the plan, without duplicates", () => {
  const bs = [B("K", 5, "bestanden", 1.0), B("K", 6, "geplant"), B("HP", 4, "angemeldet"), B("A", 5, "nicht_bestanden")];
  const rows = ausPlan(bs, []);
  assert.deepEqual(rows.map((r) => [r.kategorie, r.cp, r.quelle]), [["K", 6, "plan"], ["HP", 4, "plan"]]);
  assert.equal(ausPlan(bs, rows).length, 0);
});

test("rows from the plan remember their catalog module", () => {
  const b = { ...B("K", 5, "geplant"), modulCode: "XX0001" };
  const [z] = ausPlan([b], []);
  assert.equal(z.modulCode, "XX0001");
  assert.equal(modulCodeVon(z, []), "XX0001", "survives a deleted Belegung");
  const alt = { ...z, modulCode: undefined };
  assert.equal(modulCodeVon(alt, [b]), "XX0001", "older rows resolve via the Belegung");
  assert.equal(modulCodeVon({ ...alt, belegungId: undefined }, [b]), null);
});

test("fill open CP up to every target", () => {
  const echte = erreichteLeistungen([B("G", 5, "bestanden", 1.0), B("F", 5, "anerkannt", 1.5), B("UE", 2, "anerkannt")]);
  const rows = offeneCpAuffuellen(echte, [], R);
  assert.equal(sumBy(rows, "G"), 15); // 20 - 5
  assert.equal(sumBy(rows, "HP"), 8);
  assert.equal(sumBy(rows, "IE"), 6);
  assert.equal(sumBy(rows, "UE"), 3);
  assert.equal(sumBy(rows, "FP"), 11);
  assert.equal(sumBy(rows, "MA"), 30);
  // Mastermodule: 60 - (5 G + 5 F) - 15 G placeholders = 35 more, into K first
  assert.equal(sumBy(rows, "K"), 35);
  assert.ok(rows.every((r) => r.quelle === "platzhalter" && r.note100 == null));
  assert.ok(rows.filter((r) => r.kategorie === "HP").every((r) => r.cp === 4));
  // Everything together reaches 120 CP.
  const total = echte.reduce((a, l) => a + l.cp, 0) + rows.reduce((a, r) => a + r.cp, 0);
  assert.equal(total, 120);
  // Running it again adds nothing.
  assert.equal(offeneCpAuffuellen(echte, rows, R).length, 0);
});

test("placeholders fill the sub-area minimums first", () => {
  const rows = offeneCpAuffuellen([], [], R);
  const ue = rows.filter((r) => r.kategorie === "UE").map((r) => [r.unterbereich, r.cp]);
  assert.deepEqual(ue, [["UE-ETHIK", 3], ["UE-WEITERE", 2]]);
  const check = strukturCheck(alsLeistungen(rows), R);
  assert.ok(check.kategorien.every((k) => k.status !== "offen" && k.status !== "ueber"));
  assert.equal(check.gesamt.status, "ok");
});

test("rows from the plan keep the sub-area", () => {
  const b = { ...B("UE", 3, "geplant"), unterbereich: "UE-ETHIK" };
  assert.equal(ausPlan([b], [])[0].unterbereich, "UE-ETHIK");
});

test("group remainder respects category maximums", () => {
  const echte = erreichteLeistungen([B("K", 40, "bestanden", 2.0)]);
  const rows = offeneCpAuffuellen(echte, [], R);
  assert.equal(sumBy(rows, "K"), 0); // K is full (max 40)
  assert.equal(sumBy(rows, "G"), 20); // the minimum fills the rest of the 60
});

test("result: real grades plus assumed ones", () => {
  const bs = [B("K", 5, "bestanden", 1.0), B("K", 5, "geplant")];
  const zeilen: SpielZeile[] = [
    { id: "a", titel: "Thesis", kategorie: "MA", cp: 30, note100: 100, quelle: "manuell" },
    { id: "b", titel: "x", kategorie: "K", cp: 5, note100: 200, quelle: "plan" },
    { id: "c", titel: "y", kategorie: "K", cp: 5, note100: null, quelle: "platzhalter" },
    { id: "d", titel: "z", kategorie: "UE", cp: 3, note100: null, quelle: "platzhalter" },
  ];
  const r = spielErgebnis(bs, zeilen, R);
  // (1.0·5 + 1.0·30 + 2.0·5) / 40 = 1.125
  assert.equal(r.exakt100, 112);
  assert.equal(r.zeugnis10, 11);
  assert.equal(r.echteCp, 5);
  assert.equal(r.hypothetischeCp, 43);
  assert.equal(r.ohneNote, 1); // the UE row does not need a grade
});
