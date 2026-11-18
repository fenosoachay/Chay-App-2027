import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { playlistDe, sousPlaylistDe } from "../playlistsArbre.js";

const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("playlistDe : retrouve une playlist de premier niveau (sans parent_id) et une sous-playlist", () => {
  const arbre = [
    { id: "p1", name: "P1", parent_id: "", sous: [{ id: "s1", name: "S1", parent_id: "p1" }] }
  ];
  const liens = [
    { track_id: "t1", playlist_id: "p1" }, // playlist de premier niveau
    { track_id: "t2", playlist_id: "s1" }  // sous-playlist
  ];
  assert.equal(playlistDe("t1", liens, arbre), "p1");
  assert.equal(playlistDe("t2", liens, arbre), "s1");
  assert.equal(playlistDe("t3", liens, arbre), ""); // introuvable -> ""
  assert.equal(playlistDe("t1", [], arbre), ""); // sans liens
  assert.equal(playlistDe("t1", [{ track_id: "t1", playlist_id: "s1" }], [{ id: "p1", name: "P1", sous: [] }]), ""); // s1 n'est pas dans l'arbre
});

test("sousPlaylistDe : ne retourne que les sous-playlists (pour l'admin existant)", () => {
  const arbre = [
    { id: "p1", name: "P1", parent_id: "", sous: [{ id: "s1", name: "S1", parent_id: "p1" }] }
  ];
  const liens = [
    { track_id: "t1", playlist_id: "p1" }, // playlist de premier niveau
    { track_id: "t2", playlist_id: "s1" }  // sous-playlist
  ];
  assert.equal(sousPlaylistDe("t1", [], []), ""); // sans liens
  assert.equal(sousPlaylistDe("t1", [{ track_id: "t1", playlist_id: "p1" }], []), ""); // p1 n'est pas une sous-playlist
  assert.equal(sousPlaylistDe("t2", [{ track_id: "t2", playlist_id: "s1" }], [{ id: "p1", sous: [{ id: "s1", parent_id: "p1" }] }]), "s1");
  assert.equal(sousPlaylistDe("t2", [{ track_id: "t2", playlist_id: "s1" }], [{ id: "p1", sous: [] }]), ""); // s1 n'est pas une sous-playlist
});
