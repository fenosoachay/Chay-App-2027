#!/usr/bin/env node
// 1.3.7 / 1.3.8 — Bible › « Sagesse en audio » (Proverbes, Ecclésiaste), contre une COPIE JETABLE du bac à sable (par défaut http://127.0.0.1:8095)
// et le faux S3 local : la migration est appliquée à la copie seulement (jamais au bac à sable 8090).
// Vérifie : migration idempotente, règles (lecture membres, écriture admins), chapitre maximal par livre, unicité
// livre + chapitre, rangement R2 bible/<livre>/, et le script d'envoi en masse (simulation, envoi, relance, remplacement).
// Tout ce qui est créé (fiches, objets R2, fichiers temporaires) est supprimé.
process.env.PB_TEST_URL ||= 'http://127.0.0.1:8095';
if (new URL(process.env.PB_TEST_URL).port === '8090') {
  console.error('Refusé : ce test applique la migration 1.3.7 ; il vise une copie jetable, pas le bac à sable (8090).');
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
// Schéma courant = 1.3.7 puis 1.3.8 (Proverbes et Ecclésiaste ; la 1.3.8 exige qu'il ne reste aucun Psaume).
const migrer = async (url, hh, o) => [...(await migrer137(url, hh, o)), ...(o?.appliquer ? await (async () => { for (const r of (await http('GET', "/api/collections/BibleAudio/records?perPage=500", su)).data?.items || []) await http('DELETE', `/api/collections/BibleAudio/records/${r.id}`, su); return migrer138(url, hh, o); })() : [])];
const { BASE, fn, http, loadCreds, login, makeChecker, q } = await import('./lib.mjs');
const { loadFauxS3Env, s3Fetch } = await import('./sigv4-node.mjs');

const creds = loadCreds(['superuser', 'admin', 'membre']);
const s3env = loadFauxS3Env();
const { check, done } = makeChecker();
const su = { token: (await login('_superusers', creds.superuser)).token };
const ADM = await login('users', creds.admin);
const M = await login('users', creds.membre);
const MIO = 1024 * 1024;
const fiches = [];
const objets = [];
const mp3 = (n) => Buffer.concat([Buffer.from('4944330300000000000f', 'hex'), Buffer.alloc(10), Buffer.from([0xff, 0xfb, 0x90, 0x00]), crypto.randomBytes(n)]);

console.log(`\n■ Migration (copie jetable : ${BASE})`);
const h = { Authorization: su.token, 'Content-Type': 'application/json' };
const sim = await migrer(BASE, h, {});
check('simulation : rien écrit', sim.length === 0 || (await http('GET', '/api/collections/BibleAudio', su)).status === 404);
const app = await migrer(BASE, h, { appliquer: true });
check(`appliquée (${app.length} changement(s)), puis idempotente`, (await migrer(BASE, h, { appliquer: true })).length === 0);

// Nettoyage d'un essai précédent (copie réutilisée).
for (const r of (await http('GET', '/api/collections/BibleAudio/records?perPage=500', su)).data?.items || []) await http('DELETE', `/api/collections/BibleAudio/records/${r.id}`, su);

console.log('\n■ Règles et limites');
const creer = async (tok, body) => {
  const r = await http('POST', '/api/collections/BibleAudio/records', { token: tok, body });
  if (r.data?.id) fiches.push(r.data.id);
  return r;
};
const ok = await creer(ADM.token, { book: 'proverbes', chapter: 31, audio_url: 'https://r2.invalid/p31.mp3', duration: 180 });
check('admin : chapitre créé', ok.status === 200);
check('membre : lecture permise, écriture refusée',
  (await http('GET', `/api/collections/BibleAudio/records/${ok.data?.id}`, { token: M.token })).status === 200
  && (await creer(M.token, { book: 'ecclesiaste', chapter: 1, audio_url: 'https://r2.invalid/x.mp3' })).status >= 400
  && (await http('PATCH', `/api/collections/BibleAudio/records/${ok.data?.id}`, { token: M.token, body: { audio_url: 'https://pirate.invalid/x.mp3' } })).status >= 400);
check('anonyme : lecture refusée', (await http('GET', '/api/collections/BibleAudio/records')).data?.items?.length === 0);
check('Proverbes 32 refusé (31 chapitres) ; Ecclésiaste 12 accepté ; Ecclésiaste 13 refusé',
  (await creer(ADM.token, { book: 'proverbes', chapter: 32, audio_url: 'https://r2.invalid/a.mp3' })).status === 400
  && (await creer(ADM.token, { book: 'ecclesiaste', chapter: 12, audio_url: 'https://r2.invalid/b.mp3' })).status === 200
  && (await creer(ADM.token, { book: 'ecclesiaste', chapter: 13, audio_url: 'https://r2.invalid/c.mp3' })).status === 400);
check('même livre + chapitre deux fois -> refusé', (await creer(ADM.token, { book: 'proverbes', chapter: 31, audio_url: 'https://r2.invalid/d.mp3' })).status === 400);
check('adresse non http(s) refusée', (await creer(ADM.token, { book: 'ecclesiaste', chapter: 2, audio_url: 'javascript:alert(1)' })).status === 400);
check('modification par l’admin limitée au chapitre du livre',
  (await http('PATCH', `/api/collections/BibleAudio/records/${ok.data?.id}`, { token: ADM.token, body: { chapter: 40 } })).status === 400);
for (const id of fiches.splice(0)) await http('DELETE', `/api/collections/BibleAudio/records/${id}`, su);

console.log('\n■ Rangement R2 (route initMultipartUpload)');
const init = (body) => fn('initMultipartUpload', { token: ADM.token, body: { session_id: `t${crypto.randomBytes(8).toString('hex')}`, fileName: 'Ecclesiaste-03.mp3', fileSize: 1000, fileType: 'audio/mpeg', ...body } });
const i1 = await init({ rangement: { livre: 'ecclesiaste', chapitre: 3 } });
check('clé rangée par livre et chapitre : videos/bible/ecclesiaste/Ecclesiaste-03-<aléatoire>.mp3', i1.status === 200 && /^videos\/bible\/ecclesiaste\/Ecclesiaste-03-[a-z0-9]{8}\.mp3$/.test(i1.data?.key || ''), i1.data?.key);
if (i1.data?.key) await fn('cleanupIncompleteUploads', { token: ADM.token, body: {} });
check('livre inconnu, chapitre hors limites -> 400',
  (await init({ rangement: { livre: 'genese', chapitre: 1 } })).status === 400 && (await init({ rangement: { livre: 'proverbes', chapitre: 32 } })).status === 400);
check('vidéo rangée dans la Bible audio -> 415', (await init({ fileName: 'a.mp4', fileType: 'video/mp4', rangement: { livre: 'ecclesiaste', chapitre: 1 } })).status === 415);
check('membre -> 403', (await fn('initMultipartUpload', { token: M.token, body: { session_id: 'tmembre1', fileName: 'Ecclesiaste-01.mp3', fileSize: 10, fileType: 'audio/mpeg', rangement: { livre: 'ecclesiaste', chapitre: 1 } } })).status === 403);

console.log('\n■ Script d’envoi en masse (envoyer-bible-audio.mjs)');
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'chay-bible-audio-'));
const ecrire = (nom, buf) => fs.writeFileSync(path.join(dossier, nom), buf);
ecrire('Proverbes-01.mp3', mp3(9 * MIO)); // 2 parts de 8 Mo
ecrire('Ecclesiaste-03.mp3', mp3(300 * 1024));
ecrire('Ecclesiaste-12.mp3', mp3(100 * 1024));
ecrire('lisez-moi.txt', Buffer.from('x'));
ecrire('Proverbes-40.mp3', mp3(1024));
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'envoyer-bible-audio.mjs');
const lancer = (...args) => {
  try {
    return { code: 0, sortie: execFileSync(process.execPath, [script, dossier, ...args], { env: { ...process.env, PB_URL: BASE, PB_EMAIL: creds.admin.email, PB_PASSWORD: creds.admin.password }, encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status, sortie: `${e.stdout || ''}${e.stderr || ''}` };
  }
};
const liste = async () => (await http('GET', '/api/collections/BibleAudio/records?perPage=500&sort=book,chapter', { token: M.token })).data?.items || [];
const s1 = lancer();
check('simulation : 3 à ajouter, 2 ignorés, rien envoyé', s1.code === 0 && /À ajouter : 3 /.test(s1.sortie) && /ignorés : 2/.test(s1.sortie) && (await liste()).length === 0, s1.sortie);
check('aucun mot de passe ni adresse e-mail affiché', !s1.sortie.includes(creds.admin.password) && !s1.sortie.includes(creds.admin.email));
const s2 = lancer('--appliquer');
const apres = await liste();
for (const r of apres) { fiches.push(r.id); objets.push(decodeURIComponent(r.audio_url.slice(s3env.R2_PUBLIC_BASE_URL.length + 1))); }
check('envoi : 3 chapitres en ligne', s2.code === 0 && apres.length === 3 && /Envoyés : 3 · échecs : 0/.test(s2.sortie), s2.sortie);
const p12 = apres.find((r) => r.book === 'ecclesiaste' && r.chapter === 3);
check('Ecclésiaste 3 : adresse R2 rangée, taille et durée enregistrées', /\/videos\/bible\/ecclesiaste\/Ecclesiaste-03-[a-z0-9]{8}\.mp3$/.test(p12?.audio_url || '') && p12?.size === fs.statSync(path.join(dossier, 'Ecclesiaste-03.mp3')).size && p12?.duration > 0, JSON.stringify(p12));
const lu = await fetch(p12.audio_url);
check('fichier lisible à l’adresse publique, contenu identique', lu.ok && Buffer.from(await lu.arrayBuffer()).equals(fs.readFileSync(path.join(dossier, 'Ecclesiaste-03.mp3'))));
const s3 = lancer('--appliquer');
check('relance : rien à renvoyer (déjà en ligne)', s3.code === 0 && /À ajouter : 0 · à remplacer : 0 · déjà en ligne : 3/.test(s3.sortie), s3.sortie);
ecrire('Ecclesiaste-03.mp3', mp3(200 * 1024));
const s4 = lancer('--appliquer');
check('fichier modifié, sans --remplacer : signalé, pas remplacé', /différents non remplacés : 1/.test(s4.sortie) && (await liste()).find((r) => r.id === p12.id)?.audio_url === p12.audio_url);
const s5 = lancer('--appliquer', '--remplacer');
const p12b = (await liste()).find((r) => r.id === p12.id);
if (p12b) objets.push(decodeURIComponent(p12b.audio_url.slice(s3env.R2_PUBLIC_BASE_URL.length + 1)));
check('--remplacer : même fiche, nouvelle adresse, nouvelle taille', s5.code === 0 && p12b?.audio_url !== p12.audio_url && p12b?.size === fs.statSync(path.join(dossier, 'Ecclesiaste-03.mp3')).size, s5.sortie);

for (const id of fiches) await http('DELETE', `/api/collections/BibleAudio/records/${id}`, su);
for (const key of objets) await s3Fetch(s3env, 'DELETE', `/${s3env.R2_BUCKET}/${key}`);
fs.rmSync(dossier, { recursive: true, force: true });
void q;
done();
