import assert from "node:assert/strict";
import test from "node:test";
import { estPortrait, formatDuree } from "./infosVideo.js";

test("format de la vidéo : 9:16 portrait, 16:9 paysage", () => {
  assert.equal(estPortrait(1080, 1920), true);
  assert.equal(estPortrait(1920, 1080), false);
  assert.equal(estPortrait(1080, 1080), false); // carré : lecteur film
  assert.equal(estPortrait(0, 0), false); // inconnu : lecteur film
});

test("durée sous l'affiche", () => {
  assert.equal(formatDuree(6480), "108m");
  assert.equal(formatDuree(245), "4m");
  assert.equal(formatDuree(45.4), "45s");
  assert.equal(formatDuree(0), "");
  assert.equal(formatDuree(Infinity), "");
});
