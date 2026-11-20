#!/usr/bin/env node
// Migration 1.3.20 : nouvelle collection JaimeVideo (« J'aime » des vidéos de la playlist Drôle, façon TikTok).
// Une ligne par membre et par vidéo (index unique) ; chaque membre ne crée / supprime que ses propres « J'aime ».
// Idempotente. Usage (tunnel SSH ouvert, identifiants SUPERUSER saisis masqués) :
//   node pocketbase/scripts/migrer-1-3-20.mjs                   -> simulation
//   node pocketbase/scripts/migrer-1-3-20.mjs --appliquer       -> applique
//   node pocketbase/scripts/migrer-1-3-20.mjs --fragment f.json -> fragment collections.json (sans réseau)

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const MEMBRES = '@request.auth.id != ""';

const texte = (name, max, extra = {}) => ({
  name, type: 'text', required: false, presentable: false, hidden: false, system: false, min: 0, max, pattern: '', ...extra,
});
const autodate = (name, onCreate, onUpdate) => ({ name, type: 'autodate', onCreate, onUpdate, hidden: false, system: false });

export function nouvellesCollections() {
  return [
    {
      name: 'JaimeVideo',
      type: 'base',
      listRule: MEMBRES,
      viewRule: MEMBRES,
      createRule: '@request.auth.id != "" && @request.body.created_by_id = @request.auth.id',
      updateRule: null, // un « J'aime » ne se modifie pas : on le crée ou on le supprime
      deleteRule: '@request.auth.id != "" && created_by_id = @request.auth.id',
      fields: [
        texte('track_id', 40, { required: true }),
        texte('created_by_id', 64, { required: true }),
        autodate('created', true, false),
        autodate('updated', true, true),
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_jaimevideo_membre_video ON JaimeVideo (created_by_id, track_id)',
        'CREATE INDEX idx_jaimevideo_video ON JaimeVideo (track_id)',
      ],
    },
  ];
}

async function migrer(url, headers, { appliquer = false, log = () => {} } = {}) {
  const changements = [];
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
    console.log(`Fragment écrit : ${sortie} (JaimeVideo).`);
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
