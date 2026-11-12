import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { cleFile, filePlaylist, reordonnerFile } from "./fileLecture.js";
import { buildFavoriteAudioQueue } from "./favoriteAudioQueue.js";
import { groupMusicFavorites } from "./favoritePlaylists.js";
import { appliquerOrdre, deplacer } from "./glisserOrdre.js";

const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
const fav = (id, order) => ({ id, track_id: `t-${id}`, title: id, audio_url: `https://a/${id}.mp3`, category: "music", order });

test("Votre Playlist : la file suit exactement l'ordre affiché (FavoritesView)", () => {
  const playlist = [fav("ajout1", 2), fav("ajout2", 0), fav("ajout3", 1)];
  const affiche = groupMusicFavorites(playlist)[0].items.map((i) => i.id);
  const { tracks } = buildFavoriteAudioQueue(playlist, "ajout3");
  assert.deepEqual(tracks.map((t) => t.queueId), affiche);
  assert.deepEqual(affiche, ["ajout2", "ajout3", "ajout1"]);
});

test("réordonner pendant la lecture : même titre (même objet), suivant/précédent selon le nouvel ordre", () => {
  const playlist = [fav("a", 0), fav("b", 1), fav("c", 2), fav("d", 3)];
  const { tracks } = buildFavoriteAudioQueue(playlist, "b");
  const etat = { queue: tracks, order: [0, 1, 2, 3], orderIndex: 1, currentTrack: tracks[1], shuffle: false };
  // Le membre glisse « d » en tête pendant que « b » joue.
  const affiche = groupMusicFavorites(playlist)[0].items;
  const nouveau = appliquerOrdre(playlist, deplacer(affiche, 3, 0), "order");
  const r = reordonnerFile(etat, buildFavoriteAudioQueue(nouveau, null).tracks);
  assert.deepEqual(r.queue.map(cleFile), ["d", "a", "b", "c"]);
  assert.equal(r.queue[r.order[r.orderIndex]], etat.currentTrack); // titre en cours inchangé : pas de relance
  assert.equal(cleFile(r.queue[r.order[r.orderIndex + 1]]), "c"); // suivant
  assert.equal(cleFile(r.queue[r.order[r.orderIndex - 1]]), "a"); // précédent
});

test("aléatoire : la séquence tirée est gardée ; autre liste en cours : file intacte", () => {
  const q = ["a", "b", "c"].map((id) => ({ id, audio_url: `https://a/${id}` }));
  const etat = { queue: q, order: [2, 0, 1], orderIndex: 1, currentTrack: q[0], shuffle: true };
  const r = reordonnerFile(etat, [q[1], q[2], q[0]]);
  assert.deepEqual(r.order.map((i) => r.queue[i].id), ["c", "a", "b"]);
  assert.equal(r.queue[r.order[r.orderIndex]], q[0]);
  assert.equal(reordonnerFile(etat, [{ id: "x", audio_url: "u" }, q[1], q[2]]), null);
  assert.equal(reordonnerFile({ ...etat, currentTrack: null }, q), null);
});

test("playlists admin (Musique, Prédication) : file dans l'ordre affiché, réordonnée pendant la lecture", () => {
  const pistes = [
    { id: "pt1", track_id: "s1", title: "1", audio_url: "https://a/1", order: 0 },
    { id: "pt2", track_id: "s2", title: "2", order: 1 }, // sans audio : hors file, comme à l'affichage
    { id: "pt3", track_id: "s3", title: "3", audio_url: "https://a/3", order: 2 },
  ];
  const file = filePlaylist(pistes, "sermons");
  assert.deepEqual(file.map((t) => t.id), ["s1", "s3"]);
  assert.equal(file[0].mediaType, "sermons");
  const etat = { queue: file, order: [0, 1], orderIndex: 0, currentTrack: file[0], shuffle: false };
  const r = reordonnerFile(etat, filePlaylist([pistes[2], pistes[1], pistes[0]], "sermons"));
  assert.deepEqual(r.queue.map((t) => t.id), ["s3", "s1"]);
  assert.equal(r.orderIndex, 1);
  assert.equal(r.queue[1], etat.currentTrack);
  const vue = lire("src/components/media/PlaylistCategoryView.jsx");
  assert.match(vue, /playQueue\(filePlaylist\(tracks, category\), i\)/);
  assert.match(vue, /if \(!isVideo\) reorderQueue\(filePlaylist\(next, category\)\)/);
});

test("lecteur : un changement de file ne relance pas le titre ; ExoPlayer réordonné sans interruption", () => {
  const ctx = lire("src/lib/AudioPlayerContext.jsx");
  assert.match(ctx, /\}, \[currentTrack, isNativeAndroidPlayer\]\);/); // plus de dépendance à queue / order
  assert.doesNotMatch(ctx, /\}, \[currentTrack, isNativeAndroidPlayer, order, orderIndex, queue\]\);/);
  assert.match(ctx, /reorderAndroidExoPlayerQueue\(order\.map\(\(i\) => cleFile\(queue\[i\]\)\)/);
  assert.match(ctx, /reorderQueue,\r?\n/);
  assert.match(lire("src/pages/Media.jsx"), /reorderQueue\(buildFavoriteAudioQueue\(reordonnee, null\)\.tracks\)/);
  const java = fs.readFileSync(new URL("../../android/app/src/main/java/io/chay/app/AndroidExoPlayerPlugin.java", import.meta.url), "utf8");
  assert.match(java, /public void reorderQueue\(PluginCall call\)/);
  assert.match(java, /mediaController\.moveMediaItem\(trouve, cible\)/);
  assert.doesNotMatch(java.slice(java.indexOf("public void reorderQueue"), java.indexOf("public void setRepeatMode")), /setMediaItems|prepare\(\)/);
});
