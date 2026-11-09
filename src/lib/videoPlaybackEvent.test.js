import test from "node:test";
import assert from "node:assert/strict";
import { isActiveVideoEvent, videoQueueId } from "./videoPlaybackEvent.js";

// Identifiants RÉELS : registerMediaControl / publishMediaControl créent des Symbol (src/lib/mediaControl.js).
// Des identifiants en texte avaient fait rater le plantage `video:${symbole}` de l'APK.
const SOURCE = "https://media.chay.fr/videos/2026/11/x-essai.mp4";
const filmActif = () => ({ id: Symbol("video"), type: "video", source: SOURCE });
const evt = (over = {}) => ({ mediaType: "video", queueId: "", source: "", currentTime: 12, duration: 225, ...over });

test("videoQueueId avec un Symbol : aucune exception, texte stable, unique par contrôle", () => {
  const a = Symbol("video");
  const b = Symbol("video");
  assert.doesNotThrow(() => videoQueueId(a));
  assert.match(videoQueueId(a), /^video:\d+$/);
  assert.equal(videoQueueId(a), videoQueueId(a));
  assert.notEqual(videoQueueId(a), videoQueueId(b));
});

test("isActiveVideoEvent ne lève jamais d'exception avec un Symbol", () => {
  const film = filmActif();
  assert.doesNotThrow(() => isActiveVideoEvent(evt({ queueId: videoQueueId(film.id) }), film));
  assert.doesNotThrow(() => isActiveVideoEvent(evt(), film));
});

test("bon queueId et source VIDE (session média Android) -> accepté", () => {
  const film = filmActif();
  assert.equal(isActiveVideoEvent(evt({ queueId: videoQueueId(film.id) }), film), true);
});

test("mediaType « audio » (défaut du plugin) mais queueId de la vidéo active -> accepté", () => {
  const film = filmActif();
  assert.equal(isActiveVideoEvent(evt({ mediaType: "audio", queueId: videoQueueId(film.id) }), film), true);
});

test("événement audio avec un autre queueId (piste audio) -> refusé", () => {
  const film = filmActif();
  assert.equal(isActiveVideoEvent(evt({ mediaType: "audio", queueId: "piste-42" }), film), false);
  assert.equal(isActiveVideoEvent(evt({ mediaType: "audio", queueId: "https://media.chay.fr/chant.mp3", source: "https://media.chay.fr/chant.mp3" }), film), false);
});

test("queueId d'une autre vidéo -> refusé (même avec une source vide)", () => {
  const film = filmActif();
  const autre = Symbol("video");
  assert.equal(isActiveVideoEvent(evt({ queueId: videoQueueId(autre) }), film), false);
  assert.equal(isActiveVideoEvent(evt({ mediaType: "audio", queueId: videoQueueId(autre) }), film), false);
});

test("repli sur la source : même adresse et mediaType « video » -> accepté ; type audio -> refusé", () => {
  const film = filmActif();
  assert.equal(isActiveVideoEvent(evt({ source: SOURCE }), film), true);
  assert.equal(isActiveVideoEvent(evt({ mediaType: "audio", source: SOURCE }), film), false);
  assert.equal(isActiveVideoEvent(evt({ source: "https://media.chay.fr/autre.mp4" }), film), false);
  assert.equal(isActiveVideoEvent(evt(), { ...film, source: "" }), false);
});

test("contrôle actif non vidéo, ou absent -> refusé", () => {
  const film = filmActif();
  assert.equal(isActiveVideoEvent(evt({ queueId: videoQueueId(film.id) }), { ...film, type: "audio" }), false);
  assert.equal(isActiveVideoEvent(evt({ queueId: videoQueueId(film.id) }), null), false);
  assert.equal(isActiveVideoEvent(null, film), false);
});
