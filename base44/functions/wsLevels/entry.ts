import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  LEVELS, UNLOCK_RULES, WORDS_PER_GAME, MASTER_THRESHOLD, getProgress, getCredits,
} from '../../shared/wordScrambleRules.ts';

// État des 4 niveaux + crédits du joueur.
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const db = base44.asServiceRole;

    const wallet = await getCredits(db, user.id);
    const levels: Record<string, unknown> = {};
    for (const difficulty of LEVELS) {
      const progress = await getProgress(db, user.id, difficulty);
      const available = await db.entities.WordScrambleWord.count({ difficulty });
      const rule = UNLOCK_RULES[difficulty];
      levels[difficulty] = {
        difficulty,
        unlocked: difficulty === 'easy' ? true : Boolean(progress.unlocked),
        best_percent: progress.best_percent || 0,
        best_score: progress.best_score || 0,
        words_per_game: WORDS_PER_GAME,
        available_words: available,
        requires: rule ? rule.requires : null,
        threshold: rule ? rule.threshold : null,
        master_badge: Boolean(progress.master_badge),
        master_threshold: difficulty === 'ultra_hard' ? MASTER_THRESHOLD : null,
      };
    }
    return Response.json({ levels, credits: wallet.credits ?? 0 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}