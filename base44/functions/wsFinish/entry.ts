import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  CREDITS_PER_GAME, CREDITS_PER_UNLOCK, MASTER_THRESHOLD, NEXT_LEVEL, UNLOCK_RULES,
  getCredits, getProgress, isLevel, maxScore, pageItems, percent,
} from '../../shared/wordScrambleRules.ts';

// Termine une partie : le score est recalculé depuis ce que le serveur a enregistré.
// Les mots non résolus sont révélés ici (la partie est terminée).
// +2 crédits par partie terminée, +5 quand un nouveau niveau est débloqué.
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Connexion requise' }, { status: 401 });

    const { session_id, difficulty } = await req.json();
    if (!session_id || !isLevel(difficulty)) {
      return Response.json({ error: 'Requête invalide' }, { status: 400 });
    }
    const db = base44.asServiceRole;

    const progress = await getProgress(db, user.id, difficulty);
    if (progress.session_id !== session_id) {
      return Response.json({ error: 'Partie introuvable ou déjà terminée' }, { status: 409 });
    }

    const ids: string[] = progress.session_word_ids || [];
    const hintsByWord = progress.session_hints || {};
    const entries = pageItems(
      await db.entities.WordScrambleWord.filter({ id: { $in: ids } }, { limit: 50 }),
    );
    const byId = Object.fromEntries(entries.map((e: any) => [e.id, e]));

    // Source de vérité : l'historique des mots résolus pendant cette partie.
    const solvedRows = pageItems(
      await db.entities.WordScrambleHistory.filter(
        { user_id: user.id, session_id }, { limit: 50 },
      ),
    );
    const solvedById = Object.fromEntries(solvedRows.map((r: any) => [r.word_id, r]));

    const ordered = ids.map((id) => byId[id]).filter(Boolean);
    const maximum = maxScore(ordered);

    const details = ids.map((id) => {
      const e = byId[id];
      const row = solvedById[id];
      const bought = hintsByWord[id] || {};
      const paid = row ? row.hints_used || 0 : (bought.first_letter ? 1 : 0) + (bought.phrase ? 1 : 0);
      return {
        word: e?.word || '',
        solved: Boolean(row),
        hints_used: paid,
        score: row ? row.score_earned || 0 : 0,
        max: e ? e.word.length * 10 : 0,
      };
    });
    const total = details.reduce((sum, d) => sum + d.score, 0);
    const pct = percent(total, maximum);
    const noHints = details.every((d) => d.solved && d.hints_used === 0);

    const best = Math.max(progress.best_score || 0, total);
    const bestPct = Math.max(progress.best_percent || 0, pct);
    const master = difficulty === 'ultra_hard' && pct >= MASTER_THRESHOLD;
    await db.entities.WordScrambleProgress.update(progress.id, {
      best_score: best,
      best_percent: bestPct,
      total_score: (progress.total_score || 0) + total,
      total_words_played: (progress.total_words_played || 0) + details.filter((d) => d.solved).length,
      master_badge: Boolean(progress.master_badge) || master,
      completed_at: new Date().toISOString(),
      session_id: '',
      session_word_ids: [],
      session_hints: {},
    });

    // Déblocage du niveau suivant si le seuil est atteint.
    let newlyUnlocked: string | null = null;
    const next = NEXT_LEVEL[difficulty];
    if (next && ids.length > 0) {
      const rule = UNLOCK_RULES[next];
      if (rule && pct >= rule.threshold) {
        const nextProgress = await getProgress(db, user.id, next);
        if (!nextProgress.unlocked) {
          await db.entities.WordScrambleProgress.update(nextProgress.id, { unlocked: true });
          newlyUnlocked = next;
        }
      }
    }
    const nextProgress = next ? await getProgress(db, user.id, next) : null;

    const wallet = await getCredits(db, user.id);
    const bonus = CREDITS_PER_GAME + (newlyUnlocked ? CREDITS_PER_UNLOCK : 0);
    const credits = (wallet.credits ?? 0) + bonus;
    await db.entities.WordScrambleCredits.update(wallet.id, { credits });

    return Response.json({
      difficulty,
      total_score: total,
      max_score: maximum,
      score_percent: pct,
      best_percent: bestPct,
      perfect: noHints,
      master_badge: master,
      details,
      newly_unlocked: newlyUnlocked,
      next_level: next,
      next_level_unlocked: nextProgress ? Boolean(nextProgress.unlocked) : false,
      credits_earned: bonus,
      credits,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}