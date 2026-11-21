#!/usr/bin/env node
// Migration 1.3.23 — affichage de lecture des playlists de la section Vidéo :
//  - Playlist.affichage : « film » (16:9) ou « vertical » (9:16, façon TikTok), choisi par l'admin à la création ;
//  - les playlists Vidéo (category « films ») nommées « Drôle » ou « Mindset » passent en « vertical »
//    (seulement si elles n'ont pas encore de réglage).
// Idempotente. Usage (tunnel SSH ouvert, identifiants SUPERUSER saisis masqués) :
//   node pocketbase/scripts/migrer-1-3-23.mjs              -> simulation
//   node pocketbase/scripts/migrer-1-3-23.mjs --appliquer  -> applique

import { pathToFileURL } from 'node:url';

export const CHAMP = { name: 'affichage', type: 'select', values: ['film', 'vertical'], maxSelect: 1, required: false, hidden: false, system: false };
const NOMS_VERTICAUX = ['drole', 'mindset'];
export const simplifier = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

export async function migrer(url, headers, { appliquer = false, log = () => {} } = {}) {
  const changements = [];
  const col = await (await fetch(`${url}/api/collections/Playlist`, { headers })).json();
  const existe = (col.fields || []).some((f) => f.name === 'affichage');
  if (existe) log('  = Playlist : champ affichage déjà présent');
  else {
    changements.push('Playlist (champ)');
    log('  - Playlist : ajout de affichage (Film 16:9 / TikTok 9:16)');
    if (appliquer) {
      const p = await fetch(`${url}/api/collections/Playlist`, { method: 'PATCH', headers, body: JSON.stringify({ fields: [...col.fields, CHAMP] }) });
      if (!p.ok) throw new Error(`Playlist : modification refusée (HTTP ${p.status}) ${(await p.text()).slice(0, 300)}`);
    }
  }

  const q = new URLSearchParams({ filter: 'category = "films"', perPage: '500' });
  const r = await fetch(`${url}/api/collections/Playlist/records?${q}`, { headers });
  if (!r.ok) throw new Error(`lecture des playlists refusée (HTTP ${r.status})`);
  for (const p of (await r.json()).items || []) {
    if (!NOMS_VERTICAUX.includes(simplifier(p.name))) continue;
    if (existe && p.affichage) { log(`  = « ${p.name} » : déjà réglée (${p.affichage})`); continue; }
    changements.push(p.name);
    log(`  - « ${p.name} » : lecture verticale (9:16)`);
    if (appliquer) {
      const u = await fetch(`${url}/api/collections/Playlist/records/${p.id}`, { method: 'PATCH', headers, body: JSON.stringify({ affichage: 'vertical' }) });
      if (!u.ok) throw new Error(`« ${p.name} » : refusé (HTTP ${u.status})`);
    }
  }
  return changements;
}

async function main() {
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
