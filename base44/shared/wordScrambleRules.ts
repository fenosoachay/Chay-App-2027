// Règles du jeu « Mots Mélangés » partagées par toutes les fonctions du jeu.

export const LEVELS = ["easy", "medium", "hard", "ultra_hard"];
export const WORDS_PER_GAME = 5;

export const INITIAL_CREDITS = 10;
export const CREDITS_PER_GAME = 2;
export const CREDITS_PER_UNLOCK = 5;

export const HINT_COSTS: Record<string, number> = { first_letter: 1, phrase: 2 };
export const HINT_PENALTY = 10;
export const POINTS_PER_LETTER = 10;

// Niveau à réussir (et seuil en % du score maximum) pour débloquer chaque niveau.
export const UNLOCK_RULES: Record<string, { requires: string; threshold: number } | null> = {
  easy: null,
  medium: { requires: "easy", threshold: 60 },
  hard: { requires: "medium", threshold: 65 },
  ultra_hard: { requires: "hard", threshold: 70 },
};

export const NEXT_LEVEL: Record<string, string | null> = {
  easy: "medium",
  medium: "hard",
  hard: "ultra_hard",
  ultra_hard: null,
};

export const MASTER_THRESHOLD = 80;

export function isLevel(value: unknown): boolean {
  return typeof value === "string" && LEVELS.includes(value);
}

// Fisher-Yates
export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Mélange les lettres d'un mot ; le résultat n'est jamais identique au mot
// (sauf si toutes les lettres sont identiques, cas impossible à différencier).
export function scrambleLetters(word: string): string[] {
  const letters = word.split("");
  if (new Set(letters).size < 2) return letters;
  let result = shuffle(letters);
  let guard = 0;
  while (result.join("") === word && guard++ < 50) result = shuffle(letters);
  return result;
}

export function normalizeWord(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
}

export function wordScore(word: string, paidHints: number): number {
  return Math.max(0, word.length * POINTS_PER_LETTER - paidHints * HINT_PENALTY);
}

export function maxScore(words: Array<{ word: string }>): number {
  return words.reduce((sum, w) => sum + w.word.length * POINTS_PER_LETTER, 0);
}

export function percent(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

export function pageItems(page: any): any[] {
  return Array.isArray(page) ? page : page?.items || [];
}

// Retrouve (ou crée) la progression d'un joueur pour un niveau (garde la plus ancienne).
export async function getProgress(db: any, userId: string, difficulty: string) {
  const rows = await db.entities.WordScrambleProgress.filter(
    { user_id: userId, difficulty },
    { sort: "created_date", limit: 5 },
  );
  const list = pageItems(rows);
  if (list.length) return list[0];
  return await db.entities.WordScrambleProgress.create({
    user_id: userId,
    difficulty,
    total_words_played: 0,
    total_score: 0,
    best_score: 0,
    best_percent: 0,
    unlocked: difficulty === "easy",
    master_badge: false,
    session_word_ids: [],
    session_hints: {},
  });
}

// Retrouve (ou crée, avec 10 crédits offerts) le portefeuille de crédits d'un joueur.
export async function getCredits(db: any, userId: string) {
  const rows = await db.entities.WordScrambleCredits.filter(
    { user_id: userId },
    { sort: "created_date", limit: 5 },
  );
  const list = pageItems(rows);
  if (list.length) return list[0];
  return await db.entities.WordScrambleCredits.create({ user_id: userId, credits: INITIAL_CREDITS });
}