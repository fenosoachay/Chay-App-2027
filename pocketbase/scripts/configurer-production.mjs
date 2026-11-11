#!/usr/bin/env node
// Applique les réglages de l'étape 3c (docs/DEPLOIEMENT.md) au VRAI serveur, à travers le tunnel SSH.
//
//   $env:PB_URL = "http://127.0.0.1:8092"      (tunnel : ssh -N -L 8092:127.0.0.1:8090 <serveur>)
//   $env:PB_EMAIL / $env:PB_PASSWORD            (superuser ; jamais affichés)
//   $env:SMTP_PASSWORD                          (mot de passe de la boîte no-reply@chay.fr ; jamais affiché)
//   node pocketbase/scripts/configurer-production.mjs               -> SIMULATION (rien n'est écrit)
//   node pocketbase/scripts/configurer-production.mjs --appliquer   -> écriture après confirmation « OUI »
//
// Ne modifie QUE : meta (appName, appURL, senderName, senderAddress), smtp, rateLimits, trustedProxy,
// et les options d'authentification de la collection users (pocketbase/config/users-auth.json).
// Jamais les autres collections, les collections système ni les données. Idempotent : relancé, il n'a rien à faire.
// Garde-fous : hôte 127.0.0.1 / localhost seulement, port différent de 8090 (le bac à sable) ; identité du
// serveur affichée et « OUI » exigé avant toute écriture ; aucun secret affiché.
// --test-bac-a-sable : SEULEMENT pour tester le script contre le bac à sable (port 8090 accepté,
// SMTP factice 127.0.0.1:2525 au lieu d'OVH : aucun e-mail ne peut partir vers Internet).
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const APPLY = args.includes('--appliquer');
const SANDBOX = args.includes('--test-bac-a-sable');
const unknown = args.filter((a) => !['--appliquer', '--test-bac-a-sable'].includes(a));
class Stop extends Error { constructor(msg, code = 2) { super(msg); this.code = code; } }
// Pas de process.exit() après un fetch (plantage de libuv sous Windows) : on lève, et main() se termine proprement.
const stop = (msg, code = 2) => { throw new Stop(msg, code); };

// ── Valeurs de production (étape 3c) ─────────────────────────────────────────
const PUBLIC_PB_URL = 'https://api.chay.fr';
const META = { appName: 'Chay', appURL: 'https://membres.chay.fr', senderName: 'Chay', senderAddress: 'no-reply@chay.fr' };
const SMTP = SANDBOX
  ? { enabled: true, host: '127.0.0.1', port: 2525, username: '', authMethod: 'PLAIN', tls: false }
  : { enabled: true, host: 'ssl0.ovh.net', port: 465, username: 'no-reply@chay.fr', authMethod: 'PLAIN', tls: true };
// Caddy sur le même hôte : PocketBase n'écoute que 127.0.0.1:8090, donc seule Caddy peut lui parler.
// Caddy remplace l'en-tête X-Forwarded-For reçu d'Internet par l'adresse réelle du client (il n'accepte pas
// celui d'un client non approuvé) : PocketBase lit cet en-tête, adresse la plus à DROITE (useLeftmostIP=false),
// c'est-à-dire celle ajoutée par Caddy, impossible à falsifier par le client.
const TRUSTED_PROXY = { headers: ['X-Forwarded-For'], useLeftmostIP: false };
const FORBIDDEN_IN_TEMPLATES = /127\.0\.0\.1|localhost|%PB_URL%|chay\.test|:5173|:8090|bac[ -]à[ -]sable/i;

async function main() {
if (unknown.length) stop(`option inconnue : ${unknown.join(' ')}`);
// ── Garde-fou (2) : adresse ──────────────────────────────────────────────────
let BASE;
try { BASE = new URL(process.env.PB_URL || ''); } catch { stop('PB_URL absente ou invalide (exemple : http://127.0.0.1:8092).'); }
if (!['127.0.0.1', 'localhost'].includes(BASE.hostname)) stop('PB_URL doit viser 127.0.0.1 ou localhost (le tunnel SSH), jamais une adresse publique.');
if (BASE.port === '8090' && !SANDBOX) stop('le port 8090 est celui du bac à sable : utilisez le tunnel sur 8092.');
if (BASE.port !== '8090' && SANDBOX) stop('--test-bac-a-sable ne s\'utilise qu\'avec le bac à sable (port 8090).');
const ROOT = BASE.origin;
if (!process.env.PB_EMAIL || !process.env.PB_PASSWORD) stop('PB_EMAIL et PB_PASSWORD (superuser) sont requis.');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(HERE, '..', 'config', f), 'utf8'));
const usersCfg = readJson('users-auth.json');
const sandboxCfg = readJson('settings-bac-a-sable.json');

async function call(method, p, body, token) {
  const res = await fetch(ROOT + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(`${method} ${p} : HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}
const ask = (q) => new Promise((ok) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, (a) => { rl.close(); ok(a); });
});
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
// Limites de débit : l'ordre des règles ne compte pas (PocketBase les trie).
const ruleKey = (r) => `${r.label}|${r.audience || ''}`;
const sameLimits = (a, b) => Boolean(a?.enabled) === Boolean(b?.enabled)
  && same([...(a?.rules || [])].map((r) => ({ label: r.label, audience: r.audience || '', duration: r.duration, maxRequests: r.maxRequests })).sort((x, y) => ruleKey(x).localeCompare(ruleKey(y))),
    [...(b?.rules || [])].map((r) => ({ label: r.label, audience: r.audience || '', duration: r.duration, maxRequests: r.maxRequests })).sort((x, y) => ruleKey(x).localeCompare(ruleKey(y))));
const short = (v) => { const s = JSON.stringify(v ?? null); return s.length > 90 ? `${s.slice(0, 87)}…` : s; };

// ── Connexion et identité du serveur (garde-fou 3) ───────────────────────────
let token;
try {
  ({ token } = await call('POST', '/api/collections/_superusers/auth-with-password', { identity: process.env.PB_EMAIL, password: process.env.PB_PASSWORD }));
} catch (e) {
  stop(e.status ? `connexion superuser refusée (HTTP ${e.status}).` : `serveur injoignable sur ${ROOT} (tunnel ouvert ?).`);
}
const nbCollections = (await call('GET', '/api/collections?perPage=1&fields=id', null, token)).totalItems;
let hasFichier = true;
try { await call('GET', '/api/collections/Fichier', null, token); } catch (e) { if (e.status === 404) hasFichier = false; else throw e; }
const nbUsers = (await call('GET', '/api/collections/users/records?perPage=1&fields=id', null, token)).totalItems;

console.log(SANDBOX ? '=== TEST CONTRE LE BAC À SABLE (SMTP factice 127.0.0.1:2525) ===' : '=== SERVEUR DE PRODUCTION (par le tunnel) ===');
console.log(APPLY ? 'Mode : APPLICATION (après confirmation)' : 'Mode : SIMULATION (rien ne sera écrit ; ajouter --appliquer pour écrire)');
console.log(`Identité du serveur ${ROOT} :`);
console.log(`  collections            : ${nbCollections}`);
console.log(`  collection Fichier     : ${hasFichier ? 'présente' : 'ABSENTE'}`);
console.log(`  comptes dans users     : ${nbUsers}`);

// ── Réglages voulus ──────────────────────────────────────────────────────────
const settings = await call('GET', '/api/settings', null, token);
const removedLabels = sandboxCfg._removeRateLimitLabels || [];
const wantedRules = sandboxCfg.rateLimits.rules;
const keptRules = (settings.rateLimits?.rules || []).filter((r) => !removedLabels.includes(r.label) && !wantedRules.some((w) => ruleKey(w) === ruleKey(r)));
const target = {
  meta: { ...settings.meta, ...META },
  smtp: { ...settings.smtp, ...SMTP },
  rateLimits: { enabled: sandboxCfg.rateLimits.enabled, rules: [...keptRules, ...wantedRules] },
  trustedProxy: { ...settings.trustedProxy, ...TRUSTED_PROXY },
};

const smtpPassword = process.env.SMTP_PASSWORD || '';
const smtpAlreadyThere = settings.smtp?.enabled && settings.smtp?.host === SMTP.host && settings.smtp?.username === SMTP.username;
if (!SANDBOX && !smtpPassword && !smtpAlreadyThere) stop('SMTP_PASSWORD est requis pour la première configuration du SMTP.');

const changes = []; // [rubrique, champ, avant, après]
const settingsPatch = {};
for (const section of ['meta', 'smtp', 'trustedProxy']) {
  for (const k of Object.keys(target[section])) {
    if (k === 'password') continue;
    if (!same(settings[section]?.[k], target[section][k])) {
      changes.push([`réglages.${section}`, k, settings[section]?.[k], target[section][k]]);
      settingsPatch[section] = target[section];
    }
  }
}
if (!sameLimits(settings.rateLimits, target.rateLimits)) {
  changes.push(['réglages.rateLimits', 'enabled / règles', `${settings.rateLimits?.enabled} / ${settings.rateLimits?.rules?.length || 0} règles`,
    `${target.rateLimits.enabled} / ${target.rateLimits.rules.length} règles (${wantedRules.length} de la config, ${keptRules.length} conservées)`]);
  settingsPatch.rateLimits = target.rateLimits;
}
if (smtpPassword && !SANDBOX) {
  changes.push(['réglages.smtp', 'password', '(masqué)', '(masqué : valeur de SMTP_PASSWORD)']);
  settingsPatch.smtp = { ...(settingsPatch.smtp || target.smtp), password: smtpPassword };
}

// ── Options d'authentification de users ──────────────────────────────────────
const users = await call('GET', '/api/collections/users', null, token);
const wantedUsers = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(usersCfg).filter(([k]) => !k.startsWith('_'))))
  .replaceAll('%PB_URL%', PUBLIC_PB_URL));
const leftovers = JSON.stringify(wantedUsers).match(FORBIDDEN_IN_TEMPLATES);
if (leftovers) stop(`adresse de bac à sable restante dans users-auth.json après remplacement (« ${leftovers[0]} »).`);
const usersPatch = {};
for (const [k, v] of Object.entries(wantedUsers)) {
  const merged = v && typeof v === 'object' && !Array.isArray(v) && users[k] && typeof users[k] === 'object' ? { ...users[k], ...v } : v;
  if (same(users[k], merged)) continue;
  usersPatch[k] = merged;
  if (merged && typeof merged === 'object' && !Array.isArray(merged)) {
    for (const kk of Object.keys(merged)) if (!same(users[k]?.[kk], merged[kk])) changes.push(['users', `${k}.${kk}`, users[k]?.[kk], merged[kk]]);
  } else {
    changes.push(['users', k, users[k], merged]);
  }
}
const metaUrl = target.meta.appURL;
if (FORBIDDEN_IN_TEMPLATES.test(metaUrl)) stop('Application URL de bac à sable.');

// ── Comparatif ───────────────────────────────────────────────────────────────
console.log(`\nChangements (${changes.length}) :`);
if (!changes.length) console.log('  aucun : le serveur est déjà conforme.');
for (const [where, field, before, after] of changes) {
  console.log(`  ${where} › ${field}`);
  console.log(`      avant : ${short(before)}`);
  console.log(`      après : ${short(after)}`);
}
console.log('\nNon modifié : autres collections, collections système, données, sauvegardes, S3, journaux.');
console.log(`Trusted proxy : ${JSON.stringify(TRUSTED_PROXY)} (Caddy local ; PocketBase doit écouter sur 127.0.0.1:8090 seulement).`);

if (!APPLY || !changes.length) return 0;

// ── Confirmation puis écriture ───────────────────────────────────────────────
const answer = await ask(`\nC'est bien le serveur voulu (${nbCollections} collections, ${nbUsers} comptes) ? Tapez OUI pour écrire : `);
if (answer.trim() !== 'OUI') stop('pas de confirmation : rien n\'a été écrit.', 1);

if (Object.keys(usersPatch).length) await call('PATCH', '/api/collections/users', usersPatch, token);
if (Object.keys(settingsPatch).length) await call('PATCH', '/api/settings', settingsPatch, token);

// Vérification relue sur le serveur.
const s2 = await call('GET', '/api/settings', null, token);
const u2 = await call('GET', '/api/collections/users', null, token);
const bad = [];
for (const section of ['meta', 'smtp', 'trustedProxy']) for (const k of Object.keys(target[section])) if (k !== 'password' && !same(s2[section]?.[k], target[section][k])) bad.push(`${section}.${k}`);
if (!sameLimits(s2.rateLimits, target.rateLimits)) bad.push('rateLimits');
for (const [k, v] of Object.entries(usersPatch)) {
  if (v && typeof v === 'object' && !Array.isArray(v)) { for (const kk of Object.keys(v)) if (!same(u2[k]?.[kk], v[kk])) bad.push(`users.${k}.${kk}`); } else if (!same(u2[k], v)) bad.push(`users.${k}`);
}
if (FORBIDDEN_IN_TEMPLATES.test(JSON.stringify([u2.otp, u2.resetPasswordTemplate, u2.confirmEmailChangeTemplate, u2.verificationTemplate]))) bad.push('modèles d\'e-mail : adresse de bac à sable');
console.log(bad.length ? `\nÉCARTS après écriture : ${bad.join(', ')}` : `\nÉcrit et vérifié : ${changes.length} changement(s). Relancer le script doit afficher « aucun ».`);
console.log('Ensuite : tableau d\'administration → Settings → Mail settings → « Send test email » vers une boîte de test.');
return bad.length ? 1 : 0;
}

main().then((code) => { process.exitCode = code; }, (err) => {
  if (err instanceof Stop) { console.error(`ARRÊT : ${err.message}`); process.exitCode = err.code; return; }
  console.error(`ERREUR : ${err.message}`);
  process.exitCode = 1;
});
