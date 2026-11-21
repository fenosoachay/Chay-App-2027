// Score Boards (1.3.22) : côté app. Les points sont calculés et bornés par le serveur (pb_hooks/lib/scores.js).
//  - enregistrerScore : fin d'une partie d'Émojis, Brique, Puzzle (adultes) ou de Jeux Carte (enfants) ;
//    Quiz et Mots mélangés : rien à faire, le serveur compte lui-même ;
//  - profil enfant : pseudo + avatar dessiné, gardés sur ce téléphone (les enfants jouent sur le compte d'un parent).
import { base44 } from "@/api/base44Client";

export const PERIODES = [
  { id: "semaine", label: "Semaine" },
  { id: "mois", label: "Mois" },
  { id: "toujours", label: "Toujours" },
];

export const JEUX_ADULTES = [
  { id: "general", label: "Général" },
  { id: "trivia", label: "Quiz" },
  { id: "scramble", label: "Mots mélangés" },
  { id: "emoji", label: "Émojis" },
  { id: "brique", label: "Brique" },
  { id: "puzzle", label: "Puzzle" },
];
export const JEUX_ENFANTS = [{ id: "general", label: "Général" }, { id: "memory", label: "Jeux Carte" }];

// Même liste que le serveur (pb_hooks/lib/scores.js).
export const AVATARS = ["🦁", "🐑", "🕊️", "🐟", "🐘", "🦒", "🐻", "🐰", "🦊", "🐢", "🐝", "🦋", "🐳", "🐧", "🦉", "🐞"];

const CLE_ENFANT = "chay_profil_enfant";

export function pseudoValide(p) {
  const s = String(p || "").replace(/\s+/g, " ").trim();
  if (s.length < 2 || s.length > 20) return "";
  return /^[A-Za-zÀ-ÖØ-öø-ÿ0-9 '’-]+$/.test(s) ? s : "";
}

export function lireProfilEnfant() {
  try {
    const p = JSON.parse(localStorage.getItem(CLE_ENFANT) || "null");
    const pseudo = pseudoValide(p?.pseudo);
    return pseudo ? { pseudo, avatar: AVATARS.includes(p.avatar) ? p.avatar : AVATARS[0] } : null;
  } catch {
    return null;
  }
}

export function enregistrerProfilEnfant(pseudo, avatar) {
  const p = { pseudo: pseudoValide(pseudo), avatar: AVATARS.includes(avatar) ? avatar : AVATARS[0] };
  if (!p.pseudo) return null;
  try { localStorage.setItem(CLE_ENFANT, JSON.stringify(p)); } catch { /* garde en mémoire seulement */ }
  return p;
}

/** Envoie le score d'une partie ; ne bloque jamais le jeu (erreurs ignorées). Renvoie les points comptés. */
export async function enregistrerScore(jeu, donnees = {}) {
  try {
    const r = await base44.functions.invoke("enregistrerScore", { jeu, ...donnees });
    return Number(r?.data?.points) || 0;
  } catch {
    return 0;
  }
}

/** « 1er », « 2e »… */
export const rangTexte = (n) => (n === 1 ? "1er" : `${n}e`);
