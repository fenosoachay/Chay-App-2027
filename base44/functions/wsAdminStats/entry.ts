import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { LEVELS, pageItems } from '../../shared/wordScrambleRules.ts';

// Libellés des mots d'un classement (une seule requête).
async function withLabels(db: any, rows: any[]) {
  const ids = rows.map((r: any) => r.word_id);
  const words = ids.length
    ? pageItems(await db.entities.WordScrambleWord.filter({ id: { $in: ids } }, { limit: 10 }))
    : [];
  return rows.map((r: any) => ({
    word: words.find((w: any) => w.id === r.word_id)?.word || '—',
    count: r.count,
  }));
}

// Statistiques de « Mots Mélangés » pour l'administration (requêtes en parallèle).
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const db = base44.asServiceRole;

    const [counts, byUser, byLevel, most, least] = await Promise.all([
      Promise.all(LEVELS.map((difficulty) => db.entities.WordScrambleWord.count({ difficulty }))),
      db.entities.WordScrambleProgress.aggregate({
        query: { total_words_played: { $gt: 0 } }, groupBy: 'user_id', limit: 1000,
      }),
      db.entities.WordScrambleProgress.aggregate({
        query: { total_words_played: { $gt: 0 } }, groupBy: 'difficulty', avg: ['best_percent'], limit: 10,
      }),
      db.entities.WordScrambleHistory.aggregate({ groupBy: 'word_id', sort: '-count', limit: 5 }),
      db.entities.WordScrambleHistory.aggregate({ groupBy: 'word_id', sort: 'count', limit: 5 }),
    ]);

    const perLevel: Record<string, number> = {};
    LEVELS.forEach((l, i) => { perLevel[l] = counts[i]; });

    const averageByLevel: Record<string, number> = {};
    for (const r of byLevel?.rows || []) averageByLevel[r.difficulty] = Math.round(r.avg_best_percent || 0);

    const [mostSolved, leastSolved] = await Promise.all([
      withLabels(db, most?.rows || []),
      withLabels(db, least?.rows || []),
    ]);

    return Response.json({
      total_words: counts.reduce((a: number, b: number) => a + b, 0),
      per_level: perLevel,
      players: (byUser?.rows || []).length,
      average_by_level: averageByLevel,
      most_solved: mostSolved,
      least_solved: leastSolved,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}