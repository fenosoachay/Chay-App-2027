#!/usr/bin/env node
// 1.3.9 — Bug des sous-playlists reproduit sur une COPIE JETABLE du bac à sable (par défaut http://127.0.0.1:8095),
// jamais sur le bac à sable lui-même :
//   A. CAS DE LA PROD : champ Playlist.parent_id présent mais CACHÉ (option « Hidden »). PocketBase ignore alors
//      ce champ sans erreur pour un admin de l'app : parent_id vide EN BASE. Avec la 1.3.9 : création refusée avec
//      un message explicite ; diagnostic ; migrer-1-3-9.mjs retire l'option ; reparer-sous-playlists.mjs rattache
//      les playlists créées à tort ; nouvelles sous-playlists enregistrées ; sélecteur rempli.
//   B. Champ parent_id absent : même refus explicite ; la migration l'ajoute.
process.env.PB_TEST_URL ||= 'http://127.0.0.1:8095';
if (new URL(process.env.PB_TEST_URL).port === '8090') {
  console.error('Refusé : ce test modifie le schéma ; il vise une copie jetable, pas le bac à sable (8090).');
  process.exit(2);
}
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const { migrer } = await import('../scripts/migrer-1-3-9.mjs');
const { BASE, http, loadCreds, login, makeChecker } = await import('./lib.mjs');
const { arbrePlaylists, optionsSousPlaylists } = await import('../../src/lib/playlistsArbre.js');

const creds = loadCreds(['superuser', 'admin']);
const { check, done } = makeChecker();
const su = { token: (await login('_superusers', creds.superuser)).token };
const ADM = await login('users', creds.admin);
const h = { Authorization: su.token, 'Content-Type': 'application/json' };
const SCRIPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts');
const crees = [];
const COUV = 'https://exemple.invalid/c.jpg';
const creer = async (body) => {
  const r = await http('POST', '/api/collections/Playlist/records', { token: ADM.token, body: { cover_url: COUV, created_by_id: ADM.id, ...body } });
  if (r.data?.id) crees.push(r.data.id);
  return r;
};
const enBase = async (id) => (await http('GET', `/api/collections/Playlist/records/${id}`, su)).data;
const lireCol = async () => (await http('GET', '/api/collections/Playlist', su)).data;
const regler = async (parentId) => {
  const col = await lireCol();
  let fields = col.fields.filter((f) => f.name !== 'parent_id');
  if (parentId) fields = [...fields, { name: 'parent_id', type: 'text', required: false, presentable: false, system: false, min: 0, max: 64, pattern: '', ...(col.fields.find((f) => f.name === 'parent_id') || {}), ...parentId }];
  return (await http('PATCH', `/api/collections/${col.id}`, { ...su, body: { fields } })).status;
};
const script = (nom, ...args) => {
  try {
    return execFileSync(process.execPath, [path.join(SCRIPTS, nom), ...args], { env: { ...process.env, PB_URL: BASE, PB_EMAIL: creds.superuser.email, PB_PASSWORD: creds.superuser.password }, encoding: 'utf8' });
  } catch (e) {
    return `${e.stdout || ''}${e.stderr || ''}`;
  }
};

console.log(`\n■ A. Cas de la prod : parent_id présent mais CACHÉ (copie : ${BASE})`);
check('parent_id passé en « Hidden »', (await regler({ hidden: true })) === 200 && (await lireCol()).fields.find((f) => f.name === 'parent_id')?.hidden === true);
const d1 = script('diagnostiquer-playlists.mjs');
check('diagnostic : « CACHÉ (option « Hidden ») » signalé', /parent_id : présent, CACHÉ/.test(d1) && /cause du sélecteur vide/.test(d1), d1);
// État laissé par la 1.3.8 : la « sous-playlist » a été enregistrée comme playlist de premier niveau (créées ici par
// le superuser, l'admin de l'app étant désormais refusé tant que le champ est caché).
const creerSu = async (body) => {
  const r = await http('POST', '/api/collections/Playlist/records', { ...su, body: { cover_url: COUV, ...body } });
  if (r.data?.id) crees.push(r.data.id);
  return r;
};
const racine = await creerSu({ name: 'Test répar parente', category: 'youtube', parent_id: '' });
const aTort = await creerSu({ name: 'Test répar créée à tort', category: 'youtube', parent_id: '' });
check('données de la 1.3.8 reproduites (2 playlists de premier niveau)', racine.status === 200 && aTort.status === 200 && (await enBase(aTort.data.id)).parent_id === '');
const refus = await creer({ name: 'Test répar sous', category: 'youtube', parent_id: racine.data.id });
check('1.3.9 : création d’une sous-playlist REFUSÉE avec un message explicite (au lieu de parent_id vide en silence)',
  refus.status === 400 && /parent_id/.test(refus.data?.message || '') && /Hidden/.test(refus.data?.message || ''), JSON.stringify(refus.data));
const nbRepar = ((await http('GET', `/api/collections/Playlist/records?perPage=50&filter=${encodeURIComponent('name = "Test répar sous"')}`, su)).data?.items || []).length;
check('aucune fausse playlist de premier niveau créée', nbRepar === 0);

console.log('\n■ Migration migrer-1-3-9.mjs');
const m = await migrer(BASE, h, { appliquer: true });
check('option « Hidden » retirée de parent_id (puis idempotente)', m.some((c) => /parent_id : option « Hidden » retirée/.test(c)) && (await lireCol()).fields.find((f) => f.name === 'parent_id')?.hidden === false
  && (await migrer(BASE, h, { appliquer: true })).length === 0, m.join(' | '));

console.log('\n■ Réparation : reparer-sous-playlists.mjs');
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'chay-repar-'));
const modele = path.join(dossier, 'rattachements.json');
const s1 = script('reparer-sous-playlists.mjs', '--modele', modele);
const lignes = JSON.parse(fs.readFileSync(modele, 'utf8'));
check('modèle écrit (lecture seule) : la playlist créée à tort y figure', /Modèle écrit/.test(s1) && lignes.some((l) => l.sous === 'Test répar créée à tort' && l.section === 'youtube'));
check('aucun identifiant affiché', !s1.includes(creds.superuser.email) && !s1.includes(creds.superuser.password));
fs.writeFileSync(modele, JSON.stringify([{ section: 'youtube', sous: 'Test répar créée à tort', parente: 'Test répar parente' }]));
const s2 = script('reparer-sous-playlists.mjs', '--fichier', modele);
check('simulation : 1 à rattacher, rien écrit', /À rattacher : 1 · déjà rattachées : 0 · refusées : 0/.test(s2) && (await enBase(aTort.data.id)).parent_id === '', s2);
const s3 = script('reparer-sous-playlists.mjs', '--fichier', modele, '--appliquer');
check('appliqué : parent_id rempli EN BASE', /Rattachées : 1 \/ 1/.test(s3) && (await enBase(aTort.data.id)).parent_id === racine.data.id, s3);
check('relance : déjà rattachée, rien à faire', /À rattacher : 0 · déjà rattachées : 1/.test(script('reparer-sous-playlists.mjs', '--fichier', modele, '--appliquer')));

console.log('\n■ Après correction : création, sélecteur');
const sous = await creer({ name: 'Test répar sous', category: 'youtube', parent_id: racine.data.id });
check('création d’une sous-playlist par l’admin : parent_id rempli EN BASE', sous.status === 200 && (await enBase(sous.data.id)).parent_id === racine.data.id, JSON.stringify(sous.data));
const liste = (await http('GET', '/api/collections/Playlist/records?perPage=500', { token: ADM.token })).data.items;
const options = optionsSousPlaylists(arbrePlaylists(liste, 'youtube')).map((o) => o.label);
check('sélecteur de classement : la sous-playlist réparée et la nouvelle sont proposées',
  options.includes('Test répar parente › Test répar créée à tort') && options.includes('Test répar parente › Test répar sous'), JSON.stringify(options));

console.log('\n■ B. Champ parent_id absent');
check('champ retiré', (await regler(null)) === 200);
const r2 = await creer({ name: 'Test absent', category: 'youtube', parent_id: racine.data.id });
check('création d’une sous-playlist refusée avec un message explicite', r2.status === 400 && /parent_id/.test(r2.data?.message || ''));
const m2 = await migrer(BASE, h, { appliquer: true });
check('migration : parent_id ajouté', m2.some((c) => /parent_id : nouveau champ/.test(c)));

for (const id of crees.reverse()) await http('DELETE', `/api/collections/Playlist/records/${id}`, su);
fs.rmSync(dossier, { recursive: true, force: true });
done();
