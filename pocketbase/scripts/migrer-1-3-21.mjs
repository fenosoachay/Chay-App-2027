#!/usr/bin/env node
// Migration 1.3.21 :
//  - nouvelle collection Coloriage (section Enfants › Coloriage : dessins ajoutés par l'admin) ;
//  - compteur de vues `view_count` sur Paroles et Verset (route compterVue, types « parole » et « verset »).
// Idempotente. Usage (tunnel SSH ouvert, identifiants SUPERUSER saisis masqués) :
//   node pocketbase/scripts/migrer-1-3-21.mjs                   -> simulation
//   node pocketbase/scripts/migrer-1-3-21.mjs --appliquer       -> applique
//   node pocketbase/scripts/migrer-1-3-21.mjs --fragment f.json -> fragment collections.json (sans réseau)

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const MEMBRES = '@request.auth.id != ""';
const ADMINS = '@request.auth.role = "admin"';

const texte = (name, max, extra = {}) => ({
  name, type: 'text', required: false, presentable: false, hidden: false, system: false, min: 0, max, pattern: '', ...extra,
});
const nombre = (name) => ({ name, type: 'number', required: false, hidden: false, system: false });
const date = (name) => ({ name, type: 'date', required: false, hidden: false, system: false, min: '', max: '' });
const autodate = (name, onCreate, onUpdate) => ({ name, type: 'autodate', onCreate, onUpdate, hidden: false, system: false });

export function nouvellesCollections() {
  return [
    {
      name: 'Coloriage',
      type: 'base',
      listRule: MEMBRES,
      viewRule: MEMBRES,
      createRule: ADMINS,
      updateRule: ADMINS,
      deleteRule: ADMINS,
      fields: [
        texte('title', 200, { required: true }),
        texte('image_url', 5000, { required: true }),
        texte('thumb_url', 5000),
        nombre('order'),
        texte('created_by_id', 64),
        date('base44_created_date'),
        date('base44_updated_date'),
        texte('base44_created_by', 255),
        autodate('created', true, false),
        autodate('updated', true, true),
      ],
      indexes: ['CREATE INDEX idx_coloriage_created ON Coloriage (created)'],
    },
  ];
}

/** Champs à ajouter aux collections existantes : { collection: [champ] }. */
export const CHAMPS_AJOUTES = {
  Paroles: [nombre('view_count')],
  Verset: [nombre('view_count')],
};

async function migrer(url, headers, { appliquer = false, log = () => {} } = {}) {
  const changements = [];
  for (const [nom, champs] of Object.entries(CHAMPS_AJOUTES)) {
    const r = await fetch(`${url}/api/collections/${nom}`, { headers });
    if (!r.ok) throw new Error(`lecture de ${nom} impossible (HTTP ${r.status})`);
    const col = await r.json();
    const manquants = champs.filter((c) => !(col.fields || []).some((f) => f.name === c.name));
    if (!manquants.length) { log(`  = ${nom} : champs déjà présents`); continue; }
    changements.push(nom);
    log(`  - ${nom} : ajout de ${manquants.map((c) => c.name).join(', ')}`);
    if (appliquer) {
      const p = await fetch(`${url}/api/collections/${nom}`, {
        method: 'PATCH', headers, body: JSON.stringify({ fields: [...col.fields, ...manquants] }),
      });
      if (!p.ok) throw new Error(`${nom} : modification refusée (HTTP ${p.status}) ${(await p.text()).slice(0, 300)}`);
    }
  }
  for (const def of nouvellesCollections()) {
    const r = await fetch(`${url}/api/collections/${def.name}`, { headers });
    if (r.ok) { log(`  = ${def.name} existe déjà`); continue; }
    if (r.status !== 404) throw new Error(`lecture de ${def.name} impossible (HTTP ${r.status})`);
    changements.push(def.name);
    log(`  - ${def.name} : nouvelle collection`);
    if (appliquer) {
      const c = await fetch(`${url}/api/collections`, { method: 'POST', headers, body: JSON.stringify(def) });
      if (!c.ok) throw new Error(`${def.name} : création refusée (HTTP ${c.status}) ${(await c.text()).slice(0, 300)}`);
    }
  }
  return changements;
}

async function main() {
  const i = process.argv.indexOf('--fragment');
  if (i > 0) {
    const sortie = process.argv[i + 1];
    if (!sortie) throw new Error('--fragment : chemin du fichier attendu');
    fs.writeFileSync(sortie, `${JSON.stringify(nouvellesCollections(), null, 2)}\n`);
    console.log(`Fragment écrit : ${sortie} (Coloriage).`);
    return;
  }
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
  else console.log(appliquer ? 'Appliqué.' : 'Simulation : relancer avec --appliquer pour écrire.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`Erreur : ${e.message}`); process.exitCode = 1; });
}
