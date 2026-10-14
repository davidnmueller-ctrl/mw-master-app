import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Belegung, Manifest, Modul, PruefungsAnsicht, Status } from "../types";
import { DEFAULT_PRUEFUNGS_ANSICHT } from "../types";
import { ansichtsEintraege, erstesOffenesSemester, ersterMonat, liegtAm, semesterAuswahl, semesterEnde } from "./pruefungsansicht";
import { verarbeitePruefungen, zuLesendePruefungen } from "./pruefungsdaten";

// The invented example data in examples/shared (see the files for the dates).
const EX = join(import.meta.dirname, "../../examples/shared");
const module: Modul[] = readdirSync(join(EX, "module")).map((f) => JSON.parse(readFileSync(join(EX, "module", f), "utf-8")));
const manifest: Manifest = JSON.parse(readFileSync(join(EX, "manifest.json"), "utf-8"));
const files = zuLesendePruefungen(manifest, {}).map((e) => ({ name: e.datei, content: readFileSync(join(EX, e.datei), "utf-8") }));
const cache = verarbeitePruefungen(manifest, { files, errors: [] }, {}, module, "jetzt").cache;

let nextId = 1;
const belegung = (code: string, semester = "WS 26/27", status: Status = "geplant"): Belegung => ({
  id: nextId++,
  modulCode: code,
  titel: code,
  cp: 5,
  kategorie: "K",
  unterbereich: null,
  semester,
  status,
  note100: null,
  notiz: "",
  eigenerTermin: null,
  sortOrder: 0,
  createdAt: 0,
  updatedAt: 0,
});

const plan = [belegung("XX0001"), belegung("XX0002", "WS 26/27", "idee"), belegung("XX0006", "SS 27")];
const ansicht = (f: Partial<PruefungsAnsicht>) => ({ ...DEFAULT_PRUEFUNGS_ANSICHT, ...f });
const zeige = (f: Partial<PruefungsAnsicht>, gelb = 2) =>
  ansichtsEintraege(ansicht(f), "WS 26/27", plan, module, cache, gelb).eintraege.map(
    (e) => `${e.code} ${e.termin.datum ?? "-"}${e.termin.herkunft === "schaetzung" ? "≈" : ""}${e.imPlan ? " P" : ""}`,
  );

test("semester choice: plan semesters and semesters with exam data", () => {
  assert.deepEqual(semesterAuswahl(["WS 26/27", "SS 27", "vor", "ohne"], cache), ["WS 25/26", "SS 26", "WS 26/27", "SS 27"]);
});

test("first plan semester that is not over (WS until 31.03., SS until 30.09.)", () => {
  assert.equal(semesterEnde("WS 26/27"), "2027-03-31");
  assert.equal(semesterEnde("SS 27"), "2027-09-30");
  const s = ["SS 27", "WS 26/27", "ohne"];
  assert.equal(erstesOffenesSemester(s, "2026-10-14"), "WS 26/27");
  assert.equal(erstesOffenesSemester(s, "2027-03-31"), "WS 26/27");
  assert.equal(erstesOffenesSemester(s, "2027-04-01"), "SS 27");
  assert.equal(erstesOffenesSemester(s, "2030-01-01"), "SS 27");
  assert.equal(erstesOffenesSemester(["ohne"], "2026-10-14"), null);
});

test("my plan: Belegungen of the semester, estimates included, conflicts with each other", () => {
  const r = ansichtsEintraege(ansicht({ grundlage: "plan" }), "WS 26/27", plan, module, cache, 2);
  assert.deepEqual(
    r.eintraege.map((e) => `${e.code} ${e.termin.datum}`),
    ["XX0002 2027-02-12", "XX0001 2027-02-12", "XX0002 2027-02-26"],
  );
  assert.equal(r.konflikte.length, 1);
  assert.deepEqual([r.konflikte[0].stufe, r.konflikte[0].moeglich], ["orange", true]);
  assert.deepEqual(r.eintraege[1].konflikt, { stufe: "orange", moeglich: true });
  assert.equal(r.eintraege[1].termin.vorbehaltlich, true);
  assert.equal(zeige({ grundlage: "plan", schaetzungen: false }).join("|"), "XX0001 2027-02-12 P");
});

test("all catalog modules: repeat exams hidden by default, unknown codes never shown", () => {
  assert.deepEqual(zeige({ grundlage: "alle" }), [
    "XX0004 2027-02-10",
    "XX0002 2027-02-12≈ P",
    "XX0001 2027-02-12 P",
    "XX0005 2027-02-15",
    "XX0004 2027-02-22",
    "XX0002 2027-02-26≈ P",
    "XX0007 -",
  ]);
  const mitWdh = zeige({ grundlage: "alle", wiederholungen: true });
  assert.ok(mitWdh.includes("XX0003 2027-03-01"));
  assert.ok(!mitWdh.some((z) => z.startsWith("XX9999")));
});

test("filters: topics (OR), category, Turnus; the plan stays unless 'Mein Plan immer' is off", () => {
  assert.deepEqual(zeige({ grundlage: "alle", tags: ["luftraum", "ethik"] }), [
    "XX0004 2027-02-10",
    "XX0002 2027-02-12≈ P",
    "XX0001 2027-02-12 P",
    "XX0004 2027-02-22",
    "XX0002 2027-02-26≈ P",
    "XX0007 -",
  ]);
  assert.deepEqual(zeige({ grundlage: "alle", tags: ["luftraum"], planImmer: false }), ["XX0004 2027-02-10", "XX0004 2027-02-22"]);
  assert.deepEqual(zeige({ grundlage: "alle", kategorien: ["HP"], planImmer: false }), ["XX0005 2027-02-15"]);
  // Turnus WS matches WS and WS+SS; SS modules with a repeat exam in the WS are out.
  assert.deepEqual(zeige({ grundlage: "alle", turnus: "WS", wiederholungen: true, planImmer: false }), [
    "XX0004 2027-02-10",
    "XX0002 2027-02-12≈ P",
    "XX0001 2027-02-12 P",
    "XX0005 2027-02-15",
    "XX0004 2027-02-22",
    "XX0002 2027-02-26≈ P",
    "XX0007 -",
  ]);
  // In "Mein Plan" the filters apply to the plan itself.
  assert.deepEqual(zeige({ grundlage: "plan", tags: ["cfd"] }), ["XX0002 2027-02-12≈ P", "XX0002 2027-02-26≈ P"]);
});

test("only conflict-free: hides modules outside the plan that would conflict (any level, possible too)", () => {
  // Yellow limit 3: XX0005 (15.–17.02.) is three days after XX0001 (12.02.).
  const r = ansichtsEintraege(ansicht({ grundlage: "alle" }), "WS 26/27", plan, module, cache, 3);
  assert.deepEqual(r.eintraege.find((e) => e.code === "XX0005")!.konflikt, { stufe: "gelb", moeglich: false });
  // XX0004 can dodge to the group on 22.02.
  assert.equal(r.eintraege.find((e) => e.code === "XX0004")!.konflikt, null);

  assert.deepEqual(zeige({ grundlage: "alle", nurKonfliktfrei: true }, 3), [
    "XX0004 2027-02-10",
    "XX0002 2027-02-12≈ P",
    "XX0001 2027-02-12 P",
    "XX0004 2027-02-22",
    "XX0002 2027-02-26≈ P",
    "XX0007 -",
  ]);
});

test("first month with a date, days of multi-day exams", () => {
  const r = ansichtsEintraege(ansicht({ grundlage: "alle" }), "WS 26/27", plan, module, cache, 2);
  assert.equal(ersterMonat(r.eintraege), "2027-02");
  assert.equal(ersterMonat([]), null);
  const block = r.eintraege.find((e) => e.code === "XX0005")!.termin;
  assert.deepEqual(["2027-02-14", "2027-02-15", "2027-02-17", "2027-02-18"].map((d) => liegtAm(block, d)), [false, true, true, false]);
});
