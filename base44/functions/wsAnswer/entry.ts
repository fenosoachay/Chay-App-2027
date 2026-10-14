import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  isLevel, getProgress, normalizeWord, wordScore, pageItems,
} from '../../shared/wordScrambleRules.ts';

// Valide UNE réponse côté serveur. Le mot n'est révélé qu'en cas de bonne réponse.
// Le score est calculé par le serveur à partir des indices réellement achetés
// (jamais depuis une valeur envoyée par le client). L'historique (une ligne par
// mot résolu et par partie) est la source de vérité du score de la partie.
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { session_id, difficulty, wordId, userAnswer } = await req.json();
    if (!session_id || !wordId || !isLevel(difficulty) || typeof userAnswer !== 'string') {
      return Response.json({ error: 'Requête invalide' }, { status: 400 });
    }
    const db = base44.asServiceRole;

    const progress = await getProgress(db, user.id, difficulty);
    if (progress.session_id !== session_id) {
      return Response.json({ error: 'Partie introuvable' }, { status: 409 });
    }
    if (!(progress.session_word_ids || []).includes(wordId)) {
      return Response.json({ error: 'Mot hors partie' }, { status: 409 });
    }

    const already = pageItems(
      await db.entities.WordScrambleHistory.filter(
        { user_id: user.id, session_id, word_id: wordId }, { limit: 1 },
      ),
    );
    if (already.length) return Response.json({ error: 'Mot déjà résolu' }, { status: 409 });

    const entry = await db.entities.WordScrambleWord.get(wordId);
    if (!entry) return Response.json({ error: 'Mot introuvable' }, { status: 404 });

    if (normalizeWord(userAnswer) !== entry.word) {
      return Response.json({ correct: false });
    }

    const bought = (progress.session_hints || {})[wordId] || {};
    const paidHints = (bought.first_letter ? 1 : 0) + (bought.phrase ? 1 : 0);
    const score = wordScore(entry.word, paidHints);

    await db.entities.WordScrambleHistory.create({
      user_id: user.id,
      word_id: wordId,
      session_id,
      difficulty,
      score_earned: score,
      hints_used: paidHints,
      solved: true,
      played_at: new Date().toISOString(),
    });
    // Course entre deux requêtes simultanées : si le mot figure deux fois, on refuse le doublon.
    const rows = pageItems(
      await db.entities.WordScrambleHistory.filter(
        { user_id: user.id, session_id, word_id: wordId }, { sort: 'created_date', limit: 5 },
      ),
    );
    if (rows.length > 1) {
      for (const dup of rows.slice(1)) await db.entities.WordScrambleHistory.delete(dup.id);
      return Response.json({ error: 'Mot déjà résolu' }, { status: 409 });
    }

    return Response.json({
      correct: true,
      score,
      word: entry.word,
      hintPhrase: entry.hint_phrase,
      hintReference: entry.hint_bible_reference || null,
      hintsUsed: paidHints,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}