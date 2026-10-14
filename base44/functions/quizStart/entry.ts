import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { QUESTION_COUNT, getProgress, isLevel, shuffle } from '../../shared/quizRules.ts';

// Démarre une partie : renvoie des questions mélangées SANS le champ correct_answer
// ni l'explication, et mémorise côté serveur quelles questions ont été servies.
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { difficulty } = await req.json();
    if (!isLevel(difficulty)) {
      return Response.json({ error: 'Niveau invalide' }, { status: 400 });
    }
    const db = base44.asServiceRole;

    const progress = await getProgress(db, user.id, difficulty);
    if (difficulty !== 'easy' && !progress.unlocked) {
      return Response.json({ error: 'Niveau verrouillé' }, { status: 403 });
    }

    const wanted = QUESTION_COUNT[difficulty];
    const page = await db.entities.QuizQuestion.filter({ difficulty }, { limit: 1000 });
    const pool = Array.isArray(page) ? page : page?.items || [];
    const picked = shuffle(pool).slice(0, wanted);

    const sessionId = crypto.randomUUID();
    await db.entities.QuizUserProgress.update(progress.id, {
      session_id: sessionId,
      session_question_ids: picked.map((q: any) => q.id),
      session_answered_ids: [],
      session_correct: 0,
    });

    const questions = picked.map((q: any) => ({
      id: q.id,
      question: q.question,
      options: { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d },
      difficulty: q.difficulty,
      category: q.category || null,
    }));

    return Response.json({
      session_id: sessionId,
      progress_id: progress.id,
      difficulty,
      requested: wanted,
      questions,
      limited: questions.length < wanted,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}