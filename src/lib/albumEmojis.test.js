import test from "node:test";
import assert from "node:assert/strict";
import { ajouterAuAlbum, decouverts, personnages } from "./albumEmojis.js";

test("1.3.31 : album Émojis — personnages uniques et triés, ajout une seule fois, compte des découverts", () => {
  const liste = personnages([
    { answer: "Moïse", emojis: "🧺🌊" }, { answer: "David", emojis: "🐑👑" }, { answer: "Moïse", emojis: "🔥📜" }, { answer: "" },
  ]);
  assert.deepEqual(liste.map((p) => p.nom), ["David", "Moïse"]);
  assert.equal(liste[1].emojis, "🧺🌊");
  let r = ajouterAuAlbum({}, "David", "2026-11-25");
  assert.equal(r.nouveau, true);
  r = ajouterAuAlbum(r.trouves, "David", "2026-11-26");
  assert.equal(r.nouveau, false);
  assert.equal(r.trouves.David, "2026-11-25");
  assert.equal(decouverts(r.trouves, liste), 1);
  assert.equal(decouverts({ David: "x", Inconnu: "y" }, liste), 1);
});
