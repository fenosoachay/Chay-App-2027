import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ecrireMemoireMedia, lireMemoireMedia, viderMemoireMedia } from "./mediaMemoire.js";

// Code seul (commentaires retirés) : un commentaire peut citer l'ancien code.
const lire = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("visionneuse : pas de key={i} sur la photo (plus de remontage à l'opacité 0), double tampon", () => {
  const v = lire("../components/media/GalleryViewer.jsx");
  assert.doesNotMatch(v, /key=\{i\}/);
  assert.match(v, /const visibleSrc = isLoaded \? displaySrc : shownSrc;/);
  assert.match(v, /data-gallery-preload="true"/);
  assert.doesNotMatch(v, /animate=\{isLoaded \?/); // la photo affichée ne repasse jamais à l'opacité 0
});

test("page Multimédia : données de la visite précédente affichées tout de suite (pas d'écran de chargement)", () => {
  const m = lire("../pages/Media.jsx");
  assert.match(m, /useState\(\(\) => !memoire\)/);
  assert.match(m, /ecrireMemoireMedia\(user\?\.id/);
});

test("mémoire Multimédia : liée au compte, jamais les données d'un autre membre", () => {
  viderMemoireMedia();
  assert.equal(lireMemoireMedia("u1"), null);
  ecrireMemoireMedia("u1", { gallery: [1] });
  assert.deepEqual(lireMemoireMedia("u1"), { gallery: [1] });
  assert.equal(lireMemoireMedia("u2"), null);
  assert.equal(lireMemoireMedia(null), null);
  ecrireMemoireMedia(null, { gallery: [2] });
  assert.equal(lireMemoireMedia("u1"), null);
});
