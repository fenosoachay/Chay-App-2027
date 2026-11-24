#!/usr/bin/env node
// Audit des règles d'accès PocketBase (lecture seule) : pour chaque collection, qui peut lister, voir, créer,
// modifier, supprimer ; champs cachés ; réglages des comptes (collections « auth »). Ne lit AUCUN enregistrement
// ni aucun réglage du serveur (pas de /api/settings). Résultat : regles-pocketbase.json à côté du dossier courant.
// Usage (tunnel SSH ouvert, identifiants SUPERUSER saisis masqués) : node pocketbase/scripts/audit-regles.mjs
import fs from 'node:fs';

const URL_PB = (process.env.PB_URL || '').replace(/\/+$/, '');
const { PB_EMAIL: email, PB_PASSWORD: password } = process.env;
if (!URL_PB || !email || !password) throw new Error('PB_URL, PB_EMAIL et PB_PASSWORD (superuser) sont requis.');

const auth = await fetch(`${URL_PB}/api/collections/_superusers/auth-with-password`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: email, password }),
});
if (!auth.ok) throw new Error(`connexion superuser refusée (HTTP ${auth.status})`);
const h = { Authorization: (await auth.json()).token };
const r = await fetch(`${URL_PB}/api/collections?perPage=500`, { headers: h });
if (!r.ok) throw new Error(`liste des collections impossible (HTTP ${r.status})`);
const { items } = await r.json();

const regle = (v) => (v === null ? 'ADMIN' : v === '' ? 'TOUT LE MONDE' : v);
const sortie = items.filter((c) => !c.system || c.name === 'users').map((c) => ({
  nom: c.name,
  type: c.type,
  lister: regle(c.listRule),
  voir: regle(c.viewRule),
  creer: regle(c.createRule),
  modifier: regle(c.updateRule),
  supprimer: regle(c.deleteRule),
  ...(c.type === 'auth' ? {
    gerer: regle(c.manageRule),
    authRule: regle(c.authRule),
    motDePasse: c.passwordAuth?.enabled, identite: c.passwordAuth?.identityFields,
    oauth2: c.oauth2?.enabled, otp: c.otp?.enabled, mfa: c.mfa?.enabled,
  } : {}),
  champs: (c.fields || []).filter((f) => !f.system || f.name === 'email').map((f) => `${f.name}:${f.type}${f.hidden ? ':CACHÉ' : ''}${f.type === 'file' ? `:${f.protected ? 'protégé' : 'public'}:max${f.maxSize || 0}` : ''}`),
}));
fs.writeFileSync('regles-pocketbase.json', JSON.stringify(sortie, null, 2));
const publics = sortie.filter((c) => [c.creer, c.modifier, c.supprimer].includes('TOUT LE MONDE'));
console.log(`${sortie.length} collections. Fichier : regles-pocketbase.json`);
console.log(`Écriture ouverte à tout le monde (même sans compte) : ${publics.map((c) => c.nom).join(', ') || 'aucune'}`);
