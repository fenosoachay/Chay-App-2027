import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GALLERY_SECTIONS } from "../lib/mediaConstants.js";

const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("adminSections.js : Galerie n'a plus de champ category", () => {
  const s = lire("src/components/admin/adminSections.js");
  // Trouver la section Gallery
  const idx = s.indexOf('key: "GalleryImage"');
  assert.ok(idx !== -1, "Section GalleryImage doit exister");
  const galerie = s.slice(idx, idx + 2000);
  // Vérifier qu'il n'y a plus de champ category
  assert.ok(!galerie.includes('name: "category"'), "Champ category retiré de GalleryImage");
  assert.ok(!galerie.includes('"Catégorie"'), "Label Catégorie retiré de GalleryImage");
  assert.ok(!galerie.includes('GALLERY_SECTIONS'), "GALLERY_SECTIONS non utilisé dans GalleryImage");
  // Vérifier que listColumns ne contient plus "category"
  const listColumnsIdx = galerie.indexOf("listColumns:");
  const listColumnsLine = galerie.slice(listColumnsIdx, galerie.indexOf("\n", listColumnsIdx));
  assert.ok(listColumnsLine.includes('"title"'), "listColumns contient title");
  assert.ok(!listColumnsLine.includes("category"), "listColumns ne contient plus category");
});
