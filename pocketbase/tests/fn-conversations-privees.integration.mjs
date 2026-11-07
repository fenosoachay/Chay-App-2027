#!/usr/bin/env node
// Bloc 7 : conversations privées. Seuls les participants lisent, modifient et suppriment
// Conversation et Message ; un admin non participant est refusé ; le superuser garde l'accès.
// Contre le BAC À SABLE LOCAL ; tout ce qui est créé est supprimé ; aucune donnée personnelle affichée.
import { fn, http, loadCreds, login, makeChecker, q } from './lib.mjs';

const creds = loadCreds(['superuser', 'admin', 'membre', 'membre2']);
const { check, done } = makeChecker();
const su = { token: (await login('_superusers', creds.superuser)).token };
const A = await login('users', creds.membre);
const B = await login('users', creds.membre2);
const ADM = await login('users', creds.admin);
const convs = [];

const as = (u) => ({ token: u?.token });
const list = (u, col, filter) => http('GET', `/api/collections/${col}/records?perPage=50&filter=${q(filter)}`, u ? as(u) : {});
const view = (u, col, id) => http('GET', `/api/collections/${col}/records/${id}`, u ? as(u) : {});
const patch = (u, col, id, body) => http('PATCH', `/api/collections/${col}/records/${id}`, { ...(u ? as(u) : {}), body });
const del = (u, col, id) => http('DELETE', `/api/collections/${col}/records/${id}`, u ? as(u) : {});

try {
  // Préparation : conversation directe A–B (l'admin n'y participe pas) et groupe admin + A.
  const direct = await fn('createConversation', { token: A.token, body: { type: 'direct', participant_ids: [A.id, B.id] } });
  const directId = direct.data?.id;
  if (!directId) throw new Error(`préparation : conversation directe HTTP ${direct.status}`);
  convs.push(directId);
  const m1 = await fn('createMessage', { token: A.token, body: { conversation_id: directId, text: 'message privé de test' } });
  const group = await fn('createConversation', { token: ADM.token, body: { type: 'group', name: 'Groupe test bloc 7', participant_ids: [ADM.id, A.id] } });
  const groupId = group.data?.id;
  if (!groupId) throw new Error(`préparation : groupe HTTP ${group.status}`);
  convs.push(groupId);
  const m2 = await fn('createMessage', { token: A.token, body: { conversation_id: groupId, text: 'message de groupe' } });
  const m3 = await fn('createMessage', { token: A.token, body: { conversation_id: groupId, text: 'à modérer' } });

  console.log('\n■ Admin NON participant (conversation directe A–B)');
  check('liste des conversations : la conversation privée n\'apparaît pas', (await list(ADM, 'Conversation', `id = "${directId}"`)).data?.items?.length === 0);
  check('lecture directe de la conversation -> 404', (await view(ADM, 'Conversation', directId)).status === 404);
  check('liste des messages : aucun message de la conversation', (await list(ADM, 'Message', `conversation_id = "${directId}"`)).data?.items?.length === 0);
  check('lecture directe d\'un message -> 404', (await view(ADM, 'Message', m1.data.id)).status === 404);
  check('modification de la conversation -> 404', (await patch(ADM, 'Conversation', directId, { name: 'x' })).status === 404);
  check('modification d\'un message -> 404', (await patch(ADM, 'Message', m1.data.id, { text: 'x' })).status === 404);
  check('suppression d\'un message -> 404', (await del(ADM, 'Message', m1.data.id)).status === 404);
  check('suppression de la conversation -> 404', (await del(ADM, 'Conversation', directId)).status === 404);
  check('écrire dans la conversation (createMessage) -> 403', (await fn('createMessage', { token: ADM.token, body: { conversation_id: directId, text: 'intrusion' } })).status === 403);
  check('création directe d\'un message (sans la route) -> refusée', (await http('POST', '/api/collections/Message/records', { ...as(ADM), body: { conversation_id: directId, participant_ids: [A.id, B.id, ADM.id], sender_id: ADM.id, text: 'x' } })).status >= 400);
  check('toujours intacts (superuser)', (await view({ token: su.token }, 'Message', m1.data.id)).status === 200 && (await view({ token: su.token }, 'Conversation', directId)).status === 200);

  console.log('\n■ Admin participant (groupe admin + A)');
  check('voit le groupe et ses messages', (await list(ADM, 'Conversation', `id = "${groupId}"`)).data?.items?.length === 1
    && (await list(ADM, 'Message', `conversation_id = "${groupId}"`)).data?.items?.length === 2);
  const readBy = async (id) => (await view({ token: su.token }, 'Message', id)).data.read_by || [];
  const r2 = await readBy(m2.data.id);
  check('marque un message comme lu (son propre id ajouté à read_by)', (await patch(ADM, 'Message', m2.data.id, { read_by: [...r2, ADM.id] })).status === 200
    && (await readBy(m2.data.id)).includes(ADM.id));
  check('ne peut pas retirer l\'id d\'un autre de read_by (hook d\'intégrité, plus d\'exception admin) -> 403',
    (await patch(ADM, 'Message', m2.data.id, { read_by: [ADM.id] })).status === 403 && (await readBy(m2.data.id)).includes(A.id));
  check('ne peut pas réécrire le texte d\'un autre -> refusé', (await patch(ADM, 'Message', m2.data.id, { text: 'réécrit' })).status === 404);
  check('épingle la conversation pour lui-même', (await patch(ADM, 'Conversation', groupId, { pinned_by: [ADM.id] })).status === 200);
  check('modération : supprime un message d\'un membre dans SON groupe -> 204', (await del(ADM, 'Message', m3.data.id)).status === 204);

  console.log('\n■ Membres et anonyme');
  check('A (participant) voit sa conversation directe et son message', (await list(A, 'Conversation', `id = "${directId}"`)).data?.items?.length === 1
    && (await view(A, 'Message', m1.data.id)).status === 200);
  check('B (participant) voit le message de A', (await view(B, 'Message', m1.data.id)).status === 200);
  await patch(B, 'Message', m1.data.id, { 'read_by-': A.id });
  check('modificateur « read_by- » sur un champ json : sans effet (A reste dans read_by)', (await readBy(m1.data.id)).includes(A.id));
  check('B ne peut pas retirer A de read_by -> 403', (await patch(B, 'Message', m1.data.id, { read_by: [B.id] })).status === 403);
  check('B se marque lu', (await patch(B, 'Message', m1.data.id, { read_by: [...(await readBy(m1.data.id)), B.id] })).status === 200);
  check('B (non participant du groupe) ne voit pas le groupe -> 404', (await view(B, 'Conversation', groupId)).status === 404);
  check('anonyme : listes vides', (await list(null, 'Conversation', `id = "${directId}"`)).data?.items?.length === 0
    && (await list(null, 'Message', `conversation_id = "${directId}"`)).data?.items?.length === 0);
  check('anonyme : lecture, modification, suppression -> 404', (await view(null, 'Message', m1.data.id)).status === 404
    && (await patch(null, 'Conversation', directId, { name: 'x' })).status === 404 && (await del(null, 'Message', m1.data.id)).status === 404);
  check('superuser : accès complet (liste)', (await list({ token: su.token }, 'Message', `conversation_id = "${directId}" || conversation_id = "${groupId}"`)).data?.items?.length === 2);
} finally {
  for (const id of convs) {
    const msgs = (await http('GET', `/api/collections/Message/records?perPage=200&fields=id&filter=${q(`conversation_id = "${id}"`)}`, { token: su.token })).data?.items || [];
    for (const m of msgs) await http('DELETE', `/api/collections/Message/records/${m.id}`, { token: su.token });
    const notifs = (await http('GET', `/api/collections/UserNotification/records?perPage=200&fields=id&filter=${q(`content_id = "${id}"`)}`, { token: su.token })).data?.items || [];
    for (const n of notifs) await http('DELETE', `/api/collections/UserNotification/records/${n.id}`, { token: su.token });
    await http('DELETE', `/api/collections/Conversation/records/${id}`, { token: su.token });
  }
  console.log('\n(nettoyage effectué)');
}
done();
