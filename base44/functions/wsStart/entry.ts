import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  WORDS_PER_GAME, getProgress, getCredits, isLevel, pageItems, shuffle,
} from '../../shared/wordScrambleRules.ts';

// Démarre une partie : tire 5 mots au hasard et mémorise la partie côté serveur.
// Aucun mot n'est renvoyé ici (voir wsWord pour les lettres mélangées).
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Connexion requise' }, { status: 401 });

    const { difficulty } = await req.json();
    if (!isLevel(difficulty)) return Response.json({ error: 'Niveau invalide' }, { status: 400 });
    const db = base44.asServiceRole;

    const progress = await getProgress(db, user.id, difficulty);
    if (difficulty !== 'easy' && !progress.unlocked) {
      return Response.json({ error: 'Niveau verrouillé' }, { status: 403 });
    }

    const pool = pageItems(
      await db.entities.WordScrambleWord.filter({ difficulty }, { limit: 1000, fields: ['word'] }),
    );
    const picked = shuffle(pool).slice(0, WORDS_PER_GAME);
    if (!picked.length) {
      return Response.json({ error: 'Aucun mot disponible pour ce niveau.' }, { status: 404 });
    }

    const sessionId = crypto.randomUUID();
    await db.entities.WordScrambleProgress.update(progress.id, {
      session_id: sessionId,
      session_word_ids: picked.map((w: any) => w.id),
      session_hints: {},
    });
    const wallet = await getCredits(db, user.id);

    return Response.json({
      session_id: sessionId,
      difficulty,
      total: picked.length,
      requested: WORDS_PER_GAME,
      credits: wallet.credits ?? 0,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}