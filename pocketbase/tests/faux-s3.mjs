#!/usr/bin/env node
// FAUX serveur S3 local (bac à sable) : simule Cloudflare R2 pour le téléversement multipart.
// - écoute 127.0.0.1:9000 uniquement ; stockage dans C:\PB-local\faux-s3 (hors dépôt) ;
// - clés dans C:\PB-local\faux-s3.env (créées au premier lancement, jamais affichées) ;
// - REFUSE toute requête mal signée (SigV4 recalculée avec node:crypto : en-tête Authorization
//   ou URL présignée, date, expiration, région, clé d'accès, empreinte du corps) ;
// - opérations : CreateMultipartUpload, UploadPart, ListParts, CompleteMultipartUpload,
//   AbortMultipartUpload, ListMultipartUploads, GetObject / HeadObject (Range), DeleteObject,
//   CopyObject (x-amz-copy-source, x-amz-metadata-directive COPY / REPLACE, 5 Gio au plus) ;
// - comme R2 : objet créé sans Content-Type -> « application/octet-stream » ; en-têtes de copie à signer ;
// - outils de TEST (requêtes signées) : POST /<bucket>/_faux/echec-complete?fois=N,
//   /_faux/echec-copie?fois=N, /_faux/sans-plages?actif=1|0 (lecture sans Range ni Accept-Ranges),
//   /_faux/compression?actif=1|0 (comme R2 : type texte + « Accept-Encoding: gzip » sans Range -> réponse
//   compressée à la volée, « Content-Encoding: gzip », SANS Content-Length, y compris au HEAD),
//   /_faux/sans-taille?actif=1|0 (aucune taille annoncée : ni Content-Length ni Content-Range, Range ignoré) ;
// - CopyObject REPLACE conserve les en-têtes fournis : Cache-Control, Content-Disposition, Content-Language,
//   Content-Encoding (STOCKÉ, renvoyé sur toutes les réponses, y compris 206) et x-amz-meta-* ;
// - lecture publique non signée sous /public/<bucket>/<clé> (simule le domaine public R2) ;
// - CORS avec ETag exposé (comme la configuration R2 à prévoir).
// Lancement : node pocketbase/tests/faux-s3.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';
import { loadFauxS3Env, sha256Hex, signature } from './sigv4-node.mjs';

const env = loadFauxS3Env();
const endpoint = new URL(env.R2_ENDPOINT);
if (endpoint.hostname !== '127.0.0.1') {
  console.error('Refusé : le faux S3 n’écoute que sur 127.0.0.1.');
  process.exit(2);
}
const DIR = process.env.FAUX_S3_DIR || 'C:\\PB-local\\faux-s3';
const OBJECTS = path.join(DIR, 'objects');
const UPLOADS = path.join(DIR, 'uploads');
fs.mkdirSync(OBJECTS, { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });

const MIN_PART = 5 * 1024 * 1024;
const MAX_COPY = 5 * 1024 * 1024 * 1024; // CopyObject : 5 Gio au plus (comme S3 / R2)
// Pannes simulées (outils de test, en mémoire) : remises à zéro au redémarrage.
const FAUX = { echecComplete: 0, echecCopie: 0, sansPlages: false, compression: false, sansTaille: false };
const ENTETES_COPIE = ['cache-control', 'content-disposition', 'content-language', 'content-encoding'];
const COMPRESSIBLE = /^(text\/|application\/(json|xml|javascript))/i;
const MAX_SKEW_MS = 15 * 60 * 1000;
const TYPES = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska' };

// ── Utilitaires ──────────────────────────────────────────────────────────────
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const objFile = (key) => path.join(OBJECTS, crypto.createHash('sha1').update(key).digest('hex'));
const uploadDir = (id) => path.join(UPLOADS, id.replace(/[^A-Za-z0-9]/g, ''));
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const parseAmzDate = (s) => (/^\d{8}T\d{6}Z$/.test(s || '') ? Date.parse(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`) : NaN);

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,HEAD');
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || '*');
  res.setHeader('Access-Control-Expose-Headers', 'ETag');
  res.setHeader('Access-Control-Max-Age', '600');
}

function send(res, status, xml, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/xml', ...headers });
  res.end(xml ? `<?xml version="1.0" encoding="UTF-8"?>\n${xml}` : undefined);
}
const s3Error = (res, status, code, message) => send(res, status, `<Error><Code>${code}</Code><Message>${xmlEsc(message)}</Message></Error>`);

async function readBody(req, max = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > max) throw Object.assign(new Error('corps trop gros'), { code: 'EntityTooLarge' });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

/** Query brute -> paires décodées (sans transformer « + » en espace, comme S3). */
function queryPairs(rawQuery) {
  if (!rawQuery) return [];
  return rawQuery.split('&').filter(Boolean).map((p) => {
    const i = p.indexOf('=');
    const k = i < 0 ? p : p.slice(0, i);
    const v = i < 0 ? '' : p.slice(i + 1);
    return [decodeURIComponent(k), decodeURIComponent(v)];
  });
}

// ── Vérification SigV4 ───────────────────────────────────────────────────────
/** Renvoie { payloadHash } si la signature est valide, sinon lève { status, code, message }. */
function verify(req, decodedPath, pairs) {
  const deny = (code, message, status = 403) => { throw { status, code, message }; };
  const q = Object.fromEntries(pairs);
  let accessKey, scopeDate, region, service, signedHeaders, given, amzDate, payloadHash, signPairs;

  if (q['X-Amz-Signature']) {
    if (q['X-Amz-Algorithm'] !== 'AWS4-HMAC-SHA256') deny('AuthorizationQueryParametersError', 'algorithme invalide', 400);
    [accessKey, scopeDate, region, service] = String(q['X-Amz-Credential'] || '').split('/');
    signedHeaders = q['X-Amz-SignedHeaders'] || '';
    given = q['X-Amz-Signature'];
    amzDate = q['X-Amz-Date'];
    const expires = Number(q['X-Amz-Expires']);
    if (!Number.isInteger(expires) || expires < 1 || expires > 604800) deny('AuthorizationQueryParametersError', 'X-Amz-Expires invalide', 400);
    const t = parseAmzDate(amzDate);
    if (Number.isNaN(t)) deny('AccessDenied', 'X-Amz-Date invalide');
    if (Date.now() > t + expires * 1000) deny('AccessDenied', 'Request has expired');
    if (t - Date.now() > MAX_SKEW_MS) deny('RequestTimeTooSkewed', 'date dans le futur');
    payloadHash = 'UNSIGNED-PAYLOAD';
    signPairs = pairs.filter(([k]) => k !== 'X-Amz-Signature');
  } else {
    const auth = req.headers.authorization || '';
    const m = /^AWS4-HMAC-SHA256 Credential=([^,]+), ?SignedHeaders=([^,]+), ?Signature=([0-9a-f]{64})$/.exec(auth);
    if (!m) deny('AccessDenied', 'signature absente ou mal formée');
    [accessKey, scopeDate, region, service] = m[1].split('/');
    signedHeaders = m[2];
    given = m[3];
    amzDate = req.headers['x-amz-date'];
    const t = parseAmzDate(amzDate);
    if (Number.isNaN(t)) deny('AccessDenied', 'x-amz-date invalide');
    if (Math.abs(Date.now() - t) > MAX_SKEW_MS) deny('RequestTimeTooSkewed', 'écart d’horloge trop grand');
    payloadHash = req.headers['x-amz-content-sha256'];
    if (!payloadHash) deny('InvalidRequest', 'x-amz-content-sha256 manquant', 400);
    if (!signedHeaders.split(';').includes('x-amz-date') || !signedHeaders.split(';').includes('x-amz-content-sha256')) deny('AccessDenied', 'en-têtes signés insuffisants');
    signPairs = pairs;
  }
  if (accessKey !== env.R2_ACCESS_KEY_ID) deny('InvalidAccessKeyId', 'clé d’accès inconnue');
  if (region !== (env.R2_REGION || 'auto') || service !== 's3' || scopeDate !== String(amzDate).slice(0, 8)) deny('AuthorizationHeaderMalformed', 'portée de signature invalide', 400);
  const names = signedHeaders.split(';');
  if (!names.includes('host')) deny('AccessDenied', 'host non signé');
  const headers = {};
  for (const n of names) headers[n] = n === 'host' ? req.headers.host : req.headers[n];
  const expected = signature({ method: req.method, path: decodedPath, queryPairs: signPairs, headers, signedHeaders, payloadHash, amzDate, region, service, secret: env.R2_SECRET_ACCESS_KEY }).signature;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given.padEnd(64, '0').slice(0, 64)))) deny('SignatureDoesNotMatch', 'The request signature we calculated does not match the signature you provided.');
  return { payloadHash };
}

function checkPayload(res, payloadHash, body) {
  if (payloadHash === 'UNSIGNED-PAYLOAD') return true;
  if (sha256Hex(body) !== payloadHash) { s3Error(res, 400, 'XAmzContentSHA256Mismatch', 'empreinte du corps différente'); return false; }
  return true;
}

// ── Lecture d'objet (signée ou publique) ─────────────────────────────────────
function serveObject(req, res, key) {
  const f = objFile(key);
  if (!fs.existsSync(`${f}.json`)) return s3Error(res, 404, 'NoSuchKey', 'objet introuvable');
  const meta = readJson(`${f}.json`);
  const headers = { 'Content-Type': meta.contentType || TYPES[key.split('.').pop()] || 'application/octet-stream', ETag: `"${meta.etag}"`, 'Accept-Ranges': 'bytes', 'Last-Modified': new Date(meta.created).toUTCString() };
  for (const [n, v] of Object.entries(meta.entetes || {})) headers[n] = v; // en-têtes stockés (copie REPLACE)
  if (FAUX.sansPlages) delete headers['Accept-Ranges'];
  // Comme R2 : compression à la volée d'un type texte si le client accepte gzip et ne demande pas de plage.
  // La taille disparaît alors (réponse en flux), même au HEAD ; le Content-Encoding n'appartient pas à l'objet.
  const compresser = FAUX.compression && !req.headers.range && /gzip/i.test(req.headers['accept-encoding'] || '')
    && COMPRESSIBLE.test(headers['Content-Type']) && !(meta.entetes || {})['content-encoding'];
  if (compresser || FAUX.sansTaille) {
    if (compresser) headers['Content-Encoding'] = 'gzip';
    delete headers['Accept-Ranges'];
    res.writeHead(200, headers); // ni Content-Length ni Content-Range (envoi en flux)
    if (req.method === 'HEAD' || meta.size === 0) return res.end();
    const flux = fs.createReadStream(`${f}.bin`);
    return compresser ? flux.pipe(zlib.createGzip()).pipe(res) : flux.pipe(res);
  }
  const range = FAUX.sansPlages ? null : /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  let start = 0;
  let end = meta.size - 1;
  let status = 200;
  if (range && meta.size > 0) {
    if (range[1] === '') { start = Math.max(0, meta.size - Number(range[2])); } else { start = Number(range[1]); if (range[2] !== '') end = Math.min(end, Number(range[2])); }
    if (start > end || start >= meta.size) { res.writeHead(416, { 'Content-Range': `bytes */${meta.size}` }); return res.end(); }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${meta.size}`;
  }
  headers['Content-Length'] = meta.size === 0 ? 0 : end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || meta.size === 0) return res.end();
  fs.createReadStream(`${f}.bin`, { start, end }).pipe(res);
}

// ── Opérations ───────────────────────────────────────────────────────────────
async function handle(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const [rawPath, rawQuery = ''] = req.url.split('?');
  const decodedPath = rawPath.split('/').map((s) => decodeURIComponent(s)).join('/');
  const segs = decodedPath.split('/').slice(1);

  // Lecture publique (simule le domaine public du bucket) : /public/<bucket>/<clé>
  if (segs[0] === 'public') {
    if (!['GET', 'HEAD'].includes(req.method)) return s3Error(res, 405, 'MethodNotAllowed', 'lecture seule');
    if (segs[1] !== env.R2_BUCKET) return s3Error(res, 404, 'NoSuchBucket', 'bucket inconnu');
    return serveObject(req, res, segs.slice(2).join('/'));
  }

  const pairs = queryPairs(rawQuery);
  let auth;
  try {
    auth = verify(req, decodedPath, pairs);
  } catch (err) {
    if (err?.code) return s3Error(res, err.status, err.code, err.message);
    throw err;
  }
  const q = Object.fromEntries(pairs);
  if (segs[0] !== env.R2_BUCKET) return s3Error(res, 404, 'NoSuchBucket', 'bucket inconnu');
  const key = segs.slice(1).join('/');

  // Outil de test : vieillir un téléversement (pour tester le nettoyage sans attendre 24 h).
  if (req.method === 'POST' && key === '_faux/vieillir') {
    const d = uploadDir(q.uploadId || '');
    if (!fs.existsSync(`${d}/meta.json`)) return s3Error(res, 404, 'NoSuchUpload', 'téléversement inconnu');
    const meta = readJson(`${d}/meta.json`);
    meta.initiated = Date.now() - Number(q.heures || 48) * 3600 * 1000;
    fs.writeFileSync(`${d}/meta.json`, JSON.stringify(meta));
    return send(res, 200, '<Ok/>');
  }
  // Outils de test : pannes simulées.
  if (req.method === 'POST' && key === '_faux/echec-complete') { FAUX.echecComplete = Number(q.fois || 1); return send(res, 200, '<Ok/>'); }
  if (req.method === 'POST' && key === '_faux/echec-copie') { FAUX.echecCopie = Number(q.fois || 1); return send(res, 200, '<Ok/>'); }
  if (req.method === 'POST' && key === '_faux/sans-plages') { FAUX.sansPlages = q.actif === '1'; return send(res, 200, '<Ok/>'); }
  if (req.method === 'POST' && key === '_faux/compression') { FAUX.compression = q.actif === '1'; return send(res, 200, '<Ok/>'); }
  if (req.method === 'POST' && key === '_faux/sans-taille') { FAUX.sansTaille = q.actif === '1'; return send(res, 200, '<Ok/>'); }

  // ListMultipartUploads : GET /<bucket>?uploads
  if (req.method === 'GET' && !key && 'uploads' in q) {
    const prefix = q.prefix || '';
    const items = fs.readdirSync(UPLOADS).map((id) => path.join(UPLOADS, id, 'meta.json')).filter((f) => fs.existsSync(f)).map(readJson)
      .filter((m) => m.key.startsWith(prefix)).sort((a, b) => (a.key < b.key ? -1 : 1));
    const xml = items.map((m) => `<Upload><Key>${xmlEsc(m.key)}</Key><UploadId>${m.uploadId}</UploadId><Initiated>${new Date(m.initiated).toISOString()}</Initiated></Upload>`).join('');
    return send(res, 200, `<ListMultipartUploadsResult><Bucket>${env.R2_BUCKET}</Bucket><Prefix>${xmlEsc(prefix)}</Prefix><IsTruncated>false</IsTruncated>${xml}</ListMultipartUploadsResult>`);
  }
  if (!key) return s3Error(res, 400, 'InvalidRequest', 'clé manquante');

  // CreateMultipartUpload : POST /<bucket>/<clé>?uploads
  if (req.method === 'POST' && 'uploads' in q) {
    const body = await readBody(req);
    if (!checkPayload(res, auth.payloadHash, body)) return undefined;
    const uploadId = crypto.randomBytes(24).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x');
    fs.mkdirSync(uploadDir(uploadId), { recursive: true });
    fs.writeFileSync(`${uploadDir(uploadId)}/meta.json`, JSON.stringify({ key, uploadId, initiated: Date.now(), contentType: req.headers['content-type'] || '' }));
    return send(res, 200, `<InitiateMultipartUploadResult><Bucket>${env.R2_BUCKET}</Bucket><Key>${xmlEsc(key)}</Key><UploadId>${uploadId}</UploadId></InitiateMultipartUploadResult>`);
  }

  const d = q.uploadId ? uploadDir(q.uploadId) : null;
  const uploadMeta = d && fs.existsSync(`${d}/meta.json`) ? readJson(`${d}/meta.json`) : null;
  if (q.uploadId && (!uploadMeta || uploadMeta.key !== key)) return s3Error(res, 404, 'NoSuchUpload', 'téléversement inconnu ou abandonné');

  // UploadPart : PUT /<bucket>/<clé>?partNumber=N&uploadId=U
  if (req.method === 'PUT' && q.uploadId) {
    const n = Number(q.partNumber);
    if (!Number.isInteger(n) || n < 1 || n > 10000) return s3Error(res, 400, 'InvalidArgument', 'partNumber invalide');
    const tmp = `${d}/part-${n}.tmp${crypto.randomBytes(4).toString('hex')}`;
    const md5 = crypto.createHash('md5');
    const sha = crypto.createHash('sha256');
    let size = 0;
    req.on('data', (c) => { md5.update(c); sha.update(c); size += c.length; });
    await pipeline(req, fs.createWriteStream(tmp));
    if (auth.payloadHash !== 'UNSIGNED-PAYLOAD' && sha.digest('hex') !== auth.payloadHash) {
      fs.rmSync(tmp, { force: true });
      return s3Error(res, 400, 'XAmzContentSHA256Mismatch', 'empreinte du corps différente');
    }
    const etag = md5.digest('hex');
    fs.renameSync(tmp, `${d}/part-${n}.bin`);
    fs.writeFileSync(`${d}/part-${n}.json`, JSON.stringify({ n, etag, size, at: Date.now() }));
    res.writeHead(200, { ETag: `"${etag}"` });
    return res.end();
  }

  // ListParts : GET /<bucket>/<clé>?uploadId=U
  if (req.method === 'GET' && q.uploadId) {
    const parts = fs.readdirSync(d).filter((f) => /^part-\d+\.json$/.test(f)).map((f) => readJson(path.join(d, f))).sort((a, b) => a.n - b.n);
    const xml = parts.map((p) => `<Part><PartNumber>${p.n}</PartNumber><LastModified>${new Date(p.at).toISOString()}</LastModified><ETag>"${p.etag}"</ETag><Size>${p.size}</Size></Part>`).join('');
    return send(res, 200, `<ListPartsResult><Bucket>${env.R2_BUCKET}</Bucket><Key>${xmlEsc(key)}</Key><UploadId>${q.uploadId}</UploadId><IsTruncated>false</IsTruncated>${xml}</ListPartsResult>`);
  }

  // CompleteMultipartUpload : POST /<bucket>/<clé>?uploadId=U
  if (req.method === 'POST' && q.uploadId) {
    const body = await readBody(req);
    if (!checkPayload(res, auth.payloadHash, body)) return undefined;
    if (FAUX.echecComplete > 0) { FAUX.echecComplete--; return s3Error(res, 500, 'InternalError', 'échec de finalisation simulé'); }
    const wanted = [...body.toString('utf8').matchAll(/<Part>\s*<PartNumber>(\d+)<\/PartNumber>\s*<ETag>([^<]*)<\/ETag>\s*<\/Part>/g)]
      .map((m) => ({ n: Number(m[1]), etag: m[2].replace(/&quot;|"/g, '') }));
    if (!wanted.length) return s3Error(res, 400, 'MalformedXML', 'aucune part');
    for (let i = 1; i < wanted.length; i++) if (wanted[i].n <= wanted[i - 1].n) return s3Error(res, 400, 'InvalidPartOrder', 'parts non croissantes');
    const metas = [];
    for (const [i, w] of wanted.entries()) {
      const f = `${d}/part-${w.n}.json`;
      if (!fs.existsSync(f)) return s3Error(res, 400, 'InvalidPart', `part ${w.n} absente`);
      const m = readJson(f);
      if (m.etag !== w.etag) return s3Error(res, 400, 'InvalidPart', `ETag de la part ${w.n} différent`);
      if (i < wanted.length - 1 && m.size < MIN_PART) return s3Error(res, 400, 'EntityTooSmall', `part ${w.n} trop petite`);
      metas.push(m);
    }
    const out = objFile(key);
    const ws = fs.createWriteStream(`${out}.bin`);
    for (const m of metas) await pipeline(fs.createReadStream(`${d}/part-${m.n}.bin`), ws, { end: false });
    await new Promise((ok) => ws.end(ok));
    const etag = `${crypto.createHash('md5').update(Buffer.concat(metas.map((m) => Buffer.from(m.etag, 'hex')))).digest('hex')}-${metas.length}`;
    const size = metas.reduce((s, m) => s + m.size, 0);
    // Comme R2 : sans Content-Type à la création, l'objet est « application/octet-stream » (pas de déduction).
    fs.writeFileSync(`${out}.json`, JSON.stringify({ key, size, etag, contentType: uploadMeta.contentType || 'application/octet-stream', created: Date.now() }));
    fs.rmSync(d, { recursive: true, force: true });
    return send(res, 200, `<CompleteMultipartUploadResult><Location>${xmlEsc(`${env.R2_ENDPOINT}/${env.R2_BUCKET}/${key}`)}</Location><Bucket>${env.R2_BUCKET}</Bucket><Key>${xmlEsc(key)}</Key><ETag>"${etag}"</ETag></CompleteMultipartUploadResult>`);
  }

  // AbortMultipartUpload : DELETE /<bucket>/<clé>?uploadId=U
  if (req.method === 'DELETE' && q.uploadId) {
    fs.rmSync(d, { recursive: true, force: true });
    res.writeHead(204);
    return res.end();
  }

  // CopyObject : PUT /<bucket>/<clé> avec x-amz-copy-source (copie côté serveur, sans renvoyer le contenu).
  if (req.method === 'PUT' && !q.uploadId && req.headers['x-amz-copy-source'] !== undefined) {
    const signed = String((/SignedHeaders=([^,]+)/.exec(req.headers.authorization || '') || [])[1] || '').split(';');
    for (const n of ['x-amz-copy-source', 'x-amz-metadata-directive', 'content-type']) {
      if (req.headers[n] !== undefined && !signed.includes(n)) return s3Error(res, 403, 'AccessDenied', `en-tête ${n} non signé`);
    }
    const body = await readBody(req);
    if (!checkPayload(res, auth.payloadHash, body)) return undefined;
    if (FAUX.echecCopie > 0) { FAUX.echecCopie--; return s3Error(res, 500, 'InternalError', 'échec de copie simulé'); }
    const src = decodeURIComponent(String(req.headers['x-amz-copy-source']).split('?')[0]).replace(/^\/+/, '');
    const [srcBucket, ...rest] = src.split('/');
    const srcKey = rest.join('/');
    if (srcBucket !== env.R2_BUCKET) return s3Error(res, 404, 'NoSuchBucket', 'bucket source inconnu');
    const sf = objFile(srcKey);
    if (!fs.existsSync(`${sf}.json`)) return s3Error(res, 404, 'NoSuchKey', 'objet source introuvable');
    const smeta = readJson(`${sf}.json`);
    if (smeta.size > MAX_COPY) return s3Error(res, 400, 'InvalidRequest', 'copie limitée à 5 Gio');
    const directive = String(req.headers['x-amz-metadata-directive'] || 'COPY').toUpperCase();
    if (!['COPY', 'REPLACE'].includes(directive)) return s3Error(res, 400, 'InvalidArgument', 'x-amz-metadata-directive invalide');
    if (srcKey === key && directive !== 'REPLACE') return s3Error(res, 400, 'InvalidRequest', 'copie d’un objet sur lui-même sans rien changer');
    const out = objFile(key);
    if (srcKey !== key) fs.copyFileSync(`${sf}.bin`, `${out}.bin`);
    const md5 = crypto.createHash('md5');
    for await (const c of fs.createReadStream(`${out}.bin`)) md5.update(c);
    const etag = md5.digest('hex');
    const contentType = directive === 'REPLACE' ? (req.headers['content-type'] || 'application/octet-stream') : smeta.contentType;
    // REPLACE : seuls les en-têtes fournis sont gardés (comme S3) ; COPY : ceux de la source.
    let entetes = smeta.entetes || {};
    if (directive === 'REPLACE') {
      entetes = {};
      for (const [n, v] of Object.entries(req.headers)) if (ENTETES_COPIE.includes(n) || n.startsWith('x-amz-meta-')) entetes[n] = v;
    }
    const created = Date.now();
    fs.writeFileSync(`${out}.json`, JSON.stringify({ key, size: smeta.size, etag, contentType, created, entetes }));
    return send(res, 200, `<CopyObjectResult><LastModified>${new Date(created).toISOString()}</LastModified><ETag>"${etag}"</ETag></CopyObjectResult>`);
  }

  if (req.method === 'GET' || req.method === 'HEAD') return serveObject(req, res, key);
  if (req.method === 'DELETE') {
    fs.rmSync(`${objFile(key)}.bin`, { force: true });
    fs.rmSync(`${objFile(key)}.json`, { force: true });
    res.writeHead(204);
    return res.end();
  }
  return s3Error(res, 405, 'MethodNotAllowed', 'opération non simulée');
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    if (!res.headersSent) s3Error(res, err?.code === 'EntityTooLarge' ? 400 : 500, err?.code || 'InternalError', 'erreur du faux S3');
    else res.destroy();
  });
});
server.requestTimeout = 0;
server.listen(Number(endpoint.port || 9000), '127.0.0.1', () => {
  console.log(`Faux S3 prêt sur http://127.0.0.1:${endpoint.port || 9000} (bucket ${env.R2_BUCKET}, stockage ${DIR})`);
});
