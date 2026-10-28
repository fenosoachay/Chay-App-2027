import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// ─────────────────────────────────────────────────────────────────────────────
// completeMultipartUpload — finalise un upload S3 Multipart DIRECT.
// POST /api/functions/completeMultipartUpload
//   { session_id | uploadId, key?, parts?: [{ partNumber, etag }] }
// → { file_url, key, size, name, mime_type, storage:'s3-multipart' }
//
// Le serveur ne télécharge RIEN : il appelle CompleteMultipartUpload (XML des
// ETags, ~quelques Ko) et c'est S3/R2 qui assemble l'objet côté stockage.
// La liste de parts fournie par le client est contrôlée contre ListParts (la
// vérité terrain côté S3) avant l'appel — un client malveillant ne peut ni
// finaliser des parts d'une autre session, ni masquer une part tronquée
// (chaque taille de part est revérifiée).
//
// Après succès : UploadSession passe à « done » avec final_file_url ; le
// composant MediaUploader stocke cette URL dans l'entité Video/Music/Article.
// ─────────────────────────────────────────────────────────────────────────────
const json = (obj: any, status = 200) => Response.json(obj, { status });

async function requireAdmin(base44: any) {
  let user: any = null;
  try { user = await base44.auth.me(); } catch {}
  if (!user || user.role !== 'admin') return null;
  return user;
}

// filter() a changé de signature selon les versions du SDK → wrapper tolérant.
async function queryEntities(svc: any, name: string, query: any, opts: any = {}) {
  const attempts = [
    () => svc.entities[name].filter(query, opts.sort ?? null, opts.limit ?? 5000),
    () => svc.entities[name].filter(query, opts),
  ];
  let lastErr: any;
  for (const attempt of attempts) {
    try {
      const res = await attempt();
      return Array.isArray(res) ? res : (res?.items || []);
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error(`lecture ${name} impossible`);
}

const findSessionBy = async (svc: any, q: any) =>
  (await queryEntities(svc, SESSIONS_ENTITY, q, { limit: 1 }).catch(() => []))[0] || null;

function parsePartsJson(raw: any): Array<{ PartNumber: number; ETag: string }> {
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || []);
    return Array.isArray(arr) ? arr.filter((p: any) => Number.isInteger(p.PartNumber)) : [];
  } catch { return []; }
}

function etagPlain(e: any): string { return String(e || '').replace(/"/g, '').trim(); }

const SESSIONS_ENTITY = 'UploadSession';

// ── BEGIN COPIED MODULE (copie de base44/functions/shared/s3.ts — les fonctions serverless Base44 sont déployées seules ; modifier shared/s3.ts puis re-synchroniser) ──
interface S3Config {
  endpoint: string;   // ex: https://<account-id>.r2.cloudflarestorage.com
  bucket: string;     // ex: chay-videos
  accessKeyId: string;
  secretAccessKey: string;
  region: string;     // "auto" pour R2
}

/** Charge la config depuis l'environnement ; null si non configuré. */
function s3ConfigFromEnv(env: any): S3Config | null {
  // trim systématique : un secret collé avec un espace/newline final fait
  // diverger la signature SigV4 (« SignatureDoesNotMatch ») sans autre indice.
  const endpoint = String(env?.S3_ENDPOINT || '').trim().replace(/\/+$/, '');
  const bucket = String(env?.S3_BUCKET || '').trim();
  const accessKeyId = String(env?.S3_ACCESS_KEY || '').trim();
  const secretAccessKey = String(env?.S3_SECRET_KEY || '').trim();
  const region = String(env?.S3_REGION || '').trim() || 'auto';
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  const pe = (() => { try { return new URL(endpoint); } catch { return null; } })();
  const cleanedEndpoint = pe && pe.pathname && pe.pathname !== '/'
    ? `${pe.protocol}//${pe.host}`
    : endpoint;
  return { endpoint: cleanedEndpoint, bucket, accessKeyId, secretAccessKey, region };
}

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) =>
  Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
async function digestHex(data: ArrayBuffer | string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : data));
}
async function hmac(key: ArrayBuffer | Uint8Array | string, msg: string): Promise<ArrayBuffer> {
  const k = typeof key === 'string' ? enc.encode(key) : key;
  const ck = await crypto.subtle.importKey('raw', k as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', ck, enc.encode(msg));
}

/** Date UTC au format ISO8601 compact exigé par SigV4 : 20261027T101938Z */
function amzDate(d = new Date()): { date: string; datetime: string } {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  const YMD = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
  return { date: YMD, datetime: `${YMD}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z` };
}

interface ParsedEndpoint { host: string; basePath: string; protocol: string; }
function parseEndpoint(endpoint: string): ParsedEndpoint {
  const u = new URL(endpoint);
  return { host: u.host, basePath: u.pathname.replace(/\/+$/, ''), protocol: u.protocol };
}

/** Chemin d'objet selon le style : path-style (/bucket/key) ou virtual-host (/key). */
function objectPath(cfg: S3Config, pe: ParsedEndpoint, key: string): { urlPath: string; canonPath: string } {
  const vhost = pe.host.startsWith(`${cfg.bucket}.`);
  const joined = vhost ? `/${key}` : `${pe.basePath}/${cfg.bucket}/${key}`;
  // canon resource path : chaque segment encodé URI-complet (RFC3986)
  const canonPath = '/' + joined.replace(/^\/+/, '').split('/').map((s) => rfc3986(s)).join('/');
  return { urlPath: joined, canonPath };
}

/** Encodage RFC3986 (comme encodeURIComponent mais en conservant -_.~ uniquement). */
function rfc3986(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function canonicalQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(params[k] ?? '')}`)
    .join('&');
}

async function signingKey(secret: string, date: string, region: string): Promise<ArrayBuffer> {
  const kDate = await hmac('AWS4' + secret, date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
}

/**
 * Requête S3 signée SigV4 (le corps est haché — payloads petits uniquement :
 * XML Complete/Abort, POST ?uploads, GET ListParts).
 */
async function s3Request(
  cfg: S3Config,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  key: string,
  params: Record<string, string> = {},
  body: string = '',
): Promise<{ status: number; text: string }> {
  const pe = parseEndpoint(cfg.endpoint);
  const { urlPath, canonPath } = objectPath(cfg, pe, key);
  const { date, datetime } = amzDate();
  // R2/S3 acceptent UNSIGNED-PAYLOAD pour x-amz-content-sha256 (comportement
  // aws4fetch). Envoyer le hash réel du corps provoque un SignatureDoesNotMatch
  // sur R2 dans plusieurs cas (cf. threads Cloudflare "Bad digest").
  const payloadHash = 'UNSIGNED-PAYLOAD';
  const headers: Record<string, string> = {
    host: pe.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': datetime,
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const headerBlock = Object.keys(headers).sort().map((h) => `${h}:${String(headers[h]).trim()}\n`).join('');
  const creq = [method, canonPath, canonicalQuery(params), headerBlock, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/${cfg.region}/s3/aws4_request`;
  const sis = ['AWS4-HMAC-SHA256', datetime, scope, await digestHex(creq)].join('\n');
  const sig = hex(await hmac(await signingKey(cfg.secretAccessKey, date, cfg.region), sis));
  headers['authorization'] =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`;

  const qs = canonicalQuery(params);
  const res = await fetch(`${pe.protocol}//${pe.host}${urlPath}${qs ? '?' + qs : ''}`, {
    method,
    headers,
    body: body || undefined,
  });
  return { status: res.status, text: await res.text().catch(() => '') };
}

/**
 * Presigned URL PUT (UploadPart) — signature par query string, payload NON
 * haché (UNSIGNED-PAYLOAD, supporté par R2 et S3) : le navigateur peut envoyer
 * le blob brut sans aucun en-tête supplémentaire signé.
 */
async function presignUploadPart(
  cfg: S3Config, key: string, uploadId: string, partNumber: number, expiresSec = 900,
): Promise<string> {
  const pe = parseEndpoint(cfg.endpoint);
  const { urlPath, canonPath } = objectPath(cfg, pe, key);
  const { date, datetime } = amzDate();
  const scope = `${date}/${cfg.region}/s3/aws4_request`;
  const params: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${cfg.accessKeyId}/${scope}`,
    'X-Amz-Date': datetime,
    'X-Amz-Expires': String(expiresSec),
    'X-Amz-SignedHeaders': 'host',
    'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD',
    partNumber: String(partNumber),
    uploadId,
  };
  const creq = ['PUT', canonPath, canonicalQuery(params), `host:${pe.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const sis = ['AWS4-HMAC-SHA256', datetime, scope, await digestHex(creq)].join('\n');
  const sig = hex(await hmac(await signingKey(cfg.secretAccessKey, date, cfg.region), sis));
  return `${pe.protocol}//${pe.host}${urlPath}?${canonicalQuery(params)}&X-Amz-Signature=${sig}`;
}

/** CreateMultipartUpload → { uploadId }. */
async function createMultipartUpload(cfg: S3Config, key: string, contentType: string) {
  const res = await s3Request(cfg, 'POST', key, { uploads: '' });
  if (res.status !== 200 || !/<UploadId>/.test(res.text)) {
    throw new Error(`CreateMultipartUpload échoué (HTTP ${res.status}) : ${res.text.slice(0, 300)}`);
  }
  return {
    uploadId: res.text.split('<UploadId>')[1].split('</UploadId>')[0],
    key: res.text.split('<Key>')[1]?.split('</Key>')[0] || key,
  };
}

/** ListParts (pagination troncature ignorée : < 1 000 parts attendues). */
async function listParts(cfg: S3Config, key: string, uploadId: string) {
  const res = await s3Request(cfg, 'GET', key, { uploadId });
  if (res.status !== 200) {
    throw new Error(`ListParts échoué (HTTP ${res.status}) : ${res.text.slice(0, 300)}`);
  }
  const parts: Array<{ PartNumber: number; ETag: string; Size: number }> = [];
  const re = /<Part>([\s\S]*?)<\/Part>/g;
  let m;
  while ((m = re.exec(res.text))) {
    const block = m[1];
    const grab = (tag: string) => block.split(`<${tag}>`)[1]?.split(`</${tag}>`)[0] || '';
    parts.push({ PartNumber: Number(grab('PartNumber')), ETag: grab('ETag'), Size: Number(grab('Size')) });
  }
  return parts.sort((a, b) => a.PartNumber - b.PartNumber);
}

/** CompleteMultipartUpload → { location, etag }. */
async function completeMultipartUpload(cfg: S3Config, key: string, uploadId: string,
  parts: Array<{ PartNumber: number; ETag: string }>) {
  const xml =
    '<CompleteMultipartUpload xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
    [...parts]
      .sort((a, b) => a.PartNumber - b.PartNumber)
      .map((p) => `<Part><PartNumber>${p.PartNumber}</PartNumber><ETag>${sanitizeEtag(p.ETag)}</ETag></Part>`)
      .join('') +
    '</CompleteMultipartUpload>';
  const res = await s3Request(cfg, 'POST', key, { uploadId }, xml);
  if (res.status !== 200 || (/<Error>/.test(res.text) && !/<Location>/)) {
    throw new Error(`CompleteMultipartUpload échoué (HTTP ${res.status}) : ${res.text.slice(0, 400)}`);
  }
  return {
    location: res.text.includes('<Location>') ? res.text.split('<Location>')[1].split('</Location>')[0] : '',
    etag: res.text.includes('<ETag>') ? res.text.split('<ETag>')[1].split('</ETag>')[0] : '',
  };
}

/** AbortMultipartUpload (nettoyage des uploads abandonnés). */
async function abortMultipartUpload(cfg: S3Config, key: string, uploadId: string) {
  const res = await s3Request(cfg, 'DELETE', key, { uploadId });
  // 204/200 = OK ; 404 NoSuchUpload = déjà parti, on traite comme un succès.
  if (res.status !== 204 && res.status !== 200 && !/NoSuchUpload/.test(res.text)) {
    throw new Error(`AbortMultipartUpload échoué (HTTP ${res.status}) : ${res.text.slice(0, 300)}`);
  }
  return true;
}

/** Un ETag ne contient que [A-Za-z0-9"-] ; tout le reste est éliminé (anti-injection XML). */
function sanitizeEtag(e: string): string {
  return String(e || '').replace(/[^A-Za-z0-9"\-]/g, '').replace(/"/g, '&quot;');
}

/** Nom d'objet S3 sûr : préfixe + slug(nom de fichier) + extension vidéo/audio autorisée. */
function buildObjectKey(fileName: string, prefix = 'videos'): string {
  const extRaw = (/\.([A-Za-z0-9]{1,5})$/.exec(fileName || '') || [])[1] || 'mp4';
  const ext = /^(mp4|m4v|mov|mkv|webm|avi|mp3|m4a|aac|wav|ogg|flac)$/i.test(extRaw) ? extRaw.toLowerCase() : 'bin';
  const stem = (fileName || 'file').replace(/\.[A-Za-z0-9]{1,5}$/, '');
  const slug = stem
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'file';
  return `${prefix}/${Date.now()}-${slug}.${ext}`;
}

/** URL publique finale : custom domain si publicBaseUrl, sinon endpoint path-style. */
function publicUrlFor(cfg: S3Config, key: string, publicBaseUrl?: string): string {
  const pe = parseEndpoint(cfg.endpoint);
  const encodedKey = key.split('/').map(rfc3986).join('/');
  const base = publicBaseUrl
    ? String(publicBaseUrl).replace(/\/+$/, '')
    : `${pe.protocol}//${pe.host}/${cfg.bucket}`;
  return `${base}/${encodedKey}`;
}
// ── END COPIED MODULE ──
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await requireAdmin(base44);
    if (!user) return json({ error: 'Unauthorized: admin requis' }, 401);

    const cfg = s3ConfigFromEnv(process.env);
    if (!cfg) return json({ error: 'S3 non configuré (voir docs/R2_SETUP.md)' }, 500);

    const body = await req.json().catch(() => ({}) as any);
    const svc = base44.asServiceRole;

    const session = body.session_id
      ? await findSessionBy(svc, { session_id: String(body.session_id) })
      : await findSessionBy(svc, { upload_id: String(body.uploadId || '') });
    if (!session) return json({ error: 'session inconnue' }, 404);

    // Idempotence : déjà finalisé → on renvoie l'URL existante (retry client sûr).
    if (session.status === 'done' && session.final_file_url) {
      return json({ success: true, file_url: session.final_file_url, key: session.s3_key });
    }
    if (session.status !== 'open' || !session.upload_id || !session.s3_key) {
      return json({ error: `session non finalisable (status=${session.status})` }, 400);
    }

    const uploadId = String(body.uploadId || session.upload_id);
    const key = String(body.key || session.s3_key);
    if (uploadId !== session.upload_id || key !== session.s3_key) {
      return json({ error: 'uploadId/key ne correspondent pas à la session' }, 400);
    }

    // Liste des parts : requête client contrôlée contre ListParts côté S3
    // (vérité terrain — évite un Complete sur une liste inventée/incomplète).
    const requested = normalizeRequestedParts(body.parts);
    let serverParts: Array<{ PartNumber: number; ETag: string }>;
    try {
      serverParts = (await listParts(cfg, key, uploadId)).map((p) => ({ PartNumber: p.PartNumber, ETag: etagPlain(p.ETag) }));
    } catch (e: any) {
      await markStatus(svc, session.id, 'error');
      return json({ error: `ListParts: ${e?.message}` }, 502);
    }
    if (!serverParts.length) {
      await markStatus(svc, session.id, 'error');
      return json({ error: 'aucune part reçue côté S3' }, 400);
    }
    const total = Number(session.total_chunks) || 0;
    if (total && serverParts.length !== total) {
      await markStatus(svc, session.id, 'error');
      return json({ error: `parts manquants : ${serverParts.length}/${total} reçues côté S3` }, 400);
    }
    if (requested.length) {
      const byNum = new Map(serverParts.map((p) => [p.PartNumber, p.ETag]));
      for (const p of requested) {
        const real = byNum.get(p.PartNumber);
        if (!real) return json({ error: `part ${p.PartNumber} inconnue côté S3` }, 400);
        if (p.ETag && p.ETag !== real) {
          return json({ error: `ETag divergent pour la part ${p.PartNumber} (re-upload requis)` }, 400);
        }
      }
    }
    // Contrôle de taille : toute part non finale doit faire exactement part_size
    // (sinon le fichier assemblé serait tronqué sans erreur S3).
    const declaredSize = Number(session.size) || 0;
    const partSize = Number(session.part_size) || 0;
    if (declaredSize && partSize) {
      const expectedLast = declaredSize - partSize * (Math.ceil(declaredSize / partSize) - 1);
      const maxPart = Math.ceil(declaredSize / partSize);
      const sizesOk = await verifySizes(cfg, key, uploadId, partSize, expectedLast, maxPart);
      if (!sizesOk.ok) { await markStatus(svc, session.id, 'error'); return json({ error: sizesOk.error }, 400); }
    }

    // Assemblage côté stockage — zéro mémoire serveur (aucun octet téléchargé ici).
    let location = '';
    try {
      const done = await completeMultipartUpload(cfg, key, uploadId, serverParts);
      location = done.location;
    } catch (e: any) {
      await markStatus(svc, session.id, 'error');
      return json({ error: String(e?.message || e) }, 502);
    }

    // URL publique : domaine custom R2 si fourni, sinon Location renvoyée par S3,
    // sinon endpoint path-style. Vérification HEAD best-effort (visibilité).
    const fileUrl = pickFinalUrl(cfg, key, location);
    await verifyPublic(svc, fileUrl); // n'est pas bloquant : journalise seulement

    await svc.entities[SESSIONS_ENTITY].update(session.id, {
      status: 'done',
      final_file_url: fileUrl,
      parts_json: JSON.stringify(serverParts),
    }).catch(() => {});

    return json({
      success: true,
      file_url: fileUrl,
      key,
      size: declaredSize,
      name: session.file_name || '',
      mime_type: session.mime_type || '',
      storage: 's3-multipart',
    });
  } catch (err: any) {
    return json({ error: err?.message || String(err) }, 500);
  }
}

function normalizeRequestedParts(raw: any): Array<{ PartNumber: number; ETag: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p: any) => ({ PartNumber: Number(p.partNumber ?? p.PartNumber), ETag: etagPlain(p.etag ?? p.ETag) }))
    .filter((p: any) => Number.isInteger(p.PartNumber) && p.PartNumber >= 1);
}

async function markStatus(svc: any, id: string, status: string) {
  try { await svc.entities[SESSIONS_ENTITY].update(id, { status }); } catch {}
}

// Taille réelle des parts via ListParts (le champ Size est renvoyé par S3/R2) —
// on le revérifie ici sans retélécharger aucun octet.
async function verifySizes(cfg: S3Config, key: string, uploadId: string,
  partSize: number, expectedLast: number, maxPart: number) {
  let detailed: any[];
  try { detailed = await listParts(cfg, key, uploadId); }
  catch (e: any) { return { ok: false, error: `ListParts: ${e?.message}` }; }
  for (const p of detailed) {
    const want = p.PartNumber === maxPart ? expectedLast : partSize;
    if (Number(p.Size) !== want) {
      return { ok: false, error: `part ${p.PartNumber} : ${p.Size} octets reçus, ${want} attendus — relancez l'upload depuis la reprise` };
    }
  }
  return { ok: true as const, error: '' };
}

function pickFinalUrl(cfg: S3Config, key: string, location: string): string {
  const pubBase = process.env.S3_PUBLIC_BASE_URL;
  if (pubBase) return publicUrlFor(cfg, key, String(pubBase));
  if (location && /^https?:\/\//.test(location)) return location.replace(/\/+$/, '');
  return publicUrlFor(cfg, key);
}

// HEAD best-effort : confirme que l'objet est bien en lecture publique
// (bucket R2 exposé via domaine public). Un échec n'est PAS bloquant — la
// propagation peut traîner ; le lecteur pourra re-tenter plus tard.
async function verifyPublic(svc: any, url: string) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) console.warn(`[completeMultipartUpload] objet non encore public (HTTP ${res.status}) : ${url}`);
  } catch (e: any) {
    console.warn('[completeMultipartUpload] vérification publique impossible :', e?.message);
  }
}