export const QUIZ_LEVELS = [
  { value: "easy", label: "Facile", emoji: "🟢", badge: "bg-green-500/15 text-green-500 border-green-500/30" },
  { value: "medium", label: "Moyen", emoji: "🟡", badge: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  { value: "hard", label: "Difficile", emoji: "🔴", badge: "bg-red-500/15 text-red-500 border-red-500/30" },
];

export const QUIZ_CATEGORIES = [
  { value: "ancien_testament", label: "Ancien Testament" },
  { value: "nouveau_testament", label: "Nouveau Testament" },
  { value: "jesus", label: "Jésus" },
  { value: "prophetes", label: "Prophètes" },
  { value: "personnages", label: "Personnages" },
  { value: "autre", label: "Autre" },
];

export const levelLabel = (value) => QUIZ_LEVELS.find((l) => l.value === value)?.label || value;
export const levelOf = (value) => QUIZ_LEVELS.find((l) => l.value === value);
export const categoryLabel = (value) => QUIZ_CATEGORIES.find((c) => c.value === value)?.label || value || "—";

export const EMPTY_QUESTION = {
  question: "",
  option_a: "",
  option_b: "",
  option_c: "",
  option_d: "",
  correct_answer: "A",
  difficulty: "easy",
  category: "ancien_testament",
  explanation: "",
};