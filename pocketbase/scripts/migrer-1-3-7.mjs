#!/usr/bin/env node
// Migration de schéma de la 1.3.7, idempotente : Bible › « Sagesse en audio ».
//  - BibleAudio (nouvelle) : un audio par chapitre de Proverbes (1 à 31) et des Psaumes (1 à 150) ;
//    `book` + `chapter` uniques, `audio_url` (adresse R2), `duration` (secondes), `size` (octets).
//    Lecture : membres connectés ; écriture : admins. Le chapitre maximal par livre est vérifié par le hook
//    pb_hooks/bible_audio.pb.js.
// Aucune donnée existante n'est modifiée.
//
// Usage (tunnel SSH ouvert ; identifiants saisis masqués, voir docs/1.3.7.md) :
//   node pocketbase/scripts/migrer-1-3-7.mjs                   -> simulation (rien n'est écrit)
//   node pocketbase/scripts/migrer-1-3-7.mjs --appliquer       -> applique
//   node pocketbase/scripts/migrer-1-3-7.mjs --fragment f.json -> écrit le fragment collections.json (sans réseau)
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { planChamps } from './migrer-lot-e.mjs';

const MEMBRES = '@request.auth.id != ""';
const ADMINS = '@request.auth.role = "admin"';
const texte = (name, max, extra = {}) => ({ name, type: 'text', required: false, presentable: false, hidden: false, system: false, min: 0, max, pattern: '', ...extra });
const nombre = (name, extra = {}) => ({ name, type: 'number', required: false, hidden: false, system: false, min: null, max: null, onlyInt: false, ...extra });

export const LIVRES = ['proverbes', 'psaumes'];

export function nouvellesCollections() {
  return [
    {
      name: 'BibleAudio', type: 'base',
      listRule: MEMBRES, viewRule: MEMBRES, createRule: ADMINS, updateRule: ADMINS, deleteRule: ADMINS,
      fields: [
        { name: 'book', type: 'select', required: true, hidden: false, system: false, maxSelect: 1, values: LIVRES },
        nombre('chapter', { required: true, onlyInt: true, min: 1, max: 150 }),
        texte('audio_url', 2000, { required: true, pattern: '^https?://' }),
        nombre('duration', { onlyInt: true, min: 0 }),
        nombre('size', { onlyInt: true, min: 0 }),
        texte('created_by_id', 64),
        { name: 'base44_created_date', type: 'date', required: false, hidden: false, system: false, min: '', max: '' },
        { name: 'base44_updated_date', type: 'date', required: false, hidden: false, system: false, min: '', max: '' },
        texte('base44_created_by', 255),
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false, hidden: false, system: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true, hidden: false, system: false },
      ],
      indexes: ['CREATE UNIQUE INDEX `idx_bibleaudio_livre_chapitre` ON `BibleAudio` (`book`, `chapter`)'],
    },
  ];
}

/** Applique (ou simule) contre `url` avec l'en-tête superuser `h` ; renvoie la liste des changements. */
export async function migrer(url, h, { appliquer = false, log = () => {} } = {}) {
  const changements = [];
  const note = (t) => { changements.push(t); log(`  - ${t}`); };
  for (const def of nouvellesCollections()) {
    const r = await fetch(`${url}/api/collections/${def.name}`, { headers: h });
    if (r.status !== 404 && !r.ok) throw new Error(`lecture de ${def.name} impossible (HTTP ${r.status})`);
    if (r.ok) {
      const col = await r.json();
      const plan = planChamps(col, def.fields);
      if (!plan) continue;
      for (const f of plan.manquants) note(`${def.name}.${f.name} : nouveau champ ${f.type}`);
      if (appliquer) {
        const p = await fetch(`${url}/api/collections/${col.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ fields: plan.fields }) });
        if (!p.ok) throw new Error(`${def.name} : mise à jour refusée (HTTP ${p.status}) ${(await p.text()).slice(0, 300)}`);
      }
      continue;
    }
    note(`${def.name} : nouvelle collection (book, chapter, audio_url, duration, size ; livre + chapitre uniques)`);
    if (appliquer) {
      const c = await fetch(`${url}/api/collections`, { method: 'POST', headers: h, body: JSON.stringify(def) });
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
    console.log(`Fragment écrit : ${sortie} (BibleAudio).`);
    return;
  }
  const URL_PB = (process.env.PB_URL || '').replace(/\/+$/, '');
  const { PB_EMAIL: email, PB_PASSWORD: password } = process.env;
  const appliquer = process.argv.includes('--appliquer');
  if (!URL_PB || !email || !password) throw new Error('PB_URL, PB_EMAIL et PB_PASSWORD sont requis (voir l’en-tête du script).');
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
