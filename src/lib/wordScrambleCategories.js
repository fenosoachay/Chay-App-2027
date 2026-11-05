import { WS_CATEGORIES } from "./wordScrambleConstants.js";

export function wordScrambleCategoryValue(label) {
  return String(label || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function mergeWordScrambleCategories(categories = []) {
  const merged = new Map(WS_CATEGORIES.map((category) => [category.value, category]));
  categories.forEach((category) => {
    const value = typeof category?.value === "string" ? category.value.trim() : "";
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

export function cleanWordScrambleCategory(category) {
  if (typeof category === "string") {
    const label = category.trim();
    return label ? { value: wordScrambleCategoryValue(label), label } : null;
  }
  if (!category || typeof category !== "object") return null;
  const label = typeof category.label === "string" ? category.label.trim() : "";
  const value = typeof category.value === "string"
    ? category.value.trim()
    : wordScrambleCategoryValue(label);
  return label && value ? { value, label } : null;
}
