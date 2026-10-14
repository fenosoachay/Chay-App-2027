import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  LEVELS, UNLOCK_RULES, WORDS_PER_GAME, MASTER_THRESHOLD, getProgress, getCredits, pageItems,
} from '../../shared/wordScrambleRules.ts';

// État des 4 niveaux + crédits du joueur (requêtes en parallèle).
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const db = base44.asServiceRole;

    const [wallet, existing, counts] = await Promise.all([
      getCredits(db, user.id),
      db.entities.WordScrambleProgress.filter({ user_id: user.id }, { sort: 'created_date', limit: 20 }),
      Promise.all(LEVELS.map((difficulty) => db.entities.WordScrambleWord.count({ difficulty }))),
    ]);

    // Plus ancienne progression par niveau ; création des niveaux manquants en parallèle.
    const byLevel: Record<string, any> = {};
    for (const row of pageItems(existing)) {
      if (!byLevel[row.difficulty]) byLevel[row.difficulty] = row;
    }
    const missing = LEVELS.filter((l) => !byLevel[l]);
    const created = await Promise.all(missing.map((l) => getProgress(db, user.id, l)));
    missing.forEach((l, i) => { byLevel[l] = created[i]; });

    const levels: Record<string, unknown> = {};
    LEVELS.forEach((difficulty, i) => {
      const progress = byLevel[difficulty];
      const rule = UNLOCK_RULES[difficulty];
      levels[difficulty] = {
        difficulty,
        unlocked: difficulty === 'easy' ? true : Boolean(progress.unlocked),
        best_percent: progress.best_percent || 0,
        best_score: progress.best_score || 0,
        words_per_game: WORDS_PER_GAME,
        available_words: counts[i],
        requires: rule ? rule.requires : null,
        threshold: rule ? rule.threshold : null,
        master_badge: Boolean(progress.master_badge),
        master_threshold: difficulty === 'ultra_hard' ? MASTER_THRESHOLD : null,
      };
    });
    return Response.json({ levels, credits: wallet.credits ?? 0 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}