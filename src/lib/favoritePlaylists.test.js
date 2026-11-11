import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { groupMusicFavorites } from "./favoritePlaylists.js";
import { appliquerOrdre, deplacer } from "./glisserOrdre.js";

// Depuis d2a99761, tous les favoris musicaux sont réunis dans UN groupe « Favoris », triés par `order`.
test("réunit les favoris musicaux de toutes les playlists dans « Favoris », triés par order (vidéos exclues)", () => {
  const groups = groupMusicFavorites([
    { id: "b2", category: "music", source_playlist_id: "b", order: 2 },
    { id: "a1", category: "music", source_playlist_id: "a", order: 0 },
    { id: "b1", category: "music", source_playlist_id: "b", order: 1 },
    { id: "film", category: "films", kind: "video", source_playlist_id: "c" },
  ]);
  assert.deepEqual(groups.map((group) => group.id), ["all-favorites"]);
  assert.deepEqual(groups[0].items.map((item) => item.id), ["a1", "b1", "b2"]);
});

test("anciens favoris sans playlist d'origine ni order : ordre d'arrivée conservé", () => {
  const groups = groupMusicFavorites([
    { id: "1", category: "music", title: "First" },
    { id: "2", category: "music", title: "Second" },
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].items.map((item) => item.id), ["1", "2"]);
});

test("régression Android : déplacer un titre d'une autre playlist d'origine change bien l'ordre affiché", () => {
  // Avant : seuls les titres dont source_playlist_id === "all-favorites" recevaient leur rang -> aucun.
  const items = [
    { id: "a1", category: "music", source_playlist_id: "a", order: 0 },
    { id: "b1", category: "music", source_playlist_id: "b", order: 0 },
    { id: "x", category: "music", order: 1 },
  ];
  const affiche = groupMusicFavorites(items)[0].items;
  const nouvelOrdre = deplacer(affiche, 2, 0);
  const apres = groupMusicFavorites(appliquerOrdre(items, nouvelOrdre, "order"))[0].items;
  assert.deepEqual(apres.map((i) => i.id), nouvelOrdre.map((i) => i.id));
  assert.equal(apres[0].id, "x");
});

test("FavoritesView / Media : glisser par pointeur (touch-action none), boutons monter / descendre, mise à jour par id", () => {
  const src = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  const vue = src("../components/media/FavoritesView.jsx");
  const hook = src("../hooks/useDragSort.js");
  const media = src("../pages/Media.jsx");
  assert.doesNotMatch(vue, /onTouchStart|onMouseDown/);
  assert.match(vue, /\{\.\.\.drag\.poignee\(index\)\}/);
  assert.match(vue, /aria-label=\{`Monter \$\{label\}`\}/);
  assert.match(vue, /aria-label=\{`Descendre \$\{label\}`\}/);
  assert.match(vue, /appliquerOrdre\(items, nextItems, "order"\)/);
  assert.match(hook, /touchAction: "none"/);
  assert.match(hook, /setPointerCapture/);
  assert.match(hook, /onPointerCancel: terminer/);
  assert.doesNotMatch(media, /key === sourcePlaylistId/);
  assert.match(media, /orders\.has\(item\.id\)/);
  assert.match(media, /nextTrackOrder = playlist\.reduce/);
});
