#!/usr/bin/env node
// Authentification et comptes (bloc 3), contre le BAC À SABLE LOCAL et le FAUX SMTP local.
// Prérequis : PocketBase sur 127.0.0.1:8090 configuré par pocketbase/scripts/configurer-auth.mjs,
// et pocketbase/tests/faux-smtp.mjs en marche. Aucun e-mail réel ; aucune donnée personnelle affichée.
// Tous les comptes et données créés sont supprimés ; les rôles modifiés temporairement sont restaurés.

import crypto from 'node:crypto';
import { fn, http, loadCreds, login, makeChecker, otpFrom, q, sleep, tokenFrom, waitForMail } from './lib.mjs';

const creds = loadCreds(['superuser', 'admin', 'membre', 'membre2']);
const { check, done } = makeChecker();
const su = { token: (await login('_superusers', creds.superuser)).token };
const A = await login('users', creds.membre);
const ADM = await login('users', creds.admin);
const tempUsers = [];
const extra = []; // [collection, id]
const rnd = () => crypto.randomBytes(5).toString('hex');
const pwdGen = () => `${crypto.randomBytes(10).toString('base64url')}A1`;
const pwLogin = (identity, password) => http('POST', '/api/collections/users/auth-with-password', { body: { identity, password } });
const get = async (col, id) => (await http('GET', `/api/collections/${col}/records/${id}`, su)).data;

/** Compte vérifié (superuser) pour les tests ; supprimé à la fin. */
async function tempUser(prefix = 'tmp') {
  const email = `${prefix}-${rnd()}@chay.test`;
  const password = pwdGen();
  const r = await http('POST', '/api/collections/users/records', { ...su, body: { email, password, passwordConfirm: password, name: `Test ${prefix}`, verified: true } });
  tempUsers.push(r.data.id);
  return { email, password, id: r.data.id };
}

try {
  // ═══════════════ Inscription + code à usage unique ═══════════════════════
  console.log('\n■ Inscription et code à usage unique');
  const email = `inscription-${rnd()}@chay.test`;
  const password = pwdGen();
  {
    const asAdmin = await http('POST', '/api/collections/users/records', { body: { email: `x-${rnd()}@chay.test`, password, passwordConfirm: password, role: 'admin' } });
    check('inscription avec role = "admin" -> refusée (le client ne choisit jamais son rôle)', asAdmin.status >= 400, `HTTP ${asAdmin.status}`);
    const asVerified = await http('POST', '/api/collections/users/records', { body: { email: `x-${rnd()}@chay.test`, password, passwordConfirm: password, verified: true } });
    check('inscription avec verified = true -> refusée', asVerified.status >= 400, `HTTP ${asVerified.status}`);
    const r = await http('POST', '/api/collections/users/records', { body: { email, password, passwordConfirm: password } });
    tempUsers.push(r.data?.id);
    const u = await get('users', r.data.id);
    check('inscription sans rôle -> rôle « user » imposé, compte non vérifié', r.status === 200 && u.role === 'user' && u.verified === false);

    const unverified = await pwLogin(email, password);
    const unknown = await pwLogin(`inconnu-${rnd()}@chay.test`, password);
    const wrong = await pwLogin(creds.membre.email, 'mauvais-mot-de-passe');
    check('connexion avant vérification, compte inconnu et mauvais mot de passe : réponses IDENTIQUES',
      [unverified, unknown, wrong].every((x) => x.status === 400 && x.data?.message === 'Failed to authenticate.'));

    const since = Date.now() - 1000;
    const otpUnknown = await http('POST', '/api/collections/users/request-otp', { body: { email: `inconnu-${rnd()}@chay.test` } });
    const otp = await http('POST', '/api/collections/users/request-otp', { body: { email } });
    check('demande de code : même réponse que l’adresse existe ou non', otpUnknown.status === 200 && otp.status === 200 && Boolean(otpUnknown.data?.otpId) && Boolean(otp.data?.otpId));
    const mail = await waitForMail(email, since);
    const code = otpFrom(mail.text);
    check('e-mail capturé par le faux SMTP : code à 6 chiffres, texte français, aucun lien Base44',
      /^\d{6}$/.test(code || '') && /Voici votre code/.test(mail.text) && !/base44/i.test(mail.text));
    const bad = await http('POST', '/api/collections/users/auth-with-otp', { body: { otpId: otp.data.otpId, password: '000000' === code ? '111111' : '000000' } });
    check('mauvais code -> refusé', bad.status === 400);
    const ok = await http('POST', '/api/collections/users/auth-with-otp', { body: { otpId: otp.data.otpId, password: code } });
    check('bon code -> connecté, compte vérifié', ok.status === 200 && ok.data.record.verified === true);
    const reuse = await http('POST', '/api/collections/users/auth-with-otp', { body: { otpId: otp.data.otpId, password: code } });
    check('code réutilisé -> refusé (usage unique)', reuse.status >= 400, `HTTP ${reuse.status}`);
    const setPwd = await fn('setSignupPassword', { token: ok.data.token, body: { password } });
    check('mot de passe d’inscription posé après le code (nouvelle session)', setPwd.status === 200 && Boolean(setPwd.data?.token));
    check('connexion par mot de passe après inscription', (await pwLogin(email, password)).status === 200);
    const replay = await fn('setSignupPassword', { token: setPwd.data.token, body: { password: pwdGen() } });
    check('setSignupPassword rejoué -> refusé (une seule fois)', replay.status === 403);
    const other = await fn('setSignupPassword', { token: A.token, body: { password: pwdGen() } });
    check('setSignupPassword par un compte déjà vérifié -> refusé', other.status === 403);
  }

  // ═══════════════ Mot de passe oublié ═════════════════════════════════════
  console.log('\n■ Mot de passe oublié');
  {
    const t = await tempUser('reset');
    const unknownReset = await http('POST', '/api/collections/users/request-password-reset', { body: { email: `inconnu-${rnd()}@chay.test` } });
    const since = Date.now() - 1000;
    const known = await http('POST', '/api/collections/users/request-password-reset', { body: { email: t.email } });
    check('demande : même réponse que l’adresse existe ou non', unknownReset.status === 204 && known.status === 204);
    const mail = await waitForMail(t.email, since);
    const token = tokenFrom(mail.text);
    check('e-mail : lien vers la page /reset-password de l’app, texte français, aucun lien Base44',
      Boolean(token) && mail.text.includes('http://127.0.0.1:5173/reset-password?token=') && /nouveau mot de passe/.test(mail.text) && !/base44/i.test(mail.text));
    const short = await http('POST', '/api/collections/users/confirm-password-reset', { body: { token, password: 'court', passwordConfirm: 'court' } });
    check('nouveau mot de passe trop court -> refusé', short.status === 400);
    const newPwd = pwdGen();
    const conf = await http('POST', '/api/collections/users/confirm-password-reset', { body: { token, password: newPwd, passwordConfirm: newPwd } });
    check('nouveau mot de passe enregistré', conf.status === 204);
    check('connexion avec le nouveau mot de passe', (await pwLogin(t.email, newPwd)).status === 200);
    check('ancien mot de passe refusé', (await pwLogin(t.email, t.password)).status === 400);
    const again = await http('POST', '/api/collections/users/confirm-password-reset', { body: { token, password: pwdGen(), passwordConfirm: 'x' } });
    const again2 = await http('POST', '/api/collections/users/confirm-password-reset', { body: { token, password: newPwd + 'Z', passwordConfirm: newPwd + 'Z' } });
    check('lien réutilisé -> refusé (usage unique)', again.status === 400 && again2.status === 400);
  }

  // ═══════════════ Changement d'e-mail ═════════════════════════════════════
  console.log('\n■ Changement d’adresse e-mail');
  {
    const t = await tempUser('mail');
    const tok = (await login('users', t)).token;
    const direct = await http('PATCH', `/api/collections/users/records/${t.id}`, { token: tok, body: { email: `direct-${rnd()}@chay.test` } });
    check('modification directe de l’e-mail -> refusée', direct.status >= 400);
    const anon = await http('POST', '/api/collections/users/request-email-change', { body: { newEmail: `x-${rnd()}@chay.test` } });
    check('demande sans être connecté -> refusée', anon.status === 401);
    const newEmail = `nouvelle-${rnd()}@chay.test`;
    const since = Date.now() - 1000;
    const req = await http('POST', '/api/collections/users/request-email-change', { token: tok, body: { newEmail } });
    check('demande de changement acceptée', req.status === 204);
    const mail = await waitForMail(newEmail, since);
    const token = tokenFrom(mail.text);
    check('e-mail envoyé à la NOUVELLE adresse, lien vers /confirmer-email', Boolean(token) && mail.text.includes('http://127.0.0.1:8090/confirmer-email?token='));
    const page = await fetch(`http://127.0.0.1:8090/confirmer-email?token=${token}`);
    check('page de confirmation disponible (français)', page.status === 200 && /Confirmer ma nouvelle adresse/.test(await page.text()));
    const wrongPwd = await http('POST', '/api/collections/users/confirm-email-change', { body: { token, password: 'mauvais' } });
    check('confirmation avec un mauvais mot de passe -> refusée', wrongPwd.status === 400);
    const conf = await http('POST', '/api/collections/users/confirm-email-change', { body: { token, password: t.password } });
    check('confirmation -> adresse changée', conf.status === 204 && (await get('users', t.id)).email === newEmail);
    check('connexion avec la nouvelle adresse, plus avec l’ancienne', (await pwLogin(newEmail, t.password)).status === 200 && (await pwLogin(t.email, t.password)).status === 400);
  }

  // ═══════════════ Règles de users ═════════════════════════════════════════
  console.log('\n■ Règles de la collection users');
  {
    for (const [field, value] of [['role', 'admin'], ['verified', false], ['is_membre', true], ['disabled', true], ['church_assigned', 'x']]) {
      const r = await http('PATCH', `/api/collections/users/records/${A.id}`, { token: A.token, body: { [field]: value } });
      check(`membre : modifier son propre ${field} -> refusé`, r.status >= 400, `HTTP ${r.status}`);
    }
    const city = await http('PATCH', `/api/collections/users/records/${A.id}`, { token: A.token, body: { city: 'Antananarivo' } });
    check('membre : modifier sa ville -> accepté', city.status === 200);
    const list = await http('GET', '/api/collections/users/records?perPage=50&fields=id', { token: A.token });
    check('membre : la liste des comptes ne contient que lui-même', list.data.totalItems === 1 && list.data.items[0].id === A.id);
    const view = await http('GET', `/api/collections/users/records/${ADM.id}`, { token: A.token });
    check('membre : lecture du compte d’un autre -> 404', view.status === 404);
    const self = await http('GET', `/api/collections/users/records/${A.id}`, { token: A.token });
    check('membre : son propre compte lisible, e-mail compris', self.status === 200 && Boolean(self.data.email));
    const t = await tempUser('desactive');
    await http('PATCH', `/api/collections/users/records/${t.id}`, { ...su, body: { disabled: true } });
    const dis = await pwLogin(t.email, t.password);
    check('compte désactivé : connexion refusée avec le message habituel', dis.status === 400 && dis.data?.message === 'Failed to authenticate.');
  }

  // ═══════════════ Invitation ══════════════════════════════════════════════
  console.log('\n■ inviteUser');
  {
    const member = await fn('inviteUser', { token: A.token, body: { user_email: `x-${rnd()}@chay.test`, role: 'admin' } });
    check('membre -> 403', member.status === 403);
    const invalid = await fn('inviteUser', { token: ADM.token, body: { user_email: 'pas-une-adresse', role: 'admin' } });
    check('adresse invalide -> 400', invalid.status === 400);
    const badRole = await fn('inviteUser', { token: ADM.token, body: { user_email: `x-${rnd()}@chay.test`, role: 'superuser' } });
    check('rôle inconnu -> 400', badRole.status === 400);
    const invited = `invite-${rnd()}@chay.test`;
    const since = Date.now() - 1000;
    const r = await fn('inviteUser', { token: ADM.token, body: { user_email: invited, role: 'admin' } });
    check('admin invite une nouvelle adresse -> compte créé', r.status === 200 && r.data.invited === true);
    const u = (await http('GET', `/api/collections/users/records?filter=${q(`email = "${invited}"`)}`, su)).data.items[0];
    tempUsers.push(u.id);
    check('compte invité : rôle demandé, non vérifié', u.role === 'admin' && u.verified === false);
    const token = tokenFrom((await waitForMail(invited, since)).text);
    const pwd = pwdGen();
    const conf = await http('POST', '/api/collections/users/confirm-password-reset', { body: { token, password: pwd, passwordConfirm: pwd } });
    check('l’invité définit son mot de passe par le lien reçu', conf.status === 204);
    const l = await pwLogin(invited, pwd);
    check('l’invité peut se connecter (le lien a vérifié son adresse)', l.status === 200, `HTTP ${l.status} ; vérifié : ${(await get('users', u.id)).verified}`);
    const t = await tempUser('promo');
    const promo = await fn('inviteUser', { token: ADM.token, body: { user_email: t.email, role: 'moderator' } });
    check('adresse existante -> rôle mis à jour, pas de nouveau compte', promo.status === 200 && promo.data.invited === false && (await get('users', t.id)).role === 'moderator');
  }

  // ═══════════════ Suppression de compte ═══════════════════════════════════
  console.log('\n■ Suppression de compte');
  {
    const t = await tempUser('suppr');
    const tTok = (await login('users', t)).token;
    // Données du membre : profil, appareil, notification, réaction, commentaire, publication, message, prière.
    const mk = async (col, body, token = tTok) => {
      const r = await http('POST', `/api/collections/${col}/records`, { token, body });
      if (r.status !== 200) throw new Error(`préparation ${col} : HTTP ${r.status}`);
      return r.data.id;
    };
    const postId = await mk('CommunityPost', { text: 'post de test', author_name: 'X', created_by_id: t.id }, su.token);
    extra.push(['CommunityPost', postId]);
    const profileId = await mk('MemberProfile', { display_name: 'x', created_by_id: t.id });
    const deviceId = await mk('DeviceToken', { user_id: t.id, token: 'tok-suppr', platform: 'android', created_by_id: t.id });
    const reactionId = await mk('PostReaction', { post_id: postId, user_id: t.id, created_by_id: t.id });
    const commentId = await mk('Comment', { post_id: postId, text: 'mon commentaire', created_by_id: t.id });
    extra.push(['Comment', commentId]);
    const notifId = await mk('UserNotification', { user_id: t.id, notification_id: 'suppr', title: 'x' }, su.token);
    const conv = await fn('createConversation', { token: tTok, body: { type: 'direct', participant_ids: [t.id, A.id] } });
    extra.push(['Conversation', conv.data.id]);
    const msg = await fn('createMessage', { token: tTok, body: { conversation_id: conv.data.id, text: 'message à conserver' } });
    extra.push(['Message', msg.data.id]);
    const prayer = await fn('createPrayerRequest', { token: tTok, body: { category: 'Autre', content: 'prière à conserver' } });
    extra.push(['PrayerRequest', prayer.data.id]);
    await fn('quizLevels', { token: tTok, body: {} });

    const byMember = await fn('deleteUserAccount', { token: A.token, body: { user_id: t.id } });
    check('un membre supprime le compte d’un autre -> 403', byMember.status === 403);
    const superuserId = (await http('GET', '/api/collections/_superusers/records?perPage=1&fields=id', su)).data.items[0].id;
    const suDel = await fn('deleteUserAccount', { token: ADM.token, body: { user_id: superuserId } });
    check('un admin vise un superuser -> 404 (hors d’atteinte)', suDel.status === 404);
    const raw = await http('DELETE', `/api/collections/users/records/${t.id}`, { token: tTok });
    check('suppression directe par l’API -> refusée (passe par la route)', raw.status >= 400);

    const del = await fn('deleteMyAccount', { token: tTok, body: {} });
    check('deleteMyAccount -> 200', del.status === 200 && del.data.ok === true && del.data.supprimes >= 5 && del.data.anonymises >= 4, `HTTP ${del.status}`);
    const gone = async (col, id) => (await http('GET', `/api/collections/${col}/records/${id}`, su)).status === 404;
    check('compte supprimé', await gone('users', t.id));
    check('données personnelles supprimées (profil, appareil, réaction, notification)',
      (await gone('MemberProfile', profileId)) && (await gone('DeviceToken', deviceId)) && (await gone('PostReaction', reactionId)) && (await gone('UserNotification', notifId)));
    const quiz = (await http('GET', `/api/collections/QuizUserProgress/records?filter=${q(`user_id = "${t.id}"`)}`, su)).data.totalItems;
    check('progression de jeu supprimée', quiz === 0);
    const c = await get('Comment', commentId);
    check('commentaire conservé, auteur « Ancien membre », plus d’identifiant', c.text === 'mon commentaire' && c.author_name === 'Ancien membre' && c.created_by_id === '');
    const m = await get('Message', msg.data.id);
    check('message conservé, expéditeur « Ancien membre », plus d’identifiant',
      m.text === 'message à conserver' && m.sender_name === 'Ancien membre' && m.sender_id === '' && !m.participant_ids.includes(t.id) && !m.read_by.includes(t.id));
    const cv = await get('Conversation', conv.data.id);
    check('conversation conservée pour l’autre participant, sans le membre supprimé', JSON.stringify(cv.participant_ids) === JSON.stringify([A.id]));
    const p = await get('PrayerRequest', prayer.data.id);
    check('prière conservée sans identité', p.content === 'prière à conserver' && p.requester_id === 'compte-supprime' && p.created_by_id === '');
    check('ancienne session refusée après suppression', (await http('POST', '/api/collections/users/auth-refresh', { token: tTok })).status >= 400);

    const t2 = await tempUser('suppr-admin');
    const byAdmin = await fn('deleteUserAccount', { token: ADM.token, body: { user_id: t2.id } });
    check('un admin supprime un membre -> 200', byAdmin.status === 200 && (await gone('users', t2.id)));

    // Dernier administrateur : on rétrograde temporairement les autres admins (bac à sable), puis on restaure.
    const admins = (await http('GET', `/api/collections/users/records?perPage=50&fields=id,base44_updated_date&filter=${q(`role = "admin" && id != "${ADM.id}"`)}`, su)).data.items;
    try {
      for (const a of admins) await http('PATCH', `/api/collections/users/records/${a.id}`, { ...su, body: { role: 'user' } });
      const last = await fn('deleteMyAccount', { token: ADM.token, body: {} });
      check('le dernier administrateur ne peut pas supprimer son compte -> 409', last.status === 409 && /dernier administrateur/.test(last.data?.error || ''));
      const t3 = await tempUser('autre-admin');
      await http('PATCH', `/api/collections/users/records/${t3.id}`, { ...su, body: { role: 'admin' } });
      const t3Tok = (await login('users', t3)).token;
      await http('PATCH', `/api/collections/users/records/${t3.id}`, { ...su, body: { role: 'user' } });
      const lastByOther = await fn('deleteUserAccount', { token: ADM.token, body: { user_id: ADM.id } });
      check('supprimer le dernier administrateur (par la route admin) -> 409', lastByOther.status === 409);
      void t3Tok;
    } finally {
      for (const a of admins) await http('PATCH', `/api/collections/users/records/${a.id}`, { ...su, body: { role: 'admin', base44_updated_date: a.base44_updated_date } });
      const restored = (await http('GET', `/api/collections/users/records?perPage=1&fields=id&filter=${q(`role = "admin" && id != "${ADM.id}"`)}`, su)).data.totalItems;
      check('rôles des administrateurs restaurés', restored === admins.length);
    }
  }
} finally {
  for (const [col, id] of extra.reverse()) await http('DELETE', `/api/collections/${col}/records/${id}`, su);
  for (const id of tempUsers.filter(Boolean)) {
    const r = await http('DELETE', `/api/collections/users/records/${id}`, su);
    void r;
  }
  await sleep(100);
  console.log('\n(nettoyage effectué : comptes et données de test supprimés)');
}
done();
