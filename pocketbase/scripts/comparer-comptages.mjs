#!/usr/bin/env node
// Compare le nombre d'enregistrements par entité entre l'export Base44 (counts.json) et PocketBase.
// LECTURE SEULE : une connexion superuser (POST auth-with-password), puis uniquement des GET. Aucune écriture.
//
//   PowerShell (production, par le tunnel ssh -N -L 8092:127.0.0.1:8090 <serveur>) :
//     $env:PB_URL = "http://127.0.0.1:8092"
//     $env:PB_EMAIL = Read-Host "E-mail superuser"
//     $env:PB_PASSWORD = Lire-Secret "Mot de passe superuser"
//     node pocketbase/scripts/comparer-comptages.mjs
//     Remove-Item Env:PB_PASSWORD, Env:PB_EMAIL, Env:PB_URL
//
// Options : --counts <fichier> (défaut : C:\Export-Base44\counts.json, ou EXPORT_BASE44\counts.json).
// PB_URL : 127.0.0.1 ou localhost seulement (tunnel ou bac à sable). Le mot de passe n'est jamais affiché.
// Code de sortie : 0 si tout est identique, 1 s'il y a au moins un écart, 2 en cas d'erreur.
// Les comptes de test, ou des versets ajoutés après l'export, donnent un écart positif attendu : à lire, pas à corriger.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPORT = process.env.EXPORT_BASE44 || 'C:\\Export-Base44';

/** Entité Base44 -> collection PocketBase (même règle que les scripts d'import). */
export const collectionOf = (entite) => (entite === 'User' ? 'users' : entite);

/** Lit counts.json (format de export-base44.mjs : { date, entities, results: { Entité: { count } } }). */
export function lireComptesExport(fichier) {
  const c = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  const res = c.results || {};
  const out = {};
  for (const [entite, v] of Object.entries(res)) {
    const n = typeof v === 'number' ? v : v && typeof v.count === 'number' ? v.count : null;
    if (n !== null) out[entite] = n;
  }
  return { date: c.date || null, comptes: out };
}

/**
 * Compare. `fetchImpl` permet aux tests de vérifier qu'aucune écriture n'est faite.
 * @returns {Promise<{ lignes: Array<{ entite, collection, exportN, pbN, ecart, etat }>, ecarts: number }>}
 */
export async function comparer({ pbUrl, email, password, comptes, fetchImpl = fetch }) {
  const base = String(pbUrl || '').replace(/\/+$/, '');
  let host;
  try { host = new URL(base).hostname; } catch { throw new Error('PB_URL absente ou invalide (exemple : http://127.0.0.1:8092).'); }
  if (!['127.0.0.1', 'localhost'].includes(host)) throw new Error('PB_URL doit viser 127.0.0.1 ou localhost (tunnel ou bac à sable).');
  if (!email || !password) throw new Error('PB_EMAIL et PB_PASSWORD sont requis (variables d\'environnement).');

  const auth = await fetchImpl(`${base}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password }),
  });
  if (!auth.ok) throw new Error(`connexion superuser impossible (HTTP ${auth.status})`);
  const token = (await auth.json()).token;
  const get = async (p) => {
    const r = await fetchImpl(`${base}${p}`, { method: 'GET', headers: { Authorization: token } });
    return { status: r.status, data: r.ok ? await r.json() : null };
  };

  const cols = await get('/api/collections?perPage=500&fields=name');
  if (cols.status !== 200) throw new Error(`liste des collections impossible (HTTP ${cols.status})`);
  const existantes = new Set((cols.data.items || []).map((c) => c.name));

  const lignes = [];
  for (const entite of Object.keys(comptes).sort((a, b) => a.localeCompare(b))) {
    const collection = collectionOf(entite);
    const exportN = comptes[entite];
    if (!existantes.has(collection)) {
      lignes.push({ entite, collection, exportN, pbN: null, ecart: null, etat: 'collection absente' });
      continue;
    }
    const r = await get(`/api/collections/${encodeURIComponent(collection)}/records?perPage=1&fields=id`);
    if (r.status !== 200) {
      lignes.push({ entite, collection, exportN, pbN: null, ecart: null, etat: `erreur HTTP ${r.status}` });
      continue;
    }
    const pbN = r.data.totalItems;
    const ecart = pbN - exportN;
    lignes.push({ entite, collection, exportN, pbN, ecart, etat: ecart === 0 ? 'identique' : 'ÉCART' });
  }
  return { lignes, ecarts: lignes.filter((l) => l.etat !== 'identique').length };
}

/** Tableau texte : entité, export, PocketBase, écart, état. */
export function tableau(lignes) {
  const t = [['Entité', 'Export', 'PocketBase', 'Écart', 'État']];
  for (const l of lignes) {
    t.push([l.entite, String(l.exportN), l.pbN === null ? '—' : String(l.pbN), l.ecart === null ? '—' : (l.ecart > 0 ? `+${l.ecart}` : String(l.ecart)), l.etat === 'identique' ? 'ok' : `⚠ ${l.etat}`]);
  }
  const w = t[0].map((_, i) => Math.max(...t.map((r) => r[i].length)));
  return t.map((r, k) => {
    const line = r.map((c, i) => (i >= 1 && i <= 3 ? c.padStart(w[i]) : c.padEnd(w[i]))).join('  ');
    return k === 0 ? `${line}\n${w.map((n) => '─'.repeat(n)).join('  ')}` : line;
  }).join('\n');
}

export async function main(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--counts');
  const fichier = i >= 0 ? argv[i + 1] : path.join(EXPORT, 'counts.json');
  const { date, comptes } = lireComptesExport(fichier);
  const { lignes, ecarts } = await comparer({ pbUrl: process.env.PB_URL, email: process.env.PB_EMAIL, password: process.env.PB_PASSWORD, comptes });
  console.log(`Export : ${fichier}${date ? ` (${date})` : ''} — PocketBase : ${String(process.env.PB_URL).replace(/\/+$/, '')}`);
  console.log('');
  console.log(tableau(lignes));
  console.log('');
  console.log(`${lignes.length} entités : ${lignes.length - ecarts} identiques, ${ecarts} avec un écart ou une collection absente.`);
  return ecarts ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((err) => {
    console.error(`Erreur : ${err.message}`);
    process.exitCode = 2;
  });
}
