import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { COTE_MIN, cadreInitial, deplacerCadre, redimensionnerCadre, sourceDuCadre, tailleAffichage } from "./cadreCarre.js";

const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
const dans = (c, W, H) => c.x >= 0 && c.y >= 0 && c.x + c.c <= W && c.y + c.c <= H;

test("cadre carré : départ centré, déplacement borné à l'image", () => {
  const c = cadreInitial(300, 200);
  assert.deepEqual(c, { x: 60, y: 10, c: 180 });
  assert.deepEqual(deplacerCadre(c, 1000, -1000, 300, 200), { x: 120, y: 0, c: 180 });
  assert.deepEqual(deplacerCadre(c, -15, 5, 300, 200), { x: 45, y: 15, c: 180 });
});

test("redimensionnement par chaque coin : reste carré, coin opposé fixe, dans l'image, côté minimal", () => {
  const W = 300; const H = 200;
  const c = { x: 100, y: 50, c: 100 };
  const bd = redimensionnerCadre(c, "bd", 30, 10, W, H);
  assert.deepEqual(bd, { x: 100, y: 50, c: 130 }); // le plus grand déplacement l'emporte
  const hg = redimensionnerCadre(c, "hg", -40, -10, W, H);
  assert.deepEqual(hg, { x: 60, y: 10, c: 140 }); // coin bas-droite (200,150) fixe
  const trop = redimensionnerCadre(c, "bd", 500, 500, W, H);
  assert.equal(trop.c, 150); // limité par le bas de l'image
  const petit = redimensionnerCadre(c, "hd", -500, 500, W, H);
  assert.equal(petit.c, COTE_MIN);
  for (const coin of ["hg", "hd", "bg", "bd"]) {
    for (const [dx, dy] of [[-999, -999], [999, 999], [37, -12], [-5, 80]]) {
      const r = redimensionnerCadre(c, coin, dx, dy, W, H);
      assert.ok(dans(r, W, H), `${coin} ${dx},${dy}`);
    }
  }
});

test("zone source dans l'image réelle : carrée, à la bonne échelle", () => {
  const natural = { w: 3000, h: 2000 };
  const { dispW, dispH } = tailleAffichage(natural, 300, 340);
  assert.deepEqual([dispW, dispH], [300, 200]);
  const s = sourceDuCadre({ x: 60, y: 10, c: 180 }, dispW, natural);
  assert.deepEqual(s, { sx: 600, sy: 100, sW: 1800, sH: 1800 });
  assert.equal(s.sW, s.sH);
});

test("photo de profil : uniquement par le cadre carré, aucune option « garder l'original »", () => {
  const r = lire("src/components/settings/RognageCarre.jsx");
  assert.match(r, /renderCropToBlob\(image, sourceDuCadre\(cadre, taille\.dispW, taille\.natural\), 1\)/);
  assert.doesNotMatch(r, /allowOriginal|confirmOriginal|onConfirm\?\.\(file/);
  assert.match(r, /Rogner et enregistrer/);
  assert.match(r, /touch-none/);
  const a = lire("src/components/settings/AccountSection.jsx");
  assert.match(a, /<RognageCarre/);
  assert.doesNotMatch(a, /<ImageCrop/);
  assert.equal(fs.existsSync(new URL("../components/SettingsModal.jsx", import.meta.url)), false); // envoi sans rognage retiré
});
