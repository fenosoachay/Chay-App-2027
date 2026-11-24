// Versets du jour en masse (1.3.27) : l'admin colle jusqu'à 50 références (une par ligne, ex. « Jean 3:16 »,
// « Psaume 23:1-3 ») ; chaque verset reçoit un jour, à la suite, à partir d'une date choisie (les jours déjà
// programmés sont sautés) ; le texte vient de la Bible Louis Segond de l'app, modifiable avant de publier.
// Pur (testé par versetsEnMasse.test.js), sauf textePassage qui lit la Bible locale.
import { parseReference } from "./bibleBookRefs.js";
import { addDaysISO, isISODate } from "./localDate.js";

export const MAX_VERSETS = 50;

/** Lignes non vides (puces, numéros « 1. » et ponctuation de fin retirés), 50 au plus. */
export function lireLignes(texte) {
  const toutes = String(texte || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").replace(/[\s.;,]+$/, "").trim())
    .filter(Boolean);
  return { lignes: toutes.slice(0, MAX_VERSETS), enTrop: Math.max(0, toutes.length - MAX_VERSETS) };
}

/**
 * « Jean 3:16 », « jean 3.16 », « 1 Jean 4:7-8 », « Psaume 23:1–3 » -> { bookId, livre, chapitre, debut, fin, ref }
 * (ref : forme propre avec le nom du livre du catalogue). null si illisible, livre inconnu, ou verset absent.
 */
export function analyserReference(ligne, books) {
  const m = String(ligne || "")
    .replace(/[–—]/g, "-")
    .trim()
    .match(/^(.+?)\s+(\d+)\s*[:.,]\s*(\d+)(?:\s*-\s*(\d+))?$/);
  if (!m) return null;
  const p = parseReference(`${m[1]} ${m[2]}:${m[3]}`, books);
  if (!p) return null;
  const debut = Number(m[3]);
  const fin = m[4] ? Math.max(debut, Number(m[4])) : debut;
  const livre = books.find((b) => b.id === p.bookId)?.name || m[1];
  return {
    bookId: p.bookId,
    livre,
    chapitre: p.chapter,
    debut,
    fin,
    ref: `${livre} ${p.chapter}:${debut}${fin > debut ? `-${fin}` : ""}`,
  };
}

/** `n` dates à partir de `depart` (incluse), en sautant les jours déjà occupés. */
export function joursLibres(depart, n, occupes = new Set()) {
  if (!isISODate(depart)) return [];
  const out = [];
  let jour = depart;
  for (let garde = 0; out.length < n && garde < n + 3660; garde += 1) {
    if (!occupes.has(jour)) out.push(jour);
    jour = addDaysISO(jour, 1);
  }
  return out;
}

/** Texte d'un passage à partir des versets du chapitre [{ number, text }] ; « » si absent. */
export function textePassage(versetsChapitre, debut, fin) {
  return (versetsChapitre || [])
    .filter((v) => v.number >= debut && v.number <= fin)
    .map((v) => String(v.text || "").trim())
    .join(" ")
    .trim();
}
