import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { LEVELS, QUESTION_COUNT, UNLOCK_RULES, getProgress } from '../../shared/quizRules.ts';

// Renvoie l'état des 3 niveaux (verrouillé ?, meilleur score, nb de questions disponibles).
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const db = base44.asServiceRole;

    const levels: Record<string, unknown> = {};
    for (const difficulty of LEVELS) {
      const progress = await getProgress(db, user.id, difficulty);
      const available = await db.entities.QuizQuestion.count({ difficulty });
      const rule = UNLOCK_RULES[difficulty];
      levels[difficulty] = {
        difficulty,
        unlocked: difficulty === 'easy' ? true : Boolean(progress.unlocked),
        best_score_percent: progress.best_score_percent || 0,
        total_questions_played: progress.total_questions_played || 0,
        question_count: QUESTION_COUNT[difficulty],
        available_questions: available,
        requires: rule ? rule.requires : null,
        threshold: rule ? rule.threshold : null,
      };
    }
    return Response.json({ levels });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}