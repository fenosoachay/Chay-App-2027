import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ADMIN_NAV, PATH_BY_KEY, chercherNav, findNav, findNavByPath, pagesNav } from "../components/admin/nav/adminNavConfig.js";

const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("menu admin : 3 grandes parties, dans l'ordre demandé", () => {
  assert.deepEqual(ADMIN_NAV.map((g) => g.label), ["Application", "Site chay.fr", "Équipe"]);
  const app = ADMIN_NAV[0].items;
  assert.equal(app[0].label, "Tableau de bord");
  const contenu = app[1].items;
  assert.deepEqual(contenu.map((g) => g.label), ["Accueil", "Multimédia", "Jeux", "Menu", "Communauté"]);
  assert.deepEqual(contenu[0].items.map((i) => i.label), ["Verset du jour", "Prochaine réunion", "Requêtes", "Question logique", "Petite histoire", "Liens des sites en bas"]);
  assert.deepEqual(contenu[1].items.map((i) => i.label), ["Musique", "Texte qui défile", "Prédication", "Vidéo", "YouTube", "Galerie", "Article", "Actualité chrétienne", "Parole", "Verset", "Playlists"]);
  assert.deepEqual(contenu[1].items[5].items.map((i) => i.label), ["Photos", "Fonds d'écran"]);
  assert.deepEqual(contenu[2].items.map((i) => i.label), ["Chay Kids", "Chay Game"]);
  // 1.3.26 : Vidéos des enfants ; le Puzzle passe de Chay Game à Chay Kids.
  assert.deepEqual(contenu[2].items[0].items.map((i) => i.label), ["Vidéos", "Coloriages", "Jeux Carte", "Puzzles"]);
  assert.equal(contenu[2].items[1].items.some((i) => i.key === "puzzles"), false);
  assert.deepEqual(contenu[3].items.map((i) => i.label), ["Histoire de l'église", "Vision de l'église", "But de l'église", "Confession de foi", "En service", "FAQ"]);
  assert.deepEqual(contenu[4].items.map((i) => i.label).slice(0, 5), ["Message", "Demande de don", "Demande de thème", "Se missionner", "Problème technique"]);
  const site = ADMIN_NAV[1].items;
  assert.equal(site[0].label, "Tableau de bord");
  assert.deepEqual(site[1].items.map((g) => g.label), ["Accueil", "Pages"]);
  assert.equal(site[1].items[1].items.length, 5);
  assert.deepEqual(ADMIN_NAV[2].items.map((i) => i.key), ["invite", "membres", "admins", "app_update"]);
});

test("menu admin : clés et chemins uniques, toutes les pages affichables", () => {
  const pages = pagesNav();
  const cles = pages.map((p) => p.item.key);
  const chemins = pages.map((p) => p.item.path);
  assert.equal(new Set(cles).size, cles.length, "clé en double");
  assert.equal(new Set(chemins).size, chemins.length, "chemin en double");
  const contenu = lire("src/components/admin/AdminContent.jsx");
  const sections = lire("src/components/admin/adminSections.js");
  for (const k of cles) {
    if (k === "invite") continue; // fenêtre ouverte par la page Admin
    const affiche = contenu.includes(`"${k}"`) || sections.includes(`key: "${k}"`)
      || (k.startsWith("SiteBloc_") && sections.includes(`pageSite("${k.slice(9)}"`))
      || (k.startsWith("PageTexte_") && sections.includes(`pageTexte("${k.slice(10)}"`));
    assert.ok(affiche, `page sans contenu : ${k}`);
  }
  assert.equal(PATH_BY_KEY.overview, "/admin");
  assert.equal(findNavByPath("/admin/petite-histoire/"), "petite_histoire");
  assert.equal(findNavByPath("/admin/nimporte"), "overview");
  assert.deepEqual(findNav("Wallpaper").parents.map((g) => g.label), ["Application", "Contenu", "Multimédia", "Galerie"]);
  assert.equal(findNav("inconnue").item.key, "overview");
});

test("recherche : par nom, rubrique ou mot-clé, sans accents", () => {
  assert.equal(chercherNav("petite")[0].item.key, "petite_histoire");
  assert.equal(chercherNav("confession")[0].item.key, "PageTexte_confession");
  assert.ok(chercherNav("fond ecran").some((r) => r.item.key === "Wallpaper"));
  assert.equal(chercherNav("galerie")[0].groupe, "Application › Contenu › Multimédia › Galerie");
  assert.deepEqual(chercherNav("  "), []);
});
