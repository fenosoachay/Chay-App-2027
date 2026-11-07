#!/usr/bin/env node
// Corrections de collections du bloc 3 (bac à sable local) : pour chacune, le cas qui passait
// avant est refusé et l'usage légitime marche. Tout ce qui est créé est supprimé à la fin.

import { fn, http, loadCreds, login, makeChecker, q } from './lib.mjs';

const creds = loadCreds(['superuser', 'admin', 'membre', 'membre2']);
const { check, done } = makeChecker();
const su = { token: (await login('_superusers', creds.superuser)).token };
const A = await login('users', creds.membre);
const B = await login('users', creds.membre2);
const ADM = await login('users', creds.admin);
const created = []; // [collection, id]
const post = async (token, col, body) => {
  const r = await http('POST', `/api/collections/${col}/records`, { token, body });
  if (r.status === 200) created.push([col, r.data.id]);
  return r;
};
const patch = (token, col, id, body) => http('PATCH', `/api/collections/${col}/records/${id}`, { token, body });
const get = async (col, id) => (await http('GET', `/api/collections/${col}/records/${id}`, su)).data;
const refused = (r) => r.status >= 400;
const nameOf = async (id) => {
  const u = await get('users', id);
  return u.name || [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Membre';
};

try {
  // ── DeviceToken / WebPushSubscription ─────────────────────────────────────
  for (const [col, extra] of [['DeviceToken', { token: 'tok-test', platform: 'android' }], ['WebPushSubscription', { endpoint: 'https://push.test/x', p256dh: 'k', auth: 'a' }]]) {
    console.log(`\n■ ${col}`);
    const other = await post(A.token, col, { ...extra, user_id: B.id, created_by_id: A.id });
    check('AVANT autorisé, MAINTENANT refusé : enregistrer un appareil au nom d’un autre membre', refused(other), `HTTP ${other.status}`);
    const mine = await post(A.token, col, { ...extra, user_id: A.id, created_by_id: A.id });
    check('légitime : enregistrer son propre appareil', mine.status === 200);
    const steal = await patch(A.token, col, mine.data.id, { user_id: B.id });
    check('AVANT autorisé, MAINTENANT refusé : réattribuer l’appareil à un autre membre', refused(steal), `HTTP ${steal.status}`);
    const toggle = await patch(A.token, col, mine.data.id, { is_active: false });
    check('légitime : désactiver son appareil', toggle.status === 200);
  }

  // ── UserNotification ──────────────────────────────────────────────────────
  console.log('\n■ UserNotification');
  {
    const n = await post(su.token, 'UserNotification', { user_id: A.id, notification_id: 'bloc3-test', title: 'Titre', message: 'm', is_read: false });
    const move = await patch(A.token, 'UserNotification', n.data.id, { user_id: B.id, title: 'Faux message de l’admin' });
    check('AVANT autorisé, MAINTENANT refusé : déplacer sa notification chez un autre membre', refused(move), `HTTP ${move.status}`);
    const retitle = await patch(A.token, 'UserNotification', n.data.id, { title: 'modifié' });
    check('refusé : modifier le titre de sa notification', refused(retitle), `HTTP ${retitle.status}`);
    const read = await patch(A.token, 'UserNotification', n.data.id, { is_read: true, read_at: new Date().toISOString() });
    check('légitime : marquer sa notification comme lue', read.status === 200);
    const after = await get('UserNotification', n.data.id);
    check('la notification est restée chez A, titre inchangé', after.user_id === A.id && after.title === 'Titre' && after.is_read === true);
  }

  // ── PostReaction (+ nom affiché, index unique) ────────────────────────────
  console.log('\n■ PostReaction');
  {
    const cp = await post(su.token, 'CommunityPost', { text: 'publication de test', author_name: 'A', created_by_id: A.id });
    const pid = cp.data.id;
    const fake = await post(A.token, 'PostReaction', { post_id: pid, user_id: B.id, user_name: 'B', created_by_id: A.id });
    check('AVANT autorisé, MAINTENANT refusé : réagir au nom d’un autre membre', refused(fake), `HTTP ${fake.status}`);
    const mine = await post(A.token, 'PostReaction', { post_id: pid, user_id: A.id, user_name: 'Pasteur officiel', created_by_id: A.id });
    check('légitime : réagir en son nom', mine.status === 200);
    check('nom affiché imposé par le serveur (pas « Pasteur officiel »)', (await get('PostReaction', mine.data.id)).user_name === await nameOf(A.id));
    const twice = await post(A.token, 'PostReaction', { post_id: pid, user_id: A.id, created_by_id: A.id });
    check('AVANT autorisé, MAINTENANT refusé : deuxième réaction du même membre (index unique)', refused(twice), `HTTP ${twice.status}`);
    const move = await patch(A.token, 'PostReaction', mine.data.id, { post_id: 'f'.repeat(24) });
    check('refusé : déplacer sa réaction vers une autre publication', refused(move), `HTTP ${move.status}`);
    const bReact = await post(B.token, 'PostReaction', { post_id: pid, user_id: B.id, created_by_id: B.id });
    check('légitime : un autre membre réagit à la même publication', bReact.status === 200);

    // ── CommunityPost.likes ─────────────────────────────────────────────────
    console.log('\n■ CommunityPost.likes');
    const likes = await patch(A.token, 'CommunityPost', pid, { likes: 999 });
    check('AVANT autorisé, MAINTENANT refusé : l’auteur gonfle son compteur de « j’aime »', refused(likes), `HTTP ${likes.status}`);
    const edit = await patch(A.token, 'CommunityPost', pid, { text: 'publication corrigée' });
    check('légitime : l’auteur corrige son texte', edit.status === 200);
  }

  // ── Nom affiché : Comment, ChatMessage, ChatPresence, MemberProfile ───────
  console.log('\n■ Nom affiché imposé');
  {
    const expected = await nameOf(A.id);
    for (const [col, field, body] of [
      ['Comment', 'author_name', { post_id: 'f'.repeat(24), text: 'commentaire' }],
      ['ChatMessage', 'author_name', { room_id: 'general', text: 'bonjour' }],
      ['ChatPresence', 'display_name', { last_seen_at: new Date().toISOString() }],
      ['MemberProfile', 'display_name', { bio: 'test' }],
    ]) {
      const r = await post(A.token, col, { ...body, [field]: 'Admin officiel', created_by_id: A.id });
      check(`${col} : création acceptée, nom imposé (pas « Admin officiel »)`, r.status === 200 && (await get(col, r.data.id))[field] === expected, `HTTP ${r.status}`);
      const u = await patch(A.token, col, r.data.id, { [field]: 'Autre nom' });
      check(`${col} : modification du nom -> nom du compte conservé`, u.status === 200 && (await get(col, r.data.id))[field] === expected);
    }
  }

  // ── BlockBlastScore.user_id ───────────────────────────────────────────────
  console.log('\n■ BlockBlastScore');
  {
    const s = await post(A.token, 'BlockBlastScore', { user_id: A.id, score: 10, best_score: 10, rows_cleared: 1, columns_cleared: 1, played_at: new Date().toISOString(), created_by_id: A.id });
    check('légitime : enregistrer son score', s.status === 200, `HTTP ${s.status}`);
    const move = await patch(A.token, 'BlockBlastScore', s.data.id, { user_id: B.id });
    check('AVANT autorisé, MAINTENANT refusé : attribuer son score à un autre membre', refused(move), `HTTP ${move.status}`);
    const better = await patch(A.token, 'BlockBlastScore', s.data.id, { best_score: 20 });
    check('légitime : mettre à jour son meilleur score', better.status === 200);
  }

  // ── read_by / pinned_by / muted_by ────────────────────────────────────────
  console.log('\n■ read_by, pinned_by, muted_by : seulement son propre id');
  {
    const conv = await fn('createConversation', { token: A.token, body: { type: 'direct', participant_ids: [A.id, ADM.id] } });
    created.push(['Conversation', conv.data.id]);
    const m = await fn('createMessage', { token: ADM.token, body: { conversation_id: conv.data.id, text: 'test' } });
    created.push(['Message', m.data.id]);
    const addOther = await patch(A.token, 'Message', m.data.id, { read_by: [ADM.id, A.id, B.id] });
    check('AVANT autorisé, MAINTENANT refusé : ajouter l’id d’un autre dans read_by', refused(addOther), `HTTP ${addOther.status}`);
    const removeOther = await patch(A.token, 'Message', m.data.id, { read_by: [] });
    check('refusé : retirer l’id d’un autre de read_by', refused(removeOther), `HTTP ${removeOther.status}`);
    const addSelf = await patch(A.token, 'Message', m.data.id, { read_by: [ADM.id, A.id] });
    check('légitime : se marquer comme lecteur', addSelf.status === 200);
    const removeSelf = await patch(A.token, 'Message', m.data.id, { read_by: [ADM.id] });
    check('légitime : se retirer (marquer non lu)', removeSelf.status === 200);
    for (const field of ['pinned_by', 'muted_by']) {
      const other = await patch(A.token, 'Conversation', conv.data.id, { [field]: [ADM.id] });
      check(`refusé : ${field} avec l’id d’un autre`, refused(other), `HTTP ${other.status}`);
      const self = await patch(A.token, 'Conversation', conv.data.id, { [field]: [A.id] });
      check(`légitime : ${field} avec son propre id`, self.status === 200);
    }
  }
} finally {
  for (const [col, id] of created.reverse()) await http('DELETE', `/api/collections/${col}/records/${id}`, su);
  for (const col of ['PostReaction', 'Comment', 'ChatMessage', 'ChatPresence', 'MemberProfile', 'BlockBlastScore', 'DeviceToken', 'WebPushSubscription']) {
    for (const u of [A.id, B.id]) {
      const r = await http('GET', `/api/collections/${col}/records?perPage=50&fields=id&filter=${q(`created_by_id = "${u}"`)}`, su);
      for (const it of r.data?.items || []) await http('DELETE', `/api/collections/${col}/records/${it.id}`, su);
    }
  }
  console.log('\n(nettoyage effectué)');
}
done();
