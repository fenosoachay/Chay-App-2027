#!/usr/bin/env node
// migrer-fichiers.mjs : mode --r2-reel (jour J), testé contre le FAUX S3 local et le bac à sable, avec un export
// SYNTHÉTIQUE (dossier temporaire : une vidéo de 18 Mo -> 2 parts R2, et une image -> FichierAdmin). Les références
// visent des enregistrements inexistants : aucune donnée du bac à sable n'est réécrite. Tout est nettoyé à la fin.
// Les valeurs du fichier d'identifiants ne sont jamais affichées.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { http, loadCreds, login, makeChecker, q } from './lib.mjs';
import { FAUX_S3_ENV, s3Fetch } from './sigv4-node.mjs';

const { check, done } = makeChecker();
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'chay-export-r2-'));
process.env.EXPORT_BASE44 = DIR; // lu au chargement du module
const { main: mainBrut, parseArgs, readEnvFile, verifierR2 } = await import('../scripts/migrer-fichiers.mjs');
// Les suites enchaînées peuvent épuiser la limite de connexions superuser (10 / min) : la connexion (au tout début
// de main, avant tout envoi) est alors retentée après une pause.
const main = async (argv, opts) => {
  for (let essai = 0; ; essai++) {
    try { return await mainBrut(argv, opts); } catch (e) {
      if (!/connexion superuser impossible \(HTTP 429\)/.test(e.message) || essai >= 8) throw e;
      await new Promise((ok) => setTimeout(ok, 10000));
    }
  }
};

const env = readEnvFile(FAUX_S3_ENV);
const BUCKET = env.R2_BUCKET;
const su = { token: (await login('_superusers', loadCreds(['superuser']).superuser)).token };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hex24 = () => crypto.randomBytes(12).toString('hex');
const refuse = (fn, motif) => { try { fn(); return false; } catch (e) { return motif.test(e.message); } };

// ── Export synthétique ──────────────────────────────────────────────────────
const MIO = 1024 * 1024;
const video = Buffer.concat([Buffer.from('0000001866747970', 'hex'), Buffer.from('mp42'), crypto.randomBytes(18 * MIO)]);
const image = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), crypto.randomBytes(4096)]);
fs.mkdirSync(path.join(DIR, 'fichiers'), { recursive: true });
fs.mkdirSync(path.join(DIR, '_outil', 'pb'), { recursive: true }); // rapport du script
const vPath = path.join(DIR, 'fichiers', 'film.mp4');
const iPath = path.join(DIR, 'fichiers', 'couverture.png');
fs.writeFileSync(vPath, video);
fs.writeFileSync(iPath, image);
const vUrl = `https://base44.app/api/apps/test/files/public/test/${hex24()}_film.mp4`;
const iUrl = `https://base44.app/api/apps/test/files/public/test/${hex24()}_couverture.png`;
fs.writeFileSync(path.join(DIR, 'fichiers.csv'), `entite;id;champ;hote;url\nVideo;${hex24()};video_url;base44.app;${vUrl}\nArticle;${hex24()};cover_url;base44.app;${iUrl}\n`);
fs.writeFileSync(path.join(DIR, 'fichiers-telecharges.csv'),
  `url;chemin_local;taille;sha256;statut\n${vUrl};${vPath};${video.length};${sha(video)};telecharge\n${iUrl};${iPath};${image.length};${sha(image)};telecharge\n`);
const KEY = `videos/migration/${sha(video).slice(0, 16)}.mp4`;
const ARGS = ['--appliquer', '--avec-video', '--r2-reel', '--r2-env', FAUX_S3_ENV, '--bucket-attendu', BUCKET];
const objet = async () => (await s3Fetch(env, 'HEAD', `/${BUCKET}/${KEY}`)).status;
const ouverts = async () => (await s3Fetch(env, 'GET', `/${BUCKET}`, { query: [['uploads', ''], ['prefix', 'videos/migration/']] })).text.includes('<Upload>');
const imagesEnBase = async () => (await http('GET', `/api/collections/FichierAdmin/records?perPage=5&filter=${q(`sha256 = "${sha(image)}"`)}`, su)).data?.items || [];
const outil = (nom, query) => s3Fetch(env, 'POST', `/${BUCKET}/_faux/${nom}`, { query }); // pannes simulées du faux S3
const silencieux = async (fn) => { const log = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = log; } };

try {
  console.log('\n■ Garde-fous de --r2-reel (aucun réseau)');
  const hors = path.join(DIR, 'r2-reel.env');
  fs.writeFileSync(hors, 'R2_ENDPOINT=https://compte.r2.cloudflarestorage.com\nR2_BUCKET=chay-videos\nR2_ACCESS_KEY_ID=x\nR2_SECRET_ACCESS_KEY=y\nR2_PUBLIC_BASE_URL=https://media.chay.fr\n');
  check('sans --r2-reel : point d\'accès réel refusé (comportement d\'origine)',
    refuse(() => verifierR2(parseArgs(['--appliquer', '--avec-video', '--r2-env', hors])), /non autorisé sans --r2-reel/));
  check('--r2-reel sans --appliquer : refusé', refuse(() => verifierR2(parseArgs(['--avec-video', '--r2-reel', '--r2-env', hors])), /exige --appliquer et --avec-video/));
  check('--r2-reel sans --avec-video : refusé', refuse(() => verifierR2(parseArgs(['--appliquer', '--r2-reel', '--r2-env', hors])), /exige --appliquer et --avec-video/));
  check('fichier d\'identifiants DANS le dépôt : refusé',
    refuse(() => verifierR2(parseArgs([...ARGS.slice(0, 3), '--r2-env', path.resolve('pocketbase', 'r2.env')])), /HORS du dépôt/));
  check('bucket attendu par défaut : chay-videos', parseArgs(['--r2-reel']).bucketAttendu === 'chay-videos');
  check('bucket du fichier différent du bucket attendu : refusé (ex. bucket des sauvegardes)',
    refuse(() => verifierR2(parseArgs(['--appliquer', '--avec-video', '--r2-reel', '--r2-env', FAUX_S3_ENV, '--bucket-attendu', 'chay-sauvegardes'])), /n'est pas le bucket attendu/));
  const incomplet = path.join(DIR, 'incomplet.env');
  fs.writeFileSync(incomplet, 'R2_ENDPOINT=https://compte.r2.cloudflarestorage.com\nR2_BUCKET=chay-videos\n');
  let msg = '';
  try { verifierR2(parseArgs(['--appliquer', '--avec-video', '--r2-reel', '--r2-env', incomplet])); } catch (e) { msg = e.message; }
  check('variables manquantes : refusé, seuls les NOMS sont cités', /R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE_URL/.test(msg) && !msg.includes('chay-videos'));
  check('configuration correcte : acceptée', verifierR2(parseArgs(ARGS))?.R2_BUCKET === BUCKET);
  let ecrit = false;
  try { verifierR2(parseArgs(['--appliquer', '--avec-video', '--r2-reel', '--r2-env', hors])); } catch (e) { ecrit = e.message.includes('compte.r2') || e.message.includes('https://'); }
  check('aucune valeur du fichier dans les messages d\'erreur', !ecrit);

  console.log('\n■ Confirmation, interruption, reprise, relance (faux S3 + bac à sable)');
  let resume = '';
  const capture = async (fn) => { const log = console.log; const lignes = []; console.log = (...a) => lignes.push(a.join(' ')); try { return await fn(); } finally { console.log = log; resume = lignes.join('\n'); } };
  let annule = false;
  try { await capture(() => main(ARGS, { confirmer: async () => false })); } catch (e) { annule = /Annulé/.test(e.message); }
  check('confirmation refusée : arrêt, rien envoyé (ni R2, ni PocketBase)', annule && (await objet()) === 404 && (await imagesEnBase()).length === 0);
  check('résumé affiché avant la question : nombre de fichiers, taille, bucket',
    /Fichiers à envoyer : 2 \(/.test(resume) && /dont vers R2 : 1 \(18\.0 Mo\)/.test(resume) && resume.includes(`Bucket R2 : ${BUCKET}`));
  check('aucune clé ni secret dans la sortie', !resume.includes(env.R2_ACCESS_KEY_ID) && !resume.includes(env.R2_SECRET_ACCESS_KEY));

  let demande = '';
  const r1 = await silencieux(() => main(ARGS, {
    confirmer: async (attendu) => { demande = attendu; return true; },
    apresPart: async (n) => { if (n === 1) throw new Error('interruption simulée'); },
  }));
  const st1 = Object.fromEntries(r1.items.map((i) => [i.destination, i.statut]));
  check(`texte de confirmation demandé : « ENVOYER ${BUCKET} »`, demande === `ENVOYER ${BUCKET}`);
  check('interruption pendant la vidéo : vidéo en échec, image envoyée', /^échec/.test(st1.R2) && st1.FichierAdmin === 'envoyé', JSON.stringify(st1));
  check('interruption : envoi multipart abandonné, aucune part orpheline, pas d\'objet partiel', !(await ouverts()) && (await objet()) === 404);

  console.log('\n■ (b) Échec de la finalisation (CompleteMultipartUpload)');
  await outil('echec-complete', [['fois', '1']]);
  const rb = await silencieux(() => main(ARGS, { confirmer: async () => true }));
  const stb = Object.fromEntries(rb.items.map((i) => [i.destination, i.statut]));
  check('finalisation refusée : vidéo comptée en échec (jamais « envoyé »)', /^échec : CompleteMultipartUpload/.test(stb.R2), JSON.stringify(stb));
  check('finalisation refusée : envoi abandonné, aucun envoi ouvert, aucun objet', !(await ouverts()) && (await objet()) === 404);
  check('finalisation refusée : vérification sans la vidéo (rien à vérifier pour elle)', rb.verif.total === 1 && rb.verif.ok === 1, JSON.stringify(rb.verif));

  console.log('\n■ (c) Envoi non finalisé laissé par un essai précédent (Ctrl+C, coupure)');
  const orphelin = await s3Fetch(env, 'POST', `/${BUCKET}/${KEY}`, { query: [['uploads', '']] });
  const autreCle = `videos/autre/${hex24()}.mp4`;
  const autre = await s3Fetch(env, 'POST', `/${BUCKET}/${autreCle}`, { query: [['uploads', '']] });
  check('préparation : un envoi ouvert sur la clé de la vidéo, un autre sur une autre clé', orphelin.status === 200 && autre.status === 200 && (await ouverts()));

  const r2 = await silencieux(() => main(ARGS, { confirmer: async () => true }));
  const st2 = Object.fromEntries(r2.items.map((i) => [i.destination, i.statut]));
  check('reprise : la vidéo est envoyée, l\'image déjà présente est réutilisée', st2.R2 === 'envoyé' && st2.FichierAdmin === 'réutilisé', JSON.stringify(st2));
  check('reprise : l\'envoi orphelin de CETTE clé est abandonné', !(await ouverts()));
  const autreId = /<UploadId>([^<]+)/.exec(autre.text)[1];
  const autreListe = (await s3Fetch(env, 'GET', `/${BUCKET}`, { query: [['uploads', ''], ['prefix', autreCle]] })).text;
  check('reprise : l\'envoi ouvert d\'une AUTRE clé n\'est pas touché', autreListe.includes(autreId));
  await s3Fetch(env, 'DELETE', `/${BUCKET}/${autreCle}`, { query: [['uploadId', autreId]] });
  check('reprise : adresses relues identiques à l\'original, vidéo lisible par plages', r2.verif.ok === r2.verif.total && r2.verif.total === 2, JSON.stringify(r2.verif));
  const pub = Buffer.from(await (await fetch(`${env.R2_PUBLIC_BASE_URL}/${KEY}`)).arrayBuffer());
  check('vidéo complète dans R2 (contenu identique)', sha(pub) === sha(video));

  console.log('\n■ (a) Content-Type de l\'objet');
  check('objet R2 en « video/mp4 » (ni octet-stream ni text/plain)', (await s3Fetch(env, 'HEAD', `/${BUCKET}/${KEY}`)).headers.get('content-type') === 'video/mp4');

  console.log('\n■ Vérification : lecture par plages et type, comme le lecteur de l\'app');
  await outil('sans-plages', [['actif', '1']]);
  const rp = await silencieux(() => main(ARGS, { confirmer: async () => true }));
  await outil('sans-plages', [['actif', '0']]);
  check('serveur sans lecture par plages : vidéo NON vérifiée (raison donnée)',
    rp.verif.ok === rp.verif.total - 1 && /lecture par plages refusée \(HTTP 200/.test(rp.verif.echecs[0]?.raison || ''), JSON.stringify(rp.verif));
  const copie = (type) => s3Fetch(env, 'PUT', `/${BUCKET}/${KEY}`, { headers: { 'content-type': type, 'x-amz-copy-source': `/${BUCKET}/${KEY}`, 'x-amz-metadata-directive': 'REPLACE' } });
  const mauvaisType = await copie('application/octet-stream');
  const rt = await silencieux(() => main(ARGS, { confirmer: async () => true }));
  check('objet en octet-stream : vidéo réutilisée mais NON vérifiée, avec le conseil corriger-type-r2.mjs',
    mauvaisType.status === 200 && rt.items.find((i) => i.destination === 'R2')?.statut === 'réutilisé'
      && /Content-Type « application\/octet-stream ».*corriger-type-r2\.mjs/.test(rt.verif.echecs[0]?.raison || ''), JSON.stringify(rt.verif));
  const rapportMd = fs.readFileSync(path.join(DIR, '_outil', 'pb', 'migration-fichiers-rapport.md'), 'utf8');
  check('rapport : la raison de l\'échec de vérification est écrite', /✗ `[0-9a-f]{12}` : Content-Type/.test(rapportMd));
  await copie('video/mp4');

  const r3 = await silencieux(() => main(ARGS, { confirmer: async () => true }));
  check('relance : rien n\'est renvoyé (vidéo et image réutilisées), une seule image en base',
    r3.items.every((i) => i.statut === 'réutilisé') && (await imagesEnBase()).length === 1, JSON.stringify(r3.items.map((i) => i.statut)));
  check('relance : tout est vérifié (2 / 2)', r3.verif.ok === 2 && r3.verif.total === 2, JSON.stringify(r3.verif));
} finally {
  await outil('sans-plages', [['actif', '0']]).catch(() => {});
  await outil('echec-complete', [['fois', '0']]).catch(() => {});
  for (const r of await imagesEnBase()) await http('DELETE', `/api/collections/FichierAdmin/records/${r.id}`, su);
  await s3Fetch(env, 'DELETE', `/${BUCKET}/${KEY}`);
  fs.rmSync(DIR, { recursive: true, force: true });
  console.log('\n(nettoyage effectué)');
}
done();
