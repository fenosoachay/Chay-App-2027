#!/usr/bin/env node
// Tests d'intégration du bloc 2, lot 2 (messagerie, prière, jeux) contre le BAC À SABLE LOCAL.
//   node pocketbase/tests/fn-lot2.integration.mjs
// Comptes : membre (A), membre2 (B), admin, superuser (préparation / vérification uniquement).
// Tout ce que le test crée est supprimé à la fin ; aucune donnée personnelle n'est affichée.

import { fn, http, keysOf, loadCreds, login, makeChecker, q, realtime, sameKeys, sleep } from './lib.mjs';

const creds = loadCreds(['superuser', 'admin', 'membre', 'membre2']);
const { check, done } = makeChecker();

const su = (await login('_superusers', creds.superuser)).token;
const A = await login('users', creds.membre);
const B = await login('users', creds.membre2);
const ADM = await login('users', creds.admin);
const asSu = { token: su };
const TEST_USERS = [A.id, B.id, ADM.id];
const created = { Conversation: [], Message: [] };

const get = async (col, id, fields = '') => (await http('GET', `/api/collections/${col}/records/${id}${fields ? `?fields=${fields}` : ''}`, asSu)).data;
const listAs = async (token, col, filter) => http('GET', `/api/collections/${col}/records?perPage=50${filter ? `&filter=${q(filter)}` : ''}`, { token });

try {
  // ═══════════════════════════ MESSAGERIE ═══════════════════════════════════
  console.log('\n■ Messagerie : createMessage');
  const conv = await http('POST', '/api/collections/Conversation/records', { ...asSu, body: { type: 'direct', participant_ids: [A.id, ADM.id], created_by_id: A.id } });
  if (conv.status !== 200) throw new Error(`préparation : conversation HTTP ${conv.status}`);
  const convId = conv.data.id;
  created.Conversation.push(convId);

  {
    const r = await fn('createMessage', { body: { conversation_id: convId, text: 'x' } });
    check('anonyme -> 401 { error: "Unauthorized" }', r.status === 401 && r.data?.error === 'Unauthorized');
  }
  for (const [label, body, status, msg] of [
    ['sans conversation_id', { text: 'x' }, 400, 'conversation_id et text ou image_url requis'],
    ['sans texte ni image', { conversation_id: convId }, 400, 'conversation_id et text ou image_url requis'],
    ['texte vide (espaces)', { conversation_id: convId, text: '   ' }, 400, 'conversation_id et text ou image_url requis'],
    ['conversation_id non texte', { conversation_id: 12, text: 'x' }, 400, 'conversation_id et text ou image_url requis'],
    ['texte > 20 000 caractères', { conversation_id: convId, text: 'a'.repeat(20001) }, 400, 'Requête invalide'],
    ['conversation inexistante', { conversation_id: 'f'.repeat(24), text: 'x' }, 404, 'conversation not found'],
  ]) {
    const r = await fn('createMessage', { token: A.token, body });
    check(`${label} -> ${status} { error: "${msg}" }`, r.status === status && r.data?.error === msg, `HTTP ${r.status}`);
  }
  {
    const r = await fn('createMessage', { token: B.token, body: { conversation_id: convId, text: 'intrus' } });
    check('membre B hors conversation -> 403 { error: "Forbidden" }', r.status === 403 && r.data?.error === 'Forbidden');
  }

  // Temps réel : A (participant), admin (participant), B (non participant) abonnés à Message.
  const subA = await realtime(A.token, 'Message');
  const subB = await realtime(B.token, 'Message');
  const subAdm = await realtime(ADM.token, 'Message');
  check('abonnements temps réel acceptés', subA.status === 204 && subB.status === 204 && subAdm.status === 204, `${subA.status}/${subB.status}/${subAdm.status}`);

  let msgId = null;
  {
    const r = await fn('createMessage', {
      token: A.token,
      body: { conversation_id: convId, text: '  bonjour  ', sender_id: B.id, created_by_id: B.id, participant_ids: [B.id], read_by: [B.id] },
    });
    check('membre A participant -> 200 { id, created_date, notification_error }',
      r.status === 200 && sameKeys(r.data, ['id', 'created_date', 'notification_error']), `HTTP ${r.status} ${keysOf(r.data)}`);
    check('created_date ISO', /^\d{4}-\d{2}-\d{2}T/.test(r.data?.created_date || ''));
    check('notification_error signale les notifications non migrées', r.data?.notification_error === 'notifications_not_migrated');
    msgId = r.data?.id;
    if (msgId) created.Message.push(msgId);
    const m = await get('Message', msgId);
    check('expéditeur, auteur, participants et read_by forcés côté serveur (valeurs du client ignorées)',
      m.sender_id === A.id && m.created_by_id === A.id && JSON.stringify(m.participant_ids) === JSON.stringify([A.id, ADM.id])
      && JSON.stringify(m.read_by) === JSON.stringify([A.id]));
    check('texte nettoyé (trim) et sender_name renseigné', m.text === 'bonjour' && Boolean(m.sender_name));
  }

  await sleep(1500);
  const seen = (sub) => sub.events.some((ev) => ev.name === 'Message' && ev.data?.record?.id === msgId);
  check('temps réel : le participant A reçoit l’évènement', seen(subA));
  check('temps réel : l’admin participant reçoit l’évènement', seen(subAdm));
  check('temps réel : B (non participant) ne reçoit RIEN', !seen(subB) && !subB.events.some((ev) => ev.name === 'Message'),
    `${subB.events.length} évènement(s)`);
  subA.close(); subB.close(); subAdm.close();

  console.log('\n■ Messagerie : accès direct par l’API (règles de collection)');
  {
    const la = await listAs(A.token, 'Message', `conversation_id = "${convId}"`);
    check('A liste les messages de sa conversation', la.status === 200 && la.data.items.some((m) => m.id === msgId));
    const lb = await listAs(B.token, 'Message', `conversation_id = "${convId}"`);
    check('B ne voit aucun message de la conversation (liste vide)', lb.status === 200 && lb.data.totalItems === 0);
    const vb = await http('GET', `/api/collections/Message/records/${msgId}`, { token: B.token });
    check('B lecture directe du message -> 404', vb.status === 404);
    const ub = await http('PATCH', `/api/collections/Message/records/${msgId}`, { token: B.token, body: { text: 'piraté' } });
    check('B modification du message -> refusée', ub.status === 404 || ub.status === 403, `HTTP ${ub.status}`);
    const db = await http('DELETE', `/api/collections/Message/records/${msgId}`, { token: B.token });
    check('B suppression du message -> refusée', db.status === 404 || db.status === 403, `HTTP ${db.status}`);
    const cb = await http('GET', `/api/collections/Conversation/records/${convId}`, { token: B.token });
    check('B lecture de la conversation -> 404', cb.status === 404);
    const jb = await http('PATCH', `/api/collections/Conversation/records/${convId}`, { token: B.token, body: { participant_ids: [A.id, ADM.id, B.id] } });
    check('B s’ajoute aux participants -> refusé', jb.status === 404 || jb.status === 403, `HTTP ${jb.status}`);
    const direct = await http('POST', '/api/collections/Message/records', { token: A.token, body: { conversation_id: convId, participant_ids: [A.id], text: 'direct', created_by_id: A.id } });
    check('création directe de Message par un membre -> refusée (passe par createMessage)', direct.status >= 400, `HTTP ${direct.status}`);
    // Depuis le bloc 3, un membre n'ajoute ou ne retire que son propre id dans read_by.
    const readBy = (await get('Message', msgId, 'read_by')).read_by || [];
    const other = await http('PATCH', `/api/collections/Message/records/${msgId}`, { token: A.token, body: { read_by: [...new Set([...readBy, A.id, ADM.id])] } });
    check('A ajoute l’id d’un autre dans read_by -> refusé', other.status >= 400, `HTTP ${other.status}`);
    const ra = await http('PATCH', `/api/collections/Message/records/${msgId}`, { token: A.token, body: { read_by: [...new Set([...readBy, A.id])] } });
    check('A (participant) met à jour read_by', ra.status === 200, `HTTP ${ra.status}`);
    const still = await get('Message', msgId, 'text');
    check('le texte n’a pas été modifié par B', still.text === 'bonjour');
  }

  // ═══════════════════════════ PRIÈRE ══════════════════════════════════════
  console.log('\n■ Prière');
  {
    const r = await fn('createPrayerRequest', { body: { category: 'Autre', content: 'x' } });
    check('anonyme -> 401', r.status === 401 && r.data?.error === 'Connexion requise.');
  }
  for (const [label, body, msg] of [
    ['catégorie invalide', { category: 'Autre2', content: 'x' }, 'Catégorie invalide.'],
    ['contenu vide', { category: 'Autre', content: '  ' }, 'Le sujet de prière est obligatoire.'],
    ['contenu > 300', { category: 'Autre', content: 'a'.repeat(301) }, 'Le sujet dépasse 300 caractères.'],
  ]) {
    const r = await fn('createPrayerRequest', { token: A.token, body });
    check(`${label} -> 400 { error: "${msg}" }`, r.status === 400 && r.data?.error === msg);
  }
  const prayers = [];
  for (let i = 0; i < 3; i++) {
    const r = await fn('createPrayerRequest', { token: A.token, body: { category: 'Famille', content: `test ${i}`, requester_id: B.id, status: 'answered' } });
    prayers.push(r.data?.id);
    check(`création n°${i + 1} -> 200 { id, today_remaining: ${2 - i} }`, r.status === 200 && sameKeys(r.data, ['id', 'today_remaining']) && r.data.today_remaining === 2 - i);
  }
  {
    const r = await fn('createPrayerRequest', { token: A.token, body: { category: 'Famille', content: 'quatrième' } });
    check('4e demande du jour -> 429 { error, limit_reached: true }', r.status === 429 && r.data?.limit_reached === true && /limite de 3/.test(r.data?.error || ''));
    const p = await get('PrayerRequest', prayers[0]);
    check('requester_id et status forcés côté serveur', p.requester_id === A.id && p.status === 'open');
  }
  {
    const own = await fn('takePrayer', { token: A.token, body: { prayer_id: prayers[0] } });
    check('A prend sa propre prière -> 403', own.status === 403 && own.data?.error === 'Tu ne peux pas prendre en charge ta propre demande.');
    const bad = await fn('takePrayer', { token: B.token, body: {} });
    check('takePrayer sans prayer_id -> 400', bad.status === 400 && bad.data?.error === 'Prière introuvable.');
    const nf = await fn('takePrayer', { token: B.token, body: { prayer_id: 'f'.repeat(24) } });
    check('takePrayer prière inexistante -> 404', nf.status === 404);
    const t = await fn('takePrayer', { token: B.token, body: { prayer_id: prayers[0], taken_by: ADM.id } });
    check('B prend la prière -> 200 { ok, id, status: "taken" }', t.status === 200 && sameKeys(t.data, ['ok', 'id', 'status']) && t.data.status === 'taken');
    const p = await get('PrayerRequest', prayers[0]);
    check('taken_by = B (identifiant du client ignoré)', p.taken_by === B.id && p.status === 'taken' && Boolean(p.taken_date));
    const n = await http('GET', `/api/collections/UserNotification/records?filter=${q(`notification_id = "prayer_taken_${prayers[0]}"`)}`, asSu);
    check('notification in-app créée pour le demandeur', n.data.items.length === 1 && n.data.items[0].user_id === A.id);
    const again = await fn('takePrayer', { token: ADM.token, body: { prayer_id: prayers[0] } });
    check('prière déjà prise -> 409', again.status === 409 && again.data?.error === 'Cette prière a déjà été prise en charge.');

    const [c1, c2] = await Promise.all([
      fn('takePrayer', { token: B.token, body: { prayer_id: prayers[1] } }),
      fn('takePrayer', { token: ADM.token, body: { prayer_id: prayers[1] } }),
    ]);
    check('prise simultanée par deux personnes -> un seul succès', [c1.status, c2.status].sort().join() === '200,409', `${c1.status}/${c2.status}`);
  }
  {
    const notMine = await fn('answerPrayer', { token: B.token, body: { prayer_id: prayers[0] } });
    check('B (non demandeur) marque exaucée -> 403', notMine.status === 403);
    const open = await fn('answerPrayer', { token: A.token, body: { prayer_id: prayers[2] } });
    check('prière encore ouverte -> 409', open.status === 409 && open.data?.error === 'Cette prière doit d\'abord être prise en charge.');
    const ok = await fn('answerPrayer', { token: A.token, body: { prayer_id: prayers[0] } });
    check('A marque exaucée -> 200 { ok, id, status: "answered" }', ok.status === 200 && ok.data?.status === 'answered');
    const n = await http('GET', `/api/collections/UserNotification/records?filter=${q(`notification_id = "prayer_answered_${prayers[0]}"`)}`, asSu);
    check('notification in-app créée pour l’intercesseur', n.data.items.length === 1 && n.data.items[0].user_id === B.id);
    const wall = await fn('getPrayerWall', { token: B.token, body: {} });
    check('mur : seules les prières ouvertes, sans requester_id ni taken_by',
      wall.data.items.some((i) => i.id === prayers[2]) && !wall.data.items.some((i) => i.id === prayers[0])
      && wall.data.items.every((i) => !('requester_id' in i) && !('taken_by' in i)));
  }
  {
    const lb = await listAs(B.token, 'PrayerRequest', `id = "${prayers[2]}"`);
    check('[RÈGLE corrigée] B ne lit plus directement la prière ouverte de A (requester_id protégé)',
      lb.status === 200 && lb.data.totalItems === 0, `${lb.data?.totalItems} visible(s)`);
  }

  // ═══════════════════════════ QUIZ ════════════════════════════════════════
  console.log('\n■ Quiz biblique');
  {
    const r = await fn('quizLevels', { body: {} });
    check('anonyme -> 401', r.status === 401 && r.data?.error === 'Connexion requise');
    const lv = await fn('quizLevels', { token: A.token, body: {} });
    check('quizLevels -> 3 niveaux, easy débloqué, medium verrouillé',
      lv.status === 200 && sameKeys(lv.data.levels, ['easy', 'medium', 'hard']) && lv.data.levels.easy.unlocked === true && lv.data.levels.medium.unlocked === false);
    check('quizLevels : champs d’un niveau', sameKeys(lv.data.levels.easy, ['difficulty', 'unlocked', 'best_score_percent', 'total_questions_played', 'question_count', 'available_questions', 'requires', 'threshold']));
    const bad = await fn('quizStart', { token: A.token, body: { difficulty: 'expert' } });
    check('quizStart niveau invalide -> 400', bad.status === 400 && bad.data?.error === 'Niveau invalide');
    const locked = await fn('quizStart', { token: A.token, body: { difficulty: 'medium' } });
    check('quizStart niveau verrouillé -> 403', locked.status === 403 && locked.data?.error === 'Niveau verrouillé');
  }
  {
    const s = await fn('quizStart', { token: A.token, body: { difficulty: 'easy' } });
    check('quizStart -> 200 avec 10 questions', s.status === 200 && s.data.questions?.length === 10
      && sameKeys(s.data, ['session_id', 'progress_id', 'difficulty', 'requested', 'questions', 'limited']));
    check('aucune bonne réponse ni explication envoyée au client',
      s.data.questions.every((x) => sameKeys(x, ['id', 'question', 'options', 'difficulty', 'category']) && sameKeys(x.options, ['A', 'B', 'C', 'D'])));
    const sid = s.data.session_id;
    const ids = s.data.questions.map((x) => x.id);

    const v1 = await fn('quizAnswer', { token: A.token, body: { session_id: sid, difficulty: 'easy' } });
    check('quizAnswer sans question_id -> 400', v1.status === 400 && v1.data?.error === 'Requête invalide');
    const v2 = await fn('quizAnswer', { token: A.token, body: { question_id: ids[0], session_id: sid, difficulty: 'easy', user_answer: 'E' } });
    check('quizAnswer réponse « E » -> 400', v2.status === 400 && v2.data?.error === 'Réponse invalide');
    const other = await http('GET', `/api/collections/QuizQuestion/records?perPage=50&filter=${q('difficulty = "easy"')}&fields=id`, asSu);
    const outside = other.data.items.map((x) => x.id).find((id) => !ids.includes(id));
    const v3 = await fn('quizAnswer', { token: A.token, body: { question_id: outside, session_id: sid, difficulty: 'easy', user_answer: 'A' } });
    check('question hors partie -> 409', v3.status === 409 && v3.data?.error === 'Question hors partie');
    const stolen = await fn('quizAnswer', { token: B.token, body: { question_id: ids[0], session_id: sid, difficulty: 'easy', user_answer: 'A' } });
    check('B utilise la session de A -> 409 « Partie introuvable »', stolen.status === 409 && stolen.data?.error === 'Partie introuvable');

    // 7 bonnes réponses, 3 fausses (vraies réponses lues par le superuser) -> 70 % -> déblocage de medium.
    let correctCount = 0;
    for (let i = 0; i < ids.length; i++) {
      const truth = (await get('QuizQuestion', ids[i], 'correct_answer')).correct_answer;
      const wrong = ['A', 'B', 'C', 'D'].find((l) => l !== truth);
      const answer = i < 7 ? truth : wrong;
      const r = await fn('quizAnswer', { token: A.token, body: { question_id: ids[i], session_id: sid, difficulty: 'easy', user_answer: answer, is_correct: true, score: 100 } });
      if (r.data?.is_correct) correctCount++;
      if (i === 0) check('quizAnswer -> { is_correct, correct_answer, explanation }', sameKeys(r.data, ['is_correct', 'correct_answer', 'explanation']));
    }
    check('les champs is_correct / score envoyés par le client sont ignorés (7 bonnes réponses comptées)', correctCount === 7);
    const twice = await fn('quizAnswer', { token: A.token, body: { question_id: ids[0], session_id: sid, difficulty: 'easy', user_answer: 'A' } });
    check('même question deux fois -> 409', twice.status === 409 && twice.data?.error === 'Question déjà répondue');
    const forged = await http('PATCH', `/api/collections/QuizUserProgress/records/${s.data.progress_id}`, { token: A.token, body: { session_correct: 10, best_score_percent: 100 } });
    check('modification directe de sa progression -> refusée', forged.status === 404 || forged.status === 403, `HTTP ${forged.status}`);
    const hist = await http('POST', '/api/collections/QuizAnswerHistory/records', { token: A.token, body: { user_id: A.id, question_id: ids[0], is_correct: true } });
    check('création directe d’historique -> refusée', hist.status >= 400, `HTTP ${hist.status}`);

    const f = await fn('quizFinish', { token: A.token, body: { session_id: sid, difficulty: 'easy', score_percent: 100, correct: 10 } });
    check('quizFinish -> score recalculé côté serveur (7/10 = 70 %)', f.status === 200 && f.data.correct === 7 && f.data.total === 10 && f.data.score_percent === 70);
    check('quizFinish -> niveau medium débloqué (seuil 70)', f.data.newly_unlocked === 'medium' && f.data.next_level_unlocked === true);
    check('quizFinish : forme de la réponse', sameKeys(f.data, ['difficulty', 'correct', 'total', 'score_percent', 'best_score_percent', 'newly_unlocked', 'next_level', 'next_level_unlocked']));
    const f2 = await fn('quizFinish', { token: A.token, body: { session_id: sid, difficulty: 'easy' } });
    check('terminer deux fois -> 409', f2.status === 409 && f2.data?.error === 'Partie introuvable ou déjà terminée');
  }
  {
    const m = await fn('quizAdminStats', { token: A.token, body: {} });
    check('quizAdminStats membre -> 403 { error: "Forbidden" }', m.status === 403 && m.data?.error === 'Forbidden');
    const a = await fn('quizAdminStats', { token: ADM.token, body: {} });
    check('quizAdminStats admin -> 200', a.status === 200 && sameKeys(a.data, ['total_questions', 'per_level', 'players', 'answers_given', 'average_score_percent']) && a.data.players >= 1);
  }

  // ═══════════════════════════ MOTS MÉLANGÉS ═══════════════════════════════
  console.log('\n■ Mots Mélangés');
  {
    const r = await fn('wsLevels', { body: {} });
    check('anonyme -> 401', r.status === 401);
    const lv = await fn('wsLevels', { token: A.token, body: {} });
    check('wsLevels -> 4 niveaux et 10 crédits offerts', lv.status === 200 && sameKeys(lv.data.levels, ['easy', 'medium', 'hard', 'ultra_hard']) && lv.data.credits === 10);
  }
  {
    const s = await fn('wsStart', { token: A.token, body: { difficulty: 'easy' } });
    check('wsStart -> 200 { session_id, difficulty, total: 5, requested, credits }', s.status === 200 && s.data.total === 5 && sameKeys(s.data, ['session_id', 'difficulty', 'total', 'requested', 'credits']));
    const sid = s.data.session_id;
    const progress = (await http('GET', `/api/collections/WordScrambleProgress/records?filter=${q(`user_id = "${A.id}" && difficulty = "easy"`)}`, asSu)).data.items[0];
    const wordIds = progress.session_word_ids;
    const words = {};
    for (const id of wordIds) words[id] = (await get('WordScrambleWord', id, 'word')).word;

    const w0 = await fn('wsWord', { token: A.token, body: { session_id: sid, difficulty: 'easy', index: 0 } });
    check('wsWord -> lettres mélangées sans le mot', w0.status === 200 && !('word' in w0.data) && w0.data.shuffledLetters.length === w0.data.wordLength
      && w0.data.shuffledLetters.slice().sort().join('') === words[wordIds[0]].split('').sort().join(''));
    const wi = await fn('wsWord', { token: A.token, body: { session_id: sid, difficulty: 'easy', index: '0' } });
    check('wsWord index non entier -> 400', wi.status === 400);
    const wo = await fn('wsWord', { token: A.token, body: { session_id: sid, difficulty: 'easy', index: 99 } });
    check('wsWord index hors partie -> 404', wo.status === 404 && wo.data?.error === 'Mot hors partie');
    const sw = await fn('wsWord', { token: B.token, body: { session_id: sid, difficulty: 'easy', index: 0 } });
    check('B utilise la session de A -> 409', sw.status === 409);

    const wrong = await fn('wsAnswer', { token: A.token, body: { session_id: sid, difficulty: 'easy', wordId: wordIds[0], userAnswer: 'ZZZZ' } });
    check('mauvaise réponse -> { correct: false }', wrong.status === 200 && sameKeys(wrong.data, ['correct']) && wrong.data.correct === false);
    const h1 = await fn('wsHint', { token: A.token, body: { session_id: sid, difficulty: 'easy', wordId: wordIds[0], hintType: 'first_letter' } });
    check('indice première lettre -> 1 crédit (reste 9)', h1.status === 200 && h1.data.hint === words[wordIds[0]][0] && h1.data.creditsRemaining === 9);
    const h1b = await fn('wsHint', { token: A.token, body: { session_id: sid, difficulty: 'easy', wordId: wordIds[0], hintType: 'first_letter' } });
    check('même indice racheté -> gratuit (reste 9)', h1b.data?.creditsRemaining === 9);
    const h2 = await fn('wsHint', { token: A.token, body: { session_id: sid, difficulty: 'easy', wordId: wordIds[0], hintType: 'phrase' } });
    check('indice phrase -> 2 crédits (reste 7)', h2.status === 200 && h2.data.creditsRemaining === 7);
    const hb = await fn('wsHint', { token: A.token, body: { session_id: sid, difficulty: 'easy', wordId: wordIds[0], hintType: 'tout' } });
    check('type d’indice invalide -> 400', hb.status === 400);
    const ok = await fn('wsAnswer', { token: A.token, body: { session_id: sid, difficulty: 'easy', wordId: wordIds[0], userAnswer: words[wordIds[0]].toLowerCase(), score: 999 } });
    const expected = Math.max(0, words[wordIds[0]].length * 10 - 2 * 10);
    check('bonne réponse (minuscules acceptées) -> score calculé serveur avec pénalité d’indices', ok.status === 200 && ok.data.correct === true && ok.data.score === expected && ok.data.hintsUsed === 2);
    const dup = await fn('wsAnswer', { token: A.token, body: { session_id: sid, difficulty: 'easy', wordId: wordIds[0], userAnswer: words[wordIds[0]] } });
    check('mot déjà résolu -> 409', dup.status === 409 && dup.data?.error === 'Mot déjà résolu');
    const hs = await fn('wsHint', { token: A.token, body: { session_id: sid, difficulty: 'easy', wordId: wordIds[0], hintType: 'first_letter' } });
    check('indice sur un mot résolu -> 409', hs.status === 409);

    const wallet = (await http('GET', `/api/collections/WordScrambleCredits/records?filter=${q(`user_id = "${A.id}"`)}`, asSu)).data.items[0];
    const forge = await http('PATCH', `/api/collections/WordScrambleCredits/records/${wallet.id}`, { token: A.token, body: { credits: 999 } });
    check('modification directe de ses crédits -> refusée', forge.status === 404 || forge.status === 403, `HTTP ${forge.status}`);
    await http('PATCH', `/api/collections/WordScrambleCredits/records/${wallet.id}`, { ...asSu, body: { credits: 0 } });
    const poor = await fn('wsHint', { token: A.token, body: { session_id: sid, difficulty: 'easy', wordId: wordIds[1], hintType: 'phrase' } });
    check('plus de crédits -> 402 { error, creditsRemaining: 0 }', poor.status === 402 && poor.data?.error === 'Plus de crédits' && poor.data?.creditsRemaining === 0);

    for (const id of wordIds.slice(1)) {
      await fn('wsAnswer', { token: A.token, body: { session_id: sid, difficulty: 'easy', wordId: id, userAnswer: words[id] } });
    }
    const maxScore = wordIds.reduce((s, id) => s + words[id].length * 10, 0);
    const total = wordIds.slice(1).reduce((s, id) => s + words[id].length * 10, 0) + expected;
    const pct = Math.round((total / maxScore) * 100);
    const f = await fn('wsFinish', { token: A.token, body: { session_id: sid, difficulty: 'easy', total_score: 9999 } });
    check('wsFinish -> score recalculé côté serveur', f.status === 200 && f.data.total_score === total && f.data.max_score === maxScore && f.data.score_percent === pct);
    check('wsFinish -> crédits : 0 + 2 (+5 si déblocage)', f.data.credits === (f.data.newly_unlocked ? 7 : 2) && f.data.credits_earned === f.data.credits);
    check('wsFinish -> mots révélés dans details', f.data.details.length === 5 && f.data.details.every((d) => d.word && d.solved));
    const f2 = await fn('wsFinish', { token: A.token, body: { session_id: sid, difficulty: 'easy' } });
    check('terminer deux fois -> 409', f2.status === 409);
  }
  {
    const m = await fn('wsAdminStats', { token: B.token, body: {} });
    check('wsAdminStats membre -> 403', m.status === 403 && m.data?.error === 'Forbidden');
    const a = await fn('wsAdminStats', { token: ADM.token, body: {} });
    check('wsAdminStats admin -> 200', a.status === 200 && sameKeys(a.data, ['total_words', 'per_level', 'players', 'average_by_level', 'most_solved', 'least_solved']));
  }
} finally {
  // ═══════════════════════════ NETTOYAGE ═══════════════════════════════════
  const del = async (col, filter) => {
    for (;;) {
      const r = await http('GET', `/api/collections/${col}/records?perPage=200&fields=id&filter=${q(filter)}`, asSu);
      const items = r.data?.items || [];
      for (const it of items) await http('DELETE', `/api/collections/${col}/records/${it.id}`, asSu);
      if (items.length < 200) break;
    }
  };
  const ids = TEST_USERS.map((id) => `user_id = "${id}"`).join(' || ');
  for (const id of created.Message) await http('DELETE', `/api/collections/Message/records/${id}`, asSu);
  for (const id of created.Conversation) {
    await del('Message', `conversation_id = "${id}"`);
    await http('DELETE', `/api/collections/Conversation/records/${id}`, asSu);
  }
  await del('PrayerRequest', TEST_USERS.map((id) => `requester_id = "${id}"`).join(' || '));
  await del('UserNotification', `(${ids}) && content_type = "prayer"`);
  for (const col of ['QuizUserProgress', 'QuizAnswerHistory', 'WordScrambleProgress', 'WordScrambleHistory', 'WordScrambleCredits']) {
    await del(col, ids);
  }
  console.log('\n(nettoyage effectué : données de test supprimées)');
}
done();
