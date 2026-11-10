#!/usr/bin/env node
// Références EXISTANTES vers le bucket R2 des vidéos (anciens envois Base44, section « Adresses R2 existantes
// (non réécrites) » de migration-fichiers-rapport.md) : adresse privée du point d'accès S3
//   https://<compte>.r2.cloudflarestorage.com/chay-videos/videos%2F<nom>.mp4   (illisible pour l'app)
// -> adresse publique R2_PUBLIC_BASE_URL/videos/<nom>.mp4, après avoir vérifié et, si besoin, corrigé le
// Content-Type de l'objet (sans le renvoyer : CopyObject REPLACE). SIMULATION par défaut.
//
//   $env:PB_SU_EMAIL / $env:PB_SU_PASSWORD   (superuser ; obligatoires hors bac à sable ; jamais affichés)
//   node pocketbase/scripts/reecrire-adresses-r2.mjs --pb http://127.0.0.1:8092 --r2-env C:\Secrets-Chay\r2-migration.env --r2-reel
//        -> SIMULATION : rapport (clé, type actuel, taille, champ, avant / après), rien n'est écrit
//   ... --appliquer  -> confirmation « REECRIRE <bucket> », puis pour chaque objet : type corrigé si besoin,
//        lecture par plages vérifiée, PUIS seulement réécriture des champs qui ont encore l'ancienne adresse.
//
// Options : --pb <url> (127.0.0.1 / localhost seulement ; défaut : bac à sable 8090) ; --r2-env <fichier> (HORS du
//   dépôt ; mêmes noms que migrer-fichiers.mjs) ; --r2-reel (obligatoire pour le vrai R2) ; --bucket-attendu (chay-videos) ;
//   --appliquer.
// Entrées : C:\Export-Base44\fichiers.csv (références dont l'hôte est *.r2.cloudflarestorage.com), via loadExport().
// Sortie : C:\Export-Base44\_outil\pb\adresses-r2-rapport.md (aucun secret).
//
// Règles :
// - seules les adresses « https://<compte>.r2.cloudflarestorage.com/<bucket attendu>/<clé> », sans paramètres, du MÊME
//   compte que R2_ENDPOINT, avec une clé sous videos/ et une extension connue, sont traitées ; tout le reste (autre
//   bucket, autre compte, adresse signée, autre forme) est LISTÉ, sans rien faire ;
// - taille lue par Content-Range (jamais -1) : objet refusé si elle est inconnue ou incohérente ;
// - type attendu d'après l'extension (vidéo, image, audio) ; s'il n'est pas de la bonne famille : CopyObject REPLACE
//   avec la liste blanche d'en-têtes (cache-control, content-disposition, content-language, x-amz-meta-*),
//   content-encoding recopié seulement s'il est avéré, puis vérification (type, taille, content-encoding) ;
// - un champ n'est réécrit que si l'objet est lisible par plages (206, bon type, bonne taille) sur l'adresse
//   publique ET si sa valeur actuelle est encore l'ancienne adresse (dates de mise à jour conservées) ;
// - idempotent et sans doublon : relancé, il ne refait ni copie (type déjà bon) ni réécriture (déjà faite).
// Code de sortie : 0 si tout va bien, 1 si au moins un objet ou un champ est en échec, 2 en cas d'erreur ou de refus.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { loadExport, parseField, pbClient, reecrire, s3 } from './migrer-fichiers.mjs';
import { cleValide, lireObjet, verifier as verifierEnvR2 } from './corriger-type-r2.mjs';

const EXPORT = process.env.EXPORT_BASE44 || 'C:\\Export-Base44';
const OUT = path.join(EXPORT, '_outil', 'pb');
const MAX_COPIE = 5 * 1024 * 1024 * 1024;
const TYPES = {
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  mp3: 'audio/mpeg', m4a: 'audio/mp4',
};
const typeDe = (t) => String(t || '').split(';')[0].trim().toLowerCase();
const famille = (t) => typeDe(t).split('/')[0];
const collectionOf = (entite) => (entite === 'User' ? 'users' : entite);
const isLocalHost = (u) => ['127.0.0.1', 'localhost'].includes(new URL(u).hostname);

export function parseArgs(argv) {
  const a = { appliquer: false, pb: 'http://127.0.0.1:8090', r2Env: null, r2Reel: false, bucketAttendu: 'chay-videos' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`Refusé : ${k} attend une valeur.`);
      return v;
    };
    if (k === '--appliquer') a.appliquer = true;
    else if (k === '--pb') a.pb = val().replace(/\/+$/, '');
    else if (k === '--r2-env') a.r2Env = val();
    else if (k === '--r2-reel') a.r2Reel = true;
    else if (k === '--bucket-attendu') a.bucketAttendu = val();
    else throw new Error(`Refusé : option inconnue ${k}.`);
  }
  let u;
  try { u = new URL(a.pb); } catch { throw new Error('Refusé : --pb invalide.'); }
  if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('Refusé : --pb doit viser 127.0.0.1 ou localhost (tunnel ou bac à sable).');
  return a;
}

/**
 * Ancienne adresse -> { ok: true, cle, type } ou { ok: false, raison }. Aucune requête.
 * Avec un point d'accès local (faux S3 des tests), le compte n'est pas comparé.
 */
export function analyserAdresse(url, env) {
  let u;
  try { u = new URL(url); } catch { return { ok: false, raison: 'adresse invalide' }; }
  if (u.protocol !== 'https:') return { ok: false, raison: 'pas en https' };
  if (!/\.r2\.cloudflarestorage\.com$/i.test(u.hostname)) return { ok: false, raison: 'autre hôte' };
  if (u.search || u.hash) return { ok: false, raison: 'adresse avec paramètres (signée ?) : autre forme' };
  if (!isLocalHost(env.R2_ENDPOINT) && u.host.toLowerCase() !== new URL(env.R2_ENDPOINT).host.toLowerCase()) {
    return { ok: false, raison: 'autre compte ou autre point d\'accès que R2_ENDPOINT' };
  }
  const segs = u.pathname.split('/').slice(1);
  let bucket;
  let cle;
  try {
    bucket = decodeURIComponent(segs[0] || '');
    cle = segs.slice(1).map((s) => decodeURIComponent(s)).join('/');
  } catch { return { ok: false, raison: 'encodage de l\'adresse illisible' }; }
  if (bucket !== env.R2_BUCKET) return { ok: false, raison: `autre bucket ou autre forme (« ${bucket || '?'} »)` };
  if (!cleValide(cle)) return { ok: false, raison: 'clé non prise en charge (hors videos/ ou caractères spéciaux)' };
  const type = TYPES[cle.split('.').pop().toLowerCase()];
  if (!type) return { ok: false, raison: 'extension inconnue' };
  return { ok: true, cle, type };
}

export const adressePublique = (env, cle) => `${env.R2_PUBLIC_BASE_URL.replace(/\/+$/, '')}/${cle.split('/').map(encodeURIComponent).join('/')}`;

/** Lecture publique comme l'app : Range « bytes=0-1 » -> 206, type de la bonne famille, taille totale attendue. */
export async function lecturePublique(url, taille, typeAttendu) {
  let res;
  try { res = await fetch(url, { headers: { Range: 'bytes=0-1' } }); } catch { return { ok: false, raison: 'adresse publique injoignable' }; }
  await res.body?.cancel().catch(() => {});
  const type = res.headers.get('content-type') || '';
  const total = Number((/\/(\d+)$/.exec(res.headers.get('content-range') || '') || [])[1]);
  if (res.status !== 206) return { ok: false, raison: `lecture par plages refusée (HTTP ${res.status})`, type };
  if (famille(type) !== famille(typeAttendu)) return { ok: false, raison: `Content-Type « ${type || 'absent'} » (${famille(typeAttendu)}/* attendu)`, type };
  if (total !== taille) return { ok: false, raison: `taille annoncée ${Number.isFinite(total) ? total : '?'} au lieu de ${taille}`, type };
  return { ok: true, raison: '', type };
}

/** Valeur actuelle du champ (simple ou liste « image_urls[2] »). */
function valeurChamp(rec, champ) {
  const { name, index } = parseField(champ);
  const v = rec?.[name];
  return index === null ? v : Array.isArray(v) ? v : undefined;
}

/** État d'une référence : à réécrire / déjà fait / valeur différente / enregistrement absent. */
async function etatRef(pb, ref, nouvelle) {
  const r = await pb('GET', `/api/collections/${collectionOf(ref.entite)}/records/${ref.id}`);
  if (r.status !== 200) return 'enregistrement absent';
  const v = valeurChamp(r.data, ref.champ);
  if (Array.isArray(v)) return v.includes(ref.url) ? 'à réécrire' : v.includes(nouvelle) ? 'déjà fait' : 'valeur différente (non touchée)';
  return v === ref.url ? 'à réécrire' : v === nouvelle ? 'déjà fait' : 'valeur différente (non touchée)';
}

/** Plan : objets (par clé) et références ignorées. Lectures seulement. */
export async function planifier(pb, env, refs) {
  const ignorees = [];
  const parCle = new Map();
  for (const ref of refs) {
    const a = analyserAdresse(ref.url, env);
    if (!a.ok) { ignorees.push({ ...ref, raison: a.raison }); continue; }
    if (!parCle.has(a.cle)) parCle.set(a.cle, { cle: a.cle, typeVoulu: a.type, nouvelle: adressePublique(env, a.cle), refs: [] });
    parCle.get(a.cle).refs.push({ ...ref });
  }
  const objets = [...parCle.values()].sort((x, y) => x.cle.localeCompare(y.cle));
  for (const o of objets) {
    const lu = await lireObjet(env, o.cle);
    o.objet = lu;
    if (lu.status === 404) o.probleme = 'objet introuvable dans le bucket';
    else if (lu.status !== 200) o.probleme = `objet illisible (HEAD : HTTP ${lu.status})`;
    else if (lu.probleme) o.probleme = lu.probleme;
    else if (lu.taille > MAX_COPIE && famille(lu.type) !== famille(o.typeVoulu)) o.probleme = 'plus de 5 Gio : type non corrigeable par CopyObject';
    o.typeOk = !o.probleme && famille(lu.type) === famille(o.typeVoulu);
    for (const r of o.refs) r.avant = await etatRef(pb, r, o.nouvelle);
  }
  return { objets, ignorees };
}

/** CopyObject REPLACE de l'objet sur lui-même : nouveau type, en-têtes de la liste blanche (lireObjet), puis vérification. */
async function corrigerType(env, o) {
  const avant = o.objet;
  const source = `/${env.R2_BUCKET}/${o.cle.split('/').map(encodeURIComponent).join('/')}`;
  const r = await s3(env, 'PUT', o.cle, [], '', { ...avant.garder, 'content-type': o.typeVoulu, 'x-amz-copy-source': source, 'x-amz-metadata-directive': 'REPLACE' });
  if (r.status !== 200 || /<Error>/.test(r.text) || !/<CopyObjectResult/.test(r.text)) throw new Error(`CopyObject : HTTP ${r.status}`);
  const apres = await lireObjet(env, o.cle);
  if (apres.status !== 200 || apres.probleme) throw new Error(`relecture après copie : ${apres.probleme || `HTTP ${apres.status}`}`);
  if (apres.taille !== avant.taille) throw new Error(`taille modifiée par la copie (${apres.taille} au lieu de ${avant.taille})`);
  if (typeDe(apres.type) !== o.typeVoulu) throw new Error(`type après copie : ${apres.type || 'absent'}`);
  if ((apres.encodageAvere || '') !== (avant.encodageAvere || '')) throw new Error('Content-Encoding modifié par la copie');
  o.objet = apres;
}

function demanderConfirmation(attendu) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`Pour appliquer, tapez exactement : ${attendu}\n> `, (r) => { rl.close(); resolve(String(r).trim() === attendu); });
  });
}

const mo = (n) => (Number.isFinite(n) && n > 0 ? `${(n / 1024 / 1024).toFixed(1)} Mo (${n} o)` : '?');

function ecrireRapport({ args, env, objets, ignorees, applique }) {
  const L = ['# Adresses R2 existantes -> adresse publique', '',
    `Mode : **${applique ? 'application' : 'simulation (rien écrit)'}** — PocketBase : \`${args.pb}\` — bucket : \`${env.R2_BUCKET}\` — adresse publique : \`${env.R2_PUBLIC_BASE_URL}\` — ${new Date().toISOString()}`, '',
    '## Objets', '', '| Clé | Type actuel | Taille | Type attendu | Action / résultat |', '|---|---|---|---|---|'];
  for (const o of objets) {
    const action = o.resultat || (o.probleme ? `✗ ${o.probleme}` : o.typeOk ? 'type correct' : `corriger le type -> ${o.typeVoulu}`);
    L.push(`| \`${o.cle}\` | ${o.typeAvant ?? o.objet?.type ?? '—'} | ${mo(o.objet?.taille)} | ${o.typeVoulu} | ${action} |`);
  }
  L.push('', '## Champs', '', '| Entité | Enregistrement | Champ | Clé | Avant | Après | Nouvelle adresse |', '|---|---|---|---|---|---|---|');
  for (const o of objets) for (const r of o.refs) L.push(`| ${r.entite} | ${r.id} | ${r.champ} | \`${o.cle}\` | ${r.avant} | ${r.apres || '—'} | ${o.nouvelle} |`);
  L.push('', '## Références non traitées (rien n\'a été fait)', '', '| Entité | Enregistrement | Champ | Raison |', '|---|---|---|---|');
  for (const r of ignorees) L.push(`| ${r.entite} | ${r.id} | ${r.champ} | ${r.raison} |`);
  fs.mkdirSync(OUT, { recursive: true });
  const f = path.join(OUT, 'adresses-r2-rapport.md');
  fs.writeFileSync(f, `${L.join('\n')}\n`);
  return f;
}

/**
 * Programme principal. `opts` (tests) : confirmer(attendu), log.
 * @returns {Promise<{ objets, ignorees, echecs: number, applique: boolean, rapport: string }>}
 */
export async function main(argv = process.argv.slice(2), opts = {}) {
  const log = opts.log || console.log;
  const args = parseArgs(argv);
  // Fichier R2 : mêmes contrôles que corriger-type-r2.mjs (hors dépôt, variables, bucket, --r2-reel, https).
  // La clé n'est pas encore connue : une clé de contrôle sert seulement à passer la validation de forme.
  const env = verifierEnvR2({ r2Env: args.r2Env, r2Reel: args.r2Reel, bucketAttendu: args.bucketAttendu, cle: 'videos/controle.mp4', type: 'video/mp4' });
  // Hors bac à sable : identifiants superuser explicites (sinon pbClient prendrait ceux du bac à sable).
  if (new URL(args.pb).port !== '8090' && !(process.env.PB_SU_EMAIL && process.env.PB_SU_PASSWORD)) {
    throw new Error('Refusé : PB_SU_EMAIL et PB_SU_PASSWORD sont requis hors du bac à sable (port 8090).');
  }
  const exp = loadExport();
  const pb = await pbClient(args.pb);
  const { objets, ignorees } = await planifier(pb, env, exp.r2);
  for (const o of objets) o.typeAvant = o.objet?.type || '';

  const nbRefs = objets.reduce((s, o) => s + o.refs.length, 0);
  log(`Références vers R2 dans l'export : ${exp.r2.length} — traitables : ${nbRefs} (${objets.length} objets) — non traitées : ${ignorees.length}`);
  log(`Adresse publique : ${env.R2_PUBLIC_BASE_URL} ; bucket : ${env.R2_BUCKET} ; PocketBase : ${args.pb}`);
  for (const o of objets) {
    log(`  ${o.cle} : ${mo(o.objet?.taille)}, type ${o.objet?.type || '—'} -> ${o.probleme ? `✗ ${o.probleme}` : o.typeOk ? 'type correct' : `à corriger en ${o.typeVoulu}`}`);
    if (o.objet?.encodageVu && !o.objet?.encodageAvere) log(`    (Content-Encoding « ${o.objet.encodageVu} » au HEAD : compression à la volée, non recopié)`);
    for (const r of o.refs) log(`    ${r.entite} ${r.id} ${r.champ} : ${r.avant}`);
  }
  for (const r of ignorees) log(`  non traitée : ${r.entite} ${r.id} ${r.champ} — ${r.raison}`);

  const aFaire = objets.filter((o) => !o.probleme && (!o.typeOk || o.refs.some((r) => r.avant === 'à réécrire')));
  if (!args.appliquer) {
    const rapport = ecrireRapport({ args, env, objets, ignorees, applique: false });
    log(`SIMULATION : rien n'est modifié (${aFaire.length} objet(s) à traiter avec --appliquer). Rapport : ${rapport}`);
    return { objets, ignorees, echecs: 0, applique: false, rapport };
  }
  if (!aFaire.length) {
    const rapport = ecrireRapport({ args, env, objets, ignorees, applique: false });
    log(`Rien à faire : types corrects et champs déjà réécrits. Rapport : ${rapport}`);
    return { objets, ignorees, echecs: 0, applique: false, rapport };
  }
  const ok = await (opts.confirmer || demanderConfirmation)(`REECRIRE ${env.R2_BUCKET}`);
  if (!ok) throw new Error('Annulé : confirmation non reçue, rien n\'a été modifié.');

  let echecs = 0;
  for (const o of aFaire) {
    try {
      if (!o.typeOk) { await corrigerType(env, o); o.typeCorrige = true; }
      const l = await lecturePublique(o.nouvelle, o.objet.taille, o.typeVoulu);
      if (!l.ok) throw new Error(`adresse publique : ${l.raison} (champs non réécrits)`);
      const mapping = new Map(o.refs.filter((r) => r.avant === 'à réécrire').map((r) => [r.url, o.nouvelle]));
      const rw = mapping.size ? await reecrire(pb, o.refs, mapping, new Map()) : { modifies: 0 };
      o.resultat = `${o.typeCorrige ? `type corrigé (${o.typeVoulu}), ` : ''}lisible par plages ; ${rw.modifies} champ(s) réécrit(s)`;
    } catch (err) {
      echecs++;
      o.resultat = `✗ ${err.message}`;
    }
  }
  // États après, relus dans PocketBase.
  for (const o of objets) for (const r of o.refs) r.apres = await etatRef(pb, r, o.nouvelle);
  const rapport = ecrireRapport({ args, env, objets, ignorees, applique: true });
  for (const o of aFaire) log(`  ${o.cle} : ${o.resultat}`);
  log(`Bilan : ${aFaire.length - echecs} objet(s) traité(s), ${echecs} échec(s). Rapport : ${rapport}`);
  return { objets, ignorees, echecs, applique: true, rapport };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((r) => { process.exitCode = r.echecs ? 1 : 0; }).catch((err) => {
    console.error(`Erreur : ${err.message}`);
    process.exitCode = 2;
  });
}
