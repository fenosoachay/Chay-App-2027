// Bloc 2, lot 2 : jeux — Quiz biblique (quiz*) et Mots Mélangés (ws*).
// Reproduit base44/functions/<nom>/entry.ts. Scores et crédits calculés uniquement côté serveur,
// lectures + écritures de progression en transaction. Appelant identifié par e.auth.
// Les handlers s'exécutent isolés : constantes et règles viennent de lib/games.js.

// ═════════════════════════════ QUIZ ═════════════════════════════════════════

routerAdd('POST', '/api/fn/quizLevels', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const g = require(`${__hooks}/lib/games.js`);
  return fn.run(e, 'quizLevels', 'Erreur interne', () => {
    const user = fn.requireUser(e, 'Connexion requise');
    const levels = {};
    for (const difficulty of g.QUIZ.LEVELS) {
      const p = fn.plain(g.quizProgress($app, user.id, difficulty));
      const rule = g.QUIZ.UNLOCK_RULES[difficulty];
      levels[difficulty] = {
        difficulty,
        unlocked: difficulty === 'easy' ? true : Boolean(p.unlocked),
        best_score_percent: p.best_score_percent || 0,
        total_questions_played: p.total_questions_played || 0,
        question_count: g.QUIZ.QUESTION_COUNT[difficulty],
        available_questions: g.countWhere($app, 'QuizQuestion', 'difficulty', difficulty),
        requires: rule ? rule.requires : null,
        threshold: rule ? rule.threshold : null,
      };
    }
    return { levels };
  });
});

routerAdd('POST', '/api/fn/quizStart', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const g = require(`${__hooks}/lib/games.js`);
  return fn.run(e, 'quizStart', 'Erreur interne', () => {
    const user = fn.requireUser(e, 'Connexion requise');
    const { difficulty } = fn.readBody(e);
    if (!g.isIn(g.QUIZ.LEVELS, difficulty)) throw new fn.HttpError(400, 'Niveau invalide');
    const wanted = g.QUIZ.QUESTION_COUNT[difficulty];

    return fn.tx((txApp) => {
      const progress = g.quizProgress(txApp, user.id, difficulty);
      if (difficulty !== 'easy' && !progress.getBool('unlocked')) return fn.fail(403, 'Niveau verrouillé');
      const pool = txApp.findRecordsByFilter('QuizQuestion', 'difficulty = {:d}', '', 1000, 0, { d: difficulty });
      if (pool.length < wanted) {
        return fn.fail(409, `Ce niveau nécessite ${wanted} questions. Il en manque ${wanted - pool.length}.`,
          { requested: wanted, available: pool.length });
      }
      const picked = fn.shuffle(pool).slice(0, wanted);
      const sessionId = fn.uuid();
      progress.set('session_id', sessionId);
      progress.set('session_question_ids', picked.map((q) => q.id));
      progress.set('session_answered_ids', []);
      progress.set('session_correct', 0);
      txApp.save(progress);

      const questions = picked.map((q) => ({
        id: q.id,
        question: q.getString('question'),
        options: { A: q.getString('option_a'), B: q.getString('option_b'), C: q.getString('option_c'), D: q.getString('option_d') },
        difficulty: q.getString('difficulty'),
        category: q.getString('category') || null,
      }));
      return fn.ok({
        session_id: sessionId,
        progress_id: progress.id,
        difficulty,
        requested: wanted,
        questions,
        limited: questions.length < wanted,
      });
    });
  });
});

routerAdd('POST', '/api/fn/quizAnswer', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const g = require(`${__hooks}/lib/games.js`);
  return fn.run(e, 'quizAnswer', 'Erreur interne', () => {
    const user = fn.requireUser(e, 'Connexion requise');
    const body = fn.readBody(e);
    const questionId = body.question_id;
    const sessionId = body.session_id;
    const difficulty = body.difficulty;
    if (typeof questionId !== 'string' || !questionId || questionId.length > g.ID_MAX
      || typeof sessionId !== 'string' || !sessionId || sessionId.length > g.ID_MAX
      || !g.isIn(g.QUIZ.LEVELS, difficulty)) {
      throw new fn.HttpError(400, 'Requête invalide');
    }
    const letter = typeof body.user_answer === 'string' ? body.user_answer.toUpperCase() : '';
    if (letter && ['A', 'B', 'C', 'D'].indexOf(letter) === -1) throw new fn.HttpError(400, 'Réponse invalide');

    return fn.tx((txApp) => {
      // La progression est toujours celle de l'appelant (progress_id du client ignoré).
      const progress = fn.findOne(txApp, 'QuizUserProgress', 'user_id = {:u} && difficulty = {:d}',
        'base44_created_date,created', { u: user.id, d: difficulty });
      if (!progress || progress.getString('session_id') !== sessionId) return fn.fail(409, 'Partie introuvable');
      const p = fn.plain(progress);
      const served = g.arr(p.session_question_ids);
      const answered = g.arr(p.session_answered_ids);
      if (served.indexOf(questionId) === -1) return fn.fail(409, 'Question hors partie');
      if (answered.indexOf(questionId) !== -1) return fn.fail(409, 'Question déjà répondue');
      let question = null;
      try { question = txApp.findRecordById('QuizQuestion', questionId); } catch (_) { question = null; }
      if (!question) return fn.fail(404, 'Question introuvable');

      const correctAnswer = question.getString('correct_answer');
      const isCorrect = letter !== '' && letter === correctAnswer;
      progress.set('session_answered_ids', answered.concat([questionId]));
      progress.set('session_correct', g.num(p.session_correct) + (isCorrect ? 1 : 0));
      progress.set('total_questions_played', g.num(p.total_questions_played) + 1);
      progress.set('correct_answers', g.num(p.correct_answers) + (isCorrect ? 1 : 0));
      txApp.save(progress);
      txApp.save(fn.newRecord(txApp, 'QuizAnswerHistory', {
        user_id: user.id,
        question_id: questionId,
        session_id: sessionId,
        selected_answer: letter || 'TIMEOUT',
        is_correct: isCorrect,
        answered_at: new DateTime(),
      }));
      return fn.ok({ is_correct: isCorrect, correct_answer: correctAnswer, explanation: question.getString('explanation') || '' });
    });
  });
});

routerAdd('POST', '/api/fn/quizFinish', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const g = require(`${__hooks}/lib/games.js`);
  return fn.run(e, 'quizFinish', 'Erreur interne', () => {
    const user = fn.requireUser(e, 'Connexion requise');
    const { session_id: sessionId, difficulty } = fn.readBody(e);
    if (typeof sessionId !== 'string' || !sessionId || sessionId.length > g.ID_MAX || !g.isIn(g.QUIZ.LEVELS, difficulty)) {
      throw new fn.HttpError(400, 'Requête invalide');
    }
    return fn.tx((txApp) => {
      const nextLevel = g.QUIZ.NEXT_LEVEL[difficulty];
      const progress = g.quizProgress(txApp, user.id, difficulty);
      const nextProgress = nextLevel ? g.quizProgress(txApp, user.id, nextLevel) : null;
      if (progress.getString('session_id') !== sessionId) return fn.fail(409, 'Partie introuvable ou déjà terminée');

      // Score recalculé depuis ce que le serveur a enregistré (jamais depuis le client).
      const p = fn.plain(progress);
      const total = g.arr(p.session_question_ids).length;
      const correct = g.num(p.session_correct);
      const score = g.percent(correct, total);
      const best = Math.max(g.num(p.best_score_percent), score);

      progress.set('best_score_percent', best);
      progress.set('completed_at', new DateTime());
      progress.set('session_id', '');
      progress.set('session_question_ids', []);
      progress.set('session_answered_ids', []);
      progress.set('session_correct', 0);
      txApp.save(progress);

      let newlyUnlocked = null;
      let nextUnlocked = nextProgress ? nextProgress.getBool('unlocked') : false;
      if (nextLevel && nextProgress && total > 0) {
        const rule = g.QUIZ.UNLOCK_RULES[nextLevel];
        if (rule && score >= rule.threshold && !nextProgress.getBool('unlocked')) {
          nextProgress.set('unlocked', true);
          txApp.save(nextProgress);
          newlyUnlocked = nextLevel;
          nextUnlocked = true;
        }
      }
      return fn.ok({
        difficulty,
        correct,
        total,
        score_percent: score,
        best_score_percent: best,
        newly_unlocked: newlyUnlocked,
        next_level: nextLevel,
        next_level_unlocked: nextUnlocked,
      });
    });
  });
});

routerAdd('POST', '/api/fn/quizAdminStats', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const g = require(`${__hooks}/lib/games.js`);
  return fn.run(e, 'quizAdminStats', 'Erreur interne', () => {
    fn.requireUser(e, 'Unauthorized');
    fn.requireAdmin(e, 'Forbidden');
    const perLevel = {};
    let totalQuestions = 0;
    for (const d of g.QUIZ.LEVELS) {
      perLevel[d] = g.countWhere($app, 'QuizQuestion', 'difficulty', d);
      totalQuestions += perLevel[d];
    }
    // Équivalent de aggregate({ groupBy: 'user_id', sum: [...], limit: 1000 }).
    const rows = $app.findAllRecords('QuizUserProgress');
    const byUser = {};
    for (const r of rows) {
      const u = r.getString('user_id');
      const s = byUser[u] || (byUser[u] = { played: 0, correct: 0 });
      s.played += g.num(r.get('total_questions_played'));
      s.correct += g.num(r.get('correct_answers'));
    }
    const active = Object.keys(byUser).slice(0, 1000).map((k) => byUser[k]).filter((s) => s.played > 0);
    const played = active.reduce((a, s) => a + s.played, 0);
    const correct = active.reduce((a, s) => a + s.correct, 0);
    return {
      total_questions: totalQuestions,
      per_level: perLevel,
      players: active.length,
      answers_given: played,
      average_score_percent: played ? Math.round((correct / played) * 100) : 0,
    };
  });
});

// ═════════════════════════ MOTS MÉLANGÉS ════════════════════════════════════

routerAdd('POST', '/api/fn/wsLevels', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const g = require(`${__hooks}/lib/games.js`);
  return fn.run(e, 'wsLevels', 'Erreur interne', () => {
    const user = fn.requireUser(e, 'Connexion requise');
    const wallet = g.wsCredits($app, user.id);
    const levels = {};
    for (const difficulty of g.WS.LEVELS) {
      const p = fn.plain(g.wsProgress($app, user.id, difficulty));
      const rule = g.WS.UNLOCK_RULES[difficulty];
      levels[difficulty] = {
        difficulty,
        unlocked: difficulty === 'easy' ? true : Boolean(p.unlocked),
        best_percent: p.best_percent || 0,
        best_score: p.best_score || 0,
        words_per_game: g.WS.WORDS_PER_GAME,
        available_words: g.countWhere($app, 'WordScrambleWord', 'difficulty', difficulty),
        requires: rule ? rule.requires : null,
        threshold: rule ? rule.threshold : null,
        master_badge: Boolean(p.master_badge),
        master_threshold: difficulty === 'ultra_hard' ? g.WS.MASTER_THRESHOLD : null,
      };
    }
    return { levels, credits: g.num(wallet.get('credits')) };
  });
});

routerAdd('POST', '/api/fn/wsStart', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const g = require(`${__hooks}/lib/games.js`);
  return fn.run(e, 'wsStart', 'Erreur interne', () => {
    const user = fn.requireUser(e, 'Connexion requise');
    const { difficulty } = fn.readBody(e);
    if (!g.isIn(g.WS.LEVELS, difficulty)) throw new fn.HttpError(400, 'Niveau invalide');
    return fn.tx((txApp) => {
      const progress = g.wsProgress(txApp, user.id, difficulty);
      if (difficulty !== 'easy' && !progress.getBool('unlocked')) return fn.fail(403, 'Niveau verrouillé');
      const pool = txApp.findRecordsByFilter('WordScrambleWord', 'difficulty = {:d}', '', 1000, 0, { d: difficulty });
      const picked = fn.shuffle(pool).slice(0, g.WS.WORDS_PER_GAME);
      if (!picked.length) return fn.fail(404, 'Aucun mot disponible pour ce niveau.');
      const sessionId = fn.uuid();
      progress.set('session_id', sessionId);
      progress.set('session_word_ids', picked.map((w) => w.id));
      progress.set('session_hints', {});
      txApp.save(progress);
      const wallet = g.wsCredits(txApp, user.id);
      return fn.ok({
        session_id: sessionId,
        difficulty,
        total: picked.length,
        requested: g.WS.WORDS_PER_GAME,
        credits: g.num(wallet.get('credits')),
      });
    });
  });
});

routerAdd('POST', '/api/fn/wsWord', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const g = require(`${__hooks}/lib/games.js`);
  return fn.run(e, 'wsWord', 'Erreur interne', () => {
    const user = fn.requireUser(e, 'Connexion requise');
    const { session_id: sessionId, difficulty, index } = fn.readBody(e);
    if (typeof sessionId !== 'string' || !sessionId || sessionId.length > g.ID_MAX
      || !g.isIn(g.WS.LEVELS, difficulty) || !Number.isInteger(index)) {
      throw new fn.HttpError(400, 'Requête invalide');
    }
    const progress = g.wsProgress($app, user.id, difficulty);
    if (progress.getString('session_id') !== sessionId) throw new fn.HttpError(409, 'Partie introuvable');
    const p = fn.plain(progress);
    const wordId = g.arr(p.session_word_ids)[index];
    if (!wordId) throw new fn.HttpError(404, 'Mot hors partie');
    const entry = fn.findById('WordScrambleWord', wordId);
    if (!entry) throw new fn.HttpError(404, 'Mot introuvable');

    const word = entry.getString('word');
    const category = entry.getString('category');
    const categories = category
      ? $app.findRecordsByFilter('WordScrambleCategory', 'value = {:v}', '', 20, 0, { v: category })
      : [];
    const active = categories.filter((c) => !c.getBool('is_deleted'))[0];
    const defaults = { personnage: 'Personnage', lieu: 'Lieu', objet: 'Objet', concept: 'Concept', livre_bible: 'Livre de la Bible' };
    const bought = g.obj(g.obj(p.session_hints)[wordId]);
    const solved = fn.findOne($app, 'WordScrambleHistory', 'user_id = {:u} && session_id = {:s} && word_id = {:w}', '',
      { u: user.id, s: sessionId, w: wordId });
    return {
      wordId,
      shuffledLetters: g.scrambleLetters(word),
      wordLength: word.length,
      category: category || null,
      category_label: (active && active.getString('label')) || defaults[category] || category || null,
      hintAvailable: true,
      first_letter: bought.first_letter ? word[0] : null,
      hint_phrase: bought.phrase ? entry.getString('hint_phrase') : null,
      hint_bible_reference: bought.phrase ? (entry.getString('hint_bible_reference') || null) : null,
      already_solved: Boolean(solved),
    };
  });
});

routerAdd('POST', '/api/fn/wsAnswer', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const g = require(`${__hooks}/lib/games.js`);
  return fn.run(e, 'wsAnswer', 'Erreur interne', () => {
    const user = fn.requireUser(e, 'Connexion requise');
    const { session_id: sessionId, difficulty, wordId, userAnswer } = fn.readBody(e);
    if (typeof sessionId !== 'string' || !sessionId || sessionId.length > g.ID_MAX
      || typeof wordId !== 'string' || !wordId || wordId.length > g.ID_MAX
      || !g.isIn(g.WS.LEVELS, difficulty) || typeof userAnswer !== 'string' || userAnswer.length > 200) {
      throw new fn.HttpError(400, 'Requête invalide');
    }
    return fn.tx((txApp) => {
      const progress = g.wsProgress(txApp, user.id, difficulty);
      if (progress.getString('session_id') !== sessionId) return fn.fail(409, 'Partie introuvable');
      const p = fn.plain(progress);
      if (g.arr(p.session_word_ids).indexOf(wordId) === -1) return fn.fail(409, 'Mot hors partie');
      // Vérification et écriture dans la même transaction : pas de doublon possible.
      if (fn.findOne(txApp, 'WordScrambleHistory', 'user_id = {:u} && session_id = {:s} && word_id = {:w}', '',
        { u: user.id, s: sessionId, w: wordId })) {
        return fn.fail(409, 'Mot déjà résolu');
      }
      let entry = null;
      try { entry = txApp.findRecordById('WordScrambleWord', wordId); } catch (_) { entry = null; }
      if (!entry) return fn.fail(404, 'Mot introuvable');
      const word = entry.getString('word');
      if (g.normalizeWord(userAnswer) !== word) return fn.ok({ correct: false });

      const bought = g.obj(g.obj(p.session_hints)[wordId]);
      const paidHints = (bought.first_letter ? 1 : 0) + (bought.phrase ? 1 : 0);
      const score = g.wordScore(word, paidHints);
      txApp.save(fn.newRecord(txApp, 'WordScrambleHistory', {
        user_id: user.id,
        word_id: wordId,
        session_id: sessionId,
        difficulty,
        score_earned: score,
        hints_used: paidHints,
        solved: true,
        played_at: new DateTime(),
      }));
      return fn.ok({
        correct: true,
        score,
        word,
        hintPhrase: entry.getString('hint_phrase'),
        hintReference: entry.getString('hint_bible_reference') || null,
        hintsUsed: paidHints,
      });
    });
  });
});

routerAdd('POST', '/api/fn/wsHint', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const g = require(`${__hooks}/lib/games.js`);
  return fn.run(e, 'wsHint', 'Erreur interne', () => {
    const user = fn.requireUser(e, 'Connexion requise');
    const { session_id: sessionId, difficulty, wordId, hintType } = fn.readBody(e);
    if (typeof sessionId !== 'string' || !sessionId || sessionId.length > g.ID_MAX
      || typeof wordId !== 'string' || !wordId || wordId.length > g.ID_MAX
      || !g.isIn(g.WS.LEVELS, difficulty) || !g.isIn(Object.keys(g.WS.HINT_COSTS), hintType)) {
      throw new fn.HttpError(400, 'Requête invalide');
    }
    return fn.tx((txApp) => {
      const progress = g.wsProgress(txApp, user.id, difficulty);
      const p = fn.plain(progress);
      if (progress.getString('session_id') !== sessionId || g.arr(p.session_word_ids).indexOf(wordId) === -1) {
        return fn.fail(409, 'Partie introuvable');
      }
      if (fn.findOne(txApp, 'WordScrambleHistory', 'user_id = {:u} && session_id = {:s} && word_id = {:w}', '',
        { u: user.id, s: sessionId, w: wordId })) {
        return fn.fail(409, 'Mot déjà résolu');
      }
      let entry = null;
      try { entry = txApp.findRecordById('WordScrambleWord', wordId); } catch (_) { entry = null; }
      if (!entry) return fn.fail(404, 'Mot introuvable');

      const allHints = Object.assign({}, g.obj(p.session_hints));
      const bought = Object.assign({}, g.obj(allHints[wordId]));
      const wallet = g.wsCredits(txApp, user.id);
      let credits = g.num(wallet.get('credits'));
      if (!bought[hintType]) {
        const cost = g.WS.HINT_COSTS[hintType];
        if (credits < cost) return fn.fail(402, 'Plus de crédits', { creditsRemaining: credits });
        credits -= cost;
        wallet.set('credits', credits);
        txApp.save(wallet);
        bought[hintType] = true;
        allHints[wordId] = bought;
        progress.set('session_hints', allHints);
        txApp.save(progress);
      }
      const word = entry.getString('word');
      if (hintType === 'first_letter') return fn.ok({ hint: word[0], position: 0, creditsRemaining: credits });
      return fn.ok({
        hint: entry.getString('hint_phrase'),
        reference: entry.getString('hint_bible_reference') || null,
        creditsRemaining: credits,
      });
    });
  });
});

routerAdd('POST', '/api/fn/wsFinish', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const g = require(`${__hooks}/lib/games.js`);
  return fn.run(e, 'wsFinish', 'Erreur interne', () => {
    const user = fn.requireUser(e, 'Connexion requise');
    const { session_id: sessionId, difficulty } = fn.readBody(e);
    if (typeof sessionId !== 'string' || !sessionId || sessionId.length > g.ID_MAX || !g.isIn(g.WS.LEVELS, difficulty)) {
      throw new fn.HttpError(400, 'Requête invalide');
    }
    return fn.tx((txApp) => {
      const progress = g.wsProgress(txApp, user.id, difficulty);
      if (progress.getString('session_id') !== sessionId) return fn.fail(409, 'Partie introuvable ou déjà terminée');
      const p = fn.plain(progress);
      const ids = g.arr(p.session_word_ids);
      const hintsByWord = g.obj(p.session_hints);

      const byId = {};
      for (const id of ids) {
        try { byId[id] = txApp.findRecordById('WordScrambleWord', id); } catch (_) { /* mot supprimé */ }
      }
      // Source de vérité : historique des mots résolus pendant cette partie.
      const solvedById = {};
      for (const r of txApp.findRecordsByFilter('WordScrambleHistory', 'user_id = {:u} && session_id = {:s}', '', 50, 0,
        { u: user.id, s: sessionId })) {
        solvedById[r.getString('word_id')] = r;
      }
      const maximum = ids.reduce((s, id) => s + (byId[id] ? byId[id].getString('word').length * g.WS.POINTS_PER_LETTER : 0), 0);
      const details = ids.map((id) => {
        const entry = byId[id];
        const row = solvedById[id];
        const b = g.obj(hintsByWord[id]);
        const paid = row ? g.num(row.get('hints_used')) : (b.first_letter ? 1 : 0) + (b.phrase ? 1 : 0);
        return {
          word: entry ? entry.getString('word') : '',
          solved: Boolean(row),
          hints_used: paid,
          score: row ? g.num(row.get('score_earned')) : 0,
          max: entry ? entry.getString('word').length * 10 : 0,
        };
      });
      const total = details.reduce((s, d) => s + d.score, 0);
      const pct = g.percent(total, maximum);
      const noHints = details.every((d) => d.solved && d.hints_used === 0);
      const bestPct = Math.max(g.num(p.best_percent), pct);
      const master = difficulty === 'ultra_hard' && pct >= g.WS.MASTER_THRESHOLD;

      progress.set('best_score', Math.max(g.num(p.best_score), total));
      progress.set('best_percent', bestPct);
      progress.set('total_score', g.num(p.total_score) + total);
      progress.set('total_words_played', g.num(p.total_words_played) + details.filter((d) => d.solved).length);
      progress.set('master_badge', Boolean(p.master_badge) || master);
      progress.set('completed_at', new DateTime());
      progress.set('session_id', '');
      progress.set('session_word_ids', []);
      progress.set('session_hints', {});
      txApp.save(progress);

      let newlyUnlocked = null;
      const next = g.WS.NEXT_LEVEL[difficulty];
      const nextProgress = next ? g.wsProgress(txApp, user.id, next) : null;
      if (next && ids.length > 0) {
        const rule = g.WS.UNLOCK_RULES[next];
        if (rule && pct >= rule.threshold && !nextProgress.getBool('unlocked')) {
          nextProgress.set('unlocked', true);
          txApp.save(nextProgress);
          newlyUnlocked = next;
        }
      }
      const wallet = g.wsCredits(txApp, user.id);
      const bonus = g.WS.CREDITS_PER_GAME + (newlyUnlocked ? g.WS.CREDITS_PER_UNLOCK : 0);
      const credits = g.num(wallet.get('credits')) + bonus;
      wallet.set('credits', credits);
      txApp.save(wallet);

      return fn.ok({
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
        next_level_unlocked: nextProgress ? nextProgress.getBool('unlocked') : false,
        credits_earned: bonus,
        credits,
      });
    });
  });
});

routerAdd('POST', '/api/fn/wsAdminStats', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const g = require(`${__hooks}/lib/games.js`);
  return fn.run(e, 'wsAdminStats', 'Erreur interne', () => {
    fn.requireUser(e, 'Unauthorized');
    fn.requireAdmin(e, 'Forbidden');
    const perLevel = {};
    let totalWords = 0;
    for (const d of g.WS.LEVELS) {
      perLevel[d] = g.countWhere($app, 'WordScrambleWord', 'difficulty', d);
      totalWords += perLevel[d];
    }
    const rows = $app.findRecordsByFilter('WordScrambleProgress', 'total_words_played > 0', '', 1000, 0);
    const players = {};
    const sums = {};
    for (const r of rows) {
      players[r.getString('user_id')] = true;
      const d = r.getString('difficulty');
      const s = sums[d] || (sums[d] = { total: 0, n: 0 });
      s.total += g.num(r.get('best_percent'));
      s.n += 1;
    }
    const averageByLevel = {};
    for (const d of Object.keys(sums)) averageByLevel[d] = Math.round(sums[d].total / sums[d].n);

    const tally = {};
    for (const h of $app.findRecordsByFilter('WordScrambleHistory', 'solved = true', '', 1000, 0)) {
      const w = h.getString('word_id');
      tally[w] = (tally[w] || 0) + 1;
    }
    const ranked = Object.keys(tally).map((wordId) => ({ word_id: wordId, count: tally[wordId] }))
      .sort((a, b) => b.count - a.count);
    const top = ranked.slice(0, 5);
    const bottom = ranked.slice(-5).reverse();
    const label = (r) => {
      const w = fn.findById('WordScrambleWord', r.word_id);
      return { word: (w && w.getString('word')) || '—', count: r.count };
    };
    return {
      total_words: totalWords,
      per_level: perLevel,
      players: Object.keys(players).length,
      average_by_level: averageByLevel,
      most_solved: top.map(label),
      least_solved: bottom.map(label),
    };
  });
});
