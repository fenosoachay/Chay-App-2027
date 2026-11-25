import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JEUX, categoriesJeux, classementParJeu, grouperJeux } from "./jeuxCategories.js";
import { nouvellesCollections, donneesDepart } from "../../pocketbase/scripts/migrer-lot-e.mjs";

const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("jeux : deux catégories, noms de l'admin ou de départ, dans l'ordre", () => {
  assert.deepEqual(categoriesJeux([]).map((c) => c.name), ["Chay Game", "Chay PlayMobile"]);
  const cats = categoriesJeux([{ id: "b", slot: "playmobile", name: "Petits", order: 0 }, { id: "a", slot: "game", name: "  ", order: 1 }]);
  assert.deepEqual(cats.map((c) => [c.slot, c.name, c.id]), [["playmobile", "Petits", "b"], ["game", "Chay Game", "a"]]);
});

test("jeux : un jeu non classé n'est dans aucune section ; un classement vers une catégorie inconnue est ignoré", () => {
  const g = grouperJeux([], [{ game_id: "trivia", slot: "game" }, { game_id: "emoji", slot: "playmobile" }, { game_id: "brique", slot: "autre" }]);
  assert.deepEqual(g.sections.map((s) => s.jeux.map((j) => j.id)), [["trivia", "motscroises"], ["emoji"]]);
  assert.deepEqual(g.nonClasses.map((j) => j.id), ["scramble"]);
  // 1.3.31 : Mots croisés rangés d'office dans Chay Game ; Personnalité biblique retirée.
  assert.ok(g.sections[0].jeux.some((j) => j.id === "motscroises"));
  assert.equal(JEUX.some((j) => j.id === "personality"), false);
  assert.ok(grouperJeux([], [{ game_id: "motscroises", slot: "playmobile" }]).sections[1].jeux.some((j) => j.id === "motscroises"));
  // 1.3.26 : le Puzzle est dans Chay Enfants, plus dans les jeux des adultes (un ancien classement est ignoré).
  assert.equal(JEUX.some((j) => j.id === "puzzle"), false);
  assert.equal(JEUX.some((j) => j.id === "brique"), false); // 1.3.29 : jeu des enfants
  assert.deepEqual(grouperJeux([], [{ game_id: "puzzle", slot: "game" }]).sections[0].jeux.map((j) => j.id), ["motscroises"]);
  assert.equal(classementParJeu(null).size, 0);
  assert.equal(new Set(JEUX.map((j) => j.id)).size, JEUX.length);
});

test("jeux : page membres (non classés réservés aux admins), écran admin, alerte du tableau de bord", () => {
  const page = lire("src/pages/Games.jsx");
  assert.match(page, /isAdmin && classement\.nonClasses\.length > 0/);
  assert.match(page, /classement\.sections\.filter\(\(c\) => c\.jeux\.length\)/);
  assert.match(lire("src/components/admin/AdminContent.jsx"), /active === "game_categories"\) return <JeuxCategoriesAdmin \/>/);
  assert.match(lire("src/components/admin/nav/adminNavConfig.js"), /key: "game_categories", label: "Catégories des jeux"/);
  assert.match(lire("src/components/admin/DashboardHome.jsx"), /<AlerteJeuxNonClasses onNavigate=\{onNavigate\} \/>/);
});

test("schéma : GameCategory (2, noms seuls modifiables) et GameClassement (game_id unique)", () => {
  const [cat, cls] = nouvellesCollections().filter((c) => c.name.startsWith("Game"));
  assert.equal(cat.createRule, null);
  assert.equal(cat.deleteRule, null);
  assert.equal(cat.updateRule, '@request.auth.role = "admin"');
  assert.match(cls.indexes[0], /UNIQUE INDEX .* \(`game_id`\)/);
  assert.deepEqual(donneesDepart().filter((d) => d.collection === "GameCategory").map((d) => d.data.name), ["Chay Game", "Chay PlayMobile"]);
});
