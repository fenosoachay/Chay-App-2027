#!/usr/bin/env node
// corriger-type-r2.mjs contre le FAUX S3 local uniquement (127.0.0.1:9000) : garde-fous, simulation, confirmation,
// échec de copie, correction sur place (CopyObject REPLACE), objet témoin intact, relance sans copie, ligne de
// commande avec confirmation tapée. Aucune valeur du fichier d'identifiants n'est affichée.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeChecker } from './lib.mjs';
import { FAUX_S3_ENV, loadFauxS3Env, s3Fetch } from './sigv4-node.mjs';
import { cleValide, main, parseArgs, verifier } from '../scripts/corriger-type-r2.mjs';

const { check, done } = makeChecker();
const env = loadFauxS3Env();
const BUCKET = env.R2_BUCKET;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'chay-corriger-type-'));
const rnd = crypto.randomBytes(6).toString('hex');
const CLE = `videos/test-type/${rnd}.mp4`;
const TEMOIN = `videos/test-type/${rnd}-temoin.mp4`;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const contenu = Buffer.concat([Buffer.from('0000001866747970', 'hex'), Buffer.from('mp42'), crypto.randomBytes(3 * 1024 * 1024)]);
const sortie = [];
const run = (argv, opts = {}) => main(argv, { log: (...a) => sortie.push(a.join(' ')), ...opts });
const refus = (fn, motif) => { try { fn(); return false; } catch (e) { return motif.test(e.message); } };
const echoue = async (p, motif) => { try { await p; return false; } catch (e) { return motif.test(e.message); } };
const tete = async (cle) => { const r = await s3Fetch(env, 'HEAD', `/${BUCKET}/${cle}`); return { status: r.status, type: r.headers.get('content-type'), taille: Number(r.headers.get('content-length')), etag: r.headers.get('etag') }; };
const ARGS = ['--r2-env', FAUX_S3_ENV, '--cle', CLE];

const outil = (nom, query) => s3Fetch(env, 'POST', `/${BUCKET}/_faux/${nom}`, { query }); // pannes et comportements simulés
const copieSurPlace = (cle, entetes) => s3Fetch(env, 'PUT', `/${BUCKET}/${cle}`, { headers: { ...entetes, 'x-amz-copy-source': `/${BUCKET}/${cle}`, 'x-amz-metadata-directive': 'REPLACE' } });
const CLE_TXT = `videos/test-type/${rnd}-texte.mp4`;
const CLE_GZ = `videos/test-type/${rnd}-gzip.mp4`;

/**
 * Objet créé SANS Content-Type : le faux S3, comme R2, le met en octet-stream.
 * `corpsVide` : création avec un corps '' comme l'ANCIEN migrer-fichiers.mjs -> fetch ajoute text/plain;charset=UTF-8.
 */
async function creerSansType(cle, { corpsVide = false } = {}) {
  const init = await s3Fetch(env, 'POST', `/${BUCKET}/${cle}`, { query: [['uploads', '']], ...(corpsVide ? { body: '' } : {}) });
  const id = /<UploadId>([^<]+)/.exec(init.text)[1];
  const part = await s3Fetch(env, 'PUT', `/${BUCKET}/${cle}`, { query: [['partNumber', '1'], ['uploadId', id]], body: contenu });
  const etag = part.headers.get('etag').replace(/"/g, '');
  const fin = await s3Fetch(env, 'POST', `/${BUCKET}/${cle}`, { query: [['uploadId', id]], body: `<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>"${etag}"</ETag></Part></CompleteMultipartUpload>` });
  if (fin.status !== 200) throw new Error(`préparation impossible (HTTP ${fin.status})`);
}

try {
  console.log('\n■ Garde-fous (aucune requête)');
  check('clé valide : un objet sous videos/', cleValide(CLE) && cleValide('videos/migration/1fc96ec7b3aa4bff.mp4'));
  check('clés refusées : hors videos/, « .. », dossier, joker, vide',
    ['autre/x.mp4', 'videos/../x.mp4', 'videos/', 'videos/*', '', 'videos//x.mp4', '/videos/x.mp4'].every((c) => !cleValide(c)));
  check('--cle absente : refusé', refus(() => verifier(parseArgs(['--r2-env', FAUX_S3_ENV])), /--cle doit désigner UN objet/));
  check('--type non vidéo : refusé', refus(() => verifier(parseArgs([...ARGS, '--type', 'text/plain'])), /type vidéo/));
  check('--r2-env absent : refusé', refus(() => verifier(parseArgs(['--cle', CLE])), /--r2-env <fichier> est obligatoire/));
  check('fichier --r2-env DANS le dépôt : refusé', refus(() => verifier(parseArgs(['--r2-env', path.resolve('pocketbase', 'r2.env'), '--cle', CLE])), /HORS du dépôt/));
  check('bucket différent du bucket attendu : refusé', refus(() => verifier(parseArgs([...ARGS, '--bucket-attendu', 'chay-sauvegardes'])), /n'est pas le bucket attendu/));
  const incomplet = path.join(DIR, 'incomplet.env');
  fs.writeFileSync(incomplet, 'R2_ENDPOINT=https://compte.r2.cloudflarestorage.com\nR2_BUCKET=chay-videos\n');
  let msg = '';
  try { verifier(parseArgs(['--r2-env', incomplet, '--cle', CLE])); } catch (e) { msg = e.message; }
  check('variables manquantes : seuls les NOMS sont cités', /R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE_URL/.test(msg) && !msg.includes('compte.r2'));
  const reel = path.join(DIR, 'reel.env');
  fs.writeFileSync(reel, 'R2_ENDPOINT=https://compte.r2.cloudflarestorage.com\nR2_BUCKET=chay-videos\nR2_ACCESS_KEY_ID=x\nR2_SECRET_ACCESS_KEY=y\nR2_PUBLIC_BASE_URL=https://media.exemple\n');
  check('vrai R2 sans --r2-reel : refusé', refus(() => verifier(parseArgs(['--r2-env', reel, '--cle', CLE])), /ajoutez --r2-reel/));
  const reelHttp = path.join(DIR, 'reel-http.env');
  fs.writeFileSync(reelHttp, fs.readFileSync(reel, 'utf8').replace('https://compte', 'http://compte'));
  check('vrai R2 en http : refusé', refus(() => verifier(parseArgs(['--r2-env', reelHttp, '--cle', CLE, '--r2-reel'])), /https/));

  console.log('\n■ Objet absent, simulation, confirmation, échec de copie');
  check('objet introuvable : erreur claire', await echoue(run(ARGS), /objet introuvable/));
  await creerSansType(CLE);
  await creerSansType(TEMOIN);
  const t0 = await tete(CLE);
  const temoin0 = await tete(TEMOIN);
  check('préparation : objet créé sans type -> application/octet-stream (comme R2)', t0.status === 200 && t0.type === 'application/octet-stream' && t0.taille === contenu.length);
  const sim = await run(ARGS);
  const t1 = await tete(CLE);
  check('simulation : type actuel et voulu affichés, rien de modifié',
    !sim.change && sortie.some((l) => /Content-Type actuel : application\/octet-stream -> voulu : video\/mp4/.test(l)) && t1.etag === t0.etag && t1.type === t0.type);
  let demande = '';
  check('confirmation refusée : rien de modifié',
    await echoue(run([...ARGS, '--appliquer'], { confirmer: async (a) => { demande = a; return false; } }), /Annulé/) && (await tete(CLE)).type === 'application/octet-stream');
  check(`texte de confirmation : « CORRIGER ${CLE} »`, demande === `CORRIGER ${CLE}`);
  await s3Fetch(env, 'POST', `/${BUCKET}/_faux/echec-copie`, { query: [['fois', '1']] });
  check('copie refusée par le serveur : erreur, objet inchangé',
    await echoue(run([...ARGS, '--appliquer'], { confirmer: async () => true }), /CopyObject : HTTP 500/) && (await tete(CLE)).type === 'application/octet-stream');

  console.log('\n■ Taille inconnue : refus');
  const e0 = (await tete(CLE)).etag;
  await outil('sans-taille', [['actif', '1']]);
  let questionPosee = false;
  const refusTaille = await echoue(run([...ARGS, '--appliquer'], { confirmer: async () => { questionPosee = true; return true; } }), /Refusé : taille inconnue.*aucune copie/);
  await outil('sans-taille', [['actif', '0']]);
  check('ni Content-Length ni Content-Range : refus AVANT la question et avant toute copie', refusTaille && !questionPosee);
  const t1b = await tete(CLE);
  check('taille inconnue : objet inchangé (type et ETag)', t1b.etag === e0 && t1b.type === 'application/octet-stream');

  console.log('\n■ Comportement du vrai R2 : compression à la volée d\'un objet text/plain');
  await creerSansType(CLE_TXT, { corpsVide: true });
  const tTxt = await tete(CLE_TXT);
  check('ancien code reproduit : objet créé en text/plain;charset=UTF-8', tTxt.type === 'text/plain;charset=UTF-8', tTxt.type);
  await copieSurPlace(CLE_TXT, { 'content-type': 'text/plain;charset=UTF-8', 'cache-control': 'public, max-age=3600', 'x-amz-meta-origine': 'migration' });
  await outil('compression', [['actif', '1']]);
  const brut = await s3Fetch(env, 'HEAD', `/${BUCKET}/${CLE_TXT}`);
  check('comme le vrai R2 : HEAD signé SANS Content-Length, avec « Content-Encoding: gzip »',
    brut.status === 200 && brut.headers.get('content-length') === null && brut.headers.get('content-encoding') === 'gzip');
  sortie.length = 0;
  const simTxt = await run(['--r2-env', FAUX_S3_ENV, '--cle', CLE_TXT]);
  check('simulation : taille réelle lue par Content-Range (et non -1)',
    simTxt.avant.taille === contenu.length && sortie.some((l) => l.includes(`(${contenu.length} octets, lue par Content-Range)`)), sortie.join(' | '));
  check('simulation : Content-Encoding du HEAD signalé comme compression à la volée, NON recopié',
    !('content-encoding' in simTxt.avant.garder) && sortie.some((l) => /vu au HEAD seulement.*NON recopié/.test(l)));
  check('simulation : en-têtes conservés = liste blanche seulement (cache-control, x-amz-meta-origine)',
    JSON.stringify(Object.keys(simTxt.avant.garder).sort()) === '["cache-control","x-amz-meta-origine"]', JSON.stringify(simTxt.avant.garder));
  const rTxt = await run(['--r2-env', FAUX_S3_ENV, '--cle', CLE_TXT, '--appliquer'], { confirmer: async () => true });
  const gTxt = await s3Fetch(env, 'GET', `/${BUCKET}/${CLE_TXT}`, { headers: { range: 'bytes=0-0' } });
  check('correction : vérifiée, video/mp4, même taille', rTxt.ok && gTxt.headers.get('content-type') === 'video/mp4' && gTxt.headers.get('content-range') === `bytes 0-0/${contenu.length}`);
  check('correction : Cache-Control et x-amz-meta-origine conservés, AUCUN Content-Encoding ajouté',
    gTxt.headers.get('cache-control') === 'public, max-age=3600' && gTxt.headers.get('x-amz-meta-origine') === 'migration' && gTxt.headers.get('content-encoding') === null);
  const pubTxt = await fetch(`${env.R2_PUBLIC_BASE_URL}/${CLE_TXT}`);
  check('contenu intact ; plus de compression à la volée (type vidéo)', sha(Buffer.from(await pubTxt.arrayBuffer())) === sha(contenu) && pubTxt.headers.get('content-encoding') === null);
  await outil('compression', [['actif', '0']]);

  console.log('\n■ Content-Encoding réellement stocké sur l\'objet (avéré)');
  await creerSansType(CLE_GZ);
  await copieSurPlace(CLE_GZ, { 'content-type': 'application/octet-stream', 'content-encoding': 'gzip' });
  sortie.length = 0;
  const rGz = await run(['--r2-env', FAUX_S3_ENV, '--cle', CLE_GZ, '--appliquer'], { confirmer: async () => true });
  const pGz = await fetch(`${env.R2_PUBLIC_BASE_URL}/${CLE_GZ}`, { headers: { Range: 'bytes=0-0' } });
  await pGz.body?.cancel();
  check('avéré : signalé, conservé tel quel, type corrigé, vérification OK',
    rGz.ok && 'content-encoding' in rGz.avant.garder && sortie.some((l) => /STOCKÉ sur l'objet \(avéré\)/.test(l))
      && pGz.headers.get('content-encoding') === 'gzip' && pGz.headers.get('content-type') === 'video/mp4', sortie.join(' | '));

  console.log('\n■ Correction');
  const r = await run([...ARGS, '--appliquer'], { confirmer: async () => true });
  const t2 = await tete(CLE);
  check('corrigé et vérifié par le script (HEAD + Range 206)', r.change && r.ok, JSON.stringify({ change: r.change, ok: r.ok }));
  check('HEAD : video/mp4, taille inchangée', t2.type === 'video/mp4' && t2.taille === contenu.length);
  const pub = await fetch(`${env.R2_PUBLIC_BASE_URL}/${CLE}`);
  check('contenu identique (adresse publique)', sha(Buffer.from(await pub.arrayBuffer())) === sha(contenu));
  const plage = await fetch(`${env.R2_PUBLIC_BASE_URL}/${CLE}`, { headers: { Range: 'bytes=0-1' } });
  await plage.arrayBuffer();
  check('lecture par plages : 206, video/mp4', plage.status === 206 && plage.headers.get('content-type') === 'video/mp4');
  const temoin1 = await tete(TEMOIN);
  check('objet témoin (autre clé) : intact', temoin1.type === 'application/octet-stream' && temoin1.etag === temoin0.etag);

  const relance = await run([...ARGS, '--appliquer'], { confirmer: async () => { throw new Error('ne doit pas demander'); } });
  check('relance : « rien à faire », aucune copie (ETag inchangé)', !relance.change && sortie.some((l) => /Rien à faire/.test(l)) && (await tete(CLE)).etag === t2.etag);

  console.log('\n■ Ligne de commande (confirmation tapée au clavier)');
  const cli = (args, input) => spawnSync(process.execPath, ['pocketbase/scripts/corriger-type-r2.mjs', ...args], { input, encoding: 'utf8' });
  const c1 = cli(['--r2-env', FAUX_S3_ENV, '--cle', TEMOIN]);
  check('simulation : code 0, rien de modifié', c1.status === 0 && /SIMULATION/.test(c1.stdout) && (await tete(TEMOIN)).etag === temoin0.etag, c1.stderr);
  const c2 = cli(['--r2-env', FAUX_S3_ENV, '--cle', TEMOIN, '--appliquer'], 'mauvaise réponse\n');
  check('mauvaise phrase tapée : code 2, rien de modifié', c2.status === 2 && (await tete(TEMOIN)).type === 'application/octet-stream');
  const c3 = cli(['--r2-env', FAUX_S3_ENV, '--cle', TEMOIN, '--appliquer'], `CORRIGER ${TEMOIN}\n`);
  check('bonne phrase tapée : code 0, type corrigé', c3.status === 0 && (await tete(TEMOIN)).type === 'video/mp4', c3.stdout + c3.stderr);
  const c4 = cli(['--r2-env', FAUX_S3_ENV, '--cle', 'videos/../secret.mp4']);
  check('clé invalide : code 2', c4.status === 2);

  const tout = [...sortie, c1.stdout, c1.stderr, c2.stdout, c2.stderr, c3.stdout, c3.stderr, c4.stderr].join('\n');
  check('aucune clé d\'accès ni secret dans la sortie', !tout.includes(env.R2_ACCESS_KEY_ID) && !tout.includes(env.R2_SECRET_ACCESS_KEY));
} finally {
  await outil('echec-copie', [['fois', '0']]).catch(() => {});
  await outil('compression', [['actif', '0']]).catch(() => {});
  await outil('sans-taille', [['actif', '0']]).catch(() => {});
  for (const c of [CLE, TEMOIN, CLE_TXT, CLE_GZ]) await s3Fetch(env, 'DELETE', `/${BUCKET}/${c}`).catch(() => {});
  fs.rmSync(DIR, { recursive: true, force: true });
  console.log('\n(nettoyage effectué)');
}
done();
