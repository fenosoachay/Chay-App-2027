#!/usr/bin/env node
// Migration de schéma 1.3.6 : playlists dans toutes les sections, avec sous-playlists (un seul niveau).
// Collection Playlist SEULEMENT :
//  - champ `parent_id` (texte, 64 caractères max) : vide = playlist de section, sinon id de la playlist parente ;
//  - catégories ajoutées au select `category` : youtube, articles, gallery (music, sermons, films, other gardées).
// Rien d'autre ne change : PlaylistTrack relie déjà n'importe quel contenu (track_id) à une (sous-)playlist ;
// les règles d'accès restent celles de Playlist (lecture membres connectés, écriture admins).
//
// Usage (tunnel SSH ouvert, voir docs/DEPLOIEMENT.md § 3b pour la saisie masquée des identifiants) :
//   $env:PB_URL = "http://127.0.0.1:8092"   (production via le tunnel) ou http://127.0.0.1:8090 (bac à sable)
//   node pocketbase/scripts/migrer-playlists.mjs              -> simulation : affiche ce qui changerait
//   node pocketbase/scripts/migrer-playlists.mjs --appliquer  -> applique (idempotent)
// Aucune donnée n'est lue ni modifiée ; seuls le nom et le type des champs sont affichés.

import { pathToFileURL } from 'node:url';

export const CATEGORIES = ['music', 'sermons', 'films', 'other', 'youtube', 'articles', 'gallery'];

/** Champs de Playlist après migration (null si déjà à jour). Ne modifie pas `fields`. */
export function champsMigres(fields) {
  if (!Array.isArray(fields)) throw new Error('collection Playlist illisible (champs absents)');
  const out = fields.map((f) => ({ ...f }));
  const changements = [];
  const categorie = out.find((f) => f.name === 'category');
  if (!categorie || categorie.type !== 'select') throw new Error('champ Playlist.category (select) introuvable : arrêt');
  const manquantes = CATEGORIES.filter((v) => !(categorie.values || []).includes(v));
  if (manquantes.length) {
    categorie.values = [...(categorie.values || []), ...manquantes];
    changements.push(`category : valeurs ajoutées ${manquantes.join(', ')}`);
  }
  const parent = out.find((f) => f.name === 'parent_id');
  if (parent && parent.type !== 'text') throw new Error('Playlist.parent_id existe avec un autre type : arrêt');
  if (!parent) {
    out.push({ name: 'parent_id', type: 'text', required: false, presentable: false, hidden: false, system: false, min: 0, max: 64, pattern: '' });
    changements.push('parent_id : nouveau champ texte (64)');
  }
  return changements.length ? { fields: out, changements } : null;
}

async function main() {
  const URL_PB = (process.env.PB_URL || '').replace(/\/+$/, '');
  const { PB_EMAIL: email, PB_PASSWORD: password } = process.env;
  const appliquer = process.argv.includes('--appliquer');
  if (!URL_PB || !email || !password) throw new Error('PB_URL, PB_EMAIL et PB_PASSWORD sont requis (voir l’en-tête du script).');
  const auth = await fetch(`${URL_PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: email, password }),
  });
  if (!auth.ok) throw new Error(`connexion superuser refusée (HTTP ${auth.status})`);
  const { token } = await auth.json();
  const h = { Authorization: token, 'Content-Type': 'application/json' };
  const res = await fetch(`${URL_PB}/api/collections/Playlist`, { headers: h });
  if (!res.ok) throw new Error(`lecture de la collection Playlist impossible (HTTP ${res.status})`);
  const col = await res.json();
  const plan = champsMigres(col.fields);
  console.log(`Serveur : ${URL_PB} — collection Playlist (${col.id})`);
  if (!plan) {
    console.log('Déjà à jour : rien à faire.');
    return;
  }
  for (const c of plan.changements) console.log(`  - ${c}`);
  if (!appliquer) {
    console.log('Simulation : relancer avec --appliquer pour écrire.');
    return;
  }
  const maj = await fetch(`${URL_PB}/api/collections/${col.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ fields: plan.fields }) });
  if (!maj.ok) throw new Error(`mise à jour refusée (HTTP ${maj.status}) : ${(await maj.text()).slice(0, 300)}`);
  const verif = champsMigres((await maj.json()).fields);
  console.log(verif ? 'ÉCHEC : le schéma n’est pas à jour après écriture.' : 'Appliqué : Playlist est à jour.');
  if (verif) process.exitCode = 1;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('migrer-playlists.mjs')) {
  main().catch((e) => { console.error(`Erreur : ${e.message}`); process.exitCode = 1; });
}
