import assert from "node:assert/strict";
import test from "node:test";
import { affichageDe, estVerticale } from "./affichagePlaylist.js";

test("affichage des playlists vidéo : réglage de l'admin d'abord", () => {
  assert.equal(estVerticale({ name: "Film chrétien", affichage: "vertical" }), true);
  assert.equal(estVerticale({ name: "Drôle", affichage: "film" }), false);
});

test("affichage des playlists vidéo : anciennes playlists sans réglage", () => {
  assert.equal(estVerticale({ name: "Drôle." }), true);
  assert.equal(estVerticale({ name: "MINDSET" }), true);
  assert.equal(estVerticale({ name: "Mind set" }), true);
  assert.equal(estVerticale({ name: "À voir" }), false);
  assert.equal(estVerticale(null), false);
  assert.equal(affichageDe({ name: "Mindset" }), "vertical");
  assert.equal(affichageDe({ name: "Film chrétien" }), "film");
});
