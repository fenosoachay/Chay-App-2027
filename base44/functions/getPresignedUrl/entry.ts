import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// ─────────────────────────────────────────────────────────────────────────────
// getPresignedUrl — trois modes (POST JSON /api/functions/getPresignedUrl) :
//   • défaut   { session_id?, uploadId, partNumber, key }
//              → { presignedUrl } (PUT pré-signé SigV4, 15 min). Le navigateur
//                envoie le blob BRUT directement au bucket R2 : les octets ne
//                passent jamais par Base44 (mémoire serveur ≈ 0).
//   • register { action:'register', session_id, partNumber, etag }
//              → mémorise l'ETag de la part dans UploadSession.parts_json
//                (métadonnées seules) et renvoie la progression.
//   • status   { action:'status', session_id }
//              → ListParts côté S3 (vérité terrain) + merge ETags →
//                { uploaded:[…], missing:[…], parts:[…] } pour la REPRISE après
//                coupure (échec au chunk #45/100 → seuls 46-100 sont renvoyés).
//
// Sécurité : admin uniquement ; une URL n'est signée que si (uploadId, key)
// correspond à une session « open » existante ; TTL défaut 15 min, plafond 1 h.
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

// ETag « brut » (sans échappement XML) : celui-ci part en JSON côté session.
function etagPlain(e: any): string { return String(e || '').replace(/"/g, '').trim(); }

const SESSIONS_ENTITY = 'UploadSession';
const PRESIGN_TTL_SEC = 15 * 60;         // 15 min (demande produit)
const MAX_PRESIGN_TTL_SEC = 60 * 60;     // plafond dur

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
  const endpoint = env?.S3_ENDPOINT;
  const bucket = env?.S3_BUCKET;
  const accessKeyId = env?.S3_ACCESS_KEY;
  const secretAccessKey = env?.S3_SECRET_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, bucket, accessKeyId, secretAccessKey, region: env?.S3_REGION || 'auto' };
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
  const payloadHash = await digestHex(body || '');
  const headers: Record<string, string> = {
    host: pe.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': datetime,
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const headerBlock = Object.keys(headers).sort().map((h) => `${h}:${String(headers[h]).trim()}\n`).join('');
  const creq = [method, canonPath, canonicalQuery(params), headerBlock + '\n', signedHeaders, payloadHash].join('\n');
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
  const creq = ['PUT', canonPath, canonicalQuery(params), `host:${pe.host}\n\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
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

    // ── Mode « status » (reprise) : ListParts côté S3 = vérité terrain ──────
    if (body.action === 'status') {
      const session = body.session_id ? await findSessionBy(svc, { session_id: String(body.session_id) }) : null;
      if (!session) return json({ error: 'session inconnue' }, 404);
      if (session.status === 'done' && session.final_file_url) {
        return json({ done: true, file_url: session.final_file_url, uploaded: [], missing: [], parts: [] });
      }
      if (!session.upload_id || !session.s3_key) return json({ uploaded: [], missing: [], parts: [] });
      let parts: any[] = [];
      try {
        parts = await listParts(cfg, session.s3_key, session.upload_id);
      } catch (e: any) {
        // Upload expiré/aboli côté S3 → le client repartira via initMultipartUpload.
        return json({ error: `ListParts: ${e?.message}`, expired: true, uploaded: [], missing: [], parts: [] });
      }
      const total = Number(session.total_chunks) || 0;
      const uploaded = parts.map((p) => p.PartNumber);
      const stored = parsePartsJson(session.parts_json);
      // Merge des ETags connus : priorité à la réponse S3 (vérité terrain).
      const byNum = new Map<number, string>();
      for (const p of stored) byNum.set(p.PartNumber, etagPlain(p.ETag));
      for (const p of parts) byNum.set(p.PartNumber, etagPlain(p.ETag));
      const merged = [...byNum.entries()].sort((a, b) => a[0] - b[0])
        .map(([PartNumber, ETag]) => ({ PartNumber, ETag }));
      // Persistance du cache ETags dans la session (légère : < 100 Ko max).
      await svc.entities[SESSIONS_ENTITY].update(session.id, {
        parts_json: JSON.stringify(merged),
        uploaded_indices: uploaded,
      }).catch(() => {});
      const upSet = new Set(uploaded);
      const missing: number[] = [];
      for (let k = 1; k <= total; k++) if (!upSet.has(k)) missing.push(k);
      return json({ uploaded, missing, parts: merged, partSize: Number(session.part_size) || 0, totalParts: total });
    }

    // ── Mode « register » : le client confirme un part uploadé (ETag reçu) ──
    if (body.action === 'register') {
      const session = await findSessionBy(svc, { session_id: String(body.session_id || '') });
      if (!session) return json({ error: 'session inconnue — relancer init' }, 404);
      const partNumber = Number(body.partNumber);
      const etag = etagPlain(body.etag);
      if (!Number.isInteger(partNumber) || partNumber < 1 || !etag) {
        return json({ error: 'partNumber/etag invalides' }, 400);
      }
      const stored = parsePartsJson(session.parts_json);
      const idx = stored.findIndex((p) => p.PartNumber === partNumber);
      if (idx >= 0) { if (stored[idx].ETag !== etag) stored[idx] = { PartNumber: partNumber, ETag: etag }; }
      else stored.push({ PartNumber: partNumber, ETag: etag });
      stored.sort((a, b) => a.PartNumber - b.PartNumber);
      const uploadedIndices = [...new Set(stored.map((p) => p.PartNumber))].sort((a, b) => a - b);
      await svc.entities[SESSIONS_ENTITY].update(session.id, {
        parts_json: JSON.stringify(stored),
        uploaded_indices: uploadedIndices,
      });
      return json({ success: true, index: partNumber, uploaded: uploadedIndices.length, total: Number(session.total_chunks) || 0 });
    }

    // ── Mode défaut : presigner une URL PUT pour une part ───────────────────
    const uploadId = String(body.uploadId || '');
    const key = String(body.key || '');
    const partNumber = Number(body.partNumber);
    if (!uploadId || !key || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
      return json({ error: 'uploadId/key/partNumber invalides' }, 400);
    }
    // Anti-abus : (uploadId, key) doit correspondre à UNE session « open » connue.
    const session = body.session_id
      ? await findSessionBy(svc, { session_id: String(body.session_id) })
      : await findSessionBy(svc, { upload_id: uploadId });
    if (!session || session.status !== 'open' || session.upload_id !== uploadId || session.s3_key !== key) {
      return json({ error: 'session inconnue ou expirée — relancer initMultipartUpload' }, 404);
    }
    const expiresSec = Math.min(Number(body.expiresIn) || PRESIGN_TTL_SEC, MAX_PRESIGN_TTL_SEC);
    const presignedUrl = await presignUploadPart(cfg, key, uploadId, partNumber, expiresSec);
    return json({ presignedUrl, expiresIn: expiresSec, partNumber });
  } catch (err: any) {
    return json({ error: err?.message || String(err) }, 500);
  }
}
