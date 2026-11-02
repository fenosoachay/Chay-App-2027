import { QUIZ_CATEGORIES } from "./quizConstants.js";

export function quizCategoryValue(label) {
  return String(label || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function mergeQuizCategories(categories = []) {
  const merged = new Map(QUIZ_CATEGORIES.map((category) => [category.value, category]));
  categories.forEach((category) => {
    const value = typeof category?.value === "string"
      ? category.value.trim()
      : "";
    if (!value) return;
    if (category.is_deleted) {
      merged.delete(value);
      return;
    }
    const label = typeof category.label === "string" ? category.label.trim() : "";
    if (label) merged.set(value, { value, label });
  });
  return [...merged.values()];
}

export function cleanQuizCategory(category) {
  if (typeof category === "string") {
    const label = category.trim();
    return label ? { value: quizCategoryValue(label), label } : null;
  }
  if (!category || typeof category !== "object") return null;
  const label = typeof category.label === "string" ? category.label.trim() : "";
  const value = typeof category.value === "string"
    ? category.value.trim()
    : quizCategoryValue(label);
  return label && value ? { value, label } : null;
}
