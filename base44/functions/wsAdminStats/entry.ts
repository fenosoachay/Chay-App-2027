import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { LEVELS, pageItems } from '../../shared/wordScrambleRules.ts';

// Statistiques de « Mots Mélangés » pour l'administration.
// Peu d'appels `aggregate` (limités à ~15/min) : un seul par type de statistique.
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const db = base44.asServiceRole;

    const [counts, progress, solved] = await Promise.all([
      Promise.all(LEVELS.map((difficulty) => db.entities.WordScrambleWord.count({ difficulty }))),
      db.entities.WordScrambleProgress.filter(
        { total_words_played: { $gt: 0 } },
        { limit: 1000, fields: ['user_id', 'difficulty', 'best_percent'] },
      ),
      db.entities.WordScrambleHistory.filter({ solved: true }, { limit: 1000, fields: ['word_id'] }),
    ]);

    const perLevel: Record<string, number> = {};
    LEVELS.forEach((l, i) => { perLevel[l] = counts[i]; });

    const rows = pageItems(progress);
    const players = new Set(rows.map((r: any) => r.user_id)).size;
    const sums: Record<string, { total: number; n: number }> = {};
    for (const r of rows) {
      const s = (sums[r.difficulty] ||= { total: 0, n: 0 });
      s.total += r.best_percent || 0;
      s.n += 1;
    }
    const averageByLevel: Record<string, number> = {};
    for (const [level, s] of Object.entries(sums)) averageByLevel[level] = Math.round(s.total / s.n);

    const tally: Record<string, number> = {};
    for (const h of pageItems(solved)) tally[h.word_id] = (tally[h.word_id] || 0) + 1;
    const ranked = Object.entries(tally)
      .map(([word_id, count]) => ({ word_id, count }))
      .sort((a, b) => b.count - a.count);
    const top = ranked.slice(0, 5);
    const bottom = ranked.slice(-5).reverse();
    const ids = [...new Set([...top, ...bottom].map((r: any) => r.word_id))];
    const words = ids.length
      ? pageItems(await db.entities.WordScrambleWord.filter({ id: { $in: ids } }, { limit: 10 }))
      : [];
    const label = (r: any) => ({ word: words.find((w: any) => w.id === r.word_id)?.word || '—', count: r.count });

    return Response.json({
      total_words: counts.reduce((a: number, b: number) => a + b, 0),
      per_level: perLevel,
      players,
      average_by_level: averageByLevel,
      most_solved: top.map(label),
      least_solved: bottom.map(label),
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}