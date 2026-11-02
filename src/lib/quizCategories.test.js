import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanQuizCategory,
  mergeQuizCategories,
  quizCategoryValue,
} from "./quizCategories.js";

test("quizCategoryValue creates a stable slug from an accented label", () => {
  assert.equal(quizCategoryValue("Les paraboles de Jésus"), "les_paraboles_de_jesus");
});

test("mergeQuizCategories preserves defaults and adds custom categories once", () => {
  const categories = mergeQuizCategories([
    { value: "jesus", label: "Jésus" },
    { label: "Les paraboles", value: "les_paraboles" },
  ]);
  assert.equal(categories.find((category) => category.value === "jesus").label, "Jésus");
  assert.equal(categories.filter((category) => category.value === "jesus").length, 1);
  assert.ok(categories.some((category) => category.value === "les_paraboles"));
});

test("cleanQuizCategory accepts labels or category objects and rejects empty input", () => {
  assert.deepEqual(cleanQuizCategory("La prière"), {
    value: "la_priere",
    label: "La prière",
  });
  assert.deepEqual(cleanQuizCategory({ label: "La foi" }), {
    value: "la_foi",
    label: "La foi",
  });
  assert.equal(cleanQuizCategory({ label: " " }), null);
});
