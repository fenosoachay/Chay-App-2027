import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { HINT_COSTS, isLevel, getProgress, getCredits } from '../../shared/wordScrambleRules.ts';

// Achète un indice (déduit les crédits côté serveur). Un indice déjà acheté pour
// ce mot est renvoyé gratuitement. Types : first_letter (1 crédit), phrase (2 crédits).
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { session_id, difficulty, wordId, hintType } = await req.json();
    if (!session_id || !wordId || !isLevel(difficulty) || !(hintType in HINT_COSTS)) {
      return Response.json({ error: 'Requête invalide' }, { status: 400 });
    }
    const db = base44.asServiceRole;

    const progress = await getProgress(db, user.id, difficulty);
    if (progress.session_id !== session_id || !(progress.session_word_ids || []).includes(wordId)) {
      return Response.json({ error: 'Partie introuvable' }, { status: 409 });
    }
    if ((progress.session_solved_ids || []).includes(wordId)) {
      return Response.json({ error: 'Mot déjà résolu' }, { status: 409 });
    }

    const entry = await db.entities.WordScrambleWord.get(wordId);
    if (!entry) return Response.json({ error: 'Mot introuvable' }, { status: 404 });

    const allHints = { ...(progress.session_hints || {}) };
    const bought = { ...(allHints[wordId] || {}) };
    const wallet = await getCredits(db, user.id);
    let credits = wallet.credits ?? 0;

    if (!bought[hintType]) {
      const cost = HINT_COSTS[hintType];
      if (credits < cost) {
        return Response.json({ error: 'Plus de crédits', creditsRemaining: credits }, { status: 402 });
      }
      credits -= cost;
      await db.entities.WordScrambleCredits.update(wallet.id, { credits });
      bought[hintType] = true;
      allHints[wordId] = bought;
      await db.entities.WordScrambleProgress.update(progress.id, { session_hints: allHints });
    }

    if (hintType === 'first_letter') {
      return Response.json({ hint: entry.word[0], position: 0, creditsRemaining: credits });
    }
    return Response.json({
      hint: entry.hint_phrase,
      reference: entry.hint_bible_reference || null,
      creditsRemaining: credits,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}