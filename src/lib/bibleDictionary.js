// Ancienne structure JSON du dictionnaire (remplacée par la base SQLite :
// voir src/lib/dictionaryDb.js). Seul l'utilitaire de normalisation reste.

// Normalisation pour la recherche d'entrées (casse + accents).
export function normalizeWord(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}