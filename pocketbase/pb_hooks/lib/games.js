// Règles du Quiz biblique et de « Mots Mélangés » (reprises de base44/shared/quizRules.ts
// et base44/shared/wordScrambleRules.ts). Les fonctions prennent `app` ($app ou txApp)
// pour pouvoir être utilisées dans une transaction.

const fnLib = require(`${__hooks}/lib/fn.js`);

// ── Quiz ─────────────────────────────────────────────────────────────────────
const QUIZ = {
  LEVELS: ['easy', 'medium', 'hard'],
  QUESTION_COUNT: { easy: 10, medium: 10, hard: 10 },
  UNLOCK_RULES: { easy: null, medium: { requires: 'easy', threshold: 70 }, hard: { requires: 'medium', threshold: 80 } },
  NEXT_LEVEL: { easy: 'medium', medium: 'hard', hard: null },
};

// ── Mots Mélangés ────────────────────────────────────────────────────────────
const WS = {
  LEVELS: ['easy', 'medium', 'hard', 'ultra_hard'],
  WORDS_PER_GAME: 5,
  INITIAL_CREDITS: 10,
  CREDITS_PER_GAME: 2,
  CREDITS_PER_UNLOCK: 5,
  HINT_COSTS: { first_letter: 1, phrase: 2 },
  HINT_PENALTY: 10,
  POINTS_PER_LETTER: 10,
  UNLOCK_RULES: {
    easy: null,
    medium: { requires: 'easy', threshold: 60 },
    hard: { requires: 'medium', threshold: 65 },
    ultra_hard: { requires: 'hard', threshold: 70 },
  },
  NEXT_LEVEL: { easy: 'medium', medium: 'hard', hard: 'ultra_hard', ultra_hard: null },
  MASTER_THRESHOLD: 80,
};

const ID_MAX = 64; // longueur maximale acceptée pour un identifiant envoyé par le client
const percent = (value, total) => (total ? Math.round((value / total) * 100) : 0);
const isIn = (list, v) => typeof v === 'string' && list.indexOf(v) !== -1;
const num = (v) => Number(v) || 0;
const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** Plus ancienne ligne de progression (doublons ignorés), créée si absente. */
function getProgress(app, collection, userId, difficulty, initial) {
  const found = fnLib.findOne(app, collection, 'user_id = {:u} && difficulty = {:d}', 'base44_created_date,created',
    { u: userId, d: difficulty });
  if (found) return found;
  const rec = fnLib.newRecord(app, collection, Object.assign({ user_id: userId, difficulty }, initial));
  app.save(rec);
  return rec;
}

function quizProgress(app, userId, difficulty) {
  return getProgress(app, 'QuizUserProgress', userId, difficulty, {
    total_questions_played: 0,
    correct_answers: 0,
    best_score_percent: 0,
    unlocked: difficulty === 'easy',
    session_question_ids: [],
    session_answered_ids: [],
    session_correct: 0,
  });
}

function wsProgress(app, userId, difficulty) {
  return getProgress(app, 'WordScrambleProgress', userId, difficulty, {
    total_words_played: 0,
    total_score: 0,
    best_score: 0,
    best_percent: 0,
    unlocked: difficulty === 'easy',
    master_badge: false,
    session_word_ids: [],
    session_hints: {},
  });
}

/** Portefeuille de crédits (plus ancien), créé avec 10 crédits si absent. */
function wsCredits(app, userId) {
  const found = fnLib.findOne(app, 'WordScrambleCredits', 'user_id = {:u}', 'base44_created_date,created', { u: userId });
  if (found) return found;
  const rec = fnLib.newRecord(app, 'WordScrambleCredits', { user_id: userId, credits: WS.INITIAL_CREDITS });
  app.save(rec);
  return rec;
}

function countWhere(app, collection, field, value) {
  return app.countRecords(collection, $dbx.hashExp({ [field]: value }));
}

/** Lettres mélangées, jamais identiques au mot (sauf lettres toutes identiques). */
function scrambleLetters(word) {
  const letters = word.split('');
  const distinct = {};
  letters.forEach((l) => { distinct[l] = true; });
  if (Object.keys(distinct).length < 2) return letters;
  let result = fnLib.shuffle(letters);
  let guard = 0;
  while (result.join('') === word && guard++ < 50) result = fnLib.shuffle(letters);
  return result;
}

/** Comme normalizeWord de Base44 : sans accents, lettres A-Z uniquement, majuscules. */
function normalizeWord(value) {
  let s = String(value || '');
  if (typeof s.normalize === 'function') s = s.normalize('NFD');
  return s.replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase();
}

const wordScore = (word, paidHints) => Math.max(0, word.length * WS.POINTS_PER_LETTER - paidHints * WS.HINT_PENALTY);

module.exports = {
  ID_MAX, QUIZ, WS, percent, isIn, num, arr, obj,
  quizProgress, wsProgress, wsCredits, countWhere, scrambleLetters, normalizeWord, wordScore,
};
