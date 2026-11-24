import test from "node:test";
import assert from "node:assert/strict";
import { arrondirCoord, creerCompteur, notePositionEnvoyee, oublierPositionDuJour, positionAEnvoyer, sectionDe } from "./suiviActivite.js";

test("section d'une adresse de l'app", () => {
  assert.equal(sectionDe("/"), "accueil");
  assert.equal(sectionDe("/media"), "media");
  assert.equal(sectionDe("/quiz/play/facile"), "jeux");
  assert.equal(sectionDe("/word-scramble"), "jeux");
  assert.equal(sectionDe("/profile/abc"), "communaute");
  assert.equal(sectionDe("/eglise/vision"), "eglise");
  assert.equal(sectionDe("/admin/site-visites"), "admin");
  assert.equal(sectionDe("/inconnue"), null);
});

test("position arrondie à ~5 km", () => {
  assert.equal(arrondirCoord(48.8566), 48.85);
  assert.equal(arrondirCoord(-18.8792), -18.9);
  assert.equal(arrondirCoord("x"), null);
});

test("compteur : temps visible seulement, vidé après un envoi réussi", () => {
  let t = 0;
  const c = creerCompteur(() => t);
  c.visible(true);
  c.page("/");
  c.page("/bible");
  c.page("/bible");
  t = 50_000;
  assert.deepEqual(c.lire(), { secondes: 50, sections: { accueil: 1, bible: 2 } });
  c.visible(false); // écran éteint : le temps ne compte plus
  t = 500_000;
  const envoi = c.lire();
  assert.deepEqual(envoi, { secondes: 50, sections: { accueil: 1, bible: 2 } });
  c.page("/media"); // pendant l'envoi
  c.confirmer(envoi);
  assert.deepEqual(c.lire(), { secondes: 0, sections: { media: 1 } });
  // Plafond 120 s par envoi ; le reste part au suivant
  c.visible(true);
  t += 200_000;
  const e2 = c.lire();
  assert.equal(e2.secondes, 120);
  c.confirmer(e2);
  assert.equal(c.lire().secondes, 80);
});

test("position : une fois par jour, oubliée quand le réglage change", () => {
  const m = new Map();
  const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  assert.equal(positionAEnvoyer("2026-11-24", st), true);
  notePositionEnvoyee("2026-11-24", st);
  assert.equal(positionAEnvoyer("2026-11-24", st), false);
  assert.equal(positionAEnvoyer("2026-11-25", st), true);
  oublierPositionDuJour(st);
  assert.equal(positionAEnvoyer("2026-11-24", st), true);
});
