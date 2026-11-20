import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLE_TAILLE_POLICE, TAILLES_POLICE, appliquerTaillePolice, enregistrerTaillePolice, lireTaillePolice, normaliserTaille } from "./taillePolice.js";

const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
const faux = () => {
  const m = new Map();
  const html = { style: {}, dataset: {} };
  return { storage: { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }, doc: { documentElement: html }, html, m };
};

test("100 % à 150 % par paliers de 5 %, enregistré sur l'appareil, appliqué à la racine", () => {
  assert.deepEqual(TAILLES_POLICE, [100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150]);
  assert.equal(normaliserTaille("135"), 135);
  assert.equal(normaliserTaille(175), 150);
  assert.equal(normaliserTaille(90), 100);
  const f = faux();
  assert.equal(lireTaillePolice(f.storage), 100);
  assert.equal(enregistrerTaillePolice(150, f.storage, f.doc), 150);
  assert.equal(f.m.get(CLE_TAILLE_POLICE), "150");
  assert.equal(f.html.style.fontSize, "calc(var(--chay-base, 16px) * 1.5)");
  assert.equal(f.html.dataset.police, "150");
  assert.ok("policeGrande" in f.html.dataset);
  appliquerTaillePolice(125, f.doc);
  assert.equal(f.html.style.fontSize, "calc(var(--chay-base, 16px) * 1.25)");
  assert.equal("policeGrande" in f.html.dataset, false);
  appliquerTaillePolice(100, f.doc);
  assert.equal(f.html.style.fontSize, "");
  assert.equal(lireTaillePolice({ getItem: () => { throw new Error("bloqué"); } }), 100);
});

test("avant le premier rendu (index.html) et réglage dans Paramètres > Affichage", () => {
  const html = lire("index.html");
  assert.match(html, /localStorage\.getItem\("chay-taille-police"\)/);
  assert.match(html, /t = t >= 150 \? 150 : Math\.round\(t \/ 5\) \* 5;/);
  assert.match(html, /if \(t >= 150\) h\.setAttribute\("data-police-grande", ""\);/);
  const d = lire("src/components/settings/DisplaySection.jsx");
  assert.match(d, /Taille du texte/);
  assert.match(d, /onChange=\{\(e\) => setTaille\(enregistrerTaillePolice\(e\.target\.value\)\)\}/);
  assert.match(d, /step=\{5\}/);
  assert.match(d, /aria-pressed=\{value === o\}/);
});

test("utilisable à 200 % : plus de tailles de texte en px, titres et rangées qui passent à la ligne, barres d'icônes plafonnées", () => {
  const fichiers = [];
  const parcourir = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) parcourir(p);
      else if (/\.(jsx?|css)$/.test(e.name) && !e.name.includes(".test.")) fichiers.push(p);
    }
  };
  parcourir(fileURLToPath(new URL("..", import.meta.url)));
  const enPx = fichiers.filter((f) => /text-\[\d+px\]/.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(enPx, []);
  const css = lire("src/index.css");
  assert.match(css, /html\[data-police-grande\] h1,/);
  assert.match(css, /html\[data-police-grande\] \.flex:not\(\.flex-col\):not\(\[data-barre-icones\]\) \{\s*flex-wrap: wrap;/);
  assert.match(css, /> \.flex-1 \{\s*min-width: min\(60vw, 100%\);/);
  assert.match(css, /width: clamp\(40px, 11vw, 56px\);/);
  assert.equal((lire("src/components/Layout.jsx").match(/data-barre-icones className=/g) || []).length, 3);
});
