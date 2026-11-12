// Notifications (in-app, e-mail, push) : logique reprise des fonctions Base44
// sendMessagePush, notifyCommunityPost, notifyNewContent, notifyDailyVerse, createThemeRequest,
// handleThemeRequest, takePrayer, answerPrayer. Les destinataires sont TOUJOURS calculés ici,
// jamais fournis par le client.

const fn = require(`${__hooks}/lib/fn.js`);
const push = require(`${__hooks}/lib/push.js`);
const bilan = require(`${__hooks}/lib/bilan-push.js`);
const mail = require(`${__hooks}/lib/courriel.js`);
const fuseaux = require(`${__hooks}/lib/fuseaux.js`);
const cibles = require(`${__hooks}/lib/cibles.js`);

const ONLINE_WINDOW_MS = 2 * 60 * 1000;
const EMAIL_DEDUP_MS = 30 * 60 * 1000;
const APP_TZ = 'Europe/Paris';
const DEFAULT_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const pbDate = (ms) => new Date(ms).toISOString().replace('T', ' ');
const toMs = (v) => (v ? new Date(String(v).replace(' ', 'T')).getTime() : 0);

// ── Membres et préférences ───────────────────────────────────────────────────
function settingsOf(u) {
  if (!u) return {};
  try {
    const s = JSON.parse(u.getString('settings') || '{}');
    return s && typeof s === 'object' && !Array.isArray(s) ? s : {};
  } catch (_) {
    return {};
  }
}

function displayName(u) {
  return u.getString('name') || [u.getString('first_name'), u.getString('last_name')].filter(Boolean).join(' ');
}

/** Membre actif par id, ou null (absent ou compte désactivé). */
function activeUser(id) {
  const u = fn.findById('users', id);
  return u && !u.getBool('disabled') ? u : null;
}

function activeUsers() {
  return $app.findRecordsByFilter('users', 'disabled != true', '', 0, 0);
}

/** Coupure générale + canal push (préférences des réglages de l'app). */
function pushAllowed(u) {
  const s = settingsOf(u);
  return s.notifications_enabled !== false && s.notif_push !== false;
}

/** Push vers les membres qui l'acceptent (coupure générale et canal push). */
function pushToAllowed(userIds, notification, label) {
  const ids = [];
  for (const id of userIds) {
    const u = activeUser(id);
    if (u && pushAllowed(u)) ids.push(id);
  }
  if (!ids.length) return { sent: 0, failed: 0, skipped: 'no_eligible_recipient' };
  return push.sendToUsers(ids, notification, label);
}

/** Création de UserNotification en une transaction ; renvoie le nombre créé. */
function createNotifications(rows, label) {
  if (!rows.length) return 0;
  let created = 0;
  try {
    $app.runInTransaction((txApp) => {
      const col = txApp.findCollectionByNameOrId('UserNotification');
      for (const row of rows) {
        const rec = new Record(col);
        for (const k of Object.keys(row)) rec.set(k, row[k]);
        txApp.save(rec);
        created++;
      }
    });
  } catch (_) {
    $app.logger().error('[notifications] création impossible', 'fonction', label || '', 'lignes', rows.length);
    return 0;
  }
  return created;
}

function notificationExists(notificationId, userId) {
  return userId
    ? Boolean(fn.findOne($app, 'UserNotification', 'notification_id = {:n} && user_id = {:u}', '', { n: notificationId, u: userId }))
    : Boolean(fn.findOne($app, 'UserNotification', 'notification_id = {:n}', '', { n: notificationId }));
}

/** Résumé push « Base44 » : envoyés et échecs Android + navigateur. */
function pushTotals(r) {
  if (!r || r.skipped === 'no_eligible_recipient') return { pushSent: 0, pushFailed: 0 };
  const web = r.webPush || {};
  return { pushSent: (r.sent || 0) + (web.sent || 0), pushFailed: (r.failed || 0) + (web.failed || 0) };
}

// ── Admins désignés (role admin, sauf le tout premier compte) ────────────────
function firstAccountId() {
  const dated = fn.findOne($app, 'users', "base44_created_date != ''", 'base44_created_date', {});
  const undated = fn.findOne($app, 'users', "base44_created_date = ''", 'created', {});
  const when = (r) => (r ? (r.getString('base44_created_date') || r.getString('created')) : null);
  let first = dated || undated;
  if (dated && undated && when(undated) < when(dated)) first = undated;
  return first ? first.id : null;
}

function designatedAdminIds() {
  const first = firstAccountId();
  return $app.findRecordsByFilter('users', "role = 'admin' && disabled != true", '', 0, 0)
    .map((u) => u.id)
    .filter((id) => id !== first);
}

function isDesignatedAdmin(user) {
  if (!user || user.getString('role') !== 'admin') return false;
  const first = firstAccountId();
  return Boolean(first) && first !== user.id;
}

// ── sendMessagePush ──────────────────────────────────────────────────────────
// Mémo en mémoire ($app.store, vidé au redémarrage) : messages déjà notifiés, e-mails récents.
const MEMO_MS = 24 * 3600 * 1000;
function lireMemo(genre) {
  try {
    const raw = $app.store().get(`memo_message:${genre}`);
    const o = raw ? JSON.parse(raw) : {};
    return o && typeof o === 'object' ? o : {};
  } catch (_) {
    return {};
  }
}
function memoMessage(genre, cle, dureeMs) {
  const t = lireMemo(genre)[cle];
  return Boolean(t) && Date.now() - t < (dureeMs || MEMO_MS);
}
function marquerMessage(genre, cle) {
  const now = Date.now();
  const o = lireMemo(genre);
  for (const k of Object.keys(o)) if (now - o[k] >= MEMO_MS) delete o[k];
  o[cle] = now;
  $app.store().set(`memo_message:${genre}`, JSON.stringify(o));
}

function messageEmailHtml(senderName, preview, conversationId) {
  const cta = `${mail.appUrl()}/messages?c=${encodeURIComponent(conversationId || '')}`;
  return mail.shell('Nouveau message',
    mail.paragraph(`<strong>${mail.escapeHtml(senderName)}</strong> vous a envoyé un message.`)
    + mail.paragraph(mail.escapeHtml(preview), 'border-left:3px solid #8A56E2;padding-left:12px;')
    + mail.button(cta, 'Ouvrir la conversation'));
}

/** Notifications d'un message : push et e-mail (30 min de déduplication), sans cloche. Idempotent. */
function messagePush(messageRecord) {
  const m = fn.plain(messageRecord);
  const empty = { android: { attempted: 0, succeeded: 0, failed: 0 }, web: { attempted: 0, succeeded: 0, failed: 0 } };
  const senderId = m.sender_id;
  const participants = Array.isArray(m.participant_ids) ? m.participant_ids : [];
  const targets = participants.filter((id) => id && id !== senderId);
  if (!targets.length) return Object.assign({ sent: 0 }, empty);
  // Plus de notification de cloche pour un message privé (seul le push reste) : l'idempotence passe par un
  // mémo en mémoire (anciens messages : l'ancienne notification de cloche compte encore).
  if (memoMessage('push', m.id)) return Object.assign({ sent: 0, skipped: 'already_notified' }, empty);
  const pending = targets.filter((uid) => !notificationExists(`message_${m.id}_${uid}`, uid));
  if (!pending.length) return Object.assign({ sent: 0, skipped: 'already_notified' }, empty);
  marquerMessage('push', m.id);

  const senderName = m.sender_name || 'Quelqu\'un';
  const isImageOnly = !m.text && Boolean(m.image_url);
  const preview = isImageOnly ? '📷 Photo' : (m.text ? String(m.text).slice(0, 60) : '');
  const title = isImageOnly ? 'Vous avez reçu une photo' : `${senderName} vous a envoyé un message`;
  const notifBody = isImageOnly ? `${senderName} vous a envoyé une photo` : (m.text ? String(m.text).slice(0, 100) : '');

  // Compteurs gardés pour le bilan (lib/bilan-push.js) : plus aucune notification de cloche pour un message.
  const notifCreated = 0;
  const notifFailed = 0;
  let emailsSent = 0;
  let emailsSkipped = 0;
  let openSkipped = 0;
  const pushTargets = [];

  for (const uid of pending) {
    const recipient = fn.findById('users', uid);
    if (recipient && recipient.getBool('disabled')) continue;
    const prefs = settingsOf(recipient);
    const notificationsOn = prefs.notifications_enabled !== false && prefs.notif_messages !== false;
    const pushOn = notificationsOn && prefs.notif_push !== false;
    const emailOn = notificationsOn && (!recipient || recipient.getBool('email_messages'));

    const prof = fn.findOne($app, 'MemberProfile', 'created_by_id = {:u}', '-base44_created_date,-created', { u: uid });
    const lastSeen = prof ? toMs(prof.getString('last_seen_at')) : 0;
    const isOnline = Boolean(lastSeen) && Date.now() - lastSeen < ONLINE_WINDOW_MS;
    if (prof && isOnline && prof.getString('active_conversation_id') === m.conversation_id) { openSkipped++; continue; }

    // Message privé : AUCUNE notification de cloche (UserNotification) ; seul le push reste (et l'e-mail).
    if (pushOn) pushTargets.push(uid);

    const email = recipient ? recipient.email() : '';
    if (emailOn && email) {
      // Déduplication : un e-mail par (destinataire, conversation) toutes les 30 min, mémo en mémoire.
      const cle = `${uid}:${m.conversation_id}`;
      const recentlyEmailed = memoMessage('courriel', cle, EMAIL_DEDUP_MS);
      const fresh = fn.findById('Message', m.id);
      const readBy = fresh ? fn.plain(fresh).read_by : m.read_by;
      const alreadyRead = Array.isArray(readBy) && readBy.indexOf(uid) !== -1;
      if (recentlyEmailed || alreadyRead) {
        emailsSkipped++;
      } else if (mail.trySend('sendMessagePush', email, `${senderName} vous a envoyé un message`,
        messageEmailHtml(senderName, preview || notifBody, m.conversation_id),
        `${senderName} vous a envoyé un message.

${preview || notifBody}

Ouvrir la conversation : ${mail.appUrl()}/messages?c=${encodeURIComponent(m.conversation_id || '')}`)) {
        emailsSent++;
        marquerMessage('courriel', cle);
      } else {
        emailsSkipped++;
      }
    }
  }

  let android = empty.android;
  let web = empty.web;
  let pushSent = 0;
  let pushFailed = 0;
  let webPushSent = 0;
  let webPushSkipped = null;
  let fcmError = null;
  let pushNoSubscriptions = 0;
  let pushBlocked = 0;
  let pushMode = 'on';
  let pushInvalid = 0;
  let pushQueued = 0;
  if (pushTargets.length) {
    // Style conversation (bulles Android 11+, sinon notification de conversation) : nom et photo de l'expéditeur.
    const senderProfile = fn.findOne($app, 'MemberProfile', 'created_by_id = {:u}', '-base44_created_date,-created', { u: senderId });
    const r = push.sendToUsers(pushTargets, {
      title, body: preview || notifBody, target_type: 'message', target_id: m.conversation_id,
      style: 'conversation', expediteur: senderName, avatar: senderProfile ? senderProfile.getString('avatar_url') : '',
    }, 'sendMessagePush');
    pushBlocked = r.blocked || 0;
    pushMode = r.mode || pushMode;
    webPushSent = r.webPush.sent;
    webPushSkipped = r.webPush.skipped;
    fcmError = r.fcmError;
    android = { attempted: r.tokensFound, succeeded: r.sent, failed: r.failed };
    web = { attempted: r.webPush.subscriptions, succeeded: r.webPush.sent, failed: r.webPush.failed };
    pushSent = r.sent + r.webPush.sent;
    pushFailed = r.failed + r.webPush.failed;
    // Échecs dus au destinataire (jeton / abonnement périmé, nettoyé par push.js) et envois remis en file :
    // jamais une erreur pour l'expéditeur (lib/bilan-push.js).
    pushInvalid = (r.invalid || 0) + (r.webPush.invalid || 0);
    pushQueued = r.queued || 0;
    if (r.webPush.skipped && r.sent === 0 && r.webPush.subscriptions > 0) pushFailed = Math.max(pushFailed, 1);
    if (!r.blocked && r.tokensFound === 0 && r.webPush.subscriptions === 0) pushNoSubscriptions = pushTargets.length;
  }
  return {
    notifCreated, notifFailed, emailsSent, emailsSkipped, pushSent, pushFailed, android, web,
    pushNoSubscriptions, pushBlocked, pushMode, pushInvalid, pushQueued, webPushSent, webPushSkipped, fcmError, openSkipped, total: pending.length,
  };
}

// Erreur / information de notification pour l'expéditeur d'un message : règles dans lib/bilan-push.js
// (un jeton ou abonnement périmé du destinataire n'est jamais une erreur ; au moins une cible acceptée = pas
// d'erreur ; NOTIFICATIONS_MODE = information).
const messageNotificationError = (d) => bilan.messageNotificationError(d);
const messageNotificationInfo = (d) => bilan.messageNotificationInfo(d);

// ── notifyCommunityPost ──────────────────────────────────────────────────────
function communityPostNotify(postRecord) {
  const p = fn.plain(postRecord);
  const notifId = `community_${p.id}`;
  if (notificationExists(notifId)) return { skipped: 'already_notified' };
  const authorName = p.author_name || 'Un membre';
  const excerpt = String(p.text || '').slice(0, 80);
  const title = `${authorName} a publié dans la communauté`;
  const authorId = p.created_by_id;
  const rows = [];
  const pushIds = [];
  for (const u of activeUsers()) {
    if (u.id === authorId) continue;
    const s = settingsOf(u);
    if (s.notifications_enabled === false || s.notif_news === false) continue;
    if (s.notif_push !== false) pushIds.push(u.id);
    rows.push({
      user_id: u.id, notification_id: notifId, type: 'community_post', post_id: p.id, actor_id: authorId,
      actor_name: authorName, count: 1, title, message: excerpt, is_read: false,
    });
  }
  const created = createNotifications(rows, 'notifyCommunityPost');
  const t = pushIds.length
    ? pushTotals(push.sendToUsers(pushIds, { title, body: excerpt || title, target_type: 'community', target_id: p.id }, 'notifyCommunityPost'))
    : { pushSent: 0, pushFailed: 0 };
  return { recipients: rows.length, created, createFailed: rows.length - created, pushSent: t.pushSent, pushFailed: t.pushFailed };
}

// ── notifyNewContent ─────────────────────────────────────────────────────────
function contentEmailHtml(title, description) {
  return mail.shell('Nouveau contenu',
    mail.paragraph('Un nouveau contenu vient d\'être publié dans l\'application Chay.')
    + `<p style="margin:0 0 4px;font-size:17px;font-weight:700;color:#18181b;">${mail.escapeHtml(title)}</p>`
    + (description ? `<p style="margin:0 0 8px;font-size:14px;color:#52525b;">${mail.escapeHtml(description)}</p>` : '')
    + mail.button(`${mail.appUrl()}/media`, 'Découvrir maintenant'));
}

function newContentNotify(contentRecord, sendEmail) {
  const c = fn.plain(contentRecord);
  const notifId = `content_${c.id}`;
  if (notificationExists(notifId)) return { skipped: 'already_notified' };
  const title = `Nouveau : ${c.title || 'Contenu'}`;
  const messageText = String(c.description || '').slice(0, 160);
  const users = activeUsers();
  const rows = [];
  const pushIds = [];
  for (const u of users) {
    const s = settingsOf(u);
    if (s.notifications_enabled === false) continue;
    if (s.notif_push !== false && s.notif_news !== false) pushIds.push(u.id);
    if (u.getBool('in_app_nouveautes')) {
      rows.push({
        user_id: u.id, notification_id: notifId, type: 'new_content', content_id: c.id, content_type: c.type || '',
        title, message: messageText, thumbnail_url: c.thumbnail_url || '', is_read: false,
      });
    }
  }
  const created = createNotifications(rows, 'notifyNewContent');
  let emailsSent = 0;
  let emailsSkipped = 0;
  if (sendEmail) {
    // Comme Base44 : seul email_nouveautes compte pour l'e-mail.
    const html = contentEmailHtml(c.title, c.description);
    const text = `Un nouveau contenu vient d'être publié dans l'application Chay.\n\n${c.title || ''}\n${c.description || ''}\n\n${mail.appUrl()}/media`;
    for (const u of users) {
      if (!u.getBool('email_nouveautes') || !u.email()) continue;
      if (mail.trySend('notifyNewContent', u.email(), title, html, text)) emailsSent++;
      else emailsSkipped++;
    }
  }
  const t = pushIds.length
    ? pushTotals(push.sendToUsers(pushIds, { title, body: String(c.description || c.title || '').slice(0, 60), target_type: 'content', target_id: c.id, route: cibles.routeContenu(c) }, 'notifyNewContent'))
    : { pushSent: 0, pushFailed: 0 };
  return { recipients: rows.length, created, emailsSent, emailsSkipped, pushSent: t.pushSent, pushFailed: t.pushFailed, sendEmail };
}

// ── notifyDailyVerse ─────────────────────────────────────────────────────────
/**
 * Verset du jour. `fromCron` : ne travaille qu'entre 07:00 et 07:59 à Paris (la tâche tourne à 05:00 et
 * 06:00 UTC pour couvrir l'heure d'été et l'heure d'hiver). Idempotent par jour.
 */
function dailyVerse(nowMs, fromCron) {
  // Mode off : la tâche s'arrête AVANT de parcourir les destinataires ; mode test : seuls les comptes listés.
  const sortie = require(`${__hooks}/lib/sortie.js`);
  const mode = sortie.mode();
  if (mode === 'off') return { skipped: 'notifications_off' };
  const paris = fuseaux.localParts(nowMs, APP_TZ);
  const dateStr = paris.dateStr;
  if (paris.hhmm < '06:55') return { skipped: 'too_early', date: dateStr };
  if (fromCron && paris.hhmm.slice(0, 2) !== '07') return { skipped: 'outside_window', date: dateStr };
  const start = `${dateStr} 00:00:00.000Z`;
  const end = pbDate(new Date(`${dateStr}T00:00:00.000Z`).getTime() + fuseaux.DAY_MS);
  const dev = fn.findOne($app, 'Devotional', 'reading_date >= {:a} && reading_date < {:b}', '', { a: start, b: end });
  if (!dev) return { skipped: 'no_devotional', date: dateStr };
  const d = fn.plain(dev);
  const notifId = `verse_${dateStr}`;
  const done = {};
  for (const n of $app.findRecordsByFilter('UserNotification', 'notification_id = {:n}', '', 0, 0, { n: notifId })) done[n.getString('user_id')] = true;

  const reference = d.scripture_reference || d.title || 'Verset du jour';
  const title = 'Verset du jour';
  const message = (reference + (d.verse_text ? ` — ${d.verse_text}` : '')).slice(0, 300);
  const targets = [];
  const pushTargets = [];
  const candidates = mode === 'test'
    ? sortie.testEmails().map((e) => { try { return $app.findAuthRecordByEmail('users', e); } catch (_) { return null; } })
      .filter((u) => u && !u.getBool('disabled'))
    : activeUsers();
  for (const u of candidates) {
    if (done[u.id]) continue;
    const s = settingsOf(u);
    if (s.notifications_enabled === false || s.notif_verse === false) continue;
    const tz = typeof s.tz === 'string' && s.tz ? s.tz : APP_TZ;
    const day = fuseaux.localParts(nowMs, tz).weekday;
    const days = Array.isArray(s.notif_verse_days) && s.notif_verse_days.length ? s.notif_verse_days : DEFAULT_DAYS;
    if (days.indexOf(day) === -1) continue;
    const time = typeof s.notif_verse_time === 'string' && s.notif_verse_time ? s.notif_verse_time : '07:00';
    if (time > '07:00') continue; // heures non planifiées (comme Base44)
    targets.push(u.id);
    if (s.notif_push !== false) pushTargets.push(u.id);
  }
  const created = createNotifications(targets.map((uid) => ({
    user_id: uid, notification_id: notifId, type: 'daily_verse', content_id: d.id, content_type: 'devotional',
    title, message, thumbnail_url: d.image_url || '', is_read: false,
  })), 'notifyDailyVerse');
  let pushSent = 0;
  let pushFailed = 0;
  let webPushSent = 0;
  if (pushTargets.length) {
    const r = push.sendToUsers(pushTargets, { title, body: message, target_type: 'daily_verse', target_id: d.id }, 'notifyDailyVerse');
    const t = pushTotals(r);
    pushSent = t.pushSent;
    pushFailed = t.pushFailed;
    webPushSent = r.webPush.sent;
  }
  return { date: dateStr, devotional: d.id, recipients: targets.length, created, pushSent, pushFailed, webPushSent };
}

// ── Demandes de thème ────────────────────────────────────────────────────────
function themeRequestCreated(request, theme) {
  const adminIds = designatedAdminIds();
  const title = 'Nouvelle demande de thème';
  const message = String(theme).slice(0, 140);
  const notified = createNotifications(adminIds.map((id) => ({
    user_id: id, notification_id: `theme_request_${request.id}`, type: 'theme_request', content_type: 'theme_request',
    content_id: request.id, title, message, is_read: false,
  })), 'createThemeRequest');
  const link = `${mail.appUrl()}/requests`;
  const html = mail.shell(title, mail.paragraph(mail.escapeHtml(message)) + mail.button(link, 'Voir la demande'));
  for (const id of adminIds) {
    const a = activeUser(id);
    if (a && a.email()) mail.trySend('createThemeRequest', a.email(), title, html, `${message}\n\nVoir la demande : ${link}`);
  }
  pushToAllowed(adminIds, { title, body: message, target_type: 'theme_request', target_id: request.id }, 'createThemeRequest');
  return notified;
}

function themeRequestHandled(request, decision, note) {
  const theme = String(request.getString('theme') || '').slice(0, 120);
  const title = decision === 'validated' ? 'Ta demande de thème est retenue' : 'Réponse à ta demande de thème';
  const message = decision === 'validated'
    ? `Le Pasteur prend en compte : « ${theme} ».`
    : `« ${theme} » n'est pas retenu${note ? ` — ${note.slice(0, 120)}` : ''}.`;
  const requesterId = request.getString('user_id');
  createNotifications([{
    user_id: requesterId, notification_id: `theme_answer_${request.id}`, type: 'theme_answer', content_type: 'theme_answer',
    content_id: request.id, title, message, is_read: false,
  }], 'handleThemeRequest');
  const requester = activeUser(requesterId);
  const link = `${mail.appUrl()}/requests`;
  if (requester && requester.email()) {
    mail.trySend('handleThemeRequest', requester.email(), title,
      mail.shell(title, mail.paragraph(mail.escapeHtml(message)) + mail.button(link, 'Voir mes requêtes')),
      `${message}\n\nVoir tes requêtes : ${link}`);
  }
  pushToAllowed([requesterId], { title, body: message, target_type: 'theme_answer', target_id: request.id }, 'handleThemeRequest');
}

// ── Limites simples en mémoire ($app.store, remises à zéro au redémarrage) ───
function hit(key, max, windowMs) {
  const now = Date.now();
  let list = [];
  try {
    const raw = $app.store().get(`limite:${key}`);
    if (raw) list = JSON.parse(raw);
  } catch (_) {
    list = [];
  }
  list = list.filter((t) => now - t < windowMs);
  const allowed = list.length < max;
  if (allowed) list.push(now);
  $app.store().set(`limite:${key}`, JSON.stringify(list));
  return allowed;
}

module.exports = {
  settingsOf, displayName, activeUser, pushAllowed, pushToAllowed, createNotifications, notificationExists, pushTotals,
  designatedAdminIds, isDesignatedAdmin, messagePush, messageNotificationError, messageNotificationInfo, communityPostNotify, newContentNotify,
  dailyVerse, themeRequestCreated, themeRequestHandled, hit, pbDate,
};
