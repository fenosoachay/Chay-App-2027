#!/usr/bin/env node
// 1.3.8 — Psaumes -> Ecclésiaste, contre une COPIE JETABLE du bac à sable (par défaut http://127.0.0.1:8095) et le
// faux S3 local. Reproduit l'état de la prod en 1.3.7 (collection BibleAudio, fiches et objets R2 Psaumes), puis
// déroule l'ordre de déploiement prévu :
//   1. migration 1.3.8 refusée tant qu'il reste des Psaumes ;
//   2. nettoyage (route superuser nettoyerBibleAudio + script nettoyer-psaumes.mjs) : simulation, garde-fous,
//      sauvegarde locale, suppression des fiches et des objets R2 Psaumes, Proverbes intacts ;
//   3. migration 1.3.8 appliquée, idempotente ; règles et rangement R2 de l'Ecclésiaste ; envoi en masse.
// Jamais contre le bac à sable lui-même (8090). Tout ce qui est créé est supprimé.
process.env.PB_TEST_URL ||= 'http://127.0.0.1:8095';
if (new URL(process.env.PB_TEST_URL).port === '8090') {
  console.error('Refusé : ce test applique des migrations ; il vise une copie jetable, pas le bac à sable (8090).');
  process.exit(2);
}
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const { migrer: migrer137 } = await import('../scripts/migrer-1-3-7.mjs');
const { migrer: migrer138 } = await import('../scripts/migrer-1-3-8.mjs');
const { BASE, fn, http, loadCreds, login, makeChecker } = await import('./lib.mjs');
const { loadFauxS3Env, s3Fetch } = await import('./sigv4-node.mjs');

const creds = loadCreds(['superuser', 'admin', 'membre']);
const s3env = loadFauxS3Env();
const { check, done } = makeChecker();
const su = { token: (await login('_superusers', creds.superuser)).token };
const ADM = await login('users', creds.admin);
const M = await login('users', creds.membre);
const h = { Authorization: su.token, 'Content-Type': 'application/json' };
const SCRIPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts');
const PUB = s3env.R2_PUBLIC_BASE_URL;
const objets = [];
const mp3 = (n) => Buffer.concat([Buffer.from('4944330300000000000f', 'hex'), Buffer.alloc(10), Buffer.from([0xff, 0xfb, 0x90, 0x00]), crypto.randomBytes(n)]);
const mettreR2 = async (key, buf) => { objets.push(key); return (await s3Fetch(s3env, 'PUT', `/${s3env.R2_BUCKET}/${key}`, { body: buf, headers: { 'content-type': 'audio/mpeg' } })).status; };
const existeR2 = async (key) => (await fetch(`${PUB}/${key}`)).status === 200;
const fiches = async (filtre) => (await http('GET', `/api/collections/BibleAudio/records?perPage=500&sort=chapter&filter=${encodeURIComponent(filtre)}`, su)).data?.items || [];

console.log(`\n■ État de la prod en 1.3.7 (copie jetable : ${BASE})`);
await migrer137(BASE, h, { appliquer: true });
// Test relançable : schéma remis en 1.3.7 (si la copie a déjà été migrée), fiches vidées, préfixe Psaumes du faux
// S3 vidé (le faux S3 est partagé entre les essais).
const col137 = (await http('GET', '/api/collections/BibleAudio', su)).data;
await http('PATCH', `/api/collections/${col137.id}`, { ...su, body: { fields: col137.fields.map((f) => (f.name === 'book' ? { ...f, values: ['proverbes', 'psaumes'] } : f.name === 'chapter' ? { ...f, max: 150 } : f)) } });
for (const r of await fiches("book != ''")) await http('DELETE', `/api/collections/BibleAudio/records/${r.id}`, su);
const liste = (await s3Fetch(s3env, 'GET', `/${s3env.R2_BUCKET}`, { query: [['list-type', '2'], ['prefix', 'videos/bible/psaumes/']] })).text;
for (const m of liste.matchAll(/<Key>([^<]+)<\/Key>/g)) await s3Fetch(s3env, 'DELETE', `/${s3env.R2_BUCKET}/${m[1]}`);
const ps = [];
for (const c of [1, 12, 23, 51, 150]) {
  const key = `videos/bible/psaumes/Psaumes-${String(c).padStart(3, '0')}-test${c}.mp3`;
  await mettreR2(key, mp3(1000));
  ps.push(key);
  await http('POST', '/api/collections/BibleAudio/records', { token: su.token, body: { book: 'psaumes', chapter: c, audio_url: `${PUB}/${key}`, size: 1000 } });
}
await mettreR2('videos/bible/psaumes/Psaumes-012-ancien.mp3', mp3(500)); // ancien fichier remplacé (sans fiche)
await http('POST', '/api/collections/BibleAudio/records', { token: su.token, body: { book: 'psaumes', chapter: 90, audio_url: 'https://ailleurs.invalid/p90.mp3' } });
const keyProv = 'videos/bible/proverbes/Proverbes-03-garde.mp3';
await mettreR2(keyProv, mp3(800));
const prov = await http('POST', '/api/collections/BibleAudio/records', { token: su.token, body: { book: 'proverbes', chapter: 3, audio_url: `${PUB}/${keyProv}`, size: 800 } });
const autre = 'videos/2026/11/abcdefghij123456-film.mp4';
await mettreR2(autre, Buffer.from('autre'));
check('6 fiches Psaumes, 6 objets R2 Psaumes, 1 Proverbe et 1 vidéo préparés', (await fiches("book = 'psaumes'")).length === 6 && prov.status === 200);

console.log('\n■ 1. Migration 1.3.8 avant nettoyage');
const refusMig = await migrer138(BASE, h, { appliquer: true }).then(() => null, (e) => e.message);
check('refusée : « 6 fiche(s) Psaumes encore présente(s) »', /6 fiche\(s\) Psaumes/.test(refusMig || ''), refusMig);
check('schéma inchangé (psaumes toujours accepté)', JSON.stringify((await http('GET', '/api/collections/BibleAudio', su)).data.fields.find((f) => f.name === 'book').values) === '["proverbes","psaumes"]');

console.log('\n■ 2. Nettoyage : route superuser');
const route = (tok, body) => fn('nettoyerBibleAudio', { token: tok, body });
check('membre et admin de l’app -> 403', (await route(M.token, { livre: 'psaumes' })).status === 403 && (await route(ADM.token, { livre: 'psaumes' })).status === 403);
check('livre encore proposé (proverbes) -> 400', (await route(su.token, { livre: 'proverbes' })).status === 400);
const sim = await route(su.token, { livre: 'psaumes' });
check('simulation : 6 fiches, 6 objets, 1 objet sans fiche, 1 fiche hors rangement, rien supprimé',
  sim.status === 200 && sim.data.simulation === true && sim.data.fiches === 6 && sim.data.objets === 6 && sim.data.objetsSansFiche === 1 && sim.data.fichesHorsRangement === 1
  && (await fiches("book = 'psaumes'")).length === 6 && await existeR2(ps[0]), JSON.stringify(sim.data));
check('application avec des nombres faux -> 409, rien supprimé',
  (await route(su.token, { livre: 'psaumes', appliquer: true, attendu: { fiches: 146, objets: 6 } })).status === 409 && (await fiches("book = 'psaumes'")).length === 6);

console.log('\n■ 2. Nettoyage : script nettoyer-psaumes.mjs');
const sauvegarde = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chay-psaumes-')), 'sauvegarde.json');
const lancer = (...args) => {
  try {
    return { code: 0, sortie: execFileSync(process.execPath, [path.join(SCRIPTS, 'nettoyer-psaumes.mjs'), ...args], { env: { ...process.env, PB_URL: BASE, PB_EMAIL: creds.superuser.email, PB_PASSWORD: creds.superuser.password }, encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status, sortie: `${e.stdout || ''}${e.stderr || ''}` };
  }
};
const s1 = lancer();
check('simulation : nombres affichés, commande à valider proposée, rien supprimé', s1.code === 0 && /Fiches BibleAudio à supprimer : 6/.test(s1.sortie) && /--appliquer --confirmer 6/.test(s1.sortie) && (await fiches("book = 'psaumes'")).length === 6, s1.sortie);
check('aucun identifiant affiché', !s1.sortie.includes(creds.superuser.email) && !s1.sortie.includes(creds.superuser.password));
const s2 = lancer('--appliquer');
check('--appliquer sans --confirmer -> refusé', s2.code === 1 && /confirmer/.test(s2.sortie));
const s3 = lancer('--appliquer', '--confirmer', '146', '--sauvegarde', sauvegarde);
check('--confirmer 146 alors qu’il y en a 6 -> refusé, rien supprimé, pas de sauvegarde', s3.code === 1 && /6 fiche\(s\) trouvée\(s\), 146 confirmée/.test(s3.sortie) && (await fiches("book = 'psaumes'")).length === 6 && !fs.existsSync(sauvegarde));
const s4 = lancer('--appliquer', '--confirmer', '6', '--sauvegarde', sauvegarde);
check('--confirmer 6 : 6 fiches et 6 objets supprimés, sans erreur', s4.code === 0 && /Supprimé : 6 fiche\(s\), 6 objet\(s\) R2 ; erreurs : 0/.test(s4.sortie), s4.sortie);
const sauv = JSON.parse(fs.readFileSync(sauvegarde, 'utf8'));
check('sauvegarde locale écrite AVANT : les 6 fiches (chapitre, adresse)', sauv.fiches.length === 6 && sauv.fiches.every((f) => f.book === 'psaumes' && f.audio_url));
let restants = 0;
for (const k of [...ps, 'videos/bible/psaumes/Psaumes-012-ancien.mp3']) restants += await existeR2(k) ? 1 : 0;
check('R2 : plus aucun objet sous videos/bible/psaumes/', restants === 0 && (await fiches("book = 'psaumes'")).length === 0);
check('Proverbes (fiche + objet) et autres vidéos intacts', (await fiches("book = 'proverbes'")).length === 1 && await existeR2(keyProv) && await existeR2(autre));
check('relance : rien à faire', /Fiches BibleAudio à supprimer : 0/.test(lancer().sortie));

console.log('\n■ 3. Migration 1.3.8 puis Ecclésiaste');
const mig = await migrer138(BASE, h, { appliquer: true });
check('appliquée (2 changements), puis idempotente', mig.length === 2 && (await migrer138(BASE, h, { appliquer: true })).length === 0, mig.join(' | '));
const col = (await http('GET', '/api/collections/BibleAudio', su)).data;
check('book = proverbes | ecclesiaste ; chapter max 31 ; fiche Proverbes conservée',
  JSON.stringify(col.fields.find((f) => f.name === 'book').values) === '["proverbes","ecclesiaste"]' && col.fields.find((f) => f.name === 'chapter').max === 31
  && (await http('GET', `/api/collections/BibleAudio/records/${prov.data.id}`, { token: M.token })).status === 200);
const creer = (tok, body) => http('POST', '/api/collections/BibleAudio/records', { token: tok, body: { audio_url: 'https://r2.invalid/e.mp3', ...body } });
const e12 = await creer(ADM.token, { book: 'ecclesiaste', chapter: 12 });
check('admin : Ecclésiaste 12 accepté ; 13 refusé ; Proverbes 32 refusé',
  e12.status === 200 && (await creer(ADM.token, { book: 'ecclesiaste', chapter: 13 })).status === 400 && (await creer(ADM.token, { book: 'proverbes', chapter: 32 })).status === 400);
check('Psaumes refusés désormais, même pour le superuser (schéma)', (await creer(ADM.token, { book: 'psaumes', chapter: 1 })).status === 400 && (await creer(su.token, { book: 'psaumes', chapter: 1 })).status === 400);
if (e12.data?.id) await http('DELETE', `/api/collections/BibleAudio/records/${e12.data.id}`, su);
const init = (rangement) => fn('initMultipartUpload', { token: ADM.token, body: { session_id: `t${crypto.randomBytes(8).toString('hex')}`, fileName: 'a.mp3', fileSize: 1000, fileType: 'audio/mpeg', rangement } });
const ri = await init({ livre: 'ecclesiaste', chapitre: 3 });
check('rangement R2 : videos/bible/ecclesiaste/Ecclesiaste-03-<aléatoire>.mp3 ; psaumes et Ecclésiaste 13 refusés',
  /^videos\/bible\/ecclesiaste\/Ecclesiaste-03-[a-z0-9]{8}\.mp3$/.test(ri.data?.key || '') && (await init({ livre: 'psaumes', chapitre: 1 })).status === 400 && (await init({ livre: 'ecclesiaste', chapitre: 13 })).status === 400, ri.data?.key);

console.log('\n■ Envoi en masse : Ecclesiaste-01.mp3 …');
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'chay-eccl-'));
fs.writeFileSync(path.join(dossier, 'ecclesiaste-01.mp3'), mp3(9 * 1024 * 1024));
fs.writeFileSync(path.join(dossier, 'Ecclesiaste-12.mp3'), mp3(100 * 1024));
fs.writeFileSync(path.join(dossier, 'Psaumes-001.mp3'), mp3(100));
const envoi = (...args) => {
  try {
    return execFileSync(process.execPath, [path.join(SCRIPTS, 'envoyer-bible-audio.mjs'), dossier, ...args], { env: { ...process.env, PB_URL: BASE, PB_EMAIL: creds.admin.email, PB_PASSWORD: creds.admin.password }, encoding: 'utf8' });
  } catch (e) {
    return `${e.stdout || ''}${e.stderr || ''}`;
  }
};
check('simulation : 2 à ajouter, Psaumes-001.mp3 ignoré', /À ajouter : 2 /.test(envoi()) );
const e1 = envoi('--appliquer');
const eccl = await fiches("book = 'ecclesiaste'");
for (const r of eccl) objets.push(decodeURIComponent(r.audio_url.slice(PUB.length + 1)));
check('envoi : Ecclésiaste 1 et 12 en ligne, rangés et lisibles', /Envoyés : 2 · échecs : 0/.test(e1) && eccl.length === 2
  && eccl.every((r) => /\/videos\/bible\/ecclesiaste\/Ecclesiaste-(01|12)-[a-z0-9]{8}\.mp3$/.test(r.audio_url)) && await existeR2(decodeURIComponent(eccl[0].audio_url.slice(PUB.length + 1))), e1);

for (const r of await fiches("book != ''")) await http('DELETE', `/api/collections/BibleAudio/records/${r.id}`, su);
for (const key of objets) await s3Fetch(s3env, 'DELETE', `/${s3env.R2_BUCKET}/${key}`);
fs.rmSync(dossier, { recursive: true, force: true });
fs.rmSync(path.dirname(sauvegarde), { recursive: true, force: true });
await fn('cleanupIncompleteUploads', { token: ADM.token, body: {} });
done();
