import test from "node:test";
import assert from "node:assert/strict";
import { buildFavoriteAudioQueue } from "./favoriteAudioQueue.js";

test("favorite audio queue preserves playlist and track order and selects the clicked favorite", () => {
  const { tracks, startIndex } = buildFavoriteAudioQueue([
    { id: "b2", track_id: "track-b", audio_url: "https://audio/b", playlist_order: 1, order: 1 },
    { id: "video", track_id: "video", audio_url: "https://audio/video", kind: "video" },
    { id: "a1", track_id: "track-a", audio_url: "https://audio/a", playlist_order: 0, order: 1 },
    { id: "b1", track_id: "track-b", audio_url: "https://audio/b", playlist_order: 1, order: 0 },
    { id: "sermon", track_id: "sermon", audio_url: "https://audio/sermon", category: "sermons" },
    { id: "missing", track_id: "missing", playlist_order: 0, order: 0 },
  ], "b2");

  assert.deepEqual(tracks.map((track) => track.queueId), ["a1", "b1", "b2"]);
  assert.equal(tracks[startIndex].queueId, "b2");
});

test("favorite audio queue returns no selection for a non-audio favorite", () => {
  const result = buildFavoriteAudioQueue([
    { id: "video", track_id: "video", audio_url: "https://audio/video", kind: "video" },
  ], "video");

  assert.deepEqual(result, { tracks: [], startIndex: -1 });
});
