import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { isLevel } from '../../shared/quizRules.ts';

// Valide UNE réponse côté serveur. Reçoit { question_id, user_answer, session_id,
// difficulty } et renvoie uniquement { is_correct, correct_answer, explanation }.
// user_answer vide = temps écoulé (comptée fausse).
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { question_id, user_answer, session_id, difficulty } = await req.json();
    if (!question_id || !session_id || !isLevel(difficulty)) {
      return Response.json({ error: 'Requête invalide' }, { status: 400 });
    }
    const letter = typeof user_answer === 'string' ? user_answer.toUpperCase() : '';
    if (letter && !['A', 'B', 'C', 'D'].includes(letter)) {
      return Response.json({ error: 'Réponse invalide' }, { status: 400 });
    }
    const db = base44.asServiceRole;

    const rows = await db.entities.QuizUserProgress.filter(
      { user_id: user.id, difficulty },
      { sort: 'created_date', limit: 1 },
    );
    const progress = (Array.isArray(rows) ? rows : rows?.items || [])[0];
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

    const question = await db.entities.QuizQuestion.get(question_id);
    if (!question) return Response.json({ error: 'Question introuvable' }, { status: 404 });

    const isCorrect = letter !== '' && letter === question.correct_answer;

    await db.entities.QuizUserProgress.update(progress.id, {
      session_answered_ids: [...answered, question_id],
      session_correct: (progress.session_correct || 0) + (isCorrect ? 1 : 0),
      total_questions_played: (progress.total_questions_played || 0) + 1,
      correct_answers: (progress.correct_answers || 0) + (isCorrect ? 1 : 0),
    });
    // Course entre deux requêtes simultanées : si la question figure déjà plusieurs
    // fois, on retire notre doublon et on refuse.
    const fresh = await db.entities.QuizUserProgress.get(progress.id);
    const freshIds: string[] = fresh?.session_answered_ids || [];
    if (freshIds.filter((id) => id === question_id).length > 1) {
      const dedup = freshIds.filter((id, i) => freshIds.indexOf(id) === i);
      await db.entities.QuizUserProgress.update(progress.id, {
        session_answered_ids: dedup,
        session_correct: Math.max(0, (fresh.session_correct || 0) - (isCorrect ? 1 : 0)),
        total_questions_played: Math.max(0, (fresh.total_questions_played || 0) - 1),
        correct_answers: Math.max(0, (fresh.correct_answers || 0) - (isCorrect ? 1 : 0)),
      });
      return Response.json({ error: 'Question déjà répondue' }, { status: 409 });
    }
    await db.entities.QuizAnswerHistory.create({
      user_id: user.id,
      question_id,
      session_id,
      selected_answer: letter || 'TIMEOUT',
      is_correct: isCorrect,
      answered_at: new Date().toISOString(),
    });

    return Response.json({
      is_correct: isCorrect,
      correct_answer: question.correct_answer,
      explanation: question.explanation || '',
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}