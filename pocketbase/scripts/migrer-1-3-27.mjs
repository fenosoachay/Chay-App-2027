#!/usr/bin/env node
// Migration 1.3.27 : Leaderboard des adultes, joueurs d'avant le Score Board repris.
// Le Score Board (1.3.22) ne compte que les parties jouées depuis sa mise en place : les membres qui avaient joué
// avant n'y apparaissaient pas. Cette migration ajoute, pour chacun, UN score « historique » par jeu, calculé
// comme aujourd'hui à partir de ce que le serveur a gardé :
//  - Quiz biblique (trivia) : 10 points par bonne réponse × niveau (QuizAnswerHistory + QuizQuestion) ;
//  - Mots mélangés (scramble) : points des mots trouvés, 1 000 au plus par partie (WordScrambleHistory) ;
//  - Brique (BlockBlastScore) : score / 10, 1 000 au plus par partie.
// Seules les parties jouées AVANT le premier score de ce jeu au Score Board sont reprises (jamais compté deux fois).
// Ces scores comptent dans « Toujours », pas dans « Semaine » ni « Mois » (champ ScoreJeu.historique ; route
// classement, scores.pb.js). Émojis et Puzzle : aucun historique gardé sur le serveur, rien à reprendre.
// Idempotente (rien n'est ajouté si des scores historiques existent déjà). Usage (tunnel SSH ouvert, identifiants
// SUPERUSER saisis masqués) :
//   node pocketbase/scripts/migrer-1-3-27.mjs              -> simulation
//   node pocketbase/scripts/migrer-1-3-27.mjs --appliquer  -> applique

import { pathToFileURL } from 'node:url';

const MULT = { easy: 1, medium: 2, hard: 3, ultra_hard: 4, facile: 1, moyen: 2, difficile: 3 };
const PLAFOND = 1000;
const MAX_LIGNE = 100000; // ScoreJeu.points : 100 000 au plus par ligne
const entier = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : 0; };
const borne = (n) => Math.max(0, Math.min(PLAFOND, entier(n)));
/** Date PocketBase comparable : « AAAA-MM-JJ hh:mm:ss.mmmZ ». */
export const datePb = (v) => String(v || '').replace('T', ' ');
const quand = (r, champ) => datePb(r[champ] || r.created);

/** Premier score « normal » de chaque jeu au Score Board (au-delà : déjà compté). */
export function debutsScoreBoard(scores) {
  const d = {};
  for (const s of scores || []) {
    if (s.historique || s.espace !== 'adulte') continue;
    const c = datePb(s.created);
    if (c && (!d[s.jeu] || c < d[s.jeu])) d[s.jeu] = c;
  }
  return d;
}
const avant = (date, limite) => Boolean(date) && (!limite || date < limite);

/** Quiz : { user_id: points } pour les bonnes réponses d'avant `limite`. */
export function pointsQuiz(reponses, questions, limite) {
  const niveau = new Map((questions || []).map((q) => [q.id, q.difficulty]));
  const out = {};
  for (const r of reponses || []) {
    if (!r.user_id || r.is_correct !== true || !avant(quand(r, 'answered_at'), limite)) continue;
    out[r.user_id] = (out[r.user_id] || 0) + 10 * (MULT[niveau.get(r.question_id)] || 1);
  }
  return out;
}

/** Mots mélangés : par partie, somme des points des mots trouvés (1 000 au plus), puis par membre. */
export function pointsScramble(historique, limite) {
  const parties = {};
  for (const h of historique || []) {
    if (!h.user_id || h.solved !== true || !avant(quand(h, 'played_at'), limite)) continue;
    const cle = `${h.user_id}|${h.session_id || h.id}`;
    parties[cle] = (parties[cle] || 0) + Math.max(0, entier(h.score_earned));
  }
  const out = {};
  for (const [cle, pts] of Object.entries(parties)) {
    const u = cle.split('|')[0];
    out[u] = (out[u] || 0) + borne(pts);
  }
  return out;
}

/** Brique : score / 10 par partie (1 000 au plus), par membre. */
export function pointsBrique(parties, limite) {
  const out = {};
  for (const p of parties || []) {
    if (!p.user_id || !avant(quand(p, 'played_at'), limite)) continue;
    const pts = borne(entier(p.score) / 10);
    if (pts) out[p.user_id] = (out[p.user_id] || 0) + pts;
  }
  return out;
}

/** Lignes ScoreJeu à créer (une par membre et par jeu ; coupée en plusieurs au-delà de 100 000 points). */
export function lignesHistoriques(parJeu) {
  const lignes = [];
  for (const [jeu, parMembre] of Object.entries(parJeu)) {
    for (const [user_id, total] of Object.entries(parMembre)) {
      let reste = entier(total);
      while (reste > 0) {
        const points = Math.min(reste, MAX_LIGNE);
        lignes.push({ user_id, espace: 'adulte', jeu, points, pseudo: '', avatar: '', historique: true });
        reste -= points;
      }
    }
  }
  return lignes;
}

async function toutLire(url, headers, collection) {
  const r0 = await fetch(`${url}/api/collections/${collection}`, { headers });
  if (r0.status === 404) return [];
  const lignes = [];
  for (let page = 1; ; page += 1) {
    const q = new URLSearchParams({ page: String(page), perPage: '500', skipTotal: 'true' });
    const r = await fetch(`${url}/api/collections/${collection}/records?${q}`, { headers });
    if (!r.ok) throw new Error(`lecture de ${collection} impossible (HTTP ${r.status})`);
    const items = (await r.json()).items || [];
    lignes.push(...items);
    if (items.length < 500) return lignes;
  }
}

export async function migrer(url, headers, { appliquer = false, log = () => {} } = {}) {
  const changements = [];
  const r = await fetch(`${url}/api/collections/ScoreJeu`, { headers });
  if (!r.ok) throw new Error(`collection ScoreJeu introuvable (HTTP ${r.status})`);
  const col = await r.json();

  // 1. Champ « historique »
  if ((col.fields || []).some((f) => f.name === 'historique')) log('  = ScoreJeu.historique existe déjà');
  else {
    changements.push('ScoreJeu.historique');
    log('  - ScoreJeu : nouveau champ « historique » (scores repris d\'avant le Score Board)');
    if (appliquer) {
      const fields = [...col.fields, { name: 'historique', type: 'bool', required: false, hidden: false, system: false, presentable: false }];
      const p = await fetch(`${url}/api/collections/ScoreJeu`, { method: 'PATCH', headers, body: JSON.stringify({ fields }) });
      if (!p.ok) throw new Error(`ScoreJeu : refusé (HTTP ${p.status}) ${(await p.text()).slice(0, 300)}`);
    }
  }

  // 2. Scores historiques
  const scores = await toutLire(url, headers, 'ScoreJeu');
  if (scores.some((s) => s.historique)) {
    log('  = Scores historiques déjà repris');
    return changements;
  }
  const debut = debutsScoreBoard(scores);
  const [questions, reponses, mots, briques] = await Promise.all([
    toutLire(url, headers, 'QuizQuestion'), toutLire(url, headers, 'QuizAnswerHistory'),
    toutLire(url, headers, 'WordScrambleHistory'), toutLire(url, headers, 'BlockBlastScore'),
  ]);
  const parJeu = {
    trivia: pointsQuiz(reponses, questions, debut.trivia),
    scramble: pointsScramble(mots, debut.scramble),
    brique: pointsBrique(briques, debut.brique),
  };
  const lignes = lignesHistoriques(parJeu);
  for (const jeu of Object.keys(parJeu)) {
    const membres = Object.keys(parJeu[jeu]).length;
    const total = Object.values(parJeu[jeu]).reduce((a, b) => a + b, 0);
    log(`  ${membres ? '-' : '='} ${jeu} : ${membres} membre(s), ${total} point(s) repris (parties avant ${debut[jeu] || 'aujourd\'hui'})`);
  }
  if (lignes.length) changements.push(`${lignes.length} score(s) historique(s)`);
  if (appliquer) {
    for (const l of lignes) {
      const p = await fetch(`${url}/api/collections/ScoreJeu/records`, { method: 'POST', headers, body: JSON.stringify(l) });
      if (!p.ok) throw new Error(`score historique refusé (HTTP ${p.status}) ${(await p.text()).slice(0, 200)}`);
    }
  }
  log(`  i Membres adultes au classement « Toujours » après la reprise : ${new Set([...scores.filter((s) => s.espace === 'adulte').map((s) => s.user_id), ...lignes.map((l) => l.user_id)]).size}`);
  return changements;
}

async function main() {
  const URL_PB = (process.env.PB_URL || '').replace(/\/+$/, '');
  const { PB_EMAIL: email, PB_PASSWORD: password } = process.env;
  const appliquer = process.argv.includes('--appliquer');
  if (!URL_PB || !email || !password) throw new Error('PB_URL, PB_EMAIL et PB_PASSWORD (superuser) sont requis.');
  const auth = await fetch(`${URL_PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: email, password }),
  });
  if (!auth.ok) throw new Error(`connexion superuser refusée (HTTP ${auth.status})`);
  const h = { Authorization: (await auth.json()).token, 'Content-Type': 'application/json' };
  console.log(`Serveur : ${URL_PB}`);
  const changements = await migrer(URL_PB, h, { appliquer, log: console.log });
  if (!changements.length) console.log('Déjà à jour : rien à faire.');
  else console.log(appliquer ? `Appliqué (${changements.length} changement(s)).` : 'Simulation : relancer avec --appliquer pour écrire.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`Erreur : ${e.message}`); process.exitCode = 1; });
}
