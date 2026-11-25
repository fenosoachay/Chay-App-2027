import test from "node:test";
import assert from "node:assert/strict";
import { FRONDE, NIVEAUX, auRepos, avancer, creerMonde, etoilesFronde, lancement, pointsFronde, tirer } from "./fronde.js";

test("1.3.32 : Chay Fronde — 20 niveaux qui tiennent debout tout seuls (aucune cible perdue sans tir)", () => {
  assert.equal(NIVEAUX.length, 20);
  for (let n = 0; n < NIVEAUX.length; n += 1) {
    const m = creerMonde(n, [{ url: "a.jpg", nom: "A" }]);
    const cibles = m.cibles.length;
    const blocs = m.blocs.length;
    for (let i = 0; i < 240; i += 1) avancer(m, 1 / 60);
    assert.equal(m.cibles.length, cibles, `niveau ${n + 1} : cible perdue`);
    assert.equal(m.blocs.length, blocs, `niveau ${n + 1} : bloc perdu`);
    assert.ok(m.cibles.every((c) => c.photo?.url === "a.jpg"));
  }
});

test("un tir droit renverse le niveau 1 ; tirage limité ; étoiles et points", () => {
  const m = creerMonde(0);
  for (let i = 0; i < 60; i += 1) avancer(m, 1 / 60);
  tirer(m, -95, 0);
  assert.equal(m.reste, NIVEAUX[0].pierres - 1);
  for (let i = 0; i < 400; i += 1) avancer(m, 1 / 60);
  assert.equal(m.cibles.length, 0);
  assert.ok(m.poufs.length >= 0);
  const v1 = lancement(-500, 0);
  const v2 = lancement(-95, 0);
  assert.deepEqual(v1, v2);
  assert.ok(FRONDE.x > 0 && typeof auRepos(m) === "boolean");
  assert.deepEqual([etoilesFronde(3), etoilesFronde(1), etoilesFronde(0)], [3, 2, 1]);
  assert.equal(pointsFronde(1, 3), 18);
  assert.equal(pointsFronde(0, 3), 0);
});
