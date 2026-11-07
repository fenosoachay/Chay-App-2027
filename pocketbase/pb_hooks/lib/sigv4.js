// Signature AWS Signature Version 4 (S3 / Cloudflare R2) en JavaScript pur.
// Aucune dépendance : fonctionne dans le JSVM de PocketBase (require) et dans Node (tests).
// Pourquoi pas $security.hs256 : SigV4 enchaîne 4 HMAC dont chaque clé est le résultat BINAIRE
// du précédent ; hs256 prend une clé texte et renvoie de l'hexadécimal, ce qui ne s'enchaîne pas.
//
// Vérifiée par pocketbase/tests/sigv4.test.mjs (vecteurs officiels AWS + comparaison node:crypto)
// et, en conditions réelles, par le faux S3 local qui refuse toute requête mal signée.

// ── Octets ───────────────────────────────────────────────────────────────────

/** Chaîne -> octets UTF-8 (tableau de nombres). */
function utf8(str) {
  const s = String(str);
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

const bytesOf = (v) => (typeof v === 'string' ? utf8(v) : Array.prototype.slice.call(v));

function hex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
  return s;
}

// ── SHA-256 (FIPS 180-4) ─────────────────────────────────────────────────────

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const rotr = (x, n) => (x >>> n) | (x << (32 - n));

/** SHA-256 d'octets ou d'une chaîne (UTF-8) -> 32 octets. */
function sha256(input) {
  const msg = bytesOf(input);
  const len = msg.length;
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  // longueur en bits sur 64 bits (big-endian) ; les messages restent < 2^53 bits
  const bitsHi = Math.floor((len * 8) / 0x100000000);
  const bitsLo = (len * 8) >>> 0;
  msg.push((bitsHi >>> 24) & 255, (bitsHi >>> 16) & 255, (bitsHi >>> 8) & 255, bitsHi & 255);
  msg.push((bitsLo >>> 24) & 255, (bitsLo >>> 16) & 255, (bitsLo >>> 8) & 255, bitsLo & 255);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Array(64);
  for (let off = 0; off < msg.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] = ((msg[j] << 24) | (msg[j + 1] << 16) | (msg[j + 2] << 8) | msg[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  const out = [];
  const words = [h0, h1, h2, h3, h4, h5, h6, h7];
  for (let i = 0; i < 8; i++) out.push((words[i] >>> 24) & 255, (words[i] >>> 16) & 255, (words[i] >>> 8) & 255, words[i] & 255);
  return out;
}

/** HMAC-SHA256 (RFC 2104) ; clé et message : octets ou chaîne (UTF-8). */
function hmac(key, message) {
  let k = bytesOf(key);
  if (k.length > 64) k = sha256(k);
  while (k.length < 64) k.push(0);
  const ipad = [];
  const opad = [];
  for (let i = 0; i < 64; i++) {
    ipad.push(k[i] ^ 0x36);
    opad.push(k[i] ^ 0x5c);
  }
  return sha256(opad.concat(sha256(ipad.concat(bytesOf(message)))));
}

const sha256Hex = (input) => hex(sha256(input));
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';

// ── SigV4 ────────────────────────────────────────────────────────────────────

/** Encodage URI d'AWS (RFC 3986) : tout sauf A-Z a-z 0-9 - . _ ~ ; « / » conservé si keepSlash. */
function uriEncode(str, keepSlash) {
  const bytes = utf8(str);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    const ch = String.fromCharCode(b);
    if ((b >= 65 && b <= 90) || (b >= 97 && b <= 122) || (b >= 48 && b <= 57) || ch === '-' || ch === '.' || ch === '_' || ch === '~' || (keepSlash && ch === '/')) out += ch;
    else out += '%' + (b < 16 ? '0' : '') + b.toString(16).toUpperCase();
  }
  return out;
}

/** Date -> { amzDate: "AAAAMMJJTHHMMSSZ", dateStamp: "AAAAMMJJ" }. */
function amzDates(date) {
  const iso = (date || new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function signingKey(secret, dateStamp, region, service) {
  const kDate = hmac('AWS4' + secret, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

/** Requête canonique de query : clés et valeurs encodées, triées par clé puis valeur. */
function canonicalQuery(query) {
  const pairs = [];
  const keys = Object.keys(query || {});
  for (let i = 0; i < keys.length; i++) {
    const v = query[keys[i]];
    pairs.push([uriEncode(keys[i]), uriEncode(v === undefined || v === null ? '' : String(v))]);
  }
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return pairs.map((p) => p[0] + '=' + p[1]).join('&');
}

/**
 * Cœur de SigV4. `path` est le chemin NON encodé (ex. "/bucket/videos/a b.mp4") : chaque segment
 * est encodé une seule fois (règle S3). `headers` doit contenir host. Renvoie la signature et
 * les éléments intermédiaires (utiles aux tests).
 */
function sign(opts) {
  const region = opts.region || 'auto';
  const service = opts.service || 's3';
  const headers = {};
  const names = Object.keys(opts.headers || {});
  for (let i = 0; i < names.length; i++) {
    headers[names[i].toLowerCase()] = String(opts.headers[names[i]]).trim().replace(/\s+/g, ' ');
  }
  const signedNames = Object.keys(headers).sort();
  const canonicalHeaders = signedNames.map((n) => n + ':' + headers[n] + '\n').join('');
  const signedHeaders = signedNames.join(';');
  const canonicalRequest = [
    opts.method.toUpperCase(),
    uriEncode(opts.path || '/', true),
    canonicalQuery(opts.query),
    canonicalHeaders,
    signedHeaders,
    opts.payloadHash,
  ].join('\n');
  const scope = opts.dateStamp + '/' + region + '/' + service + '/aws4_request';
  const stringToSign = ['AWS4-HMAC-SHA256', opts.amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signature = hex(hmac(signingKey(opts.secretAccessKey, opts.dateStamp, region, service), stringToSign));
  return { signature, signedHeaders, scope, canonicalRequest, stringToSign };
}

/**
 * En-têtes signés pour une requête serveur -> S3 (Authorization, x-amz-date, x-amz-content-sha256).
 * opts : method, host, path, query, headers (en plus de host), body (chaîne, facultatif),
 *        accessKeyId, secretAccessKey, region, service, date.
 */
function signHeaders(opts) {
  const d = opts.amzDate ? { amzDate: opts.amzDate, dateStamp: opts.amzDate.slice(0, 8) } : amzDates(opts.date);
  const payloadHash = opts.payloadHash || (opts.body ? sha256Hex(opts.body) : EMPTY_SHA256);
  const headers = { host: opts.host };
  const extra = Object.keys(opts.headers || {});
  for (let i = 0; i < extra.length; i++) headers[extra[i].toLowerCase()] = opts.headers[extra[i]];
  headers['x-amz-content-sha256'] = payloadHash;
  headers['x-amz-date'] = d.amzDate;
  const s = sign({
    method: opts.method, path: opts.path, query: opts.query, headers, payloadHash,
    amzDate: d.amzDate, dateStamp: d.dateStamp, secretAccessKey: opts.secretAccessKey, region: opts.region, service: opts.service,
  });
  const out = {};
  const keys = Object.keys(headers);
  for (let i = 0; i < keys.length; i++) if (keys[i] !== 'host') out[keys[i]] = headers[keys[i]];
  out.authorization = 'AWS4-HMAC-SHA256 Credential=' + opts.accessKeyId + '/' + s.scope
    + ', SignedHeaders=' + s.signedHeaders + ', Signature=' + s.signature;
  return out;
}

/**
 * URL présignée (signature dans la query). opts : method, protocol ("https:"), host, path, query,
 * headers signés en plus de host (ex. { 'content-length': n } pour imposer la taille d'une part),
 * expires (secondes), accessKeyId, secretAccessKey, region, service, date.
 */
function presign(opts) {
  const region = opts.region || 'auto';
  const service = opts.service || 's3';
  const d = opts.amzDate ? { amzDate: opts.amzDate, dateStamp: opts.amzDate.slice(0, 8) } : amzDates(opts.date);
  const headers = { host: opts.host };
  const extra = Object.keys(opts.headers || {});
  for (let i = 0; i < extra.length; i++) headers[extra[i].toLowerCase()] = opts.headers[extra[i]];
  const signedHeaders = Object.keys(headers).sort().join(';');
  const query = {};
  const q = Object.keys(opts.query || {});
  for (let i = 0; i < q.length; i++) query[q[i]] = opts.query[q[i]];
  query['X-Amz-Algorithm'] = 'AWS4-HMAC-SHA256';
  query['X-Amz-Credential'] = opts.accessKeyId + '/' + d.dateStamp + '/' + region + '/' + service + '/aws4_request';
  query['X-Amz-Date'] = d.amzDate;
  query['X-Amz-Expires'] = String(opts.expires || 900);
  query['X-Amz-SignedHeaders'] = signedHeaders;
  const s = sign({
    method: opts.method, path: opts.path, query, headers, payloadHash: UNSIGNED_PAYLOAD,
    amzDate: d.amzDate, dateStamp: d.dateStamp, secretAccessKey: opts.secretAccessKey, region, service,
  });
  return (opts.protocol || 'https:') + '//' + opts.host + uriEncode(opts.path || '/', true)
    + '?' + canonicalQuery(query) + '&X-Amz-Signature=' + s.signature;
}

module.exports = {
  utf8,
  hex,
  sha256,
  sha256Hex,
  hmac,
  uriEncode,
  amzDates,
  signingKey,
  canonicalQuery,
  sign,
  signHeaders,
  presign,
  EMPTY_SHA256,
  UNSIGNED_PAYLOAD,
};
