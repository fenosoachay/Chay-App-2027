import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { coupsMinimum, course, deplacer, etoiles, gagne, grille, lireNiveau, progresApres, TAILLE } from "./voiture.js";

const NIVEAUX = JSON.parse(fs.readFileSync(new URL("../data/niveauxVoiture.json", import.meta.url), "utf8"));

test("1.3.30 : 30 niveaux valides, de plus en plus difficiles, chacun faisable en `coups` déplacements", () => {
  assert.equal(NIVEAUX.length, 30);
  let avant = 0;
  for (const [i, n] of NIVEAUX.entries()) {
    const vs = lireNiveau(n);
    assert.ok(vs[0].rouge && vs[0].h && vs[0].r === 2, `niveau ${i + 1} : voiture rouge horizontale sur la 3e ligne`);
    const cases = vs.reduce((t, v) => t + v.l, 0);
    assert.equal(grille(vs).filter((x) => x !== -1).length, cases, `niveau ${i + 1} : véhicules qui se chevauchent`);
    assert.ok(vs.every((v) => v.r >= 0 && v.c >= 0 && (v.h ? v.c + v.l <= TAILLE : v.r + v.l <= TAILLE)));
    assert.equal(coupsMinimum(vs), n.coups, `niveau ${i + 1}`);
    assert.ok(n.coups >= avant, `niveau ${i + 1} : jamais plus facile que le précédent`);
    avant = n.coups;
  }
});

test("glisser : borné par les autres véhicules et le bord ; gagné quand la rouge touche la sortie", () => {
  const vs = lireNiveau({ v: [[2, 0, 2, 1], [1, 3, 3, 0]] });
  assert.deepEqual(course(vs, 0), { min: 0, max: 1 });
  assert.deepEqual(course(vs, 1), { min: -1, max: 2 });
  assert.equal(deplacer(vs, 0, 5)[0].c, 1); // arrêtée par le camion
  let n = deplacer(vs, 1, -1); // le camion monte : il bloque encore la ligne de sortie
  assert.equal(n[1].r, 0);
  assert.equal(deplacer(n, 0, 9)[0].c, 1);
  n = deplacer(n, 1, 3); // il descend tout en bas : la voie est libre
  assert.equal(n[1].r, 3);
  assert.equal(gagne(n), false);
  n = deplacer(n, 0, 9);
  assert.equal(n[0].c, 4);
  assert.equal(gagne(n), true);
});

test("étoiles et progrès de l'enfant (le niveau suivant s'ouvre, les meilleures étoiles restent)", () => {
  assert.equal(etoiles(5, 5), 3);
  assert.equal(etoiles(9, 5), 2);
  assert.equal(etoiles(11, 5), 1);
  let p = progresApres(undefined, 1, 2, 30);
  assert.deepEqual(p, { niveau: 2, etoiles: { 1: 2 } });
  p = progresApres(p, 1, 1, 30);
  assert.deepEqual(p, { niveau: 2, etoiles: { 1: 2 } });
  assert.equal(progresApres({ niveau: 30, etoiles: {} }, 30, 3, 30).niveau, 30);
});
