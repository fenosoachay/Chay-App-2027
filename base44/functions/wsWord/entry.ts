import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { isLevel, getProgress, scrambleLetters, pageItems } from '../../shared/wordScrambleRules.ts';

// Renvoie le mot n°index de la partie en cours, SANS le mot : uniquement les
// lettres mélangées, sa longueur, et les indices déjà achetés pour ce mot.
// Appeler à nouveau remélange les lettres (bouton « Mélanger », gratuit).
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Connexion requise' }, { status: 401 });

    const { session_id, difficulty, index } = await req.json();
    if (!session_id || !isLevel(difficulty) || !Number.isInteger(index)) {
      return Response.json({ error: 'Requête invalide' }, { status: 400 });
    }
    const db = base44.asServiceRole;

    const progress = await getProgress(db, user.id, difficulty);
    if (progress.session_id !== session_id) {
      return Response.json({ error: 'Partie introuvable' }, { status: 409 });
    }
    const ids: string[] = progress.session_word_ids || [];
    const wordId = ids[index];
    if (!wordId) return Response.json({ error: 'Mot hors partie' }, { status: 404 });

    const entry = await db.entities.WordScrambleWord.get(wordId);
    if (!entry) return Response.json({ error: 'Mot introuvable' }, { status: 404 });

    const categoryRows = entry.category
      ? pageItems(await db.entities.WordScrambleCategory.filter(
        { value: entry.category }, { limit: 20 },
      ))
      : [];
    const activeCategory = categoryRows.find((category: any) => !category.is_deleted);
    const defaultCategoryLabels: Record<string, string> = {
      personnage: 'Personnage',
      lieu: 'Lieu',
      objet: 'Objet',
      concept: 'Concept',
      livre_bible: 'Livre de la Bible',
    };
    const bought = (progress.session_hints || {})[wordId] || {};
    const solvedRows = pageItems(
      await db.entities.WordScrambleHistory.filter(
        { user_id: user.id, session_id, word_id: wordId }, { limit: 1 },
      ),
    );
    return Response.json({
      wordId,
      shuffledLetters: scrambleLetters(entry.word),
      wordLength: entry.word.length,
      category: entry.category || null,
      category_label: activeCategory?.label || defaultCategoryLabels[entry.category] || entry.category || null,
      hintAvailable: true,
      first_letter: bought.first_letter ? entry.word[0] : null,
      hint_phrase: bought.phrase ? entry.hint_phrase : null,
      hint_bible_reference: bought.phrase ? entry.hint_bible_reference || null : null,
      already_solved: solvedRows.length > 0,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}