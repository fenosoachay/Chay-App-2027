#!/usr/bin/env node
// Migration 1.3.35 (idempotente) :
//  1. Texte qui défile et Image qui défile : champ `secondes` (durée réglée à la main : 5 s, 10 s, 20 s…) ;
//  2. Message : champ `piece_jointe` (message vocal, vidéo, document, audio ou autre fichier, jusqu'à 500 Mo) ;
//  3. Noms : chaque compte reprend « Prénom Nom » de Paramètres › Profil dans `name`, et ses profils publics
//     (MemberProfile.display_name) aussi. Corrige les comptes qui affichaient encore le nom Google de l'inscription.
// Usage (tunnel SSH ouvert, SUPERUSER) :
//   node pocketbase/scripts/migrer-1-3-35.mjs              -> simulation
//   node pocketbase/scripts/migrer-1-3-35.mjs --appliquer  -> applique
import { pathToFileURL } from 'node:url';

const nombre = (name) => ({ name, type: 'number', required: false, presentable: false, hidden: false, system: false, onlyInt: false, min: 0, max: 600 });
const json = (name, maxSize) => ({ name, type: 'json', required: false, presentable: false, hidden: false, system: false, maxSize });

export const CHAMPS = [
  { collection: 'TexteDefilant', champ: nombre('secondes') },
  { collection: 'ImageDefilante', champ: nombre('secondes') },
  { collection: 'Message', champ: json('piece_jointe', 4000) },
];

/** « Prénom Nom », sans espaces en trop (même règle que pb_hooks/lib/nouveauxMembres.js). */
export const nomComplet = (prenom, nom) => [prenom, nom].map((x) => String(x || '').trim()).filter(Boolean).join(' ');

/** Corrections de noms à faire : comptes (`name`) et profils publics (`display_name`). */
export function correctionsNoms(users, profils) {
  const noms = new Map();
  const comptes = [];
  for (const u of users || []) {
    const n = nomComplet(u.first_name, u.last_name);
    if (!n) continue;
    noms.set(u.id, n);
    if (String(u.name || '').trim() !== n) comptes.push({ id: u.id, avant: u.name || '', apres: n });
  }
  const publics = [];
  for (const p of profils || []) {
    const n = noms.get(p.created_by_id);
    if (n && String(p.display_name || '').trim() !== n) publics.push({ id: p.id, avant: p.display_name || '', apres: n });
  }
  return { comptes, publics };
}

const lire = (url, headers, init = {}) => fetch(url, { headers, signal: AbortSignal.timeout(60000), ...init });

async function tout(url, headers, collection, champs) {
  const out = [];
  for (let page = 1; page < 200; page++) {
    const r = await lire(`${url}/api/collections/${collection}/records?perPage=500&page=${page}&fields=${champs}&skipTotal=1`, headers);
    if (!r.ok) throw new Error(`lecture de ${collection} impossible (HTTP ${r.status})`);
    const { items } = await r.json();
    out.push(...items);
    if (items.length < 500) break;
  }
  return out;
}

export async function migrer(url, headers, { appliquer = false, log = () => {} } = {}) {
  const changements = [];
  for (const { collection, champ } of CHAMPS) {
    const r = await lire(`${url}/api/collections/${collection}`, headers);
    if (!r.ok) throw new Error(`lecture de ${collection} impossible (HTTP ${r.status})`);
    const col = await r.json();
    if ((col.fields || []).some((f) => f.name === champ.name)) { log(`  = ${collection}.${champ.name} : existe déjà`); continue; }
    changements.push(`${collection}.${champ.name}`);
    log(`  - ${collection}.${champ.name} : nouveau champ`);
    if (appliquer) {
      const p = await lire(`${url}/api/collections/${collection}`, headers, { method: 'PATCH', body: JSON.stringify({ fields: [...col.fields, champ] }) });
      if (!p.ok) throw new Error(`ajout de ${collection}.${champ.name} refusé (HTTP ${p.status}) ${(await p.text()).slice(0, 300)}`);
    }
  }

  const users = await tout(url, headers, 'users', 'id,name,first_name,last_name');
  const profils = await tout(url, headers, 'MemberProfile', 'id,created_by_id,display_name');
  const { comptes, publics } = correctionsNoms(users, profils);
  log(`  ${comptes.length ? '-' : '='} Noms des comptes à corriger : ${comptes.length}`);
  comptes.slice(0, 15).forEach((c) => log(`      « ${c.avant} » -> « ${c.apres} »`));
  log(`  ${publics.length ? '-' : '='} Profils publics à corriger : ${publics.length}`);
  if (comptes.length) changements.push(`${comptes.length} nom(s) de compte`);
  if (publics.length) changements.push(`${publics.length} profil(s) public(s)`);
  if (appliquer) {
    for (const c of comptes) {
      const p = await lire(`${url}/api/collections/users/records/${c.id}`, headers, { method: 'PATCH', body: JSON.stringify({ name: c.apres }) });
      if (!p.ok) throw new Error(`nom du compte ${c.id} refusé (HTTP ${p.status})`);
    }
    for (const c of publics) {
      const p = await lire(`${url}/api/collections/MemberProfile/records/${c.id}`, headers, { method: 'PATCH', body: JSON.stringify({ display_name: c.apres }) });
      if (!p.ok) throw new Error(`profil ${c.id} refusé (HTTP ${p.status})`);
    }
  }
  return changements;
}

async function main() {
  const URL_PB = (process.env.PB_URL || '').replace(/\/+$/, '');
  const { PB_EMAIL: email, PB_PASSWORD: password } = process.env;
  const appliquer = process.argv.includes('--appliquer');
  if (!URL_PB || !email || !password) throw new Error('PB_URL, PB_EMAIL et PB_PASSWORD (superuser) sont requis.');
  console.log(`Connexion à ${URL_PB}...`);
  const auth = await fetch(`${URL_PB}/api/collections/_superusers/auth-with-password`, {
    signal: AbortSignal.timeout(30000), method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password }),
  });
  if (!auth.ok) throw new Error(`connexion superuser refusée (HTTP ${auth.status})`);
  const h = { Authorization: (await auth.json()).token, 'Content-Type': 'application/json' };
  const changements = await migrer(URL_PB, h, { appliquer, log: console.log });
  if (!changements.length) console.log('Déjà à jour : rien à faire.');
  else console.log(appliquer ? `Appliqué (${changements.join(', ')}).` : 'Simulation : relancer avec --appliquer pour écrire.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`Erreur : ${e.message}`); process.exitCode = 1; });
}
