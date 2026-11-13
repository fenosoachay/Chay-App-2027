import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { trierActualites, lienSur } from "./actualites.js";
import { CATEGORIES } from "./mediaConstants.js";
import { nouvellesCollections } from "../../pocketbase/scripts/migrer-lot-e.mjs";

const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("Actualité chrétienne : section Multimédia visible, vide gérée, admin et schéma", () => {
  assert.ok(CATEGORIES.some((c) => c.id === "actualite" && c.label === "Actualité chrétienne"));
  const vue = lire("src/components/media/ActualiteChretienne.jsx");
  assert.match(vue, /Aucune actualité pour le moment\./);
  assert.match(vue, /DOMPurify\.sanitize\(ouverte\.body \|\| ""\)/);
  assert.match(lire("src/components/media/MediaCategory.jsx"), /cat === "actualite" && \(/);
  assert.match(lire("src/components/admin/adminSections.js"), /key: "ChristianNews"/);
  const col = nouvellesCollections().find((c) => c.name === "ChristianNews");
  assert.equal(col.listRule, '@request.auth.id != ""');
  assert.equal(col.createRule, '@request.auth.role = "admin"');
});

test("Actualité chrétienne : ordre de l'admin puis plus récente ; liens http(s) seulement", () => {
  const l = trierActualites([{ title: "a", created_date: "2026-01-01" }, { title: "b", created_date: "2026-02-01" }, { title: "c", order: 0 }, { title: " " }]);
  assert.deepEqual(l.map((n) => n.title), ["c", "b", "a"]);
  assert.equal(lienSur("javascript:alert(1)"), null);
  assert.equal(lienSur(" https://exemple.org/x "), "https://exemple.org/x");
});
