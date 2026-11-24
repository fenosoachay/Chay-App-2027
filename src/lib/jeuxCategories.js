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
  { id: "personality", name: "Personnalité biblique", path: "/personality-quiz" },
];

export const CATEGORIES_JEUX_DEFAUT = [
  { slot: "game", name: "Chay Game", order: 0 },
  { slot: "playmobile", name: "Chay PlayMobile", order: 1 },
];

/** Les deux catégories, dans l'ordre, avec le nom choisi par l'admin (sinon le nom de départ). */
export function categoriesJeux(rows) {
  const parSlot = new Map((Array.isArray(rows) ? rows : []).map((r) => [r.slot, r]));
  return CATEGORIES_JEUX_DEFAUT.map((d) => {
    const r = parSlot.get(d.slot);
    const name = String(r?.name || "").trim() || d.name;
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
    sections: cats.map((c) => ({ ...c, jeux: jeux.filter((j) => parJeu.get(j.id) === c.slot) })),
    nonClasses: jeux.filter((j) => !parJeu.has(j.id)),
  };
}
