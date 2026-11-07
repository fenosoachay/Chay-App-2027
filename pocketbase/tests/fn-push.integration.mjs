#!/usr/bin/env node
// Bloc 5 : notifications push, e-mails et fonctions restantes, contre le BAC À SABLE LOCAL.
// Prérequis (tous sur 127.0.0.1) : PocketBase lancé avec PUSH_SIDECAR_URL / PUSH_SIDECAR_SECRET,
// pocketbase/tests/faux-push.mjs, pocketbase/sidecar-push/serveur.mjs (variables de C:\PB-local\faux-push.env)
// et pocketbase/tests/faux-smtp.mjs. Aucun envoi réel ; aucune donnée personnelle affichée.
// Tout ce qui est créé est supprimé ; les préférences modifiées sont restaurées.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { decodeMail, fn, http, loadCreds, login, makeChecker, q, sleep } from './lib.mjs';
import { loadFauxPushEnv, ORIGIN } from './faux-push.mjs';
import { b64u, decryptWebPush } from '../sidecar-push/crypto-push.mjs';

const creds = loadCreds(['superuser', 'admin', 'membre', 'membre2']);
const { check, done } = makeChecker();
const env = loadFauxPushEnv();
const su = { token: (await login('_superusers', creds.superuser)).token };
const A = await login('users', creds.membre);
const B = await login('users', creds.membre2);
const ADM = await login('users', creds.admin);
const START = Date.now();
const rnd = () => crypto.randomBytes(5).toString('hex');
const created = []; // [collection, id]
const tempUsers = [];
const restore = []; // [id, valeurs d'origine]
const mailDir = process.env.FAUX_SMTP_DIR || 'C:\\PB-local\\mails';

const get = async (col, id) => (await http('GET', `/api/collections/${col}/records/${id}`, su)).data;
const list = async (col, filter, extra = '') => (await http('GET', `/api/collections/${col}/records?perPage=500&filter=${q(filter)}${extra}`, su)).data?.items || [];
const patch = (col, id, body) => http('PATCH', `/api/collections/${col}/records/${id}`, { ...su, body });
const captures = async () => (await (await fetch(`${ORIGIN}/_faux/captures`)).json());
const resetCaptures = () => fetch(`${ORIGIN}/_faux/captures`, { method: 'DELETE' });
const fcmFor = (caps, token) => caps.captures.filter((c) => c.canal === 'fcm' && c.token === token);
const webFor = (caps, id) => caps.captures.filter((c) => c.canal === 'web' && c.id === id);
const userEmail = async (id) => (await get('users', id)).email;

/** E-mails reçus par le faux SMTP pour `to` depuis `since`. */
function mailsTo(to, since) {
  if (!fs.existsSync(mailDir)) return [];
  return fs.readdirSync(mailDir).filter((f) => f.endsWith('.eml') && Number(f.split('-')[0]) >= since)
    .map((f) => fs.readFileSync(path.join(mailDir, f), 'utf8'))
    .filter((raw) => ((/^X-Faux-Smtp-Rcpt: ([^\r\n]*)/m.exec(raw) || [])[1] || '').split(', ').includes(to))
    .map((raw) => ({ raw, text: decodeMail(raw) }));
}
/** Partie HTML d'un e-mail décodé (la partie texte brut n'est pas interprétée par les clients). */
const htmlOf = (m) => { const i = m.text.indexOf('<!DOCTYPE html'); const j = m.text.indexOf('</html>', i); return i >= 0 && j > i ? m.text.slice(i, j + 7) : ''; };
async function waitMails(to, since, n = 1, ms = 6000) {
  const end = Date.now() + ms;
  let m = [];
  while (Date.now() < end) { m = mailsTo(to, since); if (m.length >= n) return m; await sleep(200); }
  return m;
}

/** Compte vérifié temporaire (supprimé à la fin). */
async function tempUser(prefix) {
  const email = `${prefix}-${rnd()}@chay.test`;
  const password = `${crypto.randomBytes(10).toString('base64url')}A1`;
  const r = await http('POST', '/api/collections/users/records', { ...su, body: { email, password, passwordConfirm: password, name: `Test ${prefix}`, verified: true } });
  if (r.status !== 200) throw new Error(`préparation : compte temporaire HTTP ${r.status}`);
  tempUsers.push(r.data.id);
  return { ...(await login('users', { email, password })), email };
}

/** Jeton Android enregistré par le membre lui-même. */
async function deviceToken(user, token) {
  const r = await http('POST', '/api/collections/DeviceToken/records', { token: user.token, body: { user_id: user.id, created_by_id: user.id, token, platform: 'android', is_active: true } });
  if (r.status !== 200) throw new Error(`préparation : DeviceToken HTTP ${r.status}`);
  created.push(['DeviceToken', r.data.id]);
  return r.data.id;
}

/** Abonnement navigateur (clés générées : le test peut déchiffrer ce que reçoit le faux service). */
async function webSub(user, idPrefix = 'ok') {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = b64u(crypto.randomBytes(16));
  const id = `${idPrefix}-${rnd()}`;
  const r = await http('POST', '/api/collections/WebPushSubscription/records', {
    token: user.token,
    body: { user_id: user.id, created_by_id: user.id, endpoint: `${ORIGIN}/wp/${id}`, p256dh: b64u(ecdh.getPublicKey()), auth, user_agent: 'test', is_active: true },
  });
  if (r.status !== 200) throw new Error(`préparation : WebPushSubscription HTTP ${r.status}`);
  created.push(['WebPushSubscription', r.data.id]);
  return { recId: r.data.id, id, priv: b64u(ecdh.getPrivateKey()), auth };
}
const decrypt = (cap, sub) => JSON.parse(decryptWebPush(Buffer.from(cap.body, 'base64'), sub.priv, sub.auth).toString('utf8'));

/** Modifie temporairement les préférences d'un membre (restaurées à la fin). */
async function setPrefs(id, settingsPatch, extra = {}) {
  const u = await get('users', id);
  if (!restore.some(([rid]) => rid === id)) {
    restore.push([id, { settings: u.settings, in_app_messages: u.in_app_messages, email_messages: u.email_messages, in_app_nouveautes: u.in_app_nouveautes, email_nouveautes: u.email_nouveautes }]);
  }
  const r = await patch('users', id, { settings: { ...(u.settings || {}), ...settingsPatch }, ...extra });
  if (r.status !== 200) throw new Error(`préparation : préférences HTTP ${r.status}`);
}
async function resetPrefs(id) {
  const o = restore.find(([rid]) => rid === id);
  if (o) await patch('users', id, o[1]);
}

try {
  await resetCaptures();
  // Préférences « tout activé » pour les comptes de test (restaurées à la fin).
  for (const u of [A, B, ADM]) {
    await setPrefs(u.id, { notifications_enabled: true, notif_push: true, notif_messages: true, notif_news: true, notif_likes: true, notif_comments: true },
      { in_app_messages: true, email_messages: true, in_app_nouveautes: true, email_nouveautes: true });
  }

  // ═══════════════ Sidecar ═══════════════════════════════════════════════════
  console.log('\n■ Sidecar (127.0.0.1:8091)');
  {
    const call = (secret, body) => fetch(`${env.PUSH_SIDECAR_URL}/envoyer`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(secret ? { 'X-Chay-Push-Secret': secret } : {}) }, body: JSON.stringify(body || {}) });
    check('sans secret -> 401', (await call(null)).status === 401);
    check('mauvais secret -> 401', (await call('x'.repeat(43))).status === 401);
    const etat = await (await fetch(`${env.PUSH_SIDECAR_URL}/etat`, { headers: { 'X-Chay-Push-Secret': env.PUSH_SIDECAR_SECRET } })).json();
    check('état : FCM et VAPID configurés, mode local seulement', etat.fcm === 'configured' && etat.web === 'configured' && etat.localOnly === true);
    const r = await (await call(env.PUSH_SIDECAR_SECRET, {
      notification: { title: 't', body: 'b' },
      web: [{ ref: 'x', endpoint: 'https://push.example.com/abc', p256dh: b64u(crypto.createECDH('prime256v1').generateKeys()), auth: b64u(crypto.randomBytes(16)) }],
    })).json();
    check('adresse hors 127.0.0.1 refusée sans requête réseau (mode test)', r.web?.[0]?.classification === 'blocked_non_local' && r.web[0].ok === false);
    const many = await call(env.PUSH_SIDECAR_SECRET, { notification: {}, fcm: Array.from({ length: 501 }, (_, i) => ({ ref: String(i), token: `t${i}` })) });
    check('plus de 500 cibles par appel -> 413', many.status === 413);
    const caps = await captures();
    check('faux services : aucune requête mal signée reçue jusqu\'ici', Object.values(caps.rejects).every((n) => n === 0), JSON.stringify(caps.rejects));
  }

  // ═══════════════ Accès ═════════════════════════════════════════════════════
  console.log('\n■ Accès anonyme et membre');
  const ROUTES = ['sendFcmPush', 'sendWebPush', 'sendMessagePush', 'notifyCommunityPost', 'notifySocialInteraction', 'notifyNewContent',
    'notifyDailyVerse', 'sendTestNotification', 'createCommunityPost', 'createThemeRequest', 'handleThemeRequest'];
  const anon = [];
  for (const name of ROUTES) anon.push([name, (await fn(name, { body: { test: true, post_id: 'x', message_id: 'x', content_id: 'x', theme: 'x', text: 'x' } })).status]);
  check('anonyme refusé sur les 11 routes (401 / 403)', anon.every(([, s]) => s === 401 || s === 403), anon.filter(([, s]) => s !== 401 && s !== 403).map(([n, s]) => `${n}:${s}`).join(' '));
  const adminOnly = [];
  for (const name of ['sendWebPush', 'sendMessagePush', 'notifyNewContent', 'notifyDailyVerse', 'sendTestNotification']) {
    adminOnly.push([name, (await fn(name, { token: A.token, body: { user_ids: [B.id], message_id: 'x', content_id: 'x' } })).status]);
  }
  check('membre refusé (403) sur les 5 routes réservées aux admins', adminOnly.every(([, s]) => s === 403), adminOnly.map(([n, s]) => `${n}:${s}`).join(' '));
  const free = await fn('sendFcmPush', { token: A.token, body: { user_ids: [B.id], title: 'pub', body: 'spam' } });
  check('membre : sendFcmPush vers quelqu\'un d\'autre -> 403 (pas de notification libre)', free.status === 403);

  // ═══════════════ Push de base ═════════════════════════════════════════════
  console.log('\n■ Envoi push : bon destinataire, charge utile, signature');
  const tokB = `ok-${rnd()}`;
  await deviceToken(B, tokB);
  const subB = await webSub(B);
  const tokA = `ok-${rnd()}`;
  await deviceToken(A, tokA);
  {
    await resetCaptures();
    const r = await fn('sendFcmPush', { token: ADM.token, body: { user_ids: [B.id], title: 'Titre test', body: 'Corps test', target_type: 'message', target_id: 'conv1' } });
    const caps = await captures();
    const f = fcmFor(caps, tokB);
    const w = webFor(caps, subB.id);
    check('admin -> 200, Android 1 envoyé, navigateur 1 envoyé', r.status === 200 && r.data.sent === 1 && r.data.webPush?.sent === 1, `HTTP ${r.status} ${JSON.stringify({ s: r.data?.sent, w: r.data?.webPush?.sent, e: r.data?.fcmError })}`);
    check('FCM : message au bon jeton seulement (pas celui de A)', f.length === 1 && fcmFor(caps, tokA).length === 0);
    check('FCM : titre, texte, canal Android « chay-default », data target_*',
      f[0]?.message?.notification?.title === 'Titre test' && f[0]?.message?.notification?.body === 'Corps test'
      && f[0]?.message?.android?.notification?.channel_id === 'chay-default' && f[0]?.message?.data?.target_type === 'message' && f[0]?.message?.data?.target_id === 'conv1');
    const payload = w[0] ? decrypt(w[0], subB) : null;
    check('Web Push : chiffré aes128gcm, déchiffrable par le navigateur, charge utile exacte',
      payload?.title === 'Titre test' && payload?.body === 'Corps test' && payload?.target_type === 'message' && payload?.target_id === 'conv1');
    check('Web Push : TTL 6 h', w[0]?.ttl === 21600);
    check('signatures JWT RS256 (OAuth) et VAPID ES256 acceptées par les faux services', Object.values(caps.rejects).every((n) => n === 0), JSON.stringify(caps.rejects));
    const long = await fn('sendFcmPush', { token: ADM.token, body: { user_ids: [B.id], title: 'T'.repeat(500), body: 'B'.repeat(5000) } });
    const caps2 = await captures();
    const last = fcmFor(caps2, tokB).at(-1);
    check('contenu limité : titre 100, texte 100 caractères (FCM)', long.status === 200 && last?.message?.notification?.title.length === 100 && last?.message?.notification?.body.length === 100);
    const sw = await fn('sendWebPush', { token: ADM.token, body: { user_ids: [B.id], title: 'W', body: 'x'.repeat(1000) } });
    const caps3 = await captures();
    const lw = webFor(caps3, subB.id).at(-1);
    check('sendWebPush admin : navigateur seulement, texte limité à 300', sw.status === 200 && sw.data.sent === 1 && decrypt(lw, subB).body.length === 300 && fcmFor(caps3, tokB).length === fcmFor(caps2, tokB).length);
  }

  console.log('\n■ Test par un membre (vers lui-même, limité)');
  const C = await tempUser('push-c');
  const tokC = `ok-${rnd()}`;
  await deviceToken(C, tokC);
  {
    await resetCaptures();
    const r = await fn('sendFcmPush', { token: C.token, body: { test: true, user_ids: [B.id], title: 'Test de notification Chay', body: 'ok' } });
    const caps = await captures();
    check('membre test -> 200, envoyé à ses propres appareils seulement (user_ids ignoré)',
      r.status === 200 && r.data.sent === 1 && fcmFor(caps, tokC).length === 1 && fcmFor(caps, tokB).length === 0);
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await fn('sendFcmPush', { token: C.token, body: { test: true } })).status);
    check('6e test en 10 min -> 429', statuses.slice(0, 4).every((s) => s === 200) && statuses[4] === 429, statuses.join(','));
  }

  // ═══════════════ Jetons invalides et file d'attente ═══════════════════════
  console.log('\n■ Jetons invalides, réessais et file PushEnvoi');
  {
    const badTok = await deviceToken(B, `invalide-${rnd()}`);
    const badSub = await webSub(B, 'invalide');
    const goneSub = await webSub(B, 'absent');
    const keySub = await webSub(B, 'autre-cle');
    const r = await fn('sendFcmPush', { token: ADM.token, body: { user_ids: [B.id], title: 'x', body: 'y' } });
    check('réponse : 1 jeton Android et 3 abonnements supprimés', r.data?.invalidDeactivated === 1 && r.data?.webPush?.deactivated === 3, JSON.stringify({ a: r.data?.invalidDeactivated, w: r.data?.webPush?.deactivated }));
    check('DeviceToken UNREGISTERED supprimé', (await http('GET', `/api/collections/DeviceToken/records/${badTok}`, su)).status === 404);
    check('WebPushSubscription 410, 404 et 403 (autre clé VAPID) supprimés', (await http('GET', `/api/collections/WebPushSubscription/records/${badSub.recId}`, su)).status === 404
      && (await http('GET', `/api/collections/WebPushSubscription/records/${goneSub.recId}`, su)).status === 404
      && (await http('GET', `/api/collections/WebPushSubscription/records/${keySub.recId}`, su)).status === 404);
    check('le bon jeton et le bon abonnement sont conservés', (await list('DeviceToken', `token = "${tokB}"`)).length === 1 && (await http('GET', `/api/collections/WebPushSubscription/records/${subB.recId}`, su)).status === 200);

    const instable = await deviceToken(B, `instable-${rnd()}`);
    const surcharge = await deviceToken(B, `surcharge-${rnd()}`);
    await resetCaptures();
    const t0 = Date.now();
    const r2 = await fn('sendFcmPush', { token: ADM.token, body: { user_ids: [B.id], title: 'file', body: 'attente' } });
    const caps = await captures();
    const tokI = (await get('DeviceToken', instable)).token;
    check('503 passager : réessayé par le sidecar puis accepté', fcmFor(caps, tokI).length === 1);
    const queued = await list('PushEnvoi', `cible_id = "${surcharge}"`);
    check('503 persistant : cible mise dans PushEnvoi (tentative 1, prochain essai dans ~1 min)', r2.data?.queued === 1 && queued.length === 1 && queued[0].tentatives === 1
      && new Date(queued[0].prochain_essai.replace(' ', 'T')).getTime() > t0 + 30000);
    check('PushEnvoi fermée aux membres et aux admins (règles null)',
      (await http('GET', '/api/collections/PushEnvoi/records', { token: ADM.token })).status === 403 && (await http('GET', '/api/collections/PushEnvoi/records', { token: A.token })).status === 403);
    // Reprise : on avance le prochain essai puis on lance la tâche planifiée.
    await patch('PushEnvoi', queued[0].id, { prochain_essai: new Date(Date.now() - 1000).toISOString().replace('T', ' ') });
    const cron = await http('POST', '/api/crons/push_reessais', su);
    // La tâche tourne en arrière-plan : on attend son résultat.
    let again = [];
    for (let i = 0; i < 40 && !(again.length === 1 && again[0].tentatives === 2); i++) { await sleep(250); again = await list('PushEnvoi', `cible_id = "${surcharge}"`); }
    check('tâche push_reessais : nouvelle tentative, toujours en file (tentative 2)', cron.status === 204 && again.length === 1 && again[0].tentatives === 2, `HTTP ${cron.status} ${again.map((x) => x.tentatives)}`);
    await patch('PushEnvoi', again[0].id, { prochain_essai: new Date(Date.now() - 1000).toISOString().replace('T', ' '), expire: new Date(Date.now() - 1000).toISOString().replace('T', ' ') });
    await http('POST', '/api/crons/push_reessais', su);
    let left = [1];
    for (let i = 0; i < 40 && left.length; i++) { await sleep(250); left = await list('PushEnvoi', `cible_id = "${surcharge}"`); }
    check('envoi expiré (6 h) : retiré de la file sans nouvel essai', left.length === 0);
    await http('DELETE', `/api/collections/DeviceToken/records/${instable}`, su);
    await http('DELETE', `/api/collections/DeviceToken/records/${surcharge}`, su);
    const crons = (await http('GET', '/api/crons', su)).data || [];
    check('tâches planifiées push_reessais (chaque minute) et verset_du_jour (05:00 et 06:00 UTC) déclarées',
      crons.some((c) => c.id === 'push_reessais' && c.expression === '* * * * *') && crons.some((c) => c.id === 'verset_du_jour' && c.expression === '0 5,6 * * *'));
  }

  // ═══════════════ Messages ══════════════════════════════════════════════════
  console.log('\n■ createMessage -> sendMessagePush');
  {
    const conv = await fn('createConversation', { token: A.token, body: { type: 'direct', participant_ids: [A.id, B.id] } });
    const convId = conv.data?.id;
    if (!convId) throw new Error(`préparation : conversation HTTP ${conv.status}`);
    const convWasNew = !(await list('Message', `conversation_id = "${convId}"`)).length;
    if (convWasNew) created.push(['Conversation', convId]);
    const emailB = await userEmail(B.id);
    const nameA = (await get('users', A.id)).name;
    await resetCaptures();
    const since = Date.now();
    const r = await fn('createMessage', { token: A.token, body: { conversation_id: convId, text: 'Bonjour <script>alert(1)</script> & toi' } });
    created.push(['Message', r.data?.id]);
    check('createMessage -> notification_error null (destinataire joignable)', r.status === 200 && r.data.notification_error === null, `${r.status} ${r.data?.notification_error}`);
    const caps = await captures();
    const f = fcmFor(caps, tokB);
    check('push au destinataire seulement (pas à l\'expéditeur)', f.length === 1 && fcmFor(caps, tokA).length === 0 && webFor(caps, subB.id).length === 1);
    check('push : titre « <expéditeur> vous a envoyé un message », aperçu 60 caractères, cible conversation',
      f[0]?.message?.notification?.title === `${nameA || 'Membre'} vous a envoyé un message` && f[0]?.message?.data?.target_id === convId);
    const n = await list('UserNotification', `notification_id = "message_${r.data.id}_${B.id}"`);
    check('notification in-app créée pour B (non lue)', n.length === 1 && n[0].is_read === false && n[0].type === 'message');
    check('aucune notification pour l\'expéditeur', (await list('UserNotification', `notification_id = "message_${r.data.id}_${A.id}"`)).length === 0);
    const mails = await waitMails(emailB, since);
    check('e-mail au destinataire (faux SMTP), en français', mails.length === 1 && /vous a envoy/.test(mails[0].text) && /Ouvrir la conversation/.test(mails[0].text));
    check('e-mail : HTML du message échappé (pas d\'injection)', mails.length === 1 && htmlOf(mails[0]) && !htmlOf(mails[0]).includes('<script>') && htmlOf(mails[0]).includes('&lt;script&gt;'));
    check('e-mail : horodatage email_sent_at enregistré', Boolean(n[0]?.email_sent_at));
    const r2 = await fn('createMessage', { token: A.token, body: { conversation_id: convId, text: 'deuxième' } });
    created.push(['Message', r2.data?.id]);
    await sleep(800);
    check('2e message en moins de 30 min : pas de 2e e-mail (déduplication), mais push envoyé',
      mailsTo(emailB, since).length === 1 && fcmFor(await captures(), tokB).length === 2);
    const again = await fn('sendMessagePush', { token: ADM.token, body: { message_id: r2.data.id } });
    check('sendMessagePush rejoué (admin) : idempotent', again.status === 200 && again.data.skipped === 'already_notified');

    console.log('\n■ Préférences');
    await setPrefs(B.id, { notif_push: false });
    await resetCaptures();
    const r3 = await fn('createMessage', { token: A.token, body: { conversation_id: convId, text: 'sans push' } });
    created.push(['Message', r3.data?.id]);
    const caps3 = await captures();
    check('notif_push = false : aucun push, notification in-app quand même', fcmFor(caps3, tokB).length === 0 && webFor(caps3, subB.id).length === 0
      && (await list('UserNotification', `notification_id = "message_${r3.data.id}_${B.id}"`)).length === 1);
    await setPrefs(B.id, { notif_push: true }, { in_app_messages: false });
    const r4 = await fn('createMessage', { token: A.token, body: { conversation_id: convId, text: 'in-app coupé' } });
    created.push(['Message', r4.data?.id]);
    const n4 = await list('UserNotification', `notification_id = "message_${r4.data.id}_${B.id}"`);
    check('in_app_messages = false : notification marquée lue (ni badge ni bandeau), push maintenu', n4.length === 1 && n4[0].is_read === true && fcmFor(await captures(), tokB).length === 1);
    await setPrefs(B.id, { notifications_enabled: false }, { in_app_messages: true });
    await resetCaptures();
    const r5 = await fn('createMessage', { token: A.token, body: { conversation_id: convId, text: 'tout coupé' } });
    created.push(['Message', r5.data?.id]);
    await sleep(500);
    check('notifications_enabled = false : ni push, ni e-mail (notification lue seulement)',
      fcmFor(await captures(), tokB).length === 0 && mailsTo(emailB, since).length === 1);
    await setPrefs(B.id, { notifications_enabled: true, notif_messages: false });
    await resetCaptures();
    const r6 = await fn('createMessage', { token: A.token, body: { conversation_id: convId, text: 'messages coupés' } });
    created.push(['Message', r6.data?.id]);
    check('notif_messages = false : aucun push', fcmFor(await captures(), tokB).length === 0);
    await setPrefs(B.id, { notif_messages: true });
    for (const id of [r.data.id, r2.data.id, r3.data.id, r4.data.id, r5.data.id, r6.data.id]) {
      for (const x of await list('UserNotification', `notification_id ~ "message_${id}_"`)) created.push(['UserNotification', x.id]);
    }
  }

  // ═══════════════ Prière ════════════════════════════════════════════════════
  console.log('\n■ takePrayer / answerPrayer');
  {
    const p = await http('POST', '/api/collections/PrayerRequest/records', { ...su, body: { requester_id: B.id, category: 'Autre', content: 'test push', status: 'open' } });
    created.push(['PrayerRequest', p.data.id]);
    await resetCaptures();
    const t = await fn('takePrayer', { token: A.token, body: { prayer_id: p.data.id } });
    const caps = await captures();
    check('takePrayer -> push au demandeur seulement (« Quelqu\'un prie pour toi »)', t.status === 200
      && fcmFor(caps, tokB)[0]?.message?.notification?.title === 'Quelqu\'un prie pour toi' && fcmFor(caps, tokA).length === 0
      && fcmFor(caps, tokB)[0]?.message?.data?.target_type === 'prayer');
    await resetCaptures();
    const a = await fn('answerPrayer', { token: B.token, body: { prayer_id: p.data.id } });
    const caps2 = await captures();
    check('answerPrayer -> push à l\'intercesseur seulement', a.status === 200 && fcmFor(caps2, tokA).length === 1 && fcmFor(caps2, tokB).length === 0);
    const p2 = await http('POST', '/api/collections/PrayerRequest/records', { ...su, body: { requester_id: B.id, category: 'Autre', content: 'test push 2', status: 'open' } });
    created.push(['PrayerRequest', p2.data.id]);
    await setPrefs(B.id, { notif_push: false });
    await resetCaptures();
    await fn('takePrayer', { token: A.token, body: { prayer_id: p2.data.id } });
    check('takePrayer : préférence push coupée respectée', fcmFor(await captures(), tokB).length === 0);
    await setPrefs(B.id, { notif_push: true });
    for (const x of await list('UserNotification', `content_id = "${p.data.id}" || content_id = "${p2.data.id}"`)) created.push(['UserNotification', x.id]);
  }

  // ═══════════════ Communauté ════════════════════════════════════════════════
  console.log('\n■ createCommunityPost / notifyCommunityPost');
  let postId;
  {
    await resetCaptures();
    const bad = await fn('createCommunityPost', { token: C.token, body: { text: 'x', image_urls: ['javascript:alert(1)'] } });
    check('image non http(s) -> 400', bad.status === 400);
    const tooLong = await fn('createCommunityPost', { token: C.token, body: { text: 'x'.repeat(5001) } });
    check('texte > 5000 caractères -> 400', tooLong.status === 400);
    const r = await fn('createCommunityPost', { token: C.token, body: { text: 'Publication de test', image_urls: [], author_name: 'Faux nom', created_by_id: A.id } });
    postId = r.data?.id;
    created.push(['CommunityPost', postId]);
    const post = await get('CommunityPost', postId);
    check('publication créée, auteur forcé côté serveur (nom et id du client ignorés)', r.status === 200 && r.data.notification_error === null && post.created_by_id === C.id && post.author_name === 'Test push-c');
    const caps = await captures();
    check('push à la communauté (A et B), pas à l\'auteur', fcmFor(caps, tokA).length === 1 && fcmFor(caps, tokB).length === 1 && fcmFor(caps, tokC).length === 0);
    const notifs = await list('UserNotification', `notification_id = "community_${postId}"`);
    check('notifications in-app pour les autres membres, aucune pour l\'auteur', notifs.length > 0 && !notifs.some((n) => n.user_id === C.id));
    for (const x of notifs) created.push(['UserNotification', x.id]);
    const replay = await fn('notifyCommunityPost', { token: C.token, body: { post_id: postId } });
    check('notifyCommunityPost rejoué par l\'auteur : idempotent', replay.status === 200 && replay.data.skipped === 'already_notified');
    const other = await fn('notifyCommunityPost', { token: B.token, body: { post_id: postId } });
    check('notifyCommunityPost par un autre membre -> 403', other.status === 403);
    const results = [];
    for (let i = 0; i < 3; i++) {
      const x = await fn('createCommunityPost', { token: C.token, body: { text: `rafale ${i}` } });
      created.push(['CommunityPost', x.data?.id]);
      for (const nn of await list('UserNotification', `notification_id = "community_${x.data?.id}"`)) created.push(['UserNotification', nn.id]);
      results.push(x.data?.notification_error);
    }
    check('4e publication dans l\'heure (membre) : créée, mais sans notification (rate_limited)', results[0] === null && results[1] === null && results[2] === 'rate_limited', results.join(','));
  }

  // ═══════════════ Interactions sociales ═════════════════════════════════════
  console.log('\n■ notifySocialInteraction');
  {
    const noLike = await fn('notifySocialInteraction', { token: B.token, body: { action: 'like', post_id: postId, actor_id: B.id } });
    check('« j\'aime » inexistant -> 404 (pas de notification sans vraie interaction)', noLike.status === 404);
    const spoof = await fn('notifySocialInteraction', { token: B.token, body: { action: 'like', post_id: postId, actor_id: A.id } });
    check('actor_id d\'un autre membre -> 403', spoof.status === 403);
    const reac = await http('POST', '/api/collections/PostReaction/records', { token: B.token, body: { post_id: postId, user_id: B.id, created_by_id: B.id, type: 'like' } });
    created.push(['PostReaction', reac.data?.id]);
    await resetCaptures();
    const like = await fn('notifySocialInteraction', { token: B.token, body: { action: 'like', post_id: postId, actor_id: B.id, author_id: A.id } });
    const caps = await captures();
    check('like -> push à l\'auteur de la publication seulement (author_id du client ignoré)', like.status === 200 && fcmFor(caps, tokC).length === 1 && fcmFor(caps, tokA).length === 0);
    const like2 = await fn('notifySocialInteraction', { token: B.token, body: { action: 'like', post_id: postId, actor_id: B.id } });
    check('2e like du même membre sur la même publication : notification regroupée, pas de 2e push', like2.data?.push?.skipped === 'rate_limited' && like2.data?.total === 2);
    const com = await http('POST', '/api/collections/Comment/records', { token: B.token, body: { post_id: postId, text: 'Beau message', created_by_id: B.id } });
    created.push(['Comment', com.data?.id]);
    const badCom = await fn('notifySocialInteraction', { token: A.token, body: { action: 'comment', post_id: postId, actor_id: A.id, comment_id: com.data?.id } });
    check('commentaire d\'un autre membre -> 404', badCom.status === 404);
    await resetCaptures();
    const okCom = await fn('notifySocialInteraction', { token: B.token, body: { action: 'comment', post_id: postId, actor_id: B.id, comment_id: com.data?.id } });
    check('commentaire -> push à l\'auteur', okCom.status === 200 && fcmFor(await captures(), tokC).length === 1);
    const dup = await fn('notifySocialInteraction', { token: B.token, body: { action: 'comment', post_id: postId, actor_id: B.id, comment_id: com.data?.id } });
    check('même commentaire rejoué -> already_notified', dup.data?.skipped === 'already_notified');
    await setPrefs(C.id, { notif_likes: false });
    const off = await fn('notifySocialInteraction', { token: A.token, body: { action: 'like', post_id: postId, actor_id: A.id } });
    check('préférence notif_likes = false respectée', off.data?.skipped === 'pref_likes');
    for (const x of await list('UserNotification', `post_id = "${postId}"`)) created.push(['UserNotification', x.id]);
  }

  // ═══════════════ Nouveau contenu ═══════════════════════════════════════════
  console.log('\n■ notifyNewContent');
  {
    const content = await http('POST', '/api/collections/Content/records', { ...su, body: { type: 'article', title: 'Contenu <b>test</b>', description: 'Description & <i>test</i>', status: 'published' } });
    created.push(['Content', content.data.id]);
    const emailB = await userEmail(B.id);
    const since = Date.now();
    await resetCaptures();
    const r = await fn('notifyNewContent', { token: ADM.token, body: { content_id: content.data.id, send_email: true } });
    check('admin -> 200, notifications créées, e-mails envoyés', r.status === 200 && r.data.created > 0 && r.data.emailsSent > 0, JSON.stringify(r.data));
    check('push « Nouveau : <titre> » à A et B', fcmFor(await captures(), tokB)[0]?.message?.notification?.title === 'Nouveau : Contenu <b>test</b>' && fcmFor(await captures(), tokA).length === 1);
    const m = await waitMails(emailB, since);
    check('e-mail nouveauté : titre et description échappés', m.length === 1 && htmlOf(m[0]).includes('Contenu &lt;b&gt;test&lt;/b&gt;') && !htmlOf(m[0]).includes('<i>test</i>'));
    const again = await fn('notifyNewContent', { token: ADM.token, body: { content_id: content.data.id } });
    check('rejoué -> already_notified', again.data?.skipped === 'already_notified');
    const noId = await fn('notifyNewContent', { token: ADM.token, body: { message: 'x', link: '/x', send_email: false } });
    check('sans content_id (appel de adminNotify.js) -> 400 comme Base44', noId.status === 400);
    for (const x of await list('UserNotification', `notification_id = "content_${content.data.id}"`)) created.push(['UserNotification', x.id]);
  }

  // ═══════════════ Verset du jour ════════════════════════════════════════════
  console.log('\n■ notifyDailyVerse');
  {
    const r = await fn('notifyDailyVerse', { token: ADM.token });
    check('admin -> 200 (envoi, ou too_early / no_devotional selon l\'heure et le planning)', r.status === 200 && (r.data.recipients !== undefined || ['too_early', 'no_devotional'].includes(r.data.skipped)), JSON.stringify(r.data));
    if (r.data.date) for (const x of await list('UserNotification', `notification_id = "verse_${r.data.date}" && created >= "${new Date(START).toISOString().replace('T', ' ')}"`)) created.push(['UserNotification', x.id]);
  }

  // ═══════════════ Notification de test ══════════════════════════════════════
  console.log('\n■ sendTestNotification');
  {
    const since = Date.now();
    const r = await fn('sendTestNotification', { token: ADM.token });
    check('admin -> notification créée et e-mail envoyé', r.status === 200 && r.data.notification.created === true && r.data.email.sent === true);
    check('e-mail de test reçu (faux SMTP)', (await waitMails(await userEmail(ADM.id), since)).length >= 1);
    if (r.data?.notification?.id) created.push(['UserNotification', r.data.notification.id]);
  }

  // ═══════════════ Demandes de thème ═════════════════════════════════════════
  console.log('\n■ createThemeRequest / handleThemeRequest');
  {
    const since = Date.now();
    const r = await fn('createThemeRequest', { token: C.token, body: { theme: 'La foi <img src=x onerror=alert(1)>', passage: 'Hébreux 11' } });
    created.push(['ThemeRequest', r.data?.id]);
    check('createThemeRequest -> 200, admins désignés notifiés', r.status === 200 && r.data.recipients >= 1, JSON.stringify(r.data));
    const tr = await get('ThemeRequest', r.data.id);
    check('demande : auteur forcé, statut pending', tr.user_id === C.id && tr.status === 'pending');
    const adminMail = await waitMails(await userEmail(ADM.id), since);
    const themeMail = adminMail.find((m) => /Nouvelle demande de th/.test(m.text));
    check('e-mail aux admins : thème échappé (pas de balise img active)', Boolean(themeMail) && !htmlOf(themeMail).includes('<img src=x') && htmlOf(themeMail).includes('&lt;img'));
    const memberHandle = await fn('handleThemeRequest', { token: A.token, body: { request_id: r.data.id, decision: 'validated' } });
    check('membre -> 403 (admins désignés seulement)', memberHandle.status === 403);
    await resetCaptures();
    const h = await fn('handleThemeRequest', { token: ADM.token, body: { request_id: r.data.id, decision: 'declined', admin_note: 'Déjà traité <b>récemment</b>' } });
    check('admin désigné -> 200, statut declined', h.status === 200 && h.data.request?.status === 'declined', `HTTP ${h.status}`);
    check('push au demandeur seulement', fcmFor(await captures(), tokC).length === 1 && fcmFor(await captures(), tokA).length === 0);
    const cMail = (await waitMails(C.email, since)).find((m) => /Réponse à ta demande/.test(m.text));
    check('e-mail au demandeur, en français, sans HTML injecté', Boolean(cMail) && htmlOf(cMail).includes('&lt;b&gt;r') && !htmlOf(cMail).includes('<b>récemment</b>'));
    const twice = await fn('handleThemeRequest', { token: ADM.token, body: { request_id: r.data.id, decision: 'validated' } });
    check('déjà traitée -> 409', twice.status === 409 && twice.data.status === 'declined');
    const statuses = [];
    for (let i = 0; i < 10; i++) {
      const x = await fn('createThemeRequest', { token: C.token, body: { theme: `thème ${i}` } });
      statuses.push(x.status);
      if (x.data?.id) created.push(['ThemeRequest', x.data.id]);
    }
    check('limite : 10 demandes par 24 h, la 11e -> 429', statuses.slice(0, 9).every((s) => s === 200) && statuses[9] === 429, statuses.join(','));
    for (const [col, id] of created.filter(([c]) => c === 'ThemeRequest')) {
      for (const x of await list('UserNotification', `content_id = "${id}"`)) created.push(['UserNotification', x.id]);
    }
  }

  // ═══════════════ Journaux ═════════════════════════════════════════════════
  console.log('\n■ Journaux sans donnée personnelle');
  {
    const log = fs.existsSync('C:\\PB-local\\sidecar-push.log') ? fs.readFileSync('C:\\PB-local\\sidecar-push.log', 'utf8') : '';
    const secrets = [tokB, tokA, tokC, subB.id, env.PUSH_SIDECAR_SECRET, env.VAPID_PRIVATE_KEY, B.id, A.id, await userEmail(B.id)];
    check('journal du sidecar : aucun jeton, abonnement, identifiant, e-mail ni secret', log.length > 0 && secrets.every((s) => !log.includes(s)));
    const logs = (await http('GET', `/api/logs?perPage=200&filter=${q(`message ~ "[push]" && created >= "${new Date(START).toISOString().replace('T', ' ')}"`)}`, su)).data?.items || [];
    const text = JSON.stringify(logs);
    check('journaux PocketBase [push] : nombres seulement (aucun jeton ni identifiant)', logs.length > 0 && [tokB, tokA, B.id, A.id].every((s) => !text.includes(s)));
  }
} finally {
  // ═══════════════ Nettoyage ════════════════════════════════════════════════
  for (const [col, id] of created.reverse()) if (id) await http('DELETE', `/api/collections/${col}/records/${id}`, su);
  for (const id of tempUsers) {
    for (const col of ['DeviceToken', 'WebPushSubscription', 'UserNotification', 'ThemeRequest']) {
      for (const x of await list(col, `user_id = "${id}"`)) await http('DELETE', `/api/collections/${col}/records/${x.id}`, su);
    }
    for (const x of await list('CommunityPost', `created_by_id = "${id}"`)) await http('DELETE', `/api/collections/CommunityPost/records/${x.id}`, su);
    await http('DELETE', `/api/collections/users/records/${id}`, su);
  }
  for (const [id] of restore) await resetPrefs(id);
  for (const x of await list('PushEnvoi', `created >= "${new Date(START).toISOString().replace('T', ' ')}"`)) await http('DELETE', `/api/collections/PushEnvoi/records/${x.id}`, su);
  console.log('\n(nettoyage effectué : données de test supprimées, préférences restaurées)');
}
done();
