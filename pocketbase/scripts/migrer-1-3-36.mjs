#!/usr/bin/env node
// Migration 1.3.36 (idempotente) : Message.reactions (réactions ❤️ 😆 😮 😢 😠 👍, une par personne).
// Usage (tunnel SSH ouvert, SUPERUSER) :
//   node pocketbase/scripts/migrer-1-3-36.mjs              -> simulation
//   node pocketbase/scripts/migrer-1-3-36.mjs --appliquer  -> applique
import { pathToFileURL } from 'node:url';

export const CHAMP = { name: 'reactions', type: 'json', required: false, presentable: false, hidden: false, system: false, maxSize: 20000 };

const lire = (url, headers, init = {}) => fetch(url, { headers, signal: AbortSignal.timeout(60000), ...init });

export async function migrer(url, headers, { appliquer = false, log = () => {} } = {}) {
  const r = await lire(`${url}/api/collections/Message`, headers);
  if (!r.ok) throw new Error(`lecture de Message impossible (HTTP ${r.status})`);
  const col = await r.json();
  if ((col.fields || []).some((f) => f.name === CHAMP.name)) { log('  = Message.reactions : existe déjà'); return []; }
  log('  - Message.reactions : nouveau champ');
  if (appliquer) {
    const p = await lire(`${url}/api/collections/Message`, headers, { method: 'PATCH', body: JSON.stringify({ fields: [...col.fields, CHAMP] }) });
    if (!p.ok) throw new Error(`ajout refusé (HTTP ${p.status}) ${(await p.text()).slice(0, 300)}`);
  }
  return ['Message.reactions'];
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
