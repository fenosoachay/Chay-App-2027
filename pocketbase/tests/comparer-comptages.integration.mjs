#!/usr/bin/env node
// comparer-comptages.mjs contre le BAC À SABLE : comptages exacts, écart détecté, collection absente, LECTURE SEULE
// (une seule requête POST : la connexion ; tout le reste en GET), mot de passe jamais affiché.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BASE, http, loadCreds, login, makeChecker, sleep } from './lib.mjs';
import { comparer, lireComptesExport, tableau } from '../scripts/comparer-comptages.mjs';

const { check, done } = makeChecker();
const creds = loadCreds(['superuser']).superuser;
const su = { token: (await login('_superusers', creds)).token };
const total = async (col) => (await http('GET', `/api/collections/${col}/records?perPage=1&fields=id`, su)).data.totalItems;

const comptes = {
  User: await total('users'),
  Announcement: await total('Announcement'),
  Faq: (await total('Faq')) + 3, // écart volontaire
  EntiteInexistante: 7,
};

console.log('\n■ Comparaison (bac à sable)');
const appels = [];
const espion = (url, init = {}) => { appels.push(String(init.method || 'GET').toUpperCase()); return fetch(url, init); };
// Les suites précédentes peuvent avoir épuisé la limite de connexions superuser (10 / min) : attendre puis réessayer.
let resultat;
for (let essai = 0; ; essai++) {
  appels.length = 0;
  try { resultat = await comparer({ pbUrl: BASE, email: creds.email, password: creds.password, comptes, fetchImpl: espion }); break; } catch (e) {
    if (!/HTTP 429/.test(e.message) || essai >= 8) throw e;
    await sleep(10000);
  }
}
const { lignes, ecarts } = resultat;
const l = Object.fromEntries(lignes.map((x) => [x.entite, x]));
check('User -> collection users : identique', l.User.collection === 'users' && l.User.etat === 'identique' && l.User.ecart === 0);
check('Announcement : identique', l.Announcement.etat === 'identique');
check('Faq : écart de -3 détecté', l.Faq.etat === 'ÉCART' && l.Faq.ecart === -3, JSON.stringify(l.Faq));
check('entité sans collection : signalée', l.EntiteInexistante.etat === 'collection absente');
check('2 entités à signaler', ecarts === 2);
check('lecture seule : une seule requête POST (connexion), toutes les autres en GET',
  appels.filter((m) => m === 'POST').length === 1 && appels.every((m) => m === 'POST' || m === 'GET'), appels.join(','));
const t = tableau(lignes);
check('tableau : colonnes entité / export / PocketBase / écart / état', /Entité\s+Export\s+PocketBase\s+Écart\s+État/.test(t) && /Faq.*-3.*⚠ ÉCART/.test(t));

console.log('\n■ Garde-fous');
let refus = '';
try { await comparer({ pbUrl: 'https://api.chay.fr', email: 'x', password: 'y', comptes }); } catch (e) { refus = e.message; }
check('adresse autre que 127.0.0.1 / localhost : refusée avant toute requête', /127\.0\.0\.1 ou localhost/.test(refus));
try { await comparer({ pbUrl: BASE, email: '', password: '', comptes }); refus = ''; } catch (e) { refus = e.message; }
check('identifiants manquants : refusé', /PB_EMAIL et PB_PASSWORD/.test(refus));

console.log('\n■ Ligne de commande (fichier counts.json temporaire)');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chay-comptes-'));
try {
  const f = path.join(dir, 'counts.json');
  fs.writeFileSync(f, JSON.stringify({ date: '2026-11-09T00:00:00Z', entities: Object.keys(comptes), results: Object.fromEntries(Object.entries(comptes).map(([k, n]) => [k, { count: n, method: 'count' }])) }));
  check('lecture de counts.json (format de l\'export)', lireComptesExport(f).comptes.Faq === comptes.Faq);
  let sortie = '';
  let code = 0;
  for (let essai = 0; essai < 8; essai++) {
    let erreur = '';
    try {
      sortie = execFileSync(process.execPath, ['pocketbase/scripts/comparer-comptages.mjs', '--counts', f], {
        env: { ...process.env, PB_URL: BASE, PB_EMAIL: creds.email, PB_PASSWORD: creds.password }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      code = 0;
    } catch (e) { sortie = e.stdout || ''; code = e.status; erreur = String(e.stderr || ''); }
    if (code !== 2 || !/HTTP 429/.test(erreur)) break; // limite de connexions : attendre puis réessayer
    await sleep(10000);
  }
  check('code de sortie 1 (écarts présents) et tableau affiché', code === 1 && /4 entités : 2 identiques, 2 avec un écart/.test(sortie), `code ${code}`);
  check('mot de passe jamais affiché', !sortie.includes(creds.password));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
done();
