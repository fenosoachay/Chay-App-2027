import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  NEXT_LEVEL,
  UNLOCK_RULES,
  getProgress,
  isLevel,
  percent,
} from '../../shared/quizRules.ts';

// Termine une partie. Le score est recalculé depuis les réponses enregistrées par
// le serveur (jamais depuis une valeur envoyée par le client).
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { session_id, difficulty } = await req.json();
    if (!session_id || !isLevel(difficulty)) {
      return Response.json({ error: 'Requête invalide' }, { status: 400 });
    }
    const db = base44.asServiceRole;

    const progress = await getProgress(db, user.id, difficulty);
    if (progress.session_id !== session_id) {
      return Response.json({ error: 'Partie introuvable ou déjà terminée' }, { status: 409 });
    }

    const total = (progress.session_question_ids || []).length;
    const correct = progress.session_correct || 0;
    const score = percent(correct, total);
    const best = Math.max(progress.best_score_percent || 0, score);

    await db.entities.QuizUserProgress.update(progress.id, {
      best_score_percent: best,
      completed_at: new Date().toISOString(),
      session_id: '',
      session_question_ids: [],
      session_answered_ids: [],
      session_correct: 0,
    });

    // Déblocage du niveau suivant si le seuil est atteint.
    let newlyUnlocked: string | null = null;
    const next = NEXT_LEVEL[difficulty];
    if (next && total > 0) {
      const rule = UNLOCK_RULES[next];
      if (rule && score >= rule.threshold) {
        const nextProgress = await getProgress(db, user.id, next);
        if (!nextProgress.unlocked) {
          await db.entities.QuizUserProgress.update(nextProgress.id, { unlocked: true });
          newlyUnlocked = next;
        }
      }
    }

    const nextProgress = next ? await getProgress(db, user.id, next) : null;

    return Response.json({
      difficulty,
      correct,
      total,
      score_percent: score,
      best_score_percent: best,
      newly_unlocked: newlyUnlocked,
      next_level: next,
      next_level_unlocked: nextProgress ? Boolean(nextProgress.unlocked) : false,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}