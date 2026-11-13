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
const { BASE, http, loadCreds, login, makeChecker, q } = await import('./lib.mjs');

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

for (const [c, id] of crees.reverse()) await http('DELETE', `/api/collections/${c}/records/${id}`, su);
done();
