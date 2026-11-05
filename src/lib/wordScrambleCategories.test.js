import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanWordScrambleCategory,
  mergeWordScrambleCategories,
  wordScrambleCategoryValue,
} from "./wordScrambleCategories.js";

test("wordScrambleCategoryValue creates a slug from accented labels", () => {
  assert.equal(wordScrambleCategoryValue("Livres de la Bible"), "livres_de_la_bible");
});

test("mergeWordScrambleCategories applies renamed defaults and includes custom categories", () => {
  const categories = mergeWordScrambleCategories([
    { value: "lieu", label: "Régions bibliques" },
    { value: "parabole", label: "Paraboles" },
  ]);
  assert.equal(categories.find((category) => category.value === "lieu").label, "Régions bibliques");
  assert.ok(categories.some((category) => category.value === "parabole"));
});

test("mergeWordScrambleCategories hides deleted defaults and custom categories", () => {
  const categories = mergeWordScrambleCategories([
    { value: "lieu", label: "Lieu", is_deleted: true },
    { value: "parabole", label: "Paraboles", is_deleted: true },
  ]);
  assert.ok(!categories.some((category) => category.value === "lieu"));
  assert.ok(!categories.some((category) => category.value === "parabole"));
});

test("cleanWordScrambleCategory accepts labels or category objects", () => {
  assert.deepEqual(cleanWordScrambleCategory("Les patriarches"), {
    value: "les_patriarches",
    label: "Les patriarches",
  });
  assert.deepEqual(cleanWordScrambleCategory({ value: "lieu", label: "Lieu" }), {
    value: "lieu",
    label: "Lieu",
  });
  assert.equal(cleanWordScrambleCategory({ label: " " }), null);
});
