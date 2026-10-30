// ─────────────────────────────────────────────────────────────────────────────
// shared/s3.ts — client S3 minimal « zéro dépendance npm » pour les fonctions
// serverless Base44 (Deno). Signatures AWS SigV4 calculées avec WebCrypto.
//
// Compatible Cloudflare R2 (region "auto", path-style) et AWS S3 (virtual-host
// style détecté automatiquement si l'hôte commence par `<bucket>.`).
//
// Pourquoi pas @aws-sdk/* ? Les fonctions Base44 importent les paquets via
// `npm:`; le SDK complet (~1 Mo de JS) alourdit le cold-start et n'apporte
// rien ici : nous n'avons besoin que de 5 opérations signées + des presigned
// URLs PUT. Tout tient dans ce fichier, testable hors plateforme.
//
// ⚠️ Limite structurelle de la plateforme : les fonctions backend sont déployées
// SEULES (pas les fichiers voisins du repo frontend), donc chaque fonction qui
// utilise ce module embarque sa propre copie (marqueurs BEGIN/END COPIED ci-
// après). Modifier ce fichier → re-copier dans les fonctions (ou `node
// base44/functions/shared/build.mjs` si un script de sync est ajouté).
// ─────────────────────────────────────────────────────────────────────────────

export interface S3Config {
  endpoint: string;   // ex: https://<account-id>.r2.cloudflarestorage.com
  bucket: string;     // ex: chay-videos
  accessKeyId: string;
  secretAccessKey: string;
  region: string;     // "auto" pour R2
}

/** Charge la config depuis l'environnement ; null si non configuré. */
export function s3ConfigFromEnv(env: any): S3Config | null {
  // trim systématique : un secret collé avec un espace/newline final fait
  // diverger la signature SigV4 (« SignatureDoesNotMatch ») sans autre indice.
  const endpoint = String(env?.S3_ENDPOINT || '').trim().replace(/\/+$/, '');
  const bucket = String(env?.S3_BUCKET || '').trim();
  const accessKeyId = String(env?.S3_ACCESS_KEY || '').trim();
  const secretAccessKey = String(env?.S3_SECRET_KEY || '').trim();
  const region = String(env?.S3_REGION || '').trim() || 'auto';
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  // Si l'endpoint contient déjà le bucket dans le chemin (ex:
  // https://<acct>.r2.cloudflarestorage.com/<bucket>), on le retire : sinon le
  // canonPath doublerait le bucket et la signature serait rejetée.
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
export function amzDate(d = new Date()): { date: string; datetime: string } {
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
export async function s3Request(
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
export async function presignUploadPart(
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
export async function createMultipartUpload(cfg: S3Config, key: string, contentType: string) {
  const res = await s3Request(cfg, 'POST', key, { uploads: '' });
  if (res.status !== 200 || !/<UploadId>/.test(res.text)) {
    throw new Error(`CreateMultipartUpload échoué (HTTP ${res.status}) : ${res.text.slice(0, 300)}`);
  }
  return {
    uploadId: res.text.split('<UploadId>')[1].split('</UploadId>')[0],
    key: res.text.split('<Key>')[1]?.split('</Key>')[0] || key,
  };
}

/**
 * ListParts — récupère TOUTES les parts en gérant la pagination S3/R2.
 *
 * Pagination (fix 2026-10) : R2 renvoie au plus `max-parts` parts par page
 * (1 000 par défaut, mais R2 peut tronquer davantage selon la taille de la
 * réponse). L'appel initial sans marqueur retourne une première page ; si
 * <IsTruncated>true</IsTruncated>, on rappelle avec `part-number-marker` =
 * NextPartNumberMarker (défaut : dernier PartNumber vu) jusqu'à épuisement.
 * Sans cette boucle, un upload de 460 parts pouvait n'en déclarer que 117 →
 * faux « parts manquants : 117/460 » et CompleteMultipartUpload rejeté.
 */
export async function listParts(cfg: S3Config, key: string, uploadId: string) {
  const allParts: Array<{ PartNumber: number; ETag: string; Size: number }> = [];
  let marker = 0;
  let isTruncated = true;
  let guard = 0; // sécurité anti-boucle-infinie : 10 pages max (théo : 10 000 parts)

  while (isTruncated && guard++ < 10) {
    const params: Record<string, string> = { uploadId };
    if (marker > 0) params['part-number-marker'] = String(marker);
    const res = await s3Request(cfg, 'GET', key, params);
    if (res.status !== 200) {
      throw new Error(`ListParts échoué (HTTP ${res.status}) : ${res.text.slice(0, 300)}`);
    }

    const before = allParts.length;
    const re = /<Part>([\s\S]*?)<\/Part>/g;
    let m;
    while ((m = re.exec(res.text))) {
      const block = m[1];
      const grab = (tag: string) => block.split(`<${tag}>`)[1]?.split(`</${tag}>`)[0] || '';
      const partNumber = Number(grab('PartNumber'));
      allParts.push({ PartNumber: partNumber, ETag: grab('ETag'), Size: Number(grab('Size')) });
      if (Number.isInteger(partNumber)) marker = Math.max(marker, partNumber);
    }

    // NextPartNumberMarker : valeur authoritative du serveur pour le prochain
    // marqueur (S3/R2 le renvoient à chaque page).
    const next = res.text.includes('<NextPartNumberMarker>')
      ? Number(res.text.split('<NextPartNumberMarker>')[1].split('</NextPartNumberMarker>')[0])
      : NaN;
    if (Number.isFinite(next) && next > 0) marker = next;

    const trunc = res.text.includes('<IsTruncated>')
      ? res.text.split('<IsTruncated>')[1].split('</IsTruncated>')[0].trim()
      : 'false';
    isTruncated = trunc === 'true';

    // Filet de sécurité : page « tronquée » mais aucune part nouvelle → on stoppe
    // (évite une boucle infinie si le serveur ignore le marqueur).
    if (isTruncated && allParts.length === before) break;
  }

  return allParts.sort((a, b) => a.PartNumber - b.PartNumber);
}

/** CompleteMultipartUpload → { location, etag }. */
export async function completeMultipartUpload(cfg: S3Config, key: string, uploadId: string,
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
export async function abortMultipartUpload(cfg: S3Config, key: string, uploadId: string) {
  const res = await s3Request(cfg, 'DELETE', key, { uploadId });
  // 204/200 = OK ; 404 NoSuchUpload = déjà parti, on traite comme un succès.
  if (res.status !== 204 && res.status !== 200 && !/NoSuchUpload/.test(res.text)) {
    throw new Error(`AbortMultipartUpload échoué (HTTP ${res.status}) : ${res.text.slice(0, 300)}`);
  }
  return true;
}

/** Un ETag ne contient que [A-Za-z0-9"-] ; tout le reste est éliminé (anti-injection XML). */
export function sanitizeEtag(e: string): string {
  return String(e || '').replace(/[^A-Za-z0-9"\-]/g, '').replace(/"/g, '&quot;');
}

/** Nom d'objet S3 sûr : préfixe + slug(nom de fichier) + extension vidéo/audio autorisée. */
export function buildObjectKey(fileName: string, prefix = 'videos'): string {
  const extRaw = (/\.([A-Za-z0-9]{1,5})$/.exec(fileName || '') || [])[1] || 'mp4';
  const ext = /^(mp4|m4v|mov|mkv|webm|avi|mp3|m4a|aac|wav|ogg|flac)$/i.test(extRaw) ? extRaw.toLowerCase() : 'bin';
  const stem = (fileName || 'file').replace(/\.[A-Za-z0-9]{1,5}$/, '');
  const slug = stem
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'file';
  return `${prefix}/${Date.now()}-${slug}.${ext}`;
}

/** URL publique finale : custom domain si publicBaseUrl, sinon endpoint path-style. */
export function publicUrlFor(cfg: S3Config, key: string, publicBaseUrl?: string): string {
  const pe = parseEndpoint(cfg.endpoint);
  const encodedKey = key.split('/').map(rfc3986).join('/');
  const base = publicBaseUrl
    ? String(publicBaseUrl).replace(/\/+$/, '')
    : `${pe.protocol}//${pe.host}/${cfg.bucket}`;
  return `${base}/${encodedKey}`;
}