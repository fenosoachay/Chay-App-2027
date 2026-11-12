#!/usr/bin/env node
// Lot D (1.3.6) contre le BAC À SABLE : migration de schéma (pocketbase/scripts/migrer-lot-d.mjs, idempotente),
// archivage des réunions passées (route admin archiverReunions = tâche reunions_archivage), visibilité membres /
// admins, collections ChurchHistory et StaffMember. Tout ce qui est créé est supprimé.
import { nouvellesCollections, planAnnonces } from '../scripts/migrer-lot-d.mjs';
import { fn, http, loadCreds, login, makeChecker, q } from './lib.mjs';

const creds = loadCreds(['superuser', 'admin', 'membre']);
const { check, done } = makeChecker();
const su = { token: (await login('_superusers', creds.superuser)).token };
const ADM = await login('users', creds.admin);
const M = await login('users', creds.membre);
const crees = []; // [collection, id]

console.log('\n■ Migration de schéma');
const ann = (await http('GET', '/api/collections/Announcement', su)).data;
const plan = planAnnonces(ann);
if (plan) {
  const r = await http('PATCH', `/api/collections/${ann.id}`, { ...su, body: plan.corps });
  check(`Announcement migrée (${plan.changements.length} changement(s))`, r.status === 200, `HTTP ${r.status} ${JSON.stringify(r.data?.data || '')}`);
}
for (const def of nouvellesCollections()) {
  const r = await http('GET', `/api/collections/${def.name}`, su);
  if (r.status === 404) {
    const c = await http('POST', '/api/collections', { ...su, body: def });
    check(`${def.name} créée`, c.status === 200, `HTTP ${c.status} ${JSON.stringify(c.data?.data || c.data?.message || '')}`);
  }
}
const apres = (await http('GET', '/api/collections/Announcement', su)).data;
check('idempotent : plus rien à migrer', planAnnonces(apres) === null);
check('champs existants de Announcement conservés', ann.fields.every((f) => apres.fields.some((g) => g.id === f.id)));

console.log('\n■ Archivage des réunions');
const jour = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const creer = async (titre, body) => {
  const r = await http('POST', '/api/collections/Announcement/records', { token: ADM.token, body: { title: titre, type: 'event', language: 'fr', created_by_id: ADM.id, ...body } });
  if (r.data?.id) crees.push(['Announcement', r.data.id]);
  return r;
};
const passee = await creer('Test D réunion passée', { date: `${jour(-1)} 00:00:00.000Z`, event_date: `${jour(-1)} 00:00:00.000Z`, event_time: '10:00' });
const future = await creer('Test D réunion future', { date: `${jour(0)} 00:00:00.000Z`, event_date: `${jour(2)} 00:00:00.000Z`, event_time: '18:30' });
const ancienne = await creer('Test D réunion sans heure', { date: `${jour(-2)} 00:00:00.000Z`, event_date: `${jour(-2)} 00:00:00.000Z` });
check('réunions créées (heure HH:MM acceptée)', passee.status === 200 && future.status === 200 && ancienne.status === 200 && future.data.event_time === '18:30');
const mauvaise = await creer('Test D heure invalide', { date: `${jour(0)} 00:00:00.000Z`, event_time: '25:99' });
check('heure invalide refusée par le schéma', mauvaise.status === 400);
const refus = await fn('archiverReunions', { token: M.token, body: {} });
check('membre : archivage manuel refusé', refus.status === 403);
const r = await fn('archiverReunions', { token: ADM.token, body: {} });
check('admin : archivage lancé', r.status === 200 && r.data.archivees >= 2, JSON.stringify(r.data));
const lit = async (tok, id) => (await http('GET', `/api/collections/Announcement/records/${id}`, { token: tok })).status;
check('passée (heure dépassée) : masquée au membre, visible à l’admin', (await lit(M.token, passee.data.id)) === 404 && (await lit(ADM.token, passee.data.id)) === 200);
check('sans heure, jour passé : archivée aussi', (await http('GET', `/api/collections/Announcement/records/${ancienne.data.id}`, su)).data?.archived === true);
check('future : toujours visible au membre, non archivée', (await lit(M.token, future.data.id)) === 200 && (await http('GET', `/api/collections/Announcement/records/${future.data.id}`, su)).data?.archived === false);
const listeM = (await http('GET', `/api/collections/Announcement/records?perPage=200&filter=${q('title ~ "Test D"')}`, { token: M.token })).data?.items || [];
check('liste membre : aucune réunion archivée', listeM.length === 1 && listeM[0].id === future.data.id);
const listeA = (await http('GET', `/api/collections/Announcement/records?perPage=200&filter=${q('title ~ "Test D" && archived = true')}`, { token: ADM.token })).data?.items || [];
check('liste admin « Archivées » : les 2 réunions passées', listeA.length === 2);

console.log('\n■ Histoire de l’église et Personnel');
const h = await http('POST', '/api/collections/ChurchHistory/records', { token: ADM.token, body: { title: 'Test D histoire', body: '<p>Fondée…</p>', photos: ['https://exemple.invalid/1.jpg'], created_by_id: ADM.id } });
if (h.data?.id) crees.push(['ChurchHistory', h.data.id]);
const s = await http('POST', '/api/collections/StaffMember/records', { token: ADM.token, body: { name: 'Test D pasteur', role: 'Pasteur', photo_url: 'https://exemple.invalid/p.jpg', order: 0, created_by_id: ADM.id } });
if (s.data?.id) crees.push(['StaffMember', s.data.id]);
check('admin : histoire et membre du personnel créés', h.status === 200 && s.status === 200 && Array.isArray(h.data.photos));
check('membre : lit l’histoire et le personnel',
  (await http('GET', `/api/collections/ChurchHistory/records/${h.data?.id}`, { token: M.token })).status === 200
  && (await http('GET', `/api/collections/StaffMember/records/${s.data?.id}`, { token: M.token })).status === 200);
const refusM = await http('POST', '/api/collections/StaffMember/records', { token: M.token, body: { name: 'x', created_by_id: M.id } });
check('membre : création refusée', refusM.status >= 400);

for (const [c, id] of crees.reverse()) await http('DELETE', `/api/collections/${c}/records/${id}`, su);
done();
