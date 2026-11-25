#!/usr/bin/env node
// Migration 1.3.34 (idempotente) :
//  1. Texte qui défile : 12 animations (champ `direction` : 6 horizontales, 2 verticales, mot par mot, machine
//     à écrire, respiration, varié). Ajoute les valeurs manquantes ; rien n'est effacé (« monte » et « gauche »
//     gardent leur sens) ;
//  2. ImageDefilante : groupes de photos d'un même format qui défilent sur l'image du lecteur audio
//     (Admin › Multimédia › Lecteur audio › Image qui défile). Lecture : tout le monde ; écriture : admins.
// Usage (tunnel SSH ouvert, SUPERUSER) :
//   node pocketbase/scripts/migrer-1-3-34.mjs              -> simulation
//   node pocketbase/scripts/migrer-1-3-34.mjs --appliquer  -> applique
import { pathToFileURL } from 'node:url';

export const ANIMATIONS = ['haut_droite', 'haut_gauche', 'bas_droite', 'gauche', 'deux_hg_bd', 'deux_hd_bg', 'descend', 'monte', 'mots', 'machine', 'respire', 'varie'];

/** Valeurs du champ après migration (triées) : anciennes + nouvelles. */
export const valeursDirection = (avant) => [...new Set([...(avant || []), ...ANIMATIONS])].sort();

const ADMINS = '@request.auth.role = "admin"';
const texte = (name, max, extra = {}) => ({ name, type: 'text', required: false, presentable: false, hidden: false, system: false, min: 0, max, pattern: '', ...extra });
const nombre = (name) => ({ name, type: 'number', required: false, presentable: false, hidden: false, system: false, onlyInt: false });
const json = (name, maxSize = 200000) => ({ name, type: 'json', required: false, presentable: false, hidden: false, system: false, maxSize });
const choix = (name, values, extra = {}) => ({ name, type: 'select', values, maxSelect: 1, required: false, presentable: false, hidden: false, system: false, ...extra });
const autodate = (name, onCreate, onUpdate) => ({ name, type: 'autodate', onCreate, onUpdate, hidden: false, system: false });

export const COLLECTION_IMAGES = {
  name: 'ImageDefilante', type: 'base',
  listRule: '', viewRule: '', createRule: ADMINS, updateRule: ADMINS, deleteRule: ADMINS,
  fields: [
    texte('titre', 120, { required: true }), choix('format', ['carre', 'paysage', 'portrait', 'vertical'], { required: true }),
    json('images'), choix('animation', ['horizontal', 'fondu', 'vertical'], { required: true }),
    choix('ou', ['partout', 'musique', 'predication', 'bible'], { required: true }),
    texte('playlist_id', 40), texte('track_id', 40), texte('debut', 10), texte('fin', 10),
    choix('vitesse', ['lent', 'normal', 'rapide']), nombre('order'),
    autodate('created', true, false), autodate('updated', true, true),
  ],
  indexes: [],
};

const lire = (url, headers, init = {}) => fetch(url, { headers, signal: AbortSignal.timeout(60000), ...init });

export async function migrer(url, headers, { appliquer = false, log = () => {} } = {}) {
  const r = await lire(`${url}/api/collections/TexteDefilant`, headers);
  if (!r.ok) throw new Error(`lecture de TexteDefilant impossible (HTTP ${r.status})`);
  const col = await r.json();
  const champ = (col.fields || []).find((f) => f.name === 'direction');
  if (!champ) throw new Error('champ « direction » introuvable dans TexteDefilant');
  const avant = Array.isArray(champ.values) ? champ.values : [];
  const apres = valeursDirection(avant);
  const ajout = apres.filter((v) => !avant.includes(v));
  const changements = [];
  if (!ajout.length) log('  = TexteDefilant.direction : déjà à jour');
  else {
    changements.push(...ajout);
    log(`  - TexteDefilant.direction : + ${ajout.join(', ')}`);
    if (appliquer) {
      const fields = col.fields.map((f) => (f.name === 'direction' ? { ...f, values: apres } : f));
      const p = await lire(`${url}/api/collections/TexteDefilant`, headers, { method: 'PATCH', body: JSON.stringify({ fields }) });
      if (!p.ok) throw new Error(`mise à jour refusée (HTTP ${p.status}) ${(await p.text()).slice(0, 300)}`);
    }
  }
  const i = await lire(`${url}/api/collections/ImageDefilante`, headers);
  if (i.ok) log('  = ImageDefilante existe déjà');
  else if (i.status !== 404) throw new Error(`lecture de ImageDefilante impossible (HTTP ${i.status})`);
  else {
    changements.push('ImageDefilante');
    log('  - ImageDefilante : nouvelle collection (image qui défile du lecteur audio)');
    if (appliquer) {
      const p = await lire(`${url}/api/collections`, headers, { method: 'POST', body: JSON.stringify(COLLECTION_IMAGES) });
      if (!p.ok) throw new Error(`création de ImageDefilante refusée (HTTP ${p.status}) ${(await p.text()).slice(0, 300)}`);
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
  const changements = await migrer(URL_PB, h, { appliquer, log: console.log });
  if (!changements.length) console.log('Déjà à jour : rien à faire.');
  else console.log(appliquer ? `Appliqué (${changements.length} changement(s)).` : 'Simulation : relancer avec --appliquer pour écrire.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`Erreur : ${e.message}`); process.exitCode = 1; });
}
