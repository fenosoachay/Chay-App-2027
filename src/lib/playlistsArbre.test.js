import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  SECTIONS_RANGEES, arbrePlaylists, contenusDe, contenusNonRanges, exigeSousPlaylist, idsSousPlaylists,
  optionsSousPlaylists, optionsPlaylistEtSousPlaylists, sousPlaylistDe,
} from "./playlistsArbre.js";
import { champsMigres, CATEGORIES } from "../../pocketbase/scripts/migrer-playlists.mjs";

const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");

const PLAYLISTS = [
  { id: "charisma", name: "Charisma", category: "music", order: 1 },
  { id: "adoration", name: "Adoration", category: "music", order: 0 },
  { id: "c-live", name: "Live", category: "music", parent_id: "charisma", order: 1 },
  { id: "c-studio", name: "Studio", category: "music", parent_id: "charisma", order: 0 },
  { id: "orpheline", name: "Orpheline", category: "music", parent_id: "inconnue" },
  { id: "yt", name: "Cultes 2026", category: "youtube" },
  { id: "yt-jan", name: "Janvier", category: "youtube", parent_id: "yt" },
  { id: "x-sous-autre-section", name: "X", category: "youtube", parent_id: "charisma" },
];

test("arbre : un seul niveau, trié par order ; sous-playlists orphelines ou d'une autre section ignorées", () => {
  const a = arbrePlaylists(PLAYLISTS, "music");
  assert.deepEqual(a.map((p) => p.id), ["adoration", "charisma"]);
  assert.deepEqual(a[1].sous.map((s) => s.id), ["c-studio", "c-live"]);
  assert.deepEqual(a[0].sous, []);
  assert.deepEqual(arbrePlaylists(PLAYLISTS, "youtube")[0].sous.map((s) => s.id), ["yt-jan"]);
  assert.deepEqual(optionsSousPlaylists(a), [
    { value: "c-studio", label: "Charisma › Studio" },
    { value: "c-live", label: "Charisma › Live" },
  ]);
  assert.deepEqual([...idsSousPlaylists(a)], ["c-studio", "c-live"]);
});

test("rangement : un contenu est rangé seulement dans une SOUS-playlist de sa section", () => {
  const a = arbrePlaylists(PLAYLISTS, "music");
  const liens = [
    { id: "l1", playlist_id: "c-live", track_id: "t1", order: 1 },
    { id: "l2", playlist_id: "charisma", track_id: "t2" }, // ancien rangement : playlist de premier niveau
    { id: "l3", playlist_id: "c-live", track_id: "t3", order: 0 },
  ];
  const titres = [{ id: "t1" }, { id: "t2" }, { id: "t3" }, { id: "t4" }];
  assert.deepEqual(contenusNonRanges(titres, liens, a).map((t) => t.id), ["t2", "t4"]);
  assert.deepEqual(contenusDe("c-live", liens, titres).map((t) => t.id), ["t3", "t1"]); // ordre des liens
  assert.equal(sousPlaylistDe("t1", liens, a), "c-live"); // pré-rempli en modification
  assert.equal(sousPlaylistDe("t2", liens, a), ""); // à choisir
  // Aucune playlist : tout est « non classé » et reste affiché comme avant.
  assert.equal(contenusNonRanges(titres, liens, []).length, 4);
});

test("sections concernées : Musique, Prédication, YouTube, Articles, Galerie (Films inchangé)", () => {
  assert.deepEqual(SECTIONS_RANGEES.map((s) => s.entite), ["MusicTrack", "Sermon", "YouTubeVideo", "Article", "GalleryImage"]);
  assert.equal(exigeSousPlaylist("Video"), false);
  const sections = lire("src/components/admin/adminSections.js");
  for (const [cle, champ] of [["Article", "cover_url"], ["YouTubeVideo", "thumbnail_url"], ["GalleryImage", "image_url"]]) {
    const bloc = sections.slice(sections.indexOf(`key: "${cle}"`), sections.indexOf("key:", sections.indexOf(`key: "${cle}"`) + 5));
    assert.match(bloc, /showPlaylist: true/, cle);
    assert.match(bloc, new RegExp(`playlistField: "${champ}"`), cle);
  }
  assert.match(sections, /\{ value: "youtube", label: "YouTube" \}, \{ value: "articles", label: "Articles" \}, \{ value: "gallery", label: "Galerie" \}/);
});

test("formulaire admin : sélecteur unique playlist + sous-playlists hiérarchisées, playlist obligatoire, sous-playlist facultative", () => {
  const crud = lire("src/components/admin/EntityCrud.jsx");
  assert.match(crud, /label: "Playlist ou sous-playlist"/);
  assert.match(crud, /optionsPlaylistEtSousPlaylists\(arbre\)/);
  assert.doesNotMatch(crud, /required: true/);
  assert.match(crud, /[Ll]a playlist est obligatoire.*sous-playlist est facultative/);
});

test("glisser tactile admin : même mécanisme que YouTube (@hello-pangea/dnd) ; plus d'ancien hook", () => {
  for (const f of ["src/components/media/ListeTriable.jsx", "src/components/media/ArbrePlaylistsTriable.jsx", "src/components/media/YouTubeSortableList.jsx"]) {
    const s = lire(f);
    assert.match(s, /from "@hello-pangea\/dnd"/, f);
    assert.match(s, /touch-none/, f);
  }
  // Un seul DragDropContext pour l'arbre (les contextes imbriqués ne sont pas pris en charge).
  assert.equal((lire("src/components/media/ArbrePlaylistsTriable.jsx").match(/<DragDropContext/g) || []).length, 1);
  for (const f of ["src/components/admin/EntityCrud.jsx", "src/components/media/MediaCategory.jsx", "src/components/media/PlaylistCategoryView.jsx"]) {
    const s = lire(f);
    assert.doesNotMatch(s, /useDragSort|onTouchStart=|onMouseDown=/, f);
    assert.match(s, /ListeTriable|ArbrePlaylistsTriable|GrillePlaylists/, f);
  }
});

test("membre : Section > Playlist > Sous-playlist > contenu, non classés toujours visibles", () => {
  const nav = lire("src/components/media/NavigationPlaylists.jsx");
  assert.match(nav, /if \(!arbre\.length\) return children;/); // sans playlist : affichage d'avant
  assert.match(nav, /Non classés/);
  assert.match(nav, /onChargerManquants\?\.\(manquants\)/);
  assert.match(nav, /useBackHandler\(Boolean\(parent\)[\s\S]*useBackHandler\(Boolean\(sous\)/);
  const mc = lire("src/components/media/MediaCategory.jsx");
  for (const c of ["youtube", "articles", "gallery"]) assert.match(mc, new RegExp(`\\{\\.\\.\\.nav\\("${c}"`), c);
  assert.match(mc, /const youtube = useMemo\(\(\) => nonRanges\("youtube", tousYoutube\)/);
  const pcv = lire("src/components/media/PlaylistCategoryView.jsx");
  assert.match(pcv, /if \(parent && !open\) \{/);
  assert.match(pcv, /Non classés \(\{directs\}\)/);
  assert.match(pcv, /setOrderedPlaylists\(arbrePlaylists\(playlists, category\)\)/);
  assert.match(lire("src/components/admin/DashboardHome.jsx"), /<AlerteRangement onNavigate=\{onNavigate\} \/>/);
});

test("migration de schéma : parent_id + catégories, idempotente, champs existants gardés", () => {
  const avant = [
    { id: "f1", name: "name", type: "text" },
    { id: "f2", name: "category", type: "select", values: ["music", "sermons", "films", "other"] },
  ];
  const plan = champsMigres(avant);
  assert.deepEqual(plan.fields.find((f) => f.name === "category").values, CATEGORIES);
  assert.equal(plan.fields.find((f) => f.name === "parent_id").type, "text");
  assert.equal(plan.fields.find((f) => f.name === "parent_id").max, 64);
  assert.deepEqual(plan.fields.slice(0, 2).map((f) => f.id), ["f1", "f2"]);
  assert.equal(avant[1].values.length, 4); // l'original n'est pas modifié
  assert.equal(champsMigres(plan.fields), null);
  assert.throws(() => champsMigres([{ name: "category", type: "text" }]), /introuvable/);
});