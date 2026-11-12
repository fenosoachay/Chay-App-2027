#!/usr/bin/env node
// Migration de schéma du lot D (1.3.6), idempotente :
//  - Announcement : `event_time` (texte HH:MM, heure de la réunion), `archived` (booléen, posé par la tâche serveur
//    reunions_archivage) ; règles de lecture : une réunion archivée n'est plus visible que des admins ;
//  - ChurchHistory (nouvelle) : page « Histoire de l'église » (titre, texte, photos), rédigée par l'admin ;
//  - StaffMember (nouvelle) : « Personnel » (nom, rôle, photo, ordre), géré par l'admin.
// Lecture : membres connectés ; écriture : admins. Aucune donnée existante n'est modifiée.
//
// Usage (tunnel SSH ouvert ; identifiants saisis masqués, voir docs/LOT-D.md) :
//   node pocketbase/scripts/migrer-lot-d.mjs                 -> simulation
//   node pocketbase/scripts/migrer-lot-d.mjs --appliquer     -> applique
//   node pocketbase/scripts/migrer-lot-d.mjs --fragment f.json -> écrit le fragment collections.json (sans réseau)
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const MEMBRES = '@request.auth.id != ""';
const ADMINS = '@request.auth.role = "admin"';
export const REGLE_LECTURE_ANNONCES = '@request.auth.id != "" && (archived = false || @request.auth.role = "admin")';
export const HEURE = '^([01][0-9]|2[0-3]):[0-5][0-9]$';

const texte = (name, max, extra = {}) => ({ name, type: 'text', required: false, presentable: false, hidden: false, system: false, min: 0, max, pattern: '', ...extra });
const base44 = () => [
  texte('created_by_id', 64),
  { name: 'base44_created_date', type: 'date', required: false, hidden: false, system: false, min: '', max: '' },
  { name: 'base44_updated_date', type: 'date', required: false, hidden: false, system: false, min: '', max: '' },
  texte('base44_created_by', 255),
  { name: 'created', type: 'autodate', onCreate: true, onUpdate: false, hidden: false, system: false },
  { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true, hidden: false, system: false },
];
const regles = { listRule: MEMBRES, viewRule: MEMBRES, createRule: ADMINS, updateRule: ADMINS, deleteRule: ADMINS };

/** Collections créées par ce lot. */
export function nouvellesCollections() {
  return [
    {
      name: 'ChurchHistory', type: 'base', ...regles,
      fields: [
        texte('title', 200),
        texte('body', 100000),
        { name: 'photos', type: 'json', required: false, hidden: false, system: false, maxSize: 200000 },
        ...base44(),
      ],
    },
    {
      name: 'StaffMember', type: 'base', ...regles,
      fields: [
        texte('name', 200, { required: true }),
        texte('role', 200),
        texte('photo_url', 5000),
        { name: 'order', type: 'number', required: false, hidden: false, system: false, min: null, max: null, onlyInt: false },
        ...base44(),
      ],
    },
  ];
}

/** Changements de la collection Announcement (null si déjà à jour). Ne modifie pas `col`. */
export function planAnnonces(col) {
  if (!col || !Array.isArray(col.fields)) throw new Error('collection Announcement illisible');
  const fields = col.fields.map((f) => ({ ...f }));
  const changements = [];
  const heure = fields.find((f) => f.name === 'event_time');
  if (heure && heure.type !== 'text') throw new Error('Announcement.event_time existe avec un autre type : arrêt');
  if (!heure) {
    fields.push(texte('event_time', 5, { pattern: HEURE }));
    changements.push('event_time : nouveau champ texte HH:MM');
  }
  const archive = fields.find((f) => f.name === 'archived');
  if (archive && archive.type !== 'bool') throw new Error('Announcement.archived existe avec un autre type : arrêt');
  if (!archive) {
    fields.push({ name: 'archived', type: 'bool', required: false, hidden: false, system: false });
    changements.push('archived : nouveau champ booléen');
  }
  const corps = { fields };
  for (const r of ['listRule', 'viewRule']) {
    if (col[r] !== REGLE_LECTURE_ANNONCES) {
      corps[r] = REGLE_LECTURE_ANNONCES;
      changements.push(`${r} : réunions archivées réservées aux admins`);
    }
  }
  return changements.length ? { corps, changements } : null;
}

async function main() {
  const i = process.argv.indexOf('--fragment');
  if (i > 0) {
    const sortie = process.argv[i + 1];
    if (!sortie) throw new Error('--fragment : chemin du fichier attendu');
    fs.writeFileSync(sortie, `${JSON.stringify(nouvellesCollections(), null, 2)}\n`);
    console.log(`Fragment écrit : ${sortie} (ChurchHistory, StaffMember). Announcement : voir planAnnonces (champs ajoutés).`);
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
  let rien = true;

  const ann = await fetch(`${URL_PB}/api/collections/Announcement`, { headers: h });
  if (!ann.ok) throw new Error(`lecture de Announcement impossible (HTTP ${ann.status})`);
  const colAnn = await ann.json();
  const plan = planAnnonces(colAnn);
  if (plan) {
    rien = false;
    for (const c of plan.changements) console.log(`  - Announcement ${c}`);
    if (appliquer) {
      const r = await fetch(`${URL_PB}/api/collections/${colAnn.id}`, { method: 'PATCH', headers: h, body: JSON.stringify(plan.corps) });
      if (!r.ok) throw new Error(`Announcement : mise à jour refusée (HTTP ${r.status}) ${(await r.text()).slice(0, 300)}`);
    }
  }
  for (const def of nouvellesCollections()) {
    const r = await fetch(`${URL_PB}/api/collections/${def.name}`, { headers: h });
    if (r.ok) continue;
    if (r.status !== 404) throw new Error(`lecture de ${def.name} impossible (HTTP ${r.status})`);
    rien = false;
    console.log(`  - ${def.name} : nouvelle collection (${def.fields.filter((f) => !f.name.startsWith('base44_') && !['created', 'updated', 'created_by_id'].includes(f.name)).map((f) => f.name).join(', ')})`);
    if (appliquer) {
      const c = await fetch(`${URL_PB}/api/collections`, { method: 'POST', headers: h, body: JSON.stringify(def) });
      if (!c.ok) throw new Error(`${def.name} : création refusée (HTTP ${c.status}) ${(await c.text()).slice(0, 300)}`);
    }
  }
  if (rien) console.log('Déjà à jour : rien à faire.');
  else console.log(appliquer ? 'Appliqué.' : 'Simulation : relancer avec --appliquer pour écrire.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`Erreur : ${e.message}`); process.exitCode = 1; });
}
