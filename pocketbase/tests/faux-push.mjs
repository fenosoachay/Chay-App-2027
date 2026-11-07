#!/usr/bin/env node
// Faux services push (FCM HTTP v1 + OAuth Google + service Web Push), UNIQUEMENT sur 127.0.0.1.
// Aucun envoi réel : les messages sont vérifiés puis gardés en mémoire pour les tests.
//   node pocketbase/tests/faux-push.mjs            (port FAUX_PUSH_PORT, défaut 9100)
// Au premier lancement, crée (hors dépôt, ne pas partager) :
//   C:\PB-local\faux-push.env           secret partagé, clés VAPID de test, réglages du sidecar
//   C:\PB-local\faux-firebase-sa.json   faux compte de service (clé RSA générée localement)
// Vérifications : JWT RS256 du compte de service (signature, iss, scope, aud, durée), jeton d'accès,
// JWT VAPID ES256 (signature, aud, exp, sub, clé k), en-têtes Web Push. Toute requête mal signée est refusée.
// Jetons / points d'accès spéciaux : « invalide-* » -> UNREGISTERED / 410, « absent-* » -> 404,
// « surcharge-* » -> 503 permanent, « instable-* » -> 503 une fois puis accepté.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { b64u, fromB64u, vapidPublicFromPrivate } from '../sidecar-push/crypto-push.mjs';

export const PORT = Number(process.env.FAUX_PUSH_PORT || 9100);
export const ORIGIN = `http://127.0.0.1:${PORT}`;
const ENV_FILE = process.env.FAUX_PUSH_ENV || 'C:\\PB-local\\faux-push.env';
const SA_FILE = process.env.FAUX_PUSH_SA || 'C:\\PB-local\\faux-firebase-sa.json';
export const PROJECT_ID = 'chay-faux';

/** Crée au besoin puis lit la configuration de test (jamais affichée). */
export function loadFauxPushEnv() {
  if (!fs.existsSync(SA_FILE)) {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    fs.writeFileSync(SA_FILE, JSON.stringify({
      type: 'service_account',
      project_id: PROJECT_ID,
      private_key_id: crypto.randomBytes(20).toString('hex'),
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      client_email: `push@${PROJECT_ID}.iam.test`,
      token_uri: `${ORIGIN}/token`,
    }, null, 2));
  }
  if (!fs.existsSync(ENV_FILE)) {
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    const lines = {
      PUSH_SIDECAR_URL: 'http://127.0.0.1:8091',
      PUSH_PORT: '8091',
      PUSH_SIDECAR_SECRET: crypto.randomBytes(32).toString('base64url'),
      FIREBASE_SERVICE_ACCOUNT: SA_FILE.split('\\').join('/'), // barres obliques : lisible par PowerShell comme par sh
      VAPID_PUBLIC_KEY: b64u(ecdh.getPublicKey(null, 'uncompressed')),
      VAPID_PRIVATE_KEY: b64u(ecdh.getPrivateKey()),
      VAPID_SUBJECT: 'mailto:test@chay.test',
      FCM_API_BASE: ORIGIN,
      PUSH_LOCAL_ONLY: '1',
    };
    fs.writeFileSync(ENV_FILE, Object.entries(lines).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  }
  const env = {};
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0) env[line.slice(0, i)] = line.slice(i + 1);
  }
  return env;
}

// ── Serveur ──────────────────────────────────────────────────────────────────
function startServer() {
  const env = loadFauxPushEnv();
  const sa = JSON.parse(fs.readFileSync(SA_FILE, 'utf8'));
  const saPublic = crypto.createPublicKey(sa.private_key);
  if (vapidPublicFromPrivate(env.VAPID_PRIVATE_KEY) !== env.VAPID_PUBLIC_KEY) throw new Error('paire VAPID de test incohérente');
  const vapidKey = crypto.createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: b64u(fromB64u(env.VAPID_PUBLIC_KEY).subarray(1, 33)), y: b64u(fromB64u(env.VAPID_PUBLIC_KEY).subarray(33, 65)) },
    format: 'jwk',
  });
  const accessTokens = new Set();
  const seenUnstable = new Set();
  let captures = [];
  const rejects = { token: 0, fcm_auth: 0, vapid: 0, headers: 0 };

  const decodeJwt = (jwt) => {
    const [h, p, s] = String(jwt || '').split('.');
    if (!h || !p || !s) return null;
    try {
      return { header: JSON.parse(fromB64u(h)), payload: JSON.parse(fromB64u(p)), input: `${h}.${p}`, sig: fromB64u(s) };
    } catch {
      return null;
    }
  };

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const reply = (status, obj, headers = {}) => {
        res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
        res.end(obj === undefined ? '' : JSON.stringify(obj));
      };
      const url = new URL(req.url, ORIGIN);

      // Outils de test
      if (url.pathname === '/_faux/captures' && req.method === 'GET') return reply(200, { captures, rejects });
      if (url.pathname === '/_faux/captures' && req.method === 'DELETE') { captures = []; seenUnstable.clear(); for (const k of Object.keys(rejects)) rejects[k] = 0; return reply(204); }

      // OAuth : échange de l'assertion JWT RS256 contre un jeton d'accès
      if (url.pathname === '/token' && req.method === 'POST') {
        const form = new URLSearchParams(raw.toString('utf8'));
        const jwt = decodeJwt(form.get('assertion'));
        const now = Math.floor(Date.now() / 1000);
        const ok = form.get('grant_type') === 'urn:ietf:params:oauth:grant-type:jwt-bearer' && jwt
          && jwt.header.alg === 'RS256'
          && crypto.verify('RSA-SHA256', Buffer.from(jwt.input), saPublic, jwt.sig)
          && jwt.payload.iss === sa.client_email
          && jwt.payload.scope === 'https://www.googleapis.com/auth/firebase.messaging'
          && jwt.payload.aud === sa.token_uri
          && jwt.payload.exp - jwt.payload.iat <= 3600 && Math.abs(jwt.payload.iat - now) < 300;
        if (!ok) { rejects.token++; return reply(400, { error: 'invalid_grant' }); }
        const token = crypto.randomBytes(24).toString('hex');
        accessTokens.add(token);
        return reply(200, { access_token: token, expires_in: 3600, token_type: 'Bearer' });
      }

      // FCM HTTP v1
      const fcmMatch = /^\/v1\/projects\/([^/]+)\/messages:send$/.exec(url.pathname);
      if (fcmMatch && req.method === 'POST') {
        const bearer = (/^Bearer (.+)$/.exec(req.headers.authorization || '') || [])[1];
        if (!bearer || !accessTokens.has(bearer) || fcmMatch[1] !== PROJECT_ID) { rejects.fcm_auth++; return reply(401, { error: { status: 'UNAUTHENTICATED' } }); }
        let body;
        try { body = JSON.parse(raw.toString('utf8')); } catch { return reply(400, { error: { status: 'INVALID_ARGUMENT' } }); }
        const token = body?.message?.token || '';
        const fcmError = (status, code, http) => reply(http, { error: { code: http, status, details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: code }] } });
        if (token.startsWith('invalide-')) return fcmError('NOT_FOUND', 'UNREGISTERED', 404);
        if (token.startsWith('surcharge-')) return fcmError('UNAVAILABLE', 'UNAVAILABLE', 503);
        if (token.startsWith('instable-') && !seenUnstable.has(token)) { seenUnstable.add(token); return fcmError('UNAVAILABLE', 'UNAVAILABLE', 503); }
        captures.push({ canal: 'fcm', token, message: body.message, at: Date.now() });
        return reply(200, { name: `projects/${PROJECT_ID}/messages/${crypto.randomBytes(8).toString('hex')}` });
      }

      // Service Web Push
      const wp = /^\/wp\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
      if (wp && req.method === 'POST') {
        const id = wp[1];
        const m = /^vapid t=([^,]+),\s*k=([A-Za-z0-9_-]+)$/.exec(req.headers.authorization || '');
        const jwt = m && decodeJwt(m[1]);
        const now = Math.floor(Date.now() / 1000);
        const vapidOk = jwt && m[2] === env.VAPID_PUBLIC_KEY && jwt.header.alg === 'ES256'
          && crypto.verify('sha256', Buffer.from(jwt.input), { key: vapidKey, dsaEncoding: 'ieee-p1363' }, jwt.sig)
          && jwt.payload.aud === ORIGIN && jwt.payload.exp > now && jwt.payload.exp <= now + 24 * 3600 && /^(mailto:|https:)/.test(jwt.payload.sub || '');
        if (!vapidOk) { rejects.vapid++; return reply(401, { error: 'bad vapid' }); }
        if (req.headers['content-encoding'] !== 'aes128gcm' || !req.headers.ttl || raw.length < 86) { rejects.headers++; return reply(400, { error: 'bad headers' }); }
        if (id.startsWith('invalide-')) return reply(410);
        if (id.startsWith('absent-')) return reply(404);
        if (id.startsWith('surcharge-')) return reply(503);
        captures.push({ canal: 'web', id, body: raw.toString('base64'), ttl: Number(req.headers.ttl), at: Date.now() });
        return reply(201);
      }
      return reply(404, { error: 'not found' });
    });
  });
  server.listen(PORT, '127.0.0.1', () => console.log(`faux FCM / Web Push à l'écoute sur 127.0.0.1:${PORT}`));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) startServer();
