#!/usr/bin/env node
// Sidecar push de Chay : livre les notifications FCM (HTTP v1) et Web Push (VAPID, aes128gcm).
// Appelé uniquement par les hooks PocketBase. Voir docs/PUSH.md.
//   - écoute 127.0.0.1 seulement (jamais exposé par Caddy) ;
//   - en-tête X-Chay-Push-Secret obligatoire (comparaison à temps constant) ;
//   - aucune donnée personnelle dans les journaux (seulement des nombres et des classifications).
import fs from 'node:fs';
import http from 'node:http';
import {
  checkVapid, encryptWebPush, parseServiceAccount, sameSecret, serviceAccountJwt, vapidAuthorization, GOOGLE_TOKEN_URI,
} from './crypto-push.mjs';

const env = process.env;
const PORT = Number(env.PUSH_PORT || 8091);
const HOST = '127.0.0.1';
const SECRET = env.PUSH_SIDECAR_SECRET || '';
const FCM_API_BASE = (env.FCM_API_BASE || 'https://fcm.googleapis.com').replace(/\/+$/, '');
const LOCAL_ONLY = env.PUSH_LOCAL_ONLY === '1';
const VAPID_SUBJECT = env.VAPID_SUBJECT || 'mailto:no-reply@chay.fr';
const MAX_TARGETS = 500;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const FCM_CONCURRENCY = 20;
const WEB_CONCURRENCY = 10;
const REQUEST_TIMEOUT_MS = 10000;
const CHANNEL_ID = 'chay-default';
const TRANSIENT = new Set([429, 500, 502, 503, 504]);

const log = (msg, data) => console.log(`[chay-push] ${msg}${data ? ` ${JSON.stringify(data)}` : ''}`);

if (SECRET.length < 32) {
  log('arrêt : PUSH_SIDECAR_SECRET absent ou trop court (32 caractères minimum)');
  process.exit(2);
}
const { sa, error: fcmConfigError } = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT, (p) => fs.readFileSync(p, 'utf8'));
const vapidError = checkVapid(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

/** Refuse toute adresse hors 127.0.0.1 en mode test (PUSH_LOCAL_ONLY=1). */
function assertAllowed(url) {
  if (!LOCAL_ONLY) return;
  const host = new URL(url).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') throw Object.assign(new Error('blocked'), { blocked: true });
}

async function send(url, init) {
  assertAllowed(url);
  return fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
function retryDelay(res) {
  const ra = Number(res?.headers?.get('retry-after'));
  return Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 5000) : 1000;
}

/** Exécute `work` sur chaque élément, `n` à la fois. */
async function pool(items, n, work) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await work(items[i]);
    }
  }));
  return out;
}

// ── FCM ──────────────────────────────────────────────────────────────────────
let accessToken = null;
let accessTokenExpires = 0;

async function getAccessToken(force = false) {
  if (!force && accessToken && Date.now() < accessTokenExpires) return accessToken;
  const res = await send(sa.token_uri || GOOGLE_TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${serviceAccountJwt(sa)}`,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(`authentification Firebase refusée (HTTP ${res.status})`);
  accessToken = json.access_token;
  accessTokenExpires = Date.now() + 50 * 60 * 1000;
  return accessToken;
}

function fcmMessage(token, n) {
  return {
    message: {
      token,
      notification: { title: n.title, body: n.body },
      android: { notification: { channel_id: CHANNEL_ID, default_vibrate_timings: true, notification_count: 1 } },
      data: { target_type: String(n.target_type || ''), target_id: String(n.target_id || '') },
    },
  };
}

async function fcmOnce(target, n) {
  let token = await getAccessToken();
  let res;
  for (let auth = 0; auth < 2; auth++) {
    res = await send(`${FCM_API_BASE}/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(fcmMessage(target.token, n)),
    });
    if (res.status !== 401) break;
    token = await getAccessToken(true); // jeton d'accès expiré : on le renouvelle une fois
  }
  if (res.ok) return { ok: true, classification: 'accepted', res };
  const raw = await res.json().catch(() => null);
  const details = Array.isArray(raw?.error?.details) ? raw.error.details : [];
  const code = details.map((d) => d?.errorCode).find(Boolean) || raw?.error?.status || '';
  const transient = TRANSIENT.has(res.status) || ['UNAVAILABLE', 'INTERNAL', 'QUOTA_EXCEEDED'].includes(code);
  return {
    ok: false,
    invalid: code === 'UNREGISTERED',
    transient,
    classification: code === 'UNREGISTERED' ? 'unregistered_token' : (code || `http_${res.status}`),
    res,
  };
}

async function deliverFcm(target, n) {
  for (let attempt = 0; ; attempt++) {
    let r;
    try {
      r = await fcmOnce(target, n);
    } catch (err) {
      r = { ok: false, transient: !err.blocked, classification: err.blocked ? 'blocked_non_local' : 'transport_error' };
    }
    if (r.ok || !r.transient || attempt >= 1) {
      return { ref: target.ref, ok: r.ok, invalid: Boolean(r.invalid), retry: Boolean(!r.ok && r.transient), classification: r.classification };
    }
    await sleep(retryDelay(r.res));
  }
}

// ── Web Push ─────────────────────────────────────────────────────────────────
async function deliverWeb(target, payload, ttl) {
  let body;
  try {
    body = encryptWebPush(payload, target.p256dh, target.auth);
  } catch {
    return { ref: target.ref, ok: false, invalid: false, retry: false, classification: 'subscription_keys_invalid' };
  }
  for (let attempt = 0; ; attempt++) {
    let res = null;
    let r;
    try {
      res = await send(target.endpoint, {
        method: 'POST',
        headers: {
          Authorization: vapidAuthorization(target.endpoint, VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY),
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
          TTL: String(ttl),
          Urgency: 'normal',
        },
        body,
      });
      if (res.status >= 200 && res.status < 300) r = { ok: true, classification: 'accepted' };
      else if (res.status === 404 || res.status === 410) r = { ok: false, invalid: true, classification: `expired_${res.status}` };
      // 403 : abonnement créé avec une autre clé publique (ex. l'ancienne clé VAPID de Base44). La paire du sidecar
      // étant vérifiée au démarrage (checkVapid), c'est l'abonnement qui est périmé : supprimé, l'app se réabonne.
      else if (res.status === 403) r = { ok: false, invalid: true, classification: 'vapid_key_mismatch_403' };
      else r = { ok: false, transient: TRANSIENT.has(res.status), classification: `http_${res.status}` };
    } catch (err) {
      r = { ok: false, transient: !err.blocked, classification: err.blocked ? 'blocked_non_local' : 'transport_error' };
    }
    if (r.ok || !r.transient || attempt >= 1) {
      return { ref: target.ref, ok: r.ok, invalid: Boolean(r.invalid), retry: Boolean(!r.ok && r.transient), classification: r.classification };
    }
    await sleep(retryDelay(res));
  }
}

// ── Requête /envoyer ─────────────────────────────────────────────────────────
const str = (v, max) => String(v ?? '').slice(0, max);

function validate(body) {
  const n = body?.notification || {};
  const notification = { title: str(n.title || 'ÉGLISE CHAY', 100), body: str(n.body, 300), target_type: str(n.target_type, 64), target_id: str(n.target_id, 64) };
  const fcm = (Array.isArray(body?.fcm) ? body.fcm : []).filter((t) => t && typeof t.token === 'string' && t.token.length <= 4096);
  const web = (Array.isArray(body?.web) ? body.web : []).filter((t) => t && typeof t.endpoint === 'string' && /^https?:\/\//.test(t.endpoint) && t.endpoint.length <= 2048);
  const ttl = Number.isInteger(body?.ttl) && body.ttl >= 0 && body.ttl <= 2419200 ? body.ttl : 21600;
  return { notification, fcm, web, ttl };
}

async function handleSend(body) {
  const { notification, fcm, web, ttl } = validate(body);
  if (fcm.length + web.length > MAX_TARGETS) return [413, { error: `${MAX_TARGETS} cibles maximum par appel` }];

  let fcmResults = [];
  let fcmError = null;
  if (fcm.length) {
    if (!sa) {
      fcmError = fcmConfigError;
      fcmResults = fcm.map((t) => ({ ref: t.ref, ok: false, invalid: false, retry: false, classification: 'configuration_error' }));
    } else {
      try {
        await getAccessToken();
        const fcmNotif = { ...notification, body: notification.body.slice(0, 100) };
        fcmResults = await pool(fcm, FCM_CONCURRENCY, (t) => deliverFcm(t, fcmNotif));
      } catch (err) {
        fcmError = err.blocked ? 'adresse non locale refusée (PUSH_LOCAL_ONLY)' : 'authentification Firebase impossible';
        fcmResults = fcm.map((t) => ({ ref: t.ref, ok: false, invalid: false, retry: !err.blocked, classification: 'firebase_authentication_failed' }));
      }
    }
  }

  let webResults = [];
  let webSkipped = null;
  if (web.length) {
    if (vapidError) {
      webSkipped = vapidError;
      webResults = web.map((t) => ({ ref: t.ref, ok: false, invalid: false, retry: false, classification: vapidError }));
    } else {
      const payload = JSON.stringify(notification);
      webResults = await pool(web, WEB_CONCURRENCY, (t) => deliverWeb(t, payload, ttl));
    }
  }

  const count = (list, k) => list.filter((r) => r[k]).length;
  log('envoi', {
    fcm: { cibles: fcm.length, ok: count(fcmResults, 'ok'), invalides: count(fcmResults, 'invalid'), a_reessayer: count(fcmResults, 'retry') },
    web: { cibles: web.length, ok: count(webResults, 'ok'), invalides: count(webResults, 'invalid'), a_reessayer: count(webResults, 'retry') },
    classifications: [...new Set([...fcmResults, ...webResults].map((r) => r.classification))],
  });
  return [200, { fcm: fcmResults, web: webResults, fcmError, webSkipped }];
}

const server = http.createServer((req, res) => {
  const reply = (status, obj) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
  };
  if (!sameSecret(req.headers['x-chay-push-secret'], SECRET)) return reply(401, { error: 'unauthorized' });
  if (req.method === 'GET' && req.url === '/etat') {
    return reply(200, { fcm: sa ? 'configured' : fcmConfigError, web: vapidError || 'configured', localOnly: LOCAL_ONLY });
  }
  if (req.method !== 'POST' || req.url !== '/envoyer') return reply(404, { error: 'not found' });
  const chunks = [];
  let size = 0;
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_BODY_BYTES) { reply(413, { error: 'too large' }); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', async () => {
    if (res.writableEnded) return;
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reply(400, { error: 'json invalide' }); }
    try {
      const [status, out] = await handleSend(body);
      reply(status, out);
    } catch {
      log('erreur interne');
      reply(500, { error: 'internal' });
    }
  });
});

server.listen(PORT, HOST, () => {
  log(`à l'écoute sur ${HOST}:${PORT}`, { fcm: sa ? 'configuré' : 'non configuré', web: vapidError || 'configuré', localOnly: LOCAL_ONLY });
});
