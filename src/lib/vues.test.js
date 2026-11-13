import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { compteurDe, creerSuiviMoitie, formatVues, noterCompteur, cleVue, LECTURE_MIN_MS } from "./vues.js";
import { filePlaylist } from "./fileLecture.js";
import { buildFavoriteAudioQueue } from "./favoriteAudioQueue.js";

const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("format discret façon YouTube", () => {
  assert.equal(formatVues(0), null);
  assert.equal(formatVues(1), "1 vue");
  assert.equal(formatVues(845), "845 vues");
  assert.equal(formatVues(1234), "1,2 k vues");
  assert.equal(formatVues(1000), "1 k vues");
  assert.equal(formatVues(2_560_000, "écoute"), "2,5 M écoutes");
});

test("vidéo / audio : une seule vue, à la moitié, par ouverture ; nouvelle ouverture = réarmé", () => {
  const vues = [];
  const suivre = creerSuiviMoitie((v) => vues.push(v.id));
  const v = { type: "piste", id: "t1" };
  assert.equal(suivre("o1", v, 10, 0), false); // durée inconnue
  assert.equal(suivre("o1", v, 49, 100), false);
  assert.equal(suivre("o1", v, 50, 100), true);
  assert.equal(suivre("o1", v, 90, 100), false); // déjà comptée : pas de doublon
  assert.equal(suivre("o1", v, 60, 100), false); // retour en arrière dans la même ouverture
  assert.equal(suivre("o2", v, 70, 100), true); // nouvelle ouverture (relance)
  assert.equal(suivre("o2", { type: "youtube", id: "y" }, 1, 100), false);
  assert.equal(suivre("o2", null, 99, 100), false);
  assert.deepEqual(vues, ["t1", "t1"]);
});

test("compteur renvoyé par le serveur prioritaire (jamais en dessous de l'enregistrement)", () => {
  const v = { type: "article", id: "a1" };
  assert.equal(compteurDe(v, 4), 4);
  noterCompteur(v, 9);
  assert.equal(compteurDe(v, 4), 9);
  assert.equal(compteurDe(v, 12), 12);
  assert.equal(cleVue({ type: "pirate", id: "x" }), null);
});

test("chaque lecteur porte son identifiant de vue ; articles et actualités : 2 minutes", () => {
  assert.deepEqual(filePlaylist([{ track_id: "t", audio_url: "u", playlist_id: "p" }], "music")[0].vue, { type: "piste", id: "t" });
  const fav = buildFavoriteAudioQueue([{ id: "f", track_id: "t", audio_url: "u", category: "music" }], "f").tracks[0];
  assert.deepEqual(fav.vue, { type: "piste", id: "t" });
  assert.match(lire("src/components/media/YouTubeCategoryView.jsx"), /vue: \{ type: "youtube", id: item\.id \}/);
  assert.match(lire("src/components/player/VideoPlayer.jsx"), /vue: item\?\.vue \|\| null/);
  assert.match(lire("src/components/media/PlaylistCategoryView.jsx"), /vue: \{ type: "piste", id: track\.track_id \}/);
  assert.match(lire("src/components/media/ArticleCard.jsx"), /useLectureMinimale\(vue, open\)/);
  assert.match(lire("src/components/media/ActualiteChretienne.jsx"), /useLectureMinimale\(ouverte \? \{ type: "actualite"/);
  assert.match(lire("src/components/Layout.jsx"), /useCompteurVues\(\);/);
  assert.equal(LECTURE_MIN_MS, 120000);
});
