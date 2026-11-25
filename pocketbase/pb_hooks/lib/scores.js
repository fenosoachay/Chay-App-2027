// Score Boards (1.3.22) : calcul des points et des classements (routes : pb_hooks/scores.pb.js ; Quiz et Mots
// mélangés : fn_jeux.pb.js, points calculés par le serveur). Pur : testé par src/lib/scoreBoard.test.js.
//  - adultes : classement par compte (nom et photo du profil) ; enfants : par pseudo (+ avatar dessiné) sur le compte ;
//  - 1.3.26 : le Puzzle passe dans l'espace Enfants (les points Puzzle déjà gagnés par les adultes restent dans
//    leur total « Général ») ;
//  - périodes : semaine (depuis lundi 0 h, heure de Paris), mois (depuis le 1er, 0 h), toujours ;
//  - général (tous les jeux additionnés) ou un seul jeu.

const JEUX = {
  adulte: ['trivia', 'scramble', 'emoji'],
  enfant: ['memory', 'puzzle', 'brique', 'voiture'], // 1.3.29 : Brique ; 1.3.30 : Libère la voiture
};
const JEUX_CLIENT = ['emoji', 'brique', 'puzzle', 'memory', 'voiture']; // scores envoyés par l'app (bornés ici)
const MULT = { easy: 1, medium: 2, hard: 3, ultra_hard: 4, facile: 1, moyen: 2, difficile: 3 };
const PLAFOND = 1000;
const AVATARS = ['🦁', '🐑', '🕊️', '🐟', '🐘', '🦒', '🐻', '🐰', '🦊', '🐢', '🐝', '🦋', '🐳', '🐧', '🦉', '🐞'];

const entier = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : 0;
};
const borne = (n) => Math.max(0, Math.min(PLAFOND, entier(n)));

function pointsQuiz(correct, niveau) { return borne(entier(correct) * 10 * (MULT[niveau] || 1)); }
function pointsMemory(etoiles, niveau) {
  const e = entier(etoiles);
  if (e < 1 || e > 3) return 0;
  return e * 10 * (MULT[niveau] || 1);
}
function pointsBrique(score) { return borne(entier(score) / 10); }
/** Libère la voiture (1.3.30) : niveau 1 à 30, 1 à 3 étoiles -> (10 + 2 × niveau) × étoiles. */
function pointsVoiture(niveau, etoiles) {
  const n = entier(niveau);
  const e = entier(etoiles);
  if (n < 1 || n > 30 || e < 1 || e > 3) return 0;
  return (10 + 2 * n) * e;
}
function pointsEmoji(score) { return borne(score); }
function pointsPuzzle(pieces) {
  const p = entier(pieces);
  const cote = Math.round(Math.sqrt(p));
  if (p < 4 || p > 100 || cote * cote !== p) return 0;
  return borne(p * 5);
}

/** Points d'un score envoyé par l'app, ou 0 si invalide. */
function pointsClient(jeu, b) {
  const d = b || {};
  if (jeu === 'emoji') return pointsEmoji(d.score);
  if (jeu === 'brique') return pointsBrique(d.score);
  if (jeu === 'puzzle') return pointsPuzzle(d.pieces);
  if (jeu === 'memory') return pointsMemory(d.etoiles, d.niveau);
  if (jeu === 'voiture') return pointsVoiture(d.niveau, d.etoiles);
  return 0;
}

/** Pseudo d'enfant : lettres, chiffres, espaces, tiret, apostrophe ; 2 à 20 caractères ; sinon ''. */
function pseudoValide(p) {
  const s = String(p || '').replace(/\s+/g, ' ').trim();
  if (s.length < 2 || s.length > 20) return '';
  return /^[A-Za-zÀ-ÖØ-öø-ÿ0-9 '’-]+$/.test(s) ? s : ''; // lettres latines (français, malgache), chiffres
}
function avatarValide(a) { return AVATARS.indexOf(a) !== -1 ? a : AVATARS[0]; }

/**
 * Espace d'une partie envoyée par l'app : « enfant » pour Jeux Carte, et pour le Puzzle joué au nom d'un enfant
 * (pseudo) ; un Puzzle sans pseudo vient d'une ancienne version de l'app (Puzzle adulte) : compté chez les adultes.
 */
function espaceDe(jeu, pseudo) {
  if (jeu === 'memory' || jeu === 'voiture') return 'enfant';
  // Puzzle (1.3.26) et Brique (1.3.29) : au nom d'un enfant (pseudo) ; sans pseudo = ancienne version de l'app.
  if (jeu === 'puzzle' || jeu === 'brique') return pseudoValide(pseudo) ? 'enfant' : 'adulte';
  return 'adulte';
}

/** Début de période en ms (UTC) ; `decalage` = minutes d'avance de Paris sur UTC à cet instant. */
function debutPeriode(periode, maintenant, decalage) {
  if (periode !== 'semaine' && periode !== 'mois') return 0;
  const local = new Date(maintenant + decalage * 60000); // heure de Paris lue en UTC
  let y = local.getUTCFullYear();
  let m = local.getUTCMonth();
  let j = local.getUTCDate();
  if (periode === 'semaine') j -= (local.getUTCDay() + 6) % 7; // lundi
  else j = 1;
  return Date.UTC(y, m, j) - decalage * 60000;
}

/** « 2026-11-21 08:00:00.000Z » pour les filtres PocketBase. */
function datePb(ms) { return new Date(ms).toISOString().replace('T', ' '); }

/**
 * Classement : lignes { cle, points } additionnées par clé, triées (points décroissants, puis clé).
 * Rangs « sportifs » (ex aequo : même rang, le suivant saute). Renvoie [{ cle, points, rang }].
 */
function classer(lignes) {
  const tot = {};
  for (const l of lignes) {
    if (!l || !l.cle) continue;
    tot[l.cle] = (tot[l.cle] || 0) + entier(l.points);
  }
  const liste = Object.keys(tot).map((cle) => ({ cle, points: tot[cle] })).filter((x) => x.points > 0);
  liste.sort((a, b) => b.points - a.points || (a.cle < b.cle ? -1 : 1));
  let rang = 0;
  let prec = null;
  liste.forEach((x, i) => {
    if (x.points !== prec) { rang = i + 1; prec = x.points; }
    x.rang = rang;
  });
  return liste;
}

module.exports = {
  JEUX, JEUX_CLIENT, AVATARS, PLAFOND,
  pointsQuiz, pointsMemory, pointsBrique, pointsEmoji, pointsPuzzle, pointsVoiture, pointsClient,
  pseudoValide, avatarValide, espaceDe, debutPeriode, datePb, classer,
};
