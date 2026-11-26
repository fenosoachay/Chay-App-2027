// Jeux : deux catégories (« Chay Game », « Chay PlayMobile », noms modifiables par l'admin, collection GameCategory)
// et classement de chaque jeu dans UNE catégorie (collection GameClassement). Un jeu non classé n'est pas montré
// aux membres ; le panneau admin affiche une demande de classement pour chacun.

/**
 * Jeux de l'app (identifiant fixe = GameClassement.game_id). Les icônes sont dans src/pages/Games.jsx.
 * 1.3.26 : le Puzzle a quitté les jeux des adultes pour Chay Enfants › Jeux (src/pages/Kids.jsx) ; Brique aussi en 1.3.29.
 */
export const JEUX = [
  { id: "trivia", name: "Quiz", path: "/quiz" },
  { id: "emoji", name: "Émojis", path: "/games/emojis" },
  { id: "scramble", name: "Mots mélangés", path: "/word-scramble" },
  // 1.3.31 : Personnalité biblique retirée ; Mots croisés (classés d'office dans Chay Game, l'admin peut changer).
  { id: "motscroises", name: "Mots croisés", path: "/mots-croises", slotDefaut: "game" },
  { id: "enigmes", name: "Énigmes", path: "/enigmes", slotDefaut: "game" }, // 1.3.32
  { id: "ouvastu", name: "Où vas-tu ?", path: "/ou-vas-tu", slotDefaut: "game" }, // 1.3.32
  { id: "fronde", name: "Chay Fronde", path: "/chay-fronde", slotDefaut: "playmobile" }, // 1.3.32
];

// 1.3.43 : noms en français. Les anciens noms de départ (« Chay Game », « Chay PlayMobile ») encore enregistrés
// sont remplacés à l'affichage ; un nom choisi par l'admin reste tel quel.
export const CATEGORIES_JEUX_DEFAUT = [
  { slot: "game", name: "Jeux de réflexion", order: 0, ancien: "Chay Game" },
  { slot: "playmobile", name: "Jeux d'action", order: 1, ancien: "Chay PlayMobile" },
];

/** Les deux catégories, dans l'ordre, avec le nom choisi par l'admin (sinon le nom de départ). */
export function categoriesJeux(rows) {
  const parSlot = new Map((Array.isArray(rows) ? rows : []).map((r) => [r.slot, r]));
  return CATEGORIES_JEUX_DEFAUT.map((d) => {
    const r = parSlot.get(d.slot);
    const choisi = String(r?.name || "").trim();
    const name = !choisi || choisi.toLowerCase() === d.ancien.toLowerCase() ? d.name : choisi;
    return { slot: d.slot, name, id: r?.id || null, order: r?.order ?? d.order };
  }).sort((a, b) => a.order - b.order);
}

/** game_id -> slot, en ignorant les classements vers une catégorie inconnue. */
export function classementParJeu(classements) {
  const slots = new Set(CATEGORIES_JEUX_DEFAUT.map((c) => c.slot));
  const m = new Map();
  for (const c of Array.isArray(classements) ? classements : []) {
    if (c && c.game_id && slots.has(c.slot)) m.set(c.game_id, c.slot);
  }
  return m;
}

/**
 * Jeux groupés par catégorie : { sections: [{ slot, name, jeux }], nonClasses: [jeux] }.
 * `jeux` : liste de jeux (par défaut JEUX). Les sections vides sont gardées (l'appelant décide de les masquer).
 */
export function grouperJeux(categories, classements, jeux = JEUX) {
  const cats = categoriesJeux(categories);
  const parJeu = classementParJeu(classements);
  return {
    sections: cats.map((c) => ({ ...c, jeux: jeux.filter((j) => (parJeu.get(j.id) || j.slotDefaut) === c.slot) })),
    nonClasses: jeux.filter((j) => !parJeu.has(j.id) && !j.slotDefaut),
  };
}
