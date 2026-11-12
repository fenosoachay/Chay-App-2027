import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const chemin = (f) => new URL(`../../${f}`, import.meta.url);
const lire = (f) => fs.readFileSync(chemin(f), "utf8");
/** Largeur et hauteur d'un PNG (en-tête IHDR). */
const taillePng = (f) => {
  const b = fs.readFileSync(chemin(f));
  assert.equal(b.toString("ascii", 1, 4), "PNG", f);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};
const RES = "android/app/src/main/res";
const DENSITES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

test("Android : toutes les tailles (legacy, rond, adaptative fond + premier plan + monochrome, notification)", () => {
  for (const [d, k] of Object.entries(DENSITES)) {
    const l = Math.round(48 * k);
    const a = Math.round(108 * k);
    assert.deepEqual(taillePng(`${RES}/mipmap-${d}/ic_launcher.png`), [l, l]);
    assert.deepEqual(taillePng(`${RES}/mipmap-${d}/ic_launcher_round.png`), [l, l]);
    for (const c of ["foreground", "background", "monochrome"]) assert.deepEqual(taillePng(`${RES}/mipmap-${d}/ic_launcher_${c}.png`), [a, a]);
    const s = Math.round(24 * k);
    assert.deepEqual(taillePng(`${RES}/drawable-${d}/ic_stat_chay.png`), [s, s]);
  }
  for (const f of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
    const x = lire(`${RES}/mipmap-anydpi-v26/${f}`);
    assert.match(x, /<background android:drawable="@mipmap\/ic_launcher_background"\/>/);
    assert.match(x, /<foreground android:drawable="@mipmap\/ic_launcher_foreground"\/>/);
    assert.match(x, /<monochrome android:drawable="@mipmap\/ic_launcher_monochrome"\/>/);
  }
  assert.equal(fs.existsSync(chemin(`${RES}/drawable/ic_stat_chay.png`)), false); // ancienne icône 24 px retirée
  // Le nom sous l'icône reste « Chay ».
  assert.match(lire(`${RES}/values/strings.xml`), /<string name="title_activity_main">Chay<\/string>/);
});

test("site : manifeste (any + maskable), favicon, apple-touch-icon 180 px ; source ≥ 1024 px après agrandissement", () => {
  const m = JSON.parse(lire("public/manifest.json"));
  assert.deepEqual(m.icons.map((i) => [i.src, i.sizes, i.purpose]), [
    ["/branding/icon-192.png", "192x192", "any"],
    ["/branding/icon-512.png", "512x512", "any"],
    ["/branding/icon-maskable-512.png", "512x512", "maskable"],
  ]);
  assert.deepEqual(taillePng("public/branding/icon-192.png"), [192, 192]);
  assert.deepEqual(taillePng("public/branding/icon-512.png"), [512, 512]);
  assert.deepEqual(taillePng("public/branding/icon-maskable-512.png"), [512, 512]);
  assert.deepEqual(taillePng("public/branding/apple-touch-icon.png"), [180, 180]);
  const html = lire("index.html");
  assert.match(html, /<link rel="apple-touch-icon" href="\/branding\/apple-touch-icon.png" \/>/);
  assert.match(html, /<link rel="icon" href="\/favicon.ico" sizes="any" \/>/);
  assert.ok(fs.existsSync(chemin("public/favicon.ico")));
  assert.match(lire("scripts/generer-icones.py"), /TAILLE = 1024/);
  assert.match(lire("scripts/generer-icones.py"), /if im\.width < TAILLE:/);
});
