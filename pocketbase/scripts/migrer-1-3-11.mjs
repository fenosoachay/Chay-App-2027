#!/usr/bin/env node
// Migration 1.3.11 : nouvelles collections (Paroles, Verset, PageTexte, Staff)
// Idempotente : simulation seule, ou --appliquer pour écrire sur le serveur PocketBase.
// Usage (tunnel SSH ouvert, identifiants superuser saisis masqués) :
//   node pocketbase/scripts/migrer-1-3-11.mjs                   -> simulation
//   node pocketbase/scripts/migrer-1-3-11.mjs --appliquer       -> applique
//   node pocketbase/scripts/migrer-1-3-11.mjs --fragment f.json -> fragment collections.json (sans réseau)

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const MEMBRES = '@request.auth.id != ""';
const ADMINS = '@request.auth.role = "admin"';

function texte(name, max, extra = {}) {
  return { name, type: 'text', required: false, presentable: false, hidden: false, system: false, min: 0, max, pattern: '', ...extra };
}

function editeur(name, extra = {}) {
  return { name, type: 'editor', required: false, hidden: false, system: false, ...extra };
}

function date(name, extra = {}) {
  return { name, type: 'date', required: false, hidden: false, system: false, min: '', max: '', ...extra };
}

function nombre(name, extra = {}) {
  return { name, type: 'number', required: false, hidden: false, system: false, ...extra };
}

function fichier(name, accept, extra = {}) {
  return { name, type: 'file', required: false, accept, hidden: false, system: false, ...extra };
}

function images(name, extra = {}) {
  return { name, type: 'json', required: false, maxSize: 200000, hidden: false, system: false, ...extra };
}

function relation(name, collectionId, extra = {}) {
  return { name, type: 'relation', required: false, collectionId, cascadeDelete: false, hidden: false, system: false, ...extra };
}

function autodate(name, onCreate, onUpdate) {
  return { name, type: 'autodate', onCreate, onUpdate, hidden: false, system: false };
}

export function nouvellesCollections() {
  return [
    // ── Paroles : paroles de chansons, triables par date ou titre ────────────────
    {
      name: 'Paroles',
      type: 'base',
      listRule: MEMBRES,
      viewRule: MEMBRES,
      createRule: ADMINS,
      updateRule: ADMINS,
      deleteRule: ADMINS,
      fields: [
        texte('title', 200, { required: true }),
        editeur('body', { required: true }),
        date('date', { required: true }),
        nombre('order', { hidden: false }),
        texte('created_by_id', 64),
        { name: 'base44_created_date', type: 'date', required: false, hidden: false, system: false, min: '', max: '' },
        { name: 'base44_updated_date', type: 'date', required: false, hidden: false, system: false, min: '', max: '' },
        { name: 'base44_created_by', type: 'text', required: false, max: 255, hidden: false, system: false },
        autodate('created', true, false),
        autodate('updated', true, true),
      ],
      indexes: ['CREATE INDEX idx_paroles_date ON Paroles (date)'],
    },
    // ── Verset : versets prêchés dimanche, identique à Paroles + champ référence ──
    {
      name: 'Verset',
      type: 'base',
      listRule: MEMBRES,
      viewRule: MEMBRES,
      createRule: ADMINS,
      updateRule: ADMINS,
      deleteRule: ADMINS,
      fields: [
        texte('title', 200, { required: true }),
        editeur('body', { required: true }),
        date('date', { required: true }),
        texte('reference', 100), // ex: "Jean 3:16"
        nombre('order', { hidden: false }),
        texte('created_by_id', 64),
        { name: 'base44_created_date', type: 'date', required: false, hidden: false, system: false, min: '', max: '' },
        { name: 'base44_updated_date', type: 'date', required: false, hidden: false, system: false, min: '', max: '' },
        { name: 'base44_created_by', type: 'text', required: false, max: 255, hidden: false, system: false },
        autodate('created', true, false),
        autodate('updated', true, true),
      ],
      indexes: ['CREATE INDEX idx_verset_date ON Verset (date)'],
    },
    // ── PageTexte : pages du menu ☰ (Vision, But, Confession) ──────────────────
    {
      name: 'PageTexte',
      type: 'base',
      listRule: MEMBRES,
      viewRule: MEMBRES,
      createRule: ADMINS,
      updateRule: ADMINS,
      deleteRule: ADMINS,
      fields: [
        texte('cle', 50, { required: true, pattern: '^[a-z_-]+$' }), // vision, but, confession
        texte('title', 100, { required: true }),
        editeur('body', { required: true }),
        images('photos'),
        texte('created_by_id', 64),
        { name: 'base44_created_date', type: 'date', required: false, hidden: false, system: false, min: '', max: '' },
        { name: 'base44_updated_date', type: 'date', required: false, hidden: false, system: false, min: '', max: '' },
        { name: 'base44_created_by', type: 'text', required: false, max: 255, hidden: false, system: false },
        autodate('created', true, false),
        autodate('updated', true, true),
      ],
      indexes: ['CREATE UNIQUE INDEX idx_pagetexte_cle ON PageTexte (cle)'],
    },
    // ── Staff : personnel, fiche cliquable vers profil utilisateur ──────────────
    {
      name: 'Staff',
      type: 'base',
      listRule: MEMBRES,
      viewRule: MEMBRES,
      createRule: ADMINS,
      updateRule: ADMINS,
      deleteRule: ADMINS,
      fields: [
        texte('nom', 100, { required: true }),
        texte('prenom', 100, { required: true }),
        texte('role', 100, { required: true }),
        texte('photo_url', 5000),
        relation('user_id', '_pb_users_auth_'),
        nombre('order', { hidden: false }),
        texte('created_by_id', 64),
        { name: 'base44_created_date', type: 'date', required: false, hidden: false, system: false, min: '', max: '' },
        { name: 'base44_updated_date', type: 'date', required: false, hidden: false, system: false, min: '', max: '' },
        { name: 'base44_created_by', type: 'text', required: false, max: 255, hidden: false, system: false },
        autodate('created', true, false),
        autodate('updated', true, true),
      ],
      indexes: ['CREATE INDEX idx_staff_order ON Staff (order)'],
    },
  ];
}

async function migrer(url, headers, { appliquer = false, log = () => {} } = {}) {
  const changements = [];
  const note = (t) => { changements.push(t); log(`  - ${t}`); };

  for (const def of nouvellesCollections()) {
    const r = await fetch(`${url}/api/collections/${def.name}`, { headers });
    if (r.status !== 404 && !r.ok) throw new Error(`lecture de ${def.name} impossible (HTTP ${r.status})`);
    if (r.ok) {
      const col = await r.json();
      // Mise à jour des champs si nécessaire
      const plan = planChamps(col, def.fields);
      if (!plan) continue;
      for (const f of plan.manquants) note(`${def.name}.${f.name} : nouveau champ ${f.type}`);
      if (appliquer) {
        const p = await fetch(`${url}/api/collections/${col.id}`, {
          method: 'PATCH', headers, body: JSON.stringify({ fields: plan.fields })
        });
        if (!p.ok) throw new Error(`${def.name} : mise à jour refusée (HTTP ${p.status}) ${(await p.text()).slice(0, 300)}`);
      }
      continue;
    }
    // Nouvelle collection
    note(`${def.name} : nouvelle collection`);
    if (appliquer) {
      const c = await fetch(`${url}/api/collections`, { method: 'POST', headers, body: JSON.stringify(def) });
      if (!c.ok) throw new Error(`${def.name} : création refusée (HTTP ${c.status}) ${(await c.text()).slice(0, 300)}`);
    }
  }
  return changements;
}

function planChamps(col, champsCible) {
  const existants = new Map(col.fields.map((f) => [f.name, f]));
  const manquants = [];
  const champs = [...col.fields];
  let aChange = false;
  for (const fc of champsCible) {
    const ex = existants.get(fc.name);
    if (!ex) {
      manquants.push(fc);
      champs.push(fc);
      aChange = true;
    } else {
      // Vérifier si le type/required a changé (optionnel pour idempotence stricte)
      if (ex.type !== fc.type || ex.required !== fc.required || ex.hidden !== fc.hidden) {
        const idx = champs.findIndex((f) => f.name === fc.name);
        if (idx >= 0) { champs[idx] = fc; aChange = true; }
      }
    }
  }
  if (!aChange) return null;
  return { fields: champs, manquants };
}

async function main() {
  const i = process.argv.indexOf('--fragment');
  if (i > 0) {
    const sortie = process.argv[i + 1];
    if (!sortie) throw new Error('--fragment : chemin du fichier attendu');
    fs.writeFileSync(sortie, `${JSON.stringify(nouvellesCollections(), null, 2)}\n`);
    console.log(`Fragment écrit : ${sortie} (Paroles, Verset, PageTexte, Staff).`);
    return;
  }
  const URL_PB = (process.env.PB_URL || '').replace(/\/+$/, '');
  const { PB_EMAIL: email, PB_PASSWORD: password } = process.env;
  const appliquer = process.argv.includes('--appliquer');
  if (!URL_PB || !email || !password) throw new Error('PB_URL, PB_EMAIL et PB_PASSWORD sont requis (voir l\'en-tête du script).');
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