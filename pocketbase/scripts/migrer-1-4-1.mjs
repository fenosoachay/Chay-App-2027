#!/usr/bin/env node
// Migration 1.4.1 (idempotente) : nouvelle collection CoupDeCoeur (accueil › « Coup de cœur de ce mois »).
//  - un chant mis en avant sous le verset du jour : titre, artiste, audio, pochette, petit mot ;
//  - lié ou non à une musique de Multimédia › Musique (track_id : ses écoutes comptent pour le classement) ;
//  - « C'est pour » (Tout le monde / Membre / VIP) : même règle de lecture que les autres contenus ;
//  - affiché / retiré à la main (actif), pendant duree_jours à partir de debut (0 = toujours).
// Lecture : membres connectés selon leur niveau ; écriture : admins.
// Usage (tunnel SSH ouvert, SUPERUSER, MFA désactivée le temps de la migration) :
//   node pocketbase/scripts/migrer-1-4-1.mjs              -> simulation
//   node pocketbase/scripts/migrer-1-4-1.mjs --appliquer  -> applique
import { pathToFileURL } from 'node:url';

const ADMINS = '@request.auth.role = "admin"';
export const REGLE_AUDIENCE = '(audience = "" || audience = "tous" || @request.auth.role = "admin" || @request.auth.niveau = "vip" || (audience = "membre" && @request.auth.niveau = "membre"))';
export const REGLE_LECTURE = `@request.auth.id != "" && ${REGLE_AUDIENCE}`;

const texte = (name, max, extra = {}) => ({
  name, type: 'text', required: false, presentable: false, hidden: false, system: false, min: 0, max, pattern: '', ...extra,
});
const nombre = (name) => ({ name, type: 'number', required: false, hidden: false, system: false });
const bool = (name) => ({ name, type: 'bool', required: false, hidden: false, system: false });
const date = (name) => ({ name, type: 'date', required: false, hidden: false, system: false, min: '', max: '' });
const choix = (name, values) => ({ name, type: 'select', values, maxSelect: 1, required: false, hidden: false, system: false });
const autodate = (name, onCreate, onUpdate) => ({ name, type: 'autodate', onCreate, onUpdate, hidden: false, system: false });

export function collectionCoupDeCoeur() {
  return {
    name: 'CoupDeCoeur',
    type: 'base',
    listRule: REGLE_LECTURE,
    viewRule: REGLE_LECTURE,
    createRule: ADMINS,
    updateRule: ADMINS,
    deleteRule: ADMINS,
    fields: [
      texte('title', 200, { required: true }),
      texte('artist', 200),
      texte('audio_url', 5000, { required: true }),
      texte('cover_url', 5000),
      texte('mot', 300),
      texte('track_id', 64),
      choix('audience', ['tous', 'membre', 'vip']),
      bool('actif'),
      nombre('duree_jours'),
      date('debut'),
      texte('created_by_id', 64),
      date('base44_created_date'),
      date('base44_updated_date'),
      texte('base44_created_by', 255),
      autodate('created', true, false),
      autodate('updated', true, true),
    ],
    indexes: ['CREATE INDEX idx_coupdecoeur_debut ON CoupDeCoeur (actif, debut)'],
  };
}

export async function migrer(url, headers, { appliquer = false, log = () => {} } = {}) {
  const def = collectionCoupDeCoeur();
  const r = await fetch(`${url}/api/collections/${def.name}`, { headers });
  if (r.ok) { log(`  = ${def.name} existe déjà`); return []; }
  if (r.status !== 404) throw new Error(`lecture de ${def.name} impossible (HTTP ${r.status})`);
  log(`  - ${def.name} : nouvelle collection (accueil › Coup de cœur de ce mois)`);
  if (appliquer) {
    const c = await fetch(`${url}/api/collections`, { method: 'POST', headers, body: JSON.stringify(def) });
    if (!c.ok) throw new Error(`${def.name} : création refusée (HTTP ${c.status}) ${(await c.text()).slice(0, 300)}`);
  }
  return [def.name];
}

async function main() {
  const URL_PB = (process.env.PB_URL || '').replace(/\/+$/, '');
  const { PB_EMAIL: email, PB_PASSWORD: password } = process.env;
  const appliquer = process.argv.includes('--appliquer');
  if (!URL_PB || !email || !password) throw new Error('PB_URL, PB_EMAIL et PB_PASSWORD (superuser) sont requis.');
  const auth = await fetch(`${URL_PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: email, password }),
  });
  if (!auth.ok) {
    const corps = await auth.json().catch(() => ({}));
    if (corps && corps.mfaId) throw new Error('la MFA du superuser est activée : désactivez-la le temps de la migration, puis réactivez-la.');
    throw new Error(`connexion superuser refusée (HTTP ${auth.status}) : e-mail ou mot de passe du SUPERUSER incorrect.`);
  }
  const h = { Authorization: (await auth.json()).token, 'Content-Type': 'application/json' };
  console.log(`Serveur : ${URL_PB}`);
  const changements = await migrer(URL_PB, h, { appliquer, log: console.log });
  if (!changements.length) console.log('Déjà à jour : rien à faire.');
  else console.log(appliquer ? 'MIGRATION_1_4_1_APPLIQUEE' : 'Simulation : relancer avec --appliquer pour écrire.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`Erreur : ${e.message}`); process.exitCode = 1; });
}
