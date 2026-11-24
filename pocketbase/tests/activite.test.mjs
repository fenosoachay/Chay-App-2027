// Tableau de bord de l'app (1.3.25) : règles du serveur (lib/activite.js) et script de migration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerLib } from './charger-cjs.mjs';
import { COLLECTIONS, LIENS_DEPART, TYPES_EN_PLUS, migrer } from '../scripts/migrer-1-3-25.mjs';

const act = chargerLib('activite.js');

test('ping : secondes plafonnées, sections connues seulement, position arrondie à ~5 km', () => {
  const p = act.lirePing({ secondes: 9999, sections: { accueil: 3, bible: 2, inconnue: 9, admin: 1 }, lat: 48.8566, lon: 2.3522 });
  assert.equal(p.secondes, 120);
  assert.deepEqual(p.sections, { accueil: 3, bible: 2, admin: 1 });
  assert.deepEqual(p.position, { lat: 48.85, lon: 2.35 });
  assert.equal(p.sansPosition, false);
  assert.deepEqual(act.lirePing({ secondes: -4, lat: 'x', lon: 2 }), { secondes: 0, sections: {}, position: null, sansPosition: false });
  assert.deepEqual(act.lirePing(null), { secondes: 0, sections: {}, position: null, sansPosition: false });
  assert.equal(act.lirePing({ lat: 95, lon: 2 }).position, null);
  assert.equal(act.lirePing({ lat: true, lon: 2 }).position, null);
  // Désactivé dans les réglages : jamais de position, effacement demandé.
  assert.deepEqual(act.lirePing({ sansPosition: true, lat: 1, lon: 2, secondes: 30 }), { secondes: 30, sections: {}, position: null, sansPosition: true });
  // 30 pages au plus par envoi
  const beaucoup = act.lirePing({ sections: { accueil: 25, bible: 25 } });
  assert.equal(Object.values(beaucoup.sections).reduce((a, b) => a + b, 0), 30);
  // Antananarivo (hémisphère sud) : arrondi au pas de 0,05
  assert.deepEqual(act.lirePing({ lat: -18.8792, lon: 47.5079 }).position, { lat: -18.9, lon: 47.5 });
});

test('fusion des sections de la journée', () => {
  assert.deepEqual(act.fusionnerSections({ accueil: 2, pirate: 5 }, { accueil: 1, jeux: 4 }), { accueil: 3, jeux: 4 });
  assert.deepEqual(act.fusionnerSections(null, { bible: 1 }), { bible: 1 });
  assert.deepEqual(act.fusionnerSections([1, 2], {}), {});
});

test('bornes : semaine depuis lundi (même à cheval sur deux mois), mois depuis le 1er', () => {
  assert.deepEqual(act.bornes('2026-11-24'), { jour: '2026-11-24', semaine: '2026-11-23', mois: '2026-11-01' });
  assert.deepEqual(act.bornes('2026-11-23'), { jour: '2026-11-23', semaine: '2026-11-23', mois: '2026-11-01' });
  assert.deepEqual(act.bornes('2026-11-22'), { jour: '2026-11-22', semaine: '2026-11-16', mois: '2026-11-01' });
  assert.deepEqual(act.bornes('2026-12-02'), { jour: '2026-12-02', semaine: '2026-11-30', mois: '2026-12-01' });
});

test('statistiques : connectés, nouveaux, part, sections, temps moyen, carte', () => {
  const membres = [
    { id: 'a', cree: '2025-01-01', nom: 'Anja', photo: 'https://x/a.jpg' },
    { id: 'b', cree: '2026-11-24', nom: 'Bako', photo: '' },
    { id: 'c', cree: '2026-11-10', nom: 'Celia', photo: '' },
    { id: 'd', cree: '2026-11-23', nom: 'Dina', photo: '' },
  ];
  const lignes = [
    { user: 'a', jour: '2026-11-24', secondes: 600, sections: { accueil: 3, bible: 1 } },
    { user: 'b', jour: '2026-11-24', secondes: 300, sections: { jeux: 5, admin: 9 } },
    { user: 'a', jour: '2026-11-23', secondes: 300, sections: { accueil: 1 } },
    { user: 'c', jour: '2026-11-05', secondes: 0, sections: { bible: 2 } },
    { user: 'zz', jour: '2026-11-24', secondes: 999, sections: { accueil: 99 } }, // compte supprimé : ignoré
    { user: 'c', jour: '2026-10-31', secondes: 50, sections: { media: 1 } }, // mois précédent
  ];
  const positions = [
    { user: 'a', lat: 48.85, lon: 2.35, maj: '2026-11-24' },
    { user: 'zz', lat: 1, lon: 1 },
    { user: 'b', lat: NaN, lon: 2 },
  ];
  const s = act.statistiques({ membres, lignes, positions, jour: '2026-11-24' });
  assert.equal(s.total, 4);
  assert.deepEqual(s.aujourdhui, { connectes: 2, nouveaux: 1, part: 50 });
  assert.deepEqual(s.semaine, { connectes: 2, nouveaux: 2, part: 50 });
  assert.deepEqual(s.mois, { connectes: 3, nouveaux: 3, part: 75 });
  assert.deepEqual(s.sections.map((x) => [x.id, x.visites]), [['jeux', 5], ['accueil', 4], ['bible', 3]]);
  assert.equal(s.sections[0].nom, 'Jeux');
  assert.equal(s.tempsMoyenSecondes, 400); // (600 + 300 + 300) / 3 journées avec du temps
  assert.deepEqual(s.carte, [{ id: 'a', nom: 'Anja', photo: 'https://x/a.jpg', lat: 48.85, lon: 2.35, maj: '2026-11-24' }]);
  const vide = act.statistiques({ membres: [], lignes: [], positions: [], jour: '2026-11-24' });
  assert.deepEqual(vide.aujourdhui, { connectes: 0, nouveaux: 0, part: 0 });
  assert.equal(vide.tempsMoyenSecondes, 0);
});

function fauxServeur(existantes = []) {
  const cols = new Set([...existantes, 'Paroles', 'FichierAdmin', 'Fichier']);
  const schemas = {
    Paroles: { fields: [{ name: 'title', type: 'text' }] },
    FichierAdmin: { fields: [{ name: 'fichier', type: 'file', mimeTypes: ['image/jpeg', 'audio/mpeg'] }] },
    Fichier: { fields: [{ name: 'fichier', type: 'file', mimeTypes: [] }] },
  };
  const appels = [];
  const fetch = async (u, opts = {}) => {
    const url = new URL(u);
    const corps = opts.body ? JSON.parse(opts.body) : null;
    appels.push([opts.method || 'GET', url.pathname, corps]);
    const m = url.pathname.match(/^\/api\/collections\/([^/]+)$/);
    if ((opts.method || 'GET') === 'GET' && m) return { ok: cols.has(m[1]), status: cols.has(m[1]) ? 200 : 404, json: async () => schemas[m[1]] || {} };
    if (opts.method === 'PATCH' && m) schemas[m[1]] = { ...schemas[m[1]], ...corps };
    if (opts.method === 'POST' && url.pathname === '/api/collections') cols.add(corps.name);
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
  };
  return { fetch, appels, cols, schemas };
}

test('migration 1.3.25 : crée les 4 collections et les 4 liens ; deuxième passage : rien', async () => {
  const f = fauxServeur();
  globalThis.fetch = f.fetch;
  const ch = await migrer('http://pb', {}, { appliquer: true });
  assert.deepEqual(ch, ['ActiviteJour (création)', 'PositionMembre (création)', 'PetiteHistoire (création)', 'LienAccueil (création)', ...LIENS_DEPART.map((l) => `lien ${l.label}`), 'Paroles (musique_id)', 'FichierAdmin (types de fichiers)']);
  assert.ok(f.schemas.Paroles.fields.some((x) => x.name === 'musique_id'));
  const types = f.schemas.FichierAdmin.fields[0].mimeTypes;
  assert.ok(types.includes('image/jpeg') && TYPES_EN_PLUS.every((t) => types.includes(t)));
  const liens = f.appels.filter(([m, p]) => m === 'POST' && p === '/api/collections/LienAccueil/records').map(([, , b]) => b.url);
  assert.ok(liens.every((u) => u.startsWith('https://')));
  assert.deepEqual(await migrer('http://pb', {}, { appliquer: true }), []);
  // Simulation : rien n'est écrit
  const g = fauxServeur();
  globalThis.fetch = g.fetch;
  await migrer('http://pb', {}, { appliquer: false });
  assert.equal(g.appels.filter(([m]) => m !== 'GET').length, 0);
});

test('schéma : statistiques réservées au serveur, histoire visible quand elle est en ligne, liens publics', () => {
  const par = Object.fromEntries(COLLECTIONS.map((c) => [c.name, c]));
  for (const n of ['ActiviteJour', 'PositionMembre']) {
    for (const r of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) assert.equal(par[n][r], null, `${n}.${r}`);
  }
  assert.match(par.ActiviteJour.indexes[0], /UNIQUE INDEX .* \(user, jour\)/);
  assert.match(par.PositionMembre.indexes[0], /UNIQUE INDEX .* \(user\)/);
  assert.equal(par.PetiteHistoire.listRule, 'actif = true || @request.auth.role = "admin"');
  assert.equal(par.PetiteHistoire.createRule, '@request.auth.role = "admin"');
  assert.deepEqual(par.PetiteHistoire.fields.find((f) => f.name === 'type').values, ['video', 'photo', 'texte']);
  assert.equal(par.LienAccueil.listRule, '');
  assert.equal(par.LienAccueil.updateRule, '@request.auth.role = "admin"');
  for (const c of COLLECTIONS) assert.ok(c.fields.some((f) => f.name === 'created' && f.type === 'autodate'), c.name);
});
