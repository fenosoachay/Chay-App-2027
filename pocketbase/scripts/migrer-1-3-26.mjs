#!/usr/bin/env node
// Migration 1.3.26 :
//  1. VideoEnfant : vidéos de l'espace Enfants (Admin › Chay Kids › Vidéos). Même schéma et mêmes règles que
//     Video (copiés depuis le serveur), rangées dans des playlists de la catégorie « enfants ».
//  2. Valeur « enfants » ajoutée aux champs « catégorie » (liste fermée) qui contiennent déjà « films », et
//     « VideoEnfant » à ceux qui contiennent déjà « Video » (playlists, liens de playlist, contenus publiés…).
//  3. ProfilEnfant : les enfants d'un compte (pseudo + animal + progression des jeux), enregistrés sur le serveur
//     pour ne plus jamais les perdre (« Qui joue ? »). Chaque compte ne voit que ses enfants.
//     Les enfants qui ont déjà des points au Score Board (ScoreJeu) sont recréés automatiquement.
//  4. TexteDefilant : textes qui défilent sur la photo des lecteurs (Musique, Prédication, Bible en audio).
//  5. Diagnostic (lecture seule) : nombre de scores enregistrés (adultes, enfants) et date du dernier.
// Idempotente. Usage (tunnel SSH ouvert, identifiants SUPERUSER saisis masqués) :
//   node pocketbase/scripts/migrer-1-3-26.mjs              -> simulation
//   node pocketbase/scripts/migrer-1-3-26.mjs --appliquer  -> applique

import { pathToFileURL } from 'node:url';

const PUBLIC = '';
const ADMINS = '@request.auth.role = "admin"';
const PROPRIETAIRE = '@request.auth.id != "" && user_id = @request.auth.id';
const texte = (name, max, extra = {}) => ({ name, type: 'text', required: false, presentable: false, hidden: false, system: false, min: 0, max, pattern: '', ...extra });
const nombre = (name, extra = {}) => ({ name, type: 'number', required: false, presentable: false, hidden: false, system: false, onlyInt: false, ...extra });
const json = (name, maxSize = 200000) => ({ name, type: 'json', required: false, presentable: false, hidden: false, system: false, maxSize });
const choix = (name, values, extra = {}) => ({ name, type: 'select', values, maxSelect: 1, required: false, presentable: false, hidden: false, system: false, ...extra });
const autodate = (name, onCreate, onUpdate) => ({ name, type: 'autodate', onCreate, onUpdate, hidden: false, system: false });
const dates = () => [autodate('created', true, false), autodate('updated', true, true)];

export const DIRECTIONS = ['monte', 'gauche'];
export const LECTEURS = ['partout', 'musique', 'predication', 'bible'];
export const VITESSES = ['lent', 'normal', 'rapide'];
export const COULEURS = ['blanc', 'dore', 'jaune', 'rose', 'bleu'];

export const COLLECTIONS = [
  {
    name: 'ProfilEnfant', type: 'base',
    listRule: PROPRIETAIRE, viewRule: PROPRIETAIRE, createRule: PROPRIETAIRE, updateRule: PROPRIETAIRE, deleteRule: PROPRIETAIRE,
    fields: [texte('user_id', 40, { required: true }), texte('pseudo', 20, { required: true }), texte('avatar', 16), json('progres'), ...dates()],
    indexes: ['CREATE UNIQUE INDEX idx_profilenfant_compte_pseudo ON ProfilEnfant (user_id, pseudo)'],
  },
  {
    name: 'TexteDefilant', type: 'base',
    listRule: PUBLIC, viewRule: PUBLIC, createRule: ADMINS, updateRule: ADMINS, deleteRule: ADMINS,
    fields: [
      texte('texte', 500, { required: true }), choix('direction', DIRECTIONS, { required: true }), choix('ou', LECTEURS, { required: true }),
      texte('playlist_id', 40), texte('track_id', 40), texte('debut', 10), texte('fin', 10),
      choix('vitesse', VITESSES), choix('couleur', COULEURS), nombre('order'), ...dates(),
    ],
    indexes: [],
  },
];

/** Schéma de VideoEnfant à partir de celui de Video (champs sans identifiant, index renommés). */
export function copieVideo(video) {
  const fields = (video.fields || [])
    .filter((f) => f.name !== 'id')
    .map((f) => { const c = { ...f }; delete c.id; return c; });
  const indexes = (video.indexes || []).map((sql) => String(sql)
    .replace(/(INDEX\s+[`"]?)([A-Za-z0-9_]+)([`"]?\s+ON)/i, (m, a, nom, b) => `${a}${nom}_enfant${b}`)
    .replace(/(ON\s+[`"]?)Video([`"]?\s*\()/i, '$1VideoEnfant$2'));
  return {
    name: 'VideoEnfant', type: 'base', fields, indexes,
    listRule: video.listRule, viewRule: video.viewRule, createRule: video.createRule,
    updateRule: video.updateRule, deleteRule: video.deleteRule,
  };
}

/** Champs « liste fermée » à compléter : [valeur déjà présente, valeur à ajouter]. */
export const VALEURS_EN_PLUS = [['films', 'enfants'], ['Video', 'VideoEnfant'], ['film', 'film_enfant']];
export const COLLECTIONS_A_COMPLETER = ['Playlist', 'PlaylistTrack', 'PlaylistItem', 'Content', 'UserNotification', 'AppNotification'];

/** Champs select modifiés (ou null) : ajoute les valeurs manquantes à côté de leur « modèle ». */
export function completerSelects(fields) {
  let change = false;
  const nouveaux = (fields || []).map((f) => {
    if (f.type !== 'select' || !Array.isArray(f.values)) return f;
    const ajout = VALEURS_EN_PLUS.filter(([modele, v]) => f.values.includes(modele) && !f.values.includes(v)).map(([, v]) => v);
    if (!ajout.length) return f;
    change = true;
    return { ...f, values: [...f.values, ...ajout] };
  });
  return change ? nouveaux : null;
}

/** ScoreJeu (enfants) -> profils à recréer : un par compte et par pseudo, avec le dernier animal utilisé. */
export function profilsDepuisScores(scores) {
  const m = new Map();
  for (const s of scores || []) {
    const pseudo = String(s.pseudo || '').trim();
    if (!s.user_id || !pseudo) continue;
    const cle = `${s.user_id}|${pseudo.toLowerCase()}`;
    const avant = m.get(cle);
    if (!avant || String(s.created || '') > avant.created) m.set(cle, { user_id: s.user_id, pseudo, avatar: s.avatar || '', created: String(s.created || '') });
  }
  return [...m.values()].map(({ created, ...p }) => p);
}

async function toutLire(url, headers, collection, filtre = '') {
  const lignes = [];
  for (let page = 1; ; page += 1) {
    const q = new URLSearchParams({ page: String(page), perPage: '500', skipTotal: 'true' });
    if (filtre) q.set('filter', filtre);
    const r = await fetch(`${url}/api/collections/${collection}/records?${q}`, { headers });
    if (!r.ok) throw new Error(`lecture de ${collection} impossible (HTTP ${r.status})`);
    const items = (await r.json()).items || [];
    lignes.push(...items);
    if (items.length < 500) return lignes;
  }
}

export async function migrer(url, headers, { appliquer = false, log = () => {} } = {}) {
  const changements = [];
  const ecrire = async (methode, chemin, corps, quoi) => {
    const r = await fetch(`${url}${chemin}`, { method: methode, headers, body: JSON.stringify(corps) });
    if (!r.ok) throw new Error(`${quoi} : refusé (HTTP ${r.status}) ${(await r.text()).slice(0, 300)}`);
    return r.json().catch(() => ({}));
  };
  const existe = async (nom) => {
    const r = await fetch(`${url}/api/collections/${nom}`, { headers });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`lecture de ${nom} impossible (HTTP ${r.status})`);
    return r.json();
  };

  // 1. VideoEnfant (copie de Video)
  if (await existe('VideoEnfant')) log('  = VideoEnfant existe déjà');
  else {
    const video = await existe('Video');
    if (!video) throw new Error('collection Video introuvable');
    changements.push('VideoEnfant (création)');
    log(`  - VideoEnfant : nouvelle collection (copie de Video, ${(video.fields || []).length} champs)`);
    if (appliquer) await ecrire('POST', '/api/collections', copieVideo(video), 'VideoEnfant');
  }

  // 2. Listes fermées : « enfants » / « VideoEnfant »
  for (const nom of COLLECTIONS_A_COMPLETER) {
    const col = await existe(nom);
    if (!col) { log(`  = ${nom} absente`); continue; }
    const fields = completerSelects(col.fields);
    if (!fields) { log(`  = ${nom} : rien à compléter`); continue; }
    changements.push(`${nom} (valeurs enfants)`);
    log(`  - ${nom} : valeurs « enfants » ajoutées aux listes fermées`);
    if (appliquer) await ecrire('PATCH', `/api/collections/${nom}`, { fields }, nom);
  }

  // 3-4. ProfilEnfant, TexteDefilant
  for (const c of COLLECTIONS) {
    if (await existe(c.name)) { log(`  = ${c.name} existe déjà`); continue; }
    changements.push(`${c.name} (création)`);
    log(`  - ${c.name} : nouvelle collection`);
    if (appliquer) await ecrire('POST', '/api/collections', c, c.name);
  }

  // 3 bis. Enfants qui ont déjà joué : profils recréés (jamais en double)
  const scores = (await existe('ScoreJeu')) ? await toutLire(url, headers, 'ScoreJeu') : [];
  const aCreer = profilsDepuisScores(scores.filter((s) => s.espace === 'enfant'));
  const deja = (await existe('ProfilEnfant')) ? await toutLire(url, headers, 'ProfilEnfant') : [];
  const connus = new Set(deja.map((p) => `${p.user_id}|${String(p.pseudo || '').toLowerCase()}`));
  const nouveaux = aCreer.filter((p) => !connus.has(`${p.user_id}|${p.pseudo.toLowerCase()}`));
  if (!nouveaux.length) log(`  = ProfilEnfant : ${aCreer.length} enfant(s) déjà enregistré(s)`);
  for (const p of nouveaux) {
    changements.push(`profil ${p.pseudo}`);
    log(`  - ProfilEnfant : ${p.pseudo} ${p.avatar}`);
    if (appliquer) await ecrire('POST', '/api/collections/ProfilEnfant/records', { ...p, progres: {} }, `profil ${p.pseudo}`);
  }

  // 5. Diagnostic des scores (lecture seule)
  const adultes = scores.filter((s) => s.espace === 'adulte');
  const enfants = scores.filter((s) => s.espace === 'enfant');
  const dernier = scores.map((s) => String(s.created || '')).sort().pop() || 'aucun';
  log(`  i Scores enregistrés : ${adultes.length} adulte(s), ${enfants.length} enfant(s) ; dernier : ${dernier}`);
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
