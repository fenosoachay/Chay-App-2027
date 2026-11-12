import test from "node:test";
import assert from "node:assert/strict";
import { buildFavoriteAudioQueue } from "./favoriteAudioQueue.js";

test("file des favoris = ordre affiché (champ order choisi par le membre), favori touché sélectionné", () => {
  const { tracks, startIndex } = buildFavoriteAudioQueue([
    { id: "b2", track_id: "track-b", audio_url: "https://audio/b", playlist_order: 1, order: 1 },
    { id: "video", track_id: "video", audio_url: "https://audio/video", kind: "video" },
    { id: "a1", track_id: "track-a", audio_url: "https://audio/a", playlist_order: 0, order: 2 },
    { id: "b1", track_id: "track-b", audio_url: "https://audio/b", playlist_order: 1, order: 0 },
    { id: "sermon", track_id: "sermon", audio_url: "https://audio/sermon", category: "sermons" },
    { id: "missing", track_id: "missing", playlist_order: 0, order: 0 },
  ], "b2");

  // Avant : a1 d'abord (playlist_order = ordre d'ajout des playlists), quel que soit l'ordre choisi.
  assert.deepEqual(tracks.map((track) => track.queueId), ["b1", "b2", "a1"]);
  assert.equal(tracks[startIndex].queueId, "b2");
});

test("favorite audio queue returns no selection for a non-audio favorite", () => {
  const result = buildFavoriteAudioQueue([
    { id: "video", track_id: "video", audio_url: "https://audio/video", kind: "video" },
  ], "video");

  assert.deepEqual(result, { tracks: [], startIndex: -1 });
});
