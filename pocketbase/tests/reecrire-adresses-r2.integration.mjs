#!/usr/bin/env node
// reecrire-adresses-r2.mjs contre le FAUX S3 local et le PocketBase du BAC À SABLE uniquement.
// Export, objets et enregistrements SYNTHÉTIQUES (supprimés à la fin). Reproduit le cas réel : vidéo Base44 créée
// sans type (text/plain par l'ancien code), HEAD compressé à la volée SANS Content-Length.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { http, loadCreds, login, makeChecker } from './lib.mjs';
import { FAUX_S3_ENV, loadFauxS3Env, s3Fetch } from './sigv4-node.mjs';

const { check, done } = makeChecker();
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'chay-adresses-r2-'));
process.env.EXPORT_BASE44 = DIR; // lu au chargement des modules
const { analyserAdresse, main: mainBrut, parseArgs } = await import('../scripts/reecrire-adresses-r2.mjs');
// Limite de connexions superuser (10 / min) quand les suites s'enchaînent : connexion retentée après une pause.
const main = async (argv, opts) => {
  for (let essai = 0; ; essai++) {
    try { return await mainBrut(argv, opts); } catch (e) {
      if (!/connexion superuser impossible \(HTTP 429\)/.test(e.message) || essai >= 8) throw e;
      await new Promise((ok) => setTimeout(ok, 10000));
    }
  }
};

const env = loadFauxS3Env();
const B = env.R2_BUCKET;
const suCreds = loadCreds(['superuser']).superuser;
const su = { token: (await login('_superusers', suCreds)).token };
const rnd = crypto.randomBytes(5).toString('hex');
const hex24 = () => crypto.randomBytes(12).toString('hex');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const HOTE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90.r2.cloudflarestorage.com';
const ancienne = (cle, bucket = B) => `https://${HOTE}/${bucket}/${encodeURIComponent(cle)}`;
const publique = (cle) => `${env.R2_PUBLIC_BASE_URL}/${cle.split('/').map(encodeURIComponent).join('/')}`;
const outil = (nom, query) => s3Fetch(env, 'POST', `/${B}/_faux/${nom}`, { query });
const sortie = [];
const run = (argv, opts = {}) => main(argv, { log: (...a) => sortie.push(a.join(' ')), ...opts });
const echoue = async (p, motif) => { try { await p; return false; } catch (e) { return motif.test(e.message); } };
const ARGS = ['--pb', 'http://127.0.0.1:8090', '--r2-env', FAUX_S3_ENV];

// ── Objets du faux S3 ───────────────────────────────────────────────────────
const VID = Buffer.concat([Buffer.from('0000001866747970', 'hex'), Buffer.from('mp42'), crypto.randomBytes(2 * 1024 * 1024)]);
const IMG = Buffer.concat([Buffer.from('ffd8ffe0', 'hex'), crypto.randomBytes(50 * 1024)]);
const K_TXT = `videos/${rnd}-yeshua-tiktok.mp4`; // cas réel : créé par l'ancien code -> text/plain
const K_IMG = `videos/${rnd}-couverture.jpg`; // couverture sans type -> octet-stream
const K_OK = `videos/${rnd}-deja-bon.mp4`; // déjà video/mp4
const K_ABSENT = `videos/${rnd}-absent.mp4`; // n'existe pas
const K_SANS_TAILLE = `videos/${rnd}-sans-taille.mp4`;

async function creer(cle, contenu, { corpsVide = false, type = null, entetes = {} } = {}) {
  const init = await s3Fetch(env, 'POST', `/${B}/${cle}`, { query: [['uploads', '']], ...(corpsVide ? { body: '' } : {}) });
  const id = /<UploadId>([^<]+)/.exec(init.text)[1];
  const p = await s3Fetch(env, 'PUT', `/${B}/${cle}`, { query: [['partNumber', '1'], ['uploadId', id]], body: contenu });
  await s3Fetch(env, 'POST', `/${B}/${cle}`, { query: [['uploadId', id]], body: `<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>${p.headers.get('etag')}</ETag></Part></CompleteMultipartUpload>` });
  if (type || Object.keys(entetes).length) {
    await s3Fetch(env, 'PUT', `/${B}/${cle}`, { headers: { 'content-type': type || 'application/octet-stream', ...entetes, 'x-amz-copy-source': `/${B}/${cle}`, 'x-amz-metadata-directive': 'REPLACE' } });
  }
}
const plage = async (url) => { const r = await fetch(url, { headers: { Range: 'bytes=0-0' } }); await r.body?.cancel(); return r; };
const tete = async (cle) => { const r = await s3Fetch(env, 'GET', `/${B}/${cle}`, { headers: { range: 'bytes=0-0' } }); return { type: r.headers.get('content-type'), etag: r.headers.get('etag'), cc: r.headers.get('cache-control'), ce: r.headers.get('content-encoding'), range: r.headers.get('content-range') }; };

// ── Enregistrements PocketBase et export synthétiques ───────────────────────
const V1 = hex24(); const V2 = hex24(); const V3 = hex24(); const V4 = hex24(); const A1 = hex24();
const rec = async (col, id) => (await http('GET', `/api/collections/${col}/records/${id}`, su)).data;
const csvLignes = [
  ['Video', V1, 'video_url', ancienne(K_TXT)],
  ['Video', V1, 'cover_url', ancienne(K_IMG)],
  ['Video', V2, 'video_url', ancienne(K_OK)],
  ['Video', V3, 'video_url', ancienne(K_ABSENT)],
  ['Article', A1, 'cover_url', ancienne(K_OK)], // valeur actuelle modifiée depuis l'export : à ne pas toucher
  ['Video', hex24(), 'video_url', ancienne('videos/x.mp4', 'chay-sauvegardes')], // autre bucket
  ['Video', hex24(), 'video_url', `${ancienne(K_OK)}?X-Amz-Signature=abc`], // adresse signée
  ['Video', hex24(), 'video_url', `https://${B}.${HOTE}/videos/${rnd}.mp4`], // autre forme (virtual-host)
];
const ecrireExport = (lignes) => {
  fs.writeFileSync(path.join(DIR, 'fichiers.csv'), `entite;id;champ;hote;url\n${lignes.map(([e, i, c, u]) => `${e};${i};${c};${new URL(u).hostname};${u}`).join('\n')}\n`);
  fs.writeFileSync(path.join(DIR, 'fichiers-telecharges.csv'), 'url;chemin_local;taille;sha256;statut\n');
};

try {
  fs.mkdirSync(path.join(DIR, '_outil', 'pb'), { recursive: true });
  ecrireExport(csvLignes);
  await creer(K_TXT, VID, { corpsVide: true });
  await s3Fetch(env, 'PUT', `/${B}/${K_TXT}`, { headers: { 'content-type': 'text/plain;charset=UTF-8', 'cache-control': 'public, max-age=86400', 'x-amz-copy-source': `/${B}/${K_TXT}`, 'x-amz-metadata-directive': 'REPLACE' } });
  await creer(K_IMG, IMG);
  await creer(K_OK, VID, { type: 'video/mp4' });
  const mk = async (col, id, body) => { const r = await http('POST', `/api/collections/${col}/records`, { ...su, body: { id, ...body } }); if (r.status !== 200) throw new Error(`création ${col} : HTTP ${r.status}`); };
  await mk('Video', V1, { title: `Test adresses ${rnd} 1`, video_url: ancienne(K_TXT), cover_url: ancienne(K_IMG), base44_updated_date: '2025-01-02 03:04:05.000Z' });
  await mk('Video', V2, { title: `Test adresses ${rnd} 2`, video_url: ancienne(K_OK) });
  await mk('Video', V3, { title: `Test adresses ${rnd} 3`, video_url: ancienne(K_ABSENT) });
  await mk('Article', A1, { title: `Test adresses ${rnd}`, body: 'x', cover_url: 'https://exemple.invalid/modifiee-a-la-main.jpg' });

  console.log('\n■ Garde-fous (avant toute requête)');
  check('analyse : adresse du bucket attendu -> clé décodée', analyserAdresse(ancienne(K_TXT), env).cle === K_TXT);
  check('analyse : autre bucket, adresse signée, virtual-host, autre hôte : refusés',
    !analyserAdresse(ancienne('videos/x.mp4', 'chay-sauvegardes'), env).ok && !analyserAdresse(`${ancienne(K_OK)}?X-Amz-Signature=a`, env).ok
      && !analyserAdresse(`https://${B}.${HOTE}/videos/a.mp4`, env).ok && !analyserAdresse('https://base44.app/a.mp4', env).ok);
  const reelEnv = { ...env, R2_ENDPOINT: 'https://ffffffffffffffffffffffffffffffff.r2.cloudflarestorage.com' };
  check('analyse (vrai R2) : autre compte que R2_ENDPOINT : refusé', /autre compte/.test(analyserAdresse(ancienne(K_TXT), reelEnv).raison || ''));
  check('--pb hors 127.0.0.1 / localhost : refusé', await echoue(run(['--pb', 'https://api.chay.fr', '--r2-env', FAUX_S3_ENV]), /127\.0\.0\.1 ou localhost/));
  check('fichier --r2-env dans le dépôt : refusé', await echoue(run(['--r2-env', path.resolve('pocketbase', 'r2.env')]), /HORS du dépôt/));
  check('bucket différent du bucket attendu : refusé', await echoue(run([...ARGS, '--bucket-attendu', 'chay-sauvegardes']), /bucket attendu/));
  const su0 = [process.env.PB_SU_EMAIL, process.env.PB_SU_PASSWORD];
  delete process.env.PB_SU_EMAIL; delete process.env.PB_SU_PASSWORD;
  check('hors bac à sable sans PB_SU_* : refusé (pas d\'identifiants du bac à sable envoyés)',
    await echoue(run(['--pb', 'http://127.0.0.1:8092', '--r2-env', FAUX_S3_ENV]), /PB_SU_EMAIL et PB_SU_PASSWORD sont requis/));
  if (su0[0]) process.env.PB_SU_EMAIL = su0[0];
  if (su0[1]) process.env.PB_SU_PASSWORD = su0[1];
  check('options : simulation par défaut, bucket attendu chay-videos', !parseArgs([]).appliquer && parseArgs([]).bucketAttendu === 'chay-videos');

  console.log('\n■ Cas réel reproduit (compression à la volée)');
  await outil('compression', [['actif', '1']]);
  const brut = await s3Fetch(env, 'HEAD', `/${B}/${K_TXT}`);
  check('HEAD signé : SANS Content-Length, Content-Encoding gzip, text/plain (comme le vrai R2)',
    brut.headers.get('content-length') === null && brut.headers.get('content-encoding') === 'gzip' && /^text\/plain/.test(brut.headers.get('content-type')));
  const avantPublic = await plage(publique(K_TXT));
  check('adresse publique avant : type text/plain (la vidéo se télécharge au lieu de se lire)', /^text\/plain/.test(avantPublic.headers.get('content-type')));

  console.log('\n■ Simulation');
  const v1avant = await rec('Video', V1);
  const etagTxt0 = (await tete(K_TXT)).etag;
  sortie.length = 0;
  const sim = await run(ARGS);
  const o = Object.fromEntries(sim.objets.map((x) => [x.cle, x]));
  check('4 objets traitables, 3 références non traitées (avec raison)', sim.objets.length === 4 && sim.ignorees.length === 3 && sim.ignorees.every((r) => r.raison), JSON.stringify(sim.ignorees.map((r) => r.raison)));
  check('vidéo réelle : taille lue par Content-Range (jamais -1), type text/plain -> à corriger en video/mp4',
    o[K_TXT].objet.taille === VID.length && !o[K_TXT].typeOk && o[K_TXT].typeVoulu === 'video/mp4' && !o[K_TXT].probleme);
  check('Content-Encoding du HEAD : signalé comme compression à la volée, jamais recopié',
    !('content-encoding' in o[K_TXT].objet.garder) && sortie.some((l) => /compression à la volée, non recopié/.test(l)));
  check('liste blanche : cache-control conservé pour la copie', o[K_TXT].objet.garder['cache-control'] === 'public, max-age=86400');
  check('couverture (cover_url) : octet-stream -> à corriger en image/jpeg', !o[K_IMG].typeOk && o[K_IMG].typeVoulu === 'image/jpeg');
  check('objet déjà en video/mp4 : type correct', o[K_OK].typeOk);
  check('objet absent : signalé, rien ne sera fait', /introuvable/.test(o[K_ABSENT].probleme || ''));
  const etat = (cle, id, champ) => o[cle].refs.find((r) => r.id === id && r.champ === champ)?.avant;
  check('champs : à réécrire (V1 video_url + cover_url, V2), valeur différente (A1) non touchée',
    etat(K_TXT, V1, 'video_url') === 'à réécrire' && etat(K_IMG, V1, 'cover_url') === 'à réécrire' && etat(K_OK, V2, 'video_url') === 'à réécrire'
      && etat(K_OK, A1, 'cover_url') === 'valeur différente (non touchée)');
  const v1sim = await rec('Video', V1);
  check('simulation : rien d\'écrit (PocketBase et objet inchangés)', v1sim.video_url === v1avant.video_url && (await tete(K_TXT)).etag === etagTxt0);
  const rapportSim = fs.readFileSync(sim.rapport, 'utf8');
  check('rapport : objets (clé, type, taille), champs (avant / après), non traitées',
    rapportSim.includes(K_TXT) && rapportSim.includes('text/plain') && rapportSim.includes(`${VID.length} o`) && /\| Video \| [0-9a-f]{24} \| cover_url \|/.test(rapportSim) && /autre bucket/.test(rapportSim));

  console.log('\n■ Confirmation');
  let demande = '';
  check('confirmation refusée : rien de modifié', await echoue(run([...ARGS, '--appliquer'], { confirmer: async (a) => { demande = a; return false; } }), /Annulé/)
    && (await rec('Video', V1)).video_url === ancienne(K_TXT) && (await tete(K_TXT)).etag === etagTxt0);
  check(`texte demandé : « REECRIRE ${B} »`, demande === `REECRIRE ${B}`);

  console.log('\n■ Application');
  const app = await run([...ARGS, '--appliquer'], { confirmer: async () => true });
  check('bilan : aucun échec', app.echecs === 0, JSON.stringify(app.objets.map((x) => [x.cle, x.resultat])));
  const tTxt = await tete(K_TXT);
  check('vidéo réelle : video/mp4, même taille, Cache-Control conservé, AUCUN Content-Encoding ajouté',
    tTxt.type === 'video/mp4' && tTxt.range === `bytes 0-0/${VID.length}` && tTxt.cc === 'public, max-age=86400' && tTxt.ce === null);
  check('couverture : image/jpeg', (await tete(K_IMG)).type === 'image/jpeg');
  const v1 = await rec('Video', V1);
  check('Video V1 : video_url et cover_url -> adresses publiques', v1.video_url === publique(K_TXT) && v1.cover_url === publique(K_IMG));
  check('Video V1 : date de mise à jour Base44 conservée', v1.base44_updated_date === v1avant.base44_updated_date);
  check('Video V2 : video_url réécrite (type déjà correct, aucune copie)', (await rec('Video', V2)).video_url === publique(K_OK));
  check('Video V3 (objet absent) : NON réécrite', (await rec('Video', V3)).video_url === ancienne(K_ABSENT));
  check('Article A1 (valeur modifiée à la main) : NON touché', (await rec('Article', A1)).cover_url === 'https://exemple.invalid/modifiee-a-la-main.jpg');
  const lp = await plage(publique(K_TXT));
  check('adresse publique : 206, video/mp4 (se lit au lieu de se télécharger)', lp.status === 206 && lp.headers.get('content-type') === 'video/mp4');
  check('contenu intact', sha(Buffer.from(await (await fetch(publique(K_TXT))).arrayBuffer())) === sha(VID));
  const rapportApp = fs.readFileSync(app.rapport, 'utf8');
  check('rapport : avant « à réécrire », après « déjà fait »', /\| video_url \| `[^`]+` \| à réécrire \| déjà fait \|/.test(rapportApp));

  console.log('\n■ Idempotence et reprise');
  const etagTxt1 = (await tete(K_TXT)).etag;
  const relance = await run([...ARGS, '--appliquer'], { confirmer: async () => { throw new Error('ne doit pas demander'); } });
  check('relance : « rien à faire », aucune question, aucune copie', !relance.applique && sortie.some((l) => /Rien à faire/.test(l)) && (await tete(K_TXT)).etag === etagTxt1);
  await http('PATCH', `/api/collections/Video/records/${V2}`, { ...su, body: { video_url: ancienne(K_OK) } }); // reprise : un champ resté à l'ancienne adresse
  const reprise = await run([...ARGS, '--appliquer'], { confirmer: async () => true });
  check('reprise : seul le champ restant est réécrit, aucune nouvelle copie',
    reprise.echecs === 0 && (await rec('Video', V2)).video_url === publique(K_OK) && (await tete(K_TXT)).etag === etagTxt1 && (await rec('Video', V1)).video_url === publique(K_TXT));

  console.log('\n■ Taille inconnue : refus');
  await creer(K_SANS_TAILLE, VID);
  await mk('Video', V4, { title: `Test adresses ${rnd} 4`, video_url: ancienne(K_SANS_TAILLE) });
  ecrireExport([...csvLignes, ['Video', V4, 'video_url', ancienne(K_SANS_TAILLE)]]);
  await outil('sans-taille', [['actif', '1']]);
  const st = await run([...ARGS, '--appliquer'], { confirmer: async () => true }).catch((e) => ({ erreur: e.message }));
  await outil('sans-taille', [['actif', '0']]);
  check('ni Content-Length ni Content-Range : objet refusé (taille inconnue), champ NON réécrit',
    (st.erreur || st.objets?.find((x) => x.cle === K_SANS_TAILLE)?.probleme || '').match(/taille inconnue/) && (await rec('Video', V4)).video_url === ancienne(K_SANS_TAILLE), JSON.stringify(st.erreur || st.objets?.map((x) => x.probleme)));
  check('… et son type n\'a pas été modifié', (await tete(K_SANS_TAILLE)).type === 'application/octet-stream');

  console.log('\n■ Ligne de commande et confidentialité');
  const cli = spawnSync(process.execPath, ['pocketbase/scripts/reecrire-adresses-r2.mjs', ...ARGS], { encoding: 'utf8', env: { ...process.env, EXPORT_BASE44: DIR } });
  check('simulation en ligne de commande : code 0', cli.status === 0 && /SIMULATION/.test(cli.stdout), cli.stderr);
  const tout = [...sortie, cli.stdout, cli.stderr, rapportSim, rapportApp].join('\n');
  check('aucune clé d\'accès, aucun secret, aucun mot de passe superuser dans la sortie ni le rapport',
    !tout.includes(env.R2_ACCESS_KEY_ID) && !tout.includes(env.R2_SECRET_ACCESS_KEY) && !tout.includes(suCreds.password));
} finally {
  await outil('compression', [['actif', '0']]).catch(() => {});
  await outil('sans-taille', [['actif', '0']]).catch(() => {});
  for (const [col, id] of [['Video', V1], ['Video', V2], ['Video', V3], ['Video', V4], ['Article', A1]]) await http('DELETE', `/api/collections/${col}/records/${id}`, su).catch(() => {});
  for (const c of [K_TXT, K_IMG, K_OK, K_SANS_TAILLE]) await s3Fetch(env, 'DELETE', `/${B}/${c}`).catch(() => {});
  fs.rmSync(DIR, { recursive: true, force: true });
  console.log('\n(nettoyage effectué)');
}
done();
