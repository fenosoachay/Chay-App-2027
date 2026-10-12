// Navigation de la concordance : liste des mots par lettre, regroupement des
// versets d'un mot par livre, versets d'un livre. Tout se calcule sur l'index
// inversé local (aucune requête réseau).

import { wordToIndexKeys } from "./bibleConcordance.js";

export const ALPHABET = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

// Lettre de rangement d'un mot : première lettre sans accent, en majuscule
// (« Éber » → E, « âme » → A). Les mots ne commençant pas par une lettre
// latine (rare) sont rangés sous « # ».
export function letterOf(word) {
  const first = String(word || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")[0] || "";
  const up = first.toUpperCase();
  return /^[A-Z]$/.test(up) ? up : "#";
}

const collator = new Intl.Collator("fr", { sensitivity: "base" });

const wordListCache = new WeakMap();

// Mots groupés par lettre : { A: [{ word, count }], … }, triés par ordre
// alphabétique français. Mis en cache par objet d'index (calcul unique).
export function getWordsByLetter(indexData) {
  let map = wordListCache.get(indexData);
  if (map) return map;
  map = {};
  for (const [word, postings] of Object.entries(indexData.index)) {
    (map[letterOf(word)] ||= []).push({ word, count: postings.length });
  }
  for (const list of Object.values(map)) list.sort((a, b) => collator.compare(a.word, b.word));
  wordListCache.set(indexData, map);
  return map;
}

// Nombre de mots par lettre (pour griser les lettres vides).
export function letterCounts(indexData) {
  const map = getWordsByLetter(indexData);
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.length]));
}

// Indices de versets contenant `word` (mot entier, mêmes équivalences que la
// recherche : casse, et accents en français), triés dans l'ordre canonique.
function versePostings(indexData, word) {
  const forms = wordToIndexKeys(word, indexData.lang);
  const set = new Set();
  for (const [key, list] of Object.entries(indexData.index)) {
    const keyForms = wordToIndexKeys(key, indexData.lang);
    if (forms.some((f) => keyForms.includes(f))) for (const i of list) set.add(i);
  }
  return [...set].sort((a, b) => a - b);
}

// Résultats d'un mot groupés par livre, dans l'ordre canonique :
// { total, books: [{ bookIdx, name, count }] }. `total` = nombre de versets.
export function groupWordByBook(indexData, word) {
  const postings = versePostings(indexData, word);
  const counts = new Map();
  for (const i of postings) {
    const b = indexData.verses[i][0];
    counts.set(b, (counts.get(b) || 0) + 1);
  }
  const books = [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bookIdx, count]) => ({ bookIdx, name: indexData.books[bookIdx]?.name, count }));
  return { total: postings.length, books };
}

// Versets d'un livre contenant `word`, triés par chapitre puis verset.
export function versesOfBook(indexData, word, bookIdx) {
  return versePostings(indexData, word)
    .map((i) => indexData.verses[i])
    .filter((v) => v[0] === bookIdx)
    .sort((a, b) => a[1] - b[1] || a[2] - b[2])
    .map((v) => ({ bookIdx: v[0], chapter: v[1], verse: v[2], text: v[3] }));
}