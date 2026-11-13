#!/usr/bin/env node
// 1.3.9 — Cause du « sélecteur de sous-playlist vide », reproduite sur une COPIE JETABLE du bac à sable
// (par défaut http://127.0.0.1:8095), jamais sur le bac à sable lui-même : schéma Playlist SANS le champ parent_id
// (migration migrer-playlists.mjs non appliquée).
//   - avant 1.3.9 : la sous-playlist était enregistrée comme une playlist de premier niveau, sans aucune erreur ;
//   - 1.3.9 : le hook playlists.pb.js refuse la requête avec un message explicite ; le diagnostic le signale ;
//   - après migrer-playlists : sous-playlists enregistrées, diagnostic sans problème.
process.env.PB_TEST_URL ||= 'http://127.0.0.1:8095';
if (new URL(process.env.PB_TEST_URL).port === '8090') {
  console.error('Refusé : ce test modifie le schéma ; il vise une copie jetable, pas le bac à sable (8090).');
  process.exit(2);
}
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const { champsMigres } = await import('../scripts/migrer-playlists.mjs');
const { analyser } = await import('../scripts/diagnostiquer-playlists.mjs');
const { BASE, http, loadCreds, login, makeChecker } = await import('./lib.mjs');

const creds = loadCreds(['superuser', 'admin']);
const { check, done } = makeChecker();
const su = { token: (await login('_superusers', creds.superuser)).token };
const ADM = await login('users', creds.admin);
const crees = [];
const COUV = 'https://exemple.invalid/c.jpg';
const creer = async (body) => {
  const r = await http('POST', '/api/collections/Playlist/records', { token: ADM.token, body: { cover_url: COUV, created_by_id: ADM.id, ...body } });
  if (r.data?.id) crees.push(r.data.id);
  return r;
};
const lireCol = async () => (await http('GET', '/api/collections/Playlist', su)).data;
const diagnostic = () => {
  try {
    return execFileSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'diagnostiquer-playlists.mjs')],
      { env: { ...process.env, PB_URL: BASE, PB_EMAIL: creds.superuser.email, PB_PASSWORD: creds.superuser.password }, encoding: 'utf8' });
  } catch (e) {
    return `${e.stdout || ''}${e.stderr || ''}`;
  }
};

console.log(`\n■ Schéma de prod reproduit : Playlist sans parent_id (copie : ${BASE})`);
let col = await lireCol();
if (col.fields.some((f) => f.name === 'parent_id')) {
  await http('PATCH', `/api/collections/${col.id}`, { ...su, body: { fields: col.fields.filter((f) => f.name !== 'parent_id') } });
  col = await lireCol();
}
check('champ parent_id retiré de la copie', !col.fields.some((f) => f.name === 'parent_id'));
const d1 = diagnostic();
check('diagnostic (lecture seule) : « Champ Playlist.parent_id ABSENT » signalé', /Champ parent_id : ABSENT/.test(d1) && /cause du sélecteur vide/.test(d1), d1);
check('diagnostic : aucun identifiant affiché', !d1.includes(creds.superuser.email) && !d1.includes(creds.superuser.password));
const racine = await creer({ name: 'Test schéma racine', category: 'articles', parent_id: '' });
check('playlist de premier niveau : toujours acceptée', racine.status === 200, `HTTP ${racine.status}`);
const sous = await creer({ name: 'Test schéma sous', category: 'articles', parent_id: racine.data?.id });
check('sous-playlist : REFUSÉE avec un message explicite (au lieu d’être enregistrée en silence comme playlist de 1er niveau)',
  sous.status === 400 && /parent_id/.test(sous.data?.message || '') && /migrer-playlists/.test(sous.data?.message || ''), JSON.stringify(sous.data));
const nb = ((await http('GET', `/api/collections/Playlist/records?perPage=50&filter=${encodeURIComponent('name ~ "Test schéma"')}`, su)).data?.items || []).length;
check('aucune fausse « sous-playlist » de premier niveau créée', nb === 1);

console.log('\n■ Après la migration migrer-playlists (copie)');
const plan = champsMigres(col.fields);
const m = await http('PATCH', `/api/collections/${col.id}`, { ...su, body: { fields: plan.fields } });
check('migration appliquée : parent_id ajouté', m.status === 200 && plan.changements.some((c) => /parent_id/.test(c)));
const sous2 = await creer({ name: 'Test schéma sous', category: 'articles', parent_id: racine.data?.id });
const relue = (await http('GET', `/api/collections/Playlist/records/${sous2.data?.id}`, su)).data;
check('sous-playlist enregistrée avec son rattachement', sous2.status === 200 && relue?.parent_id === racine.data?.id);
const tous = (await http('GET', '/api/collections/Playlist/records?perPage=500', su)).data.items;
const a = analyser(await lireCol(), tous, []);
check('diagnostic : parent_id présent, sous-playlist comptée en articles', a.avecParent && a.parSection.articles.sous >= 1, JSON.stringify(a.parSection.articles));

for (const id of crees.reverse()) await http('DELETE', `/api/collections/Playlist/records/${id}`, su);
done();
