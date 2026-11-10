#!/usr/bin/env node
// Corrige le Content-Type d'UN objet DÉJÀ présent dans le bucket R2 des vidéos, SANS le renvoyer :
// copie côté serveur de l'objet sur lui-même (S3 CopyObject, x-amz-metadata-directive: REPLACE). SIMULATION par défaut.
//
//   node pocketbase/scripts/corriger-type-r2.mjs --r2-env C:\Secrets-Chay\r2-migration.env --r2-reel --cle videos/migration/1fc96ec7b3aa4bff.mp4
//        -> SIMULATION : lit l'objet (HEAD) et l'adresse publique (Range), n'écrit rien
//   ... --appliquer   -> résumé, confirmation à taper « CORRIGER <clé> », copie, puis vérification
//
// Options : --cle <clé> (obligatoire, une seule, sous videos/) ; --type <type> (défaut video/mp4 ; video/* seulement) ;
//           --r2-env <fichier> (obligatoire, HORS du dépôt ; mêmes noms que migrer-fichiers.mjs) ;
//           --bucket-attendu <nom> (défaut chay-videos) ; --r2-reel (obligatoire pour un point d'accès qui n'est pas
//           127.0.0.1 / localhost, c'est-à-dire le vrai R2) ; --appliquer.
// Garanties : un seul objet touché (la clé donnée) ; taille et contenu inchangés (copie sur place) ; seuls les
// en-têtes utiles de la liste blanche sont relus puis renvoyés tels quels : Cache-Control, Content-Disposition,
// Content-Language, x-amz-meta-* ; aucune valeur du fichier --r2-env n'est affichée.
// Taille et Content-Encoding RÉELS : lus par un GET signé « Range: bytes=0-0 » (Content-Range), car fetch envoie
// sinon « Accept-Encoding: gzip, deflate » et R2 compresse à la volée les types texte : la réponse au HEAD n'a
// alors plus de Content-Length et porte un « Content-Encoding: gzip » qui n'appartient PAS à l'objet stocké.
// Avec un Range, fetch demande « Accept-Encoding: identity » : pas de compression, valeurs fiables.
// Content-Encoding n'est recopié que s'il est avéré (présent sur cette réponse 206 non compressée).
// Refus si la taille est inconnue, nulle ou incohérente : aucune copie dans ce cas.
// Limite : CopyObject est limité à 5 Gio ; au-delà, refus (il faudrait une copie multipart).
// Vérification finale : type voulu et taille identique (relus de la même façon) et Range « bytes=0-1 » sur l'adresse
// publique (206, video/*, taille totale).
// Code de sortie : 0 si conforme (ou rien à faire), 1 si la vérification échoue, 2 en cas d'erreur ou de refus.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { readEnvFile, s3, verifierLecture } from './migrer-fichiers.mjs';
import { sha256Hex, signature, uriEncode } from '../tests/sigv4-node.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VARS = ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_BASE_URL'];
const MAX_COPIE = 5 * 1024 * 1024 * 1024;
const GARDER = ['cache-control', 'content-disposition', 'content-language']; // + x-amz-meta-* ; jamais content-encoding vu au HEAD
const isLocalHost = (u) => ['127.0.0.1', 'localhost'].includes(new URL(u).hostname);

export function parseArgs(argv) {
  const a = { appliquer: false, r2Reel: false, r2Env: null, cle: null, type: 'video/mp4', bucketAttendu: 'chay-videos' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`Refusé : ${k} attend une valeur.`);
      return v;
    };
    if (k === '--appliquer') a.appliquer = true;
    else if (k === '--r2-reel') a.r2Reel = true;
    else if (k === '--r2-env') a.r2Env = val();
    else if (k === '--cle') a.cle = val();
    else if (k === '--type') a.type = val();
    else if (k === '--bucket-attendu') a.bucketAttendu = val();
    else throw new Error(`Refusé : option inconnue ${k}.`);
  }
  return a;
}

/** Clé d'un seul objet vidéo : sous videos/, sans « .. », sans joker, sans « / » final. */
export function cleValide(cle) {
  return typeof cle === 'string' && /^videos\/[A-Za-z0-9._\-/]+$/.test(cle) && !cle.includes('..') && !cle.includes('//') && !cle.endsWith('/');
}

/** Contrôles AVANT toute requête. Renvoie la configuration R2. Aucune valeur n'est mise dans les messages. */
export function verifier(args) {
  if (!cleValide(args.cle)) throw new Error('Refusé : --cle doit désigner UN objet sous videos/ (ex. videos/migration/1fc96ec7b3aa4bff.mp4).');
  if (!/^video\/[a-z0-9.+-]+$/i.test(args.type)) throw new Error('Refusé : --type doit être un type vidéo (ex. video/mp4).');
  if (!args.r2Env) throw new Error('Refusé : --r2-env <fichier> est obligatoire.');
  const chemin = path.resolve(args.r2Env);
  const rel = path.relative(REPO, chemin);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) throw new Error('Refusé : le fichier --r2-env doit être HORS du dépôt (ex. C:\\Secrets-Chay\\r2-migration.env).');
  if (!fs.existsSync(chemin)) throw new Error('Refusé : fichier --r2-env introuvable.');
  const env = readEnvFile(chemin);
  const manquantes = VARS.filter((k) => !env[k]);
  if (manquantes.length) throw new Error(`Refusé : variables absentes du fichier --r2-env : ${manquantes.join(', ')}.`);
  let endpoint;
  try { endpoint = new URL(env.R2_ENDPOINT); } catch { throw new Error('Refusé : R2_ENDPOINT invalide.'); }
  if (env.R2_BUCKET !== args.bucketAttendu) {
    throw new Error(`Refusé : le bucket du fichier --r2-env (« ${env.R2_BUCKET} ») n'est pas le bucket attendu (« ${args.bucketAttendu} »).`);
  }
  if (!isLocalHost(env.R2_ENDPOINT)) {
    if (!args.r2Reel) throw new Error('Refusé : point d\'accès R2 réel : ajoutez --r2-reel (faux S3 local seulement sans cette option).');
    if (endpoint.protocol !== 'https:') throw new Error('Refusé : R2_ENDPOINT doit être en https.');
  }
  return env;
}

const adressePublique = (env, cle) => `${env.R2_PUBLIC_BASE_URL.replace(/\/+$/, '')}/${cle.split('/').map(encodeURIComponent).join('/')}`;

function demanderConfirmation(attendu) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`Pour corriger, tapez exactement : ${attendu}\n> `, (r) => { rl.close(); resolve(String(r).trim() === attendu); });
  });
}

const typeDe = (t) => String(t || '').split(';')[0].trim().toLowerCase();

/**
 * Lit l'objet : HEAD (en-têtes de la liste blanche) puis GET signé « Range: bytes=0-0 » (taille réelle par
 * Content-Range, type et Content-Encoding sans compression à la volée).
 * @returns {Promise<{ status, type, taille: number|null, tailleHead: number|null, garder, encodageVu, encodageAvere, probleme }>}
 */
/**
 * Requête signée dont on ne garde que les EN-TÊTES : le corps est abandonné sans être lu ni décompressé
 * (un objet stocké avec Content-Encoding: gzip ferait sinon échouer la décompression d'un seul octet).
 */
async function entetes(env, method, cle, extra = {}) {
  const url = new URL(env.R2_ENDPOINT);
  const p = `/${env.R2_BUCKET}/${cle}`;
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const payloadHash = sha256Hex('');
  const h = { ...extra, host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const signedHeaders = Object.keys(h).sort().join(';');
  const { signature: sig, scope } = signature({ method, path: p, queryPairs: [], headers: h, signedHeaders, payloadHash, amzDate, region: env.R2_REGION || 'auto', service: 's3', secret: env.R2_SECRET_ACCESS_KEY });
  const { host: _host, ...sent } = h;
  const res = await fetch(`${url.origin}${uriEncode(p, true)}`, {
    method,
    headers: { ...sent, authorization: `AWS4-HMAC-SHA256 Credential=${env.R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}` },
  });
  await res.body?.cancel().catch(() => {});
  return { status: res.status, headers: res.headers, type: res.headers.get('content-type') || '' };
}

export async function lireObjet(env, cle) {
  const h = await entetes(env, 'HEAD', cle);
  if (h.status !== 200) return { status: h.status };
  const g = await entetes(env, 'GET', cle, { range: 'bytes=0-0' });
  const m = /^bytes 0-0\/(\d+)$/.exec(g.headers.get('content-range') || '');
  const taille = g.status === 206 && m ? Number(m[1]) : null;
  const encodageVu = h.headers.get('content-encoding') || '';
  const encodageAvere = g.status === 206 ? (g.headers.get('content-encoding') || '') : '';
  // Content-Length du HEAD : fiable seulement sans compression à la volée.
  const cl = h.headers.get('content-length');
  const tailleHead = cl !== null && !encodageVu ? Number(cl) : null;
  let probleme = '';
  if (!(Number.isSafeInteger(taille) && taille > 0)) probleme = `taille inconnue (lecture par plages : HTTP ${g.status}, Content-Range ${g.headers.get('content-range') ? 'illisible' : 'absent'})`;
  else if (tailleHead !== null && tailleHead !== taille) probleme = `tailles incohérentes (HEAD ${tailleHead}, Content-Range ${taille})`;
  const garder = {};
  for (const n of GARDER) { const v = h.headers.get(n); if (v) garder[n] = v; }
  for (const [n, v] of h.headers) if (n.startsWith('x-amz-meta-')) garder[n] = v;
  if (encodageAvere) garder['content-encoding'] = encodageAvere; // stocké sur l'objet : conservé tel quel
  return { status: 200, type: (g.status === 206 && g.type) || h.type, taille, tailleHead, garder, encodageVu, encodageAvere, probleme };
}

/**
 * Programme principal. `opts` (tests) : confirmer(attendu), log.
 * @returns {Promise<{ change: boolean, ok: boolean, avant, apres }>}
 */
export async function main(argv = process.argv.slice(2), opts = {}) {
  const log = opts.log || console.log;
  const args = parseArgs(argv);
  const env = verifier(args); // avant toute requête
  const url = adressePublique(env, args.cle);

  const avant = await lireObjet(env, args.cle);
  if (avant.status === 404) throw new Error(`objet introuvable : ${args.cle}`);
  if (avant.status !== 200) throw new Error(`lecture de l'objet impossible (HEAD : HTTP ${avant.status})`);
  log(`Objet : ${env.R2_BUCKET}/${args.cle}`);
  // Taille inconnue, nulle ou incohérente : rien n'est fait (la vérification finale ne pourrait rien prouver).
  if (avant.probleme) throw new Error(`Refusé : ${avant.probleme} ; aucune copie.`);
  const lectureAvant = await verifierLecture(url, avant.taille);
  log(`  taille : ${(avant.taille / 1024 / 1024).toFixed(1)} Mo (${avant.taille} octets, lue par Content-Range)`);
  log(`  Content-Type actuel : ${avant.type || '(absent)'} -> voulu : ${args.type}`);
  log(`  adresse publique : ${lectureAvant.ok ? 'lisible par plages (206)' : lectureAvant.raison}`);
  log(`  en-têtes conservés : ${Object.keys(avant.garder).length ? Object.keys(avant.garder).join(', ') : 'aucun'}`);
  if (avant.encodageAvere) log(`  ⚠ Content-Encoding « ${avant.encodageAvere} » STOCKÉ sur l'objet (avéré) : conservé tel quel.`);
  else if (avant.encodageVu) log(`  Content-Encoding « ${avant.encodageVu} » vu au HEAD seulement : compression à la volée de R2, absent de l'objet stocké, NON recopié.`);

  if (typeDe(avant.type) === args.type.toLowerCase()) {
    log('Rien à faire : le type est déjà le bon.');
    return { change: false, ok: lectureAvant.ok, avant, apres: avant };
  }
  if (avant.taille > MAX_COPIE) throw new Error('Refusé : objet de plus de 5 Gio (limite de CopyObject).');
  if (!args.appliquer) {
    log('SIMULATION : rien n\'est modifié (ajoutez --appliquer).');
    return { change: false, ok: false, avant, apres: avant };
  }

  const ok = await (opts.confirmer || demanderConfirmation)(`CORRIGER ${args.cle}`);
  if (!ok) throw new Error('Annulé : confirmation non reçue, rien n\'a été modifié.');

  const source = `/${env.R2_BUCKET}/${args.cle.split('/').map(encodeURIComponent).join('/')}`;
  const r = await s3(env, 'PUT', args.cle, [], '', {
    ...avant.garder,
    'content-type': args.type,
    'x-amz-copy-source': source,
    'x-amz-metadata-directive': 'REPLACE',
  });
  // S3 peut répondre 200 avec une erreur dans le corps : vérifier les deux.
  if (r.status !== 200 || /<Error>/.test(r.text) || !/<CopyObjectResult/.test(r.text)) throw new Error(`CopyObject : HTTP ${r.status}`);

  const apres = await lireObjet(env, args.cle);
  const lecture = await verifierLecture(url, avant.taille);
  const typeOk = apres.status === 200 && typeDe(apres.type) === args.type.toLowerCase();
  const tailleOk = apres.status === 200 && !apres.probleme && apres.taille === avant.taille;
  const encodageOk = apres.status === 200 && (apres.encodageAvere || '') === (avant.encodageAvere || '');
  log(`Vérification : HEAD ${apres.status}, type ${apres.type || '(absent)'} ${typeOk ? '✓' : '✗'}, taille ${tailleOk ? 'inchangée ✓' : `${apres.probleme || apres.taille} ✗`}, Content-Encoding ${encodageOk ? 'inchangé ✓' : 'modifié ✗'}, adresse publique ${lecture.ok ? '206 ✓' : `✗ ${lecture.raison}`}`);
  const toutOk = typeOk && tailleOk && encodageOk && lecture.ok;
  log(toutOk ? 'Fait : type corrigé, objet inchangé par ailleurs.' : 'ÉCHEC de la vérification : voir ci-dessus.');
  return { change: true, ok: toutOk, avant, apres };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((r) => { process.exitCode = r.ok || !r.change ? 0 : 1; }).catch((err) => {
    console.error(`Erreur : ${err.message}`);
    process.exitCode = 2;
  });
}
