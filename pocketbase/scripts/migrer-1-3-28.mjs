#!/usr/bin/env node
// Migration 1.3.28 : suppression définitive de « Actualité chrétienne ».
//  - collection ChristianNews effacée (ses actualités, leurs images et leurs compteurs de vues) ;
//  - contenus publiés de type « christian_news » (collection Content) effacés.
// L'app (1.3.28) n'affiche plus cette rubrique ; un ancien lien ramène au Multimédia.
// Idempotente (relancée : « Déjà à jour »). Usage (tunnel SSH ouvert, identifiants SUPERUSER saisis masqués) :
//   node pocketbase/scripts/migrer-1-3-28.mjs              -> simulation (affiche ce qui serait effacé)
//   node pocketbase/scripts/migrer-1-3-28.mjs --appliquer  -> efface (irréversible)

import { pathToFileURL } from 'node:url';

const lire = (url, headers, init = {}) => fetch(url, { headers, signal: AbortSignal.timeout(60000), ...init });

async function compter(url, headers, collection, filtre = '') {
  const q = new URLSearchParams({ page: '1', perPage: '1', ...(filtre ? { filter: filtre } : {}) });
  const r = await lire(`${url}/api/collections/${collection}/records?${q}`, headers);
  if (!r.ok) throw new Error(`lecture de ${collection} impossible (HTTP ${r.status})`);
  return Number((await r.json()).totalItems || 0);
}

export async function migrer(url, headers, { appliquer = false, log = () => {} } = {}) {
  const changements = [];

  // 1. Contenus publiés « christian_news »
  const rc = await lire(`${url}/api/collections/Content`, headers);
  if (rc.ok) {
    const filtre = "type = 'christian_news'";
    const n = await compter(url, headers, 'Content', filtre);
    if (!n) log('  = Contenus publiés « Actualité chrétienne » : aucun');
    else {
      changements.push(`${n} contenu(s) publié(s)`);
      log(`  - Contenus publiés « Actualité chrétienne » : ${n} à effacer`);
      if (appliquer) {
        for (;;) {
          const q = new URLSearchParams({ page: '1', perPage: '200', filter: filtre, fields: 'id' });
          const r = await lire(`${url}/api/collections/Content/records?${q}`, headers);
          if (!r.ok) throw new Error(`lecture de Content impossible (HTTP ${r.status})`);
          const items = (await r.json()).items || [];
          if (!items.length) break;
          for (const it of items) {
            const d = await lire(`${url}/api/collections/Content/records/${it.id}`, headers, { method: 'DELETE' });
            if (!d.ok && d.status !== 404) throw new Error(`effacement d'un contenu refusé (HTTP ${d.status})`);
          }
        }
      }
    }
  }

  // 2. Collection ChristianNews
  const r = await lire(`${url}/api/collections/ChristianNews`, headers);
  if (r.status === 404) log('  = Collection ChristianNews : déjà supprimée');
  else if (!r.ok) throw new Error(`collection ChristianNews illisible (HTTP ${r.status})`);
  else {
    const n = await compter(url, headers, 'ChristianNews');
    changements.push('collection ChristianNews');
    log(`  - Collection ChristianNews : supprimée avec ses ${n} actualité(s) et leurs images`);
    if (appliquer) {
      const d = await lire(`${url}/api/collections/ChristianNews`, headers, { method: 'DELETE' });
      if (!d.ok) throw new Error(`suppression de ChristianNews refusée (HTTP ${d.status}) ${(await d.text()).slice(0, 300)}`);
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
  else console.log(appliquer ? `Appliqué (${changements.length} changement(s)).` : 'Simulation : relancer avec --appliquer pour effacer (irréversible).');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`Erreur : ${e.message}`); process.exitCode = 1; });
}
