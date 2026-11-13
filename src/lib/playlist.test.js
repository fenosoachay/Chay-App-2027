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


// ── 1.3.9 : sous-playlists enregistrées pour de vrai ─────────────────────────────────────────────
import { champPerdu, schemaSansSousPlaylists, MESSAGE_SCHEMA_PLAYLISTS } from "./playlist.js";

test("sous-playlist : rattachement perdu détecté (champ parent_id absent du serveur)", () => {
  assert.equal(champPerdu({ parent_id: "p1", category: "articles" }, { id: "s", parent_id: "p1", category: "articles" }), null);
  assert.equal(champPerdu({ parent_id: "p1", category: "articles" }, { id: "s", category: "articles" }), "parent_id");
  assert.equal(champPerdu({ parent_id: "p1", category: "youtube" }, { id: "s", parent_id: "p1", category: "music" }), "category");
  assert.equal(champPerdu({ parent_id: "", category: "music" }, { id: "r", parent_id: null, category: "music" }), null);
  assert.equal(champPerdu({ parent_id: "", category: "music" }, { id: "r", category: "music" }), null); // racine : sans objet
  assert.equal(champPerdu({ parent_id: "p1" }, null), "parent_id");
  assert.match(MESSAGE_SCHEMA_PLAYLISTS, /migrer-playlists\.mjs/);
});

test("bandeau admin : schéma sans sous-playlists reconnu à l'absence de la clé parent_id", () => {
  assert.equal(schemaSansSousPlaylists([{ id: "a", name: "x" }, { id: "b" }]), true);
  assert.equal(schemaSansSousPlaylists([{ id: "a", parent_id: null }]), false);
  assert.equal(schemaSansSousPlaylists([]), false);
  const crud = fs.readFileSync(new URL("../components/admin/EntityCrud.jsx", import.meta.url), "utf8");
  assert.match(crud, /sousPlaylist && schemaSansSousPlaylists\(playlists\)/);
  const modal = fs.readFileSync(new URL("../components/media/CreatePlaylistModal.jsx", import.meta.url), "utf8");
  assert.match(modal, /const perdu = champPerdu\(playlistData, savedPlaylist\);/);
  assert.match(modal, /Playlist\.delete\(savedPlaylist\.id\)/);
});
