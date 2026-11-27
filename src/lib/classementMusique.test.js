import test from "node:test";
import assert from "node:assert/strict";
import { classerMusiques, rangees, texteEcoutes } from "./classementMusique.js";

const playlists = [
  { id: "p1", category: "music", cover_url: "https://x/p1.jpg" },
  { id: "p2", category: "music", parent_id: "p1" },
  { id: "s1", category: "sermons" },
];
const piste = (o) => ({ audio_url: "https://x/a.mp3", ...o });

test("classées par écoutes, un titre en double compté une fois (le plus grand compteur)", () => {
  const c = classerMusiques(playlists, [
    piste({ playlist_id: "p1", track_id: "a", title: "A", listen_count: 5 }),
    piste({ playlist_id: "p2", track_id: "a", title: "A", listen_count: 9 }),
    piste({ playlist_id: "p2", track_id: "b", title: "B", listen_count: 12 }),
    piste({ playlist_id: "p1", track_id: "c", title: "C" }),
  ]);
  assert.deepEqual(c.map((t) => [t.track_id, t.ecoutes, t.rang]), [["b", 12, 1], ["a", 9, 2], ["c", 0, 3]]);
});

test("seulement Musique (pas les prédications), seulement les titres audio", () => {
  const c = classerMusiques(playlists, [
    piste({ playlist_id: "s1", track_id: "x", title: "Prédication", listen_count: 99 }),
    { playlist_id: "p1", track_id: "v", title: "Vidéo", video_url: "https://x/v.mp4", listen_count: 50 },
    piste({ playlist_id: "p1", track_id: "a", title: "A", listen_count: 1 }),
  ]);
  assert.deepEqual(c.map((t) => t.track_id), ["a"]);
});

test("égalité : ordre alphabétique ; pochette de la playlist en secours", () => {
  const c = classerMusiques(playlists, [
    piste({ playlist_id: "p1", track_id: "z", title: "Zèbre", listen_count: 3 }),
    piste({ playlist_id: "p1", track_id: "e", title: "Étoile", listen_count: 3 }),
  ]);
  assert.deepEqual(c.map((t) => t.title), ["Étoile", "Zèbre"]);
  assert.equal(c[0].cover_url, "https://x/p1.jpg");
});

test("rangées de 5 jusqu'à épuisement, et écoutes lisibles", () => {
  assert.deepEqual(rangees([1, 2, 3, 4, 5, 6, 7]).map((r) => r.length), [5, 2]);
  assert.equal(texteEcoutes(1), "1 écoute");
  assert.equal(texteEcoutes(0), "0 écoute");
  assert.match(texteEcoutes(1520), /^1\s520 écoutes$/);
});
