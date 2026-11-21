import assert from "node:assert/strict";
import test from "node:test";
import { adresseGrande, bornerEchelle, limiter, photoZoomable, zoomerAutour } from "./zoomPhoto.js";

test("zoom : bornes 1 à 5", () => {
  assert.equal(bornerEchelle(0.3), 1);
  assert.equal(bornerEchelle(9), 5);
  assert.equal(bornerEchelle(2), 2);
});

test("zoom autour du doigt : le point touché ne bouge pas", () => {
  const e = zoomerAutour({ s: 1, x: 0, y: 0 }, { x: 100, y: -50 }, 2);
  assert.deepEqual(e, { s: 2, x: -100, y: 50 });
  // le point (100,-50) de l'écran correspond au même point de la photo : (100 - x) / s = 100 / 1
  assert.equal((100 - e.x) / e.s, 100);
  assert.deepEqual(zoomerAutour(e, { x: 0, y: 0 }, 1), { s: 1, x: 0, y: 0 });
});

test("zoom : la photo agrandie ne sort pas du cadre", () => {
  // photo 400×300 dans un cadre 400×800, zoom ×2 -> 800×600 : 200 px de marge à gauche / droite, 0 en hauteur
  assert.deepEqual(limiter({ s: 2, x: 999, y: 999 }, 400, 300, 400, 800), { s: 2, x: 200, y: 0 });
  assert.deepEqual(limiter({ s: 1, x: 50, y: 50 }, 400, 300, 400, 800), { s: 1, x: 0, y: 0 });
});

test("photo en grande taille : sans ?thumb=", () => {
  assert.equal(adresseGrande("https://api.chay.fr/api/files/c/r/p.jpg?thumb=300x300&token=a"), "https://api.chay.fr/api/files/c/r/p.jpg?token=a");
  assert.equal(adresseGrande("https://x.fr/p.jpg"), "https://x.fr/p.jpg");
  assert.equal(adresseGrande("blob:abc"), "blob:abc");
});

test("quelles images s'ouvrent en grand", () => {
  const base = { interactif: false, curseur: "auto", largeur: 200, hauteur: 150, src: "https://x.fr/p.jpg" };
  assert.equal(photoZoomable(base), true);
  assert.equal(photoZoomable({ ...base, interactif: true }), false); // dans un bouton / lien
  assert.equal(photoZoomable({ ...base, curseur: "pointer" }), false); // déjà cliquable
  assert.equal(photoZoomable({ ...base, curseur: "zoom-in" }), false); // a sa propre visionneuse
  assert.equal(photoZoomable({ ...base, largeur: 16, hauteur: 16 }), false); // icône
  assert.equal(photoZoomable({ ...base, src: "" }), false);
});
