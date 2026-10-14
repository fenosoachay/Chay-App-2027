export const WS_LEVELS = [
  { value: "easy", label: "Facile", emoji: "🟢", color: "text-green-500", ring: "border-green-500/30 bg-green-500/10", badge: "bg-green-500/15 text-green-500 border-green-500/30" },
  { value: "medium", label: "Moyen", emoji: "🟡", color: "text-yellow-500", ring: "border-yellow-500/30 bg-yellow-500/10", badge: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  { value: "hard", label: "Difficile", emoji: "🟠", color: "text-orange-500", ring: "border-orange-500/30 bg-orange-500/10", badge: "bg-orange-500/15 text-orange-500 border-orange-500/30" },
  { value: "ultra_hard", label: "Ultra", emoji: "🔴", color: "text-red-500", ring: "border-red-500/30 bg-red-500/10", badge: "bg-red-500/15 text-red-500 border-red-500/30" },
];

export const WS_CATEGORIES = [
  { value: "personnage", label: "Personnage" },
  { value: "lieu", label: "Lieu" },
  { value: "objet", label: "Objet" },
  { value: "concept", label: "Concept" },
  { value: "livre_bible", label: "Livre de la Bible" },
];

export const wsLevelOf = (value) => WS_LEVELS.find((l) => l.value === value);
export const wsLevelLabel = (value) => wsLevelOf(value)?.label || value;
export const wsCategoryLabel = (value) => WS_CATEGORIES.find((c) => c.value === value)?.label || value || "—";

export const WS_HINT_COSTS = { first_letter: 1, phrase: 2 };

export const EMPTY_WORD = {
  word: "",
  difficulty: "easy",
  category: "personnage",
  hint_phrase: "",
  hint_bible_reference: "",
};

// Message personnalisé selon le résultat.
export function resultMessage(summary) {
  if (summary.score_percent >= 100 && summary.perfect) return "🏆 Parfait ! Maître des mots !";
  if (summary.score_percent >= 80) return "🌟 Excellent travail !";
  if (summary.score_percent >= 60) return "👍 Très bien !";
  return "💪 Réessaie pour t'améliorer !";
}