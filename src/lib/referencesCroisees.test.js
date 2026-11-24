import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { OSIS_LIVRES, libelleReference, lireReference, referencesDe, referencesDeVersets, textePassage } from "./referencesCroisees.js";

const nom = (b) => ({ 43: "Jean", 45: "Romains", 62: "1 Jean", 40: "Matthieu", 41: "Marc" }[b] || `L${b}`);

test("références croisées : 66 livres, lecture des références", () => {
  assert.equal(OSIS_LIVRES.length, 66);
  assert.equal(OSIS_LIVRES[42], "John");
  assert.deepEqual(lireReference("45.5.8"), { b: 45, c: 5, v: 8, b2: 45, c2: 5, v2: 8 });
  assert.deepEqual(lireReference("62.4.9-62.4.10"), { b: 62, c: 4, v: 9, b2: 62, c2: 4, v2: 10 });
  assert.equal(lireReference("67.1.1"), null);
  assert.equal(lireReference("45.x.8"), null);
});

test("références croisées : libellés et texte d'un passage", () => {
  assert.equal(libelleReference(lireReference("45.5.8"), nom), "Romains 5:8");
  assert.equal(libelleReference(lireReference("62.4.9-62.4.10"), nom), "1 Jean 4:9-10");
  assert.equal(libelleReference(lireReference("40.5.3-40.6.2"), nom), "Matthieu 5:3–6:2");
  assert.equal(libelleReference(lireReference("40.28.20-41.1.1"), nom), "Matthieu 28:20 – Marc 1:1");
  const ch = [{ number: 8, text: "A" }, { number: 9, text: "B" }, { number: 10, text: "C" }, { number: 11, text: "D" }];
  assert.equal(textePassage(ch, lireReference("62.4.9-62.4.10")), "B C");
  assert.equal(textePassage(ch, lireReference("62.4.30")), "");
});

test("références croisées : plusieurs versets réunis, sans doublon ni versets choisis", () => {
  const d = { "3.16": "45.5.8|43.3.17|62.4.9-62.4.10", "3.17": "45.5.8|43.3.16|45.8.32" };
  assert.equal(referencesDe(d, 3, 16).length, 3);
  assert.deepEqual(referencesDe(d, 3, 99), []);
  const r = referencesDeVersets(d, 43, 3, [16, 17]).map((x) => `${x.b}.${x.c}.${x.v}`);
  assert.deepEqual(r, ["45.5.8", "62.4.9", "45.8.32"]);
});

test("données : un fichier par livre, Jean 3:16 renvoie Romains 5:8 en premier", () => {
  const d = JSON.parse(fs.readFileSync(new URL("../../public/data/references/43.json", import.meta.url), "utf8"));
  assert.equal(referencesDe(d, 3, 16)[0].b, 45);
  for (let b = 1; b <= 66; b += 1) assert.ok(fs.existsSync(new URL(`../../public/data/references/${b}.json`, import.meta.url)), `livre ${b}`);
});
