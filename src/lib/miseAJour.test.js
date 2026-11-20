import assert from "node:assert/strict";
import test from "node:test";
import { pourcentage, texteProgression } from "./miseAJour.js";

test("mise à jour : progression affichée en Mo", () => {
  assert.equal(texteProgression(12.3 * 1024 * 1024, 24 * 1024 * 1024), "12,3 Mo sur 24,0 Mo");
  assert.equal(texteProgression(5 * 1024 * 1024, -1), "5,0 Mo");
});

test("mise à jour : pourcentage borné", () => {
  assert.equal(pourcentage(50, 200), 25);
  assert.equal(pourcentage(300, 200), 100);
  assert.equal(pourcentage(10, 0), null);
});
