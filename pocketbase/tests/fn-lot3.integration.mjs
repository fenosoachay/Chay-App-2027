#!/usr/bin/env node
// Tests d'intégration du bloc 2, lot 3 contre le BAC À SABLE LOCAL :
// règles corrigées (PrayerRequest, Message, Conversation), routes createConversation,
// updateConversationParticipants, listThemeRequests, createDonationRequest.
// Pour chaque règle : le cas qui passait avant est refusé, l'usage légitime marche encore.
// Tout ce que le test crée est supprimé ; aucune donnée personnelle n'est affichée.

import { fn, http, keysOf, loadCreds, login, makeChecker, q, sameKeys } from './lib.mjs';

const creds = loadCreds(['superuser', 'admin', 'membre', 'membre2']);
const { check, done } = makeChecker();
const su = (await login('_superusers', creds.superuser)).token;
const A = await login('users', creds.membre);
const B = await login('users', creds.membre2);
const ADM = await login('users', creds.admin);
const asSu = { token: su };
const TEST = [A.id, B.id, ADM.id];
const refused = (r) => r.status === 403 || r.status === 404 || r.status === 400;
const get = async (col, id) => (await http('GET', `/api/collections/${col}/records/${id}`, asSu)).data;
const patch = (token, col, id, body) => http('PATCH', `/api/collections/${col}/records/${id}`, { token, body });
const themeIds = [];

try {
  // ═══════════════════ 1. PrayerRequest ═══════════════════════════════════
  console.log('\n■ Règle PrayerRequest (lecture directe et modification)');
  {
    const rawCreate = await http('POST', '/api/collections/PrayerRequest/records', {
      token: A.token, body: { requester_id: B.id, category: 'Autre', content: 'direct', status: 'open', created_by_id: A.id },
    });
    check('AVANT autorisé, MAINTENANT refusé : création directe d’une prière par l’API (contournait la limite de 3 / jour)',
      rawCreate.status >= 400, `HTTP ${rawCreate.status}`);
    const p = await fn('createPrayerRequest', { token: A.token, body: { category: 'Santé', content: 'lot3' } });
    check('légitime : createPrayerRequest fonctionne', p.status === 200 && typeof p.data?.id === 'string');
    const pid = p.data.id;
    const bList = await http('GET', `/api/collections/PrayerRequest/records?filter=${q(`id = "${pid}"`)}`, { token: B.token });
    check('AVANT autorisé, MAINTENANT refusé : B liste la prière ouverte de A', bList.status === 200 && bList.data.totalItems === 0);
    const bView = await http('GET', `/api/collections/PrayerRequest/records/${pid}`, { token: B.token });
    check('AVANT autorisé, MAINTENANT refusé : B lit la prière ouverte de A par son id', bView.status === 404);
    const aView = await http('GET', `/api/collections/PrayerRequest/records/${pid}`, { token: A.token });
    check('légitime : le demandeur A lit sa propre prière', aView.status === 200 && aView.data.requester_id === A.id);
    const wall = await fn('getPrayerWall', { token: B.token, body: {} });
    check('légitime : la prière ouverte reste sur le mur (getPrayerWall)', wall.data.items.some((i) => i.id === pid));
    const aEdit = await patch(A.token, 'PrayerRequest', pid, { content: 'modifié', status: 'answered' });
    check('MAINTENANT refusé : le demandeur modifie directement sa prière', aEdit.status === 403, `HTTP ${aEdit.status}`);
    const take = await fn('takePrayer', { token: B.token, body: { prayer_id: pid } });
    check('légitime : prise en charge par la route takePrayer', take.status === 200);
    const bView2 = await http('GET', `/api/collections/PrayerRequest/records/${pid}`, { token: B.token });
    check('légitime : l’intercesseur B lit la prière qu’il a prise', bView2.status === 200);
    const bRewrite = await patch(B.token, 'PrayerRequest', pid, { status: 'open', requester_id: B.id });
    check('AVANT autorisé, MAINTENANT refusé : l’intercesseur réécrit statut et demandeur', bRewrite.status === 403, `HTTP ${bRewrite.status}`);
    const after = await get('PrayerRequest', pid);
    check('la prière n’a pas été modifiée', after.status === 'taken' && after.requester_id === A.id && after.content === 'lot3');
    const answer = await fn('answerPrayer', { token: A.token, body: { prayer_id: pid } });
    check('légitime : exaucement par la route answerPrayer', answer.status === 200 && answer.data.status === 'answered');
  }

  // ═══════════════════ 2. Message ═════════════════════════════════════════
  console.log('\n■ Règle Message (seul l’expéditeur modifie le contenu)');
  {
    const conv = await fn('createConversation', { token: A.token, body: { type: 'direct', participant_ids: [A.id, ADM.id] } });
    const cid = conv.data.id;
    const m = await fn('createMessage', { token: ADM.token, body: { conversation_id: cid, text: 'message admin' } });
    const mid = m.data.id;
    const aText = await patch(A.token, 'Message', mid, { text: 'modifié par A' });
    check('AVANT autorisé, MAINTENANT refusé : A modifie le texte d’un message de l’admin', refused(aText), `HTTP ${aText.status}`);
    for (const [label, body] of [
      ['sender_name', { sender_name: 'X' }], ['image_url', { image_url: 'https://x' }], ['reply_to_id', { reply_to_id: 'f'.repeat(24) }],
      ['participant_ids', { participant_ids: [A.id] }], ['sender_id', { sender_id: A.id }], ['conversation_id', { conversation_id: 'f'.repeat(24) }],
    ]) {
      const r = await patch(A.token, 'Message', mid, { ...body, read_by: [ADM.id, A.id] });
      check(`refusé : un non-expéditeur modifie ${label} (même avec read_by)`, refused(r), `HTTP ${r.status}`);
    }
    const aRead = await patch(A.token, 'Message', mid, { read_by: [ADM.id, A.id] });
    check('légitime : un participant met à jour read_by', aRead.status === 200);
    const own = await patch(ADM.token, 'Message', mid, { text: 'corrigé par son auteur' });
    check('légitime : l’expéditeur modifie son propre texte', own.status === 200);
    const mA = await fn('createMessage', { token: A.token, body: { conversation_id: cid, text: 'message de A' } });
    const aSender = await patch(A.token, 'Message', mA.data.id, { sender_id: ADM.id, participant_ids: [A.id] });
    check('refusé : un expéditeur membre change l’expéditeur ou les participants de son message', refused(aSender), `HTTP ${aSender.status}`);
    const aOwnText = await patch(A.token, 'Message', mA.data.id, { text: 'A corrige' });
    check('légitime : un expéditeur membre corrige son texte', aOwnText.status === 200);
    const msg = await get('Message', mid);
    check('le message de l’admin n’a pas été modifié par A', msg.text === 'corrigé par son auteur');
  }

  // ═══════════════════ 3. Conversation ════════════════════════════════════
  console.log('\n■ Règle Conversation et route createConversation');
  let direct = null;
  let group = null;
  {
    const raw = await http('POST', '/api/collections/Conversation/records', { token: B.token, body: { type: 'direct', participant_ids: [A.id, ADM.id], created_by_id: B.id } });
    check('AVANT autorisé, MAINTENANT refusé : B crée directement une conversation sans y être', raw.status >= 400, `HTTP ${raw.status}`);
    const rawSelf = await http('POST', '/api/collections/Conversation/records', { token: B.token, body: { type: 'direct', participant_ids: [B.id, A.id], created_by_id: B.id } });
    check('refusé : création directe même en étant participant (passe par la route)', rawSelf.status >= 400, `HTTP ${rawSelf.status}`);

    const anon = await fn('createConversation', { body: { type: 'direct', participant_ids: [A.id, B.id] } });
    check('createConversation anonyme -> 401', anon.status === 401);
    for (const [label, body, status] of [
      ['type invalide', { type: 'salon', participant_ids: [B.id, A.id] }, 400],
      ['participant_ids absent', { type: 'direct' }, 400],
      ['conversation directe à 3', { type: 'direct', participant_ids: [B.id, A.id, ADM.id] }, 400],
      ['participant inexistant', { type: 'direct', participant_ids: [B.id, 'f'.repeat(24)] }, 400],
      ['participant non texte', { type: 'direct', participant_ids: [B.id, 12] }, 400],
      ['groupe sans nom', { type: 'group', participant_ids: [B.id, A.id] }, 400],
      ['appelant absent des participants', { type: 'direct', participant_ids: [A.id, ADM.id] }, 403],
    ]) {
      const r = await fn('createConversation', { token: B.token, body });
      check(`createConversation ${label} -> ${status}`, r.status === status, `HTTP ${r.status} ${r.data?.error || ''}`);
    }
    const d1 = await fn('createConversation', { token: B.token, body: { type: 'direct', participant_ids: [B.id, A.id], admin_id: A.id, last_message_text: 'x', created_by_id: A.id } });
    direct = d1.data;
    check('légitime : B crée une conversation directe avec A -> 200 (enregistrement)', d1.status === 200 && direct?.type === 'direct'
      && JSON.stringify(direct.participant_ids) === JSON.stringify([B.id, A.id]));
    check('champs imposés par le serveur (created_by_id = B, pas d’admin_id ni de texte du client)',
      direct.created_by_id === B.id && !direct.admin_id && !direct.last_message_text);
    const d2 = await fn('createConversation', { token: A.token, body: { type: 'direct', participant_ids: [A.id, B.id] } });
    check('pas de doublon : la conversation directe existante est renvoyée (ordre inversé)', d2.status === 200 && d2.data.id === direct.id);
    const g = await fn('createConversation', { token: B.token, body: { type: 'group', name: '  Groupe test  ', participant_ids: [B.id, A.id, B.id], admin_id: A.id } });
    group = g.data;
    check('légitime : B crée un groupe -> admin_id = B (valeur du client ignorée), doublons retirés, nom nettoyé',
      g.status === 200 && group.admin_id === B.id && JSON.stringify(group.participant_ids) === JSON.stringify([B.id, A.id]) && group.name === 'Groupe test');
  }
  console.log('\n■ Règle Conversation (modification directe) et route updateConversationParticipants');
  {
    const addSelf = await patch(B.token, 'Conversation', direct.id, { participant_ids: [B.id, A.id, ADM.id] });
    check('AVANT autorisé, MAINTENANT refusé : un participant modifie directement participant_ids', refused(addSelf), `HTTP ${addSelf.status}`);
    const typeChange = await patch(A.token, 'Conversation', group.id, { type: 'direct' });
    check('refusé : un participant change le type', refused(typeChange), `HTTP ${typeChange.status}`);
    const adminSteal = await patch(A.token, 'Conversation', group.id, { admin_id: A.id });
    check('refusé : un participant se nomme admin du groupe', refused(adminSteal), `HTTP ${adminSteal.status}`);
    const rename = await patch(B.token, 'Conversation', group.id, { name: 'Nouveau nom' });
    check('légitime : renommer le groupe', rename.status === 200);
    const pin = await patch(A.token, 'Conversation', direct.id, { pinned_by: [A.id], last_message_text: 'salut' });
    check('légitime : épingler / dernier message', pin.status === 200);

    const notAdmin = await fn('updateConversationParticipants', { token: A.token, body: { conversation_id: group.id, participant_ids: [B.id, A.id, ADM.id] } });
    check('A (membre, pas admin du groupe) ajoute quelqu’un -> 403', notAdmin.status === 403);
    const add = await fn('updateConversationParticipants', { token: B.token, body: { conversation_id: group.id, participant_ids: [B.id, A.id, ADM.id] } });
    check('légitime : l’admin du groupe ajoute un membre -> 200', add.status === 200 && add.data.participant_ids.includes(ADM.id));
    const removeAdmin = await fn('updateConversationParticipants', { token: B.token, body: { conversation_id: group.id, participant_ids: [A.id, ADM.id] } });
    check('l’admin du groupe se retire lui-même -> 400', removeAdmin.status === 400);
    const ghost = await fn('updateConversationParticipants', { token: B.token, body: { conversation_id: group.id, participant_ids: [B.id, A.id, 'f'.repeat(24)] } });
    check('ajout d’un utilisateur inexistant -> 400', ghost.status === 400);
    const onDirect = await fn('updateConversationParticipants', { token: B.token, body: { conversation_id: direct.id, participant_ids: [B.id, A.id, ADM.id] } });
    check('conversation directe -> 400 (participants non modifiables)', onDirect.status === 400);
    const remove = await fn('updateConversationParticipants', { token: B.token, body: { conversation_id: group.id, participant_ids: [B.id, ADM.id] } });
    check('légitime : l’admin du groupe retire un membre -> 200', remove.status === 200 && !remove.data.participant_ids.includes(A.id));
    const outsider = await fn('updateConversationParticipants', { token: A.token, body: { conversation_id: group.id, participant_ids: [B.id, ADM.id, A.id] } });
    check('A, retiré du groupe, tente de s’y remettre -> 404', outsider.status === 404);
    const view = await http('GET', `/api/collections/Conversation/records/${group.id}`, { token: A.token });
    check('A ne voit plus le groupe', view.status === 404);
  }

  // ═══════════════════ 4. listThemeRequests ═══════════════════════════════
  console.log('\n■ listThemeRequests');
  {
    for (const status of ['pending', 'validated']) {
      const r = await http('POST', '/api/collections/ThemeRequest/records', { ...asSu, body: { user_id: A.id, theme: `thème ${status}`, status } });
      themeIds.push(r.data.id);
    }
    const anon = await fn('listThemeRequests', { body: {} });
    check('anonyme -> 401 { error: "Connexion requise." }', anon.status === 401 && anon.data?.error === 'Connexion requise.');
    const member = await fn('listThemeRequests', { token: A.token, body: {} });
    check('membre -> 403 { error: "Réservé aux admins désignés." }', member.status === 403 && member.data?.error === 'Réservé aux admins désignés.');
    const all = await fn('listThemeRequests', { token: ADM.token, body: {} });
    check('admin désigné -> 200 { items }', all.status === 200 && sameKeys(all.data, ['items']) && themeIds.every((id) => all.data.items.some((i) => i.id === id)));
    const item = all.data.items.find((i) => i.id === themeIds[0]);
    check('items : champs publics seulement (pas de user_id)', item && !('user_id' in item)
      && Object.keys(item).every((k) => ['id', 'theme', 'passage', 'status', 'admin_note', 'created_date', 'handled_date'].includes(k)), keysOf(item));
    const pending = await fn('listThemeRequests', { token: ADM.token, body: { status: 'pending', limit: 50 } });
    check('filtre status = pending', pending.data.items.every((i) => i.status === 'pending') && pending.data.items.some((i) => i.id === themeIds[0]));
    for (const [label, body, msg] of [['statut invalide', { status: 'x' }, 'Statut invalide.'], ['limite 0', { limit: 0 }, 'Limite invalide.'], ['limite texte', { limit: '5' }, 'Limite invalide.']]) {
      const r = await fn('listThemeRequests', { token: ADM.token, body });
      check(`${label} -> 400`, r.status === 400 && r.data?.error === msg);
    }
  }

  // ═══════════════════ 5. createDonationRequest ═══════════════════════════
  console.log('\n■ createDonationRequest');
  {
    const anon = await fn('createDonationRequest', { body: {} });
    check('anonyme -> 401 { error: "Unauthorized" }', anon.status === 401 && anon.data?.error === 'Unauthorized');
    const first = await fn('createDonationRequest', { token: A.token, body: { userId: B.id, status: 'validated' } });
    check('membre -> 200 { id, already_pending: false }', first.status === 200 && sameKeys(first.data, ['id', 'already_pending']) && first.data.already_pending === false);
    const rec = await get('DonationRequest', first.data.id);
    check('userId et statut imposés par le serveur', rec.userId === A.id && rec.status === 'pending' && rec.is_read === false && Boolean(rec.username));
    const again = await fn('createDonationRequest', { token: A.token, body: {} });
    check('deuxième demande -> { already_pending: true }', again.status === 200 && sameKeys(again.data, ['already_pending']) && again.data.already_pending === true);
    const [c1, c2] = await Promise.all([fn('createDonationRequest', { token: B.token, body: {} }), fn('createDonationRequest', { token: B.token, body: {} })]);
    const n = (await http('GET', `/api/collections/DonationRequest/records?filter=${q(`userId = "${B.id}" && status = "pending"`)}`, asSu)).data.totalItems;
    check('deux demandes simultanées -> une seule enregistrée', n === 1 && [c1.data.already_pending, c2.data.already_pending].sort().join() === 'false,true', `${n} enregistrée(s)`);
    const direct = await http('POST', '/api/collections/DonationRequest/records', { token: A.token, body: { userId: A.id, username: 'x', status: 'pending' } });
    check('création directe par l’API -> refusée (admin seulement)', direct.status >= 400);
  }
} finally {
  const del = async (col, filter) => {
    for (;;) {
      const r = await http('GET', `/api/collections/${col}/records?perPage=200&fields=id&filter=${q(filter)}`, asSu);
      const items = r.data?.items || [];
      for (const it of items) await http('DELETE', `/api/collections/${col}/records/${it.id}`, asSu);
      if (items.length < 200) break;
    }
  };
  const any = (field) => TEST.map((id) => `${field} = "${id}"`).join(' || ');
  const convs = (await http('GET', `/api/collections/Conversation/records?perPage=200&fields=id&filter=${q(any('created_by_id'))}`, asSu)).data?.items || [];
  for (const c of convs) {
    await del('Message', `conversation_id = "${c.id}"`);
    await http('DELETE', `/api/collections/Conversation/records/${c.id}`, asSu);
  }
  await del('PrayerRequest', any('requester_id'));
  await del('UserNotification', `(${any('user_id')}) && content_type = "prayer"`);
  await del('DonationRequest', any('userId'));
  for (const id of themeIds) await http('DELETE', `/api/collections/ThemeRequest/records/${id}`, asSu);
  console.log('\n(nettoyage effectué : données de test supprimées)');
}
done();
