import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { waitUntil } from 'base44:runtime';
import { isLevel } from '../../shared/quizRules.ts';

// Valide UNE réponse côté serveur. Reçoit { question_id, user_answer, session_id,
// difficulty } et renvoie uniquement { is_correct, correct_answer, explanation }.
// user_answer vide = temps écoulé (comptée fausse).
// Rapide : lecture progression + question en parallèle, puis réponse immédiate ;
// l'enregistrement (progression + historique) se termine en arrière-plan.
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { question_id, user_answer, session_id, difficulty, progress_id } = await req.json();
    if (!question_id || !session_id || !isLevel(difficulty)) {
      return Response.json({ error: 'Requête invalide' }, { status: 400 });
    }
    const letter = typeof user_answer === 'string' ? user_answer.toUpperCase() : '';
    if (letter && !['A', 'B', 'C', 'D'].includes(letter)) {
      return Response.json({ error: 'Réponse invalide' }, { status: 400 });
    }
    const db = base44.asServiceRole;

    // Chemin rapide : lecture par id (progress_id fourni par quizStart). Sans id,
    // on retombe sur la recherche par utilisateur + niveau.
    const loadProgress = () =>
      progress_id
        ? db.entities.QuizUserProgress.get(progress_id).catch(() => null)
        : db.entities.QuizUserProgress.filter(
            { user_id: user.id, difficulty },
            { sort: 'created_date', limit: 1 },
          ).then((rows: any) => (Array.isArray(rows) ? rows : rows?.items || [])[0]);
    const [first, question] = await Promise.all([
      loadProgress(),
      db.entities.QuizQuestion.get(question_id),
    ]);
    // quizStart enregistre la session en arrière-plan : si elle n'est pas encore
    // visible (réponse très rapide), on patiente un court instant et on relit une fois.
    let found = first;
    if (found && found.session_id !== session_id) {
      await new Promise((r) => setTimeout(r, 1500));
      found = await loadProgress();
    }
    // La progression doit appartenir au joueur connecté et au niveau demandé.
    const progress =
      found && found.user_id === user.id && found.difficulty === difficulty ? found : null;
    if (!progress || progress.session_id !== session_id) {
      return Response.json({ error: 'Partie introuvable' }, { status: 409 });
    }

    const served: string[] = progress.session_question_ids || [];
    const answered: string[] = progress.session_answered_ids || [];
    if (!served.includes(question_id)) {
      return Response.json({ error: 'Question hors partie' }, { status: 409 });
    }
    if (answered.includes(question_id)) {
      return Response.json({ error: 'Question déjà répondue' }, { status: 409 });
    }
    if (!question) return Response.json({ error: 'Question introuvable' }, { status: 404 });

    const isCorrect = letter !== '' && letter === question.correct_answer;

    // Enregistrement en arrière-plan : la réponse part tout de suite au joueur.
    waitUntil(
      Promise.all([
        db.entities.QuizUserProgress.update(progress.id, {
          session_answered_ids: [...answered, question_id],
          session_correct: (progress.session_correct || 0) + (isCorrect ? 1 : 0),
          total_questions_played: (progress.total_questions_played || 0) + 1,
          correct_answers: (progress.correct_answers || 0) + (isCorrect ? 1 : 0),
        }),
        db.entities.QuizAnswerHistory.create({
          user_id: user.id,
          question_id,
          session_id,
          selected_answer: letter || 'TIMEOUT',
          is_correct: isCorrect,
          answered_at: new Date().toISOString(),
        }),
      ]).catch(() => {}),
    );

    return Response.json({
      is_correct: isCorrect,
      correct_answer: question.correct_answer,
      explanation: question.explanation || '',
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}