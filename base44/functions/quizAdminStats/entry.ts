import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { LEVELS } from '../../shared/quizRules.ts';

// Statistiques du quiz pour l'administration.
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const db = base44.asServiceRole;

    const perLevel: Record<string, number> = {};
    for (const difficulty of LEVELS) {
      perLevel[difficulty] = await db.entities.QuizQuestion.count({ difficulty });
    }
    const totalQuestions = LEVELS.reduce((sum, l) => sum + perLevel[l], 0);

    const players = await db.entities.QuizUserProgress.aggregate({
      groupBy: 'user_id',
      sum: ['total_questions_played', 'correct_answers'],
      limit: 1000,
    });
    const rows = players?.rows || [];
    const active = rows.filter((r: any) => (r.sum_total_questions_played || 0) > 0);
    const played = active.reduce((s: number, r: any) => s + (r.sum_total_questions_played || 0), 0);
    const correct = active.reduce((s: number, r: any) => s + (r.sum_correct_answers || 0), 0);

    return Response.json({
      total_questions: totalQuestions,
      per_level: perLevel,
      players: active.length,
      answers_given: played,
      average_score_percent: played ? Math.round((correct / played) * 100) : 0,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}