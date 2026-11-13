#!/usr/bin/env node
// Lot E contre une COPIE JETABLE du bac à sable (par défaut http://127.0.0.1:8095), jamais contre le bac à sable
// lui-même (8090) : la consigne du lot est de décrire les migrations sans les exécuter sur une base durable.
// Copie : dossier pb_data du bac à sable recopié, servi sur 8095 avec les mêmes hooks (voir docs/LOT-E.md).
// Tout ce qui est créé est supprimé ; la migration elle-même reste dans la copie (jetée ensuite).
process.env.PB_TEST_URL ||= 'http://127.0.0.1:8095';
if (new URL(process.env.PB_TEST_URL).port === '8090') {
  console.error('Refusé : ce test applique la migration du lot E ; il vise une copie jetable, pas le bac à sable (8090).');
  process.exit(2);
}
const { migrer } = await import('../scripts/migrer-lot-e.mjs');
const { BASE, fn, http, loadCreds, login, makeChecker, q, waitForMail } = await import('./lib.mjs');

const creds = loadCreds(['superuser', 'admin', 'membre']);
const { check, done } = makeChecker();
const su = { token: (await login('_superusers', creds.superuser)).token };
const ADM = await login('users', creds.admin);
const M = await login('users', creds.membre);
const crees = []; // [collection, id]
const garder = (c, r) => { if (r.data?.id) crees.push([c, r.data.id]); return r; };

console.log(`\n■ Migration (copie jetable : ${BASE})`);
const h = { Authorization: su.token, 'Content-Type': 'application/json' };
const simulation = await migrer(BASE, h, {});
// Copie neuve : la simulation annonce les changements sans rien écrire. Copie déjà migrée (test relancé) : rien.
const dejaMigree = simulation.length === 0;
check('simulation : rien écrit', dejaMigree || (await http('GET', `/api/collections/${simulation[0].split(' ')[0].replace(/\..*/, '')}`, su)).status === 404, simulation[0]);
const premiers = await migrer(BASE, h, { appliquer: true });
const seconds = await migrer(BASE, h, { appliquer: true });
check(`appliquée (${premiers.length} changement(s)), puis idempotente`, seconds.length === 0, seconds.join(' | '));

console.log('\n■ (1) Catégories de jeux');
const cats = (await http('GET', '/api/collections/GameCategory/records?sort=order', { token: M.token })).data?.items || [];
check('deux catégories de départ, lisibles par un membre', cats.length === 2 && cats[0].name && cats[1].name, JSON.stringify(cats.map((c) => c.name)));
check('membre : renommage refusé', (await http('PATCH', `/api/collections/GameCategory/records/${cats[0]?.id}`, { token: M.token, body: { name: 'x' } })).status >= 400);
const nomAvant = cats[0]?.name;
const ren = await http('PATCH', `/api/collections/GameCategory/records/${cats[0]?.id}`, { token: ADM.token, body: { name: 'Jeux des grands' } });
check('admin : renommage accepté', ren.status === 200 && ren.data?.name === 'Jeux des grands');
await http('PATCH', `/api/collections/GameCategory/records/${cats[0]?.id}`, { token: ADM.token, body: { name: nomAvant } });
check('admin : 3e catégorie et suppression refusées (deux catégories fixes)',
  (await http('POST', '/api/collections/GameCategory/records', { token: ADM.token, body: { slot: 'game', name: 'x' } })).status >= 400
  && (await http('DELETE', `/api/collections/GameCategory/records/${cats[1]?.id}`, { token: ADM.token })).status >= 400);
const c1 = garder('GameClassement', await http('POST', '/api/collections/GameClassement/records', { token: ADM.token, body: { game_id: 'testlote', slot: 'game' } }));
check('admin : jeu classé', c1.status === 200);
const c2 = garder('GameClassement', await http('POST', '/api/collections/GameClassement/records', { token: ADM.token, body: { game_id: 'testlote', slot: 'playmobile' } }));
check('un jeu = une seule catégorie (2e classement refusé)', c2.status === 400);
check('membre : classement refusé, lecture permise',
  (await http('POST', '/api/collections/GameClassement/records', { token: M.token, body: { game_id: 'testlotf', slot: 'game' } })).status >= 400
  && ((await http('GET', `/api/collections/GameClassement/records?filter=${q('game_id = "testlote"')}`, { token: M.token })).data?.items || []).length === 1);

console.log('\n■ (2) Actualité chrétienne');
const vide = await http('GET', '/api/collections/ChristianNews/records', { token: M.token });
check('membre : section lisible (même vide)', vide.status === 200);
const n1 = garder('ChristianNews', await http('POST', '/api/collections/ChristianNews/records', { token: ADM.token, body: { title: 'Test E actualité', summary: 'r', body: '<p>t</p>', link_url: 'https://exemple.invalid', created_by_id: ADM.id } }));
check('admin : publication créée, lue par un membre', n1.status === 200 && (await http('GET', `/api/collections/ChristianNews/records/${n1.data?.id}`, { token: M.token })).status === 200);
check('membre : publication refusée', (await http('POST', '/api/collections/ChristianNews/records', { token: M.token, body: { title: 'x' } })).status >= 400);

console.log('\n■ (3) Fonds d’écran');
const f1 = garder('Wallpaper', await http('POST', '/api/collections/Wallpaper/records', { token: ADM.token, body: { title: 'Test E fond', image_url: 'https://exemple.invalid/f.jpg', thumb_url: 'https://exemple.invalid/t.jpg', created_by_id: ADM.id } }));
check('admin : fond d’écran publié, lu par un membre', f1.status === 200 && (await http('GET', `/api/collections/Wallpaper/records/${f1.data?.id}`, { token: M.token })).status === 200);
check('photo obligatoire', (await http('POST', '/api/collections/Wallpaper/records', { token: ADM.token, body: { title: 'sans photo' } })).status === 400);
check('membre : publication refusée', (await http('POST', '/api/collections/Wallpaper/records', { token: M.token, body: { title: 'x', image_url: 'https://x/y.jpg' } })).status >= 400);

console.log('\n■ (4) Se missionner');
const form = { last_name: 'Test E', first_name: 'Mission', age: 30, phone: '06 12 34 56 78', address: '1 rue du Test', kind: 'autre', other_text: 'Chorale <b>', details: 'Ligne 1\nLigne 2' };
check('anonyme -> 401', (await fn('createMissionRequest', { body: form })).status === 401);
check('champ manquant -> 400 lisible', (await fn('createMissionRequest', { token: M.token, body: { ...form, address: '' } })).status === 400);
check('« Autre demande » sans précision -> 400', (await fn('createMissionRequest', { token: M.token, body: { ...form, other_text: '' } })).status === 400);
check('création directe dans la collection refusée (route seulement)', (await http('POST', '/api/collections/MissionRequest/records', { token: M.token, body: { ...form, user_id: M.id } })).status >= 400);
const depuis = Date.now();
const mr = await fn('createMissionRequest', { token: M.token, body: { ...form, user_id: 'usurpe' } });
if (mr.data?.id) crees.push(['MissionRequest', mr.data.id]);
check('membre : demande enregistrée, admins prévenus par e-mail', mr.status === 200 && mr.data?.admins_prevenus >= 1, JSON.stringify(mr.data));
const lue = (await http('GET', `/api/collections/MissionRequest/records/${mr.data?.id}`, su)).data || {};
check('demandeur imposé par le serveur, statut « nouvelle »', lue.user_id === M.id && lue.status === 'nouvelle' && lue.age === 30);
check('membre : liste et lecture refusées (données personnelles)',
  ((await http('GET', '/api/collections/MissionRequest/records', { token: M.token })).data?.items || []).length === 0
  && (await http('GET', `/api/collections/MissionRequest/records/${mr.data?.id}`, { token: M.token })).status === 404);
check('admin : voit la demande et la marque traitée',
  (await http('GET', `/api/collections/MissionRequest/records/${mr.data?.id}`, { token: ADM.token })).status === 200
  && (await http('PATCH', `/api/collections/MissionRequest/records/${mr.data?.id}`, { token: ADM.token, body: { status: 'traitee' } })).data?.status === 'traitee');
const courriel = await waitForMail(creds.admin.email, depuis, 15000, /Se missionner/).catch(() => null);
check('e-mail reçu par l’admin : tous les champs, texte du membre échappé', Boolean(courriel) && /Chorale &lt;b&gt;|Chorale &lt;b>/.test(courriel.text) && /06 12 34 56 78/.test(courriel.text) && /1 rue du Test/.test(courriel.text));
let dernier = null;
for (let i = 0; i < 5; i++) {
  dernier = await fn('createMissionRequest', { token: M.token, body: { ...form, kind: 'evangeliser' } });
  if (dernier.data?.id) crees.push(['MissionRequest', dernier.data.id]);
}
check('limite : 5 demandes par 24 h, la 6e -> 429', dernier.status === 429);

console.log('\n■ (5) Compteur de vues');
const ajout = async (col, body) => garder(col, await http('POST', `/api/collections/${col}/records`, { token: ADM.token, body: { created_by_id: ADM.id, ...body } }));
const yt = await ajout('YouTubeVideo', { title: 'Test E vidéo', youtube_id: 'abcdefghijk', section: 'culte' });
const art = await ajout('Article', { title: 'Test E article', body: 'x' });
const act = await ajout('ChristianNews', { title: 'Test E actualité vues' });
const pisteId = `teste${Date.now().toString(36)}`;
const l1 = await ajout('PlaylistTrack', { playlist_id: 'p1', track_id: pisteId, title: 'Titre', audio_url: 'https://x/a.mp3', listen_count: 4 });
const l2 = await ajout('PlaylistTrack', { playlist_id: 'p2', track_id: pisteId, title: 'Titre', audio_url: 'https://x/a.mp3', listen_count: 1 });
check('contenus de test créés', [yt, art, act, l1, l2].every((r) => r.status === 200), [yt, art, act, l1, l2].map((r) => r.status).join(','));
const vue = (tok, type, id) => fn('compterVue', { token: tok, body: { type, id } });
check('anonyme -> 401 ; type inconnu -> 400 ; contenu absent -> 404',
  (await vue(null, 'youtube', yt.data?.id)).status === 401
  && (await vue(M.token, 'Video', yt.data?.id)).status === 400
  && (await vue(M.token, 'youtube', 'inexistant000')).status === 404);
const v1 = await vue(M.token, 'youtube', yt.data?.id);
const v2 = await vue(M.token, 'youtube', yt.data?.id);
check('YouTube : +1, puis même membre dans les 30 min ignoré', v1.data?.view_count === 1 && v1.data?.compte === true && v2.data?.view_count === 1 && v2.data?.compte === false, JSON.stringify([v1.data, v2.data]));
const v3 = await vue(ADM.token, 'youtube', yt.data?.id);
check('autre membre : +1', v3.data?.view_count === 2);
check('compteur enregistré et lisible par les membres', (await http('GET', `/api/collections/YouTubeVideo/records/${yt.data?.id}`, { token: M.token })).data?.view_count === 2);
check('article et actualité : +1', (await vue(M.token, 'article', art.data?.id)).data?.view_count === 1 && (await vue(M.token, 'actualite', act.data?.id)).data?.view_count === 1);
const vp = await vue(M.token, 'piste', pisteId);
const lu1 = (await http('GET', `/api/collections/PlaylistTrack/records/${l1.data?.id}`, su)).data;
const lu2 = (await http('GET', `/api/collections/PlaylistTrack/records/${l2.data?.id}`, su)).data;
check('titre présent dans 2 playlists : chaque ligne +1, réponse = le plus grand', vp.data?.view_count === 5 && lu1.listen_count === 5 && lu2.listen_count === 2, JSON.stringify(vp.data));
check('journal MediaVue fermé aux membres (lecture et écriture)',
  (await http('GET', '/api/collections/MediaVue/records', { token: M.token })).status >= 400 || ((await http('GET', '/api/collections/MediaVue/records', { token: M.token })).data?.items || []).length === 0);
check('membre : compteur non modifiable à la main', (await http('PATCH', `/api/collections/YouTubeVideo/records/${yt.data?.id}`, { token: M.token, body: { view_count: 999 } })).status >= 400);
const journal = (await http('GET', `/api/collections/MediaVue/records?perPage=50&filter=${q(`user_id = "${M.id}"`)}`, su)).data?.items || [];
for (const j of journal) await http('DELETE', `/api/collections/MediaVue/records/${j.id}`, su);
const journalA = (await http('GET', `/api/collections/MediaVue/records?perPage=50&filter=${q(`user_id = "${ADM.id}"`)}`, su)).data?.items || [];
for (const j of journalA) await http('DELETE', `/api/collections/MediaVue/records/${j.id}`, su);

console.log('\n■ (6) Annonce d’une nouvelle version');
// Copie lancée en NOTIFICATIONS_MODE=test (seuls les comptes de test reçoivent) et ANNONCE_LOT_EMAILS=5 (la tâche
// annonce_version envoie la suite de la file chaque minute) : voir docs/LOT-E.md.
const code = 900000 + Math.floor(Math.random() * 90000);
const corpsV = { version_name: '9.9.9', version_code: code };
check('membre -> 403 ; version invalide -> 400',
  (await fn('annoncerVersion', { token: M.token, body: corpsV })).status === 403
  && (await fn('annoncerVersion', { token: ADM.token, body: { version_name: '1.x', version_code: code } })).status === 400);
const apercu = await fn('annoncerVersion', { token: ADM.token, body: corpsV });
const N = apercu.data?.destinataires;
check('aperçu : N membres, appareils, rien d’envoyé, pas encore annoncée', apercu.status === 200 && N >= 2 && Number.isInteger(apercu.data?.appareils) && apercu.data?.deja === null, JSON.stringify(apercu.data));
check('aperçu seul : aucune annonce enregistrée',
  ((await http('GET', `/api/collections/VersionAnnonce/records?filter=${q(`version_code = ${code}`)}`, su)).data?.items || []).length === 0);
check('confirmation avec un autre N -> 409 et nouveau N',
  await fn('annoncerVersion', { token: ADM.token, body: { ...corpsV, confirmer: true, attendu: N + 1 } }).then((r) => r.status === 409 && r.data?.destinataires === N));
const depuisV = Date.now();
const envoi = await fn('annoncerVersion', { token: ADM.token, body: { ...corpsV, confirmer: true, attendu: N } });
check('envoi confirmé : e-mails (1er lot + file) et push', envoi.status === 200 && envoi.data?.destinataires === N && envoi.data?.emails_restants > 0 && envoi.data?.emails_restants < N, JSON.stringify(envoi.data));
const encore = await fn('annoncerVersion', { token: ADM.token, body: { ...corpsV, confirmer: true, attendu: N } });
const apercu2 = await fn('annoncerVersion', { token: ADM.token, body: corpsV });
check('anti-doublon : seconde annonce de la même version -> 409 ; l’aperçu le signale', encore.status === 409 && apercu2.data?.deja?.version_name === '9.9.9');
const recV = ((await http('GET', `/api/collections/VersionAnnonce/records?filter=${q(`version_code = ${code}`)}`, su)).data?.items || [])[0];
check('annonce enregistrée (lecture admin seulement)', Boolean(recV) && recV.nb_emails === N
  && (await http('GET', `/api/collections/VersionAnnonce/records/${recV?.id}`, { token: M.token })).status === 404
  && (await http('GET', `/api/collections/VersionAnnonce/records/${recV?.id}`, { token: ADM.token })).status === 200);
// E-mail du compte admin de test : dans le 1er lot, ou envoyé par la tâche annonce_version (chaque minute).
const mailV = await waitForMail(creds.admin.email, depuisV, 150000, /9\.9\.9/).catch(() => null);
check('e-mail « Nouvelle version » reçu (lien de téléchargement)', Boolean(mailV) && /telechargements\/chay\.apk/.test(mailV.text));
let finV = null;
for (let i = 0; i < 40 && recV; i++) {
  finV = (await http('GET', `/api/collections/VersionAnnonce/records/${recV.id}`, su)).data;
  if (finV?.statut === 'termine') break;
  await new Promise((ok) => setTimeout(ok, 5000));
}
check(`file d’e-mails vidée par la tâche annonce_version (${N} destinataires, plusieurs lots)`, finV?.statut === 'termine' && Array.isArray(finV?.restants) && finV.restants.length === 0, JSON.stringify({ statut: finV?.statut, reste: finV?.restants?.length }));
if (recV) await http('DELETE', `/api/collections/VersionAnnonce/records/${recV.id}`, su);

for (const [c, id] of crees.reverse()) await http('DELETE', `/api/collections/${c}/records/${id}`, su);
done();
