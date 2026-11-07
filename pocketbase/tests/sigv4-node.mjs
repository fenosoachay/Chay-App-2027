// Implémentation SigV4 de RÉFÉRENCE, indépendante de pb_hooks/lib/sigv4.js : uniquement node:crypto.
// Sert à vérifier la version JavaScript pur (tests) et à contrôler les signatures dans le faux S3.
import crypto from 'node:crypto';
import fs from 'node:fs';

export const sha256Hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
export const hmacBuf = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

export function uriEncode(str, keepSlash = false) {
  return Buffer.from(String(str), 'utf8').reduce((out, b) => {
    const c = String.fromCharCode(b);
    if (/[A-Za-z0-9\-._~]/.test(c) || (keepSlash && c === '/')) return out + c;
    return `${out}%${b.toString(16).toUpperCase().padStart(2, '0')}`;
  }, '');
}

export function canonicalQuery(params) {
  return params
    .map(([k, v]) => [uriEncode(k), uriEncode(v ?? '')])
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

export function signature({ method, path, queryPairs, headers, signedHeaders, payloadHash, amzDate, region, service, secret }) {
  const names = signedHeaders.split(';');
  const canonicalHeaders = names.map((n) => `${n}:${String(headers[n] ?? '').trim().replace(/\s+/g, ' ')}\n`).join('');
  const canonicalRequest = [method, uriEncode(path, true), canonicalQuery(queryPairs), canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  let key = hmacBuf(`AWS4${secret}`, dateStamp);
  for (const part of [region, service, 'aws4_request']) key = hmacBuf(key, part);
  return { signature: hmacBuf(key, stringToSign).toString('hex'), canonicalRequest, scope };
}

/** Clés du faux S3 local (fichier hors dépôt, créé au premier lancement ; jamais affiché). */
export const FAUX_S3_ENV = process.env.FAUX_S3_ENV || 'C:\\PB-local\\faux-s3.env';
export function loadFauxS3Env() {
  if (!fs.existsSync(FAUX_S3_ENV)) {
    const lines = [
      `R2_ENDPOINT=http://127.0.0.1:9000`,
      `R2_BUCKET=chay-videos`,
      `R2_REGION=auto`,
      `R2_ACCESS_KEY_ID=FAUX${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
      `R2_SECRET_ACCESS_KEY=${crypto.randomBytes(30).toString('base64url')}`,
      `R2_PUBLIC_BASE_URL=http://127.0.0.1:9000/public/chay-videos`,
    ];
    fs.writeFileSync(FAUX_S3_ENV, `${lines.join('\n')}\n`, { mode: 0o600 });
  }
  const env = {};
  for (const line of fs.readFileSync(FAUX_S3_ENV, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

/** Requête signée (en-têtes) vers le faux S3, pour les tests. */
export async function s3Fetch(env, method, path, { query = [], body, headers = {} } = {}) {
  const url = new URL(env.R2_ENDPOINT);
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const payloadHash = sha256Hex(body ?? '');
  const h = { host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, ...headers };
  const signedHeaders = Object.keys(h).sort().join(';');
  const { signature: sig, scope } = signature({
    method, path, queryPairs: query, headers: h, signedHeaders, payloadHash, amzDate,
    region: env.R2_REGION || 'auto', service: 's3', secret: env.R2_SECRET_ACCESS_KEY,
  });
  const qs = canonicalQuery(query);
  const res = await fetch(`${url.origin}${uriEncode(path, true)}${qs ? `?${qs}` : ''}`, {
    method,
    body,
    headers: {
      ...Object.fromEntries(Object.entries(h).filter(([k]) => k !== 'host')),
      authorization: `AWS4-HMAC-SHA256 Credential=${env.R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`,
    },
  });
  return { status: res.status, text: await res.text(), headers: res.headers };
}
