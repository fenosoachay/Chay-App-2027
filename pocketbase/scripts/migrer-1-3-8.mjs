#!/usr/bin/env node
// Migration de schéma de la 1.3.8, idempotente : Bible › « Sagesse en audio », Psaumes remplacés par Ecclésiaste.
//  - BibleAudio.book : valeurs « proverbes » et « ecclesiaste » (au lieu de « proverbes » et « psaumes ») ;
//  - BibleAudio.chapter : maximum 31 (au lieu de 150 ; Proverbes 31, Ecclésiaste 12 : limite par livre dans le
//    hook pb_hooks/bible_audio.pb.js).
// Les identifiants de champs sont conservés (aucune donnée perdue). Garde-fou : la migration REFUSE de s'appliquer
// tant qu'il reste des fiches Psaumes (les supprimer d'abord : pocketbase/scripts/nettoyer-psaumes.mjs).
//
// Usage (tunnel SSH ouvert ; identifiants superuser saisis masqués, voir docs/1.3.8.md) :
//   node pocketbase/scripts/migrer-1-3-8.mjs                   -> simulation (rien n'est écrit)
//   node pocketbase/scripts/migrer-1-3-8.mjs --appliquer       -> applique
//   node pocketbase/scripts/migrer-1-3-8.mjs --fragment f.json -> fragment collections.json (sans réseau)
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { nouvellesCollections as collections137 } from './migrer-1-3-7.mjs';

export const LIVRES = ['proverbes', 'ecclesiaste'];
export const CHAPITRE_MAX = 31;

/** Définition complète de BibleAudio en 1.3.8 (fragment collections.json, installation neuve). */
export function definitionBibleAudio() {
  const def = JSON.parse(JSON.stringify(collections137()[0]));
  for (const f of def.fields) {
    if (f.name === 'book') f.values = [...LIVRES];
    if (f.name === 'chapter') f.max = CHAPITRE_MAX;
  }
  return def;
}

/**
 * Changements à apporter à la collection existante `col` : { fields, changements } ou null si déjà à jour.
 * Ne modifie pas `col` ; garde les identifiants et les autres réglages des champs.
 */
export function planBibleAudio(col) {
  if (!col || !Array.isArray(col.fields)) throw new Error('collection BibleAudio illisible');
  const fields = col.fields.map((f) => ({ ...f }));
  const changements = [];
  const book = fields.find((f) => f.name === 'book');
  const chapter = fields.find((f) => f.name === 'chapter');
  if (!book || book.type !== 'select') throw new Error('BibleAudio.book absent ou d’un autre type : arrêt');
  if (!chapter || chapter.type !== 'number') throw new Error('BibleAudio.chapter absent ou d’un autre type : arrêt');
  if (JSON.stringify(book.values) !== JSON.stringify(LIVRES)) {
    changements.push(`BibleAudio.book : valeurs ${JSON.stringify(book.values)} -> ${JSON.stringify(LIVRES)}`);
    book.values = [...LIVRES];
  }
  if (chapter.max !== CHAPITRE_MAX) {
    changements.push(`BibleAudio.chapter : maximum ${chapter.max} -> ${CHAPITRE_MAX}`);
    chapter.max = CHAPITRE_MAX;
  }
  return changements.length ? { fields, changements } : null;
}

/** Applique (ou simule) ; renvoie la liste des changements. Lève une erreur s'il reste des fiches Psaumes. */
export async function migrer(url, h, { appliquer = false, log = () => {} } = {}) {
  const r = await fetch(`${url}/api/collections/BibleAudio`, { headers: h });
  if (r.status === 404) throw new Error('collection BibleAudio absente : appliquer d’abord migrer-1-3-7.mjs');
  if (!r.ok) throw new Error(`lecture de BibleAudio impossible (HTTP ${r.status})`);
  const col = await r.json();
  const plan = planBibleAudio(col);
  if (!plan) return [];
  for (const c of plan.changements) log(`  - ${c}`);
  const restes = await fetch(`${url}/api/collections/BibleAudio/records?perPage=1&filter=${encodeURIComponent("book = 'psaumes'")}`, { headers: h });
  if (!restes.ok) throw new Error(`comptage des fiches Psaumes impossible (HTTP ${restes.status})`);
  const n = (await restes.json()).totalItems || 0;
  if (n > 0) {
    throw new Error(`${n} fiche(s) Psaumes encore présente(s) : les supprimer d’abord (pocketbase/scripts/nettoyer-psaumes.mjs), puis relancer.`);
  }
  if (appliquer) {
    const p = await fetch(`${url}/api/collections/${col.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ fields: plan.fields }) });
    if (!p.ok) throw new Error(`BibleAudio : mise à jour refusée (HTTP ${p.status}) ${(await p.text()).slice(0, 300)}`);
  }
  return plan.changements;
}

async function main() {
  const i = process.argv.indexOf('--fragment');
  if (i > 0) {
    const sortie = process.argv[i + 1];
    if (!sortie) throw new Error('--fragment : chemin du fichier attendu');
    fs.writeFileSync(sortie, `${JSON.stringify([definitionBibleAudio()], null, 2)}\n`);
    console.log(`Fragment écrit : ${sortie} (BibleAudio, 1.3.8).`);
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
