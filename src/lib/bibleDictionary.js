// Dictionnaire biblique — structure prête à recevoir les données.
//
// Les données du dictionnaire ne sont pas encore fournies : aucune entrée
// n'est inventée. Quand elles seront disponibles, il suffira de :
//   1. déposer le fichier JSON dans public/data/dictionaries/ ;
//   2. renseigner DICTIONARY_FILE ci-dessous ;
//   3. mettre DICTIONARY_READY à true.
// Format attendu du fichier : { entries: [{ word, definition }] }.

export const DICTIONARY_READY = false;
export const DICTIONARY_FILE = null; // ex. "dictionnaire.json"

// Normalisation pour la recherche d'entrées (casse + accents).
export function normalizeWord(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Recherche d'entrées dans une liste [{ word, definition }]. Utilisée par le
// composant dès que DICTIONARY_READY passe à true.
export function searchEntries(entries, query, limit = 100) {
  const q = normalizeWord(query);
  if (!q || !Array.isArray(entries)) return [];
  return entries.filter((e) => normalizeWord(e.word).includes(q)).slice(0, limit);
}