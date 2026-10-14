import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Manifest, SharedRead } from "../types";
import { berichtAusCache, verarbeitePruefungen, zuLesendePruefungen } from "./pruefungsdaten";
import { pruefe } from "./shared";

const EX = join(import.meta.dirname, "../../examples/shared");
const JETZT = "2026-10-14T20:00:00.000Z";
const manifest = (): Manifest => JSON.parse(readFileSync(join(EX, "manifest.json"), "utf-8"));
const module = readdirSync(join(EX, "module")).map((f) => ({ code: f.replace(".json", "") }));

function lies(names: string[]): Pick<SharedRead, "files" | "errors"> {
  return { files: names.map((name) => ({ name, content: readFileSync(join(EX, name), "utf-8") })), errors: [] };
}
const alle = (m: Manifest) => lies(zuLesendePruefungen(m, {}).map((e) => e.datei));

test("example exam files validate; unknown codes are reported", () => {
  const m = manifest();
  assert.equal(pruefe("manifest", JSON.stringify(m)).ok, true);
  const r = verarbeitePruefungen(m, alle(m), {}, module, JETZT);
  assert.deepEqual(Object.keys(r.cache), ["WS 25/26", "SS 26", "WS 26/27"]);
  assert.deepEqual(r.bericht.map((b) => b.zustand), ["neu", "neu", "neu"]);
  const ws = r.bericht.find((b) => b.semester === "WS 26/27")!;
  assert.deepEqual(ws.unbekannteCodes, ["XX9999"]);
  assert.equal(ws.anzahl, 6);
  assert.equal(ws.stand, "2026-10-14");
  assert.equal(r.warnungen.length, 1);
  assert.match(r.warnungen[0], /WS26-27\.json: 1 Eintrag mit unbekanntem Code übersprungen \(XX9999\)/);
  assert.equal(r.cache["SS 26"].gelesenAm, JETZT);
  assert.equal(r.geaendert, true);
});

test("only files with a changed updatedAt are read again", () => {
  const m = manifest();
  const first = verarbeitePruefungen(m, alle(m), {}, module, JETZT).cache;
  assert.deepEqual(zuLesendePruefungen(m, first), []);

  const m2: Manifest = {
    ...m,
    pruefungen: m.pruefungen!.map((e) => (e.semester === "SS 26" ? { ...e, updatedAt: "2026-10-20T10:00:00+02:00" } : e)),
  };
  const zuLesen = zuLesendePruefungen(m2, first);
  assert.deepEqual(zuLesen.map((e) => e.datei), ["pruefungen/SS26.json"]);
  const r = verarbeitePruefungen(m2, lies(zuLesen.map((e) => e.datei)), first, module, "später");
  assert.deepEqual(r.bericht.map((b) => b.zustand), ["unveraendert", "neu", "unveraendert"]);
  assert.equal(r.cache["SS 26"].gelesenAm, "später");
  assert.equal(r.cache["SS 26"].updatedAt, "2026-10-20T10:00:00+02:00");
  assert.equal(r.cache["WS 25/26"].gelesenAm, JETZT);
});

test("a broken exam file keeps the cached semester and is read again next time", () => {
  const m = manifest();
  const first = verarbeitePruefungen(m, alle(m), {}, module, JETZT).cache;
  const m2: Manifest = { ...m, pruefungen: m.pruefungen!.map((e) => ({ ...e, updatedAt: "neu" })) };
  const read = lies(zuLesendePruefungen(m2, first).map((e) => e.datei));
  read.files = read.files.map((f) => (f.name === "pruefungen/SS26.json" ? { ...f, content: "{ halb" } : f));
  read.files = read.files.filter((f) => f.name !== "pruefungen/WS25-26.json");
  read.errors.push({ name: "pruefungen/WS25-26.json", error: "cloud-only" });

  const r = verarbeitePruefungen(m2, read, first, module, "später");
  assert.deepEqual(r.bericht.map((b) => b.zustand), ["fehler", "fehler", "neu"]);
  assert.equal(r.cache["SS 26"], first["SS 26"]);
  assert.equal(r.cache["WS 25/26"], first["WS 25/26"]);
  assert.match(r.warnungen.join("\n"), /SS26\.json: kein gültiges JSON.*alte Version bleibt/);
  assert.match(r.warnungen.join("\n"), /WS25-26\.json: nicht lesbar \(cloud-only\)/);
  // Kept versions still carry the old updatedAt, so they are requested again.
  assert.deepEqual(
    zuLesendePruefungen(m2, r.cache).map((e) => e.semester),
    ["WS 25/26", "SS 26"],
  );
});

test("invalid file without cache is skipped; semester mismatch is an error", () => {
  const m = manifest();
  const read = alle(m);
  read.files = read.files.map((f) =>
    f.name === "pruefungen/SS26.json"
      ? { ...f, content: JSON.stringify({ semester: "SS 26", stand: "2026-10-01", termine: [{ id: "x", code: "XX0001" }] }) }
      : f.name === "pruefungen/WS25-26.json"
        ? { ...f, content: JSON.stringify({ semester: "WS 24/25", stand: "2026-10-01", termine: [] }) }
        : f,
  );
  const r = verarbeitePruefungen(m, read, {}, module, JETZT);
  assert.deepEqual(Object.keys(r.cache), ["WS 26/27"]);
  assert.match(r.warnungen.join("\n"), /SS26\.json: .*übersprungen/);
  assert.match(r.warnungen.join("\n"), /WS25-26\.json: enthält WS 24\/25, laut manifest\.json WS 25\/26/);
});

test("data without manifest.pruefungen (schema 1.2) has no exam data and no warnings", () => {
  const m = { ...manifest(), schemaVersion: "1.2", pruefungen: undefined };
  assert.equal(pruefe("manifest", JSON.stringify(m)).ok, true);
  assert.deepEqual(zuLesendePruefungen(m, {}), []);
  const r = verarbeitePruefungen(m, { files: [], errors: [] }, {}, module, JETZT);
  assert.deepEqual(r.cache, {});
  assert.deepEqual(r.bericht, []);
  assert.deepEqual(r.warnungen, []);
  assert.equal(r.geaendert, false);

  // A semester that disappears from the manifest is dropped from the cache.
  const full = manifest();
  const cache = verarbeitePruefungen(full, alle(full), {}, module, JETZT).cache;
  const weniger = { ...full, pruefungen: full.pruefungen!.slice(1) };
  const r2 = verarbeitePruefungen(weniger, { files: [], errors: [] }, cache, module, JETZT);
  assert.deepEqual(Object.keys(r2.cache), ["SS 26", "WS 26/27"]);
  assert.equal(r2.geaendert, true);
});

test("duplicate ids warn; manifest entries outside pruefungen/ do not validate", () => {
  const m = manifest();
  const read = alle(m);
  const ss = JSON.parse(read.files.find((f) => f.name === "pruefungen/SS26.json")!.content);
  ss.termine[1].id = ss.termine[0].id;
  read.files = read.files.map((f) => (f.name === "pruefungen/SS26.json" ? { ...f, content: JSON.stringify(ss) } : f));
  const r = verarbeitePruefungen(m, read, {}, module, JETZT);
  assert.match(r.warnungen.join("\n"), /SS26\.json: id mehrfach vergeben \(XX0001-2026S-1\)/);
  assert.equal(r.cache["SS 26"].termine.length, 4);

  const bad = { ...m, pruefungen: [{ semester: "SS 26", datei: "../geheim.json", updatedAt: "2026-10-14" }] };
  assert.equal(pruefe("manifest", JSON.stringify(bad)).ok, false);
});

test("report from cache", () => {
  const m = manifest();
  const cache = verarbeitePruefungen(m, alle(m), {}, module, JETZT).cache;
  const b = berichtAusCache(cache, module);
  assert.deepEqual(b.map((z) => [z.semester, z.anzahl, z.zustand]), [
    ["WS 25/26", 5, "unveraendert"],
    ["SS 26", 4, "unveraendert"],
    ["WS 26/27", 6, "unveraendert"],
  ]);
});
