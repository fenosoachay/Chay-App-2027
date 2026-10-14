import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { LEVELS, pageItems } from '../../shared/wordScrambleRules.ts';

// Statistiques de « Mots Mélangés » pour l'administration.
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const db = base44.asServiceRole;

    const perLevel: Record<string, number> = {};
    for (const difficulty of LEVELS) {
      perLevel[difficulty] = await db.entities.WordScrambleWord.count({ difficulty });
    }
    const totalWords = LEVELS.reduce((sum, l) => sum + perLevel[l], 0);

    // Joueurs actifs + score moyen (en % du maximum) par niveau.
    const byUser = await db.entities.WordScrambleProgress.aggregate({
      groupBy: 'user_id', sum: ['total_words_played'], limit: 1000,
    });
    const players = (byUser?.rows || []).filter((r: any) => (r.sum_total_words_played || 0) > 0).length;

    const byLevel = await db.entities.WordScrambleProgress.aggregate({
      query: { total_words_played: { $gt: 0 } },
      groupBy: 'difficulty', avg: ['best_percent'], limit: 10,
    });
    const averageByLevel: Record<string, number> = {};
    for (const r of byLevel?.rows || []) {
      averageByLevel[r.difficulty] = Math.round(r.avg_best_percent || 0);
    }

    // Mots les plus réussis : mots résolus (historique = résolutions uniquement).
    const solvedRows = await db.entities.WordScrambleHistory.aggregate({
      groupBy: 'word_id', sort: '-count', limit: 5,
    });
    const topIds = (solvedRows?.rows || []).map((r: any) => r.word_id);
    const topWords = topIds.length
      ? pageItems(await db.entities.WordScrambleWord.filter({ id: { $in: topIds } }, { limit: 10 }))
      : [];
    const labelOf = (id: string) => topWords.find((w: any) => w.id === id)?.word || '—';
    const mostSolved = (solvedRows?.rows || []).map((r: any) => ({ word: labelOf(r.word_id), count: r.count }));

    // Mots les plus ratés : les mots avec le moins de résolutions (parmi ceux déjà servis ou non).
    const leastRows = await db.entities.WordScrambleHistory.aggregate({
      groupBy: 'word_id', sort: 'count', limit: 5,
    });
    const leastIds = (leastRows?.rows || []).map((r: any) => r.word_id);
    const leastWords = leastIds.length
      ? pageItems(await db.entities.WordScrambleWord.filter({ id: { $in: leastIds } }, { limit: 10 }))
      : [];
    const leastLabel = (id: string) => leastWords.find((w: any) => w.id === id)?.word || '—';
    const leastSolved = (leastRows?.rows || []).map((r: any) => ({ word: leastLabel(r.word_id), count: r.count }));

    return Response.json({
      total_words: totalWords,
      per_level: perLevel,
      players,
      average_by_level: averageByLevel,
      most_solved: mostSolved,
      least_solved: leastSolved,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}