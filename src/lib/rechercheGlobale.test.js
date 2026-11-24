import test from "node:test";
import assert from "node:assert/strict";
import { chercherRubriques, filtreContient, nettoyerRecherche, routeVersetBible, SOURCES, versResultats } from "./rechercheGlobale.js";

test("texte cherché nettoyé : jamais de caractère spécial transmis au serveur", () => {
  assert.equal(nettoyerRecherche("  Jésus   Christ "), "Jésus Christ");
  assert.equal(nettoyerRecherche('a"); drop'), "a drop");
  assert.equal(nettoyerRecherche("%_*.+?()[]{}|\\^$"), "");
  assert.equal(nettoyerRecherche("a"), "");
  assert.equal(nettoyerRecherche("l'amour"), "l'amour");
  assert.equal(nettoyerRecherche("x".repeat(200)).length, 60);
});

test("filtre « contient » : un des champs contient le texte", () => {
  assert.deepEqual(filtreContient("grâce", ["title", "artist"]), { $or: [{ title: { $regex: "grâce" } }, { artist: { $regex: "grâce" } }] });
});

test("chaque source ouvre le bon écran", () => {
  const src = (e) => SOURCES.find((s) => s.entite === e);
  assert.equal(versResultats(src("MusicTrack"), [{ id: "m1", title: "Hosanna", artist: "Chorale" }])[0].route, "/media?cat=music&track=m1");
  assert.equal(versResultats(src("Playlist"), [{ id: "p1", name: "Louange", category: "youtube" }])[0].route, "/media?cat=youtube&playlist=p1");
  assert.equal(versResultats(src("YouTubeVideo"), [{ id: "y1", title: "Culte", youtube_id: "abcdefghijk" }])[0].image, "https://img.youtube.com/vi/abcdefghijk/mqdefault.jpg");
  assert.equal(versResultats(src("Paroles"), [{ id: "x", title: "Chant", body: "<p>Gloire&nbsp;à <b>Dieu</b></p>" }])[0].sousTitre, "Gloire à Dieu");
  assert.equal(versResultats(src("MemberProfile"), [{ id: "mp", display_name: "Meva", created_by_id: "u1" }])[0].route, "/profile/u1");
  assert.deepEqual(versResultats(src("MemberProfile"), [{ id: "c", display_name: "Chay", created_by_id: "u2", systeme: true }]), [], "compte système caché");
  assert.deepEqual(versResultats(src("PageTexte"), [{ id: "t", title: "Autre", cle: "secret" }]), [], "page sans écran écartée");
  assert.deepEqual(versResultats(src("MusicTrack"), [{ id: "v", title: "  " }]), [], "sans titre écarté");
});

test("rubriques de l'app trouvées sans accents ni majuscules", () => {
  assert.ok(chercherRubriques("PRIERE").some((r) => r.route === "/requests"));
  assert.ok(chercherRubriques("radio").some((r) => r.route === "/media?cat=radio"));
  assert.ok(chercherRubriques("emo").some((r) => r.route === "/games/emojis"));
  assert.deepEqual(chercherRubriques("z"), []);
});

test("verset de la Bible -> lecteur", () => {
  assert.equal(routeVersetBible("fra_lsg", "JHN", 3, 16), "/bible?view=reader&translation=fra_lsg&ref=JHN%203&verse=16");
});
