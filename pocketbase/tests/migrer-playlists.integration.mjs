#!/usr/bin/env node
// Migration de schéma 1.3.6 (Playlist.parent_id, catégories youtube / articles / gallery) contre le BAC À SABLE.
// Applique la migration (idempotente) puis vérifie : sous-playlist créée par un admin, lue par un membre,
// refusée à un membre. Tout ce qui est créé est supprimé. Aucune donnée personnelle affichée.
import { champsMigres } from '../scripts/migrer-playlists.mjs';
import { http, loadCreds, login, makeChecker } from './lib.mjs';

const creds = loadCreds(['superuser', 'admin', 'membre']);
const { check, done } = makeChecker();
const su = { token: (await login('_superusers', creds.superuser)).token };
const ADM = await login('users', creds.admin);
const M = await login('users', creds.membre);
const crees = [];
const COVER = 'https://exemple.invalid/couverture.jpg';

console.log('\n■ Schéma Playlist');
const col = (await http('GET', '/api/collections/Playlist', su)).data;
const plan = champsMigres(col.fields);
if (plan) {
  const r = await http('PATCH', `/api/collections/${col.id}`, { ...su, body: { fields: plan.fields } });
  check(`migration appliquée (${plan.changements.length} changement(s))`, r.status === 200, `HTTP ${r.status}`);
} else {
  check('schéma déjà migré', true);
}
const apres = (await http('GET', '/api/collections/Playlist', su)).data;
check('idempotent : plus rien à migrer', champsMigres(apres.fields) === null);
check('champs existants conservés (même id)', col.fields.every((f) => apres.fields.some((g) => g.id === f.id && g.name === f.name)));

console.log('\n■ Sous-playlists');
const p = await http('POST', '/api/collections/Playlist/records', { token: ADM.token, body: { cover_url: COVER, name: 'Test section YouTube', category: 'youtube', parent_id: '', created_by_id: ADM.id } });
if (p.data?.id) crees.push(p.data.id);
const s = await http('POST', '/api/collections/Playlist/records', { token: ADM.token, body: { cover_url: COVER, name: 'Test sous-playlist', category: 'youtube', parent_id: p.data?.id, created_by_id: ADM.id } });
if (s.data?.id) crees.push(s.data.id);
check('admin : playlist youtube + sous-playlist créées', p.status === 200 && s.status === 200 && s.data.parent_id === p.data.id, `${p.status}/${s.status}`);
for (const cat of ['articles', 'gallery']) {
  const r = await http('POST', '/api/collections/Playlist/records', { token: ADM.token, body: { cover_url: COVER, name: `Test ${cat}`, category: cat, created_by_id: ADM.id } });
  if (r.data?.id) crees.push(r.data.id);
  check(`catégorie ${cat} acceptée`, r.status === 200 && r.data.parent_id === '');
}
const lu = await http('GET', `/api/collections/Playlist/records/${s.data?.id}`, { token: M.token });
check('membre : lit la sous-playlist', lu.status === 200 && lu.data.parent_id === p.data?.id);
const refus = await http('POST', '/api/collections/Playlist/records', { token: M.token, body: { cover_url: COVER, name: 'x', category: 'youtube', parent_id: p.data?.id, created_by_id: M.id } });
check('membre : création refusée', refus.status >= 400, `HTTP ${refus.status}`);

for (const id of crees.reverse()) await http('DELETE', `/api/collections/Playlist/records/${id}`, su);
done();
