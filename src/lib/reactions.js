// Réactions des vidéos verticales (1.3.24) : 👍 like, ❤️ cœur, 😂 haha. Calculs purs (testés par node --test).
export const REACTIONS = [
  { value: "like", emoji: "👍", label: "J'aime" },
  { value: "coeur", emoji: "❤️", label: "J'adore" },
  { value: "haha", emoji: "😂", label: "Haha" },
];
// Les « J'aime » d'avant les réactions (sans champ reaction) étaient un cœur.
export const REACTION_PAR_DEFAUT = "coeur";
export const emojiDe = (v) => (REACTIONS.find((r) => r.value === v) || REACTIONS[1]).emoji;

/** Ce qu'il faut faire quand on touche `choisie` alors que sa réaction actuelle est `actuelle` (ou null). */
export function prochaineReaction(actuelle, choisie) {
  if (!actuelle) return { type: "ajouter", reaction: choisie };
  if (actuelle === choisie) return { type: "retirer" };
  return { type: "changer", reaction: choisie };
}

/** Réactions présentes, de la plus fréquente à la moins fréquente : [{ value, emoji, n }]. */
export function resumeReactions(lignes) {
  const n = {};
  for (const l of lignes || []) {
    const v = REACTIONS.some((r) => r.value === l.reaction) ? l.reaction : REACTION_PAR_DEFAUT;
    n[v] = (n[v] || 0) + 1;
  }
  return REACTIONS.filter((r) => n[r.value]).map((r) => ({ value: r.value, emoji: r.emoji, n: n[r.value] }))
    .sort((a, b) => b.n - a.n);
}
