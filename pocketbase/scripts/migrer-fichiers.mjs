#!/usr/bin/env node
// Migration des fichiers Base44 vers PocketBase (bloc 4). SIMULATION par défaut.
//
//   node pocketbase/scripts/migrer-fichiers.mjs                         # simulation (aucune écriture)
//   node pocketbase/scripts/migrer-fichiers.mjs --appliquer             # envoi + réécriture des adresses
//   options : --pb http://127.0.0.1:8090   serveur PocketBase (127.0.0.1 / localhost uniquement pour l'instant)
//             --base <adresse>             adresse publique écrite dans les enregistrements (défaut : --pb)
//             --avec-video --r2-env <fichier>   envoie aussi les vidéos MP4 (toutes tailles) vers R2 (sinon : reportées)
//             --r2-reel                    autorise le VRAI R2 (jour J). Exige --appliquer ET --avec-video ; le fichier
//                                          --r2-env doit être HORS du dépôt (ex. C:\Secrets-Chay\r2-migration.env) et son
//                                          R2_BUCKET doit être le bucket attendu ; résumé + confirmation à taper avant
//                                          tout envoi. Sans --r2-reel : faux S3 local (127.0.0.1) seulement, comme avant.
//             --bucket-attendu <nom>       bucket attendu avec --r2-reel (défaut : chay-videos)
//   Fichier --r2-env (noms) : R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE_URL,
//   R2_REGION (facultatif, auto). Ses valeurs ne sont jamais affichées ni écrites dans le rapport.
//             --heic-tel-quel              envoie les HEIC sans conversion si la conversion est impossible
//
// Entrées (hors dépôt) : C:\Export-Base44\fichiers.csv (entite;id;champ;hote;url) et
// fichiers-telecharges.csv (url;chemin_local;taille;sha256;statut), fichiers dans C:\Export-Base44\fichiers\.
// Sorties : C:\Export-Base44\_outil\pb\fichiers-correspondance.csv (ancienne -> nouvelle adresse) et
//           C:\Export-Base44\_outil\pb\migration-fichiers-rapport.md. La console n'affiche que des comptes.
//
// Règles : chaque fichier distinct (sha256) est envoyé UNE fois (réutilisé s'il existe déjà : champ sha256) ;
// TOUTE vidéo MP4 -> R2, quelle que soit sa taille (jamais dans PocketBase : sauvegardes petites) ;
// sinon Fichier (membre propriétaire, <= 15 Mo, image / audio) ou FichierAdmin (<= 100 Mo) ; HEIC converti en JPEG
// (codecs Windows) ; adresses R2 existantes NON réécrites (rapport) ; réécriture des champs simples et des
// listes (image_urls[i]) seulement si la valeur actuelle est encore l'ancienne adresse ; dates de mise à jour
// conservées (en-tête X-Chay-Conserver-Dates).
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { canonicalQuery, sha256Hex, signature, uriEncode } from '../tests/sigv4-node.mjs';

const EXPORT = process.env.EXPORT_BASE44 || 'C:\\Export-Base44';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const R2_VARS = ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_BASE_URL'];
const isLocalHost = (u) => ['127.0.0.1', 'localhost'].includes(new URL(u).hostname);
const OUT = path.join(EXPORT, '_outil', 'pb');
const HEIC_DIR = path.join(OUT, 'heic-jpeg');
const MIO = 1024 * 1024;
const MEMBER_ENTITIES = new Set(['User', 'MemberProfile', 'CommunityPost', 'Message', 'PlaylistItem']);
const MEMBER_TYPES = new Set(['jpg', 'png', 'webp', 'gif', 'heic', 'mp3']);

// ── Arguments ────────────────────────────────────────────────────────────────
export function parseArgs(argv) {
  const a = { appliquer: false, pb: 'http://127.0.0.1:8090', base: null, avecVideo: false, r2Env: null, heicTelQuel: false, r2Reel: false, bucketAttendu: 'chay-videos' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--appliquer') a.appliquer = true;
    else if (k === '--avec-video') a.avecVideo = true;
    else if (k === '--heic-tel-quel') a.heicTelQuel = true;
    else if (k === '--pb') a.pb = argv[++i];
    else if (k === '--base') a.base = argv[++i];
    else if (k === '--r2-env') a.r2Env = argv[++i];
    else if (k === '--r2-reel') a.r2Reel = true;
    else if (k === '--bucket-attendu') a.bucketAttendu = argv[++i];
    else throw new Error(`option inconnue : ${k}`);
  }
  a.pb = String(a.pb).replace(/\/+$/, '');
  a.base = String(a.base || a.pb).replace(/\/+$/, '');
  if (!['127.0.0.1', 'localhost'].includes(new URL(a.pb).hostname)) {
    throw new Error('Refusé : pour l’instant, seul le bac à sable local (127.0.0.1) est autorisé.');
  }
  return a;
}

// ── Lecture de l'export ──────────────────────────────────────────────────────
const readCsv = (file) => fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split(';'));

/** Type réel d'après les premiers octets. */
export function detectType(buf) {
  const h = buf.subarray(0, 16);
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return 'jpg';
  if (h.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png';
  if (h.toString('latin1', 0, 4) === 'RIFF' && h.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (h.toString('latin1', 0, 3) === 'GIF') return 'gif';
  if (h.toString('latin1', 4, 8) === 'ftyp') {
    const brand = h.toString('latin1', 8, 12);
    if (/^(heic|heix|hevc|mif1|msf1)$/.test(brand)) return 'heic';
    return 'mp4';
  }
  if (h.toString('latin1', 0, 3) === 'ID3' || (h[0] === 0xff && (h[1] & 0xe0) === 0xe0)) return 'mp3';
  if (h.toString('latin1', 0, 5) === '%PDF-') return 'pdf';
  return 'inconnu';
}

/** Champ « image_urls[2] » -> { name: 'image_urls', index: 2 } ; « avatar_url » -> { name, index: null }. */
export function parseField(champ) {
  const m = /^([A-Za-z0-9_]+)\[(\d+)\]$/.exec(champ);
  return m ? { name: m[1], index: Number(m[2]) } : { name: champ, index: null };
}

export function loadExport() {
  const refs = readCsv(path.join(EXPORT, 'fichiers.csv')).map(([entite, id, champ, hote, url]) => ({ entite, id, champ, hote, url }));
  const dl = new Map(readCsv(path.join(EXPORT, 'fichiers-telecharges.csv')).map(([url, chemin, taille, sha, statut]) => [url, { chemin, taille: Number(taille), sha, statut }]));
  const files = new Ref();
  const r2 = [];
  const appLinks = [];
  const problems = [];
  for (const r of refs) {
    if (/\.r2\.cloudflarestorage\.com$/.test(r.hote)) { r2.push(r); continue; }
    if (r.hote !== 'base44.app') { appLinks.push(r); continue; }
    const d = dl.get(r.url);
    if (!d || !d.sha || !d.chemin || !fs.existsSync(d.chemin)) { problems.push({ ...r, probleme: 'fichier local absent' }); continue; }
    files.add(d.sha, d, r);
  }
  return { refs, r2, appLinks, problems, files: files.map };
}

class Ref {
  constructor() { this.map = new Map(); }
  add(sha, d, ref) {
    if (!this.map.has(sha)) this.map.set(sha, { sha, chemin: d.chemin, taille: d.taille, urls: new Set(), refs: [] });
    const f = this.map.get(sha);
    f.urls.add(ref.url);
    f.refs.push(ref);
  }
}

// ── HEIC -> JPEG (codecs Windows, sinon heic-convert ; aucun accès réseau) ─────────────────
export function convertHeic(src, sha) {
  fs.mkdirSync(HEIC_DIR, { recursive: true });
  const dst = path.join(HEIC_DIR, `${sha}.jpg`);
  if (fs.existsSync(dst)) return { ok: true, chemin: dst, via: 'déjà converti (ou fourni à la main)' };
  const ps = [
    'Add-Type -AssemblyName PresentationCore',
    `$fs=[IO.File]::OpenRead('${src.replace(/'/g, "''")}')`,
    '$d=[Windows.Media.Imaging.BitmapDecoder]::Create($fs,[Windows.Media.Imaging.BitmapCreateOptions]::None,[Windows.Media.Imaging.BitmapCacheOption]::OnLoad)',
    '$e=New-Object Windows.Media.Imaging.JpegBitmapEncoder; $e.QualityLevel=90',
    '$e.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($d.Frames[0]))',
    `$o=[IO.File]::Create('${dst.replace(/'/g, "''")}'); $e.Save($o); $o.Close(); $fs.Close()`,
  ].join('; ');
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'pipe', timeout: 60000 });
    if (fs.existsSync(dst) && detectType(fs.readFileSync(dst)) === 'jpg') return { ok: true, chemin: dst, via: 'codecs Windows' };
  } catch { /* codec HEVC absent */ }
  fs.rmSync(dst, { force: true });
  // Repli : paquet npm heic-convert (libheif en WebAssembly, hors ligne), installé HORS du dépôt
  // (npm install heic-convert@2 dans HEIC_CONVERT_DIR). Le JPEG produit ne contient pas d'EXIF (ni GPS).
  const dir = process.env.HEIC_CONVERT_DIR || 'C:\\Export-Base44\\_outil\\heic-convert';
  if (fs.existsSync(path.join(dir, 'node_modules', 'heic-convert'))) {
    const js = "const fs=require('fs');require('heic-convert')({buffer:fs.readFileSync(process.argv[1]),format:'JPEG',quality:0.9})"
      + '.then((o)=>fs.writeFileSync(process.argv[2],Buffer.from(o))).catch(()=>process.exit(1))';
    try {
      execFileSync(process.execPath, ['-e', js, src, dst], { cwd: dir, stdio: 'pipe', timeout: 120000 });
      if (fs.existsSync(dst) && detectType(fs.readFileSync(dst)) === 'jpg') return { ok: true, chemin: dst, via: 'heic-convert (hors ligne)' };
    } catch { /* conversion impossible */ }
    fs.rmSync(dst, { force: true });
  }
  return { ok: false, chemin: null, via: `conversion impossible : installer heic-convert dans ${dir} ou déposer le JPEG dans ${HEIC_DIR}\\${sha}.jpg` };
}

// ── PocketBase (superuser) ───────────────────────────────────────────────────
function superuserCreds() {
  if (process.env.PB_SU_EMAIL && process.env.PB_SU_PASSWORD) return { email: process.env.PB_SU_EMAIL, password: process.env.PB_SU_PASSWORD };
  const line = fs.readFileSync(process.env.PB_TEST_CREDENTIALS || 'C:\\PB-local\\identifiants-test.txt', 'utf8').split(/\r?\n/).find((l) => l.startsWith('superuser\t'));
  const [, email, password] = line.split('\t');
  return { email, password };
}

export async function pbClient(pbUrl) {
  const call = async (method, p, body, extraHeaders = {}) => {
    const isForm = body instanceof FormData;
    const res = await fetch(pbUrl + p, {
      method,
      headers: { ...(isForm || body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(call.token ? { Authorization: call.token } : {}), ...extraHeaders },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    return { status: res.status, data };
  };
  const c = superuserCreds();
  const auth = await call('POST', '/api/collections/_superusers/auth-with-password', { identity: c.email, password: c.password });
  if (auth.status !== 200) throw new Error(`connexion superuser impossible (HTTP ${auth.status})`);
  call.token = auth.data.token;
  return call;
}

const collectionOf = (entite) => (entite === 'User' ? 'users' : entite);

// ── R2 : envoi multipart depuis le script (node:crypto) ──────────────────────
export function readEnvFile(file) {
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

/**
 * Configuration R2 lue et contrôlée AVANT toute connexion ou tout envoi. Renvoie null sans --avec-video.
 * Sans --r2-reel : faux S3 local seulement (comportement d'origine). Avec --r2-reel : --appliquer et --avec-video
 * exigés, fichier hors du dépôt, variables complètes, bucket = bucket attendu. Aucune valeur n'est jamais affichée.
 */
export function verifierR2(args) {
  if (!args.avecVideo) {
    if (args.r2Reel) throw new Error('Refusé : --r2-reel exige --appliquer et --avec-video.');
    return null;
  }
  if (!args.r2Env) throw new Error('Refusé : --avec-video exige --r2-env <fichier>.');
  if (args.r2Reel && !args.appliquer) throw new Error('Refusé : --r2-reel exige --appliquer et --avec-video.');
  const chemin = path.resolve(args.r2Env);
  if (args.r2Reel) {
    const rel = path.relative(REPO, chemin);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) throw new Error('Refusé : le fichier --r2-env doit être HORS du dépôt (ex. C:\\Secrets-Chay\\r2-migration.env).');
  }
  if (!fs.existsSync(chemin)) throw new Error('Refusé : fichier --r2-env introuvable.');
  const env = readEnvFile(chemin);
  const manquantes = R2_VARS.filter((k) => !env[k]);
  if (manquantes.length) throw new Error(`Refusé : variables absentes du fichier --r2-env : ${manquantes.join(', ')}.`);
  let endpoint;
  try { endpoint = new URL(env.R2_ENDPOINT); } catch { throw new Error('Refusé : R2_ENDPOINT invalide.'); }
  if (!args.r2Reel) {
    if (!isLocalHost(env.R2_ENDPOINT)) throw new Error('Refusé : R2 réel non autorisé sans --r2-reel (faux S3 local seulement).');
    return env;
  }
  if (env.R2_BUCKET !== args.bucketAttendu) {
    throw new Error(`Refusé : le bucket du fichier --r2-env (« ${env.R2_BUCKET} ») n'est pas le bucket attendu (« ${args.bucketAttendu} »).`);
  }
  if (endpoint.protocol !== 'https:' && !isLocalHost(env.R2_ENDPOINT)) throw new Error('Refusé : R2_ENDPOINT doit être en https.');
  return env;
}

/** Demande de taper exactement `attendu` (lecture du clavier). */
export function demanderConfirmation(attendu) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`Pour envoyer, tapez exactement : ${attendu}\n> `, (reponse) => {
      rl.close();
      resolve(String(reponse).trim() === attendu);
    });
  });
}

async function s3(env, method, key, query, body) {
  const url = new URL(env.R2_ENDPOINT);
  const p = `/${env.R2_BUCKET}/${key}`;
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const payloadHash = sha256Hex(body ?? '');
  const h = { host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const signedHeaders = Object.keys(h).sort().join(';');
  const { signature: sig, scope } = signature({ method, path: p, queryPairs: query, headers: h, signedHeaders, payloadHash, amzDate, region: env.R2_REGION || 'auto', service: 's3', secret: env.R2_SECRET_ACCESS_KEY });
  const qs = canonicalQuery(query);
  const res = await fetch(`${url.origin}${uriEncode(p, true)}${qs ? `?${qs}` : ''}`, {
    method,
    // GET / HEAD : aucun corps (fetch le refuse, même vide) ; la signature porte sur le corps vide.
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
    headers: { 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, authorization: `AWS4-HMAC-SHA256 Credential=${env.R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}` },
  });
  return { status: res.status, text: await res.text(), etag: (res.headers.get('etag') || '').replace(/"/g, ''), length: Number(res.headers.get('content-length') || -1) };
}

/**
 * Envoie un fichier local vers R2 en multipart (parts de 16 Mo lues une à une). Renvoie l'adresse publique.
 * `reel` : autorise un point d'accès qui n'est pas local (vrai R2), seulement après verifierR2 + confirmation.
 * `apresPart` : appelé après chaque part (tests : simuler une interruption). En cas d'erreur, l'envoi multipart
 * est abandonné (aucune part orpheline) ; relancer le script reprend ce fichier depuis le début.
 */
export async function envoyerVersR2(env, chemin, key, { reel = false, apresPart = null } = {}) {
  if (!reel && !isLocalHost(env.R2_ENDPOINT)) throw new Error('Refusé : R2 réel non autorisé sans --r2-reel (faux S3 local seulement).');
  const size = fs.statSync(chemin).size;
  const partSize = 16 * MIO;
  const init = await s3(env, 'POST', key, [['uploads', '']], '');
  const uploadId = /<UploadId>([^<]+)/.exec(init.text)?.[1];
  if (init.status !== 200 || !uploadId) throw new Error(`CreateMultipartUpload : HTTP ${init.status}`);
  const fd = fs.openSync(chemin, 'r');
  const parts = [];
  try {
    for (let n = 1, off = 0; off < size; n++, off += partSize) {
      const buf = Buffer.alloc(Math.min(partSize, size - off));
      fs.readSync(fd, buf, 0, buf.length, off);
      const r = await s3(env, 'PUT', key, [['partNumber', String(n)], ['uploadId', uploadId]], buf);
      if (r.status !== 200 || !r.etag) throw new Error(`UploadPart ${n} : HTTP ${r.status}`);
      parts.push({ n, etag: r.etag });
      if (apresPart) await apresPart(n);
    }
  } catch (err) {
    await s3(env, 'DELETE', key, [['uploadId', uploadId]], '');
    throw err;
  } finally {
    fs.closeSync(fd);
  }
  const xml = `<CompleteMultipartUpload>${parts.map((p) => `<Part><PartNumber>${p.n}</PartNumber><ETag>"${p.etag}"</ETag></Part>`).join('')}</CompleteMultipartUpload>`;
  const done = await s3(env, 'POST', key, [['uploadId', uploadId]], xml);
  if (done.status !== 200 || /<Error>/.test(done.text)) throw new Error(`CompleteMultipartUpload : HTTP ${done.status}`);
  return `${env.R2_PUBLIC_BASE_URL.replace(/\/+$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

// ── Plan ─────────────────────────────────────────────────────────────────────
/** Décide la destination de chaque fichier distinct, d'après ses références et les enregistrements actuels. */
export async function plan(pb, exp, args) {
  const records = new Map(); // "col/id" -> enregistrement (ou null)
  for (const f of exp.files.values()) {
    for (const r of f.refs) {
      const k = `${collectionOf(r.entite)}/${r.id}`;
      if (!records.has(k)) {
        const got = await pb('GET', `/api/collections/${collectionOf(r.entite)}/records/${r.id}`);
        records.set(k, got.status === 200 ? got.data : null);
      }
    }
  }
  const items = [];
  for (const f of exp.files.values()) {
    const head = Buffer.alloc(16);
    const fd = fs.openSync(f.chemin, 'r');
    fs.readSync(fd, head, 0, 16, 0);
    fs.closeSync(fd);
    const type = detectType(head);
    const owners = new Set(f.refs.map((r) => {
      const rec = records.get(`${collectionOf(r.entite)}/${r.id}`);
      if (!rec) return '';
      const o = r.entite === 'User' ? rec.id : rec.created_by_id;
      return /^[a-f0-9]{24}$/.test(o || '') ? o : '';
    }));
    const owner = owners.size === 1 ? [...owners][0] : '';
    const item = { ...f, type, owner, source: f.chemin, statut: 'à envoyer', destination: '' };
    if (type === 'heic') {
      const c = convertHeic(f.chemin, f.sha);
      item.heic = c.via;
      if (c.ok) { item.source = c.chemin; item.type = 'jpg'; } else if (!args.heicTelQuel) item.statut = 'HEIC non converti (adresse non réécrite)';
    }
    const size = fs.statSync(item.source).size;
    if (item.type === 'mp4' || size > 100 * MIO) {
      item.destination = 'R2';
      if (item.type !== 'mp4') item.statut = 'trop gros et pas une vidéo';
      else if (!args.avecVideo) item.statut = 'reporté (vidéo : --avec-video au basculement)';
    } else {
      const memberOnly = f.refs.every((r) => MEMBER_ENTITIES.has(r.entite));
      item.destination = memberOnly && owner && size <= 15 * MIO && MEMBER_TYPES.has(item.type) ? 'Fichier' : 'FichierAdmin';
      if (item.destination === 'FichierAdmin') {
        item.raison = !memberOnly ? 'utilisé par du contenu publié' : !owner ? (owners.size > 1 ? 'plusieurs propriétaires' : 'propriétaire inconnu') : size > 15 * MIO ? 'plus de 15 Mo' : 'type réservé aux admins';
      }
    }
    if (item.type === 'inconnu') item.statut = 'type inconnu (adresse non réécrite)';
    item.tailleEnvoyee = size;
    items.push(item);
  }
  return { items, records };
}

// ── Envoi et réécriture ──────────────────────────────────────────────────────
async function envoyer(pb, item, args, r2env) {
  if (item.destination === 'R2') {
    const key = `videos/migration/${item.sha.slice(0, 16)}.mp4`;
    // Relance : objet déjà complet (même taille) -> réutilisé, rien n'est renvoyé.
    const head = await s3(r2env, 'HEAD', key, [], '');
    if (head.status === 200 && head.length === fs.statSync(item.source).size) {
      return { url: `${r2env.R2_PUBLIC_BASE_URL.replace(/\/+$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`, id: key, reutilise: true };
    }
    return { url: await envoyerVersR2(r2env, item.source, key, { reel: args.r2Reel, apresPart: args.apresPart || null }), id: key };
  }
  for (const col of ['Fichier', 'FichierAdmin']) {
    const found = await pb('GET', `/api/collections/${col}/records?filter=${encodeURIComponent(`sha256 = "${item.sha}"`)}&perPage=1`);
    const rec = found.data?.items?.[0];
    if (rec) return { url: `${args.base}/api/files/${rec.collectionId}/${rec.id}/${rec.fichier}`, id: rec.id, reutilise: true };
  }
  const form = new FormData();
  form.append('fichier', new Blob([fs.readFileSync(item.source)]), `migration.${item.type}`);
  form.append('sha256', item.sha);
  form.append('usage', 'migration');
  if (item.owner) form.append('proprietaire', item.owner);
  const res = await pb('POST', `/api/collections/${item.destination}/records`, form);
  if (res.status !== 200) throw new Error(`envoi refusé par PocketBase (HTTP ${res.status} ${Object.keys(res.data?.data || {}).join(',')})`);
  return { url: `${args.base}/api/files/${res.data.collectionId}/${res.data.id}/${res.data.fichier}`, id: res.data.id };
}

/** Réécrit les champs : renvoie { modifies, deja, differents, absents }. */
export async function reecrire(pb, refs, mapping, records) {
  const out = { modifies: 0, deja: 0, differents: 0, absents: 0, enregistrements: 0 };
  const byRecord = new Map();
  for (const r of refs) {
    if (!mapping.has(r.url)) continue;
    const k = `${collectionOf(r.entite)}/${r.id}`;
    if (!byRecord.has(k)) byRecord.set(k, []);
    byRecord.get(k).push(r);
  }
  for (const [k, list] of byRecord) {
    const [col, id] = k.split('/');
    const fresh = await pb('GET', `/api/collections/${col}/records/${id}`);
    if (fresh.status !== 200) { out.absents += list.length; continue; }
    const rec = fresh.data;
    const patch = {};
    for (const r of list) {
      const { name, index } = parseField(r.champ);
      const nouvelle = mapping.get(r.url);
      if (index === null) {
        const cur = patch[name] ?? rec[name];
        if (cur === r.url) patch[name] = nouvelle;
        else if (cur === nouvelle) out.deja++;
        else out.differents++;
      } else {
        const arr = Array.isArray(patch[name]) ? patch[name] : Array.isArray(rec[name]) ? [...rec[name]] : null;
        const pos = arr ? (arr[index] === r.url ? index : arr.indexOf(r.url)) : -1;
        if (pos >= 0) { arr[pos] = nouvelle; patch[name] = arr; } else if (arr && arr.includes(nouvelle)) out.deja++;
        else out.differents++;
      }
    }
    const changed = Object.keys(patch).length;
    if (!changed) continue;
    const res = await pb('PATCH', `/api/collections/${col}/records/${id}`, patch, { 'X-Chay-Conserver-Dates': '1' });
    if (res.status !== 200) throw new Error(`réécriture refusée (${col}, HTTP ${res.status})`);
    out.enregistrements++;
    for (const r of list) {
      const { name, index } = parseField(r.champ);
      const v = res.data[name];
      if ((index === null && v === mapping.get(r.url)) || (index !== null && Array.isArray(v) && v.includes(mapping.get(r.url)))) out.modifies++;
    }
    records.set(k, res.data);
  }
  return out;
}

// ── Rapport ──────────────────────────────────────────────────────────────────
function rapport({ args, exp, items, mapping, rw, verif }) {
  const count = (pred) => items.filter(pred).length;
  const L = ['# Migration des fichiers Base44 -> PocketBase', '',
    `Mode : **${args.appliquer ? 'application' : 'simulation (rien écrit)'}** — serveur : \`${args.pb}\` — adresse publique : \`${args.base}\` — ${new Date().toISOString()}`, '',
    '## Comptes', '', '| Élément | Nombre |', '|---|---|',
    `| Références de fichiers dans l’export | ${exp.refs.length} |`,
    `| … vers base44.app (à migrer) | ${exp.refs.length - exp.r2.length - exp.appLinks.length} |`,
    `| … vers R2 (non réécrites) | ${exp.r2.length} |`,
    `| … liens vers l’app dans un texte (non modifiés) | ${exp.appLinks.length} |`,
    `| Fichiers distincts (sha256) | ${items.length} |`,
    `| → Fichier (membre propriétaire) | ${count((i) => i.destination === 'Fichier')} |`,
    `| → FichierAdmin | ${count((i) => i.destination === 'FichierAdmin')} |`,
    `| → R2 (toutes les vidéos MP4) | ${count((i) => i.destination === 'R2')} |`,
    `| Non envoyés (voir statut) | ${count((i) => i.statut !== 'à envoyer' && i.statut !== 'envoyé' && i.statut !== 'réutilisé')} |`,
    `| Fichiers locaux absents | ${exp.problems.length} |`, ''];
  if (rw) {
    L.push('## Réécriture des adresses', '', '| Résultat | Nombre |', '|---|---|',
      `| Champs réécrits | ${rw.modifies} |`, `| Enregistrements modifiés | ${rw.enregistrements} |`,
      `| Déjà à la nouvelle adresse | ${rw.deja} |`, `| Valeur actuelle différente (non touchée) | ${rw.differents} |`,
      `| Enregistrement absent de PocketBase | ${rw.absents} |`, '');
  }
  if (verif) L.push('## Vérification', '', `Nouvelles adresses lisibles et identiques à l’original (sha256) : **${verif.ok} / ${verif.total}**`, '');
  L.push('## Fichiers', '', '| sha256 (début) | Type | Taille | Références | Destination | Statut |', '|---|---|---|---|---|---|');
  for (const i of items) L.push(`| ${i.sha.slice(0, 12)} | ${i.type} | ${(i.tailleEnvoyee / MIO).toFixed(1)} Mo | ${i.refs.length} | ${i.destination}${i.raison ? ` (${i.raison})` : ''} | ${i.statut}${i.heic ? ` — HEIC : ${i.heic}` : ''} |`);
  L.push('', '## Adresses R2 existantes (non réécrites)', '',
    'Elles visent le point d’accès S3 de R2 (`*.r2.cloudflarestorage.com`), qui exige une signature : sans domaine public, elles ne se lisent probablement pas. À vérifier avec les vraies clés, puis réécrire vers le domaine public du bucket.', '',
    '| Entité | Enregistrement | Champ | Clé (bucket/objet) |', '|---|---|---|---|');
  for (const r of exp.r2) {
    const u = new URL(r.url);
    L.push(`| ${r.entite} | ${r.id} | ${r.champ} | \`${decodeURIComponent(u.pathname.slice(1))}\` |`);
  }
  if (exp.appLinks.length) {
    L.push('', '## Liens vers l’app dans des textes (non modifiés)', '', '| Entité | Enregistrement | Champ | Hôte |', '|---|---|---|---|');
    for (const r of exp.appLinks) L.push(`| ${r.entite} | ${r.id} | ${r.champ} | ${r.hote} |`);
  }
  fs.writeFileSync(path.join(OUT, 'migration-fichiers-rapport.md'), `${L.join('\n')}\n`);
  if (mapping) {
    const rows = ['ancienne;nouvelle'];
    for (const [a, b] of mapping) rows.push(`${a};${b}`);
    fs.writeFileSync(path.join(OUT, 'fichiers-correspondance.csv'), `\uFEFF${rows.join('\n')}\n`);
  }
}

// ── Programme principal ──────────────────────────────────────────────────────
export async function main(argv, opts = {}) {
  const args = parseArgs(argv);
  if (opts.apresPart) args.apresPart = opts.apresPart;
  const r2env = verifierR2(args); // avant toute connexion et tout envoi
  const exp = loadExport();
  const pb = await pbClient(args.pb);
  const { items, records } = await plan(pb, exp, args);
  console.log(`Références : ${exp.refs.length} (base44.app ${exp.refs.length - exp.r2.length - exp.appLinks.length}, R2 ${exp.r2.length}, liens d’app ${exp.appLinks.length}) ; fichiers distincts : ${items.length}`);
  console.log(`Destinations : Fichier ${items.filter((i) => i.destination === 'Fichier').length}, FichierAdmin ${items.filter((i) => i.destination === 'FichierAdmin').length}, R2 ${items.filter((i) => i.destination === 'R2').length}`);
  console.log(`HEIC : ${items.filter((i) => i.heic).length} (${items.filter((i) => i.heic && i.type === 'jpg').length} convertis en JPEG)`);
  let mapping = null;
  let rw = null;
  let verif = null;
  if (args.appliquer && args.r2Reel) {
    // Résumé puis confirmation à taper : rien n'est envoyé avant.
    const aEnvoyer = items.filter((i) => i.statut === 'à envoyer');
    const enR2 = aEnvoyer.filter((i) => i.destination === 'R2');
    const mo = (list) => (list.reduce((t, i) => t + (i.tailleEnvoyee || 0), 0) / MIO).toFixed(1);
    console.log('');
    console.log('──── R2 RÉEL : résumé avant envoi ────');
    console.log(`PocketBase : ${args.pb} (adresses écrites : ${args.base})`);
    console.log(`Fichiers à envoyer : ${aEnvoyer.length} (${mo(aEnvoyer)} Mo), dont vers R2 : ${enR2.length} (${mo(enR2)} Mo)`);
    console.log(`Bucket R2 : ${r2env.R2_BUCKET}`);
    const ok = await (opts.confirmer || demanderConfirmation)(`ENVOYER ${r2env.R2_BUCKET}`);
    if (!ok) throw new Error('Annulé : confirmation non reçue, rien n’a été envoyé.');
  }
  if (args.appliquer) {
    mapping = new Map();
    for (const item of items.filter((i) => i.statut === 'à envoyer')) {
      try {
        const sent = await envoyer(pb, item, args, r2env);
        item.statut = sent.reutilise ? 'réutilisé' : 'envoyé';
        item.nouvelle = sent.url;
        for (const u of item.urls) mapping.set(u, sent.url);
      } catch (err) {
        item.statut = `échec : ${err.message}`;
      }
    }
    rw = await reecrire(pb, exp.refs, mapping, records);
    // Vérification : chaque nouvelle adresse (PocketBase ou R2 publique) se lit et a le contenu d'origine
    // (ou le JPEG converti).
    verif = { ok: 0, total: 0 };
    for (const item of items.filter((i) => i.nouvelle)) {
      verif.total++;
      const local = item.destination === 'R2' || args.base === args.pb ? item.nouvelle : item.nouvelle.replace(args.base, args.pb);
      const res = await fetch(local);
      const buf = Buffer.from(await res.arrayBuffer());
      if (res.status === 200 && crypto.createHash('sha256').update(buf).digest('hex') === crypto.createHash('sha256').update(fs.readFileSync(item.source)).digest('hex')) verif.ok++;
    }
    console.log(`Envoyés : ${items.filter((i) => i.statut === 'envoyé').length}, réutilisés : ${items.filter((i) => i.statut === 'réutilisé').length}, échecs : ${items.filter((i) => i.statut.startsWith('échec')).length}`);
    console.log(`Réécriture : ${rw.modifies} champs dans ${rw.enregistrements} enregistrements ; déjà faits ${rw.deja} ; différents ${rw.differents} ; absents ${rw.absents}`);
    console.log(`Vérification : ${verif.ok} / ${verif.total} adresses lisibles et identiques`);
  }
  rapport({ args, exp, items, mapping, rw, verif });
  console.log(`Rapport : ${path.join(OUT, 'migration-fichiers-rapport.md')}${mapping ? ` ; correspondances : ${path.join(OUT, 'fichiers-correspondance.csv')}` : ''}`);
  return { exp, items, mapping, rw, verif };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`Erreur : ${err.message}`);
    process.exitCode = 1;
  });
}
