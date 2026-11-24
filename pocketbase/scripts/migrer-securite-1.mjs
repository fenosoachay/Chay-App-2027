#!/usr/bin/env node
// Sécurité (audit du 24/11/2026) :
//  1. Inscription (users.createRule) : les champs niveau, systeme et responsable_technique étaient interdits
//     SAUF si l'inscription envoyait role = "user" (les migrations 1.3.21 et 1.3.22 avaient ajouté ces champs dans
//     le groupe « role absent », relié par OU à « role = user »). Une inscription fabriquée à la main pouvait donc se
//     donner le niveau VIP, le statut de compte système « Chay » ou celui de responsable technique.
//     Correction : ces trois champs sont interdits dans tous les cas ; role reste absent ou égal à « user ».
//  2. PetiteHistoire : lisible seulement par les membres connectés (avant : aussi sans compte).
//  3. Rapport : comptes déjà marqués système, responsables techniques ou VIP (à vérifier à la main).
// Idempotente. Usage (tunnel SSH ouvert, identifiants SUPERUSER saisis masqués) :
//   node pocketbase/scripts/migrer-securite-1.mjs              -> simulation + rapport
//   node pocketbase/scripts/migrer-securite-1.mjs --appliquer  -> applique
import { pathToFileURL } from 'node:url';

const ADMINS = '@request.auth.role = "admin"';
const INTERDITS = ['niveau', 'systeme', 'responsable_technique'];
const ANCIEN_GROUPE = `(@request.body.role:isset = false && ${INTERDITS.map((c) => `@request.body.${c}:isset = false`).join(' && ')} || @request.body.role = "user")`;
const NOUVEAU_GROUPE = `(@request.body.role:isset = false || @request.body.role = "user") && ${INTERDITS.map((c) => `@request.body.${c}:isset = false`).join(' && ')}`;
export const REGLE_HISTOIRE = `@request.auth.id != "" && (actif = true || ${ADMINS})`;

// Renvoie la règle corrigée, ou null si elle l'est déjà ; erreur si sa forme est inconnue (on ne devine pas).
export function corrigerCreationUsers(regle) {
  const r = String(regle ?? '');
  if (r.includes(NOUVEAU_GROUPE) && !r.includes(ANCIEN_GROUPE)) return null;
  if (!r.includes(ANCIEN_GROUPE)) throw new Error('users.createRule : forme inattendue, rien n\'est changé (voir à la main).');
  return r.replace(ANCIEN_GROUPE, NOUVEAU_GROUPE);
}

export async function migrer(url, headers, { appliquer = false, log = () => {} } = {}) {
  const changements = [];
  const lire = async (chemin) => {
    const r = await fetch(`${url}${chemin}`, { headers });
    if (!r.ok) throw new Error(`lecture ${chemin} impossible (HTTP ${r.status})`);
    return r.json();
  };
  const ecrire = async (chemin, corps, quoi) => {
    const r = await fetch(`${url}${chemin}`, { method: 'PATCH', headers, body: JSON.stringify(corps) });
    if (!r.ok) throw new Error(`${quoi} : refusé (HTTP ${r.status}) ${(await r.text()).slice(0, 300)}`);
  };

  const users = await lire('/api/collections/users');
  const regle = corrigerCreationUsers(users.createRule);
  if (regle === null) log('  = users : règle d\'inscription déjà corrigée');
  else {
    changements.push('users (inscription)');
    log('  - users : inscription, niveau / systeme / responsable_technique interdits dans tous les cas');
    if (appliquer) await ecrire('/api/collections/users', { createRule: regle }, 'users');
  }

  const ph = await lire('/api/collections/PetiteHistoire');
  if (ph.listRule === REGLE_HISTOIRE && ph.viewRule === REGLE_HISTOIRE) log('  = PetiteHistoire : déjà réservée aux membres');
  else {
    changements.push('PetiteHistoire (membres connectés)');
    log('  - PetiteHistoire : lecture réservée aux membres connectés');
    if (appliquer) await ecrire('/api/collections/PetiteHistoire', { listRule: REGLE_HISTOIRE, viewRule: REGLE_HISTOIRE }, 'PetiteHistoire');
  }

  // Rapport (lecture seule) : comptes avec un statut particulier.
  const filtre = encodeURIComponent('systeme = true || responsable_technique = true || niveau = "vip" || role = "admin"');
  const { items = [] } = await lire(`/api/collections/users/records?perPage=200&filter=${filtre}&fields=id,first_name,last_name,role,niveau,systeme,responsable_technique,created`);
  log(`\nComptes à statut particulier (${items.length}) : vérifiez que chacun est normal.`);
  for (const u of items) {
    const statuts = [u.role === 'admin' && 'admin', u.niveau === 'vip' && 'VIP', u.systeme && 'SYSTÈME', u.responsable_technique && 'resp. technique'].filter(Boolean).join(', ');
    log(`  ${`${u.first_name || ''} ${u.last_name || ''}`.trim() || '(sans nom)'} [${u.id}] : ${statuts} (créé ${String(u.created || '').slice(0, 10)})`);
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
  if (!changements.length) console.log('\nDéjà à jour : rien à faire.');
  else console.log(appliquer ? `\nAppliqué (${changements.length} changement(s)).` : '\nSimulation : relancer avec --appliquer pour écrire.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`Erreur : ${e.message}`); process.exitCode = 1; });
}
