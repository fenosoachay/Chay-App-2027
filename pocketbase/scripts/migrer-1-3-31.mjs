#!/usr/bin/env node
// Migration 1.3.31 :
//  1. ProgresJeu : progrès d'un membre dans un jeu, gardé sur son compte ({ user_id, jeu, donnees json }, une
//     ligne par membre et par jeu ; chacun ne voit et ne modifie que les siennes) : album des personnages
//     (Émojis), records des Mots croisés ;
//  2. MotCroise : les mots des Mots croisés (lecture : membres connectés ; écriture : admins), remplie avec les
//     215 mots de départ (src/data/motsCroises.json) si elle est vide.
// Idempotente. Usage (tunnel SSH ouvert, SUPERUSER) :
//   node pocketbase/scripts/migrer-1-3-31.mjs              -> simulation
//   node pocketbase/scripts/migrer-1-3-31.mjs --appliquer  -> applique

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const PROPRIETAIRE = '@request.auth.id != "" && user_id = @request.auth.id';
const CONNECTES = '@request.auth.id != ""';
const ADMINS = '@request.auth.role = "admin"';
const texte = (name, max, extra = {}) => ({ name, type: 'text', required: false, presentable: false, hidden: false, system: false, min: 0, max, pattern: '', ...extra });
const json = (name, maxSize = 200000) => ({ name, type: 'json', required: false, presentable: false, hidden: false, system: false, maxSize });
const bool = (name) => ({ name, type: 'bool', required: false, presentable: false, hidden: false, system: false });
const autodate = (name, onCreate, onUpdate) => ({ name, type: 'autodate', onCreate, onUpdate, hidden: false, system: false });

export const COLLECTION = {
  name: 'ProgresJeu', type: 'base',
  listRule: PROPRIETAIRE, viewRule: PROPRIETAIRE, createRule: PROPRIETAIRE, updateRule: PROPRIETAIRE, deleteRule: PROPRIETAIRE,
  fields: [
    texte('user_id', 40, { required: true }), texte('jeu', 30, { required: true }), json('donnees'),
    autodate('created', true, false), autodate('updated', true, true),
  ],
  indexes: ['CREATE UNIQUE INDEX idx_progresjeu_membre_jeu ON ProgresJeu (user_id, jeu)'],
};

export const COLLECTION_MOTS = {
  name: 'MotCroise', type: 'base',
  listRule: CONNECTES, viewRule: CONNECTES, createRule: ADMINS, updateRule: ADMINS, deleteRule: ADMINS,
  fields: [
    texte('mot', 40, { required: true }), texte('definition', 300, { required: true }), texte('reference', 60), bool('actif'),
    autodate('created', true, false), autodate('updated', true, true),
  ],
  indexes: [],
};

export const MOTS_DEPART = () => JSON.parse(fs.readFileSync(new URL('../../src/data/motsCroises.json', import.meta.url), 'utf8'));

const lire = (url, headers, init = {}) => fetch(url, { headers, signal: AbortSignal.timeout(60000), ...init });

export async function migrer(url, headers, { appliquer = false, log = () => {}, motsDepart = MOTS_DEPART } = {}) {
  const changements = [];
  const creer = async (col, quoi) => {
    const r = await lire(`${url}/api/collections/${col.name}`, headers);
    if (r.ok) { log(`  = ${col.name} existe déjà`); return false; }
    if (r.status !== 404) throw new Error(`lecture de ${col.name} impossible (HTTP ${r.status})`);
    changements.push(col.name);
    log(`  - ${col.name} : nouvelle collection (${quoi})`);
    if (appliquer) {
      const p = await lire(`${url}/api/collections`, headers, { method: 'POST', body: JSON.stringify(col) });
      if (!p.ok) throw new Error(`création de ${col.name} refusée (HTTP ${p.status}) ${(await p.text()).slice(0, 300)}`);
    }
    return true;
  };
  await creer(COLLECTION, 'album des personnages, records des Mots croisés');
  const nouvelle = await creer(COLLECTION_MOTS, 'mots des Mots croisés');

  // Mots de départ, seulement si la liste est vide.
  let nb = 0;
  if (!nouvelle) {
    const r = await lire(`${url}/api/collections/MotCroise/records?perPage=1`, headers);
    if (!r.ok) throw new Error(`lecture de MotCroise impossible (HTTP ${r.status})`);
    nb = Number((await r.json()).totalItems || 0);
  }
  if (nb) log(`  = MotCroise : ${nb} mot(s) déjà là (rien n'est ajouté)`);
  else {
    const mots = motsDepart();
    changements.push(`${mots.length} mots`);
    log(`  - MotCroise : ${mots.length} mots de départ ajoutés`);
    if (appliquer) {
      for (const m of mots) {
        const p = await lire(`${url}/api/collections/MotCroise/records`, headers, { method: 'POST', body: JSON.stringify({ ...m, actif: true }) });
        if (!p.ok) throw new Error(`mot « ${m.mot} » refusé (HTTP ${p.status}) ${(await p.text()).slice(0, 200)}`);
      }
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
  console.log(`Serveur : ${URL_PB}`);
  const changements = await migrer(URL_PB, h, { appliquer, log: console.log });
  if (!changements.length) console.log('Déjà à jour : rien à faire.');
  else console.log(appliquer ? `Appliqué (${changements.length} changement(s)).` : 'Simulation : relancer avec --appliquer pour écrire.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`Erreur : ${e.message}`); process.exitCode = 1; });
}
