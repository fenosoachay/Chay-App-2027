import assert from "node:assert/strict";
import test from "node:test";
import { pourcentage, texteProgression } from "./miseAJour.js";

test("mise à jour : progression affichée en Mo", () => {
  assert.equal(texteProgression(12.3e6, 24e6), "12,3 Mo sur 24,0 Mo");
  assert.equal(texteProgression(5e6, -1), "5,0 Mo");
  // APK de 28 191 811 octets : 28,2 Mo, comme sur le téléphone (et non 26,9).
  assert.equal(texteProgression(28191811, 28191811), "28,2 Mo sur 28,2 Mo");
});

test("mise à jour : pourcentage borné", () => {
  assert.equal(pourcentage(50, 200), 25);
  assert.equal(pourcentage(300, 200), 100);
  assert.equal(pourcentage(10, 0), null);
});
