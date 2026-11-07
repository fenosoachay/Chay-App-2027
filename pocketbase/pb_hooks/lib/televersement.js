// Téléversements (bloc 4) : constantes, stockage R2 (S3 multipart signé SigV4), sessions,
// morceaux sur disque (upload_chunk) et nettoyages. Chargé dans les handlers par
// require(`${__hooks}/lib/televersement.js`) (les handlers PocketBase sont isolés).
//
// Configuration R2 : variables d'environnement du processus PocketBase (jamais dans le dépôt) :
//   R2_ENDPOINT          https://<compte>.r2.cloudflarestorage.com   (bac à sable : http://127.0.0.1:9000)
//   R2_BUCKET            nom du bucket
//   R2_ACCESS_KEY_ID     clé d'accès (jeton API R2 limité à ce bucket)
//   R2_SECRET_ACCESS_KEY secret
//   R2_REGION            auto (R2)
//   R2_PUBLIC_BASE_URL   adresse publique de lecture (domaine du bucket), sans « / » final
//   R2_PREFIX            préfixe des clés (défaut : videos)
// Adresse publique de PocketBase pour les fichiers assemblés : CHAY_PUBLIC_URL (sinon l'hôte de la requête).

const fnLib = require(`${__hooks}/lib/fn.js`);
const sigv4 = require(`${__hooks}/lib/sigv4.js`);

const HttpError = fnLib.HttpError;
const MIO = 1024 * 1024;
const CHUNK_SIZE = 8 * MIO; // identique à src/lib/upload.js (CHUNK_SIZE)
const MAX_CHUNKED_BYTES = 100 * MIO; // upload_chunk : jusqu'à 100 Mo (au-delà : R2)
const MAX_VIDEO_BYTES = 5 * 1024 * MIO; // R2 : 5 Go
const PART_SIZE = 8 * MIO; // R2 : parts de 8 Mo (minimum S3 : 5 Mo sauf la dernière)
const MIN_PART = 5 * MIO;
const MAX_PARTS = 10000;
const SESSION_TTL_MS = 24 * 3600 * 1000;
const PRESIGN_TTL_SEC = 900;
const VIDEO_EXT = ['mp4', 'm4v', 'mov', 'webm', 'mkv'];
const VIDEO_TYPES = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska' };
const SESSIONS = 'UploadSession';
const FILE_COLLECTIONS = ['Fichier', 'FichierAdmin'];
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

// ── Dates et noms ────────────────────────────────────────────────────────────

/** Date PocketBase ("AAAA-MM-JJ HH:MM:SS.sssZ") à `offsetMs` de maintenant. */
const pbDate = (offsetMs) => new Date(Date.now() + (offsetMs || 0)).toISOString().replace('T', ' ');

/** Extension sûre (minuscules, 1 à 5 caractères alphanumériques) ou `fallback`. */
function extensionOf(name, fallback) {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(String(name || ''));
  return m ? m[1].toLowerCase() : fallback;
}

/** Politique : toutes les vidéos vont sur R2 (initMultipartUpload), jamais dans le stockage de PocketBase. */
const VIDEO_REFUSED = 'Les vidéos sont envoyées vers le stockage vidéo (R2), pas dans PocketBase';
const isVideoName = (name) => VIDEO_EXT.indexOf(extensionOf(name, '')) >= 0;

/** Nom de fichier imprévisible (le nom d'origine n'est pas conservé). */
function randomFileName(originalName, fallbackExt) {
  return `f_${$security.randomStringWithAlphabet(20, ALPHABET)}.${extensionOf(originalName, fallbackExt || 'bin')}`;
}

/** Slug ASCII d'un nom de fichier (sans extension), pour une clé R2 lisible. */
function slug(name) {
  let s = String(name || '').replace(/\.[A-Za-z0-9]{1,5}$/, '');
  try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (_) { /* normalize indisponible */ }
  s = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return s || 'video';
}

// ── Configuration ────────────────────────────────────────────────────────────

/** Configuration R2 depuis l'environnement, ou null si incomplète. */
function r2Config() {
  const endpoint = String($os.getenv('R2_ENDPOINT') || '').replace(/\/+$/, '');
  const cfg = {
    endpoint,
    bucket: $os.getenv('R2_BUCKET') || '',
    accessKeyId: $os.getenv('R2_ACCESS_KEY_ID') || '',
    secretAccessKey: $os.getenv('R2_SECRET_ACCESS_KEY') || '',
    region: $os.getenv('R2_REGION') || 'auto',
    publicBaseUrl: String($os.getenv('R2_PUBLIC_BASE_URL') || '').replace(/\/+$/, ''),
    prefix: String($os.getenv('R2_PREFIX') || 'videos').replace(/^\/+|\/+$/g, ''),
  };
  const m = /^(https?:)\/\/([^/]+)$/.exec(endpoint);
  if (!m || !cfg.bucket || !cfg.accessKeyId || !cfg.secretAccessKey || !cfg.publicBaseUrl) return null;
  cfg.protocol = m[1];
  cfg.host = m[2];
  return cfg;
}

function requireR2() {
  const cfg = r2Config();
  if (!cfg) throw new HttpError(500, 'Stockage vidéo (R2) non configuré sur le serveur');
  return cfg;
}

/** Adresse publique de PocketBase (CHAY_PUBLIC_URL, sinon schéma + hôte de la requête). */
function publicBaseUrl(e) {
  const env = String($os.getenv('CHAY_PUBLIC_URL') || '').replace(/\/+$/, '');
  if (env) return env;
  const req = e.request;
  return `${req.tls ? 'https' : 'http'}://${req.host}`;
}

/** Adresse publique d'un fichier PocketBase (même forme que pb.files.getURL du SDK). */
function fileUrl(base, record, fieldName) {
  return `${base}/api/files/${record.collection().id}/${record.id}/${encodeURIComponent(record.getString(fieldName || 'fichier'))}`;
}

/** Adresse publique d'un objet R2. */
function objectUrl(cfg, key) {
  return `${cfg.publicBaseUrl}/${key.split('/').map((s) => encodeURIComponent(s)).join('/')}`;
}

// ── Requêtes S3 signées (serveur -> R2) ──────────────────────────────────────

/** Requête signée (en-tête Authorization). Renvoie { status, text, bytes }. */
function s3(cfg, method, key, query, body, headers, timeoutSec) {
  const path = `/${cfg.bucket}${key ? `/${key}` : ''}`;
  const signed = sigv4.signHeaders({
    method, host: cfg.host, path, query: query || {}, body: body || '', headers: headers || {},
    accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, region: cfg.region, service: 's3',
  });
  const qs = sigv4.canonicalQuery(query || {});
  const res = $http.send({
    url: `${cfg.protocol}//${cfg.host}${sigv4.uriEncode(path, true)}${qs ? `?${qs}` : ''}`,
    method,
    body: body || '',
    headers: signed,
    timeout: timeoutSec || 60,
  });
  const bytes = res.body || [];
  return { status: res.statusCode, text: toString(bytes), bytes };
}

const xmlValue = (xml, tag) => {
  const m = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml || '');
  return m ? m[1] : '';
};
const xmlUnescape = (s) => String(s).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function s3Fail(what, res) {
  $app.logger().error('[r2] échec', 'operation', what, 'status', res.status, 'code', xmlValue(res.text, 'Code'));
  return new HttpError(502, `Stockage vidéo : échec de ${what} (HTTP ${res.status})`);
}

function createMultipart(cfg, key, contentType) {
  const res = s3(cfg, 'POST', key, { uploads: '' }, '', contentType ? { 'content-type': contentType } : {});
  const uploadId = xmlUnescape(xmlValue(res.text, 'UploadId'));
  if (res.status !== 200 || !uploadId) throw s3Fail('CreateMultipartUpload', res);
  return uploadId;
}

/** Parts déjà reçues par R2 : [{ partNumber, etag, size }] (null si l'upload n'existe plus). */
function listParts(cfg, key, uploadId) {
  const parts = [];
  let marker = '';
  for (let guard = 0; guard < 20; guard++) {
    const query = { uploadId, 'max-parts': '1000' };
    if (marker) query['part-number-marker'] = marker;
    const res = s3(cfg, 'GET', key, query);
    if (res.status === 404) return null;
    if (res.status !== 200) throw s3Fail('ListParts', res);
    const re = /<Part>([\s\S]*?)<\/Part>/g;
    let m;
    while ((m = re.exec(res.text))) {
      parts.push({
        partNumber: Number(xmlValue(m[1], 'PartNumber')),
        etag: xmlUnescape(xmlValue(m[1], 'ETag')).replace(/"/g, ''),
        size: Number(xmlValue(m[1], 'Size')),
      });
    }
    if (xmlValue(res.text, 'IsTruncated') !== 'true') break;
    marker = xmlValue(res.text, 'NextPartNumberMarker');
    if (!marker) break;
  }
  return parts;
}

function completeMultipart(cfg, key, uploadId, parts) {
  const xml = `<CompleteMultipartUpload>${parts.map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${xmlEscape(`"${p.etag}"`)}</ETag></Part>`).join('')}</CompleteMultipartUpload>`;
  const res = s3(cfg, 'POST', key, { uploadId }, xml, { 'content-type': 'application/xml' }, 300);
  if (res.status !== 200 || /<Error>/.test(res.text)) throw s3Fail('CompleteMultipartUpload', res);
}

function abortMultipart(cfg, key, uploadId) {
  const res = s3(cfg, 'DELETE', key, { uploadId });
  return res.status === 204 || res.status === 200 || res.status === 404;
}

/** Premiers octets de l'objet (Range) pour vérifier le type réel. */
function headBytes(cfg, key) {
  const res = s3(cfg, 'GET', key, {}, '', { range: 'bytes=0-63' });
  if (res.status !== 206 && res.status !== 200) throw s3Fail('lecture de contrôle', res);
  return res.bytes;
}

/** Vrai si les premiers octets sont ceux d'une vidéo (ISO-BMFF « ftyp » : mp4 / mov / m4v ; EBML : webm / mkv). */
function looksLikeVideo(bytes) {
  if (!bytes || bytes.length < 12) return false;
  const ftyp = bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
  const ebml = bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  return ftyp || ebml;
}

function deleteObject(cfg, key) {
  s3(cfg, 'DELETE', key, {});
}

/** Téléversements multipart en cours dans R2 sous le préfixe : [{ key, uploadId, initiated(ms) }]. */
function listUploads(cfg) {
  const res = s3(cfg, 'GET', '', { uploads: '', prefix: `${cfg.prefix}/` });
  if (res.status !== 200) throw s3Fail('ListMultipartUploads', res);
  const out = [];
  const re = /<Upload>([\s\S]*?)<\/Upload>/g;
  let m;
  while ((m = re.exec(res.text))) {
    out.push({ key: xmlUnescape(xmlValue(m[1], 'Key')), uploadId: xmlUnescape(xmlValue(m[1], 'UploadId')), initiated: Date.parse(xmlValue(m[1], 'Initiated')) });
  }
  return out;
}

/** URL présignée pour UploadPart, taille imposée (content-length signé). */
function presignPart(cfg, key, uploadId, partNumber, size) {
  return sigv4.presign({
    method: 'PUT', protocol: cfg.protocol, host: cfg.host, path: `/${cfg.bucket}/${key}`,
    query: { partNumber: String(partNumber), uploadId }, headers: { 'content-length': String(size) },
    expires: PRESIGN_TTL_SEC, accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, region: cfg.region, service: 's3',
  });
}

// ── Sessions ─────────────────────────────────────────────────────────────────

/** Session de l'utilisateur (session_id fourni par le client, propriétaire imposé), ou null. */
function findSession(sessionId, userId, storage) {
  return fnLib.findOne($app, SESSIONS, 'session_id = {:s} && created_by = {:u} && storage = {:t}', '-created', { s: sessionId, u: userId, t: storage });
}

function requireSessionId(body) {
  const v = body.session_id;
  if (typeof v !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(v)) throw new HttpError(400, 'session_id invalide');
  return v;
}

const isExpired = (session) => !session.getString('expires_at') || session.getString('expires_at') < pbDate(0);

/** Taille attendue de la part / du morceau `n` (numérotation à partir de `first`). */
function expectedSize(total, size, partSize, n, first) {
  const i = n - first;
  return i < Math.ceil(size / partSize) - 1 ? partSize : size - partSize * (Math.ceil(size / partSize) - 1);
}

// ── Morceaux sur disque (upload_chunk) ───────────────────────────────────────

const chunksRoot = () => `${$app.dataDir()}/.televersements`;
const chunkDir = (session) => `${chunksRoot()}/${session.id}`;

function statSize(path) {
  try { return $os.stat(path).size(); } catch (_) { return -1; }
}

/** Indices des morceaux déjà reçus avec la bonne taille. */
function storedChunks(session) {
  const total = session.getInt('total_chunks');
  const size = session.getInt('size');
  const out = [];
  for (let i = 0; i < total; i++) {
    if (statSize(`${chunkDir(session)}/${i}.part`) === expectedSize(total, size, CHUNK_SIZE, i, 0)) out.push(i);
  }
  return out;
}

/** Copie un fichier téléversé (multipart) dans le dossier de la session, sans passer par JavaScript (io.Copy Go). */
function writeChunk(session, index, uploaded) {
  $os.mkdirAll(chunkDir(session), 0o755);
  const root = $os.openRoot(chunkDir(session));
  let src = null;
  let dst = null;
  try {
    src = uploaded.reader.open();
    dst = root.openFile(`${index}.tmp`, 0x1 | 0x40 | 0x200, 0o644); // O_WRONLY | O_CREATE | O_TRUNC
    dst.readFrom(src);
  } finally {
    if (dst) dst.close();
    if (src) src.close();
    root.close();
  }
  $os.rename(`${chunkDir(session)}/${index}.tmp`, `${chunkDir(session)}/${index}.part`);
}

/** Assemble les morceaux dans un seul fichier ; renvoie son chemin. */
function assembleChunks(session) {
  const root = $os.openRoot(chunkDir(session));
  let dst = null;
  try {
    dst = root.openFile('assemble.bin', 0x1 | 0x40 | 0x200, 0o644);
    for (let i = 0; i < session.getInt('total_chunks'); i++) {
      const src = root.open(`${i}.part`);
      try { dst.readFrom(src); } finally { src.close(); }
    }
  } finally {
    if (dst) dst.close();
    root.close();
  }
  return `${chunkDir(session)}/assemble.bin`;
}

function removeChunkDir(session) {
  try { $os.removeAll(chunkDir(session)); } catch (_) { /* déjà absent */ }
}

// ── Nettoyages ───────────────────────────────────────────────────────────────

/**
 * Sessions expirées (plus de 24 h) : abandon des téléversements R2, suppression des morceaux
 * sur disque et de la session. Puis téléversements R2 de plus de 24 h sans session ouverte,
 * et dossiers de morceaux sans session.
 */
function cleanupIncomplete() {
  const cfg = r2Config();
  const result = { sessions_supprimees: 0, uploads_abandonnes: 0, dossiers_supprimes: 0, erreurs: 0 };
  const expired = $app.findRecordsByFilter(SESSIONS, 'expires_at != "" && expires_at < {:now}', '', 0, 0, { now: pbDate(0) });
  for (const s of expired) {
    try {
      const done = s.getString('status') === 'done' || s.getString('status') === 'completed';
      if (s.getString('storage') === 's3-multipart' && !done && s.getString('upload_id') && cfg) {
        if (abortMultipart(cfg, s.getString('s3_key'), s.getString('upload_id'))) result.uploads_abandonnes++;
      }
      if (s.getString('storage') === 'chunk') removeChunkDir(s);
      $app.delete(s);
      result.sessions_supprimees++;
    } catch (_) {
      result.erreurs++;
    }
  }
  if (cfg) {
    try {
      const open = {};
      for (const s of $app.findRecordsByFilter(SESSIONS, 'storage = "s3-multipart" && upload_id != ""', '', 0, 0)) open[s.getString('upload_id')] = true;
      for (const u of listUploads(cfg)) {
        if (!open[u.uploadId] && u.initiated < Date.now() - SESSION_TTL_MS && abortMultipart(cfg, u.key, u.uploadId)) result.uploads_abandonnes++;
      }
    } catch (_) {
      result.erreurs++;
    }
  }
  try {
    for (const entry of $os.readDir(chunksRoot())) {
      const name = entry.name();
      if (!fnLib.findById(SESSIONS, name)) {
        $os.removeAll(`${chunksRoot()}/${name}`);
        result.dossiers_supprimes++;
      }
    }
  } catch (_) { /* dossier absent */ }
  return result;
}

/** Champs (collection, nom, type) où une référence à un fichier peut se trouver : texte, éditeur, url, json. */
function referenceFields() {
  const out = [];
  const skip = FILE_COLLECTIONS.concat([SESSIONS, 'UploadChunk']);
  for (const col of $app.findAllCollections()) {
    if (col.system || col.type === 'view' || skip.indexOf(col.name) >= 0) continue;
    for (const field of col.fields) {
      const t = field.type();
      if (['text', 'editor', 'url', 'json'].indexOf(t) < 0 || field.getName() === 'id') continue;
      out.push({ col: col.name, name: field.getName(), type: t });
    }
  }
  return out;
}

/** Valeur brute + versions décodées (adresse encodée dans une autre adresse : %2Fapi%2Ffiles%2F…). */
function decodedForms(v) {
  const forms = [v];
  let cur = v;
  for (let i = 0; i < 3 && /%[0-9a-f]{2}/i.test(cur); i++) {
    try { cur = decodeURIComponent(cur); } catch (_) { cur = cur.replace(/%2f/gi, '/'); }
    forms.push(cur);
  }
  return forms.join('\n');
}

/**
 * Identifiants de Fichier / FichierAdmin référencés par une adresse /api/files/<collection>/<id>/… dans un champ
 * texte, éditeur, url ou json de n'importe quelle collection. Formes reconnues : collection par identifiant ou par
 * nom, avec ou sans hôte, et adresse ENCODÉE dans une autre adresse (%2Fapi%2Ffiles%2F). L'identifiant n'est pas
 * limité à 24 caractères hexadécimaux : un identifiant trop large ne fait que protéger davantage.
 */
function referencedFileIds() {
  const ids = {};
  const re = /\/api\/files\/[^/"'\s?#]+\/([A-Za-z0-9_-]{5,40})\//g;
  for (const f of referenceFields()) {
    // « % » est un joker de LIKE : le motif encodé est passé avec des jokers explicites (sinon pas d'encadrement auto).
    const rows = $app.findRecordsByFilter(f.col, `${f.name} ~ "api/files/" || ${f.name} ~ {:enc}`, '', 0, 0, { enc: '%api%2Ffiles%2F%' });
    for (const r of rows) {
      const v = decodedForms(f.type === 'json' ? JSON.stringify(r.get(f.name)) : r.getString(f.name));
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(v))) ids[m[1]] = true;
    }
  }
  return ids;
}

/** Le NOM du fichier (aléatoire, unique : f_… ou nom PocketBase) apparaît-il dans un champ de référence ? */
function fileNameReferenced(fileName, fields) {
  if (!fileName || fileName.length < 8) return true; // nom trop court pour être sûr : on garde
  for (const f of fields) {
    if ($app.findRecordsByFilter(f.col, `${f.name} ~ {:n}`, '', 1, 0, { n: fileName }).length) return true;
  }
  return false;
}

// Au-delà, le mode actif ne supprime rien et le signale : un nombre anormal de candidats indique plutôt une
// forme de référence non reconnue qu'une vraie accumulation.
const MAX_DELETIONS_PER_RUN = 50;

/**
 * Fichiers non référencés, créés depuis plus de `graceHours` : supprimés (sauf simulation).
 * Un fichier n'est candidat que si ni son adresse (toutes formes) ni son nom de fichier n'apparaît nulle part.
 * Prudence : rien n'est supprimé si aucune référence n'est trouvée alors qu'il y a plus de 20 candidats, ni si
 * plus de MAX_DELETIONS_PER_RUN fichiers seraient supprimés d'un coup.
 */
function cleanupOrphans(graceHours, simulation, onlyIds) {
  const refs = referencedFileIds();
  const refCount = Object.keys(refs).length;
  const cutoff = pbDate(-graceHours * 3600 * 1000);
  const result = { simulation: Boolean(simulation), examines: 0, references: refCount, orphelins: 0, supprimes: 0, proteges_par_nom: 0, annule: false };
  const orphans = [];
  const fields = referenceFields();
  for (const name of FILE_COLLECTIONS) {
    for (const r of $app.findRecordsByFilter(name, 'created <= {:c}', '', 0, 0, { c: cutoff })) {
      if (onlyIds && onlyIds.indexOf(r.id) < 0) continue;
      result.examines++;
      if (refs[r.id]) continue;
      if (fileNameReferenced(r.getString('fichier'), fields)) { result.proteges_par_nom++; continue; }
      orphans.push(r);
    }
  }
  result.orphelins = orphans.length;
  if (refCount === 0 && orphans.length > 20) {
    result.annule = true;
    $app.logger().warn('[fichiers] nettoyage annulé : aucune référence trouvée', 'orphelins', orphans.length);
    return result;
  }
  if (!simulation && orphans.length > MAX_DELETIONS_PER_RUN) {
    result.annule = true;
    $app.logger().warn('[fichiers] nettoyage annulé : trop de fichiers à supprimer d’un coup', 'orphelins', orphans.length, 'maximum', MAX_DELETIONS_PER_RUN);
    return result;
  }
  if (!simulation) {
    for (const r of orphans) {
      try { $app.delete(r); result.supprimes++; } catch (_) { /* suivant */ }
    }
  }
  return result;
}

module.exports = {
  MIO,
  CHUNK_SIZE,
  MAX_CHUNKED_BYTES,
  MAX_VIDEO_BYTES,
  PART_SIZE,
  MIN_PART,
  MAX_PARTS,
  SESSION_TTL_MS,
  PRESIGN_TTL_SEC,
  VIDEO_EXT,
  VIDEO_TYPES,
  VIDEO_REFUSED,
  isVideoName,
  SESSIONS,
  FILE_COLLECTIONS,
  pbDate,
  extensionOf,
  randomFileName,
  slug,
  r2Config,
  requireR2,
  publicBaseUrl,
  fileUrl,
  objectUrl,
  createMultipart,
  listParts,
  completeMultipart,
  abortMultipart,
  headBytes,
  looksLikeVideo,
  deleteObject,
  listUploads,
  presignPart,
  findSession,
  requireSessionId,
  isExpired,
  expectedSize,
  chunkDir,
  storedChunks,
  writeChunk,
  assembleChunks,
  removeChunkDir,
  cleanupIncomplete,
  cleanupOrphans,
};
