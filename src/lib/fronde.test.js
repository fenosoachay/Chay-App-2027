import test from "node:test";
import assert from "node:assert/strict";
import {
  DECORS, FRONDE, NIVEAUX, TYPES_PIERRE, auRepos, avancer, creerMonde, decorNiveau, etoilesFronde, formePierre, lancement, pierreSuivante,
  pointsFronde, pretATirer, tirer,
} from "./fronde.js";

test("1.3.34 : Chay Fronde — 60 niveaux qui tiennent debout tout seuls (aucune cible perdue sans tir)", () => {
  assert.equal(NIVEAUX.length, 60);
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
  assert.equal(m.reste, NIVEAUX[0].pierres.length - 1);
  for (let i = 0; i < 400; i += 1) avancer(m, 1 / 60);
  assert.equal(m.cibles.length, 0);
  assert.ok(m.poufs.length >= 0);
  const v1 = lancement(-500, 0);
  const v2 = lancement(-95, 0);
  assert.deepEqual(v1, v2);
  assert.ok(FRONDE.x > 0 && typeof auRepos(m) === "boolean");
  assert.deepEqual([etoilesFronde(3), etoilesFronde(1), etoilesFronde(0)], [3, 2, 1]);
  assert.equal(pointsFronde(1, 3), 18);
  assert.equal(pointsFronde(60, 3), 195);
  assert.equal(pointsFronde(61, 3), 0);
  assert.equal(pointsFronde(0, 3), 0);
});

test("1.3.34 : pierres imposées par le niveau, formes et tailles différentes", () => {
  const m = creerMonde(5);
  assert.deepEqual(m.file, ["rocher", "galet", "caillou", "galet"]);
  assert.equal(pierreSuivante(m), "rocher");
  tirer(m, -90, 10);
  assert.equal(m.pierres[0].type, "rocher");
  assert.equal(m.pierres[0].r, TYPES_PIERRE.rocher.r);
  assert.equal(pierreSuivante(m), "galet");
  // Plus petit = plus rapide ; plus gros = plus lent.
  assert.ok(lancement(-90, 0, "caillou").vx > lancement(-90, 0, "galet").vx);
  assert.ok(lancement(-90, 0, "rocher").vx < lancement(-90, 0, "galet").vx);
  assert.ok(TYPES_PIERRE.silex.bois > TYPES_PIERRE.galet.bois && TYPES_PIERRE.rocher.pierre > TYPES_PIERRE.galet.pierre);
  assert.equal(formePierre("silex", 3)[0], 1.45);
  assert.deepEqual(formePierre("galet", 4), formePierre("galet", 4));
  for (const n of [9, 30, 59]) assert.ok(NIVEAUX[n].pierres.every((p) => TYPES_PIERRE[p]), `niveau ${n + 1}`);
});

test("1.3.34 : la pierre suivante n'attend plus que tout le décor soit immobile", () => {
  const m = creerMonde(15);
  tirer(m, -95, 20);
  let t = 0;
  while (!pretATirer(m, t) && t < 5) { avancer(m, 1 / 60); t += 1 / 60; }
  assert.ok(t <= 2.45, `prête après ${t.toFixed(2)} s`);
  assert.ok(t >= 0.7);
});

test("1.3.34 : décors variés (changent tous les 3 niveaux)", () => {
  assert.equal(decorNiveau(0), "jour");
  assert.equal(decorNiveau(3), "foret");
  assert.equal(new Set(NIVEAUX.map((_, n) => decorNiveau(n))).size, DECORS.length);
});
