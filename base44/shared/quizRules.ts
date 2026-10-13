// Règles du Quiz biblique partagées par toutes les fonctions du quiz.

export const LEVELS = ["easy", "medium", "hard"];

export const QUESTION_COUNT: Record<string, number> = { easy: 5, medium: 10, hard: 15 };

// Niveau à terminer (et seuil en %) pour débloquer chaque niveau.
export const UNLOCK_RULES: Record<string, { requires: string; threshold: number } | null> = {
  easy: null,
  medium: { requires: "easy", threshold: 70 },
  hard: { requires: "medium", threshold: 80 },
};

export const NEXT_LEVEL: Record<string, string | null> = {
  easy: "medium",
  medium: "hard",
  hard: null,
};

export function isLevel(value: unknown): boolean {
  return typeof value === "string" && LEVELS.includes(value);
}

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function percent(correct: number, total: number): number {
  if (!total) return 0;
  return Math.round((correct / total) * 100);
}

// Retrouve (ou crée) la ligne de progression d'un joueur pour un niveau.
// Les doublons éventuels sont ignorés : on garde la plus ancienne.
export async function getProgress(db: any, userId: string, difficulty: string) {
  const rows = await db.entities.QuizUserProgress.filter(
    { user_id: userId, difficulty },
    { sort: "created_date", limit: 5 },
  );
  const list = Array.isArray(rows) ? rows : rows?.items || [];
  if (list.length) return list[0];
  return await db.entities.QuizUserProgress.create({
    user_id: userId,
    difficulty,
    total_questions_played: 0,
    correct_answers: 0,
    best_score_percent: 0,
    unlocked: difficulty === "easy",
    session_question_ids: [],
    session_answered_ids: [],
    session_correct: 0,
  });
}