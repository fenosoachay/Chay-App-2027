#!/usr/bin/env node
// Interrupteur NOTIFICATIONS_MODE (off / test / on), contre le BAC À SABLE LOCAL.
//   node pocketbase/tests/fn-mode-notifications.integration.mjs <off|test|on>
// PocketBase ET le sidecar doivent avoir été lancés avec le même NOTIFICATIONS_MODE ; en mode test,
// NOTIFICATIONS_TEST_EMAILS=mode-liste@chay.test (compte temporaire créé ici). Faux services seulement
// (faux-push, faux-smtp) ; aucun envoi réel ; aucune donnée personnelle affichée ; tout est supprimé à la fin.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fn, http, loadCreds, login, makeChecker, q, sleep } from './lib.mjs';
import { ORIGIN } from './faux-push.mjs';
import { b64u } from '../sidecar-push/crypto-push.mjs';

const MODE = process.argv[2];
if (!['off', 'test', 'on'].includes(MODE)) { console.error('usage : fn-mode-notifications.integration.mjs <off|test|on>'); process.exit(2); }
const LISTED = 'mode-liste@chay.test';
const OTHER = 'mode-hors-liste@chay.test';

const creds = loadCreds(['superuser', 'admin']);
const { check, done } = makeChecker();
const su = { token: (await login('_superusers', creds.superuser)).token };
const ADM = await login('users', creds.admin);
const START = Date.now();
const startPb = new Date(START).toISOString().replace('T', ' ');
const rnd = () => crypto.randomBytes(5).toString('hex');
const tempUsers = [];
const created = [];
const mailDir = process.env.FAUX_SMTP_DIR || 'C:\\PB-local\\mails';

const list = async (col, filter) => (await http('GET', `/api/collections/${col}/records?perPage=500&filter=${q(filter)}`, su)).data?.items || [];
const captures = async () => (await (await fetch(`${ORIGIN}/_faux/captures`)).json()).captures;
const fcmCount = (caps, token) => caps.filter((c) => c.canal === 'fcm' && c.token === token).length;
const webCount = (caps, id) => caps.filter((c) => c.canal === 'web' && c.id === id).length;
const mailsTo = (to, since) => (fs.existsSync(mailDir) ? fs.readdirSync(mailDir) : [])
  .filter((f) => f.endsWith('.eml') && Number(f.split('-')[0]) >= since)
  .map((f) => fs.readFileSync(path.join(mailDir, f), 'utf8'))
  .filter((raw) => ((/^X-Faux-Smtp-Rcpt: ([^\r\n]*)/m.exec(raw) || [])[1] || '').split(', ').includes(to)).length;
const expect = (listed, other) => ({ off: [0, 0], test: [listed, 0], on: [listed, other] })[MODE];

async function tempUser(email) {
  for (const x of await list('users', `email = "${email}"`)) await http('DELETE', `/api/collections/users/records/${x.id}`, su);
  const password = `${crypto.randomBytes(10).toString('base64url')}A1`;
  const settings = { notifications_enabled: true, notif_push: true, notif_verse: true };
  const r = await http('POST', '/api/collections/users/records', { ...su, body: { email, password, passwordConfirm: password, name: 'Test mode', verified: true, settings } });
  if (r.status !== 200) throw new Error(`préparation : compte temporaire HTTP ${r.status}`);
  tempUsers.push(r.data.id);
  return { ...(await login('users', { email, password })), email };
}
async function targets(user) {
  const token = `ok-${rnd()}`;
  const t = await http('POST', '/api/collections/DeviceToken/records', { token: user.token, body: { user_id: user.id, created_by_id: user.id, token, platform: 'android', is_active: true } });
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const id = `ok-${rnd()}`;
  const w = await http('POST', '/api/collections/WebPushSubscription/records', {
    token: user.token,
    body: { user_id: user.id, created_by_id: user.id, endpoint: `${ORIGIN}/wp/${id}`, p256dh: b64u(ecdh.getPublicKey()), auth: b64u(crypto.randomBytes(16)), user_agent: 'test', is_active: true },
  });
  if (t.status !== 200 || w.status !== 200) throw new Error('préparation : cibles push');
  return { token, tokenRec: t.data.id, webId: id, webRec: w.data.id };
}
async function waitFor(fnc, ok, ms = 8000) {
  const end = Date.now() + ms;
  let v = await fnc();
  while (Date.now() < end && !ok(v)) { await sleep(250); v = await fnc(); }
  return v;
}

console.log(`Mode attendu : ${MODE}`);
try {
  const etat = await (await fetch('http://127.0.0.1:8091/etat', { headers: { 'X-Chay-Push-Secret': (fs.readFileSync('C:/PB-local/faux-push.env', 'utf8').match(/^PUSH_SIDECAR_SECRET=(.*)$/m) || [])[1]?.trim() || '' } })).json();
  check(`sidecar lancé en mode ${MODE}`, etat.mode === MODE, `mode=${etat.mode}`);

  const L = await tempUser(LISTED);
  const H = await tempUser(OTHER);
  const tl = await targets(L);
  const th = await targets(H);
  await fetch(`${ORIGIN}/_faux/captures`, { method: 'DELETE' });

  console.log('\n■ Push direct (sendFcmPush, sendWebPush)');
  {
    const r = await fn('sendFcmPush', { token: ADM.token, body: { user_ids: [L.id, H.id], title: 'mode', body: 'test' } });
    const w = await fn('sendWebPush', { token: ADM.token, body: { user_ids: [L.id, H.id], title: 'mode', body: 'web' } });
    await sleep(300);
    const caps = await captures();
    const [el, eh] = expect(1, 1);
    check(`Android : compte listé ${el}, autre ${eh}`, fcmCount(caps, tl.token) === el && fcmCount(caps, th.token) === eh, `${fcmCount(caps, tl.token)}/${fcmCount(caps, th.token)}`);
    const [wl, wh] = expect(2, 2);
    check(`navigateur : compte listé ${wl}, autre ${wh}`, webCount(caps, tl.webId) === wl && webCount(caps, th.webId) === wh, `${webCount(caps, tl.webId)}/${webCount(caps, th.webId)}`);
    check('réponses HTTP 200', r.status === 200 && w.status === 200);
    if (MODE === 'off') check('réponse : fcmError = notifications_off, aucun envoi, rien en file', r.data.fcmError === 'notifications_off' && r.data.sent === 0 && r.data.queued === 0 && w.data.skipped === 'notifications_off');
    if (MODE === 'test') check('réponse : 1 destinataire ignoré (blocked = 1)', r.data.blocked === 1 && w.data.blocked === 1);
  }

  console.log('\n■ E-mails (demandes de thème, notification de test)');
  {
    const since = Date.now();
    const ids = [];
    for (const u of [L, H]) {
      const c = await fn('createThemeRequest', { token: u.token, body: { theme: `thème de test ${MODE}` } });
      if (c.data?.id) { ids.push(c.data.id); created.push(['ThemeRequest', c.data.id]); }
    }
    for (const id of ids) await fn('handleThemeRequest', { token: ADM.token, body: { request_id: id, decision: 'validated' } });
    const t = await fn('sendTestNotification', { token: ADM.token });
    if (t.data?.notification?.id) created.push(['UserNotification', t.data.notification.id]);
    await sleep(MODE === 'off' ? 1500 : 300);
    const [ml, mh] = expect(1, 1);
    const got = await waitFor(async () => [mailsTo(LISTED, since), mailsTo(OTHER, since)], ([a, b]) => a >= ml && b >= mh, MODE === 'off' ? 500 : 6000);
    check(`réponse à la demande de thème : compte listé ${ml ? '≥ 1' : '0'}, autre ${mh ? '≥ 1' : '0'}`, (ml ? got[0] >= 1 : got[0] === 0) && (mh ? got[1] >= 1 : got[1] === 0), `${got[0]}/${got[1]}`);
    const admEmail = (await http('GET', `/api/collections/users/records/${ADM.id}`, su)).data.email;
    const admMails = mailsTo(admEmail, since);
    if (MODE === 'on') check('e-mail de test à l\'admin envoyé', t.data.email.sent === true && admMails >= 1);
    else check('admin non listé : aucun e-mail (test ni demande de thème), raison indiquée', t.data.email.sent === false && /NOTIFICATIONS_MODE/.test(t.data.email.error || '') && admMails === 0);
  }

  console.log('\n■ Message privé (createMessage) : destinataire dans la liste, hors liste, sans appareil');
  {
    // Bogue « La notification du destinataire n'a pas pu être envoyée » : un envoi retenu volontairement par
    // NOTIFICATIONS_MODE, ou un destinataire sans appareil abonné, était renvoyé comme notification_error.
    const N = await tempUser(`mode-sans-appareil-${rnd()}@chay.test`); // jamais listé, aucun abonnement push
    const direct = async (a, b) => {
      const c = await http('POST', '/api/collections/Conversation/records', { ...su, body: { type: 'direct', participant_ids: [a.id, b.id], created_by_id: a.id } });
      if (c.status !== 200) throw new Error(`préparation : Conversation HTTP ${c.status}`);
      created.push(['Conversation', c.data.id]);
      return c.data.id;
    };
    const send = async (from, conversationId, body) => {
      const r = await fn('createMessage', { token: from.token, body: { conversation_id: conversationId, ...body } });
      if (r.data?.id) created.push(['Message', r.data.id]);
      return r;
    };
    const notifFor = async (msgId, uid) => (await list('UserNotification', `notification_id = "message_${msgId}_${uid}"`)).length;
    const cLH = await direct(L, H);
    const cLN = await direct(L, N);

    await fetch(`${ORIGIN}/_faux/captures`, { method: 'DELETE' });
    const cas = [
      // [libellé, expéditeur, conversation, destinataire, corps envoyé par ConversationView, notification_info attendue]
      ['texte, destinataire DANS la liste (abonné)', H, cLH, L, { text: 'Bonjour', reply_to_id: null }, MODE === 'off' ? 'notifications_off' : null],
      ['texte, destinataire HORS liste (abonné)', L, cLH, H, { text: 'Bonsoir', reply_to_id: null }, MODE === 'on' ? null : `notifications_${MODE}`],
      ['photo, destinataire HORS liste (abonné)', L, cLH, H, { text: '', image_url: `${ORIGIN}/photo.jpg` }, MODE === 'on' ? null : `notifications_${MODE}`],
      ['texte, destinataire sans appareil', L, cLN, N, { text: 'Salut', reply_to_id: null }, MODE === 'on' ? 'no_push_subscription' : `notifications_${MODE}`],
    ];
    for (const [label, from, conversationId, to, body, info] of cas) {
      const r = await send(from, conversationId, body);
      check(`${label} : 200, notification_error = null, notification_info = ${info}`,
        r.status === 200 && r.data.notification_error === null && r.data.notification_info === info,
        `${r.status} error=${r.data?.notification_error} info=${r.data?.notification_info}`);
      check(`${label} : aucune notification de cloche (message privé : push seulement)`, (await notifFor(r.data.id, to.id)) === 0);
    }
    await sleep(300);
    const caps = await captures();
    const [pl, ph] = expect(1, 2);
    check(`push Android : destinataire listé ${pl}, hors liste ${ph}`, fcmCount(caps, tl.token) === pl && fcmCount(caps, th.token) === ph, `${fcmCount(caps, tl.token)}/${fcmCount(caps, th.token)}`);
  }

  console.log('\n■ File PushEnvoi et tâche push_reessais');
  {
    await fetch(`${ORIGIN}/_faux/captures`, { method: 'DELETE' });
    const past = new Date(Date.now() - 1000).toISOString().replace('T', ' ');
    const later = new Date(Date.now() + 3600000).toISOString().replace('T', ' ');
    const rows = [];
    for (const [canal, ref] of [['fcm', tl.tokenRec], ['fcm', th.tokenRec], ['web', tl.webRec], ['web', th.webRec]]) {
      const r = await http('POST', '/api/collections/PushEnvoi/records', { ...su, body: { canal, cible_id: ref, titre: 'file', texte: 'reprise', target_type: 'test', target_id: 'x', tentatives: 1, prochain_essai: past, expire: later, derniere_erreur: 'test' } });
      if (r.status !== 200) throw new Error(`préparation : PushEnvoi HTTP ${r.status}`);
      rows.push(r.data.id);
    }
    await http('POST', '/api/crons/push_reessais', su);
    const left = await waitFor(async () => (await list('PushEnvoi', rows.map((id) => `id = "${id}"`).join(' || '))).length, (n) => n === 0);
    await sleep(300);
    const caps = await captures();
    const [el, eh] = expect(1, 1);
    check('file traitée (lignes retirées, rien remis en file)', left === 0 && (await list('PushEnvoi', `created >= "${startPb}"`)).length === 0);
    check(`réessais : compte listé ${el} + ${el}, autre ${eh} + ${eh}`, fcmCount(caps, tl.token) === el && webCount(caps, tl.webId) === el && fcmCount(caps, th.token) === eh && webCount(caps, th.webId) === eh,
      `${fcmCount(caps, tl.token)},${webCount(caps, tl.webId)}/${fcmCount(caps, th.token)},${webCount(caps, th.webId)}`);
  }

  console.log('\n■ Verset du jour');
  {
    const r = await fn('notifyDailyVerse', { token: ADM.token });
    if (r.data?.date) for (const x of await list('UserNotification', `notification_id = "verse_${r.data.date}" && created >= "${startPb}"`)) created.push(['UserNotification', x.id]);
    if (MODE === 'off') {
      check('route : arrêt immédiat (skipped = notifications_off)', r.status === 200 && r.data.skipped === 'notifications_off', JSON.stringify(r.data));
      await http('POST', '/api/crons/verset_du_jour', su);
      const logs = await waitFor(async () => (await http('GET', `/api/logs?perPage=50&filter=${q(`message ~ "verset_du_jour" && created >= "${startPb}"`)}`, su)).data?.items || [], (l) => l.some((x) => x.message === '[verset_du_jour]'));
      const cronLog = logs.find((x) => x.message === '[verset_du_jour]');
      check('tâche cron de 7 h : arrêtée avant de parcourir les destinataires', Boolean(cronLog) && cronLog.data.resultat === 'notifications_off' && cronLog.data.destinataires === 0);
    } else if (MODE === 'test') {
      const ok = r.status === 200 && (['too_early', 'no_devotional'].includes(r.data.skipped) || (r.data.recipients <= 1));
      check('route : seuls les comptes listés sont parcourus (0 ou 1 destinataire)', ok, JSON.stringify({ skipped: r.data.skipped, recipients: r.data.recipients }));
      const others = r.data.date ? await list('UserNotification', `notification_id = "verse_${r.data.date}" && created >= "${startPb}" && user_id != "${L.id}"`) : [];
      check('aucune notification du verset pour un compte non listé', others.length === 0);
    } else {
      check('route : comportement normal (pas notifications_off)', r.status === 200 && r.data.skipped !== 'notifications_off');
    }
  }

  console.log('\n■ Journaux');
  {
    // Les journaux sont écrits par lots : on attend un peu.
    const getLogs = async () => (await http('GET', `/api/logs?perPage=200&filter=${q(`message ~ "[sortie]" && created >= "${startPb}"`)}`, su)).data?.items || [];
    const logs = MODE === 'on' ? (await sleep(3000), await getLogs()) : await waitFor(getLogs, (l) => l.length > 0, 10000);
    const text = JSON.stringify(logs);
    if (MODE === 'on') check('mode on : aucun envoi bloqué', logs.length === 0);
    else check('envois bloqués journalisés (compteurs seulement, ni adresse ni identifiant)', logs.length > 0 && [LISTED, OTHER, L.id, H.id, tl.token, th.token].every((s) => !text.includes(s)));
  }
} finally {
  for (const [col, id] of created.reverse()) if (id) await http('DELETE', `/api/collections/${col}/records/${id}`, su);
  for (const id of tempUsers) {
    for (const col of ['DeviceToken', 'WebPushSubscription', 'UserNotification', 'ThemeRequest']) {
      for (const x of await list(col, `user_id = "${id}"`)) await http('DELETE', `/api/collections/${col}/records/${x.id}`, su);
    }
    await http('DELETE', `/api/collections/users/records/${id}`, su);
  }
  for (const x of await list('UserNotification', `notification_id ~ "theme_request_" && created >= "${startPb}"`)) await http('DELETE', `/api/collections/UserNotification/records/${x.id}`, su);
  for (const x of await list('PushEnvoi', `created >= "${startPb}"`)) await http('DELETE', `/api/collections/PushEnvoi/records/${x.id}`, su);
  console.log('\n(nettoyage effectué)');
}
done();
