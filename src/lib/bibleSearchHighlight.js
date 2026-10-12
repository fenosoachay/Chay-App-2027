// Mise en évidence des mots recherchés dans un verset (recherche intégrée et
// concordance). Le texte biblique reste inchangé : on ne fait que le découper
// en segments { text, match } pour l'affichage.

import { wordToIndexKeys } from "./bibleConcordance.js";

const WORD_RE = /[\p{L}]+(?:['’-][\p{L}]+)*/gu;

// Découpe `text` en segments ; `match` vaut true pour les mots entiers qui
// correspondent à l'un des mots de `query` (même équivalence que l'index :
// casse, et accents en français).
export function highlightSegments(text, query, lang) {
  const source = String(text || "");
  const queryWords = String(query || "").match(WORD_RE) || [];
  if (queryWords.length === 0) return [{ text: source, match: false }];

  const wanted = new Set();
  for (const w of queryWords) for (const f of wordToIndexKeys(w, lang)) wanted.add(f);

  const segments = [];
  let last = 0;
  for (const m of source.matchAll(WORD_RE)) {
    const forms = wordToIndexKeys(m[0], lang);
    if (!forms.some((f) => wanted.has(f))) continue;
    if (m.index > last) segments.push({ text: source.slice(last, m.index), match: false });
    segments.push({ text: m[0], match: true });
    last = m.index + m[0].length;
  }
  if (last < source.length) segments.push({ text: source.slice(last), match: false });
  return segments.length ? segments : [{ text: source, match: false }];
}