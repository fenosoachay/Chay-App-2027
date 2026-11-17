import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { appliquerOrdre, cleGalerie, cleYoutube, CLE_SECTIONS, nettoyerIds, ordresParCle } from "./ordreMedia.js";
import { changementsOrdre, enregistrerOrdreChamp } from "./ordreChamp.js";
import { nouvellesCollections } from "../../pocketbase/scripts/migrer-1-3-9.mjs";

const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
const L = (...ids) => ids.map((id) => ({ id }));

test("ordre de l'admin : appliqué, nouveaux contenus en tête (ou à la fin pour les sections)", () => {
  const items = L("n1", "a", "b", "c");
  assert.deepEqual(appliquerOrdre(items, ["c", "a", "b"]).map((x) => x.id), ["n1", "c", "a", "b"]);
  assert.deepEqual(appliquerOrdre(items, ["c", "a", "b"], { nouveauxEnTete: false }).map((x) => x.id), ["c", "a", "b", "n1"]);
  assert.deepEqual(appliquerOrdre(items, ["z", "b"]).map((x) => x.id), ["n1", "a", "c", "b"]);
  assert.equal(appliquerOrdre(items, []), items);
  assert.deepEqual(nettoyerIds(["a", "a", 3, "", "b", "x".repeat(65)]), ["a", "b"]);
});

test("clés et lecture des lignes MediaOrder", () => {
  assert.equal(CLE_SECTIONS, "sections");
  assert.equal(cleYoutube("louange"), "youtube:louange");
  assert.equal(cleGalerie("eglise"), "galerie:eglise");
  assert.equal(cleGalerie(null), "galerie:non-classees");
  const m = ordresParCle([{ key: "sections", ids: ["music", "radio"] }, { key: "Mauvaise Clé", ids: ["x"] }, { key: "youtube:culte", ids: null }]);
  assert.deepEqual([...m.keys()], ["sections", "youtube:culte"]);
  assert.deepEqual(m.get("youtube:culte"), []);
});

test("champ order (Actualité, Fonds d'écran) : seules les lignes déplacées sont réécrites", async () => {
  const liste = [{ id: "b", order: 1 }, { id: "a", order: 0 }, { id: "c", order: 2 }];
  assert.deepEqual(changementsOrdre(liste), [{ id: "b", order: 0 }, { id: "a", order: 1 }]);
  const ecrits = [];
  const res = await enregistrerOrdreChamp(liste, async (id, d) => ecrits.push([id, d.order]));
  assert.deepEqual(ecrits, [["b", 0], ["a", 1]]);
  assert.deepEqual(res.map((x) => [x.id, x.order]), [["b", 0], ["a", 1], ["c", 2]]);
  await assert.rejects(enregistrerOrdreChamp(liste, async () => { throw new Error("x"); }), /pas été enregistrée/);
});

test("écrans : cadenas admin et même glisser (ListeTriable) ; ordre YouTube partagé, Films non touché ; schéma", () => {
  const grille = lire("src/components/media/CategoryGrid.jsx");
  assert.match(grille, /enregistrerOrdreMedia\(CLE_SECTIONS/);
  assert.match(grille, /<ListeTriable/);
  const yt = lire("src/components/media/YouTubeCategoryView.jsx");
  assert.match(yt, /enregistrerOrdreMedia\(cleYoutube\(sec\), ids\)/);
  assert.doesNotMatch(yt, /update\("playlist_orders", sec, next\.map/); // gestion admin : plus dans les préférences perso
  assert.match(lire("src/components/media/MediaCategory.jsx"), /reordonnerGalerie\(gallerySection\)/);
  assert.match(lire("src/components/media/ActualiteChretienne.jsx"), /ChristianNews\.update\(id, d\)/);
  assert.match(lire("src/components/media/FondsEcran.jsx"), /<GalleryViewer/);
  assert.match(lire("src/components/media/NavigationPlaylists.jsx"), /Playlist\.update\(p\.id, \{ order: i \}\)/);
  assert.match(lire("src/components/media/BlocOrdonnable.jsx"), /<ListeTriable/);
  const [col] = nouvellesCollections();
  assert.equal(col.name, "MediaOrder");
  assert.equal(col.listRule, '@request.auth.id != ""');
  assert.equal(col.updateRule, '@request.auth.role = "admin"');
  assert.match(col.indexes[0], /UNIQUE INDEX .*\(`key`\)/);
});
