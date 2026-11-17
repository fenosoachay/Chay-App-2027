import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { isValidPlaylistImageUrl, formatListenCount } from "./playlist.js";

test("requires a public HTTP image URL for a playlist cover", () => {
  assert.equal(isValidPlaylistImageUrl("https://cdn.example/playlist.jpg"), true);
  assert.equal(isValidPlaylistImageUrl("http://cdn.example/playlist.png"), true);
  assert.equal(isValidPlaylistImageUrl(""), false);
  assert.equal(isValidPlaylistImageUrl(null), false);
  assert.equal(isValidPlaylistImageUrl("blob:playlist-image"), false);
  assert.equal(isValidPlaylistImageUrl("data:image/jpeg;base64,abc"), false);
});

test("formatListenCount returns null when 0, falsy or negative", () => {
  assert.equal(formatListenCount(0), null);
  assert.equal(formatListenCount("0"), null);
  assert.equal(formatListenCount(null), null);
  assert.equal(formatListenCount(undefined), null);
  assert.equal(formatListenCount(-5), null);
  assert.equal(formatListenCount(NaN), null);
});

test("formatListenCount returns formatted string when > 0", () => {
  assert.equal(formatListenCount(1), "1 écoute");
  assert.equal(formatListenCount("1"), "1 écoute");
  assert.equal(formatListenCount(2), "2 écoutes");
  assert.equal(formatListenCount(42), "42 écoutes");
});
