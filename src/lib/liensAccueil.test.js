import test from "node:test";
import assert from "node:assert/strict";
import { LIENS_PAR_DEFAUT, liensAffiches } from "./liensAccueil.js";
import { dureeLisible } from "./statsApp.js";
import { rangOrdre, liensDe } from "./playlistsArbre.js";

test("liens de l'accueil : ordre de l'admin, https seulement, icône connue", () => {
  const l = liensAffiches([
    { label: "YouTube", url: "https://youtube.com/@x", icone: "youtube", order: 2 },
    { label: "Piège", url: "javascript:alert(1)", icone: "site", order: 0 },
    { label: "Site", url: "https://www.chay.fr/", icone: "bizarre", order: 1 },
    { label: "", url: "https://x", icone: "site", order: 0 },
  ]);
  assert.deepEqual(l, [
    { label: "Site", url: "https://www.chay.fr/", icone: "site" },
    { label: "YouTube", url: "https://youtube.com/@x", icone: "youtube" },
  ]);
  assert.equal(liensAffiches(null), LIENS_PAR_DEFAUT);
  assert.ok(LIENS_PAR_DEFAUT.every((x) => x.url.startsWith("https://")));
});

test("durée lisible", () => {
  assert.equal(dureeLisible(0), "—");
  assert.equal(dureeLisible(45), "45 s");
  assert.equal(dureeLisible(754), "12 min 34 s");
  assert.equal(dureeLisible(600), "10 min");
  assert.equal(dureeLisible(3720), "1 h 2 min");
});

test("playlists : contenus ajoutés en tête (le plus récent d'abord), puis l'ordre choisi à la main", () => {
  const liens = [
    { playlist_id: "p", track_id: "rang1", order: 1 },
    { playlist_id: "p", track_id: "ancien", order: 1_700_000_000_000 },
    { playlist_id: "p", track_id: "rang0", order: 0 },
    { playlist_id: "p", track_id: "recent", order: 1_795_000_000_000 },
    { playlist_id: "p", track_id: "sans" },
    { playlist_id: "autre", track_id: "x", order: 0 },
  ];
  assert.deepEqual(liensDe("p", liens).map((t) => t.track_id), ["recent", "ancien", "rang0", "rang1", "sans"]);
  assert.equal(rangOrdre(""), Number.MAX_SAFE_INTEGER);
});
