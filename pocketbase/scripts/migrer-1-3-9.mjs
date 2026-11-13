#!/usr/bin/env node
// Migration de schéma de la 1.3.9, idempotente : ordre du multimédia choisi par l'admin et vu par les membres.
//  - MediaOrder (nouvelle) : une ligne par liste ordonnée sans champ `order` dans sa collection :
//      key = « sections » (grille Multimédia), « youtube:culte|louange|celebration », « galerie:eglise|mindset|
//      non-classees » ; ids = identifiants dans l'ordre (json). Clé unique.
//    Lecture : membres connectés ; écriture : admins.
//  - Playlist : champs parent_id et category VISIBLES (option « Hidden » retirée) et présents. CAUSE DU BUG DES
//    SOUS-PLAYLISTS EN PROD : parent_id « Hidden » est ignoré sans erreur pour un admin de l'app (parent_id vide en
//    base, sélecteur de classement vide). Même contrôle que migrer-playlists.mjs.
// Aucune donnée existante n'est modifiée (Musique, Prédication, Articles, sous-playlists, Actualité chrétienne et
// Fonds d'écran gardent leur champ `order`) ; les sous-playlists créées à tort se rattachent avec
// reparer-sous-playlists.mjs.
//
// Usage (tunnel SSH ouvert ; identifiants superuser saisis masqués, voir docs/1.3.9.md) :
//   node pocketbase/scripts/migrer-1-3-9.mjs                   -> simulation
//   node pocketbase/scripts/migrer-1-3-9.mjs --appliquer       -> applique
//   node pocketbase/scripts/migrer-1-3-9.mjs --fragment f.json -> fragment collections.json (sans réseau)
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { planChamps } from './migrer-lot-e.mjs';
import { champsMigres } from './migrer-playlists.mjs';

const MEMBRES = '@request.auth.id != ""';
const ADMINS = '@request.auth.role = "admin"';
const texte = (name, max, extra = {}) => ({ name, type: 'text', required: false, presentable: false, hidden: false, system: false, min: 0, max, pattern: '', ...extra });

export function nouvellesCollections() {
  return [{
    name: 'MediaOrder', type: 'base',
    listRule: MEMBRES, viewRule: MEMBRES, createRule: ADMINS, updateRule: ADMINS, deleteRule: ADMINS,
    fields: [
      texte('key', 60, { required: true, pattern: '^[a-z0-9:_-]+$' }),
      { name: 'ids', type: 'json', required: false, hidden: false, system: false, maxSize: 400000 },
      texte('created_by_id', 64),
      { name: 'base44_created_date', type: 'date', required: false, hidden: false, system: false, min: '', max: '' },
      { name: 'base44_updated_date', type: 'date', required: false, hidden: false, system: false, min: '', max: '' },
      texte('base44_created_by', 255),
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false, hidden: false, system: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true, hidden: false, system: false },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_mediaorder_key` ON `MediaOrder` (`key`)'],
  }];
}

/** Applique (ou simule) ; renvoie la liste des changements. */
export async function migrer(url, h, { appliquer = false, log = () => {} } = {}) {
  const changements = [];
  const note = (t) => { changements.push(t); log(`  - ${t}`); };
  // Playlist : parent_id présent et visible (option « Hidden » retirée), category visible.
  const rp = await fetch(`${url}/api/collections/Playlist`, { headers: h });
  if (!rp.ok) throw new Error(`lecture de Playlist impossible (HTTP ${rp.status})`);
  const colP = await rp.json();
  const planP = champsMigres(colP.fields);
  if (planP) {
    for (const c of planP.changements) note(`Playlist.${c}`);
    if (appliquer) {
      const r = await fetch(`${url}/api/collections/${colP.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ fields: planP.fields }) });
      if (!r.ok) throw new Error(`Playlist : mise à jour refusée (HTTP ${r.status}) ${(await r.text()).slice(0, 300)}`);
    }
  }
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
        if (!p.ok) throw new Error(`${def.name} : mise à jour refusée (HTTP ${p.status})`);
      }
      continue;
    }
    note(`${def.name} : nouvelle collection (key, ids ; clé unique)`);
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
    console.log(`Fragment écrit : ${sortie} (MediaOrder).`);
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
