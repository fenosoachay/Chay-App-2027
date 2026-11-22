#!/usr/bin/env node
// Migration 1.3.24 :
//  1. JaimeVideo : champ « reaction » (like 👍 / coeur ❤️ / haha 😂) et changement de sa propre réaction
//     (la collection est créée si elle manque) ; les anciens « J'aime » sans réaction comptent comme ❤️ ;
//  2. profils publics (MemberProfile) restés « Membre » ou vides alors que le compte a un prénom / nom :
//     le vrai nom est remis.
// Idempotente. Usage (tunnel SSH ouvert, identifiants SUPERUSER saisis masqués) :
//   node pocketbase/scripts/migrer-1-3-24.mjs              -> simulation
//   node pocketbase/scripts/migrer-1-3-24.mjs --appliquer  -> applique

import { pathToFileURL } from 'node:url';

export const CHAMP_REACTION = {
  name: 'reaction', type: 'select', values: ['like', 'coeur', 'haha'], maxSelect: 1, required: false, hidden: false, system: false,
};
// Un membre ne change que la réaction de SA ligne (pas la vidéo, pas l'auteur).
export const REGLE_MAJ = '@request.auth.id != "" && created_by_id = @request.auth.id && @request.body.created_by_id:isset = false && @request.body.track_id:isset = false';

const texte = (name, max, extra = {}) => ({ name, type: 'text', required: false, presentable: false, hidden: false, system: false, min: 0, max, pattern: '', ...extra });
const autodate = (name, onCreate, onUpdate) => ({ name, type: 'autodate', onCreate, onUpdate, hidden: false, system: false });
export const COLLECTION_JAIME = {
  name: 'JaimeVideo', type: 'base',
  listRule: '@request.auth.id != ""', viewRule: '@request.auth.id != ""',
  createRule: '@request.auth.id != "" && @request.body.created_by_id = @request.auth.id',
  updateRule: REGLE_MAJ,
  deleteRule: '@request.auth.id != "" && created_by_id = @request.auth.id',
  fields: [texte('track_id', 40, { required: true }), texte('created_by_id', 64, { required: true }), CHAMP_REACTION, autodate('created', true, false), autodate('updated', true, true)],
  indexes: [
    'CREATE UNIQUE INDEX idx_jaimevideo_membre_video ON JaimeVideo (created_by_id, track_id)',
    'CREATE INDEX idx_jaimevideo_video ON JaimeVideo (track_id)',
  ],
};

export const nomDuCompte = (u) => [u.first_name, u.last_name].map((x) => String(x || '').trim()).filter(Boolean).join(' ');
export const profilARetablir = (p) => !String(p.display_name || '').trim() || String(p.display_name).trim() === 'Membre';

export async function migrer(url, headers, { appliquer = false, log = () => {} } = {}) {
  const changements = [];
  const ecrire = async (methode, chemin, corps, quoi) => {
    const r = await fetch(`${url}${chemin}`, { method: methode, headers, body: JSON.stringify(corps) });
    if (!r.ok) throw new Error(`${quoi} : refusé (HTTP ${r.status}) ${(await r.text()).slice(0, 300)}`);
  };

  // 1. JaimeVideo
  const rc = await fetch(`${url}/api/collections/JaimeVideo`, { headers });
  if (rc.status === 404) {
    changements.push('JaimeVideo (création)');
    log('  - JaimeVideo : collection absente -> création (avec réactions)');
    if (appliquer) await ecrire('POST', '/api/collections', COLLECTION_JAIME, 'JaimeVideo');
  } else if (!rc.ok) {
    throw new Error(`lecture de JaimeVideo impossible (HTTP ${rc.status})`);
  } else {
    const col = await rc.json();
    const aChamp = (col.fields || []).some((f) => f.name === 'reaction');
    const aRegle = col.updateRule === REGLE_MAJ;
    if (aChamp && aRegle) log('  = JaimeVideo : réactions déjà en place');
    else {
      changements.push('JaimeVideo (réactions)');
      log(`  - JaimeVideo :${aChamp ? '' : ' champ reaction'}${!aChamp && !aRegle ? ' +' : ''}${aRegle ? '' : ' règle de changement de réaction'}`);
      if (appliquer) {
        await ecrire('PATCH', '/api/collections/JaimeVideo', { fields: aChamp ? col.fields : [...col.fields, CHAMP_REACTION], updateRule: REGLE_MAJ }, 'JaimeVideo');
      }
    }
  }

  // 2. Profils publics « Membre » / vides
  const users = [];
  for (let page = 1; ; page++) {
    const r = await fetch(`${url}/api/collections/users/records?${new URLSearchParams({ page: String(page), perPage: '200', fields: 'id,first_name,last_name' })}`, { headers });
    if (!r.ok) throw new Error(`lecture des comptes refusée (HTTP ${r.status})`);
    const j = await r.json();
    users.push(...(j.items || []));
    if (page >= (j.totalPages || 1)) break;
  }
  const nomPar = new Map(users.map((u) => [u.id, nomDuCompte(u)]));
  const rp = await fetch(`${url}/api/collections/MemberProfile/records?${new URLSearchParams({ perPage: '500', filter: 'display_name = "" || display_name = "Membre"' })}`, { headers });
  if (!rp.ok) throw new Error(`lecture des profils refusée (HTTP ${rp.status})`);
  for (const p of (await rp.json()).items || []) {
    const nom = nomPar.get(p.created_by_id);
    if (!profilARetablir(p) || !nom) continue;
    changements.push(`profil ${p.id}`);
    log(`  - profil public « ${p.display_name || '(vide)'} » -> « ${nom} »`);
    if (appliquer) await ecrire('PATCH', `/api/collections/MemberProfile/records/${p.id}`, { display_name: nom }, `profil ${p.id}`);
  }
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
