// Cryptographie du sidecar push, uniquement avec node:crypto (aucune dépendance npm).
//  - JWT RS256 du compte de service Firebase (OAuth 2.0, FCM HTTP v1) ;
//  - JWT VAPID ES256 (RFC 8292) ;
//  - chiffrement Web Push aes128gcm (RFC 8291 + RFC 8188).
import crypto from 'node:crypto';

export const b64u = (buf) => Buffer.from(buf).toString('base64url');
export const fromB64u = (s) => Buffer.from(String(s || ''), 'base64url');
const jsonB64u = (obj) => b64u(Buffer.from(JSON.stringify(obj), 'utf8'));

// ── FCM : jeton OAuth du compte de service ───────────────────────────────────
export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
export const GOOGLE_TOKEN_URI = 'https://oauth2.googleapis.com/token';

/** Assertion JWT RS256 (grant type jwt-bearer) pour le compte de service `sa`. */
export function serviceAccountJwt(sa, nowSec = Math.floor(Date.now() / 1000)) {
  const header = { alg: 'RS256', typ: 'JWT', kid: sa.private_key_id };
  const payload = {
    iss: sa.client_email,
    scope: FCM_SCOPE,
    aud: sa.token_uri || GOOGLE_TOKEN_URI,
    iat: nowSec,
    exp: nowSec + 3600,
  };
  const input = `${jsonB64u(header)}.${jsonB64u(payload)}`;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(input), sa.private_key);
  return `${input}.${b64u(sig)}`;
}

/** Lit FIREBASE_SERVICE_ACCOUNT : JSON brut ou chemin d'un fichier JSON. Erreur claire, sans contenu. */
export function parseServiceAccount(raw, readFile) {
  if (!raw) return { sa: null, error: 'FIREBASE_SERVICE_ACCOUNT manquant' };
  let text = String(raw).trim();
  if (!text.startsWith('{')) {
    try { text = readFile(text); } catch { return { sa: null, error: 'FIREBASE_SERVICE_ACCOUNT : fichier illisible' }; }
  }
  let sa;
  try { sa = JSON.parse(text); } catch { return { sa: null, error: 'FIREBASE_SERVICE_ACCOUNT invalide (JSON)' }; }
  for (const k of ['project_id', 'client_email', 'private_key']) {
    if (!sa[k]) return { sa: null, error: `FIREBASE_SERVICE_ACCOUNT invalide (${k} manquant)` };
  }
  try { crypto.createPrivateKey(sa.private_key); } catch { return { sa: null, error: 'FIREBASE_SERVICE_ACCOUNT invalide (clé privée)' }; }
  return { sa, error: null };
}

// ── VAPID ────────────────────────────────────────────────────────────────────
/** Clé publique (65 octets, non compressée) correspondant à une clé privée VAPID (32 octets, base64url). */
export function vapidPublicFromPrivate(privateB64u) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(fromB64u(privateB64u));
  return b64u(ecdh.getPublicKey(null, 'uncompressed'));
}

/** Vérifie la paire VAPID ; renvoie un message d'erreur (sans valeur) ou null. */
export function checkVapid(publicB64u, privateB64u) {
  if (!publicB64u || !privateB64u) return 'no_vapid_key';
  try {
    if (fromB64u(privateB64u).length !== 32 || fromB64u(publicB64u).length !== 65) return 'vapid_key_invalid';
    return vapidPublicFromPrivate(privateB64u) === b64u(fromB64u(publicB64u)) ? null : 'vapid_key_mismatch';
  } catch {
    return 'vapid_key_invalid';
  }
}

function vapidKeyObject(publicB64u, privateB64u) {
  const pub = fromB64u(publicB64u);
  return crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: b64u(fromB64u(privateB64u)), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: 'jwk',
  });
}

/** En-tête Authorization VAPID pour l'adresse d'abonnement `endpoint`. */
export function vapidAuthorization(endpoint, subject, publicB64u, privateB64u, nowSec = Math.floor(Date.now() / 1000)) {
  const aud = new URL(endpoint).origin;
  const input = `${jsonB64u({ typ: 'JWT', alg: 'ES256' })}.${jsonB64u({ aud, exp: nowSec + 12 * 3600, sub: subject })}`;
  const sig = crypto.sign('sha256', Buffer.from(input), { key: vapidKeyObject(publicB64u, privateB64u), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${input}.${b64u(sig)}, k=${b64u(fromB64u(publicB64u))}`;
}

// ── Chiffrement Web Push (RFC 8291, aes128gcm) ───────────────────────────────
const RECORD_SIZE = 4096;

/**
 * Chiffre `plaintext` pour l'abonnement (clé p256dh, secret auth).
 * `opts.salt` et `opts.asPrivate` ne servent qu'aux vecteurs de test de la RFC.
 */
export function encryptWebPush(plaintext, p256dhB64u, authB64u, opts = {}) {
  const uaPublic = fromB64u(p256dhB64u);
  const authSecret = fromB64u(authB64u);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('p256dh invalide');
  if (authSecret.length !== 16) throw new Error('auth invalide');
  const ecdh = crypto.createECDH('prime256v1');
  if (opts.asPrivate) ecdh.setPrivateKey(fromB64u(opts.asPrivate));
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey(null, 'uncompressed');
  const ecdhSecret = ecdh.computeSecret(uaPublic);
  const salt = opts.salt ? fromB64u(opts.salt) : crypto.randomBytes(16);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', ecdhSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));

  const data = Buffer.concat([Buffer.from(plaintext), Buffer.from([2])]); // délimiteur du dernier enregistrement
  if (data.length + 16 > RECORD_SIZE) throw new Error('charge utile trop grande');
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}

/** Déchiffrement (côté navigateur) : sert aux tests et au faux service Web Push. */
export function decryptWebPush(buf, uaPrivateB64u, authB64u) {
  const salt = buf.subarray(0, 16);
  const idLen = buf.readUInt8(20);
  const asPublic = buf.subarray(21, 21 + idLen);
  const ct = buf.subarray(21 + idLen);
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(fromB64u(uaPrivateB64u));
  const uaPublic = ecdh.getPublicKey(null, 'uncompressed');
  const ecdhSecret = ecdh.computeSecret(asPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', ecdhSecret, fromB64u(authB64u), keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--;
  if (plain[end] !== 2) throw new Error('délimiteur absent');
  return plain.subarray(0, end);
}

/** Comparaison à temps constant de deux secrets (longueurs quelconques). */
export function sameSecret(a, b) {
  const ha = crypto.createHash('sha256').update(String(a || '')).digest();
  const hb = crypto.createHash('sha256').update(String(b || '')).digest();
  return crypto.timingSafeEqual(ha, hb) && Boolean(a) && Boolean(b);
}
