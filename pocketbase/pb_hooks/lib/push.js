// Livraison des notifications push par le sidecar (pocketbase/sidecar-push, voir docs/PUSH.md).
//  - cibles : DeviceToken (FCM) et WebPushSubscription (Web Push) des destinataires, créés par eux-mêmes ;
//  - jetons / abonnements invalides : supprimés ;
//  - échecs temporaires : file PushEnvoi, reprise par la tâche planifiée push_reessais ;
//  - journaux : nombres seulement ;
//  - interrupteur NOTIFICATIONS_MODE (lib/sortie.js) : vérifié ici pour TOUT envoi, file comprise.

/** Chargé à l'usage (le fichier reste chargeable hors de PocketBase pour les tests unitaires). */
const sortie = () => require(`${__hooks}/lib/sortie.js`);

const QUEUE = 'PushEnvoi';
const BATCH = 500;
const RETRY_DELAYS_MIN = [1, 2, 5, 15]; // après les tentatives 1, 2, 3, 4 ; la 5e est la dernière
const MAX_ATTEMPTS = 5;
const QUEUE_TTL_MS = 6 * 3600 * 1000;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function config() {
  const url = String($os.getenv('PUSH_SIDECAR_URL') || '').replace(/\/+$/, '');
  const secret = String($os.getenv('PUSH_SIDECAR_SECRET') || '');
  return url && secret ? { url, secret } : null;
}

const pbDate = (ms) => new Date(ms).toISOString().replace('T', ' ');

/** Notification normalisée : titre 100, texte 300 caractères. */
function normalize(n) {
  return {
    title: String(n.title || 'ÉGLISE CHAY').slice(0, 100),
    body: String(n.body || '').slice(0, 300),
    target_type: String(n.target_type || '').slice(0, 64),
    target_id: String(n.target_id || '').slice(0, 64),
  };
}

/** Filtre « user_id = u0 || user_id = u1 … » paramétré. */
function userFilter(ids) {
  const params = {};
  const parts = ids.map((id, i) => {
    params[`u${i}`] = id;
    return `user_id = {:u${i}}`;
  });
  return { expr: `(${parts.join(' || ')})`, params };
}

/**
 * Cibles des destinataires. Comme Base44, seuls les enregistrements créés par le destinataire
 * lui-même (created_by_id = user_id) sont utilisés.
 */
function collectTargets(userIds) {
  const fcm = [];
  const web = [];
  const ids = [];
  const seen = {};
  for (const id of userIds) {
    if (typeof id === 'string' && ID_RE.test(id) && !seen[id]) { seen[id] = true; ids.push(id); }
  }
  for (let i = 0; i < ids.length; i += 50) {
    const f = userFilter(ids.slice(i, i + 50));
    for (const r of $app.findRecordsByFilter('DeviceToken', `${f.expr} && is_active = true && created_by_id = user_id && token != ''`, '', 0, 0, f.params)) {
      fcm.push({ ref: r.id, token: r.getString('token'), user: r.getString('user_id') });
    }
    for (const r of $app.findRecordsByFilter('WebPushSubscription', `${f.expr} && is_active = true && created_by_id = user_id && endpoint != ''`, '', 0, 0, f.params)) {
      web.push({ ref: r.id, endpoint: r.getString('endpoint'), p256dh: r.getString('p256dh'), auth: r.getString('auth'), user: r.getString('user_id') });
    }
  }
  return { ids, fcm, web };
}

/** Appel du sidecar ; { ok, data } ou { ok: false, reason }. */
function callSidecar(cfg, notification, fcm, web) {
  try {
    const res = $http.send({
      url: `${cfg.url}/envoyer`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Chay-Push-Secret': cfg.secret },
      body: JSON.stringify({
        notification,
        ttl: 21600,
        fcm: fcm.map((t) => ({ ref: t.ref, token: t.token })),
        web: web.map((t) => ({ ref: t.ref, endpoint: t.endpoint, p256dh: t.p256dh, auth: t.auth })),
      }),
      timeout: 20,
    });
    if (res.statusCode !== 200) return { ok: false, reason: `sidecar_http_${res.statusCode}` };
    return { ok: true, data: JSON.parse(toString(res.body)) };
  } catch (_) {
    return { ok: false, reason: 'sidecar_unreachable' };
  }
}

function removeTarget(collection, id) {
  try {
    $app.delete($app.findRecordById(collection, id));
    return true;
  } catch (_) {
    return false;
  }
}

function enqueue(canal, ref, notification, attempts, error) {
  const now = Date.now();
  const rec = new Record($app.findCollectionByNameOrId(QUEUE));
  rec.set('canal', canal);
  rec.set('cible_id', ref);
  rec.set('titre', notification.title);
  rec.set('texte', notification.body);
  rec.set('target_type', notification.target_type);
  rec.set('target_id', notification.target_id);
  rec.set('tentatives', attempts);
  rec.set('prochain_essai', pbDate(now + RETRY_DELAYS_MIN[Math.min(attempts, RETRY_DELAYS_MIN.length) - 1] * 60000));
  rec.set('expire', pbDate(now + QUEUE_TTL_MS));
  rec.set('derniere_erreur', String(error || '').slice(0, 64));
  $app.save(rec);
}

/**
 * Envoie `notification` aux cibles données (déjà filtrées). `attempts` = numéro de la tentative.
 * Renvoie les compteurs et, par cible, le résultat.
 */
function deliverTargets(targetsIn, notification, attempts) {
  // Interrupteur : en mode off / test, seules les cibles des comptes autorisés restent (dernier verrou,
  // valable aussi pour la file PushEnvoi). Les cibles bloquées ne sont ni envoyées ni remises en file.
  let targets = targetsIn;
  let blockedTargets = 0;
  const mode = sortie().mode();
  if (mode !== 'on') {
    const all = targetsIn.fcm.concat(targetsIn.web);
    const allowed = {};
    for (const id of sortie().filterUserIds(all.map((t) => t.user).filter((u, i, a) => u && a.indexOf(u) === i))) allowed[id] = true;
    targets = { fcm: targetsIn.fcm.filter((t) => allowed[t.user]), web: targetsIn.web.filter((t) => allowed[t.user]) };
    blockedTargets = all.length - targets.fcm.length - targets.web.length;
    sortie().blocked('push', blockedTargets);
  }
  const out = {
    fcm: { found: targets.fcm.length, sent: 0, failed: 0, removed: 0, queued: 0 },
    web: { found: targets.web.length, sent: 0, failed: 0, removed: 0, queued: 0 },
    fcmError: null,
    webSkipped: null,
    perRef: {},
    blocked: blockedTargets,
  };
  if (blockedTargets && !targets.fcm.length && !targets.web.length) {
    out.fcmError = targetsIn.fcm.length ? `notifications_${mode}` : null;
    out.webSkipped = targetsIn.web.length ? `notifications_${mode}` : null;
  }
  if (!targets.fcm.length && !targets.web.length) return out;
  const cfg = config();
  if (!cfg) {
    out.fcmError = targets.fcm.length ? 'push_not_configured' : null;
    out.webSkipped = targets.web.length ? 'push_not_configured' : null;
    out.fcm.failed = targets.fcm.length;
    out.web.failed = targets.web.length;
    return out;
  }
  const all = targets.fcm.map((t) => ({ canal: 'fcm', t })).concat(targets.web.map((t) => ({ canal: 'web', t })));
  for (let i = 0; i < all.length; i += BATCH) {
    const slice = all.slice(i, i + BATCH);
    const fcm = slice.filter((x) => x.canal === 'fcm').map((x) => x.t);
    const web = slice.filter((x) => x.canal === 'web').map((x) => x.t);
    const r = callSidecar(cfg, notification, fcm, web);
    if (!r.ok) {
      // Sidecar injoignable : tout est remis en file.
      for (const t of fcm) { out.fcm.failed++; if (attempts < MAX_ATTEMPTS) { enqueue('fcm', t.ref, notification, attempts, r.reason); out.fcm.queued++; } out.perRef[t.ref] = { ok: false }; }
      for (const t of web) { out.web.failed++; if (attempts < MAX_ATTEMPTS) { enqueue('web', t.ref, notification, attempts, r.reason); out.web.queued++; } out.perRef[t.ref] = { ok: false }; }
      out.fcmError = out.fcmError || (fcm.length ? r.reason : null);
      out.webSkipped = out.webSkipped || (web.length ? r.reason : null);
      continue;
    }
    const d = r.data || {};
    if (d.fcmError) out.fcmError = d.fcmError;
    if (d.webSkipped) out.webSkipped = d.webSkipped;
    const apply = (canal, list, collection) => {
      const c = out[canal];
      for (const res of Array.isArray(list) ? list : []) {
        if (!res || typeof res.ref !== 'string') continue;
        out.perRef[res.ref] = { ok: Boolean(res.ok) };
        if (res.ok) { c.sent++; continue; }
        c.failed++;
        if (res.invalid) {
          if (removeTarget(collection, res.ref)) c.removed++;
        } else if (res.retry && attempts < MAX_ATTEMPTS) {
          enqueue(canal, res.ref, notification, attempts, res.classification);
          c.queued++;
        }
      }
    };
    apply('fcm', d.fcm, 'DeviceToken');
    apply('web', d.web, 'WebPushSubscription');
  }
  return out;
}

/**
 * Push vers des membres (Android + navigateur). Résultat au format de sendFcmPush (Base44) :
 * { sent, failed, tokensFound, invalidDeactivated, fcmError, webPush: {...}, recipients, queued }.
 */
function sendToUsers(userIdsIn, notificationIn, label) {
  const notification = normalize(notificationIn);
  const { userIds, blockedUsers, mode } = allowedUsers(userIdsIn);
  const targets = collectTargets(userIds);
  const r = deliverTargets(targets, notification, 1);
  const recipients = targets.ids.map((uid, i) => {
    const mine = (list) => list.filter((t) => t.user === uid);
    const count = (list) => list.filter((t) => r.perRef[t.ref] && r.perRef[t.ref].ok).length;
    const f = mine(targets.fcm);
    const w = mine(targets.web);
    return {
      recipientIndex: i + 1,
      tokensFound: f.length,
      attempted: f.length,
      succeeded: count(f),
      failed: f.length - count(f),
      web: { attempted: w.length, succeeded: count(w), failed: w.length - count(w) },
    };
  });
  $app.logger().info('[push] envoi', 'fonction', label || '', 'destinataires', targets.ids.length,
    'android', `${r.fcm.sent}/${r.fcm.found}`, 'navigateur', `${r.web.sent}/${r.web.found}`,
    'supprimes', r.fcm.removed + r.web.removed, 'en_file', r.fcm.queued + r.web.queued);
  const res = {
    sent: r.fcm.sent,
    failed: r.fcm.failed,
    tokensFound: r.fcm.found,
    invalidDeactivated: r.fcm.removed,
    fcmError: r.fcmError,
    firebaseResponses: [],
    webPush: {
      sent: r.web.sent,
      failed: r.web.failed,
      subscriptions: r.web.found,
      deactivated: r.web.removed,
      skipped: r.webSkipped,
      byUser: recipients.map((x) => ({ recipientIndex: x.recipientIndex, attempted: x.web.attempted, succeeded: x.web.succeeded, failed: x.web.failed })),
    },
    queued: r.fcm.queued + r.web.queued,
    recipients,
    blocked: blockedUsers,
  };
  if (blockedUsers && !targets.ids.length) {
    res.fcmError = `notifications_${mode}`;
    res.webPush.skipped = `notifications_${mode}`;
  }
  return res;
}

/** Destinataires autorisés par l'interrupteur NOTIFICATIONS_MODE (les autres sont ignorés et comptés). */
function allowedUsers(userIdsIn) {
  const list = Array.isArray(userIdsIn) ? userIdsIn : [];
  const mode = sortie().mode();
  const userIds = mode === 'on' ? list : sortie().filterUserIds(list);
  const blockedUsers = list.length - userIds.length;
  sortie().blocked('push_destinataires', blockedUsers);
  return { userIds, blockedUsers, mode };
}

/** Web Push seul (route sendWebPush). */
function sendWebToUsers(userIdsIn, notificationIn) {
  const notification = normalize(notificationIn);
  const { userIds, blockedUsers, mode } = allowedUsers(userIdsIn);
  const targets = collectTargets(userIds);
  targets.fcm = [];
  const r = deliverTargets(targets, notification, 1);
  return {
    sent: r.web.sent,
    failed: r.web.failed,
    subscriptions: r.web.found,
    deactivated: r.web.removed,
    skipped: blockedUsers && !targets.ids.length ? `notifications_${mode}` : r.webSkipped,
    blocked: blockedUsers,
    byUser: targets.ids.map((uid, i) => {
      const w = targets.web.filter((t) => t.user === uid);
      const ok = w.filter((t) => r.perRef[t.ref] && r.perRef[t.ref].ok).length;
      return { recipientIndex: i + 1, attempted: w.length, succeeded: ok, failed: w.length - ok };
    }),
  };
}

/** Reprise de la file (tâche planifiée). Renvoie les compteurs. */
function processQueue(limit) {
  const now = Date.now();
  const stats = { traites: 0, envoyes: 0, expires: 0, abandonnes: 0 };
  const rows = $app.findRecordsByFilter(QUEUE, 'prochain_essai <= {:now}', 'prochain_essai', limit || 500, 0, { now: pbDate(now) });
  const groups = {};
  for (const row of rows) {
    stats.traites++;
    const expired = new Date(row.getString('expire').replace(' ', 'T')).getTime() <= now;
    const attempts = row.getInt('tentatives') + 1;
    $app.delete(row);
    if (expired || attempts > MAX_ATTEMPTS) { stats.expires++; continue; }
    const canal = row.getString('canal');
    const collection = canal === 'fcm' ? 'DeviceToken' : 'WebPushSubscription';
    let target = null;
    try { target = $app.findRecordById(collection, row.getString('cible_id')); } catch (_) { target = null; }
    if (!target || !target.getBool('is_active')) { stats.abandonnes++; continue; }
    const notification = normalize({
      title: row.getString('titre'), body: row.getString('texte'), target_type: row.getString('target_type'), target_id: row.getString('target_id'),
    });
    const key = `${attempts}|${JSON.stringify(notification)}`;
    if (!groups[key]) groups[key] = { attempts, notification, targets: { fcm: [], web: [] } };
    const user = target.getString('user_id');
    if (canal === 'fcm') groups[key].targets.fcm.push({ ref: target.id, token: target.getString('token'), user });
    else groups[key].targets.web.push({ ref: target.id, endpoint: target.getString('endpoint'), p256dh: target.getString('p256dh'), auth: target.getString('auth'), user });
  }
  for (const key of Object.keys(groups)) {
    const g = groups[key];
    const r = deliverTargets(g.targets, g.notification, g.attempts);
    stats.envoyes += r.fcm.sent + r.web.sent;
    stats.bloques = (stats.bloques || 0) + r.blocked;
  }
  if (stats.traites) $app.logger().info('[push] reprise de la file', 'traites', stats.traites, 'envoyes', stats.envoyes, 'expires', stats.expires, 'abandonnes', stats.abandonnes);
  return stats;
}

module.exports = { config, normalize, collectTargets, sendToUsers, sendWebToUsers, processQueue, MAX_ATTEMPTS };
