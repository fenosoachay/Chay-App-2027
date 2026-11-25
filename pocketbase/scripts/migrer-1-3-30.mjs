#!/usr/bin/env node
// Migration 1.3.30 : Chay Enfants repart à zéro.
//  - tous les scores des enfants (ScoreJeu, espace « enfant ») effacés : le Score Board des enfants est vide ;
//  - tous les enfants enregistrés (ProfilEnfant, avec leurs records) effacés : chaque famille les ajoute à
//    nouveau dans « Qui joue ? ».
// Les scores des adultes ne sont pas touchés. Idempotente. Usage (tunnel SSH ouvert, identifiants SUPERUSER) :
//   node pocketbase/scripts/migrer-1-3-30.mjs              -> simulation (affiche ce qui serait effacé)
//   node pocketbase/scripts/migrer-1-3-30.mjs --appliquer  -> efface (irréversible)

import { pathToFileURL } from 'node:url';

const lire = (url, headers, init = {}) => fetch(url, { headers, signal: AbortSignal.timeout(60000), ...init });

async function lister(url, headers, collection, filtre, perPage = 200) {
  const q = new URLSearchParams({ page: '1', perPage: String(perPage), fields: 'id', ...(filtre ? { filter: filtre } : {}) });
  const r = await lire(`${url}/api/collections/${collection}/records?${q}`, headers);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`lecture de ${collection} impossible (HTTP ${r.status})`);
  const j = await r.json();
  return { total: Number(j.totalItems || 0), items: j.items || [] };
}

async function effacerTout(url, headers, collection, filtre) {
  let n = 0;
  for (;;) {
    const l = await lister(url, headers, collection, filtre);
    if (!l || !l.items.length) return n;
    for (const it of l.items) {
      const d = await lire(`${url}/api/collections/${collection}/records/${it.id}`, headers, { method: 'DELETE' });
      if (!d.ok && d.status !== 404) throw new Error(`effacement dans ${collection} refusé (HTTP ${d.status})`);
      n += 1;
    }
  }
}

const CIBLES = [
  { collection: 'ScoreJeu', filtre: "espace = 'enfant'", nom: 'score(s) des enfants' },
  { collection: 'ProfilEnfant', filtre: '', nom: 'enfant(s) enregistré(s)' },
];

export async function migrer(url, headers, { appliquer = false, log = () => {} } = {}) {
  const changements = [];
  for (const c of CIBLES) {
    const l = await lister(url, headers, c.collection, c.filtre, 1);
    if (!l) { log(`  = ${c.collection} : collection absente`); continue; }
    if (!l.total) { log(`  = ${c.collection} : aucun ${c.nom.replaceAll('(s)', '')}`); continue; }
    changements.push(`${l.total} ${c.nom}`);
    log(`  - ${c.collection} : ${l.total} ${c.nom} à effacer`);
    if (appliquer) log(`    effacé(s) : ${await effacerTout(url, headers, c.collection, c.filtre)}`);
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
  else console.log(appliquer ? `Appliqué (${changements.length} changement(s)).` : 'Simulation : relancer avec --appliquer pour effacer (irréversible).');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`Erreur : ${e.message}`); process.exitCode = 1; });
}
